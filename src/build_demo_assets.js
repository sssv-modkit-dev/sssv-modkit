#!/usr/bin/env node
/* Build the public demo assets from the owner's local US 1.0 ROM (read-only).
 * Usage: node src/build_demo_assets.js ROM.z64 ANIMAL_TABLE.json [--sheet DIR]
 * Writes src/web/demo/: level-4.json, animals.json, heads/*.png.
 * Pages builds never run this; they copy the committed output (see src/build_viewer.py).
 * Make the table first: python src/animal_table.py --from-rom --rom ROM.z64 --out TABLE_PREFIX */
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const LEVEL_ID = 4;
// Base variant kept per animal (null = single-variant animal) and the part drawn as the head icon.
const ANIMALS = {
  bear:    {title: 'Bear',    variant: 'BEAR', head: null},  // existing src/viewer/assets/icon.png is reused (copied at site build)
  dog:     {title: 'Dog',     variant: 'DOG',  head: 'D_04000870_C82A0'},
  fox:     {title: 'Fox',     variant: 'FOX',  head: 'D_04004D10_CC740'},
  sheep:   {title: 'Sheep',   variant: null,   head: 'D_04002D90_CA7C0'},
  seagull: {title: 'Seagull', variant: null,   head: 'D_04001F80_DF540'},
};
const out = path.join(__dirname, 'web', 'demo');

// ---- PNG writer (stdlib zlib) ----
function crc32(b) { let r = ~0; for (const x of b) { r ^= x; for (let k = 0; k < 8; k++) r = r & 1 ? 0xEDB88320 ^ (r >>> 1) : r >>> 1; } return ~r >>> 0; }
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}
// The atlas decoder wants a canvas; give it one that encodes PNG.
global.document = {createElement: () => { const o = {getContext: () => ({createImageData: (w, h) => ({data: new Uint8ClampedArray(w * h * 4), w, h}), putImageData: i => { o.img = i; }}), toDataURL: () => 'data:image/png;base64,' + png(o.img.w, o.img.h, o.img.data).toString('base64')}; return o; }};
const LevelRom = require('./levels/rom.js');

// ---- parseDL from the viewer (the same code the Parts Lab runs) ----
const appSource = fs.readFileSync(path.join(__dirname, 'viewer/js/app.js'), 'utf8').split('//#PURE-START')[1].split('//#PURE-END')[0];
const parseDL = new Function(appSource + '; return parseDL;')();

// ---- tiny software renderer for head icons / contact sheets ----
function render(tris, size, yaw = 0.5, pitch = 0.25, img = new Uint8ClampedArray(size * size * 4)) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const xf = ([x, y, z]) => { const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
  const T = tris.map(t => ({v: t.v.map(xf), col: t.col}));
  const mn = [1e9, 1e9], mx = [-1e9, -1e9];
  for (const t of T) for (const p of t.v) for (let k = 0; k < 2; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  const s = (size * 0.9) / Math.max(mx[0] - mn[0], mx[1] - mn[1], 1), ox = size / 2 - (mn[0] + mx[0]) / 2 * s, oy = size / 2 + (mn[1] + mx[1]) / 2 * s;
  const zb = new Float32Array(size * size).fill(-1e9);
  for (const t of T) {
    const P = t.v.map(p => [p[0] * s + ox, -p[1] * s + oy, p[2]]);
    const a = [P[1][0] - P[0][0], P[1][1] - P[0][1]], b = [P[2][0] - P[0][0], P[2][1] - P[0][1]], area = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(area) < 1e-6) continue;
    const u = [t.v[1][0] - t.v[0][0], t.v[1][1] - t.v[0][1], t.v[1][2] - t.v[0][2]], w = [t.v[2][0] - t.v[0][0], t.v[2][1] - t.v[0][1], t.v[2][2] - t.v[0][2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const nl = Math.hypot(...n) || 1; n = n.map(v => v / nl);
    if (n[2] < 0) n = n.map(v => -v);
    const lit = 0.55 + 0.45 * Math.max(0, n[0] * -0.3 + n[1] * 0.5 + n[2] * 0.8);
    const x0 = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0]))), x1 = Math.min(size - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
    const y0 = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1]))), y1 = Math.min(size - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + .5 - P[0][0], py = y + .5 - P[0][1], l1 = (px * b[1] - py * b[0]) / area, l2 = (a[0] * py - a[1] * px) / area, l0 = 1 - l1 - l2;
      if (l0 < -1e-4 || l1 < -1e-4 || l2 < -1e-4) continue;
      const z = l0 * P[0][2] + l1 * P[1][2] + l2 * P[2][2], i = y * size + x;
      if (z <= zb[i]) continue;
      zb[i] = z; const c = t.col; img.set([c[0] * lit, c[1] * lit, c[2] * lit, 255], i * 4);
    }
  }
  return img;
}

