"""RNC ProPack method 1 decompressor (public format: 18-byte header 'RNC' m u32 unpacked u32 packed
u16 crc_unpacked u16 crc_packed u8 leeway u8 chunks; LSB-first 16-bit LE bitstream, 3 Huffman tables per chunk)."""
import struct

def crc16(data):
    tab = []
    for i in range(256):
        c = i
        for _ in range(8):
            c = (c >> 1) ^ 0xA001 if c & 1 else c >> 1
        tab.append(c)
    c = 0
    for b in data:
        c = tab[(c ^ b) & 0xFF] ^ (c >> 8)
    return c

def header(buf, off):
    if buf[off:off+3] != b'RNC':
        return None
    m, u, p, uc, pc, lee, ch = struct.unpack('>BIIHHBB', buf[off+3:off+18])
    return dict(method=m, unpacked=u, packed=p, ucrc=uc, pcrc=pc, leeway=lee, chunks=ch)

class Bits:
    def __init__(self, buf, pos):
        self.b = buf; self.p = pos
        self.buf = self.lw(pos); self.cnt = 16
    def lw(self, p):
        b = self.b
        return (b[p] if p < len(b) else 0) | ((b[p+1] if p+1 < len(b) else 0) << 8)
    def peek(self, mask):
        return self.buf & mask
    def adv(self, n):
        self.buf >>= n; self.cnt -= n
        if self.cnt < 16:
            self.p += 2
            self.buf |= self.lw(self.p) << self.cnt
            self.cnt += 16
    def read(self, n):
        v = self.buf & ((1 << n) - 1); self.adv(n); return v
    def fix(self):
        self.cnt -= 16
        self.buf &= (1 << self.cnt) - 1
        self.buf |= self.lw(self.p) << self.cnt
        self.cnt += 16

def mirror(x, n):
    r = 0
    for _ in range(n):
        r = (r << 1) | (x & 1); x >>= 1
    return r

def read_table(bs):
    num = bs.read(5)
    if not num:
        return []
    lens = [bs.read(4) for _ in range(num)]
    mx = max([1] + lens)
    code = 0; t = []
    for L in range(1, mx + 1):
        for j in range(num):
            if lens[j] == L:
                t.append((mirror(code, L), L, j)); code += 1
        code <<= 1
    return t

def huf(bs, t):
    for code, L, val in t:
        if bs.peek((1 << L) - 1) == code:
            bs.adv(L)
            if val >= 2:
                v = 1 << (val - 1)
                return v | bs.read(val - 1)
            return val
    raise ValueError('huffman decode error')

def unpack(buf, off):
    h = header(buf, off)
    if not h or h['method'] != 1:
        raise ValueError('not RNC1')
    out = bytearray(); U = h['unpacked']
    bs = Bits(buf, off + 18)
    bs.adv(2)
    while len(out) < U:
        raw = read_table(bs); dist = read_table(bs); ln = read_table(bs)
        n = bs.read(16)
        while True:
            L = huf(bs, raw)
            if L:
                out += buf[bs.p:bs.p + L]; bs.p += L
                bs.fix()
            n -= 1
            if n <= 0:
                break
            pos = huf(bs, dist) + 1
            L = huf(bs, ln) + 2
            if pos > len(out):
                raise ValueError('bad distance')
            for _ in range(L):
                out.append(out[-pos])
    return bytes(out[:U]), h
