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


def derive_table(rom):
    """animal_table.py --from-rom in memory; returned in the shape animal_table.json has after a JSON round trip."""
    animal_table.ROM = rom
    try:
        result = animal_rom.build_from_rom(rom, animal_table.parse_dl)
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
