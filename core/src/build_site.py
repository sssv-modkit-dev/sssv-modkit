#!/usr/bin/env python3
"""Build the static site from the core editors plus one pack.

python src/build_site.py --pack <pack dir> --out <site dir> [--no-vendor]

A pack is a folder with pack.json (see docs/FORMAT.md). It supplies the page copy (slots), extra scripts,
files to copy, scenes, optional bundled models and an optional Python build hook. Exit code 2 means the
pack is incomplete; the message names the missing slot or file.
"""
import argparse, base64, hashlib, importlib.util, json, shutil, sys
from pathlib import Path
from urllib.parse import quote
from html import escape

HERE = Path(__file__).resolve().parent
SLOTS = ('model-noscript', 'model-source', 'model-nav', 'level-nav', 'level-noscript', 'level-source', 'level-network', 'level-gallery-open')
LEVEL_SCRIPTS = ('scene.js', 'selection.js', 'palette.js', 'gallery.js', 'loader.js')
FAVICONS = ('favicon.svg', 'favicon-model-editor.svg', 'favicon-level-editor.svg')


class PackError(Exception):
    pass


def js_literal(value):
    return json.dumps(value, separators=(',', ':')).replace('<', r'\u003c')


def load_pack(folder):
    folder = Path(folder)
    if not (folder / 'pack.json').is_file():
        raise PackError('pack %s: missing pack.json' % folder)
    manifest = json.loads((folder / 'pack.json').read_text(encoding='utf-8'))
    pid = manifest.get('id', folder.name)

    def need(rel):
        path = (folder / rel).resolve()
        if not path.exists():
            raise PackError('pack %s: missing %s' % (pid, rel))
        return path

    slots = {}
    for name in SLOTS:
        if name not in manifest.get('slots', {}):
            raise PackError('pack %s: missing slot %s' % (pid, name))
        slots[name] = need(manifest['slots'][name]).read_text(encoding='utf-8')
    files = [(need(f['src']), f['dest'], tuple(f.get('exclude', ()))) for f in manifest.get('files', [])]
    if 'index.html' not in [dest for _, dest, _ in files]:
        raise PackError('pack %s: missing index.html in files' % pid)
    scripts = {page: [need(s) for s in manifest.get('scripts', {}).get(page, [])] for page in ('model-editor', 'level-editor')}
    scenes = [(need(s['src']), s['dest']) for s in manifest.get('scenes', [])]
    demos = manifest.get('model_demos')
    if demos:
        demos = {'models': need(demos['models']), 'poses': need(demos['poses']) if demos.get('poses') else None,
                 'assembled': bool(demos.get('assembled'))}
    hook = need(manifest['build_hook']) if manifest.get('build_hook') else None
    return {'id': pid, 'title': manifest.get('title', pid), 'slots': slots, 'files': files, 'scripts': scripts,
            'scenes': scenes, 'demos': demos, 'hook': hook, 'scene_icons': manifest.get('scene_icons', ''), 'source_url': manifest.get('source_url', '')}


def fill(html, slots, names):
    for name in names:
        marker = '<!--slot:%s-->' % name
        if marker not in html:
            raise PackError('template is missing %s' % marker)
        html = html.replace(marker, slots[name])
    return html


def demo_models_js(demos):
    if not demos:
        return ''
    bundled = json.loads(demos['models'].read_text(encoding='utf-8'))['models']
    js = '\nObject.assign(PARTS_DEMOS,' + js_literal(bundled) + ');\n'
    if demos['assembled']:
        return js  # shown whole like the original demos: no part sheet, no poses
    js += 'for(const n of ' + json.dumps(list(bundled)) + ')BUNDLED_ANIMALS.add(n);\n'
    poses = {}
    if demos['poses']:
        poses = {n: json.loads((demos['poses'] / (n + '.json')).read_text(encoding='utf-8')) for n in bundled if (demos['poses'] / (n + '.json')).is_file()}
    return js + 'Object.assign(BUNDLED_POSES,' + js_literal(poses) + ');\n'


