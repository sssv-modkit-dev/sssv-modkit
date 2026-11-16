"""Minimap textures for the Classic+ minimap, generated from the user's own ROM (stdlib only; runs in the browser builder).

minimaps(rom) -> bytes: for each of the 35 levels, a 64 x 96 CI4 texture (3072 B, high nibble = left texel) followed by
a 32-byte RGBA5551 palette (TLUT); 3104 bytes per level, 108640 in total. One texel covers 64 x 64 world units:
col = (x - 256) / 64, row = (6656 - y) / 64. Colour classes come from the ground polygons of each level (water flags,
height bands, steep faces as rock, a shore band next to water) and exit pads are marked with a ring. Gaps in the ground
data (cliff faces, ledges, chasms up to 6 texels across) and holes enclosed by ground are drawn as rock; index 0 (outside
the level) is opaque and matches the minimap backing, so no texel is see-through. Nothing from the
game is stored here: the picture is drawn from the level geometry in the ROM it is given.
"""
import math
import struct

import level_rnc as rnc
from build_levels import TABLE, split_chunks

TW, TH, UPT, X0, Y1, SS = 64, 96, 64, 256, 6656, 4
COLORS = ['101820', '287FC8', 'C6B878', 'E8D49C', '315C38', '427747',
          '599451', '79AE61', 'A0BC78', '9FA886', '687783', '89959C',
          'B1BBC0', 'D7DDDA', '101820', 'F7F1C8']
LEVELS = 35
RECORD = TW * TH // 2 + 32


def _rgba5551(hex_colour, index):
    r, g, b = bytes.fromhex(hex_colour)
    return (r >> 3) << 11 | (g >> 3) << 6 | (b >> 3) << 1 | 1      # all opaque (index 0 = backing colour)


TLUT = b''.join(struct.pack('>H', _rgba5551(c, i)) for i, c in enumerate(COLORS))


def _polygon(buf, points, value):
    """Fill a polygon on the supersampled grid with inclusive integer scanlines."""
    width = TW * SS
    for y in range(max(0, math.ceil(min(p[1] for p in points))),
                   min(TH * SS - 1, math.floor(max(p[1] for p in points))) + 1):
        hits = []
        for (ax, ay), (bx, by) in zip(points, points[1:] + points[:1]):
            if ay == by:
                if y == ay:
                    hits.extend((ax, bx))
            elif min(ay, by) <= y <= max(ay, by):
                hits.append(ax + (y - ay) * (bx - ax) / (by - ay))
        if hits:
            lo = max(0, math.ceil(min(hits)))
            hi = min(width - 1, math.floor(max(hits)))
            if hi >= lo:
                buf[y * width + lo:y * width + hi + 1] = bytes([value]) * (hi - lo + 1)


def _ground(data):
    """Ground polygons (0x34-byte records): u16 flags, u8, u8, then 3 or 4 vertices of 12 bytes; 24 blocks."""
    blocks, current, p = [], [], 0
    while len(blocks) < 24 and p + 0x34 <= len(data):
        flags = struct.unpack_from('>H', data, p)[0]
        verts = []
        for k in range(3 if flags & 1 else 4):
            _, _, _, _, _, x, z, y, _ = struct.unpack_from('>hhBBBBhBB', data, p + 4 + 12 * k)
            verts.append((x, y, z))
        current.append((flags, verts))
        p += 0x34
        if flags & 2:
            blocks.append(current)
            current = []
    return blocks


def _chunks(rom, level):
    start = struct.unpack_from('>I', rom, TABLE + 8 * (level - 1))[0]
    body, _ = rnc.unpack(rom, start)
    chunks, _ = split_chunks(body)
    out = {}
    for cid, _, data in chunks:
        out.setdefault(cid, data)
    return out


