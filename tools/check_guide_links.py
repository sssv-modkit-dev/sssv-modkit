"""Check guide Markdown and built-site links, images and local fragments. No network needed."""
import argparse
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


class Links(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.links, self.ids = [], set()
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.add(attrs['id'])
        for attr in ('href', 'src'):
            if attrs.get(attr):
                self.links.append(attrs[attr])


def anchors(path):
    text = path.read_text(encoding='utf-8')
    if path.suffix == '.html':
        return Links(text).ids
    return {re.sub(r'[^\w -]', '', h.lower()).replace(' ', '-')
            for h in re.findall(r'^#+ (.*)', text, re.M)}


def check(site):
    errors, count = [], 0
    sources = [ROOT / 'README.md'] + sorted((ROOT / 'docs').rglob('*.md'))
    sources += sorted(site.rglob('*.html'))
    for source in sources:
        text = source.read_text(encoding='utf-8')
        if source.suffix == '.html':
            targets = Links(text).links
        else:
            text = re.sub(r'```.*?```', '', text, flags=re.S)
            targets = re.findall(r'!?\[[^\]]*\]\(([^)]+)\)', text)
        for target in targets:
            parts = urlsplit(target)
            if parts.scheme or parts.netloc:
                # GitHub documentation references must exist in this source tree.
                base = 'https://github.com/sssv-modkit-dev/sssv-modkit/blob/main/'
                if target.startswith(base):
                    dest = ROOT / unquote(parts.path.split('/blob/main/', 1)[1])
                elif target.startswith('https://sssv-modkit-dev.github.io/sssv-modkit/'):
                    dest = site / unquote(parts.path.removeprefix('/sssv-modkit/'))
                else:
                    continue
            else:
                dest = source.parent / unquote(parts.path) if parts.path else source
            count += 1
            if not dest.exists():
                errors.append('%s -> %s (missing)' % (source.name, target))
            elif parts.fragment and dest.suffix in ('.md', '.html') and unquote(parts.fragment) not in anchors(dest):
                errors.append('%s -> %s (missing anchor)' % (source.name, target))
    if errors:
        raise SystemExit('\n'.join(errors))
    print('Guide/site links: %d targets and fragments resolve.' % count)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('site', type=Path, nargs='?')
    args = parser.parse_args()
    if args.site:
        check(args.site.resolve())
    else:
        import subprocess
        import sys
        import tempfile
        with tempfile.TemporaryDirectory(prefix='guide-links-') as tmp:
            subprocess.run([sys.executable, str(ROOT / 'core/src/build_site.py'),
                            '--pack', str(ROOT / 'packs/sssv'), '--out', tmp, '--no-vendor'], check=True)
            check(Path(tmp))
