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

// Host consumers get source bytes and the complete builder config without globals.
e=env();const source={table:{fox:{p:[]}},bytes:new ArrayBuffer(8),label:'local'};
e.getSource=()=>source;e.getBuildConfig=()=>({animals:[{animal:'fox',recolor:{AABBCCFF:'112233'}}]});h=ctx.make(e);
assert.equal(h.hasSource(),true);assert.equal(h.getSource(),source);assert.equal(h.getBuildConfig().animals.length,1);
e=env();h=ctx.make(e);assert.equal(h.hasSource(),false);assert.equal(h.getSource(),null);assert.equal(h.getBuildConfig().animals.length,0);
const project=app.split('//#PROJECT-START')[1].split('//#PROJECT-END')[0];vm.runInContext(project+'\nthis.project={stateConfig,configChanged}',ctx);
const {stateConfig,configChanged}=ctx.project;
assert.equal(configChanged(stateConfig('fox',{mesh:{head:{s:[1,1,1],m:[0,0,0],o:true}},map:{AABBCCFF:'AABBCCFF'}})),false);
const config=stateConfig('fox',{map:{AABBCCFF:'112233FF'},mesh:{head:{s:[1,2,1],m:[3,0,0],r:[0,0,15],o:true}},deformOn:true,deform:{head:[{ops:[{type:'twist',axis:'y',degrees:12}]}]}});
assert.equal(configChanged(config),true);assert.equal(config.recolor.AABBCCFF,'112233');assert.equal(config.mesh[0].rotate[2],15);assert.equal(config.mesh[0].about.join(','),'0,0,0');assert.equal(config.deform[0].symbol,'head');
assert.equal(stateConfig('dog',{deformOn:false,deform:{head:[{ops:[]}]}}).deform,undefined);
console.log('Source host exposes complete build state; unchanged models excluded; mesh, palette, rotation and deform preserved.');
