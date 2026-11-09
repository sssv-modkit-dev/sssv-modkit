#!/usr/bin/env python3
"""Record or check SHA-1s of real builds, so refactors can prove byte parity.

python tools/parity_baseline.py --rom <US ROM> --table <animal_table.json> [--check]
Writes (or compares against) tests/fixtures/parity-baseline.json. Hashes only; no game bytes are stored.
"""
import argparse, hashlib, json, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / 'tests/fixtures/parity-baseline.json'
CONFIGS = ['bear', 'bear_deform', 'dog', 'fox', 'mouse', 'rat', 'sheep']


def level_edits():
    """Level 4: move prop 3 and add one copy of it (built from the demo stock records)."""
    demo = json.loads((ROOT / 'src/web/demo/level-4.json').read_text(encoding='utf-8'))
    stock = demo['EDITOR_STOCK']['4']['props'][3]
    moved = stock[:4] + '0500' + stock[8:]
    return {'format': 'sssv-editor-diff', 'version': 1, 'rom_sha1': demo['EDITOR_SHA1'],
            'levels': {'4': {'props': {'set': [{'index': 3, 'bytes': moved}], 'add': [{'bytes': moved}]}}}}


def sha1(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()


def outputs(folder):
    return {p.suffix[1:] + '_sha1': sha1(p) for p in sorted(folder.rglob('*')) if p.suffix in ('.ips', '.z64')}


def run(command):
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        sys.exit('FAILED: %s\n%s%s' % (' '.join(map(str, command)), result.stdout, result.stderr))


def measure(rom, table):
    got = {'configs': {}, 'levels': {}}
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for name in CONFIGS:
            out = tmp / name
            run([sys.executable, 'src/make_animal_mods.py', 'configs/%s.json' % name, '--rom', rom, '--table', table, '--out', out])
            got['configs'][name] = outputs(out)
        edits = tmp / 'level-4-edits.json'
        edits.write_text(json.dumps(level_edits()), encoding='utf-8')
        out = tmp / 'levels'
        run([sys.executable, 'src/build_levels.py', edits, '--rom', rom, '--out', out])
        got['levels']['level-4-move-add'] = outputs(out)
    return got


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--rom', required=True)
    ap.add_argument('--table', required=True)
    ap.add_argument('--check', action='store_true')
    args = ap.parse_args()
    got = measure(args.rom, args.table)
    if not args.check:
        FIXTURE.write_text(json.dumps(got, indent=1, sort_keys=True) + '\n', encoding='utf-8')
        print('parity: baseline written (%d builds)' % (len(got['configs']) + len(got['levels'])))
        return 0
    want = json.loads(FIXTURE.read_text(encoding='utf-8'))
    keys = [(g, k) for g in want for k in want[g]]
    bad = [(g, k) for g, k in keys if got.get(g, {}).get(k) != want[g][k]]
    for g, k in bad:
        print('MISMATCH %s/%s: %s != %s' % (g, k, got.get(g, {}).get(k), want[g][k]))
    print('parity: %d/%d match' % (len(keys) - len(bad), len(keys)))
    return 1 if bad else 0


if __name__ == '__main__':
    raise SystemExit(main())
