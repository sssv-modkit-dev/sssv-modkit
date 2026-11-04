"""RNC ProPack method 1 compressor (game constraint: <=16 symbols per table, so distance/length <= 0x8000) (written to match the bit-reader model of survey/rnc.py, which the
game's rnc_unpack 0x8012B0F0 also follows). Claude 2026-11-04.

Stream model: LSB-first bits packed into 16-bit LE words; a word's 2-byte slot is reserved in the output
the first time a bit is written into it. Literal runs are copied as raw bytes at the current end of the
output (i.e. after the last reserved word), exactly where the reader expects them.
Chunk: 3 Huffman tables (raw-length, distance-1, length-2), u16 count of literal runs, then
count x [raw run] with a match between consecutive runs.
"""
import struct, sys, os
from level_rnc import crc16

class BitW:
    def __init__(self):
        self.out = bytearray(); self.slot = None; self.nb = 0; self.acc = 0
    def bits(self, v, n):
        for i in range(n):
            if self.slot is None:
                self.slot = len(self.out); self.out += b'\0\0'; self.nb = 0; self.acc = 0
            self.acc |= ((v >> i) & 1) << self.nb; self.nb += 1
            struct.pack_into('<H', self.out, self.slot, self.acc)
            if self.nb == 16:
                self.slot = None
    def raw(self, b):
        self.out += b

def sym(v):  # value -> (symbol, extra bits, nextra)
    if v < 2: return v, 0, 0
    s = v.bit_length(); return s, v - (1 << (s - 1)), s - 1

def huff_lengths(freq, maxlen=15):
    syms = [i for i, f in enumerate(freq) if f]
    L = [0] * len(freq)
    if not syms: return L
    if len(syms) == 1: L[syms[0]] = 1; return L
    import heapq
    while True:
        h = [(freq[s], i, [s]) for i, s in enumerate(syms)]; heapq.heapify(h); depth = {s: 0 for s in syms}; k = len(syms)
        while len(h) > 1:
            a = heapq.heappop(h); b = heapq.heappop(h)
            for s in a[2] + b[2]: depth[s] += 1
            heapq.heappush(h, (a[0] + b[0], k, a[2] + b[2])); k += 1
        if max(depth.values()) <= maxlen:
            for s in syms: L[s] = depth[s]
            return L
        freq = [(f + 1) // 2 if f else 0 for f in freq]  # flatten and retry

def mirror(x, n):
    r = 0
    for _ in range(n): r = r << 1 | (x & 1); x >>= 1
    return r

def codes(L):
    num = max([i + 1 for i, l in enumerate(L) if l] or [0]); code = 0; c = {}
    for ln in range(1, 16):
        for j in range(num):
            if L[j] == ln: c[j] = (mirror(code, ln), ln); code += 1
        code <<= 1
    return num, c

def write_table(bw, L):
    num, c = codes(L)
    assert num <= 16, 'game decoder (0x8012B8B4) reads at most 16 code lengths per table'
    bw.bits(num, 5)
    for j in range(num): bw.bits(L[j], 4)
    return c

def put(bw, c, v):
    s, e, ne = sym(v); code, ln = c[s]; bw.bits(code, ln)
    if ne: bw.bits(e, ne)

def lz(data, start, end, window=0x8000, maxlen=0x8000, chain=256, m2=0x100):
    """Greedy+lazy hash-chain LZ over data[start:end]; matches may reach back before start.
    Returns list of (literal_bytes, (dist, length) or None)."""
    head = {}; prev = {}; out = []; lit_start = start; i = max(0, start - window)
    def insert(p):
        if p + 2 <= len(data):
            k = data[p:p+2]; prev[p] = head.get(k); head[k] = p
    for p in range(i, start): insert(p)
    def best(p):
        if p + 2 > end: return 0, 0
        k = data[p:p+2]; q = head.get(k); bl = bd = 0; n = 0; lim = min(maxlen, end - p)
        while q is not None and p - q <= window and n < chain:
            l = 0
            while l < lim and data[q + l] == data[p + l]: l += 1
            if l > bl: bl, bd = l, p - q
            if l == lim: break
            q = prev.get(q); n += 1
        return bl, bd
    p = start
    while p < end:
        l, d = best(p)
        if l >= 3 or (l == 2 and d <= m2):
            insert(p); l2, d2 = best(p + 1)
            if l2 > l + 1:  # lazy: emit one literal and take the better match next
                p += 1; continue
            out.append((data[lit_start:p], (d, l)))
            for q in range(p + 1, p + l): insert(q)
            p += l; lit_start = p
        else:
            insert(p); p += 1
    out.append((data[lit_start:end], None))
    return out

def pack(data, chunk=0x3000, m2=0x100):
    data = bytes(data); bw = BitW(); bw.bits(0, 2); nchunks = 0; pos = 0
    while pos < len(data) or nchunks == 0:
        end = min(len(data), pos + chunk); seq = lz(data, pos, end, m2=m2); nchunks += 1
        # split overly long literal runs (raw length codes up to 0xFFFF) -- chunk size keeps them small anyway
        fr = [0] * 17; fd = [0] * 17; fl = [0] * 17
        for lit, m in seq:
            fr[sym(len(lit))[0]] += 1
            if m: fd[sym(m[0] - 1)[0]] += 1; fl[sym(m[1] - 2)[0]] += 1
        cr = write_table(bw, huff_lengths(fr)); cd = write_table(bw, huff_lengths(fd)); cl = write_table(bw, huff_lengths(fl))
        bw.bits(len(seq), 16)
        for lit, m in seq:
            put(bw, cr, len(lit))
            if lit: bw.raw(lit)
            if m: put(bw, cd, m[0] - 1); put(bw, cl, m[1] - 2)
        pos = end
        if not data: break
    body = bytes(bw.out)
    hdr = b'RNC' + struct.pack('>BIIHHBB', 1, len(data), len(body), crc16(data), crc16(body), leeway(data, body), nchunks)
    return hdr + body

def leeway(data, body):
    # bytes the packed stream can run ahead of the output; conservative upper bound clamp
    return min(255, max(0, len(body) - len(data)) + 2)


def pack_best(data, limit=None):
    """Try a few chunk sizes / 2-byte-match ranges; return the smallest stream (stop early once <= limit)."""
    best = None
    for chunk in (0x3000, 0x2000, 0x4000, 0x1000, 0x8000):
        for m2 in (0x100, 0x40, 0x400, 0):
            p = pack(data, chunk, m2)
            if best is None or len(p) < len(best): best = p
            if limit and len(best) <= limit: return best
    return best
