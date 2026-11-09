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
  const state = { rom: null, romName: '', level: null, levelName: '', parts: null, partsName: '', source: '', result: null, busy: false, played: false };
  const status = text => { $('b-status').textContent = text; };
  const isBlobLike = b => !!b && typeof b === 'object' && typeof b.slice === 'function' && typeof b.size === 'number';
  const isArrayBuffer = b => Object.prototype.toString.call(b) === '[object ArrayBuffer]';
  const shortName = (value, fallback) => typeof value === 'string' && value && value.length <= 255 ? value : fallback;

  function update() {
    $('b-go').disabled = state.busy || state.played || !state.rom;
    $('b-go').textContent = state.level || state.parts ? 'Build & Play' : 'Play';
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

  // No edit files: play the chosen ROM unchanged (stock, or a build made earlier).
  async function playAsIs() {
    state.busy = true; update();
    status('Starting ' + state.romName + ' as it is…');
    const ok = await window.SSSVPlay.startGame(state.rom, state.romName || 'game.z64');
    state.busy = false; state.played = ok !== false; update();
    if (state.played) { status('Playing ' + state.romName + ' unchanged. Press Start over to load something else.'); scrollToScreen(); }
    else status('Could not start this ROM; see the message below the panel.');
  }

  function scrollToScreen() {
    const screen = $('screen');
    if (screen && screen.scrollIntoView) screen.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function build() {
    if (state.busy || state.played || !state.rom) return;
    if (!state.level && !state.parts) return playAsIs();
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
      state.played = (await window.SSSVPlay.startGame(result.rom, 'patched.z64')) !== false;
      scrollToScreen();
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
      status(describeInputs() ? describeInputs() + '. Press ' + (state.level || state.parts ? 'Build & Play' : 'Play') + '.' : 'Choose your ROM to begin.');
    });
  }
  pick('b-rom', 'rom'); pick('b-level', 'level'); pick('b-parts', 'parts');
  $('b-go').addEventListener('click', build);
  $('b-ips').addEventListener('click', () => state.result && download(state.result.ips, 'sssv-patch.ips'));
  $('b-out').addEventListener('click', () => state.result && download(state.result.rom, 'sssv-patched.z64'));

  // After a handoff, grey out a file picker the editor already filled and show what was loaded, with a Replace button
  // that re-enables the picker. Built with DOM nodes (no innerHTML): names come from the other window.
  function lockInput(id, name) {
    const input = $(id);
    if (!input) return;
    let chip = $(id + '-loaded');
    if (!name) { input.disabled = false; input.style.opacity = ''; if (chip) chip.remove(); return; }
    input.disabled = true; input.style.opacity = '.45';
    if (!chip) {
      chip = document.createElement('span'); chip.id = id + '-loaded'; chip.className = 'loaded';
      chip.style.cssText = 'display:inline-flex;gap:8px;align-items:center;margin-left:8px;color:#b8e0a8';
      input.insertAdjacentElement('afterend', chip);
    }
    chip.textContent = '';
    const label = document.createElement('span'); label.textContent = 'Loaded: ' + name;
    const again = document.createElement('button'); again.type = 'button'; again.textContent = 'Replace';
    again.addEventListener('click', () => {
      lockInput(id, null);
      input.value = ''; input.click();
    });
    chip.append(label, ' ', again);
  }

  // Handoff from level-editor.html / model-editor.html (handoff.js). JSON arrives as a parsed object or text; the ROM, if the
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
    lockInput('b-rom', rom && state.romName);
    lockInput('b-level', level && state.levelName);
    lockInput('b-parts', parts && state.partsName);
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
