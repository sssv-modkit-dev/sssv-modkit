// node tests/test_deform_parity.js -> compares the standalone deform module with Python golden vectors.
const fs = require('fs'), path = require('path'), D = require('../tools/viewer/js/deform.js');
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'deform_golden.json'), 'utf8'));
let ok = 0, bad = 0, err = 0, maxdiff = 0;
cases.forEach((c, i) => {
  let r; try { r = D.planDeform(c.verts, c.entry); } catch (e) { if (c.error) { err++; return; } bad++; console.log('case', i, 'JS threw', e.message); return; }
  if (c.error) { bad++; console.log('case', i, 'Python rejected but JS accepted'); return; }
  let same = r.clamped === c.clamped && r.verts.length === c.out.length;
  r.verts.forEach((v, k) => v.forEach((x, j) => { const d = Math.abs(x - c.out[k][j]); maxdiff = Math.max(maxdiff, d); if (d) same = false; }));
  if (same) ok++; else { bad++; if (bad < 6) console.log('MISMATCH case', i, JSON.stringify(c.entry)); }
});
console.log(`${cases.length} cases: ${ok} identical, ${err} both-rejected, ${bad} different (max coord diff ${maxdiff})`);
process.exit(bad ? 1 : 0);
