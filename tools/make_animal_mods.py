#!/usr/bin/env python3
"""Config-driven SSSV (US 1.0) animal recolour builder.  The ONLY place ROM bytes get written.
Safety: verifies the ROM SHA1; every edit asserts the G_SETPRIMCOLOR opcode (0xFA) just before the word AND the expected
original RGBA; refuses conflicting edits; fixes the N64 header CRCs; writes an IPS patch (+ optionally the patched .z64);
self-tests by re-applying the IPS to the original ROM and comparing byte-for-byte.  The original ROM is never modified.

Usage:  python make_animal_mods.py configs --out build [--name mypack] [--dry-run] [--no-rom]
        (ONE step: pass a folder, wildcards like configs\\*.json, individual files and/or a combined "pack" file, in any mix.)
        --save-pack FILE      write everything given on the command line out as one combined pack file
        --base ROM            still supported: stack on an already-patched ROM
ROM: --rom FILE, or leave it out and the first .z64 in ./rom, <script>/../rom or <script>/rom whose SHA1 matches US 1.0 is used.
Needs animal_table.json (made by animal_table.py); default lookup: ./animal_table.json, ./notes/animal_table.json, next to the script.

Config (one JSON file per animal; LLM-friendly, tiny):
{
  "animal": "bear",
  "recolor": { "B03F00FF": "3A2418FF", "AD6B52FF": "D9A441" },       // old RGBA -> new RGB or RGBA (RGB keeps the old alpha)
  "words":   [ {"word_rom": "0xCF1F4", "expect": "B03F00FF", "new": "FF0000"} ],   // optional: individual words
  "skip_words": ["0xD0F7C"],                                          // optional: word ROM addresses to leave alone
  "mesh":    [ {"symbol": "D_04002D90_CA7C0", "scale": [1.2,1.2,1.2], "move": [0,0,3]} ]   // optional vertex edits (see below)
}
'mesh': every vertex of that part (all its vertex groups, or only "groups":[0,2]) is scaled about the part's bbox centre (or "about":[x,y,z])
then moved, in the part's own local axes (what the viewer shows). Vertex arrays also used by another part/animal are refused unless "allow_shared": true.
Triangle/vertex COUNTS never change; only positions (int16, clamped). Vertex normals/colours (bytes 8-15) are left as they are.
'deform': parametric shape ops on a part's vertices (positions only, counts never change, same shared-vertex refusal as 'mesh'):
  {"symbol": "D_...", "groups": [0], "about": [x,y,z], "allow_shared": false, "ops": [ ... ]}   // "groups"/"about" optional; ops run in order
  Axes are the part's own local x/y/z. Lengths are measured on the ORIGINAL bounding box of the selected vertices; "range": [0.2, 0.8] = fraction of that length.
  {"type":"taper",  "axis":"y", "from":1.0, "to":0.6}                 // scale the other two axes, ramping from..to along axis (outside "range" it holds the end value)
  {"type":"twist",  "axis":"y", "degrees":30}                         // rotate the cross-section around axis, 0 -> degrees along the length
  {"type":"bend",   "axis":"y", "toward":"z" (or "-z"), "degrees":25} // curve the part along axis toward z; the part beyond "range" continues straight
  {"type":"inflate","amount":1.15, "axes":["x","z"], "axis":"y", "range":[0,0.5]}  // scale away from the centre; "axes" optional (default all);
                                                                      // "range" (needs "axis") is a hard window: vertices outside it are untouched
  Normals/colours (bytes 8-15) are NOT adjusted, so large bends/twists may shade slightly off. --dry-run prints bbox before/after.
'vertices': explicit single-vertex edits (exact, address-based; used for hand-made edits such as the mouse ears/cheeks):
  {"rom": "0xCCD20", "index": 0, "expect": [x,y,z], "new": [x,y,z]}      // vertex = rom + 16*index; "expect" is REQUIRED and checked
  optional "normal": [b12,b13,b14,b15] with REQUIRED "expect_normal": [4 original bytes]  // bytes 12-15 (normal/colour + alpha), 0-255
  The vertex flag word (bytes 6-7) must be 0. The vertex must lie in a vertex group of this animal (else "allow_unlisted": true)
  and must not be shared with another animal (else "allow_shared": true). Conflicts with 'mesh' edits are refused. Counts never change.
'recolor' expands to EVERY colour word in that animal's own (non-shared) display lists whose RGBA equals the key.
Shared render-state lists (segment 1) are never touched.

Combined "pack" file (alternative to one file per animal; the per-animal files keep working and can be mixed in):
{ "name": "sssv_animals_v3",            // optional default output name (--name wins)
  "animals": [ {"animal": "bear", "recolor": {...}}, {"animal": "rat", "recolor": {...}} ] }
Each entry in "animals" is exactly an individual config (same keys)."""
import sys, os, json, struct, hashlib, argparse, math, glob
US10_SHA1 = 'e5e09205aa743a9e5043a42df72adc379c746b0b'

