"""Bounded real React -> HTTP route handlers -> synthetic Python WebRTC test.

Uses existing dependencies only. No camera, user account or external endpoints.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

DASHBOARD=Path(__file__).resolve().parents[1]

def main():
    node=os.environ.get('NODE_BINARY') or shutil.which('node')
    floor=Path(os.environ.get('FLOOR_CHECKOUT',str(DASHBOARD.parent/'floor-presence')))
    native=floor/'experiments/native-webrtc'
    if not node or not os.environ.get('PLAYWRIGHT_BROWSERS_PATH'):
        raise RuntimeError('Set NODE_BINARY and PLAYWRIGHT_BROWSERS_PATH to existing runtimes')
    if not (native/'run_server.py').is_file():raise RuntimeError('Missing isolated native fixture')
    with tempfile.TemporaryDirectory(prefix='native-dashboard-') as directory:
        ready=Path(directory)/'ready.json'
        with (Path(directory)/'native.log').open('wb') as log:
            server=subprocess.Popen(['/usr/bin/sandbox-exec','-f',str(native/'loopback-child.sb'),sys.executable,str(native/'run_server.py'),'--ready-file',str(ready),'--ttl','8','--idle','10','--lifetime','180'],cwd=native,stdout=log,stderr=log)
            try:
                deadline=time.monotonic()+15
                while not ready.exists():
                    if server.poll() is not None:raise RuntimeError('native_fixture_start_failed')
                    if time.monotonic()>deadline:raise RuntimeError('native_fixture_ready_timeout')
                    time.sleep(.1)
                url=json.loads(ready.read_text())['url']
                env={**os.environ,'DASHBOARD_CHECKOUT':str(DASHBOARD),'NATIVE_FIXTURE_ROOT':str(native),'MEDIA_TEST_URL':url}
                runner=subprocess.Popen([node,str(DASHBOARD/'scripts/test-native-dashboard.mjs')],cwd=DASHBOARD,env=env)
                try:return runner.wait(timeout=140)
                except subprocess.TimeoutExpired:
                    runner.terminate()
                    try:runner.wait(timeout=8)
                    except subprocess.TimeoutExpired:runner.kill();runner.wait(timeout=3)
                    raise RuntimeError('bounded_browser_test_timeout')
            finally:
                if server.poll() is None:server.terminate()
                try:server.wait(timeout=8)
                except subprocess.TimeoutExpired:server.kill();server.wait(timeout=3)
                print(json.dumps({'owned_native_server_stopped':server.poll() is not None}))

if __name__=='__main__':raise SystemExit(main())
