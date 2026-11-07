#!/usr/bin/env python3
"""Copy a tagged release of the public SSSV Editor core into core/ and record it in core.lock.

python tools/sync_core.py --from <core repo> --tag <tag>
The pack depends on the core; the core never depends on the pack. core/ is never edited by hand: the command
refuses to run if any file in core/ differs from what core.lock recorded, so local edits cannot be lost.
"""
import argparse, hashlib, io, json, shutil, subprocess, sys, tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE, LOCK = ROOT / 'core', ROOT / 'core.lock'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local_edits():
    if not CORE.exists():
        return []
    if not LOCK.is_file():
        return [p.relative_to(CORE).as_posix() for p in CORE.rglob('*') if p.is_file()] if CORE.exists() else []
    recorded = json.loads(LOCK.read_text(encoding='utf-8'))['files']
    present = {p.relative_to(CORE).as_posix() for p in CORE.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    changed = [n for n, h in recorded.items() if n not in present or digest(CORE / n) != h]
    return sorted(changed + sorted(present - set(recorded)))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--from', dest='source', required=True, type=Path, help='path to the sssv-editor repository')
    ap.add_argument('--tag', required=True)
    args = ap.parse_args(argv)
    edits = local_edits()
    if edits:
        print('core/ has local edits; refusing to overwrite:\n  ' + '\n  '.join(edits[:20]), file=sys.stderr)
        return 2
    git = lambda *a: subprocess.run(['git', '-C', str(args.source), *a], capture_output=True, check=True).stdout
    commit = git('rev-parse', args.tag + '^{commit}').decode().strip()
    archive = git('archive', '--format=tar', args.tag)
    if CORE.exists():
        shutil.rmtree(CORE)
    CORE.mkdir()
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        tar.extractall(CORE, filter='data')
    files = {p.relative_to(CORE).as_posix(): digest(p) for p in sorted(CORE.rglob('*')) if p.is_file()}
    LOCK.write_text(json.dumps({'tag': args.tag, 'commit': commit, 'files': files}, indent=1) + '\n', encoding='utf-8')
    print('core/ <- %s (%s), %d files' % (args.tag, commit[:10], len(files)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
