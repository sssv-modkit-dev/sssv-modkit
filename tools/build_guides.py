"""Render the short user guides with the standard library, sharing Markdown sources."""
import html
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
PAGES = {'docs/README.md': 'guides.html'}
for name in ('GETTING-STARTED', 'MODEL-EDITOR', 'TEXTURES-TILESETS', 'LEVEL-EDITOR', 'DIALOGUE', 'PLAY'):
    PAGES['docs/guides/' + name + '.md'] = 'guides/' + name.lower() + '.html'


def destination(source, target, output):
    """Published short guides stay on-site; advanced references open on GitHub."""
    import posixpath
    parts = urlsplit(target)
    if parts.scheme or parts.netloc:
        if target.startswith('https://sssv-modkit-dev.github.io/sssv-modkit/'):
            return posixpath.relpath(parts.path.removeprefix('/sssv-modkit/'), posixpath.dirname(output) or '.') + ('#' + parts.fragment if parts.fragment else '')
        return target
    resolved = posixpath.normpath(posixpath.join(posixpath.dirname(source), parts.path))
    if resolved in PAGES:
        result = posixpath.relpath(PAGES[resolved], posixpath.dirname(output) or '.')
    elif resolved.startswith('docs/images/guides/'):
        result = posixpath.relpath(resolved.removeprefix('docs/'), posixpath.dirname(output) or '.')
    else:
        result = 'https://github.com/sssv-modkit-dev/sssv-modkit/blob/main/' + resolved
    return result + ('#' + parts.fragment if parts.fragment else '')


def inline(text, source, output):
    def link(m):
        url = html.escape(destination(source, m[3], output), quote=True)
        label = html.escape(m[2])
        return '<img src="%s" alt="%s" loading="lazy">' % (url, label) if m[1] else '<a href="%s">%s</a>' % (url, label)
    tokens = []
    def stash(m):
        tokens.append(link(m))
        return '\x00%d\x00' % (len(tokens) - 1)
    text = re.sub(r'(!?)\[([^\]]+)\]\(([^)]+)\)', stash, text)
    text = html.escape(text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    return re.sub(r'\x00(\d+)\x00', lambda m: tokens[int(m[1])], text)


def render(text, source, output):
    """The user guides use headings, paragraphs, lists, links, images and tables."""
    blocks, listing, table = [], None, False
    for line in text.splitlines() + ['']:
        if not line.strip():
            if listing:
                blocks.append('</%s>' % listing)
                listing = None
            if table:
                blocks.append('</tbody></table></div>')
                table = False
            continue
        heading = re.match(r'^(#{1,6}) (.*)', line)
        if heading:
            level = len(heading[1])
            anchor = re.sub(r'[^a-z0-9 -]', '', heading[2].lower()).replace(' ', '-')
            blocks.append('<h%d id="%s">%s</h%d>' % (level, anchor, inline(heading[2], source, output), level))
        elif line.startswith('|'):
            if re.match(r'^\|[ :|\-]+$', line):
                continue
            cells = line.strip('|').split('|')
            tag = 'td' if table else 'th'
            if not table:
                blocks.append('<div class="table-scroll"><table><tbody>')
                table = True
            blocks.append('<tr>' + ''.join('<%s>%s</%s>' % (tag, inline(c.strip(), source, output), tag) for c in cells) + '</tr>')
        else:
            item = re.match(r'^(?:([0-9]+)\. |(-) )(.*)', line)
            if item:
                if not listing:
                    listing = 'ol' if item[1] else 'ul'
                    blocks.append('<' + listing + '>')
                blocks.append('<li>' + inline(item[3], source, output) + '</li>')
            else:
                blocks.append('<p>' + inline(line, source, output) + '</p>')
    return '\n'.join(blocks)


def build(out):
    out = Path(out)
    for source, output in PAGES.items():
        text = (ROOT / source).read_text(encoding='utf-8')
        prefix = '../' if '/' in output else ''
        nav = ''.join('<a href="%s%s">%s</a>' % (prefix, href, label) for href, label in (
            ('index.html', 'Home'), ('start.html', 'Guided build'), ('guides.html', 'Guides')))
        page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        page += '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\'; style-src \'self\'; base-uri \'none\'">'
        page += '<title>%s · SSSV guides</title><link rel="stylesheet" href="%sguides.css"></head><body><main>' % (html.escape(text.splitlines()[0][2:]), prefix)
        page += '<nav aria-label="Guides">' + nav + '</nav>' + render(text, source, output)
        page += '<footer>Unofficial fan project. Not affiliated with or endorsed by the rights holders.</footer></main></body></html>'
        path = out / output
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(page, encoding='utf-8')
    shutil.copyfile(ROOT / 'src/web/guides.css', out / 'guides.css')
    images = ROOT / 'docs/images/guides'
    if images.exists():
        shutil.copytree(images, out / 'images/guides', dirs_exist_ok=True)


if __name__ == '__main__':
    import sys
    build(sys.argv[1])
