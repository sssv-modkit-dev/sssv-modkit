// ROM-free coverage for original geometry and the public import/share boundary.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const models=fs.readFileSync('tools/viewer/js/demo-models.js','utf8');
const lab=fs.readFileSync('tools/viewer/js/parts-lab.js','utf8').split('//#LAB-PURE-START')[1].split('//#LAB-PURE-END')[0];
const context=vm.createContext({});vm.runInContext(models+'\n'+lab+'\nthis.api={models:PARTS_DEMOS,validateDemoPreset,normaliseLocalTable};',context);
const {models:demo,validateDemoPreset:validate,normaliseLocalTable:table}=context.api;
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
const synthetic={synthetic:{seg_bases:{4:'0x100'},sections:['test'],parts:[{ended:true,seg:4,symbol:'part',rom:64,sections:['test']}]}};
assert.equal(table(synthetic).synthetic.p[0].r,64);
assert.throws(()=>table({...synthetic,'<img onerror=alert(1)>':synthetic.synthetic}));
assert.throws(()=>table(JSON.parse('{"__proto__":{}}')));
assert.throws(()=>table({synthetic:{...synthetic.synthetic,parts:[{ended:true,seg:4,symbol:'part',rom:-1}]}}));
console.log('3 original models; demo preset round trips; invalid share/table inputs rejected.');
