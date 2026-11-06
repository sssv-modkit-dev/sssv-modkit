#!/usr/bin/env python3
"""Build a local ROM and IPS from a source-bound level diff or workspace project."""
import argparse
import json
from pathlib import Path
import struct

import level_rnc as rnc
import level_rnc_pack as packer
import romio

TABLE = 0x7B72A8
LISTS = {'props': (0, 22), 'animals': (1, 16)}


def split_chunks(body):
    chunks, offset = [], 0
    while offset < len(body):
        cid = body[offset]
        offset += 1
        if cid == 3:
            return chunks, body[offset:]
        if offset + 4 > len(body):
            break
        header = rnc.header(body, offset)
        if header:
            size = 18 + header['packed']
            if offset + size > len(body):
                raise ValueError('Truncated compressed level chunk')
            data, _ = rnc.unpack(body, offset)
        else:
            size = 4 + struct.unpack_from('>I', body, offset)[0]
            data = body[offset + 4:offset + size]
        if size > len(body) - offset:
            raise ValueError('Level chunk out of bounds')
        chunks.append((cid, body[offset:offset + size], data))
        offset += size
    raise ValueError('Missing level end marker')


def normalize_rom(data):
    rom = bytearray(data)
    if not 0x800000 <= len(rom) <= 0x1000000 or len(rom) % 4:
        raise ValueError('Use an 8-16 MB SSSV US ROM')
    magic = bytes(rom[:4])
    if magic == bytes.fromhex('37804012'):
        rom[0::2], rom[1::2] = rom[1::2], rom[0::2]
    elif magic == bytes.fromhex('40123780'):
        rom[0::4], rom[1::4], rom[2::4], rom[3::4] = rom[3::4], rom[2::4], rom[1::4], rom[0::4]
    elif magic != bytes.fromhex('80371240'):
        raise ValueError('Unrecognized N64 ROM byte order')
    if rom[0x3B:0x3F] != b'NSVE':
        raise ValueError('Use a US SSSV ROM, not a different game or region')
    return bytes(rom)


def read_level_rom(path):
    return check_level_rom(Path(path).read_bytes())


def check_level_rom(data):
    """Normalize byte order and check every stage's level table entry and spawn chunks. -> big-endian ROM bytes."""
    stock = normalize_rom(data)
    for level in range(1, 37):
        start, end = struct.unpack_from('>II', stock, TABLE + (level-1)*8)
        if not 0 <= start < end <= len(stock):
            raise ValueError(f'Stage {level}: unsupported or damaged level table')
        body, _ = rnc.unpack(stock, start)
        chunks, _ = split_chunks(body)
        for kind, (wanted, size) in LISTS.items():
            matches = [data for cid, _, data in chunks if cid == wanted]
            if len(matches) != 1:
                raise ValueError(f'Stage {level}: missing or repeated {kind} chunk')
            edit_records(matches[0], size, {}, kind)
    return stock


def edit_records(data, size, spec, kind, new_animals=False):
    if not isinstance(spec, dict) or set(spec) - {'set', 'add'}:
        raise ValueError('Only set/add operations are supported; deletion shifts script indices')
    count = struct.unpack_from('>H', data)[0]
    if len(data) != 2 + count * size:
        raise ValueError('Invalid spawn table length')
    records = [data[2+i*size:2+(i+1)*size] for i in range(count)]
    seen = set()
    for operation in ('set', 'add'):
        items = spec.get(operation, [])
        if not isinstance(items, list):
            raise ValueError('Spawn operations must be lists')
        for item in items:
            if not isinstance(item, dict) or set(item) != ({'index', 'bytes'} if operation == 'set' else {'bytes'}):
                raise ValueError('Invalid spawn operation')
            record = bytes.fromhex(item['bytes'])
            if len(record) != size:
                raise ValueError('Wrong spawn record size')
            if operation == 'set':
                index = item['index']
                if type(index) is not int or not 0 <= index < count or index in seen:
                    raise ValueError('Invalid or repeated spawn index')
                seen.add(index)
                records[index] = record
            else:
                if kind != 'props' and not new_animals:
                    raise ValueError('New animal records need --new-animals (appended spawns are not game-verified)')
                records.append(record)
    if len(records) > 65535:
        raise ValueError('Too many spawn records')
    return struct.pack('>H', len(records)) + b''.join(records)


