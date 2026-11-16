"""Render 32x32 RGBA HUD heads from a US 1.0 ROM, using numpy and Pillow.

icons(rom) returns an insertion-ordered dict in ICON_NAMES order. Geometry,
colours and eye texels are read only from the supplied big-endian ROM. The
adjacent JSON contains part ROM offsets and framing/assembly instructions.
"""
import json
import math
import struct
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from web_build import derive_table
from romio import US10_SIZE

ICON_NAMES = (
    'evo', 'evo_chip', 'bear', 'camel', 'chameleon', 'desert_fox', 'dog',
    'elephant', 'fox', 'frog', 'gorilla', 'hippo', 'husky', 'hyena', 'lion',
    'mouse', 'parrot', 'penguin', 'polar_bear', 'rat', 'scorpion', 'seagull',
    'sheep', 'tortoise', 'vulture', 'walrus',
)
AX = {'+x': (1, 0, 0), '-x': (-1, 0, 0), '+y': (0, 1, 0),
      '-y': (0, -1, 0), '+z': (0, 0, 1), '-z': (0, 0, -1)}


def _view_rot(snout, up, yaw_deg=45, pitch_deg=14, roll_deg=0):
    u = np.array(AX[up], float)
    s = np.array(AX[snout], float)
    f = np.cross(u, s)
    R = np.array([np.cross(u, f), u, f])
    r = math.radians(roll_deg)
    Rz = np.array([[math.cos(r), -math.sin(r), 0],
                   [math.sin(r), math.cos(r), 0], [0, 0, 1]])
    R = Rz @ R
    best = None
    for sign in (1, -1):
        a, b = math.radians(sign * yaw_deg), math.radians(pitch_deg)
        Ry = np.array([[math.cos(a), 0, -math.sin(a)], [0, 1, 0],
                       [math.sin(a), 0, math.cos(a)]])
        Rx = np.array([[1, 0, 0], [0, math.cos(b), math.sin(b)],
                       [0, -math.sin(b), math.cos(b)]])
        M = Rx @ Ry @ R
        sv = M @ s
        if best is None or sv[2] > best[0]:
            best = (sv[2], M)
    return best[1]


def _bbox(tris):
    P = np.array([v[:3] for t in tris for v in t], float)
    return P.min(0), P.max(0)


def _render(tris, R):
    """Painter's depth order, vertex lighting and an eightfold antialiased outline."""
    size, scale, margin = (32, 32), 8, .85
    P = np.array([[v[:3] for v in t] for t in tris], float) @ R.T
    N = np.array([[v[3:6] for v in t] for t in tris], float) @ R.T
    C = np.array([[v[6] if v[6] != (200, 200, 200) else (170, 160, 150)
                   for v in t] for t in tris], float)
    xy = P[..., :2] * np.array([1, -1])
    lo, hi = xy.min((0, 1)), xy.max((0, 1))
    w, h = size
    f = min(w * margin / max(hi[0] - lo[0], 1), h * margin / max(hi[1] - lo[1], 1))
    S = ((xy - (lo + hi) / 2) * f + np.array(size) / 2) * scale
    L = np.array((-.45, -.55, .7), float)
    L /= np.linalg.norm(L)
    nn = N / np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-6)
    sh = .5 + .5 * np.maximum(0, nn @ L)
    col = np.clip(C * sh[..., None], 0, 255)
    img = Image.new('RGBA', (w * scale, h * scale))
    d = ImageDraw.Draw(img)
    for i in np.argsort(P[..., 2].mean(1)):
        d.polygon([tuple(q) for q in S[i]],
                  fill=tuple(int(x) for x in col[i].mean(0)) + (255,))
    a = img.getchannel('A').filter(ImageFilter.MaxFilter(2 * scale + 1))
    o = Image.new('RGBA', img.size, (19, 21, 26, 0))
    o.putalpha(a)
    o.alpha_composite(img)
    return o.resize(size, Image.Resampling.LANCZOS)


