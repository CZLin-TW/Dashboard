"""Simulated health payload over real verified WSS. Never contacts native HTTP."""
import argparse
import asyncio
import json
from pathlib import Path
import signal
import ssl
import sys

async def main():
    parser = argparse.ArgumentParser()
    for name in ('floor-checkout','credential-file','fixture-ca','health-file'):
        parser.add_argument('--'+name,required=True)
    parser.add_argument('--fixture-port',required=True,type=int)
    parser.add_argument('--lifetime',type=int,default=120)
    args=parser.parse_args()
    sys.path.insert(0,str(Path(args.floor_checkout).resolve()))
    from vision.status_pilot import FileCredentialProvider,StatusPilot
    class SimulatedHealth:
        async def execute(self,action,payload):
            if action!='status.get' or payload!={}: raise ValueError('status_only_fixture')
            return json.loads(Path(args.health_file).read_text())
    context=ssl.create_default_context(cafile=args.fixture_ca)
    pilot=StatusPilot.loopback_fixture(FileCredentialProvider(args.credential_file),args.fixture_port,context)
    stop=asyncio.Event();loop=asyncio.get_running_loop()
    for sig in (signal.SIGINT,signal.SIGTERM):loop.add_signal_handler(sig,stop.set)
    timer=loop.call_later(min(120,max(1,args.lifetime)),stop.set)
    try:
        result=await pilot.run_once(adapter=SimulatedHealth(),ready=lambda:print(json.dumps({'ready':True,'source':'simulated-health'}),flush=True),stop_event=stop)
        print(json.dumps({'code':result.code}),flush=True)
    finally:timer.cancel()

if __name__=='__main__':asyncio.run(main())
