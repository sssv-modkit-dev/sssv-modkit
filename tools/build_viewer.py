#!/usr/bin/env python3
"""Build a portable single-file viewer from modular sources and the ROM-derived table."""
import argparse,base64,json,re,subprocess,sys
from urllib.parse import quote
from pathlib import Path
here=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('table',nargs='?',type=Path,help='animal table JSON (default: search locally)')
parser.add_argument('output',nargs='?',type=Path,help='output HTML (default: viewers/parts_viewer.html; public: site/dist/index.html)')
parser.add_argument('--animals-dir',type=Path,help='generate the table first from decomp animal sources; requires a local ROM')
parser.add_argument('--public',action='store_true',help='Build original demos only; never read a ROM or animal table')
parser.add_argument('--out',type=Path,help='Override output HTML path')
args=parser.parse_args()
if args.public and (args.table or args.animals_dir): parser.error('--public rejects private table/source inputs; use --out for output')
out=args.out or args.output or here.parent/('site/dist/index.html' if args.public else 'viewers/parts_viewer.html')
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
base=here/'viewer'
html=(base/'index.template.html').read_text(encoding='utf-8')
css=(base/'css'/'app.css').read_text(encoding='utf-8')
js=(base/'js'/'demo-models.js').read_text(encoding='utf-8')+'\n'+(base/'js'/'app.js').read_text(encoding='utf-8').replace('/*TABLE*/null',json.dumps(T,separators=(',',':')))+'\n'+(base/'js'/'parts-lab.js').read_text(encoding='utf-8')
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
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(html,encoding='utf-8')
print(('Public Parts Lab: 3 original demo models, no game data' if args.public else f'{len(T)} animals, {sum(len(v["p"]) for v in T.values())} parts')+f' -> {out}')
