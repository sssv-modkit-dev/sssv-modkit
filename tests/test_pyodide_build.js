'use strict';
// Pyodide builder smoke test (ROM-free). Runs src/web/builder-core.js, the same entry builder-worker.js uses, in Node
// with the `pyodide` npm package and checks it reproduces tests/fixtures/builds byte for byte. Then it drives
// builder-worker.js itself (vm sandbox, real Pyodide) on a synthetic 36-stage ROM and compares with the Python CLI,
// and checks the page client builder.js against a fake worker.
// Pyodide is not a repo dependency: set SSSV_PYODIDE to an installed package directory (npm install pyodide@VERSION),
// or have `pyodide` resolvable from here. Without it the test prints SKIP and exits 0.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const core = require(path.join(SRC, 'web', 'builder-core.js'));
const sha = (algo, bytes) => crypto.createHash(algo).update(bytes).digest('hex');

function findPyodide() {
  for (const spec of [process.env.SSSV_PYODIDE, 'pyodide'].filter(Boolean)) {
    try {
      const dir = path.dirname(require.resolve(path.isAbsolute(spec) ? path.join(spec, 'package.json') : spec + '/package.json'));
      const version = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
      return { loadPyodide: require(dir).loadPyodide, version };
    } catch (error) { /* try the next location */ }
  }
  return null;
}

function makeRom(spec) {
  const rom = new Uint8Array(spec.size);
  for (let i = 0; i < spec.size; i++) rom[i] = (i * spec.fill.mul + spec.fill.add) & 0xFF;
  for (const w of spec.writes) rom.set(Buffer.from(w.hex, 'hex'), w.offset);
  return rom;
}

function applyIps(source, ips) {
  assert.equal(Buffer.from(ips.subarray(0, 5)).toString(), 'PATCH');
  let out = Buffer.from(source), p = 5;
  while (Buffer.from(ips.subarray(p, p + 3)).toString() !== 'EOF') {
    const off = (ips[p] << 16) | (ips[p + 1] << 8) | ips[p + 2], len = (ips[p + 3] << 8) | ips[p + 4];
    assert.notEqual(len, 0, 'no RLE hunks expected');
    if (off + len > out.length) out = Buffer.concat([out, Buffer.alloc(off + len - out.length)]);
    out.set(ips.subarray(p + 5, p + 5 + len), off);
    p += 5 + len;
  }
  return out;
}

// Synthetic US-shaped ROM with 36 small valid stages so strict mode (the worker's only mode) accepts it.
const STRICT_ROM_PY = `
import struct, build_levels as levels, level_rnc_pack as packer
def strict_rom():
    rom = bytearray((i * 5 + 1) & 0xFF for i in range(0x800000))
    rom[0:4] = bytes.fromhex('80371240'); rom[0x3B:0x3F] = b'NSVE'
    pos = 0x100000
    for level in range(1, 37):
        props = struct.pack('>H', 2) + bytes((level * 3 + k) & 0xFF for k in range(44))
        animals = struct.pack('>H', 1) + bytes((level + k) & 0xFF for k in range(16))
        body = b'\\x00' + packer.pack_best(props) + b'\\x01' + struct.pack('>I', len(animals)) + animals + b'\\x03' + bytes(8)
        packed = packer.pack_best(body)
        size = len(packed) + 64
        rom[pos:pos + size] = packed + bytes(64)
        struct.pack_into('>II', rom, levels.TABLE + (level - 1) * 8, pos, pos + size)
        pos = (pos + size + 15) & ~15
    return bytes(rom)
strict_rom()
`;

