// scene-edits-v1: the Level Editor's neutral edits file, and the pack's conversion to the builder diff.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const demo=JSON.parse(fs.readFileSync(path.join(root,'src/web/demo/level-4.json'),'utf8'));
const legacy=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/edits-legacy.json'),'utf8'));
const edited=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/edits-records.json'),'utf8'));
const EditsExport=require('../src/levels/edits-export.js');
const source=fs.readFileSync(path.join(root,'src/levels/editor.js'),'utf8').split('let edRecords=')[0];
const ctx={Uint8Array,DataView,structuredClone,EDITOR_STOCK:demo.EDITOR_STOCK,EDITOR_SHA1:demo.EDITOR_SHA1};
vm.createContext(ctx);vm.runInContext(source+';this.api=EditorRecords;',ctx);
const R=ctx.api,plain=v=>JSON.parse(JSON.stringify(v));

// test_builder_diff_parity: neutral edits convert back to exactly what the editor exported before the split.
const edits=plain(R.diff(edited));
assert.equal(edits.format,'scene-edits-v1');assert.equal(edits.source_sha1,demo.EDITOR_SHA1);
assert.ok(edits.levels['4'].creatures&&!edits.levels['4'].animals);
assert.deepStrictEqual(EditsExport.toBuilderDiff(edits),legacy);
// test_add_roundtrip: open -> diff keeps set and add order.
assert.deepStrictEqual(plain(R.diff(R.validate(edits))),edits);
// test_open_edits_wrong_source
assert.throws(()=>R.validate({...edits,source_sha1:'0'.repeat(40)}),/different source/);
// test_open_garbage
for(const bad of [{},null,[],{format:'scene-edits-v1'}])assert.throws(()=>R.validate(bad),/not a scene edits file/);
// unknown kinds are refused, not ignored
assert.throws(()=>R.validate({...edits,levels:{'4':{things:{set:[]}}}}),/Only props and creatures/);
// legacy builder diffs still open in the SSSV pack
assert.deepStrictEqual(EditsExport.fromBuilderDiff(legacy),edits);
console.log('scene-edits-v1: parity with legacy diff, round trip and refusals passed.');
