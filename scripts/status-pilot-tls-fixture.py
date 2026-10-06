"""Loopback TLS fixture using HB's real Sheets-backed auth with fake local rows only."""
import argparse
import asyncio
import hmac
import json
from pathlib import Path
import socket
import sys
import time

async def main():
    parser = argparse.ArgumentParser()
    for name in ('hb-checkout', 'snapshot-file', 'control-file', 'family-key-file', 'cert', 'key', 'ready-file', 'stats-file', 'stop-file'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--enabled', action='store_true')
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--lifetime', type=int, default=120)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535 or not 1 <= args.lifetime <= 180:
        raise SystemExit('invalid_fixture_arguments')
    sys.path.insert(0, str(Path(args.hb_checkout).resolve()))
    from fastapi import FastAPI, HTTPException
    import uvicorn
    from vision_sheets_api import create_sheets_app
    stats = {'http': 0, 'websocket': 0, 'reader_calls': 0, 'refresh_revision': 0, 'command_waiting': False}
    stats_path = Path(args.stats_file)
    control_path = Path(args.control_file)
    def control():
        return json.loads(control_path.read_text())
    def save_stats():
        stats_path.write_text(json.dumps(stats))
    key = Path(args.family_key_file).read_text()
    def verifier(value):
        if not isinstance(value, str) or not hmac.compare_digest(value, key):
            raise HTTPException(401)
    async def reader():
        stats['reader_calls'] += 1
        save_stats()
        if control().get('fail'):
            raise RuntimeError('synthetic_reader_unavailable')
        return json.loads(Path(args.snapshot_file).read_text())
    app = create_sheets_app(reader, verifier) if args.enabled else FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    save_stats()
    async def counted(scope, receive, send):
        if scope['type'] in ('http', 'websocket'):
            stats[scope['type']] += 1
            save_stats()
        async def delayed(message):
            if scope.get('path') == '/api/vision/v1/command' and message['type'] == 'http.response.start' and control().get('hold'):
                stats['command_waiting'] = True
                save_stats()
                deadline = time.monotonic() + 3
                while control().get('hold') and time.monotonic() < deadline:
                    await asyncio.sleep(.02)
                stats['command_waiting'] = False
                save_stats()
            await send(message)
        await app(scope, receive, delayed)
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
        Path(args.ready_file).write_text(json.dumps({'port': listener.getsockname()[1], 'enabled': args.enabled}))
        deadline = time.monotonic() + args.lifetime
        while not task.done() and time.monotonic() < deadline and not Path(args.stop_file).exists():
            requested = control().get('revision', 0)
            if args.enabled and requested != stats['refresh_revision']:
                try:
                    await app.state.vision_snapshot.refresh(force=True)
                except Exception:
                    pass  # Expected synthetic fail-closed case; never log auth content.
                stats['refresh_revision'] = requested
                save_stats()
            await asyncio.sleep(.05)
    finally:
        server.should_exit = True
        try:
            await asyncio.wait_for(task, 6)
        except asyncio.TimeoutError:
            server.force_exit = True
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        listener.close()

if __name__ == '__main__':
    asyncio.run(main())
