// SSSV pack: the local animal table parser rejects unsafe or malformed input.
const assert=require('node:assert/strict');
const table=require('../src/viewer/js/parts-table.js').normaliseLocalTable;
const synthetic={synthetic:{seg_bases:{4:'0x100'},sections:['test'],parts:[{ended:true,seg:4,symbol:'part',rom:64,sections:['test']}]}};
assert.equal(table(synthetic).synthetic.p[0].r,64);
assert.throws(()=>table({...synthetic,'<img onerror=alert(1)>':synthetic.synthetic}));
assert.throws(()=>table(JSON.parse('{"__proto__":{}}')));
assert.throws(()=>table({synthetic:{...synthetic.synthetic,parts:[{ended:true,seg:4,symbol:'part',rom:-1}]}}));
console.log('Parts table: valid table accepted; unsafe names, prototype keys and bad offsets rejected.');
