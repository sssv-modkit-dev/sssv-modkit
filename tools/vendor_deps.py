#!/usr/bin/env python3
"""Fetch the third-party browser dependencies (Pyodide, EmulatorJS and its N64 cores) at pinned versions.

Every file is listed in tools/vendor-manifest.json with its source URL and SHA-256; a download that does not match is
rejected. The files (and their license texts) are written under <out>/vendor/ so the public site loads them same-origin.
They are not committed (site/dist/ and build/ are gitignored). Python standard library only.

  python tools/vendor_deps.py --out site/dist            # download (cached in build/vendor-cache) and place
  python tools/vendor_deps.py --out site/dist --offline  # only verify what is already there
  python tools/vendor_deps.py --verify-manifest          # check the manifest itself (licenses present, NOTICE entries)
"""
import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / 'tools' / 'vendor-manifest.json'
NOTICE = ROOT / 'NOTICE.md'
ALLOWED_HOSTS = ('https://cdn.jsdelivr.net/pyodide/', 'https://cdn.emulatorjs.org/4.2.3/', 'https://raw.githubusercontent.com/')


def load_manifest():
    return json.loads(MANIFEST.read_text(encoding='utf-8'))['deps']


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def manifest_problems(deps=None, notice_text=None):
    """Every dependency needs license files (listed with a hash) and a NOTICE.md entry; returns a list of problems."""
    deps = load_manifest() if deps is None else deps
    notice_text = NOTICE.read_text(encoding='utf-8') if notice_text is None else notice_text
    problems, seen = [], set()
    for dep in deps:
        name = dep['id']
        if not dep.get('license_files'):
            problems.append(f'{name}: no license file in the manifest')
        for entry in dep.get('files', []) + dep.get('license_files', []):
            if not entry['url'].startswith(ALLOWED_HOSTS):
                problems.append(f'{name}: unexpected source host for {entry["path"]}')
            if len(entry.get('sha256', '')) != 64:
                problems.append(f'{name}: missing SHA-256 for {entry["path"]}')
            if entry['path'] in seen:
                problems.append(f'{name}: duplicate path {entry["path"]}')
            seen.add(entry['path'])
            if entry['path'].startswith('/') or '..' in entry['path'].split('/'):
                problems.append(f'{name}: unsafe path {entry["path"]}')
        for field in ('name', 'version', 'license', 'source_url'):
            if not dep.get(field):
                problems.append(f'{name}: missing {field}')
        for field in ('version', 'source_url'):
            if dep.get(field) and dep[field] not in notice_text:
                problems.append(f'{name}: NOTICE.md does not list its {field} ({dep[field]})')
        if f'`{name}`' not in notice_text and dep.get('name', '') not in notice_text:
            problems.append(f'{name}: NOTICE.md has no entry')
        for entry in dep.get('license_files', []):
            if f'vendor/{entry["path"]}' not in notice_text:
                problems.append(f'{name}: NOTICE.md does not mention vendor/{entry["path"]}')
    return problems


def verify_tree(vendor_dir, deps=None):
    """Check that every manifest file (including license files) exists under vendor_dir with the right hash."""
    problems = []
    for dep in (load_manifest() if deps is None else deps):
        for entry in dep['files'] + dep['license_files']:
            target = vendor_dir / entry['path']
            if not target.is_file():
                problems.append(f'missing {entry["path"]}')
            elif sha256(target.read_bytes()) != entry['sha256']:
                problems.append(f'hash mismatch {entry["path"]}')
    return problems


def fetch(entry, cache):
    cached = cache / entry['sha256']
    if cached.is_file() and sha256(cached.read_bytes()) == entry['sha256']:
        return cached.read_bytes()
    print('  downloading', entry['url'], flush=True)
    request = urllib.request.Request(entry['url'], headers={'User-Agent': 'sssv-modkit-vendor/1'})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    if sha256(data) != entry['sha256'] or len(data) != entry['size']:
        raise SystemExit(f'SHA-256/size mismatch for {entry["url"]}: refusing to use it')
    cache.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(data)
    return data


def vendor(out_dir, cache=None):
    """Download, verify and place everything under <out_dir>/vendor. Returns total bytes placed."""
    deps = load_manifest()
    problems = manifest_problems(deps)
    if problems:
        raise SystemExit('Vendor manifest problems:\n  ' + '\n  '.join(problems))
    cache = cache or ROOT / 'build' / 'vendor-cache'
    vendor_dir = Path(out_dir) / 'vendor'
    if vendor_dir.exists():
        shutil.rmtree(vendor_dir)
    total = 0
    for dep in deps:
        for entry in dep['files'] + dep['license_files']:
            data = fetch(entry, cache)
            target = vendor_dir / entry['path']
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            total += len(data)
    problems = verify_tree(vendor_dir, deps)
    if problems:
        raise SystemExit('Vendored tree failed verification:\n  ' + '\n  '.join(problems))
    return total


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--out', type=Path, default=ROOT / 'site' / 'dist', help='public build directory (vendor/ is created inside)')
    parser.add_argument('--cache', type=Path, help='download cache (default: build/vendor-cache)')
    parser.add_argument('--offline', action='store_true', help='download nothing; verify an existing vendor/ directory')
    parser.add_argument('--verify-manifest', action='store_true', help='only check the manifest and NOTICE.md')
    args = parser.parse_args(argv)
    problems = manifest_problems()
    if args.verify_manifest:
        print('\n'.join(problems) if problems else 'Vendor manifest OK: every dependency has license files and a NOTICE.md entry.')
        return 1 if problems else 0
    if args.offline:
        problems += verify_tree(args.out / 'vendor')
        print('\n'.join(problems) if problems else f'Vendored tree OK in {args.out / "vendor"}')
        return 1 if problems else 0
    total = vendor(args.out, args.cache)
    print(f'Vendored {total / 1e6:.1f} MB into {args.out / "vendor"}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
