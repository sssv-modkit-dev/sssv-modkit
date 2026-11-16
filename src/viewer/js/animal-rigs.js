/* Walk/run rigs for assembled animals (Model Editor). Body sizes and joint numbers are constants from each
   animal's draw routine; the leg keyframe tables (8 keys x 6 bytes, s16 degrees first) are read from the
   user's US 1.0 ROM. Evaluated by RigPlayer in the core viewer. */
(function(root){
const OVL=a=>a-0x80294E50+0x6A6500;   // overlay A: RAM -> ROM (US 1.0)
const RIGS={
 // Fox: draw 0x802E5000. Pose part order = captured fox pose (head, body, tail, legs FL RL FR RR, head x2).
 fox:{body:{hl:390,hw:150,lift:400},neck:[600,400,10],tail:[26,870,16],
  legs:{len:500,double:false,feet:[[3,7,0],[4,10,0x80],[5,13,0x80],[6,16,0]],
   tables:{walk:[0x803A44D0,0x803A4544],run:[0x803A4500,0x803A4574]}},
  parts:[[1,20],[1,2],[2,26],[3,7],[5,13],[4,10,1],[6,16,1],[1,20],[1,20]]},
};
function readKeys(dv,ram){const o=OVL(ram),out=[];if(o<0||o+48>dv.byteLength)return null;
 for(let i=0;i<8;i++){const a=dv.getInt16(o+6*i);if(a<-90||a>90)return null;out.push(a)}return out}
function attach(poses,rom){const dv=new DataView(rom);let n=0;
 for(const [name,rig] of Object.entries(RIGS)){const pose=poses[name];if(!pose||pose.parts.length!==rig.parts.length)continue;
  const tables={};for(const [mode,addrs] of Object.entries(rig.legs.tables)){const t=addrs.map(a=>readKeys(dv,a));if(t.every(Boolean))tables[mode]=t}
  if(!Object.keys(tables).length)continue;
  pose.anim={...rig,legs:{...rig.legs,tables}};n++}
 return n}
root.SSSVAnimalRigs={RIGS,attach,readKeys};
})(typeof window==='undefined'?globalThis:window);
