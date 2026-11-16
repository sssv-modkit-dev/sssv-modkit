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
// Hopper (boxing kangaroo, 0x802BA614): body bounces h*sin(half phase) (run x2); legs (0x802C3C64 ->
// 0x802C3F58): hip beside the pelvis, knee below it, foot a step forward and drops half the bounce.
function hopperJoints(rig,phase,mode){
 const {h}=rig.body,{x,up,step}=rig.legs,ph=phase&255,J=[],s=raw(ph>>1)>>7,bob=mode==='run'?(h*s)>>7:(h*s)>>8;
 J[2]=[0,0,bob];J[0]=[0,0,bob+h];J[1]=[0,0,bob+2*h];
 [[5,13,x],[6,16,-x]].forEach(([hp,kn,dx])=>{let g=-bob;if(g<0)g=g>>1;g=Math.max(-step,Math.min(step,g));
  J[hp]=[dx,0,bob+up];J[kn]=[dx,-(step>>2),bob];J[kn+1]=[dx,-(step>>2)+step,bob+g]});
 neck(rig,J,phase);return J;
}
// Bird (seagull/vulture, body 0x802BAD60): static spine j0-j2; head 0x802C5F34; wings 0x802BB1F0 hinge at j0
// (glide: 90+-16 deg sway, flap: the keyed 40->170->10->90 stroke); tail 0x802BC1F4; feet 0x802C44E8 sit on the
// ground and the toes curl in turn (step formula of the 0x8E-0x90 walkers, 16 frames per step).
function flapAngles(u){if(u<5)return [40+((u*130)>>2),60+((u*100)>>2)];if(u<13)return [170-Math.trunc((u*100-400)/8),160-Math.trunc((u*40-160)/8)];
 if(u<21)return [70-Math.trunc((u*60-720)/8),120-Math.trunc((u*90-1080)/8)];return [10+Math.trunc((u*80-1600)/16),30+Math.trunc((u*60-1200)/16)]}
function birdJoints(rig,phase,mode){
 const {L,h}=rig.body,ph=phase&255,J=[[0,0,h],[0,L,h],[0,-L,h]];
 const [l1,l2,which]=rig.head,ha=which===1?5:20,hb=which===1?J[0]:J[1];
 J[19]=[hb[0],hb[1]+((l1*sin(ha))>>8),hb[2]+((l1*cos(ha))>>8)];J[20]=[J[19][0],J[19][1]+l2,J[19][2]];
 const [w1,w2]=rig.wings,[a,b]=mode==='flap'?flapAngles(Math.floor(ph*37/256)):[90+(raw(ph)>>11),90+(raw(ph)>>11)];
 J[22]=[(w1*sin(a))>>8,0,h+((w1*cos(a))>>8)];J[23]=[J[22][0]+((w2*sin(b))>>8),0,J[22][2]+((w2*cos(b))>>8)];J[24]=[-J[22][0],0,J[22][2]];J[25]=[-J[23][0],0,J[23][2]];
 J[26]=[0,-L-((rig.tail*cos(20))>>8),h+((rig.tail*sin(20))>>8)];
 // perching birds (parrot, feet 0x802C4448): one foot point under the body, nothing walks
 if(rig.legs.p2===undefined){J[5]=[0,0,h-rig.legs.p1];return J}
 const {p1,p2,p3,p4}=rig.legs,walk=mode==='walk',u=(ph*4)&255,curl=v=>v<65||v>191?0:(((raw((v*2+64)&255)>>7)+256)*p4)>>10;
 const sw=walk?((raw(u)>>7)*p4)>>8:0,la=walk?curl(u):0,lc=walk?curl((u+128)&255):0,z=h-p1,s=(p4*11)>>4;
 J[5]=[0,sw,z];J[27]=[0,-sw,z];J[3]=[-p2,sw,z];J[4]=[p2,-sw,z];J[13]=[-p2,sw-p3,z];J[14]=[p2,-sw-p3,z];
 J[7]=[-p2-s,sw+s-la,z-la];J[8]=[-p2,sw+p4-la,z-la];J[9]=[-p2+s,sw+s-la,z-la];
 J[10]=[p2-s,-sw+s-la,z-lc];J[11]=[p2,-sw+p4-la,z-lc];J[12]=[p2+s,-sw+s-la,z-lc];return J;
}
// Puppet: a model that never had a game rig (an imported static mesh cut into rigid parts; tools/dance-bench builds these).
// body.J lists the rest joints outright; the body bobs twice a cycle and the feet (15, 18) lift and step in turn.
function puppetJoints(rig,phase,mode){const {J:r,bob=0,lift=0,stride=0}=rig.body,ph=phase&255,k=mode==='run'?2:1,J=[],b=Math.round(bob*k*(1-Math.cos(ph/64*Math.PI))/2);
 for(const i in r)J[i]=[r[i][0],r[i][1],r[i][2]+(+i===15||+i===18?0:b)];
 [[15,0],[18,128]].forEach(([f,off])=>{if(!r[f])return;const a=(ph+off)/128*Math.PI;J[f]=[r[f][0],r[f][1]+Math.round(stride*k*Math.cos(a)),r[f][2]+Math.round(lift*k*Math.max(0,Math.sin(a)))]});
 neck(rig,J,phase);return J}
