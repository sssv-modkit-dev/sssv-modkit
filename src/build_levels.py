#!/usr/bin/env python3
"""Build a local ROM and IPS from a source-bound level diff or workspace project."""
import argparse
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

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


def edit_records(data, size, spec, kind):
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
                if kind != 'props':
                    raise ValueError('Only props can be duplicated')
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
                raise ValueError('Invalid Parts Lab attachment')
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


def build(diff, stock, relocate=False):
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
                    edited = edit_records(data, size, lists[kind], kind)
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('edits', type=Path)
    parser.add_argument('--rom', required=True, type=Path)
    parser.add_argument('--out', type=Path, default=Path('build/levels'))
    parser.add_argument('--name', default='level-edits')
    parser.add_argument('--dry-run', action='store_true', help='Validate and compress without writing outputs')
    parser.add_argument('--relocate', action='store_true', help='Allow level-only ROM expansion')
    parser.add_argument('--table', type=Path, help='Animal table for attached production animal config')
    args = parser.parse_args()
    if not args.name or Path(args.name).name != args.name or args.name in ('.', '..'):
        parser.error('name must be a single filename')
    stock = romio.read_us10(str(args.rom))
    diff, parts = validate(json.loads(args.edits.read_text(encoding='utf-8-sig')), stock)
    if parts and (not args.table or args.relocate):
        parser.error('Animal attachments require --table and an in-place level build')
    edited = build(diff, stock, relocate=args.relocate)
    if args.dry_run and not parts:
        patch(stock, edited)
        print('Dry-run passed: source identity, level compression, CRC and IPS roundtrips; no output written.')
        return
    args.out.mkdir(parents=True, exist_ok=True)
    output = args.out / (args.name+'.z64')
    if output.resolve() == args.rom.resolve():
        parser.error('Output must not overwrite the original ROM')
    if parts:
        with tempfile.TemporaryDirectory(prefix='sssv-levels-') as directory:
            base, config = Path(directory)/'base.z64', Path(directory)/'animal.json'
            base.write_bytes(edited)
            config.write_text(json.dumps(parts), encoding='utf-8')
            command = [sys.executable, str(Path(__file__).with_name('make_animal_mods.py')), str(config), '--rom', str(args.rom), '--base', str(base), '--table', str(args.table), '--out', str(args.out), '--name', args.name]
            subprocess.run(command + ['--dry-run'], check=True)
            if args.dry_run:
                print('Combined dry-run passed; no ROM or IPS written.')
                return
            subprocess.run(command, check=True)
            edited = output.read_bytes()
    ips = patch(stock, edited)
    output.write_bytes(edited)
    output.with_suffix('.ips').write_bytes(ips)
    print(f'Built {output} and IPS; compression and patch roundtrips passed. Portal hooks are separate.')


if __name__ == '__main__':
    main()
