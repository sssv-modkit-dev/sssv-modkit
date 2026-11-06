// "Build from your edits" panel on play.html: your ROM + a level project/diff and/or a Parts config -> SSSVBuilder.build
// (builder.js, Pyodide worker) -> SSSVPlay.startGame(result.rom, 'patched.z64'), plus IPS/ROM downloads.
// Editors hand over their JSON (and, if they have one in memory, the ROM as a Blob) with a same-origin postMessage
// {type: 'sssv-build', level?, parts?, levelName?, partsName?, rom?, romName?, source?}; see handoff.js. Nothing is
// written to storage: the ROM, the edits and the outputs live only in this page's memory.
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const STAGES = ['runtime', 'rom', 'levels', 'table', 'animals', 'ips', 'done'];
  const US10_SHA1 = 'e5e09205aa743a9e5043a42df72adc379c746b0b';
  const state = { rom: null, romName: '', level: null, levelName: '', parts: null, partsName: '', source: '', result: null, busy: false };
  const status = text => { $('b-status').textContent = text; };
  const isBlobLike = b => !!b && typeof b === 'object' && typeof b.slice === 'function' && typeof b.size === 'number';
  const isArrayBuffer = b => Object.prototype.toString.call(b) === '[object ArrayBuffer]';
  const shortName = (value, fallback) => typeof value === 'string' && value && value.length <= 255 ? value : fallback;

  function update() {
    const ready = !!state.rom && !!(state.level || state.parts);
    $('b-go').disabled = state.busy || !ready;
    $('b-ips').disabled = state.busy || !state.result;
    $('b-out').disabled = state.busy || !state.result;
  }

  function describeInputs() {
    const parts = [];
    if (state.rom) parts.push('ROM: ' + state.romName);
    if (state.level) parts.push('Level: ' + state.levelName);
    if (state.parts) parts.push('Parts: ' + state.partsName);
    return parts.join(' · ');
  }

  // The worker returns the command-line tools' own messages; add what to do about the common wrong-ROM cases.
  function explain(message) {
    message = String(message || 'Build failed');
    if (/download failed/i.test(message)) return message;
    if (/unmodified US 1\.0|CRC routine/.test(message))
      return 'Wrong ROM for Parts edits: ' + message + '. Use your own unmodified US 1.0 ROM (SHA1 ' + US10_SHA1 + '), not a patched build.';
    if (/do not match the original ROM SHA1|source ROM mismatch/.test(message))
      return 'Wrong ROM for these edits: ' + message + '. Choose the exact ROM the level edits were made from (usually the unmodified US 1.0 ROM).';
    if (/8-16 MB|byte order|different game or region/.test(message))
      return 'This is not a usable SSSV ROM: ' + message + '. Unzip it first; the US version is required.';
    if (/new-animals/.test(message)) return message.replace('--new-animals', 'Advanced > Allow added animals') + '.';
    if (/use --relocate/.test(message)) return message.replace('use --relocate', 'turn on Advanced > Relocate level data') + '.';
    return 'Build failed: ' + message;
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setResult(result) {
    state.result = result;
    const log = result && result.log && result.log.length ? result.log.join('\n') : '';
    $('b-log').textContent = log;
    $('b-log-box').hidden = !log;
  }

  async function build() {
    if (state.busy) return;
    state.busy = true; setResult(null); update();
    const bar = $('b-progress');
    bar.hidden = false; bar.value = 0;
    status('Starting the builder…');
    try {
      const result = await window.SSSVBuilder.build({
        rom: state.rom, level: state.level || undefined, parts: state.parts || undefined,
        relocate: $('b-relocate').checked, newAnimals: $('b-new-animals').checked,
      }, { onProgress: p => { bar.value = STAGES.indexOf(p.stage) + 1; if (p.detail) status(p.detail + '…'); } });
      bar.value = STAGES.length;
      setResult(result);
      const seconds = result.timings && result.timings.total ? ' in ' + (result.timings.total / 1000).toFixed(1) + ' s' : '';
      status('Built' + seconds + '. Patched ROM SHA1 ' + result.romSha1 + '. Starting the emulator below; you can also download the IPS or ROM.');
      await window.SSSVPlay.startGame(result.rom, 'patched.z64');
      const screen = $('screen');
      if (screen && screen.scrollIntoView) screen.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      bar.hidden = true;
      status(explain(error && error.message));
    } finally {
      state.busy = false; update();
    }
  }

  function pick(id, key) {
    $(id).addEventListener('change', () => {
      const file = $(id).files[0];
      state[key] = file || null;
      state[key + 'Name'] = file ? file.name : '';
      setResult(null);
      update();
      status(describeInputs() || 'Choose your ROM and at least one edit file.');
    });
  }
  pick('b-rom', 'rom'); pick('b-level', 'level'); pick('b-parts', 'parts');
  $('b-go').addEventListener('click', build);
  $('b-ips').addEventListener('click', () => state.result && download(state.result.ips, 'sssv-patch.ips'));
  $('b-out').addEventListener('click', () => state.result && download(state.result.rom, 'sssv-patched.z64'));

  // Handoff from levels.html / model_editor.html (handoff.js). JSON arrives as a parsed object or text; the ROM, if the
  // editor had one loaded, as a Blob or ArrayBuffer. Anything malformed is ignored.
  const isDocument = v => (typeof v === 'string' && v.length > 0 && v.length <= 8e6) || (!!v && typeof v === 'object' && !Array.isArray(v) && !isBlobLike(v));
  function receive(data) {
    if (!data || typeof data !== 'object' || data.type !== 'sssv-build') return false;
    const level = data.level == null ? null : data.level, parts = data.parts == null ? null : data.parts;
    if ((level && !isDocument(level)) || (parts && !isDocument(parts)) || (!level && !parts)) return false;
    let rom = null;
    if (data.rom != null) {
      if (isArrayBuffer(data.rom)) rom = new Blob([data.rom]);
      else if (isBlobLike(data.rom)) rom = data.rom;
      else return false;
    }
    const source = shortName(data.source, 'the editor').slice(0, 40);
    state.level = level; state.levelName = level ? shortName(data.levelName, 'from ' + source) : '';
    state.parts = parts; state.partsName = parts ? shortName(data.partsName, 'from ' + source) : '';
    if (rom) { state.rom = rom; state.romName = shortName(data.romName, 'ROM from ' + source); }
    state.source = source;
    setResult(null);
    const received = $('b-received');
    received.hidden = false;
    received.textContent = 'Received from ' + source + ': ' + [level && 'level edits', parts && 'Parts config', rom && 'its loaded ROM'].filter(Boolean).join(', ') + '.';
    status(state.rom ? describeInputs() + '. Press Build & Play.' : 'Now choose your ROM, then press Build & Play.');
    update();
    const fieldset = $('build');
    if (fieldset && fieldset.scrollIntoView) fieldset.scrollIntoView({ block: 'start' });
    return true;
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || location.origin === 'null') return;
    receive(event.data);
  });
  window.SSSVPlayBuild = { receive, explain, build };
  update();
})();
