// Page-side client for builder-worker.js. API (see site/README.md, "In-browser builder"):
//   SSSVBuilder.build({rom, level, parts, relocate, newAnimals}, {onProgress}) -> Promise<{rom: Blob, ips: Blob, romSha1,
//   sourceSha1, log, timings}>; rom is a File/Blob/ArrayBuffer/Uint8Array, level and parts are a File/Blob, JSON text or
//   a parsed object. SSSVBuilder.terminate() frees the worker (and Pyodide's memory); the next build starts a new one.
(function (root) {
  'use strict';
  let worker = null, nextId = 1;
  const pending = new Map();
  const workerUrl = () => (root.SSSVBuilder && root.SSSVBuilder.workerUrl) || 'builder-worker.js';

  function fail(message) {
    for (const job of pending.values()) job.reject(new Error(message));
    pending.clear();
    if (worker) worker.terminate();
    worker = null;
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new root.Worker(workerUrl(), { type: 'module' });
    worker.onmessage = event => {
      const message = event.data || {};
      const job = pending.get(message.id);
      if (!job) return;
      if (message.type === 'progress') {
        if (job.onProgress) job.onProgress({ stage: message.stage, detail: message.detail, ms: message.ms });
        return;
      }
      pending.delete(message.id);
      if (message.type === 'indexed') {
        job.resolve(message.table);
      } else if (message.type === 'done') {
        job.resolve({ rom: new root.Blob([message.rom], { type: 'application/octet-stream' }),
          ips: new root.Blob([message.ips], { type: 'application/octet-stream' }), romSha1: message.romSha1,
          sourceSha1: message.sourceSha1, log: message.log || [], timings: message.timings || {} });
      } else {
        job.reject(new Error(message.message || 'Build failed'));
      }
    };
    worker.onerror = event => { if (event.preventDefault) event.preventDefault(); fail('The builder stopped unexpectedly: ' + (event.message || 'worker error')); };
    return worker;
  }

  async function asBuffer(rom) {
    if (rom instanceof ArrayBuffer) return rom.slice(0);   // copy: the original stays usable after the transfer
    if (ArrayBuffer.isView(rom)) return rom.buffer.slice(rom.byteOffset, rom.byteOffset + rom.byteLength);
    if (rom && typeof rom.arrayBuffer === 'function') return rom.arrayBuffer();
    throw new Error('Choose a ROM file first');
  }

  async function asJson(value) {
    if (value == null || value === '') return undefined;
    if (typeof value === 'string') return value;
    if (typeof value.text === 'function') return value.text();
    return JSON.stringify(value);
  }

  async function build(input, hooks) {
    input = input || {};
    const [rom, level, parts] = await Promise.all([asBuffer(input.rom), asJson(input.level), asJson(input.parts)]);
    if (level === undefined && parts === undefined) throw new Error('Choose a level project or a Parts config to build');
    const options = {};
    if (input.relocate) options.relocate = true;
    if (input.newAnimals) options.new_animals = true;
    const id = nextId++;
    const target = ensureWorker();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress: hooks && hooks.onProgress });
      target.postMessage({ type: 'build', id, rom, level, parts, options }, [rom]);
    });
  }

  async function deriveTable(rom, hooks) {
    const buffer = await asBuffer(rom), id = nextId++, target = ensureWorker();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, onProgress: hooks && hooks.onProgress });
      target.postMessage({ type: 'index', id, rom: buffer }, [buffer]);
    });
  }

  root.SSSVBuilder = { build, deriveTable, terminate: () => fail('Build cancelled'), workerUrl: null };
})(typeof window !== 'undefined' ? window : this);
