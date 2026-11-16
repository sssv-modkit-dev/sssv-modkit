// RigPlayer: a pose made from the rig itself binds back to its phase, the bound rest frame is the captured
// pose, and playing moves the legs but not the body.
const fs=require('fs'),assert=require('assert');
eval(fs.readFileSync('src/viewer/js/rig-player.js','utf8'));
const R=globalThis.RigPlayer;
assert.equal(R.keyAngle([0,23,32,23,0,-23,-32,-23],48),27);
const walk=[0,23,32,23,0,-23,-32,-23],rig={body:{hl:390,hw:150,lift:400},neck:[600,400,10],tail:[26,870,16],
 legs:{len:500,double:false,feet:[[3,7,0],[4,10,0x80],[5,13,0x80],[6,16,0]],tables:{walk:[walk,walk]}},
 parts:[[1,20],[1,2],[2,26],[3,7],[5,13],[4,10,1],[6,16,1]]};
const J=R.quadJoints(rig,40,'walk'),k=.25,pose={parts:rig.parts.map(([a,b,m])=>{const M=R.partMatrix(J,a,b,m||0);return {dl:'p',mirror:m||0,rows:M.R.map(r=>r.map(v=>v*k)),T:M.T.map(v=>v*k)}})};
pose.anim=rig;const bound=R.bind(pose);
assert.ok(bound&&bound.rest.ph===40&&bound.rest.e<1e-9,'binds to the phase the pose was made at');
const close=(a,b)=>Math.abs(a-b)<1e-9;
bound.frame(40,'walk').forEach((p,i)=>p.rows.forEach((r,j)=>r.forEach((v,c)=>assert.ok(close(v,pose.parts[i].rows[j][c])))));
const later=bound.frame(104,'walk');
assert.ok(later[1].rows.every((r,j)=>r.every((v,c)=>close(v,pose.parts[1].rows[j][c]))),'body stays put');
assert.ok(later[3].rows[0].some((v,c)=>!close(v,pose.parts[3].rows[0][c])),'front leg swings');
assert.equal(R.bind({parts:pose.parts}),null);
console.log('Rig player: bind, rest frame and leg swing passed.');
