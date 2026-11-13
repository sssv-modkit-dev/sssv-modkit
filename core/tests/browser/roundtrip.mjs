// End to end: build the sample site, edit in each editor, save, reload, reopen the saved file, and check the edit survived.
// node tests/browser/roundtrip.mjs [origin]   (needs Chrome or Edge; set CHROME=<path> if it is elsewhere)
// With an origin (e.g. a deployed site), the test skips the local build and server and runs against that URL.
import {spawn, execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launch, open, evaluate, until, setFile, sleep, findChrome} from './cdp.mjs';

if (!findChrome()) {
  console.log('SKIP browser round trip: Chrome/Edge unavailable');
  process.exit(0);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'roundtrip-')), downloads = path.join(tmp, 'downloads');
fs.mkdirSync(downloads);
const python = process.env.PYTHON || 'python';
let origin = process.argv[2], server = null;
if (!origin) {
  const site = path.join(tmp, 'site'), port = 8765;
  execFileSync(python, [path.join(root, 'src/build_site.py'), '--pack', path.join(root, 'packs/sample'), '--out', site]);
  server = spawn(python, ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', site], {stdio: 'ignore'});
  origin = `http://127.0.0.1:${port}`;
  await sleep(800);
}
const c = await launch();

async function download(s, click, name) {
  await c.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: downloads});
  const file = path.join(downloads, name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  await evaluate(c, s, click);
  for (let i = 0; i < 50 && !fs.existsSync(file); i++) await sleep(200);
  assert.ok(fs.existsSync(file), 'downloaded ' + name);
  await sleep(200);
  return file;
}

const levelReady = "document.getElementById('setup').hidden && document.getElementById('ed-object').options.length > 3";
const selectProp3 = "(()=>{const o=document.getElementById('ed-object');o.value='props:3';o.onchange();return +document.getElementById('ed-x').value})()";
const modelReady = "typeof demoPreset==='function' && document.body.classList.contains('demo-mode')";

try {
  // Level Editor: move prop 3, save edits, reload, open them again.
  let s = await open(c, origin + '/level-editor.html');
  await until(c, s, levelReady);
  const x0 = await evaluate(c, s, selectProp3);
  await evaluate(c, s, `document.getElementById('ed-x').value=${x0 + 128};document.getElementById('ed-apply').click()`);
  const saved = await download(s, "document.getElementById('ed-save').click()", 'level-edits.json');
  assert.equal(JSON.parse(fs.readFileSync(saved, 'utf8')).format, 'scene-edits-v1');
  s = await open(c, origin + '/level-editor.html');
  await until(c, s, levelReady);
  assert.equal(await evaluate(c, s, selectProp3), x0, 'fresh page starts from the stock scene');
  await setFile(c, s, '#ed-file', saved);
  await until(c, s, "/opened/i.test(document.getElementById('editor-status').textContent)");
  assert.equal(await evaluate(c, s, selectProp3), x0 + 128, 'reopened edit restores the moved prop');

  // Model Editor: change the palette, save edits, reload, open them again.
  s = await open(c, origin + '/model-editor.html');
  await until(c, s, modelReady);
  await evaluate(c, s, "document.getElementById('demo-colour').click()");
  const before = await evaluate(c, s, 'JSON.stringify(demoPreset())');
  const model = await download(s, "document.getElementById('exp').click()", 'model-edits.json');
  s = await open(c, origin + '/model-editor.html');
  await until(c, s, modelReady);
  assert.notEqual(await evaluate(c, s, 'JSON.stringify(demoPreset())'), before, 'fresh page starts unedited');
  await setFile(c, s, '#impf', model);
  await until(c, s, `JSON.stringify(demoPreset())===${JSON.stringify(before)}`);
  assert.deepEqual(c.errors, []);
  console.log('Browser round trip: level and model edits survive save -> reload -> open.');
} finally {
  c.close();
  if (server) server.kill();
}
