#!/usr/bin/env python3
"""ROM-only animal index: rebuilds animal_table.json from the US 1.0 ROM with no external C source.

How it works (all static reads of the owner's ROM, nothing written):
- Overlay A (ROM 0x6A6500 -> RAM 0x80294E50) holds the per-animal draw functions. Function starts are the first
  non-nop word after each `jr ra` + delay slot.
- Every body part is drawn by one call to the part-draw routine at RAM 0x802C78B0. A backward constant tracer
  recovers its arguments: joints (a0, a1), mirror flag (stack +0x1C) and the display list address (stack +0x24).
- Segment 4 is a per-world model bank DMA'd by the bank loader (ROM ~0x7917F8); BANKS4 lists its ranges.
  Each animal uses the first bank in which every segment-4 display list it draws parses cleanly.
- Other segment-1/4 constants in a draw function that parse as complete display lists are added as parts too.
ANIMALS maps each animal to its draw-function ROM addresses, the variant label for each function, and variant labels.
Labels are our own names for in-game animal variants. The only per-animal metadata is in ANIMALS below."""
import bisect, struct

OVA_ROM, OVA_END, OVA_VRAM = 0x6A6500, 0x7D1AD0, 0x80294E50
PART_DRAW_JAL = 0x0C000000 | ((0x802C78B0 & 0x0FFFFFFF) >> 2)
SEG1_BASE = 0x398D0
BANKS4 = [(0xC7A30, 0xDD5C0), (0xDD5C0, 0xE75B0), (0xE75B0, 0xF1060), (0xF1060, 0xFFD50), (0xFFD50, 0x116BD0)]
SP = 29

ANIMALS = {
    'bear': ([(0x734D30, 'BEAR'), (0x736758, 'CRAZY_BEAR'), (0x737910, 'MYSTERY_BEAR')], ['BEAR', 'CRAZY_BEAR']),
    'camel': ([(0x77EDB0, None)], []),
    'chameleon': ([(0x76BCA0, None)], ['CHAMELEON', 'SNEAKY_CHAMELEON']),
    'cool_cod': ([(0x7943A0, None)], []),
    'desert_fox': ([(0x783D90, 'ARMED_DESERT_FOX'), (0x784E38, 'DESERT_FOX_ATTACKING')], ['DESERT_FOX', 'DESERT_FOX_ATTACKING']),
    'dog': ([(0x6FBEA0, 'RACING_DOG'), (0x6FD1E4, 'FLYING_DOG'), (0x6FE7B8, 'DOG')], []),
    'elephant': ([(0x78CEB0, None)], []),
    'evo': ([(0x79B1E0, 'EVO_SHELLSUIT')], []),
    'evo_microchip': ([], ['EVO_MICROCHIP']),
    'fox': ([(0x6F66B0, 'FOX'), (0x6F78BC, 'FIRE_FOX'), (0x6F8A44, 'RACING_FOX')], []),
    'frog': ([(0x7138B0, None)], []),
    'gorilla': ([(0x78A890, None)], []),
    'hippo': ([(0x700770, None)], []),
    'husky': ([(0x77A480, None), (0x77B70C, None)], ['CRAZY_HUSKY', 'HUSKY']),
    'hyena': ([(0x768B90, 'HYENA_BIKER'), (0x76A4EC, 'HYENA')], []),
    'kangaroo': ([(0x780E50, 'BOXING_KANGAROO'), (0x782334, 'POGO_KANGAROO')], []),
    'lion': ([(0x702DE0, None)], []),
    'mouse': ([(0x72DE50, None), (0x72ECD4, 'RACING_MOUSE'), (0x72FD50, 'HARD_MOUSE')], ['HARD_MOUSE', 'MOUSE', 'MOUSE2', 'RACING_MOUSE']),
    'parrot': ([(0x724E40, None)], ['PARROT', 'PARROT_ATTACKING']),
    'penguin': ([(0x775E30, None)], []),
    'pirana': ([(0x793700, None)], []),
    'polar_bear': ([(0x7775C0, 'POLAR_BEAR'), (0x778E74, 'POLAR_BEAR')], ['POLAR_BEAR', 'POLAR_BEAR_DEFENDING']),
    'rabbit': ([(0x7118C0, None), (0x7128F8, 'HELI_RABBIT')], []),
    'rat': ([(0x76FAE0, None)], []),
    'scorpion': ([(0x7883F0, None)], []),
    'seagull': ([(0x791FD0, None)], ['SEAGULL', 'SEAGULL2']),
    'sheep': ([(0x771540, None), (0x772444, None)], []),
    'stats': ([], []),
    'tortoise': ([(0x763A30, 'TORTOISE_TANK'), (0x765838, 'TORTOISE_TANK'), (0x7667E0, 'TORTOISE_TANK')], ['RACING_TORTOISE', 'RACING_TORTOISE_DEFENDING', 'TORTOISE_TANK', 'TORTOISE_TANK_DEFENDING']),
    'vulture': ([(0x77D760, None)], ['VULTURE', 'VULTURE2']),
    'walrus': ([(0x786320, None)], []),
}

