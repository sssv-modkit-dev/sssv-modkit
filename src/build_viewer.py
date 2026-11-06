#!/usr/bin/env python3
"""Build a portable single-file viewer from modular sources and the ROM-derived table."""
import argparse,base64,hashlib,json,re,shutil,subprocess,sys
from urllib.parse import quote
from pathlib import Path
here=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('table',nargs='?',type=Path,help='animal table JSON (default: search locally)')
parser.add_argument('output',nargs='?',type=Path,help='output HTML (default: viewers/parts_viewer.html; public: site/dist/model_editor.html)')
parser.add_argument('--animals-dir',type=Path,help='generate the table first from external animal C source files; requires a local ROM')
parser.add_argument('--public',action='store_true',help='Build original demos only; never read a ROM or animal table')
parser.add_argument('--out',type=Path,help='Override output HTML path')
parser.add_argument('--labels',type=Path,help='Embed a private sssv-viewer-labels-v1 part-name file (never used in public builds)')
args=parser.parse_args()
if args.public and (args.table or args.animals_dir or args.labels): parser.error('--public rejects private table/source/label inputs; use --out for output')
out=args.out or args.output or here.parent/('site/dist/model_editor.html' if args.public else 'viewers/parts_viewer.html')
if args.public:
    t={}
else:
    if args.animals_dir:
        if not args.animals_dir.is_dir(): parser.error('animals directory not found: '+str(args.animals_dir))
        src=args.table or here/'animal_table.json'
        if src.suffix!='.json': parser.error('generated table path must end in .json')
        src.parent.mkdir(parents=True,exist_ok=True)
        result=subprocess.run([sys.executable,str(here/'animal_table.py'),str(args.animals_dir),str(src.with_suffix(''))])
        if result.returncode: raise SystemExit(result.returncode)
    else:
        src=args.table or next((p for p in [Path('animal_table.json'),Path('notes/animal_table.json'),here/'animal_table.json'] if p.is_file()),None)
    if src is None: parser.error('animal_table.json not found; pass its path or use --animals-dir')
    if not src.is_file(): parser.error('animal table not found: '+str(src))
    t=json.loads(src.read_text(encoding='utf-8'))
T={}
for a,d in t.items():
    ps=[]
    tex=sorted({img for fn in d.get('draw_funcs',[]) for e in fn.get('events',[]) if e.get('t')=='tex' for img in e.get('imgs',[])})
    for p in d['parts']:
        if not p['ended'] or p['seg']==1:continue
        j=p['joint_calls'][0].split(' | ')[0] if p['joint_calls'] else '?'
        ps.append({'s':p['symbol'],'r':p['rom'],'j':re.sub(r'(?<=[0-9A-Fa-f])U\b','',j).replace(' ','-'),'v':p.get('sections',[]),'t':tex})
    if ps:T[a]={'b':d['seg_bases'],'p':ps,'s':d.get('sections',[])}
if args.labels:
    labels=json.loads(args.labels.read_text(encoding='utf-8-sig'))
    if not isinstance(labels,dict) or labels.get('format')!='sssv-viewer-labels-v1' or not isinstance(labels.get('partNames'),dict):
        parser.error('labels must use sssv-viewer-labels-v1 with a partNames object')
    if labels.get('table_sha256') and labels['table_sha256']!=hashlib.sha256(src.read_bytes()).hexdigest():
        parser.error('labels were reviewed against a different animal table')
    for animal,names in labels['partNames'].items():
        if animal not in T or not isinstance(names,dict): parser.error('unknown animal or invalid names in labels: '+animal)
        parts={p['s']:p for p in T[animal]['p']}
        for symbol,label in names.items():
            if symbol not in parts or not isinstance(label,str) or not label.strip() or len(label)>120:
                parser.error('unknown part or invalid label: '+animal+' / '+symbol)
            parts[symbol]['n']=label
base=here/'viewer'
html=(base/'index.template.html').read_text(encoding='utf-8')
css=(base/'css'/'app.css').read_text(encoding='utf-8')
demo_animals=''
if args.public:
    # Real animals bundled for the public demo (no ROM read): appended after the three original creatures.
    bundled=json.loads((here/'web/demo/animals.json').read_text(encoding='utf-8'))['models']
    demo_animals='\nObject.assign(PARTS_DEMOS,'+json.dumps(bundled,separators=(',',':')).replace('<',r'\u003c')+');\nfor(const n of '+json.dumps(list(bundled))+')BUNDLED_ANIMALS.add(n);\n'
    # Their assembly poses (part transforms captured from the running game), keyed by animal name.
    poses={n:json.loads((here/'web/demo/poses'/(n+'.json')).read_text(encoding='utf-8')) for n in bundled if (here/'web/demo/poses'/(n+'.json')).is_file()}
    demo_animals+='Object.assign(BUNDLED_POSES,'+json.dumps(poses,separators=(',',':')).replace('<',r'\u003c')+');\n'
