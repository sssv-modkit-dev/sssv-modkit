// RigPlayer: a pose made from the rig itself binds back to its phase, the bound rest frame is the captured
// pose, and playing moves the legs but not the body.
const fs=require('fs'),assert=require('assert');
eval(fs.readFileSync('src/viewer/js/rig-player.js','utf8'));
const R=globalThis.RigPlayer;
assert.equal(R.keyAngle([0,23,32,23,0,-23,-32,-23],48),27);
const walk=[0,23,32,23,0,-23,-32,-23],rig={body:{hl:390,hw:150,lift:400},neck:[600,400,10],tail:[26,870,16],
 legs:{seg:1,front:{len:[500],bounce:0},rear:{len:[500],bounce:0},tables:{walk:[walk,walk]},offs:{walk:[0,128,128,0]}},
 parts:[[1,20],[1,2],[2,26],[3,7],[5,13],[4,10,1],[6,16,1]]};
const J=R.quadJoints(rig,40,'walk'),k=.25,pose={parts:rig.parts.map(([a,b,m])=>{const M=R.partMatrix(J,a,b,m||0);return {dl:'p',mirror:m||0,rows:M.R.map(r=>r.map(v=>v*k)),T:M.T.map(v=>v*k)}})};
pose.anim=rig;const bound=R.bind(pose);
assert.ok(bound&&bound.rest.e<1e-9&&Math.abs(bound.rest.s-k)<1e-9,'binds with the pose scale');
const close=(a,b)=>Math.abs(a-b)<1e-9;
bound.frame(40,'walk').forEach((p,i)=>p.rows.forEach((r,j)=>r.forEach((v,c)=>assert.ok(close(v,pose.parts[i].rows[j][c])))));
const later=bound.frame(104,'walk');
assert.ok(later[1].rows.every((r,j)=>r.every((v,c)=>close(v,pose.parts[1].rows[j][c]))),'body stays put');
assert.ok(later[3].rows[0].some((v,c)=>!close(v,pose.parts[3].rows[0][c])),'front leg swings');
assert.equal(R.bind({parts:pose.parts}),null);
// three-bone legs: knee and ankle follow the hip-knee-ankle angles of each key
const k3=[[0,10,20],[20,30,40],[40,0,0],[20,0,0],[0,0,0],[-20,0,0],[-40,0,0],[-20,0,0]];
const J3=R.quadJoints({body:{hl:300,hw:150,lift:900},legs:{seg:3,front:{len:[400,300,200]},rear:{len:[400,300,200]},tables:{walk:[k3,k3]},offs:{walk:[0,0,0,0]}}},32,'walk');
assert.deepEqual([J3[7],J3[8],J3[9]].map(v=>v.map(Math.round)),[[-150,300-((400*88)>>8),900-((400*241)>>8)],[-150,300-((400*88)>>8)-((300*128)>>8),900-((400*241)>>8)-((300*222)>>8)],[-150,300-((400*88)>>8)-((300*128)>>8)-((200*165)>>8),900-((400*241)>>8)-((300*222)>>8)-((200*196)>>8)]]);
// bird: wings glide near level, the flap stroke reaches 170 deg (down) at step 4, toes curl only when walking
const bird={body:{kind:'bird',L:312,h:812},head:[562,375,1],wings:[1125,125],tail:750,legs:{p1:812,p2:250,p3:312,p4:312}};
const sn=d=>Math.round(Math.sin(d*Math.PI/180)*256),cs=d=>Math.round(Math.cos(d*Math.PI/180)*256);
const fl=R.joints(bird,28,'flap');assert.deepEqual(fl[22],[(1125*sn(170))>>8,0,812+((1125*cs(170))>>8)]);assert.equal(fl[24][0],-fl[22][0]);
assert.ok(R.joints(bird,0,'walk')[22][2]===812,'glide starts level');
assert.ok(R.joints(bird,32,'walk')[8][2]<-100&&R.joints(bird,64,'flap')[8][2]===0,'toes curl only when walking');
console.log('Rig player: bind, rest frame, leg swing, three-bone legs and bird wings passed.');