const KINDS={biped:bipedJoints,ape:apeJoints,hopper:hopperJoints,bird:birdJoints,puppet:puppetJoints};
const joints=(rig,phase,mode)=>(KINDS[rig.body.kind]||quadJoints)(rig,phase,mode);
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
// Set poses (0x802DB670): the root moves to the pose root and each bone turns from its current direction to
// the pose direction len*(sin a sin b, sin a cos b, cos a), weight t/32 (slerp weights, table 0x803A2D90).
// ko = knocked out (held), hit = hit reaction (0x802DBB80: in over 2 frames, hold, out; 14 frames in all).
function setPoseWeight(mode,phase){const u=(phase&255)>>1;if(mode==='ko')return Math.min(32,phase>>2);return u<=16?2*u:u<=96?32:128-u}
function setPoseJoints(sp,t,B){const J=B.map(v=>v&&v.slice()),f=t/32;if(sp.root)J[0]=[0,1,2].map(k=>(B[0][k]*(32-t)+sp.root[k]*t)>>5);
 for(const [p,c,l,a,b] of sp.bones){if(!J[p])continue;const ta=(l*sin(a))>>8,tg=[(sin(b)*ta)>>8,(cos(b)*ta)>>8,(l*cos(a))>>8];
  const cur=B[c]&&B[p]?B[c].map((v,k)=>v-B[p][k]):tg,lc=Math.hypot(...cur)||1,lt=Math.hypot(...tg)||1;
  let w=Math.acos(Math.max(-1,Math.min(1,cur.reduce((s,v,k)=>s+v*tg[k],0)/(lc*lt))));w=Math.min(w,179*RAD);
  const sw=Math.sin(w),wa=sw<1e-6?f:Math.sin(f*w)/sw,wb=sw<1e-6?1-f:Math.sin((1-f)*w)/sw;
  J[c]=J[p].map((v,k)=>v+Math.trunc(wa*tg[k]+wb*cur[k]))}
 return J}
// Actions (bear lift & throw): chains without a root (0x802DB7C4) applied in steps [frames, base, table, w0, w1];
// a step first lays the base table fully (weight 32), then blends the table in with a weight from w0 to w1, or
// (osc flag, gorilla chest beat) 17+sin>>11 clipped to 32 on a 16-frame cycle.
function actionJoints(act,phase,B){const total=act.steps.reduce((s,x)=>s+x[0],0);let fr=Math.floor((phase&255)*total/256);
 for(const [n,base,tab,w0,w1,osc] of act.steps){if(fr>=n){fr-=n;continue}const t=osc?Math.min(32,17+(raw((fr&15)*16)>>11)):Math.round(w0+(w1-w0)*fr/n),ch=i=>({bones:act.bones.map((b,k)=>[...b,...act.tabs[i][k]])});
  let J=base>=0?setPoseJoints(ch(base),32,B):B;return tab>=0?setPoseJoints(ch(tab),t,J):J}
 return B}
