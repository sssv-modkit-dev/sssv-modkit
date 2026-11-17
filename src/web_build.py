"""In-memory build entry for the browser builder (Pyodide worker) and its Node smoke test. Reads and writes no files.

build(rom, level=None, parts=None) runs the same code as the command-line tools, so the output bytes match:
  level only:  build_levels.py EDITS --rom ROM [--relocate] [--new-animals]
  parts only:  make_animal_mods.py CONFIG --rom ROM --table TABLE
  both:        build_levels.py PROJECT --rom ROM --table TABLE (a project's attached Parts config, or a separate one)
The animal table is derived from the given ROM (animal_table.py --from-rom); nothing ROM-derived is shipped.
strict=False skips the real-ROM identity checks so synthetic test ROMs (tests/fixtures/builds) can be built."""
import json
import struct

import animal_rom
import animal_table
import build_levels as levels
import make_animal_mods as animals
import minimap
import romio


def _document(value, what):
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        value = value.decode('utf-8-sig')
    if isinstance(value, str):
        try:
            value = json.loads(value.lstrip('﻿'))
        except ValueError as error:
            raise ValueError(f'{what} is not valid JSON ({error})') from None
    if not isinstance(value, dict):
        raise ValueError(f'{what} must be a JSON object')
    return value


# Characters drawn outside the animal draw code (New Game cutscene). Only segment addresses are listed here; the
# geometry is read from the given ROM. Located by matching the cutscene's display lists against the ROM.
EXTRA_MODELS = {
    'dan_danger': (0xC7A30, [0x04012400, 0x0400BBC0, 0x0400BF20, 0x0400CD48, 0x04010710,
                             0x04010A70, 0x04011868, 0x0400DFA0, 0x0400E750, 0x0400E920]),
    'evo_cutscene': (0xC7A30, [0x0400FE60, 0x0400EB60, 0x0400ED28, 0x0400F0A0, 0x0400F1E0,
                               0x0400F398, 0x0400F700, 0x040104C0, 0x0400EA20, 0x04010080]),
}


# Cutscene body textures: plain RGBA16 32x32 in the ROM (Dan's has its odd rows word-swapped, like the zone tile banks).
EXTRA_TEXTURES = {'dan_danger': {'format': 'rgba16', 'width': 32, 'height': 32, 'image': 0x84790, 'swap': True},
                  'evo_cutscene': {'format': 'rgba16', 'width': 32, 'height': 32, 'image': 0x6A0E0, 'swap': False}}


def extra_models(rom):
    """Table entries for EXTRA_MODELS; a model whose lists do not all parse to G_ENDDL in this ROM is left out."""
    out = {}
    for name, (base, dls) in EXTRA_MODELS.items():
        bases, parts = {4: base}, []
        for v in dls:
            d = animal_table.parse_dl(base + (v & 0xFFFFFF), bases)
            if not d['ended']:
                break
            d.update({'symbol': 'D_%08X_%X' % (v, base + (v & 0xFFFFFF)), 'seg': 4, 'rom': base + (v & 0xFFFFFF),
                      'joint_calls': [], 'sections': []})
            if name in EXTRA_TEXTURES:
                d['texture'] = dict(EXTRA_TEXTURES[name])
            parts.append(d)
        else:
            out[name] = {'file': None, 'seg_bases': {4: hex(base)}, 'parts': parts, 'variants': [], 'sections': [],
                         'draw_funcs': [], 'extra': True,
                         'palette': sorted({c['rgba'] for p in parts for c in p['primcolors']})}
    return out


OBJECT_TABLE, OBJECT_STRIDE, OBJECT_TYPES = 0x7B9BD8, 0x9C, 247   # per prop type; +4 = model display list
RESIDENT = 0x398D0                                                 # segment 1 ROM base
WORLD_BANKS = {0: 0xC7A30, 1: 0xDD5C0, 2: 0xE75B0, 3: 0xF1060, 5: 0xFFD50}   # segment 4 by level zone
STAGE_BANKS, STAGE_BANK_START = 0x7B7150, {0: 0, 1: 11, 3: 21, 2: 31, 5: 0}  # segment 5: entry start + sub - 1


