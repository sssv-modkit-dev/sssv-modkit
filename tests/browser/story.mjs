// Optional private integration test: start tools/story_editor.py, then run this file.
// Uses the supplied research checkout; test edits are restored in finally.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launch, open, evaluate, until, findChrome} from './cdp.mjs';

if (!findChrome()) { console.log('SKIP story browser: Chrome/Edge unavailable'); process.exit(0); }
const origin = process.argv[2] || 'http://127.0.0.1:8010';
const original = await (await fetch(origin+'/api/dialogue')).json();
const c = await launch(9336);
let originalSheet;
async function restore() {
  await fetch(origin+'/api/save', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(original)});
  if(originalSheet) await fetch(origin+'/api/sheet', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({level:1,png:originalSheet})});
}
try {
  let s = await open(c, origin+'/dialogue.html');
  await until(c,s,"!!document.getElementById('bridge').onclick");
  await evaluate(c,s,"document.getElementById('bridge').click()");
  await until(c,s,"!document.getElementById('save').disabled");
  assert.equal(await evaluate(c,s,"document.getElementById('bank').options.length"),Object.keys(original.banks).length);
  await evaluate(c,s,`document.getElementById('lines').value='4';document.getElementById('lines').onchange()`);
  assert.ok(await evaluate(c,s,"document.querySelectorAll('#holds input').length > 0"));
  const hold = await evaluate(c,s,"Number(document.querySelector('#holds input').value)");
  const replacement = 'Test / story!';
  await evaluate(c,s,`document.getElementById('text').value=${JSON.stringify(replacement)};document.getElementById('text').oninput();document.querySelector('#holds input').value=${hold+1};document.querySelector('#holds input').oninput();document.getElementById('save').click()`);
  await until(c,s,"document.getElementById('status').textContent.startsWith('Saved')");
  s = await open(c,origin+'/dialogue.html');
  await until(c,s,"!!document.getElementById('bridge').onclick");
  await evaluate(c,s,"document.getElementById('bridge').click()");
  await until(c,s,"!document.getElementById('save').disabled");
  await evaluate(c,s,"document.getElementById('lines').value='4';document.getElementById('lines').onchange()");
  assert.equal(await evaluate(c,s,"document.getElementById('text').value"),replacement);
  assert.equal(await evaluate(c,s,"Number(document.querySelector('#holds input').value)"),hold+1);
  if(process.env.STORY_SCREENSHOT) {
    const shot = await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},s);
    fs.writeFileSync(process.env.STORY_SCREENSHOT.replace(/\.png$/, '-dialogue.png'),Buffer.from(shot.data,'base64'));
  }
  await evaluate(c,s,"document.getElementById('text').value='x'.repeat(10000);document.getElementById('text').oninput();document.getElementById('save').click()");
  await until(c,s,"document.getElementById('status').textContent.includes('exceeds')");
  assert.equal((await (await fetch(origin+'/api/dialogue')).json()).banks['0'].strings['4'],replacement);
  // Clear unsaved invalid text before moving to another test page.
  await evaluate(c,s,`document.getElementById('text').value=${JSON.stringify(replacement)};document.getElementById('text').oninput();document.getElementById('save').click()`);
  await until(c,s,"document.getElementById('status').textContent.startsWith('Saved')");

  s = await open(c,origin+'/terrain.html');
  await until(c,s,"!!document.getElementById('bridge').onclick");
  await evaluate(c,s,"document.getElementById('bridge').click()");
  await until(c,s,"!document.getElementById('save').disabled",60000);
  originalSheet = await evaluate(c,s,"document.getElementById('sheet').toDataURL().split(',')[1]");
  const pixel = "Array.from(document.getElementById('tile').getContext('2d').getImageData(0,0,1,1).data)";
  const old = await evaluate(c,s,pixel);
  // CDP mouse generates a real pointer, allowing pointer capture.
  await evaluate(c,s,"document.getElementById('tile').scrollIntoView()");
  const box = await evaluate(c,s,"(()=>{const r=document.getElementById('tile').getBoundingClientRect();return {x:r.left+2,y:r.top+2}})()");
  await evaluate(c,s,"document.getElementById('colour').value='#ff00ff'");
  for(const type of ['mousePressed','mouseReleased']) await c.send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1},s);
  assert.deepEqual(await evaluate(c,s,pixel),[255,0,255,255]);
  await evaluate(c,s,"document.getElementById('undo').click()");
  assert.deepEqual(await evaluate(c,s,pixel),old);
  for(const type of ['mousePressed','mouseReleased']) await c.send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1},s);
  // Pick magenta, replace it with green, and verify the seam preview matches.
  await evaluate(c,s,"(()=>{const t=document.getElementById('tile'),r=t.getBoundingClientRect();t.dispatchEvent(new MouseEvent('contextmenu',{clientX:r.left+2,clientY:r.top+2,bubbles:true}));document.getElementById('colour').value='#00ff00';document.getElementById('recolour').click()})()");
  assert.deepEqual(await evaluate(c,s,pixel),[0,255,0,255]);
  assert.deepEqual(await evaluate(c,s,"Array.from(document.getElementById('repeat').getContext('2d').getImageData(32,32,1,1).data)"),[0,255,0,255]);
  await evaluate(c,s,"document.getElementById('save').click()");
  await until(c,s,"document.getElementById('status').textContent.startsWith('Saved')");
  s = await open(c,origin+'/terrain.html');
  await until(c,s,"!!document.getElementById('bridge').onclick");
  await evaluate(c,s,"document.getElementById('bridge').click()");
  await until(c,s,"!document.getElementById('save').disabled",60000);
  assert.deepEqual(await evaluate(c,s,pixel),[0,255,0,255]);
  if(process.env.STORY_SCREENSHOT) {
    const shot = await c.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},s);
    fs.writeFileSync(process.env.STORY_SCREENSHOT,Buffer.from(shot.data,'base64'));
  }
  assert.deepEqual(c.errors.filter(e => !e.includes('400 (Bad Request)') || !e.includes('/api/save')),[]);
  console.log('Story browser: bank budget rejection, text/hold save/reopen, brush, undo, recolour, 3x3 and PNG reopen passed.');
} finally { await restore(); c.close(); }
