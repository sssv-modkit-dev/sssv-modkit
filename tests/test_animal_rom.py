#!/usr/bin/env python3
"""Synthetic checks for src/animal_rom.py (hand-assembled MIPS, no ROM data). python tests/test_animal_rom.py"""
import os, struct, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src'))
import animal_rom as ar

def asm(words): return b''.join(struct.pack('>I', w) for w in words)
LUI = lambda rt, imm: 0x3C000000 | rt << 16 | imm
ADDIU = lambda rt, rs, imm: 0x24000000 | rs << 21 | rt << 16 | (imm & 0xFFFF)
SW_SP = lambda rt, off: 0xAC000000 | 29 << 21 | rt << 16 | off
JR_RA, NOP = 0x03E00008, 0

def fake_rom(body):
    rom = bytearray(ar.OVA_END + 16)
    code = [JR_RA, NOP, NOP] + body + [JR_RA, NOP]
    rom[ar.OVA_ROM:ar.OVA_ROM + 4 * len(code)] = asm(code)
    return bytes(rom), ar.OVA_ROM + 12

def test_call_site_args():
    body = [LUI(8, 0x0400), ADDIU(8, 8, 0x1230), SW_SP(8, 0x24),   # dl = 0x04001230
            ADDIU(9, 0, 1), SW_SP(9, 0x1C),                        # mirror = 1
            ADDIU(4, 0, 2),                                        # a0 = 2
            ar.PART_DRAW_JAL, ADDIU(5, 0, 0x14)]                   # a1 = 0x14 in the delay slot
    rom, start = fake_rom(body); c = ar.Code(rom)
    jal = start + 4 * 6
    assert c.func_range(start + 8)[0] == start
    assert c.stack_arg(jal, 0x24) == 0x04001230
    assert c.stack_arg(jal, 0x1C) == 1
    assert c.reg_arg(jal, 4) == 2 and c.reg_arg(jal, 5) == 0x14
    assert c.seg_consts(start, start + 4 * len(body)) == [0x04001230]

def test_negative_addiu_and_unknown():
    body = [LUI(8, 0x0401), ADDIU(8, 8, -0x10), 0x8C890000, ar.PART_DRAW_JAL, SW_SP(8, 0x24)]   # lw a0 = unknown
    rom, start = fake_rom(body); c = ar.Code(rom); jal = start + 12
    assert c.stack_arg(jal, 0x24) == 0x0400FFF0
    assert c.reg_arg(jal, 4) is None

def test_body_texture_loader():
    body = [LUI(4, 0x0400), ADDIU(4, 4, 0x1200),
            LUI(5, 0x0400), ADDIU(5, 5, 0x1000),
            ar.BODY_TEXTURE_JAL, NOP,
            LUI(8, 0x0400), ADDIU(8, 8, 0x2000), SW_SP(8, 0x24),
            ar.PART_DRAW_JAL, NOP]
    rom, start = fake_rom(body)
    result = ar.eye_textures(ar.Code(rom), start, start + 4 * len(body))
    resolved = ar.resolve_textures(result, {4: 0x8000})
    assert resolved[0x04002000] == dict(format='ci4', width=32, height=32, image=0x9000, palette=0x9200)
    assert ar.resolve_textures(result, {}) == {}
    body[1] = ADDIU(4, 4, 0x1220)  # unsupported image/palette relationship
    rom, start = fake_rom(body)
    assert ar.eye_textures(ar.Code(rom), start, start + 4 * len(body)) == {}

if __name__ == '__main__':
    for n, f in list(globals().items()):
        if n.startswith('test_'): f(); print('ok', n)
