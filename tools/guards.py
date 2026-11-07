#!/usr/bin/env python3
"""Publication guards for the public core: banned words by zone, third-party licences, binary files and (optionally) history.

python tools/guards.py <repo root> [--history]
Prints path:line: word for each hit and exits 1 if anything is found. Word lists: tools/banned-words.txt.
"""
from pathlib import Path
import re, subprocess, sys

EXEMPT = {'THIRD_PARTY.md', 'LICENSE', 'tools/banned-words.txt'}
BINARY_DIRS = ('packs/sample/assets/', 'docs/img/')
MAX_BYTES = 2 * 1024 * 1024


def load_lists(root):
    lists, section = {'everywhere': [], 'code': [], 'explainer-limits': {}}, None
    for line in (root / 'tools/banned-words.txt').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line.startswith('['):
            section = line.strip('[]')
        elif section == 'explainer-limits':
            word, limit = line.split('=')
            lists[section][word.strip().lower()] = int(limit)
        else:
            lists[section].append(line.lower())
    return lists


def pattern(words):
    parts = [re.escape(w[:-1]) + r'\w*' if w.endswith('*') else re.escape(w) for w in words]
    return re.compile(r'\b(' + '|'.join(parts) + r')\b', re.I)


def explainer(path):
    return path == 'README.md' or path.startswith('docs/')


def files(root):
    try:
        out = subprocess.run(['git', '-C', str(root), 'ls-files', '-z'], capture_output=True, check=True).stdout
        names = [n for n in out.decode('utf-8').split('\0') if n]
        if names:
            return names
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return [p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and '.git' not in p.relative_to(root).parts]


def is_binary(data):
    return b'\0' in data[:8192]


class Report:
    def __init__(self):
        self.hits = []

    def add(self, where, what):
        self.hits.append('%s: %s' % (where, what))


def check_text(path, lines, lists, report, counts):
    """lines: iterable of (line number or label, text)."""
    if path in EXEMPT:
        return
    zone = [lists['everywhere']] + ([] if explainer(path) else [lists['code']])
    rx = pattern([w for words in zone for w in words])
    limited = pattern(list(lists['explainer-limits'])) if explainer(path) and lists['explainer-limits'] else None
    for number, text in lines:
        for m in rx.finditer(text):
            report.add('%s:%s' % (path, number), m.group(0))
        if limited:
            for m in limited.finditer(text):
                counts.setdefault(m.group(0).lower(), []).append('%s:%s' % (path, number))


def check_tree(root, lists, report):
    counts = {}
    names = files(root)
    for name in names:
        data = (root / name).read_bytes()
        if len(data) > MAX_BYTES:
            report.add(name, 'larger than 2 MB')
        if is_binary(data):
            if not name.startswith(BINARY_DIRS):
                report.add(name, 'binary file outside ' + ', '.join(BINARY_DIRS))
            continue
        check_text(name, enumerate(data.decode('utf-8', 'replace').splitlines(), 1), lists, report, counts)
    for word, places in counts.items():
        if len(places) > lists['explainer-limits'].get(word, 0):
            report.add(places[-1], '%s appears %d times in README/docs (limit %d)' % (word, len(places), lists['explainer-limits'][word]))
    third = (root / 'THIRD_PARTY.md').read_text(encoding='utf-8') if (root / 'THIRD_PARTY.md').is_file() else ''
    for number, line in enumerate(third.splitlines(), 1):
        if 'GPL' in line:
            report.add('THIRD_PARTY.md:%d' % number, 'GPL content is not allowed in the core')
    for name in names:
        if re.match(r'packs/[^/]+/assets/|vendor/', name) and name not in third:
            report.add(name, 'not listed in THIRD_PARTY.md')


def check_history(root, lists, report):
    log = subprocess.run(['git', '-C', str(root), 'log', '--all', '-p', '--no-color', '--format=commit %h'], capture_output=True, check=True)
    commit = path = None
    lines = []

    def flush():
        if path and lines:
            check_text(path, lines, lists, report, {})

    for raw in log.stdout.decode('utf-8', 'replace').splitlines():
        if raw.startswith('commit '):
            flush(); commit, path, lines = raw[7:], None, []
        elif raw.startswith('diff --git '):
            flush(); path, lines = raw.split(' b/', 1)[-1], []
        elif raw.startswith('Binary files ') and path and not path.startswith(BINARY_DIRS):
            report.add('%s (commit %s)' % (path, commit), 'binary file outside ' + ', '.join(BINARY_DIRS))
        elif raw.startswith('+') and not raw.startswith('+++'):
            lines.append(('commit ' + commit, raw[1:]))
    flush()


def main(argv):
    if not argv or argv[0].startswith('-'):
        print(__doc__, file=sys.stderr)
        return 2
    root = Path(argv[0]).resolve()
    lists, report = load_lists(root), Report()
    check_tree(root, lists, report)
    if '--history' in argv:
        check_history(root, lists, report)
    for hit in report.hits:
        print(hit)
    print('guards: %d problem(s)' % len(report.hits) if report.hits else 'guards: clean', file=sys.stderr)
    return 1 if report.hits else 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
