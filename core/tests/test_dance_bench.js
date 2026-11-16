// Smoke test of tools/dance-bench: sheet, report and GIF for the sample rig, then a puppet built from a small box model
// (once by named groups, once by box cuts) and drawn dancing.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{execFileSync}=require('child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'dance-bench-')),bench=(...a)=>execFileSync(process.execPath,['tools/dance-bench/bench.js',...a],{encoding:'utf8'});
try{
 const rig='tools/dance-bench/rigs/sample-biped.json',isPng=f=>fs.readFileSync(f).subarray(1,4).toString()==='PNG',isGif=f=>fs.readFileSync(f).subarray(0,6).toString()==='GIF89a';
 const sheet=path.join(tmp,'sheet.png');assert.match(bench('sheet','--rig',rig,'--mode','thriller','--out',sheet),/16 cells/);assert.ok(isPng(sheet));
 const rep=bench('report','--rig',rig);for(const m of ['ride','lasso','shuffle','point','wave','spin','thriller'])assert.ok(rep.includes(m),'report lists '+m);
 assert.ok(!/twitchy/.test(rep.split('\n').slice(1,9).join('\n')),'no built-in move is flagged twitchy');assert.ok(!/\d!/.test(rep),'no two built-in moves look alike');
 const gif=path.join(tmp,'spin.gif');bench('gif','--rig',rig,'--mode','spin','--size','80','--out',gif);assert.ok(isGif(gif));
 const draft=path.join(tmp,'draft.json');fs.writeFileSync(draft,JSON.stringify({moves:{nod:{beats:2,legs:['still'],nod:20,keys:[{t:0,A:[150,40],B:[150,40]}]}}}));
 assert.match(bench('sheet','--rig',rig,'--mode','nod','--moves',draft,'--out',sheet),/4 cells/);
 // a box figure: y up, facing +z; boxes named by body part
 const boxes={torso:[-1,2,-.5,1,5,.5],head:[-.5,5,-.5,.5,6,.5],armA:[1,2.5,-.3,1.6,5,.3],armB:[-1.6,2.5,-.3,-1,5,.3],legA:[.1,0,-.4,.9,2,.4],legB:[-.9,0,-.4,-.1,2,.4]};
 let obj='',n=0;for(const [g,[x0,y0,z0,x1,y1,z1]] of Object.entries(boxes)){obj+=`g ${g}\n`;for(const x of [x0,x1])for(const y of [y0,y1])for(const z of [z0,z1])obj+=`v ${x} ${y} ${z}\n`;
  for(const f of [[1,2,4,3],[5,7,8,6],[1,5,6,2],[3,4,8,7],[1,3,7,5],[2,6,8,4]])obj+='f '+f.map(i=>i+n).join(' ')+'\n';n+=8}
 const model=path.join(tmp,'figure.obj'),map=path.join(tmp,'map.json'),out=path.join(tmp,'figure.rig.json');fs.writeFileSync(model,obj);
 const info=bench('obj-info',model,'--out',path.join(tmp,'info.png'));assert.match(info,/6 groups/);const guess=JSON.parse(info.slice(info.indexOf('{\n "up"')).split('\nThe groups')[0]);
 assert.deepEqual(guess.parts.torso,['torso']);assert.deepEqual(guess.parts.head,['head']);assert.equal(guess.parts.armA.length+guess.parts.armB.length,2);assert.equal(guess.parts.legA.length+guess.parts.legB.length,2);
 fs.writeFileSync(map,JSON.stringify({parts:Object.fromEntries(Object.keys(boxes).map(k=>[k,[k]]))}));assert.match(bench('puppet',model,'--map',map,'--out',out),/6 parts/);
 const R=JSON.parse(fs.readFileSync(out,'utf8'));assert.equal(R.body.kind,'puppet');assert.deepEqual(R.actions.dance.arms,[7,8,10,11]);assert.ok(Math.abs(R.body.J[1][2]-3300)<400,'chest joint at shoulder height');
 assert.match(bench('sheet','--rig',out,'--mode','dance','--per-beat','1','--out',sheet),/32 cells/);assert.ok(isPng(sheet));
 // the same figure cut by boxes instead of groups
 fs.writeFileSync(model,obj.replace(/^g .*\n/gm,'g all\n'));fs.writeFileSync(map,JSON.stringify({cuts:{head:[{box:[[-1000,-9e4,3400],[1000,9e4,9e4]]}],armA:[{box:[[700,-9e4,0],[9e4,9e4,9e4]]}],armB:[{box:[[-9e4,-9e4,0],[-700,9e4,9e4]]}],legA:[{box:[[0,-9e4,-9e4],[700,9e4,1300]]}],legB:[{box:[[-700,-9e4,-9e4],[0,9e4,1300]]}]}}));
 assert.match(bench('puppet',model,'--map',map,'--out',out),/torso 22, head 10, armA 10, armB 10, legA 10, legB 10 triangles/);
 console.log('Dance bench: sheet, report, GIF, draft moves, OBJ info, puppets by groups and by cuts passed.');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
