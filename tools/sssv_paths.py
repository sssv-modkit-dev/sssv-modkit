"""Portable path config for the SSSV tools (Windows / Linux / macOS).
ROM lookup order: env SSSV_ROM, then sssv.z64 in the current folder, next to the scripts, one folder up, or in a rom\\ folder
(cwd or one folder up); last resort: the first .z64 in those rom\\ folders whose SHA1 matches the unmodified US 1.0 ROM.
JSON data files (dls2.json, vruns.json, ...) are expected next to the scripts.
Outputs (rnc_blocks/, inner/, src_us/ ...) go into the current working directory."""
import os, sys, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
ROM_NAME = 'sssv.z64'
US10_SHA1 = 'e5e09205aa743a9e5043a42df72adc379c746b0b'
def find_rom():
    rom_dirs = [os.path.join(os.getcwd(), 'rom'), os.path.join(HERE, '..', 'rom')]
    cands = [os.environ.get('SSSV_ROM'), os.path.join(os.getcwd(), ROM_NAME), os.path.join(HERE, ROM_NAME),
             os.path.join(HERE, '..', ROM_NAME)] + [os.path.join(d, ROM_NAME) for d in rom_dirs]
    for c in cands:
        if c and os.path.isfile(c): return c
    for d in rom_dirs:
        if not os.path.isdir(d): continue
        for f in sorted(os.listdir(d)):
            p = os.path.join(d, f)
            if f.lower().endswith('.z64') and os.path.isfile(p) and os.path.getsize(p) == 0x800000:
                with open(p, 'rb') as fh:
                    if hashlib.sha1(fh.read()).hexdigest() == US10_SHA1: return p
    raise FileNotFoundError(f"ROM not found. Set SSSV_ROM=<path to your US 1.0 .z64> or put it in rom\\ (or name it {ROM_NAME}).")
ROM = find_rom()
def data(name): return os.path.join(HERE, name)
