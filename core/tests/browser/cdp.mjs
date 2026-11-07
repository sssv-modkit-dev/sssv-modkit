// Minimal Chrome DevTools Protocol client for headless page tests (Node 22+, no dependencies).
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function findChrome() {
  const candidates = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return candidates.find(p => p && fs.existsSync(p));
}

export async function launch(port = 9335) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'));
  const chrome = spawn(findChrome(), ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1400,900',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-first-run', 'about:blank'], {stdio: 'ignore'});
  let url;
  for (let i = 0; i < 50 && !url; i++) {
    try { url = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(200); }
  }
  if (!url) throw Error('Chrome did not start');
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = event => {
    const m = JSON.parse(event.data);
    if (m.id && pending.has(m.id)) {
      const {resolve, reject} = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(Error(m.error.message)); else resolve(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text + ' ' + (m.params.entry.url || ''));
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const msg = {id: ++id, method, params};
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, {resolve, reject});
    ws.send(JSON.stringify(msg));
  });
  return {send, errors, close() { try { ws.close(); } catch {} chrome.kill(); }};
}

export async function open(c, url) {
  const {targetId} = await c.send('Target.createTarget', {url: 'about:blank'});
  const {sessionId} = await c.send('Target.attachToTarget', {targetId, flatten: true});
  for (const domain of ['Page', 'Runtime', 'Log', 'DOM']) await c.send(domain + '.enable', {}, sessionId);
  await c.send('Page.navigate', {url}, sessionId);
  return sessionId;
}

export async function evaluate(c, s, expression) {
  const r = await c.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, s);
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

export async function until(c, s, expression, ms = 15000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
    try { if (await evaluate(c, s, expression)) return; } catch { /* page still loading */ }
  }
  throw Error('timed out waiting for ' + expression);
}

export async function setFile(c, s, selector, file) {
  const {root} = await c.send('DOM.getDocument', {}, s);
  const {nodeId} = await c.send('DOM.querySelector', {nodeId: root.nodeId, selector}, s);
  await c.send('DOM.setFileInputFiles', {nodeId, files: [file]}, s);
}