// Dances (fan extras, not game animations). A dance is a list of MOVES; a move is plain data so it can be written and tuned
// without touching the player (tools/dance-bench renders any rig doing any move). 32 phase steps make one beat.
//  beats   length of the move
//  legs    [mode, rate]: the rig's own leg cycle, `rate` phase steps per dance phase step (4 = one footfall a beat); ['still']
//  bounce  hop height each beat, times the rig's dance.hop;  swing [amount, beats]: side sway, times dance.sway
//  steady  true: the rig's own side-to-side body sway is taken out (quick feet under a calm body)
//  dust    {every, life, size}: a puff at the feet every `every` beats, living `life` beats, size times dance.sway
//  nod     head nod in degrees;  snap  share of the time between two keys spent moving (1 = glide, .4 = hit the pose and hold)
//  keys    [{t, ...channels}] at beat t; a channel left out keeps its last value. Channels:
//    A, B        the two arms [down-from-up, out]: 0 = straight up, 90 = level, 180 = down; out 0 = forward, 90 = out to the
//                arm's own side, negative = across the body, 180 = back.  sA, sB shoulders, fA, fB forearms (default: arm)
//    head        [down-from-up, turn]   pumpA, pumpB  arm bounce in degrees   spinA, spinB  arm circling, degrees a beat
//    sway, fwd   body offset (times dance.sway)   lift  (times dance.hop)   yaw  whole-body turn in degrees
//    snap, lin   per key: its own snap, or lin:true to move into this key at constant speed
const MOVES={
 // horse ride: wrists crossed in front, pumping like reins, a hop every beat
 ride:{beats:4,legs:['walk',4],bounce:1,nod:14,keys:[{t:0,A:[100,-35],B:[100,-35],pumpA:14,pumpB:14}]},
 // lasso: one arm raised and circling overhead (a turn every 2 beats), the other keeps the reins
 lasso:{beats:4,legs:['run',4],bounce:1,swing:[1,2],nod:14,keys:[{t:0,sA:[90,90],A:[20,0],spinA:180,B:[100,-35],pumpB:14}]},
 // side shuffle: quick small steps under a body that glides smoothly left, then right; arms low, fists pumping in turn
 shuffle:{beats:4,legs:['walk',8],steady:true,bounce:0,nod:0,snap:1,dust:{every:.5,life:.9,size:2.4},keys:[
  {t:0,A:[128,28],B:[128,28],pumpA:12,pumpB:-12,sway:-2.2,yaw:14,head:[84,-18]},{t:2,sway:2.2,yaw:-14,head:[84,18]}]},
 // disco point: one arm jabs up and out, then down across the body; the other hand stays on the hip; hips go the other way
 point:{beats:4,legs:['walk',2],bounce:.35,nod:4,snap:.45,keys:[
  {t:0,A:[35,65],B:[150,45],sway:.7,yaw:-14,head:[72,25]},{t:1,A:[140,-55],sway:-.7,yaw:14,head:[88,-20]},
  {t:2,A:[35,65],sway:.7,yaw:-14,head:[72,25]},{t:3,A:[140,-55],sway:-.7,yaw:14,head:[88,-20]}]},
 // wave: both arms overhead, leaning side to side together, slow (one side every 2 beats)
 wave:{beats:4,legs:['still'],bounce:.5,nod:0,snap:1,keys:[
  {t:0,A:[45,90],B:[12,-90],sway:.8,head:[76,18]},{t:2,A:[12,-90],B:[45,90],sway:-.8,head:[76,-18]}]},
 // spin: arms out level, one full turn over 2 beats, then strike a pose (one arm up, one on the hip) and hold it
 spin:{beats:4,legs:['walk',4],bounce:.25,nod:0,snap:.5,keys:[
  {t:0,A:[90,90],B:[90,90],yaw:0},{t:.5,yaw:90,lin:true},{t:1,yaw:180,lin:true},{t:1.5,yaw:270,lin:true},{t:2,yaw:360,lin:true},
  {t:2.5,A:[22,70],B:[150,45],head:[66,20],lift:.6},{t:3,lift:0},{t:3.75,A:[22,70],B:[150,45],head:[66,20]}]},
 // thriller: both hands clawed to one side with two steps that way, then the other side; then stiff zombie arms creeping forward
 thriller:{beats:8,legs:['walk',4],bounce:.2,nod:0,snap:.55,keys:[
  {t:0,A:[68,75],B:[92,-62],sway:.5,yaw:-10,head:[80,40]},{t:1,sway:1.1},
  {t:2,A:[92,-62],B:[68,75],sway:-.5,yaw:10,head:[80,-40]},{t:3,sway:-1.1},
  {t:4,A:[66,6],B:[94,6],sway:0,yaw:0,fwd:.2,head:[70,18]},{t:5,A:[94,6],B:[66,6],fwd:.5,head:[70,-18]},
  {t:6,A:[66,6],B:[94,6],fwd:.8,head:[70,18]},{t:7,A:[94,6],B:[66,6],fwd:1.1,head:[70,-18]}]},
};
const ROUTINES={dance:['ride','lasso','shuffle','point','wave','spin','thriller'],spin:['spin'],thriller:['thriller']};
const BEAT=32,ANG=['sA','A','fA','sB','B','fB','head'],NUM=['sway','fwd','lift','yaw','pumpA','pumpB','spinA','spinB'];
const routine=mode=>ROUTINES[mode]||(MOVES[mode]?[mode]:null),beatsOf=seq=>seq.reduce((s,m)=>s+MOVES[m].beats,0);
const loopLen=mode=>{const seq=routine(mode);return seq?beatsOf(seq)*BEAT:256};
const smooth=x=>x<=0?0:x>=1?1:x*x*(3-2*x),turn=(p,q,u)=>p+((((q-p)%360)+540)%360-180)*u;
// A move's keys with every channel filled in (missing ones carry on from the key before; the first key starts from rest).
function filled(move){let last={};for(const c of NUM)last[c]=0;for(const c of ANG)last[c]=null;return move.keys.map(k=>last={...last,snap:undefined,lin:false,...k})}
// Channel values of a move at beat tb. Arm angles come back absolute ([down-from-up, azimuth]); `ctx.side` holds each arm's
// own side (+1 or -1) and `ctx.rest` the rest angles used when a key leaves an arm alone.
function evalMove(move,tb,ctx){const K=filled(move),n=K.length;let i=n-1;while(i>0&&K[i].t>tb)i--;const a=K[i],b=K[(i+1)%n],t1=i+1<n?b.t:move.beats+K[0].t;
 const x=n>1&&t1>a.t?(tb-a.t)/(t1-a.t):0,sn=b.snap??move.snap??1,u=n<2?0:b.lin?x:smooth((x-(1-sn))/sn),C={},f=tb-Math.floor(tb);
 const abs=(k,c)=>{const v=k[c]||ctx.rest[c];if(!v)return null;return k[c]?[v[0],v[1]*(ctx.side[c]||1)]:v};
 for(const c of ANG){const p=abs(a,c),q=abs(b,c);C[c]=p&&q?[p[0]+(q[0]-p[0])*u,turn(p[1],q[1],u)]:p||q}
 for(const c of NUM)C[c]=c==='yaw'?turn(a.yaw,b.yaw,u):a[c]+(b[c]-a[c])*u;
 for(const s of 'AB'){const v=C[s];if(v)C[s]=[v[0]+C['pump'+s]*Math.sin(f*2*Math.PI),v[1]+C['spin'+s]*tb]}
 const [sw,per]=move.swing||[0,1];C.sway+=sw*Math.sin(tb/per*2*Math.PI);C.hop=Math.sin(f*Math.PI)*(move.bounce||0);
 if(C.head||move.nod){const h=C.head||[80,0];C.head=[h[0]+(move.nod||0)*Math.sin(f*2*Math.PI),h[1]]}
 return C}