def n64_crc(rom):   # CIC-6102, same routine as make_mouse_mod (verified against the original header)
    M = 0xFFFFFFFF; t1 = t2 = t3 = t4 = t5 = t6 = 0xF8CA4DDC
    for i in range(0x1000, 0x1000 + 0x100000, 4):
        d = struct.unpack('>I', rom[i:i + 4])[0]
        if ((t6 + d) & M) < t6: t4 = (t4 + 1) & M
        t6 = (t6 + d) & M; t3 ^= d
        r = ((d << (d & 31)) | (d >> (32 - (d & 31)))) & M if (d & 31) else d
        t5 = (t5 + r) & M
        if t2 > d: t2 ^= r
        else: t2 ^= (t6 ^ d)
        t1 = (t1 + (d ^ t5)) & M
    return (t6 ^ t4 ^ t3) & M, (t5 ^ t2 ^ t1) & M

def make_ips(orig, new):
    out = bytearray(b'PATCH'); i = 0; n = len(orig)
    while i < n:
        if orig[i] == new[i]: i += 1; continue
        s = i; j = i
        while j < n and orig[j] != new[j] and j - s < 0xFFFF: j += 1
        if s == 0x454F46: s -= 1            # offset must not spell 'EOF'
        out += struct.pack('>I', s)[1:] + struct.pack('>H', j - s) + bytes(new[s:j]); i = j
    return bytes(out + b'EOF')

def apply_ips(orig, ips):
    rom = bytearray(orig); assert ips[:5] == b'PATCH'; p = 5
    while ips[p:p + 3] != b'EOF':
        off = int.from_bytes(ips[p:p + 3], 'big'); ln = int.from_bytes(ips[p + 3:p + 5], 'big'); p += 5
        assert ln != 0, 'RLE hunk not expected'
        rom[off:off + ln] = ips[p:p + ln]; p += ln
    return bytes(rom)

def hexint(x): return int(x, 16) if isinstance(x, str) else int(x)
def rgba(s, old=None):
    s = s.upper().replace('0X', '').replace('#', '')
    if len(s) == 6:
        if old is None: raise SystemExit(f'RGB without alpha needs an old value: {s}')
        s += old[6:8]
    if len(s) != 8 or any(c not in '0123456789ABCDEF' for c in s): raise SystemExit(f'bad colour {s}')
    return s

def find_rom(arg):
    if arg:
        if not os.path.isfile(arg): raise SystemExit(f'ROM not found: {arg}')
        return arg
    here = os.path.dirname(os.path.abspath(__file__)); dirs = []
    for d in ['rom', os.path.join(here, '..', 'rom'), os.path.join(here, 'rom')]:
        d = os.path.abspath(d)
        if os.path.isdir(d) and d not in dirs: dirs.append(d)
    swapped = []
    for d in dirs:
        for f in sorted(os.listdir(d)):
            p = os.path.join(d, f); ext = os.path.splitext(f)[1].lower()
            if not os.path.isfile(p): continue
            if ext == '.z64' and os.path.getsize(p) <= 0x4000000:
                with open(p, 'rb') as fh:
                    if hashlib.sha1(fh.read()).hexdigest() == US10_SHA1: print(f'ROM: {p}'); return p
            elif ext in ('.n64', '.v64'): swapped.append(p)
    msg = 'no unmodified US 1.0 .z64 (SHA1 ' + US10_SHA1 + ') found in the rom folder; put it there or pass --rom FILE.'
    if swapped: msg += ' Byte-swapped files found (' + ', '.join(swapped) + '): convert them to big-endian .z64 first.'
    raise SystemExit(msg)

