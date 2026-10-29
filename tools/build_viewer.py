#!/usr/bin/env python3
"""Build a portable single-file viewer from modular sources and the ROM-derived table."""
import base64,json,os,sys
from urllib.parse import quote
from pathlib import Path
here=Path(__file__).resolve().parent
src=Path(sys.argv[1]) if len(sys.argv)>1 else next((p for p in [Path('animal_table.json'),Path('notes/animal_table.json'),here/'animal_table.json'] if p.is_file()),None)
if src is None: raise SystemExit('animal_table.json not found; pass its path as first argument')
out=Path(sys.argv[2]) if len(sys.argv)>2 else here.parent/'viewers'/'rom_viewer.html'
t=json.loads(src.read_text(encoding='utf-8'))
T={}
for a,d in t.items():
    ps=[]
    tex=sorted({img for fn in d.get('draw_funcs',[]) for e in fn.get('events',[]) if e.get('t')=='tex' for img in e.get('imgs',[])})
    for p in d['parts']:
        if not p['ended'] or p['seg']==1:continue
        j=p['joint_calls'][0].split(' | ')[0] if p['joint_calls'] else '?'
        import re
        ps.append({'s':p['symbol'],'r':p['rom'],'j':re.sub(r'(?<=[0-9A-Fa-f])U\b','',j).replace(' ','-'),'v':p.get('sections',[]),'t':tex})
    if ps:T[a]={'b':d['seg_bases'],'p':ps,'s':d.get('sections',[])}
base=here/'viewer'
html=(base/'index.template.html').read_text(encoding='utf-8')
css=(base/'css'/'app.css').read_text(encoding='utf-8')
js=(base/'js'/'app.js').read_text(encoding='utf-8').replace('/*TABLE*/null',json.dumps(T,separators=(',',':')))
icon_path=next((base/'assets'/name for name in ('icon.png','icon.ico') if (base/'assets'/name).is_file()),None)
if icon_path:
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
print(f'{len(T)} animals, {sum(len(v["p"]) for v in T.values())} parts -> {out}')
