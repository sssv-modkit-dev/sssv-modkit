#!/usr/bin/env python3
"""Generate (or check) ROM-free golden build fixtures: python tests/make_build_fixtures.py [--write].

Every input ROM is synthetic: a formula fill plus explicit hex writes. Nothing comes from the real game.
Format: tests/fixtures/builds/README.md. Without --write the script compares against the stored file."""
import hashlib
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'src'))
import build_levels as levels          # noqa: E402
import level_rnc_pack as packer        # noqa: E402
import make_animal_mods as animals     # noqa: E402
import romio                           # noqa: E402

OUT = ROOT / 'tests' / 'fixtures' / 'builds' / 'builds.json'
IPS_HEX_LIMIT = 2048


def lcg_bytes(seed, n):
    out, x = bytearray(), seed
    for _ in range(n):
        x = (x * 1103515245 + 12345) & 0x7FFFFFFF
        out.append((x >> 16) & 0xFF)
    return bytes(out)


def make_rom(spec):
    """fill: byte[i] = (i*mul + add) & 0xFF, then writes in order (hex at offset)."""
    f = spec['fill']
    rom = bytearray((i * f['mul'] + f['add']) & 0xFF for i in range(spec['size']))
    for w in spec['writes']:
        data = bytes.fromhex(w['hex'])
        rom[w['offset']:w['offset'] + len(data)] = data
    return bytes(rom)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def outputs(rom, ips):
    out = {'rom_size': len(rom), 'rom_sha256': sha256(rom), 'ips_size': len(ips), 'ips_sha256': sha256(ips)}
    if len(ips) <= IPS_HEX_LIMIT:
        out['ips_hex'] = ips.hex()
    return out


def level_case():
    """Spawn moves/adds in two levels; level 1 fits its slot, level 2 has none spare and relocates."""
    def slot_body(seed, nprops, nanimals):
        props = struct.pack('>H', nprops) + lcg_bytes(seed, 22 * nprops)
        anim = struct.pack('>H', nanimals) + lcg_bytes(seed + 1, 16 * nanimals)
        return (b'\x00' + packer.pack_best(props) + b'\x01' + struct.pack('>I', len(anim)) + anim
                + b'\x03' + lcg_bytes(seed + 2, 40))
    writes = [{'offset': 0, 'hex': '80371240'}, {'offset': 0x3B, 'hex': b'NSVE'.hex()}]
    for level, seed, nprops, start, spare in ((1, 11, 12, 0x100000, 96), (2, 23, 9, 0x110000, 0)):
        packed = packer.pack_best(slot_body(seed, nprops, 4))
        size = len(packed) + spare
        writes.append({'offset': start, 'hex': (packed + bytes(spare)).hex()})
        writes.append({'offset': levels.TABLE + (level - 1) * 8, 'hex': struct.pack('>II', start, start + size).hex()})
    rom_spec = {'size': 0x800000, 'fill': {'mul': 7, 'add': 3}, 'writes': writes}
    stock = make_rom(rom_spec)
    moved = bytearray(lcg_bytes(11, 22 * 12)[22 * 3:22 * 4])
    struct.pack_into('>hhh', moved, 2, 1234, -567, 89)
    diff = {'format': 'sssv-editor-diff', 'version': 1, 'rom_sha1': romio.sha1(stock), 'levels': {
        '1': {'props': {'set': [{'index': 3, 'bytes': bytes(moved).hex()},
                                {'index': 7, 'bytes': lcg_bytes(99, 22).hex()}]},
              'animals': {'set': [{'index': 1, 'bytes': lcg_bytes(77, 16).hex()}]}},
        '2': {'props': {'add': [{'bytes': lcg_bytes(500 + i, 22).hex()} for i in range(40)]}}}}
    rom = levels.build(diff, stock, relocate=True)
    assert len(rom) > len(stock), 'level 2 is meant to exercise relocation'
    ips = levels.patch(stock, rom)
    return {'name': 'level-edit-relocate', 'kind': 'level-diff',
            'rom': rom_spec, 'rom_sha256': sha256(stock), 'inputs': {'diff': diff, 'relocate': True},
            'outputs': outputs(rom, ips)}