// ---- level bundle: one level, the prop models it uses, its texture atlas ----
async function levelBundle(rom) {
  const all = await LevelRom.decode(rom), L = all.LEVELS.find(l => l.id === LEVEL_ID);
  const sp = new Int32Array(new Uint8Array(Buffer.from(L.sp, 'base64')).buffer), types = new Set();
  for (let i = 0; i < sp.length; i += 5) types.add(sp[i]);
  const MODEL = {};
  for (const t of types) if (all.MODEL[t]) MODEL[t] = all.MODEL[t];
  return {bundle: {format: 'sssv-demo-level-v1', ANIM: all.ANIM, MODEL, TBL: all.TBL, ATLAS: {[L.tex]: all.ATLAS[L.tex]}, LEVELS: [L],
    EDITOR_STOCK: {[LEVEL_ID]: all.EDITOR_STOCK[LEVEL_ID]}, EDITOR_SHA1: all.EDITOR_SHA1, SOURCE_LABEL: 'bundled demo level, no ROM'},
  types: [...types].sort((a, b) => a - b), modelled: Object.keys(MODEL).map(Number)};
}

// ---- animals in Parts Lab demo shape (see PARTS_DEMOS), without vertex colours ----
function animals(rom, table, sheetDir) {
  const dv = new DataView(rom.buffer, rom.byteOffset, rom.byteLength), models = {}, heads = {};
  for (const [name, info] of Object.entries(ANIMALS)) {
    const a = table[name], bases = Object.fromEntries(Object.entries(a.seg_bases).map(([k, v]) => [k, Number(v)])), parts = [];
    for (const p of a.parts) {
      if (!p.ended || p.seg === 1) continue;
      if (info.variant && p.sections.length && !p.sections.includes(info.variant)) continue;
      const P = parseDL(dv, p.rom, bases);
      if (!P.tris.length) continue;
      const tris = P.tris.map(t => {
        // Game vertex colours are normals on lit parts, so icons use the primitive colour only.
        const prim = P.cols[t.c]?.rgba || 'C8C8C8FF', col = [0, 1, 2].map(i => parseInt(prim.slice(i * 2, i * 2 + 2), 16));
        return {v: t.v.map(q => [q[0], q[1], q[2]]), c: t.c, col};
      });
      parts.push({sym: p.symbol, cols: P.cols.map(c => ({rgba: c.rgba, rom: 0})), tris, bb: P.bb});
    }
    models[info.title.toLowerCase()] = {b: {}, s: [], p: parts.map(q => ({s: q.sym, r: 0, j: 'demo', v: [], t: [], demo: {cols: q.cols, tris: q.tris.map(t => ({v: t.v, c: t.c})), bb: q.bb}}))};
    if (sheetDir) {  // contact sheet: one 128px cell per part in order; 8 columns
      const cols = 8, rows = Math.ceil(parts.length / cols), W = cols * 128, img = new Uint8ClampedArray(W * rows * 128 * 4);
      parts.forEach((q, i) => { const cell = render(q.tris, 128, 0.55, 0.2), ox = (i % cols) * 128, oy = Math.floor(i / cols) * 128;
        for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) img.set(cell.subarray((y * 128 + x) * 4, (y * 128 + x) * 4 + 4), ((oy + y) * W + ox + x) * 4); });
      fs.mkdirSync(sheetDir, {recursive: true}); fs.writeFileSync(path.join(sheetDir, name + '.png'), png(W, rows * 128, img));
      console.log(name, parts.map((q, i) => i + ':' + q.sym + '(' + q.tris.length + ')').join(' '));
    }
    if (!info.head) continue;
    const head = parts.find(q => q.sym === info.head);
    if (!head) throw Error(name + ': head part ' + info.head + ' not found');
    heads[name] = png(128, 128, render(head.tris, 128, 0.55, 0.2));
  }
  return {models, heads};
}

(async () => {
  const [romPath, tablePath, flag, sheetDir] = process.argv.slice(2);
  if (!romPath || !tablePath) { console.error('usage: node build_demo_assets.js ROM.z64 animal_table.json [--sheet DIR]'); process.exit(2); }
  const rom = new Uint8Array(fs.readFileSync(romPath)), table = JSON.parse(fs.readFileSync(tablePath, 'utf8'));
  if (crypto.createHash('sha1').update(rom).digest('hex') !== LevelRom.SHA1) throw Error('Need the unmodified US 1.0 .z64 (SHA1 ' + LevelRom.SHA1 + ')');
  fs.mkdirSync(path.join(out, 'heads'), {recursive: true});
  const lv = await levelBundle(rom);
  fs.writeFileSync(path.join(out, `level-${LEVEL_ID}.json`), JSON.stringify(lv.bundle));
  console.log(`level ${LEVEL_ID}: prop types ${lv.types.join(',')} | models bundled ${lv.modelled.join(',')}`);
  const an = animals(rom, table, flag === '--sheet' ? sheetDir : null);
  fs.writeFileSync(path.join(out, 'animals.json'), JSON.stringify({format: 'sssv-demo-animals-v1', models: an.models}));
  for (const [n, buf] of Object.entries(an.heads)) fs.writeFileSync(path.join(out, 'heads', n + '.png'), buf);
  for (const [n, m] of Object.entries(an.models)) console.log(n, m.p.length + ' parts', m.p.reduce((s, p) => s + p.demo.tris.length, 0) + ' tris');
})();
