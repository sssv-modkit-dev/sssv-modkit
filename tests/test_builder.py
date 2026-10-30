#!/usr/bin/env python3
"""Synthetic checks for the builder's safety rules and the IPS/CRC helpers; no ROM or table needed."""
import random
from pathlib import Path
import struct
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'tools'))
import make_animal_mods as B   # noqa: E402
import romio                   # noqa: E402

VTX_A, VTX_B, DL = 0x100, 0x200, 0x400


def fake_rom():
    rom = bytearray(0x1000)
    for i, (x, y, z) in enumerate([(-10, 0, 0), (10, 0, 0), (0, 20, 0), (0, 0, 30)]):
        struct.pack_into('>hhhH', rom, VTX_A + 16 * i, x, y, z, 0); rom[VTX_A + 16 * i + 12:VTX_A + 16 * i + 16] = b'\x01\x02\x03\xff'
    for i in range(2): struct.pack_into('>hhhH', rom, VTX_B + 16 * i, 5, 5, 5, 0)
    for k, word in enumerate((0xB03F00FF, 0xB03F00FF, 0x11223344)):     # three G_SETPRIMCOLOR commands
        struct.pack_into('>II', rom, DL + 8 * k, 0xFA000000, word)
    return rom


def part(symbol, groups, colors=()):
    return {'symbol': symbol, 'ended': True, 'seg': 4, 'rom': DL,
            'groups': [{'rom': r, 'n': n, 'bbox': [[-10, 10], [0, 20], [0, 30]]} for r, n in groups],
            'primcolors': [{'rgba': '%08X' % w, 'word_rom': DL + 8 * k + 4} for k, w in colors]}


def table():
    return {'bear': {'parts': [part('BODY', [(VTX_A, 4)], [(0, 0xB03F00FF), (1, 0xB03F00FF)])]},
            'rat': {'parts': [part('TAIL', [(VTX_B, 2)], [(2, 0x11223344)])]},
            'fox': {'parts': [part('SHARED', [(VTX_A, 2)])]}}


def plan(*cfgs, rom=None, tbl=None):
    log = []
    p = B.plan_edits(tbl or table(), bytes(rom or fake_rom()), [('test', c) for c in cfgs], log=log.append)
    return p, log


