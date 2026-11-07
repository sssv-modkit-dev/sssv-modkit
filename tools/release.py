#!/usr/bin/env python3
"""Prepare a release locally: run every check and the history guard, then build the site for a final look.

python tools/release.py v0.1.0
It changes nothing in git. Tagging and pushing stay manual steps for the owner (see docs/RELEASING.md).
"""
from pathlib import Path
import re, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]


def run(*command):
    print('$ ' + ' '.join(command), flush=True)
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode:
        sys.exit('release stopped: %s failed' % command[1])


def main(argv):
    if len(argv) != 1 or not re.fullmatch(r'v\d+\.\d+\.\d+', argv[0]):
        sys.exit(__doc__)
    if subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT, capture_output=True, text=True).stdout.strip():
        sys.exit('release stopped: commit or discard local changes first')
    run(sys.executable, 'src/check.py')
    run(sys.executable, 'tools/guards.py', '.', '--history')
    run(sys.executable, 'src/build_site.py', '--pack', 'packs/sample', '--out', 'build/site')
    print('\nReady for %s. Preview: python -m http.server --directory build/site 8000' % argv[0])
    print('Then: git tag %s && git push gitlab main %s' % (argv[0], argv[0]))
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