def validate(document, stock):
    parts = None
    if document.get('format') == 'sssv-workspace-project':
        if document.get('version') != 1 or document.get('rom_sha1') != romio.sha1(stock):
            raise ValueError('Project version or source ROM mismatch')
        attachment = document.get('parts')
        if attachment is not None:
            if not isinstance(attachment, dict) or not isinstance(attachment.get('config'), dict):
                raise ValueError('Invalid Model Editor attachment')
            parts = attachment['config']
            if parts.get('format') == 'sssv-parts-lab-demo-v1':
                raise ValueError('Demo creatures are not production animal patch configs')
        document = document.get('level_diff', {})
    if document.get('format') != 'sssv-editor-diff' or document.get('version') != 1:
        raise ValueError('Expected level diff v1 or workspace project v1')
    if document.get('rom_sha1') != romio.sha1(stock):
        raise ValueError('Level edits do not match the original ROM SHA1')
    if not isinstance(document.get('levels'), dict):
        raise ValueError('Expected a levels object')
    for level, lists in document['levels'].items():
        if level not in {str(i) for i in range(1, 37)} or not isinstance(lists, dict) or set(lists) - set(LISTS):
            raise ValueError('Invalid level or spawn list')
    return document, parts


def build(diff, stock, relocate=False, new_animals=False):
    diff, _ = validate(diff, stock)
    rom = bytearray(stock)
    for level, lists in sorted(diff['levels'].items(), key=lambda kv: int(kv[0])):
        entry = TABLE + (int(level)-1)*8
        start, end = struct.unpack_from('>II', stock, entry)
        if not 0 <= start < end <= len(stock):
            raise ValueError('Level slot out of bounds')
        body, _ = rnc.unpack(stock, start)
        chunks, tail = split_chunks(body)
        rebuilt, found = [], set()
        for cid, stored, data in chunks:
            for kind, (wanted, size) in LISTS.items():
                if cid == wanted and kind in lists:
                    found.add(kind)
                    edited = edit_records(data, size, lists[kind], kind, new_animals)
                    if edited != data:
                        stored = packer.pack_best(edited)
                        if rnc.unpack(stored, 0)[0] != edited:
                            raise ValueError('Spawn compression roundtrip failed')
            rebuilt.append(bytes([cid]) + stored)
        if found != set(lists):
            raise ValueError('Requested spawn chunk missing')
        body = b''.join(rebuilt) + b'\x03' + tail
        packed = packer.pack_best(body, end-start)
        if rnc.unpack(packed, 0)[0] != body:
            raise ValueError('Level compression roundtrip failed')
        if len(packed) <= end-start:
            rom[start:end] = packed + bytes(end-start-len(packed))
        elif relocate:
            new_start = (len(rom)+15) & ~15
            rom.extend(bytes(new_start-len(rom)))
            rom.extend(packed)
            rom.extend(bytes((-len(rom)) & 15))
            if len(rom) > 0x1000000:
                raise ValueError('Relocated ROM exceeds the 16 MiB patch limit')
            struct.pack_into('>II', rom, entry, new_start, new_start+len(packed))
        else:
            raise ValueError(f'Level {level} needs relocation; use --relocate for level-only builds')
    romio.fix_crc(rom)
    return bytes(rom)


