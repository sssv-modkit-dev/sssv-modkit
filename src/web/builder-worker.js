// Web Worker: builds a patched ROM and IPS in Pyodide from the user's ROM plus level/Parts JSON. See site/README.md.
// In:  {type: 'build', id, rom: ArrayBuffer, level?: object|string, parts?: object|string, options?: {relocate, new_animals}}
// Out: {type: 'progress', id, stage, detail, ms}, then {type: 'done', id, rom: ArrayBuffer, ips: ArrayBuffer, romSha1,
//      sourceSha1, log, timings} or {type: 'error', id, message}. The ROM stays in this worker's memory only.
// Pyodide (third-party) is served from this site's own vendor/pyodide/ on the first build; Python sources come from ./py/.
// Module worker (new Worker(url, {type: 'module'})): Pyodide 314 no longer loads in classic workers.
import './builder-core.js';
const core = self.SSSVBuilderCore;
const pyBase = new URL(new URLSearchParams(self.location.search).get('py') || 'py/', self.location.href);
let runtime = null;
let queue = Promise.resolve();

async function readSource(name) {
  const response = await fetch(new URL(name, pyBase));
  if (!response.ok) throw new Error('Could not load builder source ' + name + ' (HTTP ' + response.status + ')');
  return response.text();
}

function loadRuntime(progress) {
  if (!runtime) {
    runtime = (async () => {
      progress('runtime', 'Loading Pyodide ' + core.PYODIDE_VERSION + ' from this site (first build only)');
      const indexURL = new URL(core.PYODIDE_URL, self.location.href).href;
      let pyodide;
      try { pyodide = await import(indexURL + 'pyodide.mjs'); }
      catch (error) { throw new Error('Pyodide failed to load (' + (error && error.message || error) + '). The vendor/pyodide/ files of this site may be missing; reload and retry.'); }
      return core.createRuntime(pyodide.loadPyodide, readSource, { indexURL });
    })();
    runtime.catch(() => { runtime = null; });   // allow a retry after a failed download
  }
  return runtime;
}

async function handle(message) {
  const id = message.id;
  const started = Date.now(), timings = {};
  let stage = 'start', stageStart = started;
  const progress = (next, detail) => {
    const now = Date.now();
    timings[stage] = (timings[stage] || 0) + now - stageStart;
    stage = next; stageStart = now;
    self.postMessage({ type: 'progress', id, stage: next, detail, ms: now - started });
  };
  try {
    if (!(message.rom instanceof ArrayBuffer)) throw new Error('Expected the ROM as an ArrayBuffer');
    if (message.type !== 'index' && message.level == null && message.parts == null) throw new Error('Give a level project or diff, a Parts config, or both');
    const options = Object.assign({}, message.options);
    if ('strict' in options || 'table' in options) throw new Error('Test-only build options are not accepted by the worker');
    const rt = await loadRuntime(progress);
    if (message.type === 'index') {
      progress('table', 'Reading animals from your ROM');
      const table = core.deriveTable(rt, message.rom);
      self.postMessage({ type: 'indexed', id, table, timings: { total: Date.now() - started } });
      return;
    }
    const out = core.runBuild(rt, { rom: message.rom, level: message.level, parts: message.parts, options }, progress);
    progress('done', 'Build complete');
    const rom = out.rom.buffer, ips = out.ips.buffer;
    self.postMessage({ type: 'done', id, rom, ips, romSha1: out.romSha1, sourceSha1: out.sourceSha1, log: out.log,
      timings: Object.assign(timings, { total: Date.now() - started }) }, [rom, ips]);
  } catch (error) {
    self.postMessage({ type: 'error', id, message: error && error.message || String(error) });
  }
}

self.onmessage = event => {
  const message = event.data || {};
  if (message.type !== 'build' && message.type !== 'index') {
    self.postMessage({ type: 'error', id: message.id, message: 'Unknown message type' });
    return;
  }
  queue = queue.then(() => handle(message));   // one build at a time; Pyodide is single-threaded
};