async function fixtureCases(rt) {
  const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/builds/builds.json'), 'utf8'));
  for (const c of fixtures.cases) {
    const rom = makeRom(c.rom);
    assert.equal(sha('sha256', rom), c.rom_sha256, c.name + ': synthetic input ROM');
    const request = c.kind === 'level-diff'
      ? { rom, level: c.inputs.diff, options: { relocate: c.inputs.relocate, strict: false } }
      : { rom, parts: { animals: c.inputs.configs }, options: { table: c.inputs.table, strict: false } };
    const stages = [], start = Date.now();
    const out = core.runBuild(rt, request, stage => stages.push(stage));
    const ms = Date.now() - start;
    assert.equal(out.rom.length, c.outputs.rom_size, c.name + ': ROM size');
    assert.equal(sha('sha256', out.rom), c.outputs.rom_sha256, c.name + ': ROM sha256');
    assert.equal(out.ips.length, c.outputs.ips_size, c.name + ': IPS size');
    assert.equal(sha('sha256', out.ips), c.outputs.ips_sha256, c.name + ': IPS sha256');
    if (c.outputs.ips_hex) assert.equal(Buffer.from(out.ips).toString('hex'), c.outputs.ips_hex);
    assert.equal(out.romSha1, sha('sha1', out.rom));
    assert.deepEqual(stages, c.kind === 'level-diff' ? ['rom', 'levels', 'ips'] : ['rom', 'animals', 'ips']);
    console.log('  fixture ' + c.name + ': ROM and IPS match (' + ms + ' ms)');
  }
  // Strict mode refuses the same synthetic inputs with the CLI's own messages.
  const level = fixtures.cases[0];
  assert.throws(() => core.runBuild(rt, { rom: makeRom(level.rom), level: level.inputs.diff }), /Stage 3: unsupported or damaged level table/);
  const animal = fixtures.cases[1];
  assert.throws(() => core.runBuild(rt, { rom: makeRom(animal.rom), parts: { animals: animal.inputs.configs } }), /8-16 MB SSSV US ROM/);
  assert.throws(() => core.runBuild(rt, { rom: makeRom(animal.rom), parts: '{bad', options: { strict: false } }), /Parts config is not valid JSON/);
  assert.throws(() => core.runBuild(rt, { rom: makeRom(animal.rom), parts: {}, options: { strict: false } }), /needs an "animal" key/);
  assert.throws(() => core.runBuild(rt, { rom: makeRom(animal.rom), options: { strict: false } }), /Give a level project/);
}

// Synthetic overlay with one hand-assembled bear draw call and a display list in model bank 0, so the animal table is
// derived from the ROM (animal_rom.py) inside the build, as the worker does. Shared by Pyodide and CPython below.
const ANIMAL_ROM_PY = `
import struct, animal_rom as ar
def synthetic_animal_rom():
    rom = bytearray(0x800000)
    def put(off, words):
        for i, x in enumerate(words): struct.pack_into('>I', rom, off + 4 * i, x)
    lui = lambda rt, imm: 0x3C000000 | rt << 16 | imm
    addiu = lambda rt, rs, imm: 0x24000000 | rs << 21 | rt << 16 | (imm & 0xFFFF)
    sw_sp = lambda rt, off: 0xAC000000 | 29 << 21 | rt << 16 | off
    put(0x734D30 - 8, [0x03E00008, 0, lui(8, 0x0400), addiu(8, 8, 0x100), sw_sp(8, 0x24), addiu(9, 0, 0), sw_sp(9, 0x1C),
                       addiu(4, 0, 1), ar.PART_DRAW_JAL, addiu(5, 0, 2), 0x03E00008, 0])
    bank = ar.BANKS4[0][0]
    put(bank + 0x100, [0x0400003F, 0x04000200, 0xBF000000, 0x00000A14, 0xFA000000, 0xB03F00FF, 0xB8000000, 0])
    for i, (x, y, z) in enumerate([(-10, 0, 0), (10, 0, 0), (0, 20, 0), (0, 0, 30)]):
        rom[bank + 0x200 + 16 * i:bank + 0x20C + 16 * i] = struct.pack('>hhhH', x, y, z, 0) + bytes([1, 2, 3, 255])
    return bytes(rom)
PARTS = {'animal': 'bear', 'recolor': {'B03F00FF': '3A2418'},
         'mesh': [{'symbol': 'D_04000100_C7B30', 'scale': [1.5, 1, 0.5], 'move': [0, 3, 0]}]}
`;

