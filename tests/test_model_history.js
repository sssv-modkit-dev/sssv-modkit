const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createHistory}=require('../src/viewer/js/history.js');
let state={edits:{models:{a:1},textures:{texture_patches:[]}},current:{name:'one'}};
let restored,notifications=[];
const H=createHistory({capture:()=>state,restore:value=>{restored=value;state=value;},onChange:s=>notifications.push(s),limit:3});
H.begin();state.current.name='two';assert.equal(H.end(),false,'navigation does not become an edit');
H.begin();H.begin();state.edits.models.a=2;state.edits.models.a=3;H.end();assert.equal(H.size,1,'one drag/stroke groups many mutations');
assert.equal(H.undo(),true);assert.equal(state.edits.models.a,1);assert.equal(state.current.name,'two');assert.equal(H.canRedo,true);
restored.edits.models.a=99;assert.equal(H.redo(),true);assert.equal(state.edits.models.a,3,'history has independent deep snapshots');
H.undo();H.transaction(()=>state.edits.models.a=4);assert.equal(H.canRedo,false,'new edit replaces future branch');
for(let n=5;n<11;n++)H.transaction(()=>state.edits.models.a=n);assert.equal(H.size,3,'history bounded to configured capacity');
H.undo();H.undo();H.undo();assert.equal(H.undo(),false);assert.equal(state.edits.models.a,7);
H.reset();assert.equal(H.canUndo,false);assert.equal(H.canRedo,false);
H.begin();state.edits.textures.texture_patches=[{offset:4096,expect:'0000',write:'1234'}];H.end();H.undo();assert.deepEqual(state.edits.textures.texture_patches,[]);H.redo();assert.equal(state.edits.textures.texture_patches[0].write,'1234');
H.begin();state.edits.models.a=42;H.cancel();assert.equal(H.size,1,'cancellation discards an active checkpoint');
assert.ok(notifications.some(v=>v.canUndo));

// Keyboard shortcuts preserve native text/number input editing.
const listeners={},doc={addEventListener:(name,fn)=>{(listeners[name]||=[]).push(fn)}},win={document:doc};
const context=vm.createContext({window:win,queueMicrotask:fn=>fn()});
vm.runInContext(fs.readFileSync('src/viewer/js/history.js','utf8'),context);
let value=0;win.ModelEditorHistory.configure({capture:()=>({value}),restore:s=>value=s.value});
win.ModelEditorHistory.transaction(()=>value=1);
const key=(name,{native=false,shift=false,meta=false}={})=>{const e={key:name,ctrlKey:!meta,metaKey:meta,shiftKey:shift,altKey:false,target:{closest:()=>native},preventDefault(){this.prevented=true}};listeners.keydown[0](e);return e;};
assert.equal(key('z',{native:true}).prevented,undefined);assert.equal(value,1);
assert.equal(key('z').prevented,true);assert.equal(value,0);key('y');assert.equal(value,1);
key('z',{meta:true});assert.equal(value,0);key('z',{meta:true,shift:true});assert.equal(value,1);

// Per-part colours and newly exposed deformations survive legacy demo presets.
const demos=fs.readFileSync('src/viewer/js/demo-models.js','utf8'),lab=fs.readFileSync('src/viewer/js/parts-lab.js','utf8').split('//#LAB-PURE-START')[1].split('//#LAB-PURE-END')[0];
const demoContext=vm.createContext({});vm.runInContext(demos+'\n'+lab+'\nthis.api={models:PARTS_DEMOS,validate:validateDemoPreset};',demoContext);
const model=Object.keys(demoContext.api.models)[0],part=demoContext.api.models[model].p[0],from=part.demo.cols[0].rgba;
const preset={format:'sssv-parts-lab-demo-v1',model,mesh:{},palette:{},partColors:{[part.s]:{[from]:'010203FF'}},deform:{[part.s]:[{ops:[{type:'taper',axis:'y',from:1,to:.5},{type:'inflate',amount:1.25,axes:'xyz'}]}]}};
const valid=demoContext.api.validate(preset);assert.equal(valid.partColors[part.s][from],'010203FF');assert.equal(valid.deform[part.s][0].ops[1].amount,1.25);
assert.throws(()=>demoContext.api.validate({...preset,partColors:{missing:{[from]:'FFFFFFFF'}}}),/part palette/);
assert.throws(()=>demoContext.api.validate({...preset,deform:{[part.s]:[{ops:[{type:'taper',axis:'y',from:1,to:100}]}]}}),/taper/);
console.log('Model history: grouped undo/redo, bounds, branching, navigation isolation, texture patches, native shortcuts and part/deform presets pass.');