const mixC=(P,C,u)=>{const o={};for(const c in C){const p=P[c],q=C[c];o[c]=Array.isArray(q)?(p?[p[0]+(q[0]-p[0])*u,turn(p[1],q[1],u)]:q):q==null?p:c==='yaw'?turn(p||0,q,u):(p||0)+(q-(p||0))*u}return o};
// Joints of a rig dancing. rig.actions.dance = {chain | bones+tabs, rest, arms:[shoulder A, hand A, shoulder B, hand B] (child
// joints of the chain's bones), fore:[forearm A, forearm B], head, headRest (the head bone's own rest angles; moves are written for [80,0]), hop, sway}. Body and legs are the rig's own cycle plus the
// move's hop and sway; the first quarter beat of a move blends in from the end of the move before it.
function danceJoints(rig,phase,mode){const d=rig.actions.dance,src=typeof d.chain==='string'?rig.actions[d.chain]:d.bones?d:null,seq=routine(mode)||ROUTINES.dance,L=beatsOf(seq)*BEAT;
 let ph=((phase%L)+L)%L,i=0;while(ph>=MOVES[seq[i]].beats*BEAT){ph-=MOVES[seq[i]].beats*BEAT;i++}
 const move=MOVES[seq[i]],prev=MOVES[seq[(i+seq.length-1)%seq.length]],tb=ph/BEAT,[s1,a1,s2,a2]=d.arms||[],[f1,f2]=d.fore||[],rest=src?src.tabs[d.rest||0]:[],
  of=j=>{const k=src?src.bones.findIndex(b=>b[1]===j):-1;return k<0?null:rest[k]},sd=of(s1)?(Math.sin(of(s1)[1]*RAD)>=0?1:-1):1,
  ctx={side:{sA:sd,A:sd,fA:sd,sB:-sd,B:-sd,fB:-sd},rest:{sA:of(s1),A:of(a1),fA:null,sB:of(s2),B:of(a2),fB:null,head:null}};
 let C=evalMove(move,tb,ctx);if(tb<.25&&prev!==move)C=mixC(evalMove(prev,prev.beats-1e-6,ctx),C,smooth(tb*4));
 const [lm,rate]=move.legs||['walk',4],J=joints(rig,lm==='still'?0:Math.round(ph*rate)&255,lm==='still'?'walk':lm),
  dx=Math.round(C.sway*(d.sway||0))-(move.steady&&J[2]?J[2][0]-joints(rig,0,'walk')[2][0]:0),dy=Math.round(C.fwd*(d.sway||0)),dz=Math.round((C.hop+C.lift)*(d.hop||0));
 for(const v of J)if(v){v[0]+=dx;v[1]+=dy;v[2]+=dz}
 let out=J;if(src){const ang={[s1]:C.sA,[a1]:C.A,[s2]:C.sB,[a2]:C.B};if(f1!=null)ang[f1]=C.fA||C.A;if(f2!=null)ang[f2]=C.fB||C.B;if(d.head!=null&&C.head){const hb=d.headRest||[80,0];ang[d.head]=[hb[0]+C.head[0]-80,hb[1]+C.head[1]]}
  out=setPoseJoints({bones:src.bones.map((b,k)=>[...b,...(ang[b[1]]||rest[k]).map(Math.round)])},32,J)}
 out.yaw=C.yaw;return out}
