'use strict';
// Build panel (src/web/play-build.js) with a fake SSSVBuilder/SSSVPlay, and the editor handoff (src/web/handoff.js),
// both in a vm sandbox. No Pyodide, emulator or ROM is involved.
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const tick = () => new Promise(resolve => setImmediate(resolve));
const ORIGIN = 'https://site.test';

let registry = {};
function element(id) {
  const listeners = {};
  return { id, files: [], checked: false, disabled: false, hidden: id === 'b-progress' || id === 'b-received' || id === 'b-log-box',
    value: 0, textContent: '', listeners, style: {}, children: [], addEventListener: (type, fn) => { listeners[type] = fn; },
    insertAdjacentElement(where, el) { this.after = el; if (el.id) registry[el.id] = el; }, append(...items) { this.children.push(...items); },
    remove() { delete registry[this.id]; }, click() { this.clicked = (this.clicked || 0) + 1; } };
}

function panel(builder) {
  const ids = ['b-rom', 'b-level', 'b-parts', 'b-relocate', 'b-new-animals', 'b-go', 'b-ips', 'b-out', 'b-progress', 'b-status',
    'b-received', 'b-log-box', 'b-log', 'build', 'screen', 'setup'];
  const elements = registry = Object.fromEntries(ids.map(id => [id, element(id)]));
  const started = [], downloads = [], winListeners = {};
  class FakeBlob { constructor(parts) { this.parts = parts; this.size = parts[0].byteLength; } slice() { return this; } }
  const window = {
    addEventListener: (type, fn) => { winListeners[type] = fn; },
    SSSVBuilder: builder,
    SSSVPlay: { startGame: async (blob, name) => { started.push([blob, name]); } },
  };
  const context = { window, Blob: FakeBlob, location: { origin: ORIGIN }, setTimeout: fn => fn(),
    URL: { createObjectURL: blob => 'blob:' + downloads.length, revokeObjectURL() {} },
    document: { getElementById: id => elements[id], createElement: tag => tag === 'a' ? ({ click() { downloads.push(this.download); } }) : element('') } };
  vm.runInNewContext(fs.readFileSync('src/web/play-build.js', 'utf8'), context);
  const choose = (id, file) => { elements[id].files = file ? [file] : []; elements[id].listeners.change(); };
  const send = async (data, origin = ORIGIN) => { winListeners.message({ origin, data }); await tick(); };
  return { elements: elements, el: elements, started, downloads, window, choose, send, FakeBlob };
}

function fakeBuilder(outcome) {
  const calls = [];
  return { calls, build: async (input, hooks) => {
    calls.push(input);
    for (const stage of ['runtime', 'rom', 'levels', 'ips', 'done']) hooks.onProgress({ stage, detail: 'stage ' + stage, ms: 1 });
    if (outcome instanceof Error) throw outcome;
    return outcome;
  } };
}

