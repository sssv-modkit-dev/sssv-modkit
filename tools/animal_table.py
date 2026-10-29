#!/usr/bin/env python3
"""Build per-animal tables (display lists, SETPRIMCOLOR words, vertex groups, bounding boxes) from the decomp + ROM.
Read-only: never writes ROM bytes.
Usage: python animal_table.py [animals_dir] [out_prefix]
  animals_dir default: src_us/src.us/sssv/animals ; writes <out_prefix>.json and <out_prefix>.md (default animal_table)
Seg base for each symbol D_<seg2><off6>_<ROM> is derived as ROM - off (so no guessing); seg1 = 0x398D0."""
import os, re, sys, json, struct
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sssv_paths
ROM = open(sssv_paths.ROM, 'rb').read()
adir = sys.argv[1] if len(sys.argv) > 1 else 'src_us/src.us/sssv/animals'
outp = sys.argv[2] if len(sys.argv) > 2 else 'animal_table'

OPS = {0x01, 0x03, 0x04, 0x06, 0xB0, 0xB1, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9, 0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF,
       0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEF, 0xF0, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFB, 0xFC, 0xFD}
SYM = re.compile(r'\b(D_(0[145])([0-9A-Fa-f]{6})_([0-9A-Fa-f]+))\b')
EXT = re.compile(r'extern\s+Gfx\s+(D_0[0-9A-Fa-f]{7}_[0-9A-Fa-f]+)\s*\[')
CALL = re.compile(r'func_802C78B0_6D8F60\(([^;]*?),\s*(D_0[0-9A-Fa-f]{7}_[0-9A-Fa-f]+)\)\s*;', re.S)

FUNC = re.compile(r'^[A-Za-z_][\w \t\*]*?\b(\w+)\s*\([^;{}]*\)\s*\{', re.M)
SECT = re.compile(r'^// ([A-Z][A-Z0-9_]+)[ \t]*$', re.M)      # section markers such as "// CRAZY_BEAR" at column 0
EV = re.compile(r'func_802C78B0_6D8F60\(([^;]*?)\)\s*;'
                r'|gSPDisplayList\(\s*\w+\+\+\s*,\s*(D_0[0-9A-Fa-f]{7}_[0-9A-Fa-f]+)\)'
                r'|gSP(Set|Clear)GeometryMode\(\s*\w+\+\+\s*,\s*([^)]*)\)'
                r'|load_animal\((\w+)\)'
                r'|\b([A-Za-z_]\w*)\(([^;{}]*?\bimg_\w+[^;{}]*?)\)\s*;', re.S)   # any call that mentions an img_ symbol (textures, palettes)

def draw_funcs(txt):
    """Ordered render events per C function, tagged with the section marker (variant) the function sits under."""
    marks = [(txt.count('\n', 0, m.start()) + 1, m.group(1)) for m in SECT.finditer(txt)]
    ms = list(FUNC.finditer(txt)); out = []
    for i, m in enumerate(ms):
        fline = txt.count('\n', 0, m.start()) + 1
        body_start = m.end(); body_end = ms[i + 1].start() if i + 1 < len(ms) else len(txt)
        ev = []
        for e in EV.finditer(txt, body_start, body_end):
            line = txt.count('\n', 0, e.start()) + 1
            if e.group(1) is not None:
                a = [x.strip() for x in e.group(1).split(',')]
                if len(a) == 10 and a[9].startswith('D_0'):
                    ev.append({'t': 'part', 'line': line, 'joints': a[:2], 'scale': [' '.join(x.split()) for x in a[2:5]], 'mirror': a[7], 'dl': a[9]})
            elif e.group(2): ev.append({'t': 'dl', 'line': line, 'list': e.group(2)})
            elif e.group(3): ev.append({'t': 'geo', 'line': line, 'op': e.group(3).lower(), 'flags': e.group(4).strip()})
            elif e.group(5): ev.append({'t': 'load', 'line': line, 'animal': e.group(5)})
            elif e.group(6): ev.append({'t': 'tex', 'line': line, 'fn': e.group(6), 'imgs': re.findall(r'img_\w+', e.group(7))})
        if any(x['t'] in ('part', 'load') for x in ev):
            sec = [n for (l, n) in marks if l < fline]
            out.append({'name': m.group(1), 'line': fline, 'section': sec[-1] if sec else None, 'events': ev})
    return out, [n for _, n in marks]

def vtx_bbox(base, off, n):
    xs = []; ys = []; zs = []
    for i in range(n):
        o = base + off + 16 * i
        if o < 0 or o + 16 > len(ROM): continue
        x, y, z, fl = struct.unpack('>hhhH', ROM[o:o + 8])
        if fl != 0: continue
        xs.append(x); ys.append(y); zs.append(z)
    if not xs: return None
    return [[min(xs), max(xs)], [min(ys), max(ys)], [min(zs), max(zs)]]