function derivedTableCase(rt) {
  const ns = rt.py.globals.get('dict')();
  rt.py.runPython(ANIMAL_ROM_PY, { globals: ns });
  const rom = copy(ns.get('synthetic_animal_rom')());
  const parts = ns.get('PARTS').toJs({ dict_converter: Object.fromEntries });
  ns.destroy();
  const stages = [], start = Date.now();
  const out = core.runBuild(rt, { rom, parts, options: { strict: false } }, stage => stages.push(stage));
  const ms = Date.now() - start;
  assert.deepEqual(stages, ['rom', 'table', 'animals', 'ips']);
  assert.ok(out.log.some(line => /mesh \[bear\] D_04000100_C7B30: 4 vertices/.test(line)), out.log.join('\n'));
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const script = 'import sys, json, hashlib\nsys.path.insert(0, "src")\n' + ANIMAL_ROM_PY +
    'import web_build\nr = web_build.build(synthetic_animal_rom(), parts=PARTS, strict=False)\n' +
    'print(json.dumps([hashlib.sha256(r["rom"]).hexdigest(), hashlib.sha256(r["ips"]).hexdigest()]))';
  const cpython = spawnSync(python, ['-c', script], { cwd: ROOT, encoding: 'utf8' });
  if (cpython.error) { console.log('  derived table vs CPython: SKIP (' + python + ' not runnable)'); return; }
  assert.equal(cpython.status, 0, cpython.stderr);
  assert.deepEqual(JSON.parse(cpython.stdout), [sha('sha256', out.rom), sha('sha256', out.ips)]);
  assert.ok(applyIps(rom, out.ips).equals(Buffer.from(out.rom)));
  console.log('  derived animal table + Parts build: byte-identical to CPython (' + ms + ' ms in Pyodide)');
}

