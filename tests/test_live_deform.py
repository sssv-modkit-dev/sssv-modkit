#!/usr/bin/env python3
"""Compare live viewer + standalone JS with the current Python builder; no ROM or fixture writes."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True


def expected(builder, verts, entries):
    buf = bytearray(16 * len(verts))
    for i, v in enumerate(verts):
        struct.pack_into('>hhh', buf, 16 * i, *v)
    part = {'symbol': 'synthetic', 'groups': [{'rom': 0, 'n': len(verts)}]}
    clip = 0
    before = None
    for entry in entries:
        changes, b0, b1, count = builder.plan_deform(buf, part, entry, {}, 'test')
        if before is None:
            before = b0
        clip += count
        for offset, vertex in changes:
            struct.pack_into('>hhh', buf, offset, *vertex)
    return {'out': [list(struct.unpack_from('>hhh', buf, 16 * i)) for i in range(len(verts))],
            'before': before, 'after': b1, 'clamped': clip}


def main():
    # Reuse the seeded generator without rewriting its committed golden fixture.
    # Its explicit builder argument also makes this command independent of cwd.
    argv = sys.argv[:]
    sys.argv = [str(ROOT / 'tests/make_deform_golden.py'), str(ROOT / 'tools/make_animal_mods.py')]
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            generated = runpy.run_path(str(ROOT / 'tests/make_deform_golden.py'))
    finally:
        sys.argv = argv
    builder = generated['m']
    inputs = [{'name': 'seeded-%d' % i, 'verts': c['verts'], 'entries': [c['entry']]}
              for i, c in enumerate(generated['cases'])]
    verts = [[-100, -80, -30], [60, 0, 25], [110, 100, 70]]
    taper = {'type': 'taper', 'axis': 'y', 'from': 1, 'to': 0.7}
    bend = {'type': 'bend', 'axis': 'y', 'toward': '-z', 'degrees': 35}
    twist = {'type': 'twist', 'axis': 'x', 'degrees': -60}
    inflate = {'type': 'inflate', 'amount': 1.5, 'axes': ['x', 'z']}
    focused = [
        ('taper', verts, [{'ops': [taper]}]),
        ('bend', verts, [{'ops': [bend]}]),
        ('twist', verts, [{'ops': [twist]}]),
        ('inflate', verts, [{'ops': [inflate]}]),
        ('combined', verts, [{'ops': [taper, bend, inflate, twist]}]),
        ('sequential-entries', verts, [{'ops': [bend]}, {'ops': [twist, taper]}]),
        ('custom-centre', verts, [{'about': [25, -10, 5], 'ops': [twist, inflate]}]),
        ('int16-clamping', [[-32768, -1, 5], [32767, 1, -5], [0, 0, 0]],
         [{'ops': [{'type': 'inflate', 'amount': 3}]}]),
        ('half-rounding', [[-1, -1, -1], [0, 0, 0], [1, 1, 1]],
         [{'ops': [{'type': 'inflate', 'amount': 0.5}]}]),
        ('zero-span', [[1, 0, 2], [-1, 0, -2], [0, 0, 0]], [{'ops': [bend, taper]}]),
    ]
    inputs.extend({'name': n, 'verts': v, 'entries': e} for n, v, e in focused)
    for case in inputs:
        try:
            case.update(expected(builder, case['verts'], case['entries']))
        except SystemExit:
            case['error'] = True
    result = subprocess.run(['node', str(ROOT / 'tests/test_live_deform.js')],
                            input=json.dumps(inputs), text=True, cwd=ROOT)
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
