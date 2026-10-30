// Check the shared raster masks using synthetic RGBA pixels, without game data.
const assert = require('assert');
const {recolorPixels, quotes, draw} = require('../tools/release_banner.js');
const original = [0, 0, 128, 255, 200, 200, 100, 255, 255, 0, 10, 255, 0, 0, 128, 0];
const recolor = mode => {
  const pixels = Uint8ClampedArray.from(original);
  recolorPixels(pixels, 4, '#6496c8', mode);
  return Array.from(pixels);
};
assert.deepStrictEqual(recolor('original'), original);
assert.deepStrictEqual(recolor('head'), [65, 98, 130, 255, ...original.slice(4)]);
assert.deepStrictEqual(recolor('ears'), [...original.slice(0, 4), 90, 135, 180, 255, ...original.slice(8)]);
assert.deepStrictEqual(recolor('both'), [65, 98, 130, 255, 90, 135, 180, 255, ...original.slice(8)]);
const boundary = new Uint8ClampedArray(41 * 4);
boundary.set([200, 200, 100, 255], 39 * 4);
boundary.set([200, 200, 100, 255], 40 * 4);
recolorPixels(boundary, 1, '#6496c8', 'ears');
assert.deepStrictEqual(Array.from(boundary.slice(39 * 4)), [90, 135, 180, 255, 200, 200, 100, 255]);
// A very long title still fits; renderer never depends on a named system font.
const text = [];
const ctx = {fillRect() {}, measureText: () => ({width: 10000}),
  fillText: (...args) => text.push(args)};
const canvas = {getContext: () => ctx};
draw(canvas, {name: '日本語', version: 'LABEL', accent: '#6496c8', style: 'japanese'}, null);
assert.deepStrictEqual([canvas.width, canvas.height], [1500, 500]);
assert.strictEqual(text[1][0], '「日本語」 edition');
assert.strictEqual(text[1][3], 890);
assert.strictEqual(Object.keys(quotes).length, 5);
console.log('Banner masks, transparency, ear boundary, Unicode title and title bounds passed.');