// Dust: puffs kicked up at the feet by a move with dust:{every, life, size}. Each puff is born at one of the two lowest
// joints of that moment (dance.feet names them outright), in turn, then swells, rises a little and shrinks away. The puffs
// depend only on the phase, so scrubbing and exports show the same dust. Returns [{p:[x,y,z], r}] in joint units.
function dancePuffs(rig,phase,mode){const d=rig.actions&&rig.actions.dance,seq=routine(mode);if(!d||!seq)return [];const L=beatsOf(seq)*BEAT;let ph=((phase%L)+L)%L,start=0,i=0;
 while(ph-start>=MOVES[seq[i]].beats*BEAT){start+=MOVES[seq[i]].beats*BEAT;i++}
 const du=MOVES[seq[i]].dust;if(!du)return [];const tb=(ph-start)/BEAT,out=[],size=(du.size||1)*(d.sway||200);
 for(let k=Math.floor(tb/du.every);k>=0;k--){const te=k*du.every,a=(tb-te)/du.life;if(a>=1)break;
  const J=danceJoints(rig,start+Math.round(te*BEAT),mode),low=d.feet||J.map((v,j)=>v?[v[2],j]:null).filter(Boolean).sort((x,y)=>x[0]-y[0]).slice(0,2).map(x=>x[1]),f=J[low[k%low.length]];if(!f)continue;
  for(let n=0;n<3;n++){const h=Math.sin(k*12.9898+n*78.233)*43758.5453,u=h-Math.floor(h),w=(n-1)*.9+u*.4;
   out.push({p:[f[0]+w*size*.5,f[1]-size*(.3+u*.4)*(.5+a),f[2]+size*(.25+a*(.5+u*.5))],r:size*(.35+.5*a)*Math.sqrt(1-a)*(.7+u*.5)})}}
 return out}