(async () => {
  const romFile = { name: 'stock.z64', size: 16 << 20, slice() { return this; } };
  const levelFile = { name: 'edits.json', size: 10, text: async () => '{}' };
  const partsFile = { name: 'bear.json', size: 10, text: async () => '{}' };
  const built = { rom: { size: 8192, tag: 'rom' }, ips: { size: 20, tag: 'ips' }, romSha1: 'ab'.repeat(20), sourceSha1: 'cd'.repeat(20),
    log: ['bear: 3 colour words', 'bear: mesh ok'], timings: { total: 2500 } };

  // Wiring: Build & Play needs a ROM and at least one edit file; inputs, Advanced options and progress reach the builder.
  let builder = fakeBuilder(built), p = panel(builder);
  assert.equal(p.el['b-go'].disabled, true);
  p.choose('b-rom', romFile);
  assert.equal(p.el['b-go'].disabled, true);
  p.choose('b-parts', partsFile);
  assert.equal(p.el['b-go'].disabled, false);
  assert.equal(p.el['b-ips'].disabled, true);
  p.el['b-new-animals'].checked = true;
  await p.el['b-go'].listeners.click();
  assert.equal(builder.calls.length, 1);
  const input = builder.calls[0];
  assert.equal(input.rom, romFile); assert.equal(input.parts, partsFile); assert.equal(input.level, undefined);
  assert.equal(input.relocate, false); assert.equal(input.newAnimals, true);
  assert.equal(p.el['b-progress'].value, 7);
  assert.equal(p.started.length, 1);
  assert.equal(p.started[0][0], built.rom); assert.equal(p.started[0][1], 'patched.z64');
  assert.match(p.el['b-status'].textContent, /Built in 2\.5 s\. Patched ROM SHA1 abab/);
  assert.equal(p.el['b-log-box'].hidden, false);
  assert.equal(p.el['b-log'].textContent, 'bear: 3 colour words\nbear: mesh ok');
  assert.equal(p.el['b-ips'].disabled, false); assert.equal(p.el['b-out'].disabled, false);
  p.el['b-ips'].listeners.click(); p.el['b-out'].listeners.click();
  assert.deepEqual(p.downloads, ['sssv-patch.ips', 'sssv-patched.z64']);
  // A new input invalidates the previous result.
  p.choose('b-level', levelFile);
  assert.equal(p.el['b-ips'].disabled, true);

  // Errors: the CLI's wrong-ROM messages get a hint; nothing starts; the button is usable again.
  const cases = [
    ['Animal builds require the unmodified US 1.0 ROM for their expected-byte safeguards', /^Wrong ROM for Parts edits: .*SHA1 e5e09205/],
    ['Level edits do not match the original ROM SHA1', /^Wrong ROM for these edits: .*exact ROM the level edits were made from/],
    ['Project version or source ROM mismatch', /^Wrong ROM for these edits/],
    ['Use a US SSSV ROM, not a different game or region', /^This is not a usable SSSV ROM/],
    ['Unrecognized N64 ROM byte order', /^This is not a usable SSSV ROM/],
    ['New animal records need --new-animals (appended spawns are not game-verified)', /Advanced > Allow added animals/],
    ['Level 3 needs relocation; use --relocate for level-only builds', /turn on Advanced > Relocate level data/],
    ['Pyodide download failed (offline). Check your connection or content blocker, then retry.', /^Pyodide download failed/],
    ['Parts config: needs an "animal" key', /^Build failed: Parts config/],
  ];
  for (const [message, expected] of cases) {
    p = panel(fakeBuilder(new Error(message)));
    p.choose('b-rom', romFile); p.choose('b-level', levelFile);
    await p.el['b-go'].listeners.click();
    assert.match(p.el['b-status'].textContent, expected, message);
    assert.equal(p.started.length, 0);
    assert.equal(p.el['b-go'].disabled, false);
    assert.equal(p.el['b-progress'].hidden, true);
    assert.equal(p.el['b-out'].disabled, true);
  }

  // Handoff: same-origin {type:'sssv-build'} fills the panel; the ROM may come along as a Blob or ArrayBuffer.
  builder = fakeBuilder(built); p = panel(builder);
  const project = { format: 'sssv-workspace-project', version: 1, rom_sha1: 'x', parts: null, level_diff: {} };
  for (const bad of [null, 'x', { type: 'sssv-rom', level: project }, { type: 'sssv-build' }, { type: 'sssv-build', level: [1] },
    { type: 'sssv-build', level: project, rom: 'bytes' }, { type: 'sssv-build', parts: 5 }, { type: 'sssv-build', level: '' }])
    await p.send(bad);
  await p.send({ type: 'sssv-build', level: project }, 'https://evil.test');
  assert.equal(p.el['b-received'].hidden, true);
  await p.send({ type: 'sssv-build', level: project, levelName: 'Level Editor project', source: 'Level Editor' });
  assert.equal(p.el['b-received'].hidden, false);
  assert.equal(p.el['b-received'].textContent, 'Received from Level Editor: level edits.');
  assert.match(p.el['b-status'].textContent, /choose your ROM/);
  assert.equal(p.el['b-go'].disabled, true);
  p.choose('b-rom', romFile);
  assert.equal(p.el['b-go'].disabled, false);
  await p.el['b-go'].listeners.click();
  assert.equal(builder.calls[0].level, project); assert.equal(builder.calls[0].rom, romFile);
  assert.equal(p.started.length, 1);

  builder = fakeBuilder(built); p = panel(builder);
  const buffer = new Uint8Array(8192).buffer;
  await p.send({ type: 'sssv-build', parts: { animal: 'bear', recolor: {} }, partsName: 'bear.json', rom: buffer, source: 'Model Editor' });
  assert.equal(p.el['b-rom'].disabled, true, 'handed-off ROM picker is greyed out');
  assert.equal(p.el['b-parts'].disabled, true, 'handed-off parts picker is greyed out');
  assert.equal(p.el['b-level'].disabled, false, 'level picker stays usable');
  assert.equal(p.el.setup.disabled, true, 'local ROM fieldset is greyed out');
  assert.match(p.el['b-parts'].after.children[0].textContent, /^Loaded: bear\.json/);
  assert.equal(p.el['b-received'].textContent, 'Received from Model Editor: Parts config, its loaded ROM.');
  assert.match(p.el['b-status'].textContent, /^ROM: ROM from Model Editor · Parts: bear\.json\. Press Build & Play\.$/);
  assert.equal(p.el['b-go'].disabled, false);
  await p.el['b-go'].listeners.click();
  assert.ok(builder.calls[0].rom instanceof p.FakeBlob);
  assert.equal(builder.calls[0].rom.size, 8192);
  assert.deepEqual(builder.calls[0].parts, { animal: 'bear', recolor: {} });
  assert.equal(p.started.length, 1);

  // handoff.js: opens play.html, waits for its ready message (right window, right origin), then posts once.
  const opened = [], posted = [], listeners = new Set();
  const child = { postMessage: (m, o) => posted.push([m, o]) };
  const host = { location: { origin: ORIGIN }, open: (url, target) => { opened.push([url, target]); return child; },
    addEventListener: (t, fn) => listeners.add(fn), removeEventListener: (t, fn) => listeners.delete(fn) };
  const timers = [];
  const ctx = { window: host, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} };
  vm.runInNewContext(fs.readFileSync('src/web/handoff.js', 'utf8'), ctx);
  const rom = { size: 1, slice() {} };
  assert.throws(() => host.SSSVHandoff.openPlay({}), /Nothing to build/);
  host.SSSVHandoff.openPlay({ level: project, levelName: 'Level Editor project', rom, source: 'Level Editor', extra: 'dropped' });
  assert.deepEqual(opened, [['play.html', '_blank']]);
  const fire = (source, origin, data) => { for (const fn of Array.from(listeners)) fn({ source, origin, data }); };
  fire({}, ORIGIN, { type: 'sssv-play-ready' });            // another window
  fire(child, 'https://evil.test', { type: 'sssv-play-ready' });
  fire(child, ORIGIN, { type: 'other' });
  assert.equal(posted.length, 0);
  fire(child, ORIGIN, { type: 'sssv-play-ready' });
  fire(child, ORIGIN, { type: 'sssv-play-ready' });        // posts only once
  assert.equal(posted.length, 1);
  assert.equal(posted[0][1], ORIGIN);
  assert.equal(JSON.stringify(Object.keys(posted[0][0])), JSON.stringify(['type', 'level', 'levelName', 'rom', 'source']));
  assert.equal(posted[0][0].type, 'sssv-build'); assert.equal(posted[0][0].rom, rom);
  assert.equal(listeners.size, 0);
  host.open = () => null;
  assert.throws(() => host.SSSVHandoff.openPlay({ parts: {} }), /blocked the Play window/);
  host.location.origin = 'null';
  assert.throws(() => host.SSSVHandoff.openPlay({ parts: {} }), /served over http/);

  // End to end: what handoff.js posts is what play-build.js accepts.
  p = panel(fakeBuilder(built));
  await p.send(posted[0][0]);
  assert.equal(p.el['b-received'].textContent, 'Received from Level Editor: level edits, its loaded ROM.');
  assert.equal(p.el['b-go'].disabled, false);
  console.log('Build panel wiring, progress, log, downloads, wrong-ROM hints, handoff validation and editor handoff passed.');
})().catch(error => { console.error(error); process.exit(1); });