async function workerCase(pyodide, rt) {
  const proxy = rt.py.runPython(STRICT_ROM_PY);
  const stock = copy(proxy);
  const sha1 = sha('sha1', stock);
  const record = Buffer.alloc(22, 0x5A).toString('hex');
  const diff = { format: 'sssv-editor-diff', version: 1, rom_sha1: sha1,
    levels: { '5': { props: { set: [{ index: 1, bytes: record }] } }, '31': { props: { add: [{ bytes: record }] } } } };

  // Run builder-worker.js in a sandbox: importScripts serves builder-core.js and stands in for the vendored Pyodide script.
  // The worker is an ES module; run it as a script by swapping its two imports for sandbox stand-ins.
  let source = fs.readFileSync(path.join(SRC, 'web/builder-worker.js'), 'utf8');
  for (const [from, to] of [["import './builder-core.js';", "importScripts('builder-core.js');"], ['await import(', 'await importModule(']]) {
    assert.equal(source.split(from).length, 2, 'worker source shape: ' + from);
    source = source.replace(from, to);
  }
  const posted = [];
  let imported = [];
  const sandbox = { URL, URLSearchParams, Promise, ArrayBuffer, Uint8Array, Date, Object, Error, JSON, String, console,
    location: { href: 'https://site.test/builder-worker.js', search: '' } };
  sandbox.self = sandbox;
  sandbox.postMessage = (message, transfer) => posted.push({ message, transfer });
  sandbox.fetch = async url => {
    const name = String(url).replace('https://site.test/py/', '');
    assert.ok(core.PY_MODULES.includes(name), 'unexpected fetch ' + url);
    return { ok: true, text: async () => fs.readFileSync(path.join(SRC, name), 'utf8') };
  };
  sandbox.importScripts = url => {
    imported.push(url);
    if (url === 'builder-core.js') vm.runInContext(fs.readFileSync(path.join(SRC, 'web/builder-core.js'), 'utf8'), sandbox);
    else throw new Error('unexpected importScripts ' + url);
  };
  sandbox.importModule = async url => {
    imported.push(url);
    assert.equal(url, 'https://site.test/vendor/pyodide/pyodide.mjs');
    return { loadPyodide: opts => { assert.equal(opts.indexURL, 'https://site.test/vendor/pyodide/'); return pyodide.loadPyodide(); } };
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const send = async message => {
    posted.length = 0;
    sandbox.onmessage({ data: message });
    for (let i = 0; i < 600 && !posted.some(p => p.message.type !== 'progress'); i++) await new Promise(r => setTimeout(r, 50));
    return posted.slice();
  };
  const start = Date.now();
  const first = await send({ type: 'build', id: 7, rom: stock.slice().buffer, level: JSON.stringify(diff) });
  const ms = Date.now() - start;
  const done = first[first.length - 1];
  assert.equal(done.message.type, 'done', JSON.stringify(done.message));
  assert.equal(done.message.id, 7);
  assert.deepEqual(first.filter(p => p.message.type === 'progress').map(p => p.message.stage), ['runtime', 'rom', 'levels', 'ips', 'done']);
  assert.ok(done.transfer.length === 2 && done.transfer[0] === done.message.rom && done.transfer[1] === done.message.ips);
  const rom = new Uint8Array(done.message.rom), ips = new Uint8Array(done.message.ips);
  assert.equal(done.message.romSha1, sha('sha1', rom));
  assert.equal(done.message.sourceSha1, sha1);
  assert.ok(applyIps(stock, ips).equals(Buffer.from(rom)), 'worker IPS reproduces the worker ROM');
  assert.deepEqual(imported, ['builder-core.js', 'https://site.test/vendor/pyodide/pyodide.mjs']);
  console.log('  worker: strict level build on a synthetic 36-stage ROM (' + ms + ' ms incl. Pyodide start; timings ' + JSON.stringify(done.message.timings) + ')');

  // Byte-identical to the command-line tool on the same input.
  const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sssv-pyodide-'));
  try {
    fs.writeFileSync(path.join(temp, 'stock.z64'), stock);
    fs.writeFileSync(path.join(temp, 'edits.json'), JSON.stringify(diff));
    const cli = spawnSync(python, [path.join(SRC, 'build_levels.py'), path.join(temp, 'edits.json'), '--rom', path.join(temp, 'stock.z64'),
      '--out', path.join(temp, 'out'), '--name', 'cli'], { encoding: 'utf8' });
    if (cli.error) console.log('  worker vs CLI: SKIP (' + python + ' not runnable: ' + cli.error.code + ')');
    else {
      assert.equal(cli.status, 0, cli.stdout + cli.stderr);
      assert.ok(fs.readFileSync(path.join(temp, 'out/cli.z64')).equals(Buffer.from(rom)), 'worker ROM equals CLI ROM');
      assert.ok(fs.readFileSync(path.join(temp, 'out/cli.ips')).equals(Buffer.from(ips)), 'worker IPS equals CLI IPS');
      console.log('  worker vs CLI: ROM and IPS byte-identical to src/build_levels.py');
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }

  // Second build reuses the warm runtime; errors and refused options come back as {type: 'error'}.
  const again = await send({ type: 'build', id: 8, rom: stock.slice().buffer, level: diff, options: { relocate: true } });
  assert.equal(again[again.length - 1].message.type, 'done');
  assert.ok(!again.some(p => p.message.stage === 'runtime'), 'runtime loads once');
  const wrongRom = await send({ type: 'build', id: 9, rom: stock.slice().buffer, level: { ...diff, rom_sha1: '0'.repeat(40) } });
  assert.deepEqual(JSON.parse(JSON.stringify(wrongRom[wrongRom.length - 1].message)), { type: 'error', id: 9, message: 'Level edits do not match the original ROM SHA1' });
  const parts = await send({ type: 'build', id: 10, rom: stock.slice().buffer, parts: { animal: 'bear' } });
  assert.match(parts[parts.length - 1].message.message, /unmodified US 1\.0 ROM/);
  const testOnly = await send({ type: 'build', id: 11, rom: stock.slice().buffer, parts: { animal: 'bear' }, options: { strict: false } });
  assert.match(testOnly[testOnly.length - 1].message.message, /Test-only build options/);
  const noRom = await send({ type: 'build', id: 12, rom: 'x', level: diff });
  assert.match(noRom[noRom.length - 1].message.message, /ArrayBuffer/);
}

function copy(proxy) {
  const view = proxy.getBuffer('u8');
  try { return Buffer.from(view.data); } finally { view.release(); proxy.destroy(); }
}

async function clientCase() {
  // builder.js against a fake Worker: request shape, transfer, progress and Blob results.
  const sent = [];
  class FakeWorker {
    constructor(url, options) { this.url = url; this.options = options; FakeWorker.last = this; }
    postMessage(message, transfer) {
      sent.push({ message, transfer });
      setTimeout(() => {
        this.onmessage({ data: { type: 'progress', id: message.id, stage: 'rom', detail: 'Checking', ms: 1 } });
        this.onmessage({ data: message.parts === '{"animal":"bad"}'
          ? { type: 'error', id: message.id, message: 'nope' }
          : { type: 'done', id: message.id, rom: new ArrayBuffer(8), ips: new ArrayBuffer(3), romSha1: 'a', sourceSha1: 'b', log: ['x'], timings: { total: 2 } } });
      });
    }
    terminate() { this.terminated = true; }
  }
  class FakeBlob { constructor(parts, options) { this.size = parts[0].byteLength; this.type = options.type; } }
  const window = { Worker: FakeWorker, Blob: FakeBlob };
  vm.runInNewContext(fs.readFileSync(path.join(SRC, 'web/builder.js'), 'utf8'), { window, ArrayBuffer, Promise, Map, JSON, Error, setTimeout });
  const api = window.SSSVBuilder;
  const rom = new Uint8Array([1, 2, 3, 4]);
  const progress = [];
  const result = await api.build({ rom, level: { format: 'x' }, relocate: true }, { onProgress: p => progress.push(p.stage) });
  assert.equal(FakeWorker.last.url, 'builder-worker.js');
  assert.equal(FakeWorker.last.options.type, 'module');
  assert.equal(result.rom.size, 8);
  assert.equal(result.ips.size, 3);
  assert.equal(result.romSha1, 'a');
  assert.deepEqual(progress, ['rom']);
  const msg = sent[0].message;
  assert.equal(msg.type, 'build');
  assert.equal(msg.level, '{"format":"x"}');
  assert.equal(msg.parts, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(msg.options)), { relocate: true });
  assert.ok(sent[0].transfer.length === 1 && sent[0].transfer[0] === msg.rom, 'ROM buffer is transferred');
  assert.equal(rom.length, 4, 'caller ROM is copied, not detached');
  await assert.rejects(api.build({ rom, parts: '{"animal":"bad"}' }), /nope/);
  await assert.rejects(api.build({ rom }), /level project or a Parts config/);
  await assert.rejects(api.build({ level: '{}' }), /ROM file/);
  api.terminate();
  assert.equal(FakeWorker.last.terminated, true);
  console.log('  client: builder.js request/transfer/progress/error paths');
}

(async () => {
  await clientCase();
  const pyodide = findPyodide();
  if (!pyodide) {
    console.log('SKIP Pyodide build smoke: npm package not found (npm install pyodide@' + core.PYODIDE_VERSION + ' and set SSSV_PYODIDE to its directory).');
    return;
  }
  if (pyodide.version !== core.PYODIDE_VERSION) console.log('  note: testing npm pyodide ' + pyodide.version + '; the worker pins ' + core.PYODIDE_VERSION);
  const start = Date.now();
  const rt = await core.createRuntime(pyodide.loadPyodide, name => fs.readFileSync(path.join(SRC, name), 'utf8'));
  console.log('  Pyodide ' + pyodide.version + ' runtime with repo sources: ' + (Date.now() - start) + ' ms');
  await fixtureCases(rt);
  derivedTableCase(rt);
  await workerCase(pyodide, rt);
  console.log('Pyodide builder: golden fixtures, worker protocol and CLI parity passed.');
})().catch(error => { console.error(error); process.exit(1); });