def find_table(arg):
    here = os.path.dirname(os.path.abspath(__file__))
    for c in [arg, 'animal_table.json', os.path.join('notes', 'animal_table.json'), os.path.join(here, 'animal_table.json'),
              os.path.join(here, '..', 'notes', 'animal_table.json')]:
        if c and os.path.isfile(c): return c
    raise SystemExit('animal_table.json not found (run animal_table.py, or pass --table)')

# ---------------------------------------------------------------- config loading (individual files, folders, wildcards, packs)
def expand_args(args):
    out, seen = [], set()
    for a in args:
        if os.path.isdir(a): items = [(p, True) for p in sorted(glob.glob(os.path.join(a, '*.json')))]
        elif any(ch in a for ch in '*?['):
            items = [(p, True) for p in sorted(glob.glob(a))]
            if not items: print(f'WARNING: nothing matches {a}')
        elif os.path.isfile(a): items = [(a, False)]
        else: raise SystemExit(f'config not found: {a}')
        for p, soft in items:
            k = os.path.abspath(p)
            if k not in seen: seen.add(k); out.append((p, soft))
    return out

def load_configs(args):
    """-> ([(source_path, animal_config)], pack_name_or_None)"""
    animals, pname = [], None
    for p, soft in expand_args(args):
        try: cfg = json.load(open(p, encoding='utf-8'))
        except ValueError as e: raise SystemExit(f'{p}: not valid JSON ({e})')
        if not isinstance(cfg, dict) or ('animal' not in cfg and 'animals' not in cfg):
            if soft: print(f'skipping {p} (no "animal" or "animals" key)'); continue
            raise SystemExit(f'{p}: needs an "animal" key (single config) or an "animals" list (pack)')
        if cfg.get('mouse'): raise SystemExit(f'{p}: the "mouse" key was removed; use configs/mouse.json (an ordinary animal config) instead')
        if 'animals' in cfg:
            if cfg.get('name') and not pname: pname = cfg['name']
            entries = cfg['animals']
        else: entries = [cfg]
        for e in entries:
            if not isinstance(e, dict) or 'animal' not in e: raise SystemExit(f'{p}: every entry in "animals" needs an "animal" key')
            animals.append((p, e))
    if not animals: raise SystemExit('no usable configs found')
    return animals, pname

AXIS = {'x': 0, 'y': 1, 'z': 2}
def _ax(v, what):
    v = str(v).lower()
    if v not in AXIS: raise SystemExit(f'deform: bad {what} "{v}" (use x, y or z)')
    return AXIS[v]

def find_part(table, an, m):
    return next((q for q in table[an]['parts'] if q['ended'] and q['seg'] != 1 and (m.get('symbol') == q['symbol'] or (m.get('rom') and hexint(m['rom']) == q['rom']))), None)

def variant_report(table, an, touched):
    """Which variants (section markers in the decomp animal file) draw the parts a config edits. Returns printable lines; [] if the table has no section data."""
    secs = table[an].get('sections'); by = {q['symbol']: q for q in table[an]['parts']}
    t = sorted(s for s in touched if s in by)
    if not secs or not t: return []
    out = [f'{an}: {len(t)} edited part(s); where they are drawn:']
    for sec in secs:
        hit = [s for s in t if sec in by[s].get('sections', [])]; miss = [s for s in t if s not in hit]
        msg = f'  {sec}: {len(hit)}/{len(t)}'
        if not hit: msg += '  WARNING: none of the edited parts is drawn in this variant, so the edit will not show there'
        elif miss: msg += '  not drawn there: ' + ', '.join(miss)
        out.append(msg)
    unseen = [s for s in t if not by[s].get('sections')]
    if unseen: out.append('  not seen drawn in any variant section (loaded some other way?): ' + ', '.join(unseen))
    return out