class Plan(unittest.TestCase):
    def refuses(self, text, *cfgs, **kw):
        with self.assertRaises(SystemExit) as cm: plan(*cfgs, **kw)
        self.assertIn(text, str(cm.exception))

    def test_recolor_expands_and_rgb_keeps_alpha(self):
        p, _ = plan({'animal': 'bear', 'recolor': {'B03F00FF': '00FF00'}})
        self.assertEqual(sorted(p['words']), [DL + 4, DL + 12])
        rom, _ = B.apply_plan(bytes(fake_rom()), p, log=lambda s: None)
        self.assertEqual(rom[DL + 4:DL + 8].hex().upper(), '00FF00FF')

    def test_word_checks(self):
        self.refuses('expected', {'animal': 'bear', 'words': [{'word_rom': hex(DL + 4), 'expect': 'DEADBEEF', 'new': '000000'}]})
        bad = fake_rom(); bad[DL] = 0xFB
        self.refuses('G_SETPRIMCOLOR', {'animal': 'bear', 'recolor': {'B03F00FF': '000000'}}, rom=bad)
        self.refuses('not a colour word', {'animal': 'bear', 'words': [{'word_rom': hex(DL + 20), 'expect': '11223344', 'new': '0'}]})

    def test_conflicting_word_edits_refused(self):
        tbl = table(); tbl['rat']['parts'][0]['primcolors'].append({'rgba': 'B03F00FF', 'word_rom': DL + 4})
        self.refuses('conflicting edits', {'animal': 'bear', 'recolor': {'B03F00FF': '000000'}},
                     {'animal': 'rat', 'recolor': {'B03F00FF': 'FFFFFF'}}, tbl=tbl)

    def test_shared_vertices_need_opt_in(self):
        self.refuses('allow_shared', {'animal': 'bear', 'mesh': [{'symbol': 'BODY', 'scale': [2, 2, 2]}]})
        p, _ = plan({'animal': 'bear', 'mesh': [{'symbol': 'BODY', 'scale': [2, 2, 2], 'allow_shared': True}]})
        self.assertEqual(len(p['mesh']), 1)

    def test_bad_group_index_and_missing_degrees(self):
        self.refuses('out of range', {'animal': 'rat', 'mesh': [{'symbol': 'TAIL', 'groups': [3]}]})
        p, _ = plan({'animal': 'rat', 'deform': [{'symbol': 'TAIL', 'ops': [{'type': 'twist', 'axis': 'y'}]}]})
        with self.assertRaises(SystemExit) as cm: B.apply_plan(bytes(fake_rom()), p, log=lambda s: None)
        self.assertIn('degrees', str(cm.exception))

    def test_explicit_vertex_checks(self):
        v = {'rom': hex(VTX_B), 'index': 1, 'expect': [5, 5, 5], 'new': [6, 6, 6]}
        p, _ = plan({'animal': 'rat', 'vertices': [v]})
        self.assertEqual(p['vertices'][VTX_B + 16], ('rat', [6, 6, 6], None))
        self.refuses('expected', {'animal': 'rat', 'vertices': [dict(v, expect=[0, 0, 0])]})
        self.refuses('not in any vertex group', {'animal': 'bear', 'vertices': [dict(v, rom=hex(VTX_B), allow_shared=True)]})
        self.refuses('expect_normal', {'animal': 'rat', 'vertices': [dict(v, normal=[0, 0, 0, 0])]})
        self.refuses('also moved by', {'animal': 'rat', 'vertices': [v], 'mesh': [{'symbol': 'TAIL', 'scale': [2, 2, 2]}]})

    def test_stacked_geometry_is_reported_and_dry_run_matches_build(self):
        cfg = {'animal': 'rat', 'mesh': [{'symbol': 'TAIL', 'move': [1, 0, 0]}],
               'deform': [{'symbol': 'TAIL', 'ops': [{'type': 'inflate', 'amount': 2}]}]}
        p, log = plan(cfg)
        self.assertTrue(any('several entries' in line for line in log))
        a, n = B.apply_plan(bytes(fake_rom()), p, log=lambda s: None)
        b, _ = B.apply_plan(bytes(fake_rom()), p, log=lambda s: None)
        self.assertEqual((a, n), (b, 4))
        self.assertEqual(list(struct.unpack_from('>hhh', a, VTX_B)), [6, 5, 5])


class Ips(unittest.TestCase):
    def roundtrip(self, orig, new):
        ips = romio.make_ips(orig, new)
        self.assertEqual(romio.apply_ips(orig, ips), bytes(new))
        return ips

    def test_random_edits(self):
        rng = random.Random(1); orig = bytes(rng.randrange(256) for _ in range(5000))
        new = bytearray(orig)
        for _ in range(200): new[rng.randrange(len(new))] ^= 0x5A
        self.roundtrip(orig, new)

    def test_eof_offset_and_long_runs(self):
        orig = bytes(0x480000); new = bytearray(orig)
        new[romio.IPS_EOF:romio.IPS_EOF + 0x20000] = b'\x07' * 0x20000     # starts at 'EOF', spans several hunks
        ips = self.roundtrip(orig, new)
        p = 5; offsets = []
        while ips[p:p + 3] != b'EOF':
            offsets.append(int.from_bytes(ips[p:p + 3], 'big')); p += 5 + int.from_bytes(ips[p + 3:p + 5], 'big')
        self.assertNotIn(romio.IPS_EOF, offsets)

    def test_rle_hunk_applies(self):
        ips = b'PATCH' + b'\x00\x00\x10' + b'\x00\x00' + b'\x00\x04' + b'\xAB' + b'EOF'
        self.assertEqual(romio.apply_ips(bytes(32), ips)[0x10:0x15], b'\xAB' * 4 + b'\x00')

    def test_crc_written_into_header(self):
        rom = bytearray(0x101000); rom[0x2000] = 1
        c = romio.fix_crc(rom)
        self.assertEqual(struct.unpack('>II', rom[0x10:0x18]), c)


if __name__ == '__main__':
    unittest.main(verbosity=1)
