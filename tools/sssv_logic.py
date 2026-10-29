#!/usr/bin/env python3
"""sssv_logic.py - stage-shuffle logic checker / generator (pure Python, no ROM needed).

Model (deliberately tiny):  animals have abilities; a stage NEEDS abilities to be cleared and PROVIDES the animals found
inside it; clearing a stage can also GRANT animals/abilities that stay unlocked; doors in the hub lead to stage slots.
A shuffle is valid when, starting from the start loadout, repeatedly clearing every stage whose needs are met
(from owned + provided animals) eventually clears the goal stage.  A door may only open after other doors' stages are cleared ("after"), which is what makes the ORDER matter (progression chain).

  python tools/sssv_logic.py examples/logic_example.json --seed 7        generate a valid shuffle, print spheres
  python tools/sssv_logic.py examples/logic_example.json --check A.json  check an assignment {"door":"stage",...}
  python tools/sssv_logic.py examples/logic_example.json --count 1000    how many of 1000 random shuffles are valid (difficulty feel)
Logic file: {"start_animals":[...], "animals":{name:[abilities]}, "goal":"stage", "doors":["d1",{"id":"d2","after":["d1"]},...],
             "stages":{name:{"needs":[...], "provides":[...], "grants":[...]}}}"""
import sys, json, random, argparse

def abilities(logic, animals): return {ab for a in animals for ab in logic['animals'].get(a, [])}

def door_ids(logic): return [d if isinstance(d, str) else d['id'] for d in logic['doors']]
def door_after(logic): return {(d if isinstance(d, str) else d['id']): set([] if isinstance(d, str) else d.get('after', [])) for d in logic['doors']}

def spheres(logic, assign):
    """-> list of lists of 'door:stage' cleared per sphere; the shuffle is valid iff the goal stage is among them."""
    owned = set(logic['start_animals']); left = dict(assign); after = door_after(logic); done = set(); out = []
    while True:
        now = []
        for door, st in list(left.items()):
            s = logic['stages'][st]
            if after[door] <= done and set(s.get('needs', [])) <= abilities(logic, owned | set(s.get('provides', []))): now.append((door, st)); del left[door]
        if not now: return out
        for door, st in now: owned |= set(logic['stages'][st].get('grants', [])); done.add(door)
        out.append(sorted(f'{d}:{st}' for d, st in now))

def valid(logic, assign): return any(x.endswith(':' + logic['goal']) for sp in spheres(logic, assign) for x in sp)

def validate_logic(logic):
    st = set(logic['stages']); assert logic['goal'] in st, 'goal is not a stage'
    assert len(door_ids(logic)) == len(st), 'need exactly one door per stage'
    for n, s in logic['stages'].items():
        for key in ('provides', 'grants'):
            for a in s.get(key, []): assert a in logic['animals'], f'{n}: unknown animal {a}'
        for ab in s.get('needs', []): assert any(ab in v for v in logic['animals'].values()), f'{n}: nobody has ability {ab}'

def generate(logic, seed, tries=100000):
    rng = random.Random(seed); stages = list(logic['stages'])
    for _ in range(tries):
        rng.shuffle(stages); a = dict(zip(door_ids(logic), stages))
        if valid(logic, a): return a
    raise SystemExit('no valid shuffle found (logic may be unsatisfiable)')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('logic'); ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--check'); ap.add_argument('--count', type=int); a = ap.parse_args()
    L = json.load(open(a.logic)); validate_logic(L)
    if a.count:
        rng = random.Random(a.seed); st = list(L['stages']); ok = 0
        for _ in range(a.count): rng.shuffle(st); ok += valid(L, dict(zip(door_ids(L), st)))
        print(f'{ok}/{a.count} random shuffles are completable ({100 * ok / a.count:.1f}%)'); sys.exit(0)
    asg = json.load(open(a.check)) if a.check else generate(L, a.seed)
    sp = spheres(L, asg)
    for d, s in asg.items(): print(f'  {d} -> {s}')
    for i, s in enumerate(sp): print(f'sphere {i}: {", ".join(s)}')
    print('VALID' if valid(L, asg) else 'NOT COMPLETABLE'); sys.exit(0 if valid(L, asg) else 1)
