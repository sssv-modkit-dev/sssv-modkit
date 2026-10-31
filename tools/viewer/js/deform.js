/* deform.js - JS port of plan_deform() from tools/make_animal_mods.py, for live preview in the viewer.
 * SAME maths and SAME rounding as the builder (tests/test_deform_parity.js proves it against golden vectors made by the Python).
 * Pure functions, no DOM, no ROM access.  Works as a browser global (SSSVDeform) and as a Node module.
 *
 *   const r = SSSVDeform.planDeform(verts, entry);
 *     verts : [[x,y,z], ...]  int16 vertex positions of the SELECTED vertices (same order you will draw them)
 *     entry : the config's deform entry, e.g. {"about":[x,y,z], "ops":[{"type":"taper",...}, ...]}  ("symbol" is the caller's job; for "groups" use planDeformGroups)
 *   -> { verts: [[x,y,z],...] (rounded + clamped like the ROM), bboxBefore:[lo,hi], bboxAfter:[lo,hi], clamped:n }
 * Throws Error with the same wording as the builder's SystemExit messages for bad configs (show them in the UI). */
(function (root) {
  var AXIS = { x: 0, y: 1, z: 2 };
  function ax(v, what) { v = String(v).toLowerCase(); if (!(v in AXIS)) throw new Error('deform: bad ' + what + ' "' + v + '" (use x, y or z)'); return AXIS[v]; }
  function planDeform(verts, d) {
    if (!verts.length) throw new Error('deform selects no vertices');
    var P = verts.map(function (v) { return [+v[0], +v[1], +v[2]]; });
    var lo = [0, 1, 2].map(function (k) { return Math.min.apply(null, P.map(function (p) { return p[k]; })); });
    var hi = [0, 1, 2].map(function (k) { return Math.max.apply(null, P.map(function (p) { return p[k]; })); });
    var ctr = d.about || [0, 1, 2].map(function (k) { return (lo[k] + hi[k]) / 2; });
    if (ctr.length !== 3) throw new Error('deform "about" needs 3 numbers');
    (d.ops || []).forEach(function (op) {
      var ty = op.type, rg = op.range || [0, 1], r0 = rg[0], r1 = rg[1];
      if (!(0 <= r0 && r0 < r1 && r1 <= 1)) throw new Error('deform range must satisfy 0 <= a < b <= 1: ' + JSON.stringify(op));
      var a = 0, span = 0, frac = null, ramp = null;
      if (ty === 'taper' || ty === 'twist' || ty === 'bend' || (ty === 'inflate' && op.range)) {
        a = ax(op.axis, 'axis'); span = hi[a] - lo[a];
        frac = function (p) { return span > 0 ? (p[a] - lo[a]) / span : 0.5; };
        ramp = function (p) { return Math.min(1, Math.max(0, (frac(p) - r0) / (r1 - r0))); };
      }
      if (ty === 'taper') {
        var s0 = op.from == null ? 1 : +op.from, s1 = op.to == null ? 1 : +op.to;
        P.forEach(function (p) { var s = s0 + (s1 - s0) * ramp(p); for (var k = 0; k < 3; k++) if (k !== a) p[k] = ctr[k] + (p[k] - ctr[k]) * s; });
      } else if (ty === 'twist') {
        var u = (a + 1) % 3, v = (a + 2) % 3, deg = (+op.degrees) * Math.PI / 180;
        P.forEach(function (p) { var t = deg * ramp(p), c = Math.cos(t), s = Math.sin(t), du = p[u] - ctr[u], dv = p[v] - ctr[v];
          p[u] = ctr[u] + du * c - dv * s; p[v] = ctr[v] + du * s + dv * c; });
      } else if (ty === 'bend') {
        var tws = String(op.toward == null ? '' : op.toward).toLowerCase(), sgn = tws.charAt(0) === '-' ? -1 : 1, tw = ax(tws.replace(/^[+-]+/, ''), 'toward');
        if (tw === a) throw new Error('bend "toward" must differ from "axis": ' + JSON.stringify(op));
        var th = (+op.degrees) * Math.PI / 180;
        if (th === 0 || span <= 0) return;
        var start = lo[a] + r0 * span, L = (r1 - r0) * span, R = L / th;
        P.forEach(function (p) {
          var s = p[a] - start, phi = th * Math.min(Math.max(s, 0), L) / L, extra = Math.max(0, s - L), pre = Math.min(0, s), dd = sgn * (p[tw] - ctr[tw]);
          p[a] = start + R * Math.sin(phi) - dd * Math.sin(phi) + extra * Math.cos(phi) + pre;
          p[tw] = ctr[tw] + sgn * (R * (1 - Math.cos(phi)) + dd * Math.cos(phi) + extra * Math.sin(phi));
        });
      } else if (ty === 'inflate') {
        var f = op.amount == null ? 1 : +op.amount, axes = String(op.axes == null ? 'xyz' : (Array.isArray(op.axes) ? op.axes.join('') : op.axes)).split('').map(function (c) { return ax(c, 'axes'); });
        P.forEach(function (p) { var w = !op.range ? 1 : ((r0 <= frac(p) && frac(p) <= r1) ? 1 : 0), k_ = 1 + (f - 1) * w; axes.forEach(function (k) { p[k] = ctr[k] + (p[k] - ctr[k]) * k_; }); });
      } else throw new Error('unknown deform op type "' + ty + '" (taper, twist, bend, inflate)');
    });
    var clamped = 0, out = P.map(function (p) { return p.map(function (c) { var x = Math.floor(c + 0.5); if (x < -32768 || x > 32767) { clamped++; x = Math.max(-32768, Math.min(32767, x)); } return x; }); });
    var lo2 = [0, 1, 2].map(function (k) { return Math.min.apply(null, out.map(function (p) { return p[k]; })); });
    var hi2 = [0, 1, 2].map(function (k) { return Math.max.apply(null, out.map(function (p) { return p[k]; })); });
    return { verts: out, bboxBefore: [lo, hi], bboxAfter: [lo2, hi2], clamped: clamped };
  }
  /* Group selection like the builder: groups = [[{o, p:[x,y,z]}, ...], ...] (vertex groups of the part; o = unique vertex id, e.g. ROM offset).
   * entry.groups (optional) lists group indices; default is all. Each unique vertex is deformed once. -> planDeform result plus offsets (same order as verts). */
  function planDeformGroups(groups, entry) {
    var idx = entry.groups || groups.map(function (_, i) { return i; }), seen = {}, offs = [], pts = [];
    idx.forEach(function (i) {
      if (!groups[i]) throw new Error('deform "groups" index ' + i + ' is out of range');
      groups[i].forEach(function (q) { if (!seen[q.o]) { seen[q.o] = 1; offs.push(q.o); pts.push(q.p); } });
    });
    var r = planDeform(pts, entry); r.offsets = offs; return r;
  }
  var api = { planDeform: planDeform, planDeformGroups: planDeformGroups };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SSSVDeform = api;
})(typeof window !== 'undefined' ? window : this);
