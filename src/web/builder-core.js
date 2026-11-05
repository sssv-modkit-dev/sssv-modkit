// Shared Pyodide build core: used by builder-worker.js in the browser and by tests/test_pyodide_build.js in Node.
// It loads the repository's own Python (src/*.py) into Pyodide and calls web_build.build_js; Python stays the single
// source of truth, so the output bytes match the command-line tools. No ROM bytes or ROM-derived data are bundled.
(function (root) {
  'use strict';
  const PYODIDE_VERSION = '314.0.7';
  const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v' + PYODIDE_VERSION + '/full/';
  // Every module web_build.py imports, directly or indirectly. src/build_viewer.py copies these to dist/py/.
  const PY_MODULES = ['romio.py', 'level_rnc.py', 'level_rnc_pack.py', 'build_levels.py', 'make_animal_mods.py',
    'animal_table.py', 'animal_rom.py', 'web_build.py'];
  const PY_DIR = '/sssv';

  // loadPyodide: the Pyodide loader (CDN global or the npm package). readSource(name) -> text of src/<name>.
  async function createRuntime(loadPyodide, readSource, loadOptions) {
    const py = await loadPyodide(loadOptions || {});
    py.FS.mkdirTree(PY_DIR);
    const sources = await Promise.all(PY_MODULES.map(name => readSource(name)));
    PY_MODULES.forEach((name, i) => py.FS.writeFile(PY_DIR + '/' + name, sources[i]));
    py.runPython('import sys\nsys.dont_write_bytecode = True\nsys.path.insert(0, ' + JSON.stringify(PY_DIR) + ')');
    return { py, entry: py.pyimport('web_build') };
  }

  function pythonMessage(error) {
    // PythonError.message is a traceback; keep its final "ValueError: ..." line without the type name.
    const lines = String(error && error.message || error).trim().split('\n');
    const last = lines[lines.length - 1] || 'Build failed';
    return error && error.type ? last.replace(/^\w+(Error|Exit|Exception): /, '') : last;
  }

  function copyBytes(proxy) {
    const view = proxy.getBuffer('u8');
    try { return view.data.slice(); } finally { view.release(); proxy.destroy(); }
  }

  // request: {rom: ArrayBuffer|Uint8Array, level?: object|string, parts?: object|string, options?: {relocate,
  // new_animals, table, strict}}. onProgress(stage, detail) is called synchronously between build steps.
  // -> {rom: Uint8Array, ips: Uint8Array, romSha1, sourceSha1, log: [string]}
  function runBuild(runtime, request, onProgress) {
    const src = request.rom;   // plain Uint8Array view: Pyodide rejects subclasses such as Node's Buffer
    const rom = ArrayBuffer.isView(src) ? new Uint8Array(src.buffer, src.byteOffset, src.byteLength) : new Uint8Array(src);
    const text = value => value == null ? undefined : typeof value === 'string' ? value : JSON.stringify(value);
    let result;
    try {
      result = runtime.entry.build_js(rom, text(request.level), text(request.parts), JSON.stringify(request.options || {}),
        onProgress ? (stage, detail) => onProgress(String(stage), String(detail)) : undefined);
    } catch (error) {
      throw new Error(pythonMessage(error));
    }
    try {
      const log = result.get('log');
      const out = { rom: copyBytes(result.get('rom')), ips: copyBytes(result.get('ips')), romSha1: result.get('rom_sha1'),
        sourceSha1: result.get('source_sha1'), log: log.toJs() };
      log.destroy();
      return out;
    } finally {
      result.destroy();
    }
  }

  const api = { PYODIDE_VERSION, PYODIDE_URL, PY_MODULES, createRuntime, runBuild, pythonMessage };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SSSVBuilderCore = api;
})(typeof self !== 'undefined' ? self : this);
