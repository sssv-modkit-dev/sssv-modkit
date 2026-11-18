'use strict';
const assert=require('node:assert/strict'),S=require('../src/web/story/rom'),C=require('../src/web/story/cutscenes'),R=require('../src/web/story/rnc'),{fixture}=require('./cutscene-fixture');
const rom=fixture(),p=new S.Project(rom);
assert.equal(Object.keys(p.data.cutscenes).length,36);
for(let lv=1;lv<=36;lv++){
 const parsed=C.parse(S.chunks(rom,lv));assert.equal(parsed.records.length,16);assert.equal(parsed.scripts.length,2);
 assert.deepEqual(parsed.scripts[0],{entry:1,count:14,objects:['prop #0 (type 12)','prop #1 (type 13)'],terminated:true});
 assert.equal(parsed.scripts[1].entry,15);assert.equal(parsed.scripts[1].objects[0],'animal #0 (type 7)');
 assert.match(C.describe(parsed.records[0],p.data.banks[0].strings),/message "A made-up greeting" hold 3 s/);
 for(const [i,name] of [[1,'on target'],[2,'on player'],[3,'fixed point'],[4,'sound'],[5,'wait'],[7,'if'],[8,'wait until'],[9,'loop'],[10,'loop end'],[11,'go to'],[12,'other action'],[14,'back to play']])assert.ok(C.describe(parsed.records[i]).includes(name));
}
assert.equal(C.value(0x7f7e),'32638');assert.equal(C.value(0x7f7f),'$7F7F');assert.equal(C.value(0x7fff),'$7FFF');assert.equal(C.value(0xffff,true),'-1');
assert.equal(C.fields(p.data.cutscenes[1][6])[0].disabled,true);
assert.throws(()=>C.edit(p.data.cutscenes[1][6],C.fields(p.data.cutscenes[1][6])[0],9));
assert.deepEqual(C.fields(p.data.cutscenes[1][12]),[],'unknown record is read-only by default');
assert.equal(C.fields(p.data.cutscenes[1][12],true).length,4);
assert.throws(()=>C.edit(p.data.cutscenes[1][12],{arg:0,shift:null},9));
const shot=p.data.cutscenes[1][1],field=C.fields(shot)[0];C.edit(shot,field,120);assert.equal(shot.args[0],0x1278,'preserve high byte');
assert.equal(C.describe(shot),'camera: on target, 120 frames, style 110');
assert.equal(C.describe(p.data.cutscenes[1][3]),'camera: fixed point 4,5,6 (x32), 45 frames, style 7');
assert.deepEqual(C.fields(shot).map(f=>f.label),['Camera shot (frames)','Camera style','Camera position x (x32, used by some styles)','Camera position y (x32, used by some styles)','Camera position z (x32, used by some styles)']);
for(const op of [0x4d,0x4e]){
 for(const f of C.fields({...shot,op})){
  const r={op,args:[0x1234,0x5678,0x9abc,0xdef0]},before=r.args.slice();C.edit(r,f,23);
  assert.deepEqual(r.args,before.map((word,i)=>i===f.arg?(word&~(255<<f.shift))|(23<<f.shift):word),'preserve all other packed fields');
 }
 assert.equal(C.fields({...shot,op}).some(f=>f.arg===3),false,'zoom and flags require Advanced');
 const r={op,args:[0,0,0,0x1210]};assert.deepEqual(C.zoom(r),{min:-1,max:-1});
 assert.throws(()=>C.edit(r,{arg:3,shift:null},0));
 C.edit(r,C.fields(r,true)[3],0xf800,true);assert.deepEqual(C.zoom(r),{min:-3,max:5},'special min overrides both endpoints');
 for(let min=0;min<31;min++)for(let max=0;max<32;max++){
  r.args[3]=(min<<11)|(max<<3)|0x607;assert.deepEqual(C.zoom(r),{min:min-3,max:max-3},'flags do not affect zoom');
 }
}
const built=p.build(),q=new S.Project(built),expected=structuredClone(p.original.cutscenes);expected[1][1].args[0]=0x1278;
assert.deepEqual(q.data.cutscenes,expected,'only requested camera duration changed across all levels');
const before=S.chunks(rom,1),after=S.chunks(built,1);assert.deepEqual(after.tail,before.tail);for(const ch of before.out.filter(c=>c.id!==4))assert.deepEqual(after.out.find(c=>c.id===ch.id).data,ch.data);
const fixed=p.data.cutscenes[1][3];for(const [n,f] of C.fields(fixed).entries())C.edit(fixed,f,20+n);assert.equal(fixed.args[0]>>>8,0x12);assert.equal(fixed.args[2]&255,21);
assert.throws(()=>C.edit(shot,field,256));assert.throws(()=>C.edit(shot,field,-1));assert.throws(()=>C.edit(shot,field,1.5));
// In-place record counts can still grow the compressed level. Exercise real installation/CRC.
const grow=new S.Project(rom);let seed=19;for(const r of grow.data.cutscenes[1])for(const f of C.fields(r,true)){seed=(Math.imul(seed,1664525)+1013904223)>>>0;C.edit(r,f,seed&65535,true);}
const grown=grow.build(),ent=0x7b72a8;assert.ok(R.u32(grown,ent)>=rom.length,'level relocated to appended space');assert.ok(grown.length>rom.length);
assert.deepEqual(new S.Project(grown).data.cutscenes,grow.data.cutscenes);
const crc=grown.slice();S.fixCRC(crc);assert.deepEqual(crc,grown);
const invalid=structuredClone(p.data);invalid.cutscenes[1].pop();assert.throws(()=>S.validate(p.original,invalid));
const legacy=structuredClone(p.data);delete legacy.cutscenes;legacy.levels[1].find(r=>r.op==='wait').frames=123;assert.equal(new S.Project(p.build(legacy)).data.cutscenes[1][5].args[0],123,'old timing sessions still build');
console.log('Cutscenes: 36 invented levels, shared entries, names, literal/variable guards, byte edits, exact round trip, legacy timing and relocation passed');
