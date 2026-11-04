"""Shared ROM helpers: US 1.0 identity, ROM lookup, N64 header CRC and IPS patches. Never writes ROM files."""
import hashlib
import os
import struct

US10_SHA1 = 'e5e09205aa743a9e5043a42df72adc379c746b0b'
US10_SIZE = 0x800000
HERE = os.path.dirname(os.path.abspath(__file__))


def sha1(data):
    return hashlib.sha1(data).hexdigest()


def find_rom(arg=None, quiet=False):
    """--rom FILE, else env SSSV_ROM, else the first unmodified US 1.0 .z64 in ./rom or <repo>/rom."""
    for given, what in ((arg, 'ROM'), (os.environ.get('SSSV_ROM'), 'SSSV_ROM')):
        if given:
            if not os.path.isfile(given): raise SystemExit(f'{what} not found: {given}')
            return given
    dirs = []
    for d in ['rom', os.path.join(HERE, '..', 'rom')]:
        d = os.path.abspath(d)
        if os.path.isdir(d) and d not in dirs: dirs.append(d)
    swapped = []
    for d in dirs:
        for f in sorted(os.listdir(d)):
            p = os.path.join(d, f); ext = os.path.splitext(f)[1].lower()
            if not os.path.isfile(p): continue
            if ext == '.z64' and os.path.getsize(p) == US10_SIZE:
                with open(p, 'rb') as fh:
                    if sha1(fh.read()) == US10_SHA1:
                        if not quiet: print(f'ROM: {p}')
                        return p
            elif ext in ('.n64', '.v64'): swapped.append(p)
    msg = f'no unmodified US 1.0 .z64 (SHA1 {US10_SHA1}) found in the rom folder; put it there, set SSSV_ROM or pass --rom FILE.'
    if swapped: msg += ' Byte-swapped files found (' + ', '.join(swapped) + '): convert them to big-endian .z64 first.'
    raise SystemExit(msg)


def read_us10(path):
    """Read a ROM and insist it is the unmodified US 1.0 image with a header CRC this module reproduces."""
    with open(path, 'rb') as fh: rom = fh.read()
    if sha1(rom) != US10_SHA1: raise SystemExit(f'{path} is not the unmodified US 1.0 .z64 (SHA1 mismatch).')
    if n64_crc(rom) != struct.unpack('>II', rom[0x10:0x18]): raise SystemExit('CRC routine disagrees with the original header')
    return rom


def n64_crc(rom):
    """CIC-6102 header checksum over 1 MiB from 0x1000 -> (crc1, crc2)."""
    M = 0xFFFFFFFF; t1 = t2 = t3 = t4 = t5 = t6 = 0xF8CA4DDC
    for (d,) in struct.iter_unpack('>I', rom[0x1000:0x101000]):
        if ((t6 + d) & M) < t6: t4 = (t4 + 1) & M
        t6 = (t6 + d) & M; t3 ^= d
        r = ((d << (d & 31)) | (d >> (32 - (d & 31)))) & M if (d & 31) else d
        t5 = (t5 + r) & M
        if t2 > d: t2 ^= r
        else: t2 ^= (t6 ^ d)
        t1 = (t1 + (d ^ t5)) & M
    return (t6 ^ t4 ^ t3) & M, (t5 ^ t2 ^ t1) & M


def fix_crc(rom):
    """Write the header CRCs into a bytearray in place; returns them."""
    c1, c2 = n64_crc(rom); rom[0x10:0x18] = struct.pack('>II', c1, c2)
    return c1, c2


IPS_EOF = 0x454F46      # a hunk offset equal to b'EOF' would end the patch early
IPS_MAX = 0xFFFF


def make_ips(orig, new):
    if len(orig) != len(new): raise ValueError('IPS here only diffs equal-size images')
    if len(orig) > 0x1000000: raise ValueError('IPS offsets are 24-bit; image is larger than 16 MiB')
    out = bytearray(b'PATCH'); i = 0; n = len(orig)
    while i < n:
        if orig[i] == new[i]: i += 1; continue
        s = i - 1 if i == IPS_EOF else i        # start one byte early; that byte is unchanged and rewritten as-is
        j = i
        while j < n and orig[j] != new[j] and j - s < IPS_MAX: j += 1
        out += struct.pack('>I', s)[1:] + struct.pack('>H', j - s) + bytes(new[s:j]); i = j
    return bytes(out + b'EOF')


def apply_ips(orig, ips):
    rom = bytearray(orig)
    if ips[:5] != b'PATCH': raise ValueError('not an IPS patch')
    p = 5
    while ips[p:p + 3] != b'EOF':
        if p + 5 > len(ips): raise ValueError('truncated IPS patch')
        off = int.from_bytes(ips[p:p + 3], 'big'); ln = int.from_bytes(ips[p + 3:p + 5], 'big'); p += 5
        if ln == 0:     # RLE hunk: 2-byte count, 1-byte value
            cnt = int.from_bytes(ips[p:p + 2], 'big'); rom[off:off + cnt] = ips[p + 2:p + 3] * cnt; p += 3
        else:
            rom[off:off + ln] = ips[p:p + ln]; p += ln
    return bytes(rom)
