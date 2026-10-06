"""Isolated TLS wrapper around the real, default-off HB status-only installer.

No household main, credentials discovery, camera, model, media, or trust-store edit.
"""
import argparse
import asyncio
import json
from pathlib import Path
import socket
import sys
import time

async def main():
    parser = argparse.ArgumentParser()
    for name in ('hb-checkout', 'db', 'cert', 'key', 'ready-file', 'stats-file', 'stop-file'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--enabled', action='store_true')
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--lifetime', type=int, default=120)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535 or not 1 <= args.lifetime <= 180:
        raise SystemExit('invalid_fixture_arguments')
    sys.path.insert(0, str(Path(args.hb_checkout).resolve()))
    from fastapi import FastAPI
    import uvicorn
    from vision_pilot import install_status_pilot
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    authority = install_status_pilot(app, environ={
        'VISION_STATUS_PILOT_ENABLED': '1' if args.enabled else '0',
        'VISION_STATUS_REGISTRY_DB': args.db,
        'VISION_STATUS_SINGLE_AUTHORITY_ACK': '1',
        'VISION_STATUS_TLS_PROXY_ACK': '1',
        'WEB_CONCURRENCY': '1',
    })
    stats = {'http': 0, 'websocket': 0}
    stats_path = Path(args.stats_file)
    stats_path.write_text(json.dumps(stats))
    async def counted(scope, receive, send):
        if scope['type'] in stats:
            stats[scope['type']] += 1
            stats_path.write_text(json.dumps(stats))
        await app(scope, receive, send)
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(('127.0.0.1', args.port))
    listener.listen(16)
    config = uvicorn.Config(counted, host='127.0.0.1', port=listener.getsockname()[1],
        ssl_certfile=args.cert, ssl_keyfile=args.key, access_log=False,
        log_config=None, log_level='critical', ws='websockets-sansio',
        ws_max_size=32768, timeout_graceful_shutdown=3)
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve(sockets=[listener]))
    try:
        deadline = time.monotonic() + 5
        while not server.started:
            if task.done() or time.monotonic() >= deadline:
                raise RuntimeError('tls_fixture_start_failed')
            await asyncio.sleep(.02)
        Path(args.ready_file).write_text(json.dumps({'port': listener.getsockname()[1], 'enabled': authority is not None}))
        deadline = time.monotonic() + args.lifetime
        while not task.done() and time.monotonic() < deadline and not Path(args.stop_file).exists():
            await asyncio.sleep(.05)
    finally:
        server.should_exit = True
        try:
            await asyncio.wait_for(task, 6)
        except asyncio.TimeoutError:
            server.force_exit = True
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if authority:
            authority.close()
        listener.close()

if __name__ == '__main__':
    asyncio.run(main())