def plan_deform(buf, part, d, vplan, an):
    """Run one 'deform' entry on the part's vertices as they are in buf. Returns (changes, bbox_before, bbox_after, n_clamped); writes nothing."""
    offs, seen = [], set()
    for g in [part['groups'][i] for i in d.get('groups', range(len(part['groups'])))]:
        for i in range(g['n']):
            o = g['rom'] + 16 * i
            if o in seen: continue
            if o in vplan: raise SystemExit(f"{an} {part['symbol']}: vertex {o:#x} is also edited by a 'vertices' entry; use one or the other")
            seen.add(o); offs.append(o)
    if not offs: raise SystemExit(f"{an} {part['symbol']}: deform selects no vertices")
    P = [[float(x) for x in struct.unpack('>hhh', bytes(buf[o:o + 6]))] for o in offs]
    lo = [min(p[k] for p in P) for k in range(3)]; hi = [max(p[k] for p in P) for k in range(3)]
    ctr = d.get('about') or [(lo[k] + hi[k]) / 2 for k in range(3)]
    if len(ctr) != 3: raise SystemExit(f'{an}: deform "about" needs 3 numbers')
    for op in d.get('ops', []):
        ty = op.get('type'); r0, r1 = op.get('range', [0, 1])
        if not 0 <= r0 < r1 <= 1: raise SystemExit(f'{an}: deform range must satisfy 0 <= a < b <= 1: {op}')
        if ty in ('taper', 'twist', 'bend') or (ty == 'inflate' and 'range' in op):
            ax = _ax(op.get('axis'), 'axis'); span = hi[ax] - lo[ax]
            def frac(p, ax=ax, span=span): return (p[ax] - lo[ax]) / span if span > 0 else 0.5
            def ramp(p, r0=r0, r1=r1): return min(1.0, max(0.0, (frac(p) - r0) / (r1 - r0)))
        if ty == 'taper':
            s0 = float(op.get('from', 1.0)); s1 = float(op.get('to', 1.0))
            for p in P:
                s = s0 + (s1 - s0) * ramp(p)
                for k in range(3):
                    if k != ax: p[k] = ctr[k] + (p[k] - ctr[k]) * s
        elif ty == 'twist':
            u, v = (ax + 1) % 3, (ax + 2) % 3; deg = math.radians(float(op['degrees']))
            for p in P:
                a = deg * ramp(p); c_, s_ = math.cos(a), math.sin(a); du, dv = p[u] - ctr[u], p[v] - ctr[v]
                p[u] = ctr[u] + du * c_ - dv * s_; p[v] = ctr[v] + du * s_ + dv * c_
        elif ty == 'bend':
            tw_s = str(op.get('toward', '')).lower(); sgn = -1.0 if tw_s.startswith('-') else 1.0; tw = _ax(tw_s.lstrip('+-'), 'toward')
            if tw == ax: raise SystemExit(f'{an}: bend "toward" must differ from "axis": {op}')
            th = math.radians(float(op['degrees']))
            if th == 0 or span <= 0: continue
            start = lo[ax] + r0 * span; L = (r1 - r0) * span; R = L / th
            for p in P:
                s = p[ax] - start; phi = th * min(max(s, 0.0), L) / L; extra = max(0.0, s - L); pre = min(0.0, s)
                dd = sgn * (p[tw] - ctr[tw])
                p[ax] = start + R * math.sin(phi) - dd * math.sin(phi) + extra * math.cos(phi) + pre
                p[tw] = ctr[tw] + sgn * (R * (1 - math.cos(phi)) + dd * math.cos(phi) + extra * math.sin(phi))
        elif ty == 'inflate':
            f = float(op.get('amount', 1.0)); axes = [_ax(a, 'axes') for a in op.get('axes', 'xyz')]
            for p in P:
                w = 1.0 if 'range' not in op else (1.0 if r0 <= frac(p) <= r1 else 0.0)
                k_ = 1 + (f - 1) * w
                for k in axes: p[k] = ctr[k] + (p[k] - ctr[k]) * k_
        else: raise SystemExit(f'{an}: unknown deform op type "{ty}" (taper, twist, bend, inflate)')
    changes, clip = [], 0
    for o, p in zip(offs, P):
        nv = []
        for k in range(3):
            x = int(math.floor(p[k] + 0.5))
            if x < -32768 or x > 32767: clip += 1; x = max(-32768, min(32767, x))
            nv.append(x)
        changes.append((o, nv))
    lo2 = [min(nv[k] for _, nv in changes) for k in range(3)]; hi2 = [max(nv[k] for _, nv in changes) for k in range(3)]
    return changes, (lo, hi), (lo2, hi2), clip

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('configs', nargs='+'); ap.add_argument('--out', default='build'); ap.add_argument('--name')
    ap.add_argument('--rom'); ap.add_argument('--base', help='an already-patched US 1.0 ROM to stack these edits on (e.g. the mouse build); IPS is still diffed against the original'); ap.add_argument('--table'); ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--no-rom', action='store_true')
    ap.add_argument('--save-pack', metavar='FILE', help='write all given configs out as one combined pack file')
    a = ap.parse_args()
    animals, pack_name = load_configs(a.configs)
    name = a.name or pack_name or 'sssv_animals'
    if a.save_pack:
        pk = {'name': name}
        pk['animals'] = [e for _, e in animals]
        json.dump(pk, open(a.save_pack, 'w', encoding='utf-8'), indent=2); print(f'pack written -> {a.save_pack}')
    rom_path = find_rom(a.rom)
    orig = open(rom_path, 'rb').read()
    if hashlib.sha1(orig).hexdigest() != US10_SHA1: raise SystemExit('ROM is not the US 1.0 .z64 (SHA1 mismatch).')
    assert n64_crc(orig) == struct.unpack('>II', orig[0x10:0x18]), 'CRC routine disagrees with the original header'
    base = bytes(open(a.base, 'rb').read()) if a.base else orig
    if len(base) != len(orig): raise SystemExit('--base ROM has a different size than the original')
    table = json.load(open(find_table(a.table)))

    medits = []
    dedits = []  # (animal, part, deform entry)
    vedits = []  # (animal, vertex entry)
    edits = {}   # word_rom -> (old, new, animal, why)
    touch = {}   # animal -> set of part symbols whose colour words are edited
    def add(word, old, new, animal, why):
        if base[word - 4] != 0xFA: raise SystemExit(f'{animal}: {word:#x} is not preceded by a G_SETPRIMCOLOR (0xFA) command')
        have = base[word:word + 4].hex().upper()
        if have != old: raise SystemExit(f'{animal}: at {word:#x} expected {old} but ROM has {have}')
        if word in edits and edits[word][1] != new: raise SystemExit(f'conflicting edits for {word:#x}: {edits[word][2]} vs {animal}')
        edits[word] = (old, new, animal, why)

    for cp, cfg in animals:
        an = cfg['animal']
        if an not in table: raise SystemExit(f'unknown animal {an}')
        skip = {hexint(x) for x in cfg.get('skip_words', [])}
        known = {}
        for p in table[an]['parts']:
            if not p['ended'] or p['seg'] == 1: continue
            for c in p['primcolors']: known[c['word_rom']] = (c['rgba'], p['symbol'])
        n0 = len(edits)
        for old, new in cfg.get('recolor', {}).items():
            old = rgba(old); hit = 0
            for w, (rg, sym) in known.items():
                if rg == old and w not in skip:
                    add(w, old, rgba(new, old), an, f'{sym} recolor {old}->{rgba(new, old)}'); hit += 1; touch.setdefault(an, set()).add(sym)
            if hit == 0: print(f'WARNING {an}: no colour word with {old} found')
        for e in cfg.get('words', []):
            w = hexint(e['word_rom'])
            if w in skip: continue
            if w not in known: raise SystemExit(f'{an}: {w:#x} is not a colour word of this animal (per table)')
            add(w, rgba(e['expect']), rgba(e['new'], rgba(e['expect'])), an, e.get('label', 'explicit')); touch.setdefault(an, set()).add(known[w][1])
        for m in cfg.get('mesh', []):
            part = find_part(table, an, m)
            if part is None: raise SystemExit(f'{an}: mesh part not found: {m}')
            medits.append((an, part, m))
        for dd in cfg.get('deform', []):
            part = find_part(table, an, dd)
            if part is None: raise SystemExit(f'{an}: deform part not found: {dd}')
            if not dd.get('ops'): raise SystemExit(f'{an}: deform entry has no "ops": {dd}')
            dedits.append((an, part, dd))
        nv0 = len(vedits)
        for v in cfg.get('vertices', []): vedits.append((an, v))
        print(f'{an}: {len(edits) - n0} colour words, {len(vedits) - nv0} explicit vertices')

    # a word may be shared by two animals only if both agree (checked in add). Report cross-animal use:
    users = {}
    for an in table:
        for p in table[an]['parts']:
            for c in p.get('primcolors', []): users.setdefault(c['word_rom'], set()).add(an)
    for w, (old, new, an, why) in sorted(edits.items()):
        if len(users.get(w, ())) > 1: print(f'NOTE {w:#x} is shared by {sorted(users[w])} (edit affects all)')
    owners = [(g['rom'], g['rom'] + 16 * g['n'], an2, q['symbol']) for an2, d in table.items() for q in d['parts'] if q['ended'] and q['seg'] != 1 for g in q['groups'] if g['rom'] is not None]
    for an, part, m in medits + dedits:
        for g in [part['groups'][i] for i in m.get('groups', range(len(part['groups'])))]:
            sa, ea = g['rom'], g['rom'] + 16 * g['n']
            others = sorted({(a2, sy) for (s2, e2, a2, sy) in owners if s2 < ea and sa < e2 and sy != part['symbol']})
            if others and not m.get('allow_shared'): raise SystemExit(f"{an} {part['symbol']}: vertices at {sa:#x} are also used by {others}; add \"allow_shared\": true to edit them anyway")
    vplan = {}   # vertex ROM offset -> (animal, new_xyz or None, new_normal or None)
    for an, v in vedits:
        for key in ('rom', 'expect'):
            if key not in v: raise SystemExit(f'{an}: vertices entry needs "{key}": {v}')
        o = hexint(v['rom']) + 16 * int(v.get('index', 0))
        if o < 0 or o + 16 > len(base): raise SystemExit(f'{an}: vertex {o:#x} is outside the ROM')
        if base[o + 6:o + 8] != b'\x00\x00': raise SystemExit(f'{an}: {o:#x} does not look like a vertex (flag word is not 0)')
        have = list(struct.unpack('>hhh', base[o:o + 6]))
        if list(v['expect']) != have: raise SystemExit(f'{an}: vertex {o:#x} expected {v["expect"]} but ROM has {have}')
        new = v.get('new'); nrm = v.get('normal')
        if new is None and nrm is None: raise SystemExit(f'{an}: vertex {o:#x} has neither "new" nor "normal"')
        if new is not None and (len(new) != 3 or any(not isinstance(x, int) or not -32768 <= x <= 32767 for x in new)):
            raise SystemExit(f'{an}: vertex {o:#x}: "new" must be 3 integers in the int16 range')
        if nrm is not None:
            if 'expect_normal' not in v: raise SystemExit(f'{an}: vertex {o:#x}: "normal" needs "expect_normal" (the 4 original bytes 12-15)')
            if len(nrm) != 4 or any(not isinstance(x, int) or not 0 <= x <= 255 for x in nrm): raise SystemExit(f'{an}: vertex {o:#x}: "normal" must be 4 bytes (0-255)')
            if list(v['expect_normal']) != list(base[o + 12:o + 16]): raise SystemExit(f'{an}: vertex {o:#x} expected normal bytes {v["expect_normal"]} but ROM has {list(base[o + 12:o + 16])}')
        mine = any(a2 == an and s2 <= o and o + 16 <= e2 for (s2, e2, a2, sy) in owners)
        others = sorted({(a2, sy) for (s2, e2, a2, sy) in owners if s2 < o + 16 and o < e2 and a2 != an})
        if not mine and not v.get('allow_unlisted'): raise SystemExit(f'{an}: vertex {o:#x} is not in any vertex group of this animal (per table); add "allow_unlisted": true to edit it anyway')
        if others and not v.get('allow_shared'): raise SystemExit(f'{an}: vertex {o:#x} is also used by {others}; add "allow_shared": true to edit it anyway')
        if o in vplan and vplan[o][1:] != (new, nrm): raise SystemExit(f'conflicting vertex edits for {o:#x}')
        vplan[o] = (an, new, nrm)
    for an in sorted({c['animal'] for _, c in animals}):
        for ln in variant_report(table, an, set(touch.get(an, ())) | {q['symbol'] for a2, q, m in medits + dedits if a2 == an}): print(ln)
    if a.dry_run:
        for o, (an, new, nrm) in sorted(vplan.items()): print(f'  vertex {o:#08x} xyz->{new} normal->{nrm}  [{an}]')
        tmp = bytearray(base)
        for an, part, dd in dedits:
            ch, b0, b1, clip = plan_deform(tmp, part, dd, vplan, an)
            for o, nv in ch: tmp[o:o + 6] = struct.pack('>hhh', *nv)
            print(f"  deform [{an}] {part['symbol']}: {len(ch)} vertices, {len(dd['ops'])} ops, bbox {b0[0]}..{b0[1]} -> {b1[0]}..{b1[1]}" + (f'  WARNING {clip} coords clamped' if clip else ''))
        for an, part, m in medits: print(f"  mesh [{an}] {part['symbol']} scale={m.get('scale', [1, 1, 1])} move={m.get('move', [0, 0, 0])}")
        for w, (old, new, an, why) in sorted(edits.items()): print(f'  {w:#08x} {old}->{new}  [{an}] {why}')
        return
    rom = bytearray(base)
    for w, (old, new, an, why) in edits.items(): rom[w:w + 4] = bytes.fromhex(new[:8])
    for o, (an, new, nrm) in vplan.items():
        if new is not None: rom[o:o + 6] = struct.pack('>hhh', *new)
        if nrm is not None: rom[o + 12:o + 16] = bytes(nrm)
    nvert = 0
    for an, part, m in medits:
        gb = [g['bbox'] for g in part['groups'] if g['bbox']]
        ctr = m.get('about') or [(min(b[k][0] for b in gb) + max(b[k][1] for b in gb)) / 2 for k in range(3)]
        sc = m.get('scale', [1, 1, 1]); mv = m.get('move', [0, 0, 0]); done = set()
        for g in [part['groups'][i] for i in m.get('groups', range(len(part['groups'])))]:
            for i in range(g['n']):
                o = g['rom'] + 16 * i
                if o in done: continue
                if o in vplan: raise SystemExit(f"{an} {part['symbol']}: vertex {o:#x} is also edited by a 'vertices' entry; use one or the other")
                done.add(o); v = struct.unpack('>hhh', bytes(rom[o:o + 6]))
                nv = [max(-32768, min(32767, int(math.floor(ctr[k] + (v[k] - ctr[k]) * sc[k] + mv[k] + 0.5)))) for k in range(3)]
                rom[o:o + 6] = struct.pack('>hhh', *nv); nvert += 1
        print(f"mesh [{an}] {part['symbol']}: {len(done)} vertices")
    for an, part, dd in dedits:
        ch, b0, b1, clip = plan_deform(rom, part, dd, vplan, an)
        for o, nv in ch: rom[o:o + 6] = struct.pack('>hhh', *nv)
        nvert += len(ch)
        print(f"deform [{an}] {part['symbol']}: {len(ch)} vertices, bbox {b0[0]}..{b0[1]} -> {b1[0]}..{b1[1]}" + (f'  WARNING {clip} coords clamped' if clip else ''))
    c1, c2 = n64_crc(rom); rom[0x10:0x18] = struct.pack('>II', c1, c2)
    ips = make_ips(orig, rom)
    assert apply_ips(orig, ips) == bytes(rom), 'IPS self-test failed'
    os.makedirs(a.out, exist_ok=True)
    open(os.path.join(a.out, name + '.ips'), 'wb').write(ips)
    if not a.no_rom: open(os.path.join(a.out, name + '.z64'), 'wb').write(rom)
    print(f'{len(edits)} words, {nvert} mesh + {len(vplan)} explicit vertices, {sum(1 for x, y in zip(orig, rom) if x != y)} bytes changed, CRC {c1:08X} {c2:08X}; IPS self-test OK -> {a.out}/{name}.ips')
    by = {}
    for w, (old, new, an, why) in edits.items(): by.setdefault(an, set()).add((old, new))
    for an, s in sorted(by.items()): print(f'  {an}: ' + ', '.join(f'{o}->{n}' for o, n in sorted(s)))
if __name__ == '__main__':
    main()