def parse_dl(rom_addr, segbases, maxcmds=600):
    cmds = []; colors = []; groups = []; tris = 0; last = None; ended = False; bad = None; combines = []; geomode = []
    for i in range(maxcmds):
        o = rom_addr + 8 * i
        if o + 8 > len(ROM): bad = 'eof'; break
        op = ROM[o]
        if op not in OPS: bad = f'opcode {op:02X} at +{8*i:#x}'; break
        w0, w1 = struct.unpack('>II', ROM[o:o + 8])
        if op == 0x04:
            seg = w1 >> 24; off = w1 & 0xFFFFFF; n = ((w0 & 0x3FF) + 1) >> 4
            base = segbases.get(seg)
            g = {'seg': seg, 'seg_off': off, 'n': n, 'rom': None if base is None else base + off, 'bbox': None}
            if base is not None: g['bbox'] = vtx_bbox(base, off, n)
            groups.append(g); last = len(groups) - 1
        elif op == 0xBF: tris += 1
        elif op == 0xB1: tris += 2
        elif op == 0xFA:
            colors.append({'rgba': '%08X' % w1, 'word_rom': o + 4, 'after_group': last})
        elif op == 0xFC: combines.append('%08X%08X' % (w0, w1))
        elif op in (0xB6, 0xB7): geomode.append({'op': 'clear' if op == 0xB6 else 'set', 'flags': '%08X' % w1})
        elif op == 0xB8: ended = True; break
    return {'ended': ended, 'bad': bad, 'tris': tris, 'groups': groups, 'primcolors': colors, 'len_cmds': i + 1, 'combines': combines, 'geomode': geomode}

result = {}
for fn in sorted(os.listdir(adir)):
    if not fn.endswith('.c'): continue
    name = fn[:-2]
    txt = open(os.path.join(adir, fn), encoding='utf8', errors='replace').read()
    syms = {}
    for m in SYM.finditer(txt):
        full, seg, off, rom = m.group(1), int(m.group(2)), int(m.group(3), 16), int(m.group(4), 16)
        syms[full] = (seg, off, rom)
    gfx = set(EXT.findall(txt))
    calls = {}
    for m in CALL.finditer(txt):
        args = [a.strip() for a in m.group(1).split(',')]
        calls.setdefault(m.group(2), []).append(' '.join(' '.join(args[:2]).split()) + ' | mirror=' + (args[7] if len(args) > 7 else '?'))
    segbases = {1: 0x398D0}
    for s, (seg, off, rom) in syms.items():
        if seg in (4, 5) and s in gfx: segbases.setdefault(seg, rom - off)
    parts = []
    for s in sorted(syms, key=lambda k: syms[k][2]):
        seg, off, rom = syms[s]
        if s not in gfx: continue
        d = parse_dl(rom, segbases)
        d.update({'symbol': s, 'seg': seg, 'rom': rom, 'joint_calls': calls.get(s, [])})
        parts.append(d)
    dfs, sections = draw_funcs(txt)
    for p in parts: p['sections'] = sorted({f['section'] for f in dfs if f['section'] for e in f['events'] if e['t'] == 'part' and e['dl'] == p['symbol']})
    variants = sorted({e['animal'] for f in dfs for e in f['events'] if e['t'] == 'load'})
    result[name] = {'file': fn, 'seg_bases': {k: hex(v) for k, v in segbases.items()}, 'parts': parts, 'variants': variants, 'sections': sections, 'draw_funcs': dfs,
                    'palette': sorted({c['rgba'] for p in parts if p['ended'] for c in p['primcolors']})}

json.dump(result, open(outp + '.json', 'w'), indent=1)
with open(outp + '.md', 'w') as f:
    f.write('# Animal parts / colours (auto-generated, read-only)\n\n')
    for name, a in result.items():
        ok = [p for p in a['parts'] if p['ended']]
        f.write(f"## {name}  (sections {', '.join(a['sections']) or '-'}; load_animal {', '.join(a['variants']) or '-'}; bases {a['seg_bases']}; {len(ok)} valid DLs of {len(a['parts'])} Gfx symbols; palette {', '.join(a['palette']) or '-'})\n")
        for p in a['parts']:
            if not p['ended']:
                f.write(f"- `{p['symbol']}` INVALID ({p['bad']})\n"); continue
            cols = ','.join(c['rgba'] for c in p['primcolors']) or '-'
            ext = ''
            bb = [g['bbox'] for g in p['groups'] if g['bbox']]
            if bb:
                mn = [min(b[i][0] for b in bb) for i in range(3)]; mx = [max(b[i][1] for b in bb) for i in range(3)]
                ext = f" extent x[{mn[0]},{mx[0]}] y[{mn[1]},{mx[1]}] z[{mn[2]},{mx[2]}]"
            jc = ('; joints: ' + ' / '.join(p['joint_calls'][:3])) if p['joint_calls'] else ''
            f.write(f"- `{p['symbol']}` tris={p['tris']} vtxgroups={len(p['groups'])} colors=[{cols}]{ext}{jc} sections=[{','.join(p['sections'])}]\n")
        f.write('\n')
print('animals:', len(result), ' valid DLs:', sum(1 for a in result.values() for p in a['parts'] if p['ended']),
      ' total Gfx symbols:', sum(len(a['parts']) for a in result.values()))
