#!/usr/bin/env python3
"""Make golden vectors for tests/test_deform_parity.js using the REAL builder (tools/make_animal_mods.py). Synthetic geometry only.
   python tests/make_deform_golden.py [path/to/make_animal_mods.py] > tests/deform_golden.json"""
import sys, json, random, struct, importlib.util
p = sys.argv[1] if len(sys.argv) > 1 else 'tools/make_animal_mods.py'
spec = importlib.util.spec_from_file_location('mam', p); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
rng = random.Random(20261029); cases = []
def rop():
    t = rng.choice(['taper', 'twist', 'bend', 'inflate']); ax = rng.choice('xyz'); r0 = rng.choice([0, 0, 0.2, 0.4]); r1 = rng.choice([1, 1, 0.8, 0.7])
    op = {'type': t}
    if t != 'inflate' or rng.random() < .5: op['axis'] = ax
    if rng.random() < .5: op['range'] = [r0, r1]
    if t == 'taper': op.update({'from': round(rng.uniform(.3, 1.5), 2), 'to': round(rng.uniform(.3, 1.5), 2)})
    if t == 'twist': op['degrees'] = rng.choice([-90, -30, 15, 45, 120])
    if t == 'bend': op.update({'toward': rng.choice([c for c in 'xyz' if c != ax]) if rng.random() < .5 else '-' + rng.choice([c for c in 'xyz' if c != ax]), 'degrees': rng.choice([-60, -20, 15, 45, 90])})
    if t == 'inflate':
        op['amount'] = round(rng.uniform(.5, 2.2), 2)
        if rng.random() < .5: op['axes'] = rng.sample(['x', 'y', 'z'], rng.randint(1, 3))
    return op
for _ in range(400):
    n = rng.randint(2, 40); verts = [[rng.randint(-300, 300), rng.randint(-300, 300), rng.randint(-300, 300)] for _ in range(n)]
    entry = {'ops': [rop() for _ in range(rng.randint(1, 3))]}
    if rng.random() < .3: entry['about'] = [rng.randint(-50, 50) for _ in range(3)]
    buf = bytearray(0x100 + 16 * n)
    for k, v in enumerate(verts): buf[0x100 + 16 * k:0x100 + 16 * k + 6] = struct.pack('>hhh', *v)
    try:
        ch, b0, b1, clip = m.plan_deform(buf, {'symbol': 'S', 'groups': [{'rom': 0x100, 'n': n, 'bbox': None}]}, entry, {}, 't')
    except SystemExit as e: cases.append({'verts': verts, 'entry': entry, 'error': True}); continue
    cases.append({'verts': verts, 'entry': entry, 'out': [nv for _, nv in ch], 'clamped': clip})
json.dump(cases, sys.stdout)
