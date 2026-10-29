#!/usr/bin/env python3
"""Run focused, ROM-free source checks from any directory: python tools/check.py."""
import ast
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    if not shutil.which('node'):
        print('Node.js is required for viewer checks; install it and rerun.', file=sys.stderr)
        return 1
    paths = sorted((ROOT / 'tools').glob('*.py')) + sorted((ROOT / 'tests').glob('*.py'))
    for path in paths:
        ast.parse(path.read_text(encoding='utf-8-sig'), filename=str(path.relative_to(ROOT)))
    print('Python syntax: %d active tool/test files.' % len(paths), flush=True)
    commands = [
        ['node', '--check', 'tools/viewer/js/app.js'],
        ['node', '--check', 'tools/viewer/js/deform.js'],
        ['node', 'tests/test_deform_parity.js'],
        [sys.executable, 'tests/test_live_deform.py'],
        [sys.executable, 'tools/sssv_logic.py', 'examples/logic_example.json', '--seed', '7'],
    ]
    for command in commands:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            print('FAILED: ' + ' '.join(command), file=sys.stderr)
            print(result.stdout + result.stderr, file=sys.stderr)
            return result.returncode
        # Keep successful runs short; retain full diagnostics on failure.
        summary = result.stdout.strip().splitlines()
        print('PASS ' + ' '.join(command[1:]) + (': ' + summary[-1] if summary else ''), flush=True)
    print('All ROM-free checks passed. Browser behavior and game validation are separate.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
