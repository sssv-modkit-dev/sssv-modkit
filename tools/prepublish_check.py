#!/usr/bin/env python3
"""prepublish_check.py - keep ROM data and ROM-derived files out of the public repo.

  python tools/prepublish_check.py --staged          what is about to be committed (this is what the hook runs)
  python tools/prepublish_check.py --all             every git-tracked file
  python tools/prepublish_check.py --paths A B ...   specific files on disk
  python tools/prepublish_check.py --install-hook    install .git/hooks/pre-commit that runs --staged

Exit code 0 = clean, 1 = something must not be published.  Read-only: it never changes your files.
Optional files next to this script:
  prepublish_allow.txt     one path (forward slashes, repo-relative) per line that is allowed despite a rule
  prepublish_denylist.txt  one word/phrase per line; any text file containing one (case-insensitive) fails.
                           Put third-party franchise names here, locally; none are shipped in this file.
Rules (see docs/PREPUBLISH.md for the why): ROM magic bytes, big files, lab/ dumps/ captures/ states/ paths,
ROM-derived tables (animal_table.json shape), long hex dumps, decomp-style source files, denylist words."""
import sys, os, re, json, subprocess, fnmatch, hashlib

US10_SHA1 = 'e5e09205aa743a9e5043a42df72adc379c746b0b'
HERE = os.path.dirname(os.path.abspath(__file__))
MAX_BYTES = 512 * 1024
ROM_MAGIC = (b'\x80\x37\x12\x40', b'\x37\x80\x40\x12', b'\x40\x12\x37\x80')   # .z64 / .v64 / .n64 byte orders
BAD_EXT = ('.z64', '.n64', '.v64', '.rom', '.sav', '.eep', '.sra', '.fla', '.mpk', '.st0', '.st1', '.pj4', '.zip', '.7z')
BAD_DIRS = ('lab/', 'dumps/', 'captures/', 'states/', 'build/', 'rom/')
ALLOWED_IN_BAD_DIRS = ('rom/README.md',)
SOURCE_EXT = ('.c', '.h', '.s', '.asm')
HEX_RUN = re.compile(r'(?:\b(?:0x)?[0-9A-Fa-f]{2}\b[ ,\t]*){200,}')   # 200+ hex bytes in a row


def run(*cmd):
    return subprocess.run(cmd, capture_output=True, check=True).stdout


def read_list(name):
    p = os.path.join(HERE, name)
    if not os.path.isfile(p): return []
    return [l.strip() for l in open(p, encoding='utf-8') if l.strip() and not l.startswith('#')]


def looks_binary(b): return b'\x00' in b[:8192]


def check(path, data, allow, deny):
    """-> list of problem strings for one file (path uses forward slashes)."""
    if path in allow or path.endswith(('tools/prepublish_denylist.txt', 'tools/prepublish_allow.txt')): return []
    low = path.lower(); out = []
    if low.endswith(BAD_EXT): out.append('file type is never published (ROM / save / state / archive)')
    if any(low.startswith(d) for d in BAD_DIRS) and path not in ALLOWED_IN_BAD_DIRS:
        out.append('lives in a private/ignored folder')
    if low.endswith('.ips') or low.endswith('.bps'): pass                     # patches are fine
    elif data[:4] in ROM_MAGIC: out.append('starts with N64 ROM magic bytes')
    if hashlib.sha1(data).hexdigest() == US10_SHA1: out.append('is the US 1.0 ROM (SHA1 match)')
    if len(data) > MAX_BYTES and not low.endswith(('.png', '.jpg', '.ips')):
        out.append(f'is {len(data) // 1024} KB (limit {MAX_BYTES // 1024} KB); big files are usually dumps')
    if low.endswith(SOURCE_EXT): out.append('looks like decomp/game source (.c/.h/.s are not published here)')
    if looks_binary(data): return out
    text = data.decode('utf-8', 'replace')
    if HEX_RUN.search(text): out.append('contains a long run of hex bytes (a ROM dump?)')
    if low.endswith('.json') and len(data) < 50_000_000:
        try: j = json.loads(text)
        except ValueError: j = None
        if isinstance(j, dict) and any(isinstance(v, dict) and isinstance(v.get('parts'), list) and v['parts'] and isinstance(v['parts'][0], dict) and 'symbol' in v['parts'][0] and 'groups' in v['parts'][0] for v in j.values()):
            out.append('has the shape of animal_table.json (ROM-derived table)')
    for w in deny:
        if re.search(re.escape(w), text, re.I): out.append(f'contains denylisted term "{w}"'); break
    return out


def install_hook():
    root = run('git', 'rev-parse', '--show-toplevel').decode().strip()
    hook = os.path.join(root, '.git', 'hooks', 'pre-commit')
    rel = os.path.relpath(os.path.abspath(__file__), root).replace('\\', '/')
    body = ('#!/bin/sh\n# installed by prepublish_check.py --install-hook\n'
            'PY=$(command -v python || command -v python3 || command -v py)\n'
            f'exec "$PY" "{rel}" --staged\n')
    with open(hook, 'w', newline='\n') as f: f.write(body)
    try: os.chmod(hook, 0o755)
    except OSError: pass
    print(f'hook installed -> {hook}\n(bypass once with: git commit --no-verify; but then run --all before pushing)')


def main():
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help'): print(__doc__); return 0
    if a[0] == '--install-hook': install_hook(); return 0
    allow = set(read_list('prepublish_allow.txt')); deny = read_list('prepublish_denylist.txt')
    items = []   # (path, bytes)
    if a[0] in ('--staged', '--all'):
        names = run('git', 'diff', '--cached', '--name-only', '--diff-filter=ACM', '-z') if a[0] == '--staged' else run('git', 'ls-files', '-z')
        for n in names.decode('utf-8', 'replace').split('\0'):
            if n: items.append((n, run('git', 'show', ':' + n)))
    elif a[0] == '--paths':
        for p in a[1:]: items.append((p.replace('\\', '/'), open(p, 'rb').read()))
    else: print(__doc__); return 2
    bad = 0
    for p, data in items:
        for msg in check(p, data, allow, deny): print(f'BLOCKED  {p}: {msg}'); bad += 1
    print(f'{len(items)} file(s) checked, {bad} problem(s).' + ('  Nothing was committed/published.' if bad else '  Clean.'))
    return 1 if bad else 0


if __name__ == '__main__': sys.exit(main())
