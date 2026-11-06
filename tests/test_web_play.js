'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function run(bytes, size = 16*1024*1024, opener) {
  const listeners = {}, appended = [], winListeners = {};
  const file = {size, name: 'test.z64', slice: () => ({arrayBuffer: async () => Uint8Array.from(bytes).buffer})};
  const elements = Object.fromEntries(['rom','start','status','reset','core'].map(id => [id, {files:[file], value:'mupen64plus_next', addEventListener: (e,f) => listeners[id+e]=f}]));
  const context = {window:{addEventListener:(e,f)=>winListeners[e]=f, opener}, Blob:class{constructor(parts){this.size=parts[0].byteLength;const u=new Uint8Array(parts[0]);this.slice=()=>({arrayBuffer:async()=>u.slice(0,4).buffer});}}, location:{origin:'https://site.test',href:'https://site.test/play.html',reload(){}}, URL:Object.assign(function(p,b){return new globalThis.URL(p,b)},{createObjectURL:()=> 'blob:local-test',revokeObjectURL(){}}), Uint8Array, document:{getElementById:id=>elements[id],createElement:tag=>tag==='canvas'?{getContext:()=>({})}:{}, body:{appendChild:s=>appended.push(s)}}};
  vm.runInNewContext(fs.readFileSync('src/web/play.js','utf8'),context);
  await listeners.startclick();
  return {context, elements, appended, winListeners};
}
(async () => {
  const invalid = await run([0,0,0,0]);
  assert.match(invalid.elements.status.textContent,/Unrecognized N64/);
  assert.equal(invalid.appended.length,0);
  const big = await run([0x80,0x37,0x12,0x40],65*1024*1024);
  assert.equal(big.appended.length,0);
  for (const magic of [[0x80,0x37,0x12,0x40],[0x37,0x80,0x40,0x12],[0x40,0x12,0x37,0x80]]) {
    const result = await run(magic);
    assert.equal(result.context.window.EJS_gameUrl,'blob:local-test');
    assert.equal(result.context.window.EJS_threads,false);
    assert.equal(result.appended.length,1);
    assert.equal(result.appended[0].src,'https://site.test/vendor/emulatorjs/data/loader.js');
    result.appended[0].onerror();
    assert.match(result.elements.status.textContent,/failed to load/);
  }
  // startGame with an in-memory blob (no file input involved)
  const mem = (bytes, size = 8192) => ({size, slice: () => ({arrayBuffer: async () => Uint8Array.from(bytes).buffer})});
  const rom = [0x80,0x37,0x12,0x40];
  let r = await run([0,0,0,0]);
  r.elements.rom.files = [];
  await r.context.window.SSSVPlay.startGame(mem(rom), 'patched.z64');
  assert.equal(r.appended.length, 1);
  assert.equal(r.context.window.EJS_gameName, 'patched');
  assert.equal(r.context.window.EJS_gameUrl, 'blob:local-test');
  await r.context.window.SSSVPlay.startGame(mem(rom), 'again.z64'); // second start is refused
  assert.equal(r.appended.length, 1);
  r = await run([0,0,0,0]);
  await r.context.window.SSSVPlay.startGame(mem([1,2,3,4]), 'x.z64');
  assert.match(r.elements.status.textContent, /Unrecognized N64/);
  await r.context.window.SSSVPlay.startGame({}, 'x');
  assert.match(r.elements.status.textContent, /between 4 KB and 64 MB/);
  assert.equal(r.appended.length, 0);
  // postMessage: origin and shape validation
  const send = async (res, origin, data) => { await res.winListeners.message({origin, data}); await new Promise(x => setImmediate(x)); };
  const buf = Uint8Array.from(rom.concat(new Array(8192).fill(0))).buffer;
  r = await run([0,0,0,0]);
  await send(r, 'https://evil.test', {type:'sssv-rom', name:'a.z64', buffer:buf});
  await send(r, 'null', {type:'sssv-rom', name:'a.z64', buffer:buf});
  for (const bad of [null, 'x', {type:'other', buffer:buf}, {type:'sssv-rom'}, {type:'sssv-rom', buffer:'str'}, {type:'sssv-rom', name:5, buffer:buf}, {type:'sssv-rom', buffer:buf, blob:mem(rom)}, {type:'sssv-rom', blob:{size:'big'}}])
    await send(r, 'https://site.test', bad);
  assert.equal(r.appended.length, 0);
  await send(r, 'https://site.test', {type:'sssv-rom', name:'built.z64', buffer:buf});
  assert.equal(r.appended.length, 1);
  assert.equal(r.context.window.EJS_gameName, 'built');
  r = await run([0,0,0,0]);
  await send(r, 'https://site.test', {type:'sssv-rom', name:'b.z64', blob:mem(rom)});
  assert.equal(r.appended.length, 1);
  // ready handshake: only when opened by another window, targeted at own origin
  const posted = [];
  r = await run([0,0,0,0], undefined, {postMessage:(m, o) => posted.push([m, o])});
  assert.equal(JSON.stringify(posted), JSON.stringify([[{type:'sssv-play-ready'}, 'https://site.test']]));
  r = await run([0,0,0,0]);
  assert.equal(r.context.window.opener, undefined);
  console.log('Local ROM validation, three byte orders, blob handoff, loader failure, startGame, postMessage validation and ready handshake passed.');
})();