def patch(stock, edited):
    # Extend the comparison base with zeros; emit those bytes too so IPS can grow the file.
    if len(stock) == len(edited):
        result = romio.make_ips(stock, edited)
    else:
        result = bytearray(romio.make_ips(stock, edited[:len(stock)])[:-3])
        for offset in range(len(stock), len(edited), 65535):
            data = edited[offset:offset+65535]
            result.extend(offset.to_bytes(3, 'big') + len(data).to_bytes(2, 'big') + data)
        result.extend(b'EOF')
        result = bytes(result)
    if romio.apply_ips(stock, result) != edited:
        raise ValueError('IPS roundtrip failed')
    return result


def build_parts(orig, base, parts, table, dry_run=False, log=print):
    """Stack a Model Editor config (dict) on a level build in process; table is a path or a loaded animal table.
    Prints the same report as make_animal_mods.py. Returns the patched ROM bytes, or None for a dry run."""
    import make_animal_mods as animals
    if not isinstance(table, dict):
        with open(animals.find_table(str(table)), encoding='utf-8') as handle:
            table = json.load(handle)
    entries, _ = animals.config_entries(json.loads(json.dumps(parts)), 'Model Editor attachment')
    plan = animals.plan_edits(table, base, entries, log=log)
    for name in sorted({c['animal'] for _, c in entries if 'animal' in c}):
        touched = set(plan['touch'].get(name, ())) | {q['symbol'] for a2, q, m in plan['mesh'] + plan['deform'] if a2 == name}
        for line in animals.variant_report(table, name, touched):
            log(line)
    if dry_run:
        for o, (name, new, normal) in sorted(plan['vertices'].items()):
            log(f'  vertex {o:#08x} xyz->{new} normal->{normal}  [{name}]')
        animals.apply_plan(base, plan, log=lambda s: log('  ' + s))
        for w, (old, new, name, why) in sorted(plan['words'].items()):
            log(f'  {w:#08x} {old}->{new}  [{name}] {why}')
        return None
    return animals.finish_build(orig, base, plan, log=log)[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('edits', type=Path)
    parser.add_argument('--rom', required=True, type=Path)
    parser.add_argument('--out', type=Path, default=Path('build/levels'))
    parser.add_argument('--name', default='level-edits')
    parser.add_argument('--dry-run', action='store_true', help='Validate and compress without writing outputs')
    parser.add_argument('--relocate', action='store_true', help='Allow level-only ROM expansion')
    parser.add_argument('--new-animals', action='store_true', help='Allow appended animal spawn records (not game-verified)')
    parser.add_argument('--table', type=Path, help='Animal table for attached production animal config')
    args = parser.parse_args()
    if not args.name or Path(args.name).name != args.name or args.name in ('.', '..'):
        parser.error('name must be a single filename')
    stock = read_level_rom(args.rom)
    diff, parts = validate(json.loads(args.edits.read_text(encoding='utf-8-sig')), stock)
    if parts and romio.sha1(stock) != romio.US10_SHA1:
        parser.error('Level edits support modded ROMs; attached animal builds still require the stock ROM for their expected-byte safeguards')
    if parts and (not args.table or args.relocate):
        parser.error('Animal attachments require --table and an in-place level build')
    edited = build(diff, stock, relocate=args.relocate, new_animals=args.new_animals)
    if args.dry_run and not parts:
        patch(stock, edited)
        print('Dry-run passed: source identity, level compression, CRC and IPS roundtrips; no output written.')
        return
    args.out.mkdir(parents=True, exist_ok=True)
    output = args.out / (args.name+'.z64')
    if output.resolve() == args.rom.resolve():
        parser.error('Output must not overwrite the original ROM')
    if parts:
        edited = build_parts(romio.read_us10(romio.find_rom(str(args.rom))), edited, parts, args.table, args.dry_run)
        if args.dry_run:
            print('Combined dry-run passed; no ROM or IPS written.')
            return
    ips = patch(stock, edited)
    output.write_bytes(edited)
    output.with_suffix('.ips').write_bytes(ips)
    print(f'Built {output} and IPS; compression and patch roundtrips passed. Portal hooks are separate.')


if __name__ == '__main__':
    main()
