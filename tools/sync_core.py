#!/usr/bin/env python3
"""Copy a tagged release of the public SSSV Editor core into core/ and record it in core.lock.

python tools/sync_core.py --from <core repo> --tag <tag>
The pack depends on the core; the core never depends on the pack. core/ is never edited by hand: the command
refuses to run if any file in core/ differs from what core.lock recorded, so local edits cannot be lost.
"""
import argparse, hashlib, io, json, shutil, subprocess, sys, tarfile, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE, LOCK = ROOT / 'core', ROOT / 'core.lock'


def digest(path):
    """SHA-256 with CRLF folded to LF in text files, so the lock holds on any checkout
    (Windows core.autocrlf=true or Linux/CI LF)."""
    data = path.read_bytes()
    if b'\0' not in data:
        data = data.replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()


def local_edits():
    if not CORE.exists():
        return []
    if not LOCK.is_file():
        return [p.relative_to(CORE).as_posix() for p in CORE.rglob('*') if p.is_file()]
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
    git = lambda *a: subprocess.run(['git', '-c', 'safe.directory=' + args.source.resolve().as_posix(), '-C', str(args.source), *a], capture_output=True, check=True).stdout
    commit = git('rev-parse', args.tag + '^{commit}').decode().strip()
    archive = git('-c', 'core.autocrlf=false', 'archive', '--format=tar', args.tag)
    # Replace only managed files, never recursively delete the vendored tree.
    # Retired files are preserved outside core/ for recovery.
    with tempfile.TemporaryDirectory(prefix='editor-core-') as tmp:
        staged = Path(tmp)
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            tar.extractall(staged, filter='data')
        incoming = {p.relative_to(staged).as_posix() for p in staged.rglob('*') if p.is_file()}
        previous = json.loads(LOCK.read_text(encoding='utf-8'))['files'] if LOCK.exists() else {}
        for name in sorted(set(previous) - incoming):
            retired = ROOT / '_attic' / 'core-sync' / commit[:12] / name
            retired.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(CORE / name), str(retired))
        CORE.mkdir(exist_ok=True)
        for name in sorted(incoming):
            target = CORE / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(staged / name, target)
    files = {name: digest(CORE / name) for name in sorted(incoming)}
    LOCK.write_text(json.dumps({'tag': args.tag, 'commit': commit, 'files': files}, indent=1) + '\n', encoding='utf-8')
    print('core/ <- %s (%s), %d files' % (args.tag, commit[:10], len(files)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