// Whole-body turn: part frames and joints rotate about the vertical through the body joint (J[0]).
function turnBody(f,J,yaw){if(!yaw||!J[0])return;const c=Math.cos(yaw*RAD),s=Math.sin(yaw*RAD),[px,py]=J[0],rot=v=>[v[0]*c-v[1]*s,v[0]*s+v[1]*c,v[2]];
 for(const m of f)if(m){m.R=m.R.map(rot);const t=rot([m.T[0]-px/8,m.T[1]-py/8,m.T[2]]);m.T=[t[0]+px/8,t[1]+py/8,t[2]]}
 J.forEach((v,k)=>{if(v){const t=rot([v[0]-px,v[1]-py,v[2]]);J[k]=[t[0]+px,t[1]+py,t[2]]}})}
function rigFrames(rig,phase,mode,rest){const sp=rig.setposes&&rig.setposes[mode],act=rig.actions&&rig.actions[mode];
 if(routine(mode)&&rig.actions&&rig.actions.dance){const J=danceJoints(rig,phase,mode),f=rig.parts.map(p=>p&&partMatrix(J,p[0],p[1],p[2]||0,p[3]));turnBody(f,J,J.yaw);f.J=J;return f}
 const J=(sp||act)&&rest?(act?actionJoints(act,phase,joints(rig,rest.ph,rest.mode)):setPoseJoints(sp,setPoseWeight(mode,phase),joints(rig,rest.ph,rest.mode))):joints(rig,phase,mode),f=rig.parts.map(p=>p&&partMatrix(J,p[0],p[1],p[2]||0,p[3]));f.J=J;return f}
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
 return {modes,rest:best,setposes:Object.keys(rig.setposes||{}),frame(phase,mode){const w=rigFrames(rig,routine(mode)?phase:phase&255,mode,best),out=pose.parts.map((pp,i)=>{if(w[i])return {...pp,...place(w[i],i)};
  const j=anchor[i],a=w.J[j],b=J0[j];if(!a||!b)return pp;const d=vm(a.map((v,k)=>(v-b[k])/8),Rot).map(v=>v*best.s);return {...pp,T:pp.T.map((v,k)=>v+d[k])}});
  out.dust=routine(mode)?dancePuffs(rig,phase,mode).map(q=>({T:vm(q.p.map(v=>v/8),Rot).map((v,k)=>v*best.s+best.t[k]),r:q.r/8*best.s})):[];return out}};
}
root.RigPlayer={get DANCE_LEN(){return loopLen('dance')},MOVES,ROUTINES,BEAT,loopLen,evalMove,rigFrames,turnBody,danceModes:()=>Object.keys(ROUTINES),keyAngle,quadJoints,bipedJoints,joints,puppetJoints,setPoseJoints,setPoseWeight,actionJoints,danceJoints,dancePuffs,partMatrix,bind};
})(typeof window==='undefined'?globalThis:window);