def _dl_tree(addr, bases, seen, depth=0):
    """Segment addresses of a display list and every list it calls (the viewer draws each as one part)."""
    if addr in seen or depth > 6 or (addr >> 24) not in bases:
        return
    seen.append(addr)
    o = bases[addr >> 24] + (addr & 0xFFFFFF)
    for i in range(3000):
        if o + 8 * i + 8 > len(animal_table.ROM):
            return
        w0, w1 = struct.unpack_from('>II', animal_table.ROM, o + 8 * i)
        if w0 >> 24 == 0xB8:
            return
        if w0 >> 24 == 0x06:
            _dl_tree(w1, bases, seen, depth + 1)
            if (w0 >> 16) & 0xFF:
                return


def prop_models(rom):
    """Table entries for every prop type placed in a stage, with the banks that stage loads. Prop types whose model
    lives in a world or stage bank get one entry per world (prop_008_z0) or stage (prop_074_L1). Model Editor only."""
    rd = lambda o: struct.unpack_from('>I', rom, o)[0]
    model = {t: rd(OBJECT_TABLE + t * OBJECT_STRIDE + 4) for t in range(OBJECT_TYPES)}
    out = {}
    for stage in range(1, 37):
        body, _ = levels.rnc.unpack(rom, rd(levels.TABLE + (stage - 1) * 8))
        chunks = {cid: data for cid, _, data in levels.split_chunks(body)[0]}
        header, spawns = chunks[12], chunks[0]
        zone, sub = header[0x21], header[0x53]
        bases = {1: RESIDENT}
        if zone in WORLD_BANKS:
            bases[4] = WORLD_BANKS[zone]
        if zone in STAGE_BANK_START:
            start, end = struct.unpack_from('>II', rom, STAGE_BANKS + 8 * (STAGE_BANK_START[zone] + sub - 1))
            if end - start > 0x10:
                bases[5] = start
        types = sorted({struct.unpack_from('>H', spawns, 2 + 22 * i)[0] for i in range(struct.unpack_from('>H', spawns)[0])})
        for t in types:
            addr = model.get(t, 0)
            seg = addr >> 24
            if seg not in bases:
                continue
            name = 'prop_%03d' % t + {1: '', 4: '_z%d' % zone, 5: '_L%d' % stage}[seg]
            if name in out:
                continue
            seen = []
            _dl_tree(addr, bases, seen)
            parts = []
            for v in seen:
                at = bases[v >> 24] + (v & 0xFFFFFF)
                d = animal_table.parse_dl(at, bases)
                if not d['ended'] or d['bad']:
                    parts = []
                    break
                if d['tris']:
                    d.update({'symbol': 'D_%08X_%X' % (v, at), 'seg': v >> 24, 'rom': at, 'joint_calls': [], 'sections': []})
                    parts.append(d)
            if parts:
                out[name] = {'file': None, 'seg_bases': {k: hex(b) for k, b in bases.items()}, 'parts': parts,
                             'variants': [], 'sections': [], 'draw_funcs': [], 'prop': t,
                             'palette': sorted({c['rgba'] for p in parts for c in p['primcolors']})}
    return out


def derive_table(rom, extras=False):
    """animal_table.py --from-rom in memory; returned in the shape animal_table.json has after a JSON round trip.
    extras=True adds the EXTRA_MODELS characters and the stage props (Model Editor only; builds never need them)."""
    animal_table.ROM = rom
    try:
        result = animal_rom.build_from_rom(rom, animal_table.parse_dl)
        if extras:
            result.update(extra_models(rom))
            result.update(prop_models(rom))
    finally:
        animal_table.ROM = b''
    return json.loads(json.dumps(result))


def build(rom, level=None, parts=None, table=None, relocate=False, new_animals=False, strict=True, progress=None):
    """-> {'rom': bytes, 'ips': bytes, 'rom_sha1', 'source_sha1', 'log': [lines]}. Raises ValueError with a readable message."""
    try:
        return _build(rom, level, parts, table, relocate, new_animals, strict, progress or (lambda stage, detail: None))
    except SystemExit as error:     # the CLI modules stop with SystemExit(message)
        raise ValueError(str(error.code)) from None