class _Renderer:
    def __init__(self, rom, table):
        self.rom, self.table = rom, table

    def _unpack(self, fmt, offset):
        if offset < 0 or offset + struct.calcsize(fmt) > len(self.rom):
            raise ValueError('Head data extends beyond the ROM')
        return struct.unpack_from(fmt, self.rom, offset)

    def _walk(self, offset, bases):
        """Decode F3DEX vertices, primitive colours, triangles and nested lists."""
        def seg(a):
            base = bases.get(a >> 24)
            return None if base is None else base + (a & 0xffffff)

        tris, vb, stack = [], [None] * 32, []
        prim = (200, 200, 200)
        for _ in range(20000):
            w0, w1 = self._unpack('>II', offset)
            offset += 8
            op = w0 >> 24
            if op == 0xB8:
                if stack:
                    offset = stack.pop()
                    continue
                return tris
            if op == 0x04:
                cnt, v0, b = (w0 >> 10) & 0x3f, (w0 >> 16) & 0xff, seg(w1)
                if b is None:
                    vb = [None] * 32
                    continue
                for i in range(cnt):
                    if v0 + i >= 32:
                        continue
                    x, y, z, _, _, _, r, g, bb, _ = self._unpack('>hhhhhhBBBB', b + 16 * i)
                    if max(abs(x), abs(y), abs(z)) > 400:
                        vb[v0 + i] = None
                        continue
                    sg = lambda c: (c - 256 if c > 127 else c) / 127
                    vb[v0 + i] = (x, y, z, sg(r), sg(g), sg(bb), prim)
            elif op in (0xBF, 0xB1):
                for word in ([w1] if op == 0xBF else [w0, w1]):
                    ids = [((word >> s) & 0xff) // 2 for s in (16, 8, 0)]
                    t = [vb[k] if k < 32 else None for k in ids]
                    if None not in t:
                        tris.append(t)
            elif op == 0x06:
                b = seg(w1)
                if b is None:
                    continue
                if (w0 >> 16) & 0xff == 1:
                    offset = b
                elif len(stack) < 10:
                    stack.append(offset)
                    offset = b
            elif op == 0xFA:
                prim = ((w1 >> 24) & 255, (w1 >> 16) & 255, (w1 >> 8) & 255)
        raise ValueError('Head display list exceeded the command limit')

    def _part(self, key, offset):
        e = self.table[key]
        bases = {int(k): int(v, 16) for k, v in e['seg_bases'].items()}
        p = next((p for p in e['parts'] if p['rom'] == offset), None)
        if p is None:
            # The chip's segment-1 lists are not called by the animal draw
            # functions indexed by derive_table. Resolve their ROM offsets
            # directly with that table's segment-1 base and the same parser.
            if key != 'evo_microchip' or offset not in (0x3E590, 0x3E660):
                raise ValueError(f'Head part {offset:#x} missing for {key}')
            tris = self._walk(offset, bases)
            # Recover the first primitive colour from commands, even when it
            # follows a vertex load (the fallback colour follows list order).
            pc = []
            for i in range(600):
                w0, w1 = self._unpack('>II', offset + i * 8)
                if w0 >> 24 == 0xFA:
                    pc.append(((w1 >> 24) & 255, (w1 >> 16) & 255, (w1 >> 8) & 255))
                if w0 >> 24 == 0xB8:
                    break
        else:
            tris = self._walk(offset, bases)
            pc = [tuple(int(c['rgba'][k:k + 2], 16) for k in (0, 2, 4))
                  for c in p['primcolors']]
        return tris, pc

    def _coloured(self, key, offset, fb_override=None, mirror=None):
        tris, pc = self._part(key, offset)
        rgbs = [tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
                for c in self.table[key]['palette']
                if c not in ('000000FF', 'FFFFFFFF', '141414FF')]
        fb = (tuple(fb_override) if fb_override else pc[0] if pc else
              min(rgbs, key=lambda q: max(q) - min(q) - .2 * sum(q) / 3)
              if rgbs else (170, 160, 150))
        if mirror == 'y':
            tris = [[(v[0], -v[1], v[2], v[3], -v[4], v[5], v[6]) for v in t] for t in tris]
        return [[v[:6] + (fb if v[6] == (200, 200, 200) else v[6],) for v in t] for t in tris]

    def _head(self, name, s):
        key = s.get('src', name)
        main = []
        for p in s['parts']:
            main += self._coloured(key, p, s.get('fb'))
        if 'thin' in s:
            keep = []
            for t in main:
                P = np.array([v[:3] for v in t], float)
                a = np.linalg.norm(np.cross(P[1] - P[0], P[2] - P[0])) / 2
                e = max(np.linalg.norm(P[i] - P[(i + 1) % 3]) for i in range(3))
                if a / max(e * e, 1e-9) >= s['thin']:
                    keep.append(t)
            main = keep
        if 'crop' in s:
            u = np.array(AX[s['up']], float)
            c = np.array([np.mean([np.dot(v[:3], u) for v in t]) for t in main])
            lo, hi = c.min(), c.max()
            main = [t for t, x in zip(main, c) if x >= hi - s['crop'] * (hi - lo)]
        lo, hi = _bbox(main)
        ctr = (lo + hi) / 2
        sv, uv = np.array(AX[s['snout']], float), np.array(AX[s['up']], float)
        tris = list(main)
        for e in s.get('extras', []):
            ex = self._coloured(key, e['part'], e.get('fb'), e.get('mirror'))
            elo, ehi = _bbox(ex)
            ectr = (elo + ehi) / 2
            if e.get('at') == 'abs':
                off = ctr - ectr + np.array(e['shift'], float)
            else:
                axis = sv if e.get('at', 'front') == 'front' else uv
                half_main = np.dot(hi - lo, np.abs(axis)) / 2
                half_ex = np.dot(ehi - elo, np.abs(axis)) / 2
                target = ctr + axis * (half_main + e.get('k', 0.0) * half_ex)
                off = target - ectr + np.array(e.get('shift', [0, 0, 0]), float)
            tris += [[(v[0] + off[0], v[1] + off[1], v[2] + off[2]) + v[3:]
                      for v in t] for t in ex]
        rules = s.get('remap', {})
        out = []
        for t in tris:
            nt = []
            for v in t:
                c = v[6]
                if 'dark' in rules and max(c) < 60:
                    c = tuple(rules['dark'])
                if 'all' in rules:
                    c = tuple(rules['all'])
                nt.append(v[:6] + (c,))
            out.append(nt)
        return out

    def _quad(self, offset, bases):
        vs = []
        for i in range(40):
            w0, w1 = self._unpack('>II', offset + i * 8)
            if w0 >> 24 == 0xB8:
                break
            if w0 >> 24 == 0x04:
                b = bases[w1 >> 24] + (w1 & 0xffffff)
                for j in range((w0 >> 10) & 0x3f):
                    x, y, z, _, u, v = self._unpack('>hhhhhh', b + 16 * j)
                    vs.append((x, y, z, u, v))
        return vs

    def _texture(self, texture):
        palette = []
        for i in range(16):
            v, = self._unpack('>H', texture['palette'] + i * 2)
            palette.append(((v >> 11 & 31) * 255 // 31, (v >> 6 & 31) * 255 // 31,
                            (v >> 1 & 31) * 255 // 31, v & 1))
        o = texture['image']
        data = self._unpack('>128B', o)
        return [[palette[(data[(r * 16 + c) // 2] >> (4 if c % 2 == 0 else 0)) & 15]
                 for c in range(16)] for r in range(16)]

    def _eyes(self, name, s, head, R):
        if not s.get('eyes', True):
            return []
        e = self.table[s.get('src', name)]
        by_symbol = {p['symbol']: p for p in e['parts']}
        joints, eye_parts = set(), {}
        for f in e['draw_funcs']:
            loaded = None    # eye texture still bound from an earlier draw in this function
            for ev in f['events']:
                if ev['t'] != 'part' or ev['dl'] not in by_symbol:
                    continue
                p = by_symbol[ev['dl']]
                j = tuple(int(v.rstrip('U'), 0) for v in ev['joints'])
                if p['rom'] in s['parts']:
                    joints.add(j)
                if 'texture' in p:
                    loaded = p['texture']
                    eye_parts.setdefault(p['rom'], (p, j))
                elif loaded and s.get('inherit_eyes') and p['rom'] in s['inherit_eyes']:
                    eye_parts.setdefault(p['rom'], (dict(p, texture=loaded), j))
        bases = {int(k): int(v, 16) for k, v in e['seg_bases'].items()}
        Lm = R.T @ (np.array((-.45, -.55, .7)) / np.linalg.norm((-.45, -.55, .7)))
        out = []
        for p, j in eye_parts.values():
            if joints and j not in joints and tuple(reversed(j)) not in joints:
                continue
            vs = self._quad(p['rom'], bases)
            if joints and j not in joints:
                vs = [(-x, y, -z, u, v) for x, y, z, u, v in vs]
            if len(vs) < 4:
                continue
            P, UV = np.array([v[:3] for v in vs], float), np.array([v[3:] for v in vs], float)
            lo, hi = UV.min(0), UV.max(0)
            if (hi - lo).min() <= 0:
                continue
            uv = (UV - lo) / (hi - lo)
            corner = lambda cu, cv: P[np.argmin(((uv - (cu, cv)) ** 2).sum(1))]
            c00, c10, c11, c01 = corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)
            nrm, view = np.cross(c10 - c00, c01 - c00), R[2]
            if abs(np.dot(nrm, view)) / max(np.linalg.norm(nrm), 1e-6) < .2:
                continue
            ctr = P.mean(0)
            hb = _bbox(head)
            hc = (hb[0] + hb[1]) / 2
            if np.dot(ctr - hc, view) < 0:
                continue
            tex = self._texture(p['texture'])
            bias = view * .35 * np.linalg.norm(hb[1] - hb[0])
            pt = lambda a, b: (c00 + (c10 - c00) * a + (c01 - c00) * b
                               + (c11 - c10 - c01 + c00) * a * b + bias)
            for r in range(16):
                for c in range(16):
                    col = tex[r][c]
                    if not col[3]:
                        continue
                    q = [pt(c / 16, r / 16), pt((c + 1) / 16, r / 16),
                         pt((c + 1) / 16, (r + 1) / 16), pt(c / 16, (r + 1) / 16)]
                    V = [tuple(v) + tuple(Lm) + (col[:3],) for v in q]
                    out += [[V[0], V[1], V[2]], [V[0], V[2], V[3]]]
        return out


def icons(rom):
    """Return all ICON_NAMES as 32x32 RGBA Pillow images; never modify rom.

    Input is an 8 MiB big-endian US 1.0 ROM (edits to model data are allowed).
    Package heads_spec.json beside this module when loading it in Python.
    """
    rom = bytes(rom)
    if len(rom) != US10_SIZE or rom[:4] != b'\x80\x37\x12\x40':
        raise ValueError('Heads require an 8 MiB big-endian US 1.0 ROM')
    spec = json.loads(Path(__file__).with_name('heads_spec.json').read_text(encoding='utf-8'))
    renderer = _Renderer(rom, derive_table(rom))
    result = {}
    for name in ICON_NAMES:
        s = spec[name]
        R = _view_rot(s['snout'], s['up'], s.get('yaw', 45), s.get('pitch', 14), s.get('roll', 0))
        head = renderer._head(name, s)
        result[name] = _render(head + renderer._eyes(name, s, head, R), R)
    return result
