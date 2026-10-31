// Called by test_live_deform.py with fresh Python expectations on stdin.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const standalone = require('../tools/viewer/js/deform.js');
const source = fs.readFileSync(path.join(__dirname, '../tools/viewer/js/app.js'), 'utf8');
const start = '//#PURE-START', end = '//#PURE-END';
assert.strictEqual(source.split(start).length, 2, 'need exactly one PURE-START marker');
assert.strictEqual(source.split(end).length, 2, 'need exactly one PURE-END marker');
assert(source.indexOf(start) < source.indexOf(end), 'pure markers out of order');
const live = vm.createContext({});
vm.runInContext(source.split(start)[1].split(end)[0], live, {timeout: 1000});
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const ranges = c => c.ranges || [[0, c.verts.length]];
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0, rejected = 0;
for (const c of cases) {
  for (const mode of ['live', 'standalone']) {
    let actual, error;
    try {
      if (mode === 'live') {
        // Vertices carry their id in .o (as parseDL does); groups share them when ranges overlap.
        const vo = c.verts.map((v, i) => Object.assign(v.slice(), {o: 16 * i}));
        const part = {tris: [], bb: [], groups: ranges(c).map(([s, n]) => ({verts: vo.slice(s, s + n)}))};
        const prepared = live.deformPrepare(part, null, c.entries);
        actual = {
          out: vo.map(v => live.deformPoint(prepared, v, [v[0], v[1], v[2]])),
          before: prepared.before, after: prepared.after, clamped: prepared.clip,
        };
      } else {
        let points = c.verts, before, after, clamped = 0;
        for (const entry of c.entries) {
          const groups = ranges(c).map(([s, n]) => points.slice(s, s + n).map((p, k) => ({o: s + k, p})));
          const result = standalone.planDeformGroups(groups, entry);
          if (!before) before = result.bboxBefore;
          points = points.map(p => p.slice());
          result.offsets.forEach((o, k) => { points[o] = result.verts[k]; });
          after = result.bboxAfter; clamped += result.clamped;
        }
        actual = {out: points, before, after, clamped};
      }
    } catch (e) { error = e; }
    if (c.error) {
      assert(error, `${mode} accepted Python-rejected case ${c.name}`);
    } else {
      assert.ifError(error);
      assert.deepStrictEqual(plain(actual),
        {out: c.out, before: c.before, after: c.after, clamped: c.clamped},
        `${mode} disagrees with current Python builder: ${c.name}`);
    }
  }
  if (c.error) rejected++; else passed++;
}
console.log(`Fresh deform parity (live + standalone): ${passed} identical, ${rejected} rejected by all, 0 differences.`);