# Public builds also embed handoff.js so Build & Play can pass the config to play.html, which ships beside it.
handoff=(here/'web/handoff.js').read_text(encoding='utf-8')+'\n' if args.public else ''
js=handoff+(base/'js'/'demo-models.js').read_text(encoding='utf-8')+demo_animals+'\n'+(base/'js'/'app.js').read_text(encoding='utf-8').replace('/*TABLE*/null',json.dumps(T,separators=(',',':')).replace('<',r'\u003c'))+'\n'+(base/'js'/'parts-lab.js').read_text(encoding='utf-8')
icon_path=next((base/'assets'/name for name in ('icon.png','icon.ico') if (base/'assets'/name).is_file()),None)
if icon_path and not args.public:
    mime='image/png' if icon_path.suffix=='.png' else 'image/x-icon'
    icon='data:'+mime+';base64,'+base64.b64encode(icon_path.read_bytes()).decode('ascii')
else:
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#202638"/><text x="32" y="41" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="bold" fill="#edf1fa">SS</text></svg>'
    icon='data:image/svg+xml,'+quote(svg,safe='')
for marker,value in [('/*VIEWER_CSS*/',css),('/*VIEWER_JS*/',js),('/*VIEWER_ICON*/',icon)]:
    if marker not in html:raise SystemExit('missing template marker '+marker)
    html=html.replace(marker,value)
html=html.replace('<!--PUBLIC_NAV-->', '<nav class="panel" aria-label="Modkit"><a href="index.html">Home</a> Â· <a href="model_editor.html" aria-current="page">Model Editor</a> Â· <a href="level-editor.html">Level Editor</a> Â· <a href="play.html">Play your ROM</a></nav>' if args.public else '')
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(html,encoding='utf-8')
print(('Public Model Editor: 8 demo models (bundled), no ROM read' if args.public else f'{len(T)} animals, {sum(len(v["p"]) for v in T.values())} parts')+f' -> {out}')

if args.public:
    (out.parent/'parts_lab.html').write_bytes((here/'web/model-editor-redirect.html').read_bytes())
    (out.parent/'index.html').write_bytes((here/'web/index.html').read_bytes())
    for name in ('play.html', 'play.js', 'play-build.js', 'handoff.js', 'builder.js', 'builder-worker.js', 'builder-core.js'):
        (out.parent/name).write_bytes((here/'web'/name).read_bytes())
    # Pyodide builder: the worker loads these repo sources from py/ (list kept in builder-core.js).
    core=(here/'web/builder-core.js').read_text(encoding='utf-8')
    modules=re.findall(r"'(\w+\.py)'",re.search(r'PY_MODULES = \[(.*?)\]',core,re.S).group(1))
    (out.parent/'py').mkdir(exist_ok=True)
    for name in modules:
        (out.parent/'py'/name).write_bytes((here/name).read_bytes())

    (out.parent/'level-editor.html').write_bytes((here/'web/level-editor.html').read_bytes())
    (out.parent/'levels.html').write_bytes((here/'web/level-editor-redirect.html').read_bytes())
    levels_out=out.parent/'levels'
    levels_out.mkdir(exist_ok=True)
    for name in ('levels.css','rom.js','selection.js','palette.js','gallery.js','loader.js'):
        (levels_out/name).write_bytes((here/'levels'/name).read_bytes())
    runtime=(here/'levels/runtime.js').read_text(encoding='utf-8')
    editor=(here/'levels/editor.js').read_text(encoding='utf-8')
    (levels_out/'runtime.js').write_text(runtime.replace('/*EDITOR*/',editor),encoding='utf-8')
    # Bundled demo level, its models and head icons (generated once by build_demo_assets.js; no ROM is read here).
    demo_out=out.parent/'demo'
    shutil.copytree(here/'web/demo',demo_out,dirs_exist_ok=True)
    if icon_path:
        (demo_out/'heads').mkdir(exist_ok=True)
        shutil.copyfile(icon_path,demo_out/'heads/bear.png')
