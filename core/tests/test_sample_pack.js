// Sample pack: a generated island scene and CC0 models, all licensed and valid.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),assets=path.join(root,'packs/sample/assets');
const Scene=require('../src/levels/scene.js');
const island=JSON.parse(fs.readFileSync(path.join(assets,'island.scene.json'),'utf8'));
// test_island_valid
assert.deepEqual(Scene.validate(island),[]);
const runtime=Scene.toRuntime(island),L=runtime.LEVELS[0];
assert.equal(L.nsp,20);
assert.equal(L.an.length/5,4);
const stock=runtime.EDITOR_STOCK[String(L.id)];
assert.equal(stock.props.length,20);assert.equal(stock.animals.length,4);
assert.ok(stock.props.every(h=>/^[0-9a-f]{44}$/.test(h))&&stock.animals.every(h=>/^[0-9a-f]{32}$/.test(h)));
const sp=new Int32Array(Uint8Array.from(Buffer.from(L.sp,'base64')).buffer);
for(let k=0;k<20;k++){const b=Buffer.from(stock.props[k],'hex');assert.deepEqual([b.readUInt16BE(0),b.readInt16BE(2),b.readInt16BE(4),b.readInt16BE(6),b.readInt16BE(10)],[...sp.slice(k*5,k*5+5)],'prop '+k+' record matches spawn list');}
assert.equal(Buffer.from(L.pos,'base64').length,L.n*12);
assert.equal(Buffer.from(L.tile,'base64').length,65*97);assert.equal(Buffer.from(L.grid,'base64').length,65*97);
assert.ok(runtime.ATLAS[L.tex].startsWith('data:image/png;base64,iVBORw0KGgo'));
for(const k of Object.keys(runtime.MODEL))assert.equal(Buffer.from(runtime.MODEL[k].p,'base64').length,runtime.MODEL[k].n*6);
// test_deterministic
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'island-'));
const sha=f=>crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
for(const n of [1,2])execFileSync(process.execPath,[path.join(root,'tools/make_island.js'),'--seed','1','--out',path.join(tmp,n+'.json')]);
assert.equal(sha(path.join(tmp,'1.json')),sha(path.join(tmp,'2.json')));
assert.equal(sha(path.join(tmp,'1.json')),sha(path.join(assets,'island.scene.json')),'committed island is the seed-1 output');
// test_models_licensed
const third=fs.readFileSync(path.join(root,'THIRD_PARTY.md'),'utf8');
assert.ok(!/GPL/.test(third));
const models=JSON.parse(fs.readFileSync(path.join(assets,'models.json'),'utf8')).models;
assert.ok(Object.keys(models).length>=3);
for(const [name,m] of Object.entries(models)){
  assert.ok(third.includes(name),name+' listed in THIRD_PARTY.md');
  assert.ok(m.p.length>=1);
  for(const p of m.p){assert.ok(p.demo.tris.length&&p.demo.bb.every(Number.isFinite));
    for(const t of p.demo.tris){assert.ok(t.c>=0&&t.c<p.demo.cols.length);for(const v of t.v)assert.ok(v.every(Number.isInteger));}}
}
console.log('Sample pack: island valid and deterministic, records match spawns, models licensed and well-formed.');