def _build(rom, level, parts, table, relocate, new_animals, strict, step):
    level, parts = _document(level, 'Level file'), _document(parts, 'Parts config')
    table = _document(table, 'Animal table')
    if level is None and parts is None:
        raise ValueError('Give a level project or diff, a Parts config, or both')
    step('rom', 'Checking the ROM')
    rom = bytes(rom)
    if strict:
        stock = levels.check_level_rom(rom) if level is not None else levels.normalize_rom(rom)
    else:
        stock = rom
    if level is not None:
        _, attached = levels.validate(level, stock)
        if attached is not None and parts is not None:
            raise ValueError('The project already carries a Parts config; give it only once')
        if attached is not None:
            parts = attached
    if parts is not None:
        animals.config_entries(parts, 'Parts config')     # cheap shape check before the table is derived
        if strict and romio.sha1(stock) != romio.US10_SHA1:
            raise ValueError('Animal builds require the unmodified US 1.0 ROM for their expected-byte safeguards'
                             + ('; level edits alone support modded ROMs' if level is not None else ''))
        if strict and romio.n64_crc(stock) != struct.unpack('>II', stock[0x10:0x18]):
            raise ValueError('CRC routine disagrees with the original header')
        if level is not None and relocate:
            raise ValueError('Animal attachments require an in-place level build (no relocation)')
    edited = stock
    if level is not None:
        step('levels', 'Rebuilding and recompressing level data')
        edited = levels.build(level, stock, relocate=relocate, new_animals=new_animals)
    log = []
    if parts is not None:
        if table is None:
            step('table', 'Reading the animal table from your ROM')
            table = derive_table(stock)
        step('animals', 'Applying Parts edits')
        edited = levels.build_parts(stock, edited, parts, table, log=log.append)
    step('ips', 'Writing and checking the IPS patch')
    ips = levels.patch(stock, edited)
    return {'rom': edited, 'ips': ips, 'rom_sha1': romio.sha1(edited), 'source_sha1': romio.sha1(stock), 'log': log}


ART = {'minimap': lambda rom, step: minimap.minimaps(rom, lambda i, n: step('art', f'Drawing minimap {i} of {n}'))}


def art(rom, names, progress=None):
    """Pictures for the Classic+ patches, drawn from the given (unmodified US 1.0) ROM: {name: bytes}."""
    step = progress or (lambda stage, detail: None)
    rom = levels.normalize_rom(bytes(rom))
    if romio.sha1(rom) != romio.US10_SHA1:
        raise ValueError('Patch pictures are drawn from the unmodified US 1.0 ROM')
    unknown = [n for n in names if n not in ART]
    if unknown:
        raise ValueError('These patch pictures cannot be drawn yet: ' + ', '.join(unknown))
    return {n: ART[n](rom, step) for n in names}


def art_js(rom, names, progress):
    """Pyodide adapter for art(): rom a JS Uint8Array, names a JSON list."""
    rom = rom.to_bytes() if hasattr(rom, 'to_bytes') else bytes(rom)
    progress = None if progress is None or type(progress).__name__ == 'JsNull' else progress
    try:
        return art(rom, json.loads(names), (lambda stage, detail: progress(stage, detail)) if progress else None)
    except SystemExit as error:
        raise ValueError(str(error.code)) from None


def build_js(rom, level, parts, options, progress):
    """Pyodide adapter: rom is a JS Uint8Array, level/parts JSON text or None, options a JSON object string."""
    def given(value):      # JS null arrives as pyodide.ffi.jsnull, undefined as None
        return None if value is None or type(value).__name__ == 'JsNull' else value
    level, parts, options, progress = given(level), given(parts), given(options), given(progress)
    rom = rom.to_bytes() if hasattr(rom, 'to_bytes') else bytes(rom)
    opts = json.loads(options or '{}')
    if not isinstance(opts, dict):
        raise ValueError('Build options must be a JSON object')
    unknown = set(opts) - {'table', 'relocate', 'new_animals', 'strict'}
    if unknown:
        raise ValueError('Unknown build options: ' + ', '.join(sorted(unknown)))
    return build(rom, level, parts, table=opts.get('table'), relocate=bool(opts.get('relocate')),
                 new_animals=bool(opts.get('new_animals')), strict=opts.get('strict', True) is not False,
                 progress=(lambda stage, detail: progress(stage, detail)) if progress else None)
