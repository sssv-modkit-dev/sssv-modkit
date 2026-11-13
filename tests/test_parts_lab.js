// Coverage for original geometry and the public import/share boundary.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const models=fs.readFileSync('src/viewer/js/demo-models.js','utf8');
const lab=fs.readFileSync('src/viewer/js/parts-lab.js','utf8').split('//#LAB-PURE-START')[1].split('//#LAB-PURE-END')[0];
const context=vm.createContext({});vm.runInContext(models+'\n'+lab+'\nthis.api={models:PARTS_DEMOS,validateDemoPreset,editMemory,examplePart};',context);
const {models:demo,validateDemoPreset:validate}=context.api;
assert.equal(Object.keys(demo).length,3);
for(const [name,m] of Object.entries(demo)){
  assert.ok(m.p.length>=10);assert.equal(new Set(m.p.map(p=>p.s)).size,m.p.length);
  for(const p of m.p){
    assert.ok(p.demo.tris.length);assert.ok(p.demo.bb.every(Number.isFinite));
    for(const t of p.demo.tris)for(const v of t.v)for(let k=0;k<3;k++)assert.ok(Number.isInteger(v[k])&&v[k]>=p.demo.bb[k]&&v[k]<=p.demo.bb[k+3]);
  }
  const preset={format:'sssv-parts-lab-demo-v1',model:name,mesh:{[m.p[0].s]:{s:[1,2,1],m:[0,0,0],o:false}},palette:{[m.p[0].demo.cols[0].rgba]:'AABBCCFF'},deform:{[m.p[0].s]:[{ops:[{type:'bend',axis:'y',toward:'x',degrees:65}]}]},exploded:true};
  const result=validate(preset);assert.equal(JSON.stringify(validate(JSON.parse(JSON.stringify(result)))),JSON.stringify(result));
  assert.throws(()=>validate({...preset,model:'constructor'}));
  assert.throws(()=>validate({...preset,mesh:{evil:{s:[1,1,1],m:[0,0,0],o:false}}}));
  assert.throws(()=>validate({...preset,mesh:{[m.p[0].s]:{s:[Infinity,1,1],m:[0,0,0],o:false}}}));
  assert.throws(()=>validate({...preset,palette:{'AABBCCFF':'<script>'}}));
}
console.log('3 original models; demo preset round trips; invalid share inputs rejected.');

const memory=context.api.editMemory(),edits={mesh:{head:{s:[1,2,1]}},map:{A:'B'},deform:{head:[{ops:[]}]}};
memory.put('a',edits);edits.mesh.head.s[1]=9;memory.put('b',{mesh:{}});
assert.equal(memory.get('a').mesh.head.s[1],2);const restored=memory.get('a');restored.mesh.head.s[1]=7;assert.equal(memory.get('a').mesh.head.s[1],2);
assert.equal(JSON.stringify(memory.get('missing')),'{}');
const candidates=[{sym:'head'},{sym:'tail'},{sym:'paw'}];
assert.equal(context.api.examplePart(candidates,null,()=>.8).sym,'paw');
assert.equal(context.api.examplePart(candidates,'tail',()=>0).sym,'tail');
assert.equal(context.api.examplePart([],null,()=>0),undefined);
console.log('Per-model edits isolated and restored; examples select a random part unless selected.');

const snapshots=memory.entries();assert.equal(snapshots.length,2);snapshots[0][1].mesh.head.s[1]=100;assert.equal(memory.get('a').mesh.head.s[1],2);
console.log('Project snapshots enumerate model edits without sharing mutable references.');
