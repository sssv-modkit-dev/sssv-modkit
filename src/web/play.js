'use strict';
// Emulator side of play.html. The single "Load ROM" panel (play-build.js) calls SSSVPlay.startGame with either the
// chosen ROM as-is or the freshly built patched ROM; editors can also post {type:'sssv-rom'} here.
const status = document.getElementById('status');
let romUrl, started = false;
const isBlobLike = b => !!b && typeof b === 'object' && typeof b.slice === 'function' && typeof b.size === 'number';
const reset = document.getElementById('reset');
if (reset) reset.addEventListener('click', () => location.reload());
async function startGame(blob, name) {
  if (started) throw new Error('A game is already running. Press Start over to choose another ROM.');
  if (!isBlobLike(blob) || blob.size < 4096 || blob.size > 64 * 1024 * 1024) throw new Error('Choose an uncompressed N64 ROM between 4 KB and 64 MB.');
  const magic = Array.from(new Uint8Array(await blob.slice(0, 4).arrayBuffer())).map(b => b.toString(16).padStart(2, '0')).join('');
  if (!['80371240', '37804012', '40123780'].includes(magic)) throw new Error('Unrecognized N64 header. Unzip the ROM first; .z64, .v64 and .n64 byte orders are supported.');
  if (!document.createElement('canvas').getContext('webgl2')) throw new Error('WebGL 2 is unavailable. Try a browser with hardware acceleration enabled.');
  started = true;
  romUrl = URL.createObjectURL(blob);
  window.EJS_player = '#game';
  window.EJS_language = 'en-US';
  window.EJS_disableAutoLang = false; // en-US needs no localization download
  window.EJS_core = document.getElementById('core').value;
  window.EJS_gameUrl = romUrl;
  window.EJS_gameName = String(name || blob.name || 'game').replace(/\.[^.]+$/, '');
  window.EJS_pathtodata = new URL('vendor/emulatorjs/data/', location.href).href; // same-origin copy from tools/vendor_deps.py
  window.EJS_startOnLoaded = false;
  // Never phone home: no ads, no netplay (EmulatorJS leaves it off unless debug flags are set), no update check
  // (EmulatorJS only runs it on localhost, and the page CSP blocks it), no localization or other extra downloads.
  window.EJS_AdUrl = '';
  window.EJS_threads = false; // GitHub Pages does not supply COOP/COEP headers.
  window.EJS_ready = () => { status.textContent = 'Emulator ready. Press Start Game in the player.'; };
  window.EJS_onGameStart = () => { status.textContent = 'Running. Use the player menu for controls and saves.'; };
  const loader = document.createElement('script');
  loader.src = window.EJS_pathtodata + 'loader.js';
  loader.onerror = () => { status.textContent = 'Emulator files failed to load from this site. Press Start over to reload and retry.'; };
  document.getElementById('core').disabled = true;
  status.textContent = 'Loading emulator... First load may take a moment.';
  document.body.appendChild(loader);
}
async function startFrom(blob, name) {
  try { await startGame(blob, name); return true; }
  catch (error) { status.textContent = error.message; return false; }
}
// Builder entry: same-origin postMessage {type:'sssv-rom', name, buffer|blob}. Blobs cannot survive navigation, so
// a builder opens play.html with window.open, waits for 'sssv-play-ready', then posts once.
function toBlob(data) {
  if (!data || typeof data !== 'object' || data.type !== 'sssv-rom') return null;
  if (data.name !== undefined && (typeof data.name !== 'string' || data.name.length > 255)) return null;
  if (data.buffer !== undefined && data.blob !== undefined) return null;
  const tag = Object.prototype.toString.call(data.buffer);
  if (tag === '[object ArrayBuffer]') return new Blob([data.buffer]);
  if (data.buffer === undefined && isBlobLike(data.blob)) return data.blob;
  return null;
}
window.addEventListener('message', event => {
  if (event.origin !== location.origin || location.origin === 'null') return;
  const blob = toBlob(event.data);
  if (blob) startFrom(blob, event.data.name || 'game.z64');
});
window.SSSVPlay = { startGame: (blob, name) => startFrom(blob, name) };
if (window.opener) window.opener.postMessage({ type: 'sssv-play-ready' }, location.origin);
window.addEventListener('pagehide', () => { if (romUrl) URL.revokeObjectURL(romUrl); });
