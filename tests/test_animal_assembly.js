const assert=require('node:assert/strict');const {assembleAnimal}=require('../src/levels/animal-assembly.js');
const rom=new ArrayBuffer(256),dv=new DataView(rom);dv.setUint32(0,0x0400002F);dv.setUint32(4,0x04000080);dv.setUint32(8,0xBF000000);dv.setUint32(12,0x00000204);dv.setUint32(16,0xB8000000);
for(const [i,v] of [[0,[0,0,0]],[1,[10,0,0]],[2,[0,10,0]]])for(let k=0;k<3;k++)dv.setInt16(128+i*16+k*2,v[k]);
const animal={seg_bases:{4:'0'},parts:[{symbol:'body',rom:0,ended:true}]},pose={parts:[{dl:'body',rows:[[1,0,0],[0,1,0],[0,0,1]],T:[0,0,5],mirror:0}]};
const m=assembleAnimal(rom,animal,pose);assert.equal(m.p.length,9);assert.deepEqual(m.p.map(v=>v||0),[0,0,0,0,-10,0,-10,0,0]);assert.equal(m.c.length,m.p.length);assert.equal(assembleAnimal(rom,animal,{parts:[{dl:'missing'}]}),null);console.log('Captured assembly: matching symbols, triangle decoding, axis conversion and grounded feet pass.');
