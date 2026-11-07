// scene-v1 document: bundle adapter round trip and validation.
const assert=require('assert'),fs=require('fs'),path=require('path');
const Scene=require('../src/levels/scene.js'),SceneImport=require('../src/levels/scene-import.js');
const bundle=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/web/demo/level-4.json'),'utf8'));
delete bundle.format;

// test_roundtrip_level4
assert.deepStrictEqual(Scene.toRuntime(SceneImport.fromBundle(bundle)),bundle);
// test_validate_ok
assert.deepStrictEqual(Scene.validate(SceneImport.fromBundle(bundle)),[]);
// test_validate_errors
assert.ok(Scene.validate({format:'x'}).some(e=>/format/.test(e)));
const doc=SceneImport.fromBundle(bundle);doc.levels[0].atlas='missing';
assert.ok(Scene.validate(doc).some(e=>/atlases/.test(e)));
assert.ok(Scene.validate(null).length>0);
// fromBundle refuses fields it does not map
assert.throws(()=>SceneImport.fromBundle({...bundle,EXTRA:1}),/unmapped field EXTRA/);
assert.throws(()=>SceneImport.fromBundle({...bundle,LEVELS:[{...bundle.LEVELS[0],zz:1}]}),/unmapped field zz/);
console.log('scene-v1: round trip, validation and unmapped-field checks passed.');
