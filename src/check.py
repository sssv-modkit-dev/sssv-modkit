#!/usr/bin/env python3
"""Run focused, ROM-free source checks from any directory: python src/check.py."""
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
    paths = sorted((ROOT / 'src').glob('*.py')) + sorted((ROOT / 'tests').glob('*.py'))
    for path in paths:
        ast.parse(path.read_text(encoding='utf-8-sig'), filename=str(path.relative_to(ROOT)))
    print('Python syntax: %d active tool/test files.' % len(paths), flush=True)
    commands = [
        [sys.executable, 'tests/test_levels.py'],
        ['node', 'tests/test_level_selection.js'],
        ['node', 'tests/test_level_palette.js'],
        ['node', 'tests/test_scene.js'],
        ['node', 'tests/test_scene_edits.js'],
        ['node', '--check', 'src/web/play.js'],
        ['node', 'tests/test_web_play.js'],
        ['node', '--check', 'src/web/play-build.js'],
        ['node', '--check', 'src/web/handoff.js'],
        ['node', 'tests/test_play_build.js'],
        ['node', '--check', 'src/web/builder.js'],
        ['node', '--check', 'src/web/builder-worker.js'],
        ['node', '--check', 'src/web/builder-core.js'],
        ['node', 'tests/test_pyodide_build.js'],
        ['node', '--check', 'src/release_banner.js'],
        ['node', 'tests/test_release_banner.js'],
        [sys.executable, 'tests/test_release_banner.py'],
        ['node', '--check', 'src/viewer/js/app.js'],
        ['node', '--check', 'src/viewer/js/deform.js'],
        ['node', '--check', 'src/viewer/js/parts-lab.js'],
        ['node', '--check', 'src/build_demo_assets.js'],
        ['node', 'tests/test_parts_lab.js'],
        ['node', 'tests/test_model_source.js'],
        ['node', '--check', 'src/viewer/js/model-source-rom.js'],
        [sys.executable, 'tests/test_builder.py'],
        [sys.executable, 'tests/make_build_fixtures.py'],
        [sys.executable, 'tests/test_demo_bundle.py'],
        [sys.executable, 'tests/test_public_build.py'],
        [sys.executable, 'tests/test_build_site.py'],
        ['node', '--check', 'src/levels/level-source-rom.js'],
        [sys.executable, 'tests/test_vendor_manifest.py'],
        [sys.executable, 'tests/test_text_encoding.py'],
        [sys.executable, 'tests/test_level_startup.py'],
        ['node', 'tests/test_camera.js'],
        ['node', 'tests/test_deform_parity.js'],
        [sys.executable, 'tests/test_live_deform.py'],
        [sys.executable, 'src/sssv_logic.py', 'examples/logic_example.json', '--seed', '7'],
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
