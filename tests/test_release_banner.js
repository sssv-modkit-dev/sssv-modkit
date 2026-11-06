// Check the shared raster masks using synthetic RGBA pixels, without game data.
const assert = require('assert');
const {recolorPixels, twoTonePixels, quotes, styleOf, draw} = require('../src/release_banner.js');
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
assert.deepStrictEqual([canvas.width, canvas.height], [1500, 250]);
assert.strictEqual(text[1][0], '「日本語」 edition');
assert.strictEqual(text[1][3], 890);
assert.strictEqual(Object.keys(quotes).length, 5);
assert.deepStrictEqual(Object.keys(quotes), ['anglo', 'francophone', 'romance', 'central-european', 'east-asian']);
assert.strictEqual(styleOf('german'), 'central-european'); assert.strictEqual(styleOf('nope'), 'anglo');
// Version line is lower case; there is no top-left accent bar (only the two rules at y=205).
const rects = []; const ctx2 = {fillRect: (...a) => rects.push(a), measureText: () => ({width: 10}), fillText: (...args) => text.push(args)};
text.length = 0;
draw({getContext: () => ctx2}, {name: 'X', version: 'PRE-ALPHA v0.01', accent: '#6496c8', style: 'anglo'}, null);
assert.strictEqual(text[2][0], 'pre-alpha v0.01');
assert.deepStrictEqual(rects.map(r => r[1]), [0, 205, 205]);
// Two-tone fox: red body -> bold, white snout -> light, black nose kept; shading kept relative to the role mean.
const fox = Uint8ClampedArray.from([220, 10, 10, 255, 110, 5, 5, 255, 230, 230, 230, 255, 0, 0, 0, 255, 220, 10, 10, 0]);
const n = twoTonePixels(fox, 5, 'fox', '#5b21b6', '#c9b0ff');
assert.deepStrictEqual([n.body, n.accent], [2, 1]);
assert.ok(fox[2] > fox[0] && fox[6] < fox[2], 'body is violet and darker where the source was darker');
assert.deepStrictEqual(Array.from(fox.slice(8, 16)), [201, 176, 255, 255, 0, 0, 0, 255]);
assert.deepStrictEqual(Array.from(fox.slice(16)), [220, 10, 10, 0]);
assert.throws(() => twoTonePixels(fox, 5, 'yeti', '#000000', '#ffffff'), /Unknown head/);
console.log('Banner masks, two-tone heads, quote traditions, lower-case version, transparency, ear boundary, Unicode title and title bounds passed.');
