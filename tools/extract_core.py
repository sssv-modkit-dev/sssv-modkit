#!/usr/bin/env python3
"""Copy the core files listed in tools/core-manifest.txt into a target folder (the public sssv-editor repo).

python tools/extract_core.py <target dir>
Refuses a target that already has files other than .git, so it never overwrites work in the core repo.
"""
from pathlib import Path
import shutil, sys

ROOT = Path(__file__).resolve().parents[1]


def main(argv):
    if len(argv) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    target = Path(argv[0])
    if target.exists() and any(p.name != '.git' for p in target.iterdir()):
        print('target is not empty: %s' % target, file=sys.stderr)
        return 2
    count = 0
    for line in (ROOT / 'tools/core-manifest.txt').read_text(encoding='utf-8').splitlines():
        rel = line.strip()
        if not rel or rel.startswith('#'):
            continue
        src, dest = ROOT / rel, target / rel
        if not src.exists():
            print('missing: %s' % rel, file=sys.stderr)
            return 2
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dest, ignore=shutil.ignore_patterns('__pycache__'))
            count += sum(1 for p in dest.rglob('*') if p.is_file())
        else:
            shutil.copyfile(src, dest)
            count += 1
    print('Copied %d files -> %s' % (count, target))
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
