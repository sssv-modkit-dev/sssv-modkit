// Walk/run playback for assembled animals. A pack attaches `pose.anim` (a rig description read from the
// user's ROM); this file only evaluates it. Game rule: every part is a bone between two joints; joints come
// from a quadruped body plus legs that swing through 8-key angle tables (32 steps per key, phase 0..255).
// One-bone legs use the first angle of each key; three-bone legs use hip, knee and ankle angles.
// Parts are placed from the skeleton; the captured pose supplies only view frame, scale and part sizes.
(function(root){
const RAD=Math.PI/180,sin=d=>Math.round(Math.sin(d*RAD)*256),cos=d=>Math.round(Math.cos(d*RAD)*256),deg=ph=>Math.floor(ph*360/256);
const key=(tab,ph,c=0)=>{const k=ph>>5,f=ph&31,a=tab[k],b=tab[(k+1)&7],x=v=>Array.isArray(v)?v[c]:v;return Math.trunc((x(b)*f+(32-f)*x(a))/32)};
function keyAngle(tab,ph){return key(tab,ph)}
const LEGS=[[3,7],[4,10],[5,13],[6,16]];
function ik(a,b,l1,l2,h,bend){if(h<1)return [90,-90];const x=-((l2*sin(b)+l1*sin(a))>>8),D=Math.max(Math.trunc(Math.hypot(x,h)),Math.abs(l1-l2),1),
 ac=v=>Math.round(Math.acos(Math.max(-1,Math.min(1,v)))/RAD),f=Math.round(Math.asin(Math.max(-1,Math.min(1,x/D)))/RAD),
 a1=ac((l1*l1+D*D-l2*l2)/(2*l1*D)),a2=ac((l2*l2+D*D-l1*l1)/(2*l2*D));return bend>0?[-f-a1,-f+a2]:[-f+a1,-f-a2]}
function quadJoints(rig,phase,mode){
 const {hl,hw,lift}=rig.body,J=[],L=rig.legs,tabs=L.tables[mode],offs=(L.offs&&L.offs[mode])||[0,0x80,0x80,0];
 J[3]=[-hw,hl,lift];J[4]=[hw,hl,lift];J[5]=[-hw,-hl,lift];J[6]=[hw,-hl,lift];J[0]=[0,0,lift];
 LEGS.forEach(([hip,j],i)=>{const side=i<2?(L.front||L):(L.rear||L),ph=(phase+offs[i])&255,b=tabs?(side.bounce||0):0;
  if(b)J[hip][2]+=b-(((256-cos(deg(ph)))*b)>>9);                          // body bobs with each stride
  const len=side.len||[L.len],tab=tabs&&tabs[i<2?0:1],a=tab?key(tab,ph,0):0;let [x,y,z]=J[hip];
  if((L.seg||1)===1){J[j]=[x,y-((len[0]*sin(a))>>8),z-((len[0]*cos(a))>>8)];return}
  // Ground contact (0x802BE1A0/0x802BEAB0, flat ground at 0): a leg that would reach below the ground
  // keeps the hip up and bends hip+knee with two-bone IK (front 0x802BC350, rear 0x802BC628).
  let hipA=a,k=tab?key(tab,ph,1):0;const c0=tab?key(tab,ph,2):0,s=b?(((256-cos(deg(ph)))*b)>>9):0,
   d=((len[2]*cos(c0)+len[0]*cos(hipA)+len[1]*cos(k))>>8)-J[hip][2];
  if(d>-3*s){if(d>s){J[hip][2]+=s;[hipA,k]=ik(hipA,k,len[0],len[1],J[hip][2]-((len[2]*cos(c0))>>8),side.bend||-1)}else J[hip][2]+=Math.trunc((d+3*s)/4)}
  z=J[hip][2];const c=Math.max(c0,k);
  [[hipA,len[0]],[k,len[1]],[c,len[2]]].forEach(([ang,l],n)=>{y-=(l*sin(ang))>>8;z-=(l*cos(ang))>>8;J[j+n]=[x,y,z]});
 });
 J[1]=J[3].map((v,k)=>(v+J[4][k])>>1);J[2]=J[5].map((v,k)=>(v+J[6][k])>>1);
 neck(rig,J,phase);
 if(rig.tail){const [joint,len]=rig.tail,a=Math.round(Math.sin(phase/256*2*Math.PI)*16);J[joint]=[J[2][0]+((len*sin(a))>>8),J[2][1]-((len*cos(a))>>8),J[2][2]]}
 return J;
}
// Two-legged body (0x802B9A5C, or 0x802B975C with a shift): hips sway and bob, feet (0x802C23F8/0x802C287C)
// sit beside the hips and lift in turn; head/neck from 0x802C652C (bob sin/20) or 0x802C4A70.
const s256=ph=>Math.round(Math.sin(ph/256*2*Math.PI)*32767)>>7;
function bipedJoints(rig,phase,mode){
 const {h,shift}=rig.body,J=[],run=mode==='run',ph=phase&255;let bob,sway=(h*s256(ph))>>8;
 if(shift!=null){bob=((h*(256-s256((ph*2+64)&255)))>>8)>>shift;sway>>=shift}
 else{bob=run?(h*s256((ph*2+64)&255))>>10:(h*(256-s256((ph*2+64)&255)))>>10;sway>>=2}
 const top=bob+h*2;J[2]=[shift!=null?0:sway,0,bob];J[1]=[sway,0,top];J[0]=[shift!=null?0:sway,0,shift!=null?(bob+top)>>1:bob+h];J[24]=[0,0,top];
 const {len,side}=rig.legs;[[15,side,0],[18,-side,128]].forEach(([foot,ang,off])=>{const p=(ph+off)&255,lift=run?(s256(p)*len)>>7:(s256(p)*len)>>8;
  const dz=Math.max(-len,Math.min(len,Math.max(-bob,lift)));J[foot]=[J[2][0]-((len*sin(ang))>>8),J[2][1]+((len*cos(ang))>>8),J[2][2]+dz]});
 neck(rig,J,phase);return J;
}
function neck(rig,J,phase){if(!rig.neck)return;const [l1,l2,m,div=10]=rig.neck;let na=Math.max(1,20+Math.trunc(sin(deg(phase))/div));
 if(m>=3&&m<=5)na=((na-20)>>1)+20;else if(m>=6&&m<=8)na=0;
 J[19]=[J[1][0],J[1][1]+((l1*sin(na))>>8),J[1][2]+((l1*cos(na))>>8)];J[20]=[J[1][0],J[19][1]+l2,J[19][2]]}
// Knuckle-walker (gorilla, 0x802B9D20): body hops, shoulders and hips counter-twist; legs (0x802C2D98 ->
// 0x802C3188) hip->knee swings +-22.5 deg (run 45), foot points forward; a knee below ground lifts the leg.
const raw=ph=>Math.round(Math.sin((ph&255)/256*2*Math.PI)*32767);
function apeJoints(rig,phase,mode){
 const {h,hip,sw,hw}=rig.body,k=mode==='run'?6:4,ph=phase&255,J=[],c16=raw(ph+64)>>11;
 const z2=(3*hip>>2)+((k*h*(256-(raw(ph*2+64)>>7)))>>13),x1=(k*h*c16)>>8,t=(c16*k*sw)>>9,u=(c16*k*hip)>>8;
 J[2]=[0,0,z2];J[0]=[0,0,z2+h];J[1]=[x1,0,z2+2*h];J[3]=[x1-sw,-t,J[1][2]+t];J[4]=[x1+sw,t,J[1][2]-t];J[5]=[-hw,0,z2+u];J[6]=[hw,0,z2-u];
 const [l1,l2]=rig.legs.len;[[5,13,0],[6,16,128]].forEach(([hp,kn,off])=>{const a=(mode==='run'?raw(ph+off)>>10:raw(ph+off)>>11)&255,sa=raw(a)>>7,ca=raw(a+64)>>7;
  const K=[J[hp][0],J[hp][1]+((sa*l1)>>8),J[hp][2]-((ca*l1)>>8)],F=[K[0],K[1]+((ca*l2)>>8),K[2]+((sa*l2)>>8)];
  const lift=Math.min(Math.max(-K[2],0),0x800);K[2]+=lift;J[hp][2]+=lift;F[2]+=lift+Math.min(Math.max(-F[2]-lift,0),0x800);J[kn]=K;J[kn+1]=F});
 neck(rig,J,phase);return J;
}
const joints=(rig,phase,mode)=>rig.body.kind==='biped'?bipedJoints(rig,phase,mode):rig.body.kind==='ape'?apeJoints(rig,phase,mode):quadJoints(rig,phase,mode);
// Part matrix (main 0x80126388): X along the bone, Y level and perpendicular, Z completes; origin = midpoint/8.
// keep (draw arg 9): pick the perpendicular so it never flips while the bone sways through vertical.
function partMatrix(J,a,b,mirror,keep){
 const A=J[a],B=J[b];if(!A||!B)return null;const d=B.map((v,k)=>v-A[k]),[dx,dy,dz]=d;let p,q;if(!dx&&!dy&&!dz)return null;
 if(!dx&&!dy){if(keep){p=[0,1,0];q=[1,0,0]}else{p=[1,0,0];q=[0,-1,0]}}
 else{p=keep?(dx>0?[-dy,dx,0]:[dy,-dx,0]):(dy>=0?[dy,-dx,0]:[-dy,dx,0]);q=[-p[1]*dz,dz*p[0],dx*p[1]-dy*p[0]]}
 const n=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};let r=[n(d),n(p),n(q)];
 if(mirror&1)r[1]=r[1].map(x=>-x);if(mirror&2)r[2]=r[2].map(x=>-x);
 return {R:r,T:A.map((v,k)=>(v+B[k])/16)};
}
const mul=(A,B)=>A.map(r=>[0,1,2].map(k=>r[0]*B[0][k]+r[1]*B[1][k]+r[2]*B[2][k]));
const vm=(v,B)=>[0,1,2].map(k=>v[0]*B[0][k]+v[1]*B[1][k]+v[2]*B[2][k]);
function inv(M){const [[a,b,c],[d,e,f],[g,h,i]]=M,A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,det=a*A+b*B+c*C;if(Math.abs(det)<1e-12)return null;
 return [[A,c*h-b*i,b*f-c*e],[B,a*i-c*g,c*d-a*f],[C,b*g-a*h,a*e-b*d]].map(r=>r.map(x=>x/det))}
function rigFrames(rig,phase,mode){const J=joints(rig,phase,mode),f=rig.parts.map(p=>p&&partMatrix(J,p[0],p[1],p[2]||0,p[3]));f.J=J;return f}
// Bind the rig to a captured pose. Parts are rebuilt from the game skeleton itself (joints stay connected);
// the capture supplies only the view frame (rotation from a body bone, scale and offset fitted on the part
// centres) and each part's size (its captured row lengths).
function bind(pose){
 const rig=pose&&pose.anim;if(!rig||!rig.legs||!Array.isArray(rig.parts)||rig.parts.length!==pose.parts.length)return null;
 const modes=rig.modes||Object.keys(rig.legs.tables||{});if(!modes.length)return null;
 const torso=p=>p&&p[0]<=2&&p[1]<=2,spine=p=>torso(p)&&p[0]&&p[1];let bi=rig.parts.findIndex(spine);if(bi<0)bi=rig.parts.findIndex(torso);if(bi<0)return null;
 const cap=pose.parts.map(pp=>({R:pp.rows,T:pp.T,size:pp.rows.map(r=>Math.hypot(...r))})),body0=rigFrames(rig,0,modes[0])[bi],Ri=body0&&inv(body0.R);if(!Ri)return null;
 const Rot=mul(Ri,cap[bi].R.map((r,j)=>r.map(v=>v/cap[bi].size[j])));
 const fitT=frames=>{const idx=frames.map((m,i)=>m?i:-1).filter(i=>i>=0),a=idx.map(i=>vm(frames[i].T,Rot)),c=idx.map(i=>cap[i].T),n=idx.length;
  const am=[0,1,2].map(k=>a.reduce((s,v)=>s+v[k],0)/n),cm=[0,1,2].map(k=>c.reduce((s,v)=>s+v[k],0)/n);let num=0,den=0;
  a.forEach((v,i)=>{for(let k=0;k<3;k++){num+=(v[k]-am[k])*(c[i][k]-cm[k]);den+=(v[k]-am[k])**2}});const s=den?num/den:0,t=cm.map((v,k)=>v-s*am[k]);
  let e=0;a.forEach((v,i)=>{for(let k=0;k<3;k++)e+=(s*v[k]+t[k]-c[i][k])**2});return {s,t,e}};
 let best=null;for(const mode of modes)for(let ph=0;ph<256;ph+=2){const f=fitT(rigFrames(rig,ph,mode));if(f.s>0&&(!best||f.e<best.e))best={...f,ph,mode}}
 if(!best)return null;
 const place=(m,i)=>({rows:m.R.map((r,j)=>vm(r,Rot).map(v=>v*cap[i].size[j])),T:vm(m.T,Rot).map((v,k)=>v*best.s+best.t[k])});
 // parts without both joints (arms, harness...) move with their first computed joint instead of floating
 const J0=rigFrames(rig,best.ph,best.mode).J,anchor=rig.parts.map(p=>p?[p[0],p[1],0].find(j=>J0[j]):0);
 return {modes,rest:best,frame(phase,mode){const w=rigFrames(rig,phase&255,mode);return pose.parts.map((pp,i)=>{if(w[i])return {...pp,...place(w[i],i)};
  const j=anchor[i],a=w.J[j],b=J0[j];if(!a||!b)return pp;const d=vm(a.map((v,k)=>(v-b[k])/8),Rot).map(v=>v*best.s);return {...pp,T:pp.T.map((v,k)=>v+d[k])}})}};
}
root.RigPlayer={keyAngle,quadJoints,bipedJoints,partMatrix,bind};
})(typeof window==='undefined'?globalThis:window);
