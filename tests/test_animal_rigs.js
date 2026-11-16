// Animal rigs (Model Editor walk/run): every rig matches its captured pose part for part, names only
// joints the player computes, and reads tables only from overlay A.
const fs=require('fs'),assert=require('assert');
eval(fs.readFileSync('src/viewer/js/animal-rigs.js','utf8'));
eval(fs.readFileSync('core/src/viewer/js/rig-player.js','utf8'));
const {RIGS,attach}=globalThis.SSSVAnimalRigs;let n=0;
for(const [name,rig] of Object.entries(RIGS)){
 const pose=JSON.parse(fs.readFileSync('src/web/demo/poses/'+name+'.json','utf8'));
 assert.equal(rig.parts.length,pose.parts.length,name+': one rig entry per captured part');
 for(const m of Object.values(rig.legs.tables))for(const a of m)assert.ok(a>=0x80294E50&&a<0x803C0420,name+': table inside overlay A');
 // fake ROM: zero tables -> legs straight down; the rig still binds and plays
 const rom=new ArrayBuffer(0x800000),p={...pose,parts:pose.parts.map(x=>({...x}))};
 assert.equal(attach({[name]:p},rom),1,name+' attaches');
 const b=globalThis.RigPlayer.bind(p);assert.ok(b,name+' binds');
 const f=b.frame(64,b.modes[0]);assert.equal(f.length,pose.parts.length);
 assert.ok(f.every(x=>x.rows.flat().concat(x.T).every(Number.isFinite)),name+': finite frame');
 n++;
}
assert.ok(n>=6);
console.log('Animal rigs: '+n+' rigs match their captured poses and play.');