class Code:
    def __init__(self, rom):
        self.rom = rom
        self.starts = self._func_starts()

    def w(self, o): return struct.unpack('>I', self.rom[o:o + 4])[0]

    def _func_starts(self):
        st = []; o = OVA_ROM
        while o < OVA_END - 8:
            if self.w(o) == 0x03E00008:
                p = o + 8
                while p < OVA_END and self.w(p) == 0: p += 4
                st.append(p); o = p
            else: o += 4
        return st

    def func_range(self, o):
        i = bisect.bisect_right(self.starts, o) - 1
        return self.starts[i], (self.starts[i + 1] if i + 1 < len(self.starts) else OVA_END)

    @staticmethod
    def _writes(w):
        op = w >> 26
        if op == 0 and w != 0: return (w >> 11) & 31
        if op in (8, 9, 10, 11, 12, 13, 14, 15, 0x20, 0x21, 0x23, 0x24, 0x25, 0x37): return (w >> 16) & 31
        if op == 3: return 31
        return None

    def _eval(self, p, w):
        """value written by the instruction w at p, or None if it is not a constant load"""
        op = w >> 26; rs = (w >> 21) & 31; rt = (w >> 16) & 31; imm = w & 0xFFFF
        if op == 15: return (imm << 16) & 0xFFFFFFFF
        if op in (9, 13):
            b = self.value(p, rs) if rs else 0
            if b is None: return None
            return (b + (imm - 0x10000 if imm & 0x8000 else imm)) & 0xFFFFFFFF if op == 9 else b | imm
        if op == 0 and (w & 0x3F) in (0x21, 0x25) and 0 in (rs, rt): return self.value(p, rt if rs == 0 else rs)
        return None

    def value(self, o, reg, lim=400):
        """constant held by reg just before instruction o (straight-line backward scan)"""
        if reg == 0: return 0
        p = o - 4
        for _ in range(lim):
            w = self.w(p)
            if self._writes(w) == reg: return self._eval(p, w)
            p -= 4
        return None

    def reg_arg(self, jal, reg):
        w = self.w(jal + 4)   # delay slot runs before the call
        return self._eval(jal + 4, w) if self._writes(w) == reg else self.value(jal, reg)

    def stack_arg(self, jal, off, lim=80):
        for p in [jal + 4] + [jal - 4 * k for k in range(1, lim)]:
            w = self.w(p)
            if w >> 26 == 0x2B and (w >> 21) & 31 == SP and w & 0xFFFF == off: return self.value(p, (w >> 16) & 31)
            if w == 0x03E00008: return None
        return None

    def seg_consts(self, lo, hi):
        """lui/addiu pairs in [lo, hi) that build a segment 1 or 4 address"""
        out = []
        for o in range(lo, hi, 4):
            w = self.w(o)
            if w >> 26 != 15 or (w & 0xFFFF) >> 8 not in (1, 4): continue
            rt = (w >> 16) & 31
            for p in range(o + 4, min(o + 64, hi), 4):
                w2 = self.w(p)
                if w2 >> 26 == 9 and (w2 >> 21) & 31 == rt: out.append(self._eval(p, w2)); break
                if self._writes(w2) == rt: break
        return out

def _num(v): return '?' if v is None else (str(v) if v < 10 else '0x%X' % v)

def build_from_rom(rom, parse_dl):
    """Same schema as animal_table.build(); parse_dl(rom_addr, segbases) is animal_table.parse_dl."""
    c = Code(rom); result = {}
    for name, (funcs, variants) in ANIMALS.items():
        calls = []; consts = []
        for start, section in funcs:
            lo, hi = c.func_range(start)
            ev = [(c.stack_arg(o, 0x24), c.reg_arg(o, 4), c.reg_arg(o, 5), c.stack_arg(o, 0x1C))
                  for o in range(lo, hi, 4) if c.w(o) == PART_DRAW_JAL]
            calls.append((lo, section, [e for e in ev if e[0] is not None]))
            consts += c.seg_consts(lo, hi)
        seg4 = sorted({e[0] & 0xFFFFFF for _, _, ev in calls for e in ev if e[0] >> 24 == 4})
        bases = {1: SEG1_BASE}
        for lo, hi in BANKS4 if seg4 else []:
            if all(lo + o < hi and parse_dl(lo + o, {1: SEG1_BASE, 4: lo})['ended'] for o in seg4): bases[4] = lo; break
        at = lambda v: bases[v >> 24] + (v & 0xFFFFFF)
        sym = lambda v: 'D_%08X_%X' % (v, at(v))
        dls = {e[0] for _, _, ev in calls for e in ev if e[0] >> 24 in bases}
        for v in consts:
            if v is not None and v not in dls and v >> 24 in bases:
                d = parse_dl(at(v), bases)
                if d['ended'] and d['len_cmds'] > 1: dls.add(v)
        joint_calls = {}
        for _, _, ev in calls:
            for dl, a0, a1, m in ev: joint_calls.setdefault(dl, []).append(f'{_num(a0)} {_num(a1)} | mirror={m}')
        dfs = [{'name': 'func_%08X_%X' % (lo - OVA_ROM + OVA_VRAM, lo), 'line': None, 'section': sec,
                'events': [{'t': 'part', 'line': None, 'joints': [_num(a0), _num(a1)], 'scale': None, 'mirror': str(m), 'dl': sym(dl)}
                           for dl, a0, a1, m in ev if dl >> 24 in bases]} for lo, sec, ev in calls]
        parts = []
        for v in sorted(dls, key=at):
            d = parse_dl(at(v), bases)
            d.update({'symbol': sym(v), 'seg': v >> 24, 'rom': at(v), 'joint_calls': joint_calls.get(v, []),
                      'sections': sorted({f['section'] for f in dfs if f['section'] for e in f['events'] if e['dl'] == sym(v)})})
            parts.append(d)
        sections = list(dict.fromkeys(sec for _, sec, _ in calls if sec))
        result[name] = {'file': None, 'seg_bases': {k: hex(v) for k, v in bases.items()}, 'parts': parts, 'variants': variants,
                        'sections': sections, 'draw_funcs': dfs,
                        'palette': sorted({c2['rgba'] for p in parts if p['ended'] for c2 in p['primcolors']})}
    return result
