#!/usr/bin/env python3
"""Run every core check from any directory: python src/check.py"""
from pathlib import Path
import shutil, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
COMMANDS = [
    ['node', 'tests/test_scene.js'],
    ['node', 'tests/test_level_selection.js'],
    ['node', 'tests/test_level_palette.js'],
    ['node', 'tests/test_camera.js'],
    ['node', 'tests/test_deform_parity.js'],
    ['node', 'tests/test_parts_lab.js'],
    ['node', 'tests/test_model_source.js'],
    ['node', 'tests/test_model_history.js'],
    ['node', 'tests/test_model_workbench.js'],
    ['node', 'tests/test_sample_pack.js'],
    [sys.executable, 'tests/test_build_site.py'],
    [sys.executable, 'tests/test_guards.py'],
    [sys.executable, 'tests/test_text_encoding.py'],
    [sys.executable, 'tests/test_level_startup.py'],
    [sys.executable, 'tests/test_level_usability.py'],
    [sys.executable, 'tools/guards.py', '.'],
    ['node', 'tests/browser/roundtrip.mjs'],
]


def main():
    if not shutil.which('node'):
        print('Node.js is required; install it and rerun.', file=sys.stderr)
        return 1
    for command in COMMANDS:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
        if result.returncode:
            print('FAILED: ' + ' '.join(command), file=sys.stderr)
            print(result.stdout + result.stderr, file=sys.stderr)
            return result.returncode
        lines = (result.stdout or result.stderr).strip().splitlines()
        print('PASS ' + ' '.join(command[1:]) + (': ' + lines[-1] if lines else ''), flush=True)
    print('All core checks passed.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
