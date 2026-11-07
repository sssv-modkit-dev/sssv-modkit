// Model Editor data-source hook: a plug-in hands the editor a parts table plus geometry bytes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('src/viewer/js/app.js','utf8');
assert.ok(app.includes('//#HOST-START')&&app.includes('//#HOST-END'),'host block markers');
const host=app.split('//#HOST-START')[1].split('//#HOST-END')[0];
const ctx=vm.createContext({});vm.runInContext(host+'\nthis.make=makeModelEditorHost;',ctx);
function env(){const e={calls:[],msgs:[],open:null};e.setSource=(t,b,l)=>e.calls.push([t,b,l]);e.message=t=>e.msgs.push(t);e.panel=o=>e.open=o;return e;}
// test_use_source_sets_table
let e=env(),h=ctx.make(e);
assert.equal(h.useSource({table:{fox:{p:[]}},bytes:new ArrayBuffer(16),label:'x'}),null);
assert.equal(e.calls.length,1);assert.ok(e.msgs.at(-1).includes('x'));assert.equal(e.open,false);
// test_use_source_rejects: nothing changes on bad input
for(const bad of [{},null,{table:{},bytes:new ArrayBuffer(1)},{table:{fox:{}},bytes:'nope'}]){
  e=env();h=ctx.make(e);const msg=h.useSource(bad);
  assert.equal(typeof msg,'string');assert.equal(e.calls.length,0);
}
// the core never names the plug-in's file type
assert.ok(!/\brom\b/i.test(host));
console.log('Model source hook: accepts a table plus bytes, rejects bad input without side effects.');
