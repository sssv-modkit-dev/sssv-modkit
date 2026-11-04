'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function run(bytes, size = 16*1024*1024) {
  const listeners = {}, appended = [];
  const file = {size, name: 'test.z64', slice: () => ({arrayBuffer: async () => Uint8Array.from(bytes).buffer})};
  const elements = Object.fromEntries(['rom','start','status','reset','core'].map(id => [id, {files:[file], value:'mupen64plus_next', addEventListener: (e,f) => listeners[id+e]=f}]));
  const context = {window:{addEventListener(){}}, location:{reload(){}}, URL:{createObjectURL:()=> 'blob:local-test',revokeObjectURL(){}}, Uint8Array, document:{getElementById:id=>elements[id],createElement:tag=>tag==='canvas'?{getContext:()=>({})}:{}, body:{appendChild:s=>appended.push(s)}}};
  vm.runInNewContext(fs.readFileSync('src/web/play.js','utf8'),context);
  await listeners.startclick();
  return {context, elements, appended};
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
    assert.equal(result.appended[0].src,'https://cdn.emulatorjs.org/4.2.3/data/loader.js');
    result.appended[0].onerror();
    assert.match(result.elements.status.textContent,/download failed/);
  }
  console.log('Local ROM validation, three byte orders, blob handoff and loader failure passed.');
})();
