/* Level gallery: cards with a top-down thumbnail, name and animal head icons. Pure display; no file access. */
const LevelGallery = (() => {
  const HEADS = {Bear: 'bear', Dog: 'dog', Fox: 'fox', Sheep: 'sheep', Seagull: 'seagull'};  // packs may add more names (Object.assign)
  const b64 = (s, T) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
  /* Level ground spans x 256..4352 and y 512..6656 (65 x 97 cells of 64 units). Painter's order by height, vertex colours only. */
  function thumbnail(level, width = 112, height = 168) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'), pos = b64(level.pos, Int32Array), col = b64(level.col, Uint8Array);
    ctx.fillStyle = '#0d1424'; ctx.fillRect(0, 0, width, height);
    const [x0, y0, , x1, y1] = level.bb, sx = (width - 6) / Math.max(1, x1 - x0), sy = (height - 6) / Math.max(1, y1 - y0), s = Math.min(sx, sy);
    const ox = (width - (x1 - x0) * s) / 2, oy = (height - (y1 - y0) * s) / 2, tris = [];
    for (let t = 0; t < level.n; t += 3) tris.push([t, (pos[t * 3 + 2] + pos[t * 3 + 5] + pos[t * 3 + 8]) / 3]);
    tris.sort((a, b) => a[1] - b[1]);
    for (const [t] of tris) {
      const c = [0, 1, 2].map(k => Math.min(255, [0, 1, 2].reduce((a, v) => a + col[(t + v) * 3 + k], 0) / 3 * 1.4 | 0));
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = .6;
      ctx.beginPath();
      for (let v = 0; v < 3; v++) { const x = ox + (pos[(t + v) * 3] - x0) * s, y = height - oy - (pos[(t + v) * 3 + 1] - y0) * s; v ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    return canvas;
  }
  function animalNames(records) {
    const seen = [];
    for (const hex of records?.animals || []) { const n = LevelSelection.name('animals', parseInt(hex.slice(0, 4), 16)); if (!seen.includes(n)) seen.push(n); }
    return seen;
  }
  function el(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag); Object.assign(e, attrs);
    for (const k of kids) e.append(k); return e;
  }
  /* Fill `list` with one card per level. onPick(index) is called when a card is chosen. */
  function render(list, data, onPick, headBase = '') {
    list.replaceChildren();
    data.LEVELS.forEach((level, index) => {
      const records = data.EDITOR_STOCK[level.id], names = animalNames(records);
      const heads = el('span', {className: 'card-heads'});
      for (const key of new Set(names.map(n => HEADS[n]).filter(Boolean))) {
        if (!headBase) continue;  // packs without icons show names only
        const img = el('img', {src: headBase + key + '.png', alt: '', width: 28, height: 28}); img.onerror = () => img.remove(); heads.append(img);
      }
      const card = el('button', {className: 'card', type: 'button', title: 'Open level ' + level.id},
        el('span', {className: 'card-thumb'}, thumbnail(level)),
        el('strong', {textContent: 'Level ' + level.id}),
        el('small', {textContent: `${level.n / 3} tris · ${records.props.length} props · ${records.animals.length} animals`}),
        el('small', {className: 'card-animals', textContent: names.length ? names.join(', ') : 'no animals'}), heads);
      card.dataset.index = index; card.onclick = () => onPick(index); list.append(card);
    });
  }
  function mark(list, index) { for (const c of list.children) c.setAttribute('aria-current', c.dataset.index == index ? 'true' : 'false'); }
  return {thumbnail, animalNames, render, mark, HEADS};
})();
if (typeof module !== 'undefined') module.exports = LevelGallery;