def model_editor(pack):
    base = HERE / 'viewer'
    js = ((base / 'js/demo-models.js').read_text(encoding='utf-8') + demo_models_js(pack['demos']) + '\n'
          + (base / 'js/app.js').read_text(encoding='utf-8').replace('/*TABLE*/null', '{}') + '\n'
          + (base / 'js/parts-lab.js').read_text(encoding='utf-8'))
    for script in pack['scripts']['model-editor']:
        js += '\n' + script.read_text(encoding='utf-8')
    # Same-origin only: scripts come from this one inline block (pinned by hash); styles stay inline.
    script_hash = base64.b64encode(hashlib.sha256(js.encode('utf-8')).digest()).decode('ascii')
    csp = ("default-src 'none'; script-src 'self' 'wasm-unsafe-eval' 'sha256-" + script_hash + "'; style-src 'unsafe-inline'; img-src 'self' data: blob:; "
           "worker-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'")
    html = (base / 'index.template.html').read_text(encoding='utf-8')
    html = html.replace('<title>SSSV Model Editor</title>', '<title>Model Editor (%s)</title><meta http-equiv="Content-Security-Policy" content="%s">' % (pack['title'], csp), 1)
    html = html.replace('<link rel="icon" href="/*VIEWER_ICON*/">', '<link rel="icon" type="image/svg+xml" href="favicon-model-editor.svg">', 1)
    html = html.replace('<body>\n', '<body>\n' + pack['slots']['model-noscript'] + '\n', 1)
    html = html.replace('<!--PUBLIC_NAV-->', pack['slots']['model-nav'])
    html = fill(html, pack['slots'], ('model-source',)).replace('__PACK_TITLE__', escape(pack['title']))
    link = '<a href="%s" target="_blank" rel="noopener">Source &amp; credits &#8599;</a>' % escape(pack['source_url']) if pack['source_url'] else ''
    html = html.replace('<!--SOURCE_LINK-->', link)
    svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#202638"/><text x="32" y="41" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="bold" fill="#edf1fa">SS</text></svg>'
    icon = 'data:image/svg+xml,' + quote(svg, safe='')
    for marker, value in (('/*VIEWER_CSS*/', (base / 'css/app.css').read_text(encoding='utf-8')), ('/*VIEWER_JS*/', js), ('/*VIEWER_ICON*/', icon)):
        if marker not in html:
            raise PackError('template is missing ' + marker)
        html = html.replace(marker, value)
    return html


def level_editor(pack, out):
    html = (HERE / 'web/level-editor.html').read_text(encoding='utf-8').replace('__PACK_TITLE__', pack['title'])
    html = fill(html, pack['slots'], ('level-nav', 'level-noscript', 'level-source', 'level-network', 'level-gallery-open'))
    tags = ''.join('<script src="levels/%s"></script>' % s.name for s in pack['scripts']['level-editor'])
    meta = '<meta name="default-scene" content="%s"><meta name="scene-icons" content="%s">' % (pack['scenes'][0][1] if pack['scenes'] else '', pack['scene_icons'])
    html = html.replace('<!--PACK_SCRIPTS-->', tags, 1).replace('</head>', meta + '</head>', 1)
    (out / 'level-editor.html').write_text(html, encoding='utf-8')
    levels = out / 'levels'
    levels.mkdir(exist_ok=True)
    for name in LEVEL_SCRIPTS + ('levels.css',):
        shutil.copyfile(HERE / 'levels' / name, levels / name)
    runtime = (HERE / 'levels/runtime.js').read_text(encoding='utf-8')
    (levels / 'runtime.js').write_text(runtime.replace('/*EDITOR*/', (HERE / 'levels/editor.js').read_text(encoding='utf-8')), encoding='utf-8')
    for script in pack['scripts']['level-editor']:
        shutil.copyfile(script, levels / script.name)


def copy(src, dest, exclude):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        shutil.copytree(src, dest, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__', *exclude))
    else:
        shutil.copyfile(src, dest)


def build(pack_dir, out, no_vendor=False):
    pack = load_pack(pack_dir)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    for src, dest, exclude in pack['files']:
        copy(src, out / dest, exclude)
    for src, dest in pack['scenes']:
        copy(src, out / dest, ())
    for name in FAVICONS:
        shutil.copyfile(HERE / 'web' / name, out / name)
    (out / 'model-editor.html').write_text(model_editor(pack), encoding='utf-8')
    level_editor(pack, out)
    if pack['hook']:
        spec = importlib.util.spec_from_file_location('pack_build_hook', pack['hook'])
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.run(out, no_vendor)
    return pack


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--pack', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--no-vendor', action='store_true', help='skip the pack hook\'s runtime downloads (offline tests)')
    args = parser.parse_args(argv)
    try:
        pack = build(args.pack, args.out, args.no_vendor)
    except PackError as error:
        print(error, file=sys.stderr)
        return 2
    print('Site (%s pack) -> %s' % (pack['id'], args.out))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