def level_texture(rom, level):
    ch = _chunks(rom, level)
    tris = []
    for bi, block in enumerate(_ground(ch[10])):
        c, r = bi % 4, bi // 4
        for flags, verts in block:
            points = [(x * 64 + c * 1024 + 256, y * 64 + r * 1024 + 512, z * 8) for x, y, z in verts]
            water = bool(flags & (0x10 | 0x20 | 0x200 | 0x8000))
            for ids in ([(0, 1, 2)] if len(points) == 3 else [(0, 1, 2), (1, 3, 2)]):
                tris.append(([points[i] for i in ids], water))
    zs = [v[2] for t, _ in tris for v in t]
    zl, zh = min(zs), max(zs)
    big = bytearray(TW * TH * SS * SS)
    for tri, water in sorted(tris, key=lambda q: sum(v[2] for v in q[0])):
        h = (sum(v[2] for v in tri) / 3 - zl) / max(1, zh - zl)
        (ax, ay, az), (bx, by, bz), (cx, cy, cz) = tri
        nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
        ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
        nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        n = max(1e-6, (nx * nx + ny * ny + nz * nz) ** .5)
        lit = abs(nz) / n * .55 + max(0, (-nx + ny) / n) * .45 if nz else .5
        shade = min(1, (.35 + .45 * h) * (.6 + .6 * lit))
        idx = 1 if water else (10 + min(3, int(h * 4)) if abs(nz) / n < .65 else 4 + min(5, int(max(0, (shade - .21) / .75) * 6)))
        _polygon(big, [((x - X0) * SS / UPT, (Y1 - y) * SS / UPT) for x, y, z in tri], idx)
    grid = []
    for r in range(TH):
        for c in range(TW):
            samples = [big[(r * SS + dy) * TW * SS + c * SS + dx] for dy in range(SS) for dx in range(SS)]
            covered = [v for v in samples if v]
            inside = len(covered) / 16 > .35 and c not in (0, TW - 1) and r not in (0, TH - 1)
            grid.append(max(set(covered), key=lambda v: (covered.count(v), v)) if inside else 0)
    original = grid[:]
    for r in range(1, TH - 1):
        for c in range(1, TW - 1):
            if not 4 <= original[r * TW + c] <= 9:
                continue
            distance = min((abs(dx) + abs(dy) for dy in range(-2, 3) for dx in range(-2, 3)
                            if abs(dx) + abs(dy) <= 2 and 0 <= c + dx < TW and 0 <= r + dy < TH
                            and original[(r + dy) * TW + c + dx] == 1), default=3)
            if distance < 3:
                grid[r * TW + c] = 2 if distance == 1 else 3
    _fill_gaps(grid)
    d0 = ch.get(0, bytes(2))
    for i in range(struct.unpack_from('>H', d0)[0]):
        kind, ex, ey, _ = struct.unpack_from('>Hhhh', d0, 2 + i * 22)
        if kind & 255 == 56:
            ec, er = int((ex - X0) // UPT), int((Y1 - ey) // UPT)
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    c, r = ec + dc, er + dr
                    if 1 <= c < TW - 1 and 1 <= r < TH - 1:
                        grid[r * TW + c] = 14 if max(abs(dr), abs(dc)) in (0, 2) else 15
    return bytes((grid[i] << 4) | grid[i + 1] for i in range(0, len(grid), 2))


GAP, ROCK = 6, 11


def _fill_gaps(grid):
    """Rock where the ground data has no top surface but the player sees ground or wall: holes not connected to the
    map border, and runs of up to GAP empty texels with ground on both sides (horizontally or vertically)."""
    outside, todo = set(), [i for i in range(TW * TH) if not grid[i] and (i % TW in (0, TW - 1) or i // TW in (0, TH - 1))]
    while todo:
        i = todo.pop()
        if i in outside or grid[i]:
            continue
        outside.add(i)
        c, r = i % TW, i // TW
        todo += [j for j, ok in ((i - 1, c > 0), (i + 1, c < TW - 1), (i - TW, r > 0), (i + TW, r < TH - 1)) if ok]
    original = grid[:]
    for r in range(1, TH - 1):
        for c in range(1, TW - 1):
            i = r * TW + c
            if original[i]:
                continue
            if i not in outside:
                grid[i] = ROCK
                continue
            for dc, dr in ((1, 0), (0, 1)):
                span = [k for k in range(-GAP, GAP + 1) if 0 <= c + k * dc < TW and 0 <= r + k * dr < TH]
                before = any(original[(r + k * dr) * TW + c + k * dc] for k in span if k < 0)
                after = any(original[(r + k * dr) * TW + c + k * dc] for k in span if k > 0)
                if before and after and _run(original, c, r, dc, dr) <= GAP:
                    grid[i] = ROCK
                    break


def _run(grid, c, r, dc, dr):
    """Length of the empty run through (c, r) along (dc, dr)."""
    n = 1
    for s in (1, -1):
        x, y = c + s * dc, r + s * dr
        while 0 <= x < TW and 0 <= y < TH and not grid[y * TW + x]:
            n += 1; x += s * dc; y += s * dr
    return n


def minimaps(rom, progress=None):
    out = bytearray()
    for level in range(1, LEVELS + 1):
        if progress:
            progress(level, LEVELS)
        out += level_texture(rom, level) + TLUT
    assert len(out) == LEVELS * RECORD
    return bytes(out)
