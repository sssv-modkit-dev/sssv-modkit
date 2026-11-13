// SSSV pack: the local animal table parser rejects unsafe or malformed input.
const assert=require('node:assert/strict');
const table=require('../src/viewer/js/parts-table.js').normaliseLocalTable;
const synthetic={synthetic:{seg_bases:{4:'0x100'},sections:['test'],parts:[{ended:true,seg:4,symbol:'part',rom:64,sections:['test']}]}};
assert.equal(table(synthetic).synthetic.p[0].r,64);
assert.throws(()=>table({...synthetic,'<img onerror=alert(1)>':synthetic.synthetic}));
assert.throws(()=>table(JSON.parse('{"__proto__":{}}')));
assert.throws(()=>table({synthetic:{...synthetic.synthetic,parts:[{ended:true,seg:4,symbol:'part',rom:-1}]}}));
console.log('Parts table: valid table accepted; unsafe names, prototype keys and bad offsets rejected.');

const normalize=require('../src/viewer/js/parts-table.js').normaliseModelROM;
const rom=new Uint8Array(0x800000);rom.set([0x80,0x37,0x12,0x40]);rom.set(Buffer.from('NSVE'),0x3B);rom[0x80]=17;
for(const size of [1,2,4]){
  const input=rom.slice();
  if(size>1)for(let i=0;i<input.length;i+=size)input.subarray(i,i+size).reverse();
  const before=input.slice();
  assert.deepEqual(new Uint8Array(normalize(input)),rom,'normalized order '+size);
  assert.deepEqual(input,before,'source stays unchanged');
}
assert.throws(()=>normalize(new Uint8Array(32)),/8-16 MB/);
const wrong=rom.slice();wrong[0]=0;assert.throws(()=>normalize(wrong),/byte order/);
wrong.set(rom);wrong[0x3E]=0;assert.throws(()=>normalize(wrong),/US SSSV/);
console.log('ROM input: all three byte orders normalize identically without modifying the source; bad sizes/header/region rejected.');
