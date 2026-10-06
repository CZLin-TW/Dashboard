"""Bounded synthetic Next -> HB -> outbound mini -> native WebRTC integration.

Uses existing runtimes. No account, camera, broker, external network or installs.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def main():
    node = os.environ.get('NODE_BINARY') or shutil.which('node')
    if not node or not os.environ.get('PLAYWRIGHT_BROWSERS_PATH'):
        raise RuntimeError('Set existing NODE_BINARY and PLAYWRIGHT_BROWSERS_PATH')
    env = {**os.environ, 'PYTHON_BINARY': sys.executable}
    child = subprocess.Popen([node, str(ROOT / 'scripts/test-native-hub.mjs')], cwd=ROOT, env=env)
    try:
        return child.wait(timeout=150)
    except subprocess.TimeoutExpired:
        child.terminate()
        try:
            child.wait(timeout=12)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait(timeout=3)
        raise RuntimeError('bounded_three_service_test_timeout')

if __name__ == '__main__':
    raise SystemExit(main())
