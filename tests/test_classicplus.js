// Classic+ patch applier (src/web/classicplus.js) on synthetic data: no ROM, no game bytes.
const assert = require('assert'), fs = require('fs');
const CP = require('../src/web/classicplus.js'), {fixCRC} = require('../core/src/web/story/rom.js');
const data = {format: 'sssv-classicplus-web-v3', block_toggles: ['minimap', 'health-energy'], requires: {'health-energy': 'minimap'},
  pool: [[0x2000, 'aabb'], [0x1000, '01020304'], [0x1000, '05']], toggles: {'skip-intro': [0]},
  block: {minimap: {rom_len: 0x180000, records: [1], art: {minimap: [0x140000, 8]}},
          'minimap+health-energy': {rom_len: 0x180000, records: [2], art: {minimap: [0x140000, 8], icons_big: [0x150000, 4]}}}};
const stock = new Uint8Array(0x100000 + 0x1000); for (let i = 0; i < stock.length; i++) stock[i] = (i * 7) & 255;
assert.deepStrictEqual(CP.resolve(data, ['health-energy', 'nope']), ['minimap', 'health-energy'], 'dependencies added, unknown ids dropped');
assert.deepStrictEqual(CP.art(data, ['minimap', 'health-energy']), ['minimap', 'icons_big']);
assert.deepStrictEqual(CP.art(data, ['skip-intro']), []);
assert.throws(() => CP.apply(stock, stock, data, ['health-energy'], {}, fixCRC), /needs minimap/);
// independent toggle only: same length, record written, CRC recomputed
const a = CP.apply(stock, stock, data, ['skip-intro'], {}, fixCRC);
assert.equal(a.length, stock.length); assert.equal(a[0x2000], 0xaa); assert.equal(a[0x2001], 0xbb);
const ref = stock.slice(); ref[0x2000] = 0xaa; ref[0x2001] = 0xbb; fixCRC(ref); assert.deepStrictEqual(a, ref);
// block variant: ROM grows (0xFF fill), art written into its gap, missing art refused
assert.throws(() => CP.apply(stock, stock, data, ['minimap'], {}, fixCRC), /could not be drawn/);
const m = CP.apply(stock, stock, data, ['minimap', 'skip-intro'], {minimap: new Uint8Array(8).fill(9)}, fixCRC);
assert.equal(m.length, 0x180000); assert.equal(m[0x13ffff], 255); assert.equal(m[0x140000], 9); assert.equal(m[0x1003], 4);
// overlap with other editor changes is refused, untouched edits survive
const edited = stock.slice(); edited[0x1001] ^= 1; edited[0x3000] ^= 1;
assert.throws(() => CP.apply(stock, edited, data, ['minimap'], {minimap: new Uint8Array(8)}, fixCRC), /overlaps your editor changes at ROM offset 0x1001/);
assert.equal(CP.apply(stock, edited, data, ['skip-intro'], {}, fixCRC)[0x3000], edited[0x3000]);
assert.throws(() => CP.apply(stock, stock, {format: 'old'}, ['skip-intro']), /different version/);
// published data: shape only (the records hold our own bytes; verified against the reference builder before publishing)
const pub = JSON.parse(fs.readFileSync(__dirname + '/../src/web/classicplus.json', 'utf8'));
assert.equal(pub.format, CP.FORMAT);
const manifest = JSON.parse(fs.readFileSync(__dirname + '/../src/web/patches.json', 'utf8'));
for (const p of manifest.filter(p => p.status === 'available')) assert(CP.ids(pub).includes(p.id), 'available patch has data: ' + p.id);
for (const v of Object.values(pub.block)) for (const i of v.records) { const [o, h] = pub.pool[i]; assert(Number.isInteger(o) && o >= 0x18 && /^[0-9a-f]+$/.test(h) && h.length % 2 === 0); }
console.log('Classic+ applier: dependencies, art gaps, ROM growth, overlap refusal, CRC and published data shape pass.');
