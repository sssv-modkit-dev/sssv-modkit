// scene-v1 and scene-edits-v1 on the sample island: validation, runtime shape, and the edits round trip.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..'),Scene=require('../src/levels/scene.js');
const island=JSON.parse(fs.readFileSync(path.join(root,'packs/sample/assets/island.scene.json'),'utf8'));
assert.deepStrictEqual(Scene.validate(island),[]);
assert.ok(Scene.validate({format:'x'}).some(e=>/format/.test(e)));
assert.ok(Scene.validate(null).length>0);
const broken=structuredClone(island);broken.levels[0].atlas='missing';
assert.ok(Scene.validate(broken).some(e=>/atlases/.test(e)));
const rt=Scene.toRuntime(island),id=String(rt.LEVELS[0].id);
assert.equal(rt.EDITOR_SHA1,island.source.sha1);assert.equal(rt.LEVELS[0].tex,island.levels[0].atlas);
assert.deepStrictEqual(rt.EDITOR_STOCK[id].animals,island.levels[0].records.creatures);
// Edits: the editor's record functions, loaded the way the page inlines them.
const source=fs.readFileSync(path.join(root,'src/levels/editor.js'),'utf8').split('let edRecords=')[0];
const ctx={Uint8Array,DataView,structuredClone,EDITOR_STOCK:rt.EDITOR_STOCK,EDITOR_SHA1:rt.EDITOR_SHA1};
vm.createContext(ctx);vm.runInContext(source+';this.api=EditorRecords;',ctx);
const R=ctx.api,plain=v=>JSON.parse(JSON.stringify(v));
const records=structuredClone(rt.EDITOR_STOCK),p3=records[id].props[3];
records[id].props[3]=R.update(p3,'props',[...R.values(p3,'props').slice(0,1),1000,2000,64,...R.values(p3,'props').slice(4)]);
records[id].animals.push(records[id].animals[0]);records[id].props.push(records[id].props[1]);
const edits=plain(R.diff(records));
assert.equal(edits.format,'scene-edits-v1');assert.equal(edits.source_sha1,island.source.sha1);
assert.deepStrictEqual(edits.levels[id].props.set.map(s=>s.index),[3]);
assert.equal(edits.levels[id].props.add.length,1);assert.equal(edits.levels[id].creatures.add.length,1);
assert.deepStrictEqual(plain(R.diff(R.validate(edits))),edits);  // open -> save keeps set and add order
assert.throws(()=>R.validate({...edits,source_sha1:'0'.repeat(40)}),/different source/);
for(const bad of [{},null,[],{format:'scene-edits-v1'}])assert.throws(()=>R.validate(bad),/not a scene edits file/);
assert.throws(()=>R.validate({...edits,levels:{[id]:{things:{set:[]}}}}),/Only props and creatures/);
console.log('scene-v1: island valid; edits round trip; wrong source and malformed files refused.');
