'use strict';
const assert=require('node:assert/strict'), R=require('../src/web/story/rnc'), S=require('../src/web/story/rom');
for(const n of [0,1,2,99,12345,33000]) {const b=Uint8Array.from({length:n},(_,i)=>(i*i+17*i)%251);assert.deepEqual(R.unpack(R.pack(b)),b);}
const strings=['@NTest place','#SMy invented brief\nSecond line','@CYHello @G01!',''];
const block=S.encodeBlock(strings), d=new Uint8Array(48+block.length);R.put32(d,8,48);d.set(block,48);assert.deepEqual(S.readBlock(d).strings,strings);
assert.throws(()=>S.encodeBlock(['bad\ttext']));assert.throws(()=>S.encodeBlock(['é']));assert.throws(()=>R.unpack(new Uint8Array(18)));
const px=Uint16Array.from({length:1024},(_,i)=>(i*37)&65535);assert.deepEqual(S.decodeTile(S.encodeTile(px)),px);
// Half-way channel averages follow numpy's ties-to-even rounding; alpha uses >= .5.
const tiny=new Uint16Array(1024);tiny[0]=2;tiny[1]=2;const encoded=S.encodeTile(tiny);assert.equal(R.u16(encoded,2048)&63,0);
const a=Uint8Array.of(0,1,2),b=Uint8Array.of(0,5,2,8),patch=S.ips(a,b);assert.equal(Buffer.from(patch.slice(0,5)).toString(),'PATCH');
const out=new Uint8Array(b.length);out.set(a);for(let p=5;p<patch.length-3;){const o=patch[p]*65536+patch[p+1]*256+patch[p+2],n=R.u16(patch,p+3);out.set(patch.slice(p+5,p+5+n),o);p+=5+n;}assert.deepEqual(out,b);
// Every fixture below is invented; no game text, pixels or ROM bytes.
const script=new Uint8Array(42);R.put16(script,0,40);
[[0x44,0,7],[6,30,0],[6,0x7f00,0],[1,99,0]].forEach((r,i)=>r.forEach((v,j)=>R.put16(script,2+10*i+2*j,v)));
const records=S.timing({out:[{id:4,data:script}]},['Invented message']);
assert.deepEqual(records,[{i:0,op:'message',text:0,hold_seconds:7,says:'Invented message'},{i:1,op:'wait',frames:30}]);
const original={banks:{0:{strings:{0:'Fixture'}}},levels:{1:records},capacities:{0:22}};
const edits=()=>JSON.parse(JSON.stringify(original));
S.validate(original,edits());
for(const mutate of [d=>d.banks[0].strings[1]='extra',d=>d.banks[0].strings[0]='Too much invented text',d=>d.levels[1][0].i++,d=>d.levels[1][0].hold_seconds=0.5,d=>d.levels[1][1].frames=0x7f00]) {
 const d=edits();mutate(d);assert.throws(()=>S.validate(original,d));
}
const corrupt=R.pack(Uint8Array.of(1,2,3));corrupt[corrupt.length-1]^=1;assert.throws(()=>R.unpack(corrupt),/CRC/);
// IPS must not emit its EOF sentinel as a record offset, including a full-size run.
function applyIPS(base,patch,size){
 const out=new Uint8Array(size);out.set(base);
 for(let p=5;String.fromCharCode(...patch.slice(p,p+3))!=='EOF';){
  const o=patch[p]*65536+patch[p+1]*256+patch[p+2],n=R.u16(patch,p+3);assert.ok(n>0);out.set(patch.slice(p+5,p+5+n),o);p+=5+n;
 }
 return out;
}
for(const start of [0,0x454f46,0x454f46-65535]){
 const base=new Uint8Array(start+70000),next=base.slice();next.fill(77,start);
 assert.deepEqual(applyIPS(base,S.ips(base,next),next.length),next);
}
console.log('Story synthetic codecs, timing validation, CRC rejection and IPS boundaries passed');
