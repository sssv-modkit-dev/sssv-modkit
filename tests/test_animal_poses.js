const fs=require('fs'),assert=require('assert');
const poses=require('../src/web/animal-poses.js');
const originalFetch=global.fetch;
let labels;require('vm').runInNewContext(fs.readFileSync('src/levels/names.js','utf8'),{LevelSelection:{define:n=>labels=n.animals},LevelGallery:{HEADS:{}}});
for(const [id,name] of poses.species)assert(labels[id].toLowerCase().replaceAll('_',' ').includes(name==='pirana'?'piranha':name.replaceAll('_',' ')),[id,name]);
(async()=>{
 const expected=['camel','cool_cod','desert_fox','elephant','gorilla','husky','hyena','kangaroo','lion','mouse','pirana','polar_bear','rabbit','rat','scorpion','tortoise','vulture','walrus','parrot'];
 assert.equal(poses.species.length,24);assert.equal(new Set(poses.species.map(([id])=>id)).size,24);
 for(const n of expected)assert(poses.species.some(([,name])=>n===name),n);
 global.fetch=async url=>{
  const name=url.split('/').pop().replace('.json','');
  if(name==='camel')throw Error('offline');
  if(name==='rat')return {ok:false,status:404};
  if(name==='elephant')return {ok:true,json:async()=>({animal:'elephant',parts:[{}]})};
  return {ok:true,json:async()=>JSON.parse(fs.readFileSync('src/web/'+url,'utf8'))};
 };
 const loaded=await poses.load();assert.equal(Object.keys(loaded.poses).length,21);assert.deepEqual(Object.keys(loaded.errors).sort(),['camel','elephant','rat']);assert(loaded.poses.walrus);
 global.SSSVAnimalPoses=poses;global.SSSVBuilder={deriveTable:async()=>Object.fromEntries(poses.species.map(([,n])=>[n,{seg_bases:{},parts:[]}]))};
 const models=await require('../src/levels/animal-assembly.js').fromROM(new ArrayBuffer(8));assert.deepEqual(models.models,{});
 console.log('Pose registry: 24 species, all new poses, failed fetch/HTTP/malformed isolation and missing-geometry fallback pass.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.fetch=originalFetch});
