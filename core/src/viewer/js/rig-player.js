// Walk/run playback for assembled animals. A pack attaches `pose.anim` (a rig description read from the
// user's ROM); this file only evaluates it. Game rule: every part is a bone between two joints; joints come
// from a body rig plus legs that swing through 8-key angle tables (32 steps per key, phase 0..255).
// Output is applied as a change on top of the captured pose, so a still frame looks exactly as captured.
(function(root){
const RAD=Math.PI/180,sin=d=>Math.round(Math.sin(d*RAD)*256),cos=d=>Math.round(Math.cos(d*RAD)*256);
function keyAngle(tab,ph){const k=ph>>5,f=ph&31;return (tab[(k+1)&7]*f+(32-f)*tab[k])>>5}
// Quadruped body (overlay 0x802B9130 on flat ground) + legs (0x802BFF84) + neck/head (0x802C4A70) + tail.
function quadJoints(rig,phase,mode){
 const {hl,hw,lift}=rig.body,J=[];
 J[3]=[-hw,hl,lift];J[4]=[hw,hl,lift];J[5]=[-hw,-hl,lift];J[6]=[hw,-hl,lift];J[0]=[0,0,lift];
 J[1]=J[3].map((v,k)=>(v+J[4][k])>>1);J[2]=J[5].map((v,k)=>(v+J[6][k])>>1);
 const legs=rig.legs,tabs=legs.tables[mode];
 legs.feet.forEach(([hip,foot,off],i)=>{const ph=((legs.double?phase*2:phase)+off)&255,a=tabs?keyAngle(tabs[i<2?0:1],ph):0,[x,y,z]=J[hip];
  J[foot]=[x,y-((legs.len*sin(a))>>8),z-((legs.len*cos(a))>>8)]});
 if(rig.neck){const [l1,l2,bob]=rig.neck,na=Math.max(1,20+(bob?Math.trunc(sin(phase*360/256)*256/bob/256):0));
  J[19]=[J[1][0],J[1][1]+((l1*sin(na))>>8),J[1][2]+((l1*cos(na))>>8)];J[20]=[J[1][0],J[19][1]+((l2*sin(90))>>8),J[19][2]+((l2*cos(90))>>8)]}
 if(rig.tail){const [joint,len,sway]=rig.tail,a=Math.round(Math.sin(phase/256*2*Math.PI)*sway);J[joint]=[J[2][0]+((len*sin(a))>>8),J[2][1]-((len*cos(a))>>8),J[2][2]]}
 return J;
}
// Part matrix (main 0x80126388): X along the bone, Y level and perpendicular, Z completes; origin = midpoint/8.
function partMatrix(J,a,b,mirror){
 const A=J[a],B=J[b];if(!A||!B)return null;const d=B.map((v,k)=>v-A[k]),[dx,dy,dz]=d;let p,q;
 if(!dx&&!dy){p=[1,0,0];q=[0,-1,0]}else{p=dy>=0?[dy,-dx,0]:[-dy,dx,0];q=[-p[1]*dz,dz*p[0],dx*p[1]-dy*p[0]]}
 const n=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};let r=[n(d),n(p),n(q)];
 if(mirror&1)r[1]=r[1].map(x=>-x);if(mirror&2)r[2]=r[2].map(x=>-x);
 return {R:r,T:A.map((v,k)=>(v+B[k])/16)};
}
const mul=(A,B)=>A.map(r=>[0,1,2].map(k=>r[0]*B[0][k]+r[1]*B[1][k]+r[2]*B[2][k]));
const vm=(v,B)=>[0,1,2].map(k=>v[0]*B[0][k]+v[1]*B[1][k]+v[2]*B[2][k]);
function inv(M){const [[a,b,c],[d,e,f],[g,h,i]]=M,A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,det=a*A+b*B+c*C;if(Math.abs(det)<1e-12)return null;
 return [[A,c*h-b*i,b*f-c*e],[B,a*i-c*g,c*d-a*f],[C,b*g-a*h,a*e-b*d]].map(r=>r.map(x=>x/det))}
const compose=(X,Y)=>({R:mul(X.R,Y.R),T:vm(X.T,Y.R).map((v,k)=>v+Y.T[k])});   // apply X, then Y
const inverse=X=>{const R=inv(X.R);return R&&{R,T:vm(X.T,R).map(v=>-v)}};
function rigFrames(rig,phase,mode){const J=quadJoints(rig,phase,mode);return rig.parts.map(p=>p&&partMatrix(J,p[0],p[1],p[2]||0))}
// Bind the rig to a captured pose: game->capture frame from the body bone, then the phase that best fits the legs.
function bind(pose){
 const rig=pose&&pose.anim;if(!rig||!Array.isArray(rig.parts)||rig.parts.length!==pose.parts.length)return null;
 const bi=rig.parts.findIndex(p=>p&&p[0]===1&&p[1]===2);if(bi<0)return null;
 const cap=pose.parts.map(pp=>({R:pp.rows,T:pp.T})),body0=rigFrames(rig,0,0)[bi],Ri=inv(body0.R);if(!Ri)return null;
 const G={R:mul(Ri,cap[bi].R),T:[0,0,0]};G.T=cap[bi].T.map((v,k)=>v-vm(body0.T,G.R)[k]);
 const world=(phase,mode)=>rigFrames(rig,phase,mode).map(m=>m&&compose(m,G));
 let best=null;for(const mode of Object.keys(rig.legs.tables))for(let ph=0;ph<256;ph++){const w=world(ph,mode);let e=0;
  w.forEach((m,i)=>{if(m)for(let r=0;r<3;r++)for(let k=0;k<3;k++)e+=(m.R[r][k]-cap[i].R[r][k])**2});if(!best||e<best.e)best={e,ph,mode}}
 const base=world(best.ph,best.mode).map(m=>m&&inverse(m));
 return {modes:Object.keys(rig.legs.tables),rest:best,frame(phase,mode){const w=world(phase&255,mode);
  return pose.parts.map((pp,i)=>{if(!w[i]||!base[i])return pp;const out=compose(compose(cap[i],base[i]),w[i]);return {...pp,rows:out.R,T:out.T}})}};
}
root.RigPlayer={keyAngle,quadJoints,partMatrix,bind};
})(typeof window==='undefined'?globalThis:window);