def animal_case():
    """Recolour, mesh scale/move, four deform ops and a code patch on a synthetic animal table."""
    vtx_a, vtx_b, dl, code = 0x2100, 0x2200, 0x2400, 0x3000
    writes = []
    box = [(-10, 0, 0), (10, 0, 0), (0, 20, 0), (0, 0, 30), (-8, 18, 4), (9, 3, 28), (2, 11, -6), (-5, 7, 15)]
    for i, (x, y, z) in enumerate(box):
        writes.append({'offset': vtx_a + 16 * i, 'hex': (struct.pack('>hhhH', x, y, z, 0) + b'\x01\x02\x03\xff').hex()})
    for i in range(6):
        pos = (i * 3 - 7, i * 12, 40 - i * 5)
        writes.append({'offset': vtx_b + 16 * i, 'hex': (struct.pack('>hhhH', *pos, 0) + b'\x04\x05\x06\xff').hex()})
    for k, word in enumerate((0xB03F00FF, 0xB03F00FF, 0x11223344)):
        writes.append({'offset': dl + 8 * k, 'hex': struct.pack('>II', 0xFA000000, word).hex()})
    writes.append({'offset': code, 'hex': '00000000' * 4})
    rom_spec = {'size': 0x102000, 'fill': {'mul': 13, 'add': 5}, 'writes': writes}
    base = make_rom(rom_spec)

    def part(symbol, groups, colors):
        return {'symbol': symbol, 'ended': True, 'seg': 4, 'rom': dl,
                'groups': [{'rom': r, 'n': n, 'bbox': b} for r, n, b in groups],
                'primcolors': [{'rgba': '%08X' % w, 'word_rom': dl + 8 * k + 4} for k, w in colors]}
    table = {'bear': {'parts': [part('BODY', [(vtx_a, 8, [[-10, 10], [0, 20], [-6, 30]])],
                                     [(0, 0xB03F00FF), (1, 0xB03F00FF)])]},
             'rat': {'parts': [part('TAIL', [(vtx_b, 6, [[-7, 8], [0, 60], [15, 40]])], [(2, 0x11223344)])]}}
    configs = [
        {'animal': 'bear', 'recolor': {'B03F00FF': '3A2418'},
         'mesh': [{'symbol': 'BODY', 'scale': [1.25, 0.8, 1.1], 'move': [0, 2, -3]}]},
        {'animal': 'rat', 'recolor': {'11223344': 'FF8000FF'},
         'deform': [{'symbol': 'TAIL', 'ops': [
             {'type': 'taper', 'axis': 'y', 'from': 1.0, 'to': 0.6},
             {'type': 'twist', 'axis': 'y', 'degrees': 30},
             {'type': 'bend', 'axis': 'y', 'toward': 'z', 'degrees': 25},
             {'type': 'inflate', 'amount': 1.15, 'axes': ['x', 'z']}]}]},
        {'code_patch': [{'offset': hex(code), 'expect': '00000000', 'write': '11223344', 'note': 'synthetic'}]},
    ]
    plan = animals.plan_edits(table, base, [('fixture', c) for c in configs], log=lambda s: None)
    rom, _ = animals.apply_plan(base, plan, log=lambda s: None)
    romio.fix_crc(rom)
    rom = bytes(rom)
    ips = romio.make_ips(base, rom)
    assert romio.apply_ips(base, ips) == rom
    return {'name': 'animal-parts-config', 'kind': 'animal-configs',
            'rom': rom_spec, 'rom_sha256': sha256(base), 'inputs': {'table': table, 'configs': configs},
            'outputs': outputs(rom, ips)}


def generate():
    return {'format': 'sssv-build-fixtures', 'version': 1, 'cases': [level_case(), animal_case()]}


def main():
    text = json.dumps(generate(), indent=1, sort_keys=True) + '\n'
    if '--write' in sys.argv:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(text, encoding='utf-8', newline='\n')
        print('wrote', OUT.relative_to(ROOT))
        return 0
    if not OUT.exists() or OUT.read_text(encoding='utf-8') != text:
        print('Build fixtures differ from the Python build output; review, then rerun with --write.', file=sys.stderr)
        return 1
    print('Build fixtures: %d cases match regenerated Python output.' % len(json.loads(text)['cases']))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
