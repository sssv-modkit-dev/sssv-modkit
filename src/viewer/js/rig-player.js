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
function quadJoints(rig,phase,mode){
 const {hl,hw,lift}=rig.body,J=[],L=rig.legs,tabs=L.tables[mode],offs=(L.offs&&L.offs[mode])||[0,0x80,0x80,0];
 J[3]=[-hw,hl,lift];J[4]=[hw,hl,lift];J[5]=[-hw,-hl,lift];J[6]=[hw,-hl,lift];J[0]=[0,0,lift];
 LEGS.forEach(([hip,j],i)=>{const side=i<2?(L.front||L):(L.rear||L),ph=(phase+offs[i])&255,b=tabs?(side.bounce||0):0;
  if(b)J[hip][2]+=b-(((256-cos(deg(ph)))*b)>>9);                          // body bobs with each stride
  const len=side.len||[L.len],tab=tabs&&tabs[i<2?0:1],a=tab?key(tab,ph,0):0;let [x,y,z]=J[hip];
  if((L.seg||1)===1){J[j]=[x,y-((len[0]*sin(a))>>8),z-((len[0]*cos(a))>>8)];return}
  const k=tab?key(tab,ph,1):0,c=Math.max(tab?key(tab,ph,2):0,k);
  [[a,len[0]],[k,len[1]],[c,len[2]]].forEach(([ang,l],n)=>{y-=(l*sin(ang))>>8;z-=(l*cos(ang))>>8;J[j+n]=[x,y,z]});
 });
 J[1]=J[3].map((v,k)=>(v+J[4][k])>>1);J[2]=J[5].map((v,k)=>(v+J[6][k])>>1);
 if(rig.neck){const [l1,l2,m]=rig.neck;let na=Math.max(1,20+Math.trunc(sin(deg(phase))/10));
  if(m>=3&&m<=5)na=((na-20)>>1)+20;else if(m>=6&&m<=8)na=0;
  J[19]=[J[1][0],J[1][1]+((l1*sin(na))>>8),J[1][2]+((l1*cos(na))>>8)];J[20]=[J[1][0],J[19][1]+l2,J[19][2]]}
 if(rig.tail){const [joint,len]=rig.tail,a=Math.round(Math.sin(phase/256*2*Math.PI)*16);J[joint]=[J[2][0]+((len*sin(a))>>8),J[2][1]-((len*cos(a))>>8),J[2][2]]}
 return J;
}
// Part matrix (main 0x80126388): X along the bone, Y level and perpendicular, Z completes; origin = midpoint/8.
function partMatrix(J,a,b,mirror){
 const A=J[a],B=J[b];if(!A||!B)return null;const d=B.map((v,k)=>v-A[k]),[dx,dy,dz]=d;let p,q;if(!dx&&!dy&&!dz)return null;
 if(!dx&&!dy){p=[1,0,0];q=[0,-1,0]}else{p=dy>=0?[dy,-dx,0]:[-dy,dx,0];q=[-p[1]*dz,dz*p[0],dx*p[1]-dy*p[0]]}
 const n=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};let r=[n(d),n(p),n(q)];
 if(mirror&1)r[1]=r[1].map(x=>-x);if(mirror&2)r[2]=r[2].map(x=>-x);
 return {R:r,T:A.map((v,k)=>(v+B[k])/16)};
}
const mul=(A,B)=>A.map(r=>[0,1,2].map(k=>r[0]*B[0][k]+r[1]*B[1][k]+r[2]*B[2][k]));
const vm=(v,B)=>[0,1,2].map(k=>v[0]*B[0][k]+v[1]*B[1][k]+v[2]*B[2][k]);
function inv(M){const [[a,b,c],[d,e,f],[g,h,i]]=M,A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,det=a*A+b*B+c*C;if(Math.abs(det)<1e-12)return null;
 return [[A,c*h-b*i,b*f-c*e],[B,a*i-c*g,c*d-a*f],[C,b*g-a*h,a*e-b*d]].map(r=>r.map(x=>x/det))}
function rigFrames(rig,phase,mode){const J=quadJoints(rig,phase,mode);return rig.parts.map(p=>p&&partMatrix(J,p[0],p[1],p[2]||0))}
// Bind the rig to a captured pose. Parts are rebuilt from the game skeleton itself (joints stay connected);
// the capture supplies only the view frame (rotation from a body bone, scale and offset fitted on the part
// centres) and each part's size (its captured row lengths).
function bind(pose){
 const rig=pose&&pose.anim;if(!rig||!rig.legs||!Array.isArray(rig.parts)||rig.parts.length!==pose.parts.length)return null;
 const modes=Object.keys(rig.legs.tables||{});if(!modes.length)return null;
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
 return {modes,rest:best,frame(phase,mode){const w=rigFrames(rig,phase&255,mode);return pose.parts.map((pp,i)=>w[i]?{...pp,...place(w[i],i)}:pp)}};
}
root.RigPlayer={keyAngle,quadJoints,partMatrix,bind};
})(typeof window==='undefined'?globalThis:window);
