#!/usr/bin/env node
// Dance bench: look at dance moves and characters without a browser or a ROM. It runs the Model Editor's own
// player (src/viewer/js/rig-player.js), so what a sheet shows is what the editor will play. See README.md here.
//   node tools/dance-bench/bench.js sheet    --rig RIG.json [--mode dance] [--moves DRAFT.json] [--out sheet.png]
//   node tools/dance-bench/bench.js gif      --rig RIG.json [--mode dance] [--moves DRAFT.json] [--out dance.gif]
//   node tools/dance-bench/bench.js report   --rig RIG.json [--moves DRAFT.json]
//   node tools/dance-bench/bench.js moves                       (prints the built-in moves as JSON, a start for a draft)
//   node tools/dance-bench/bench.js obj-info MODEL.obj [--up +y] [--front +z] [--out info.png]
//   node tools/dance-bench/bench.js puppet   MODEL.obj --map MAP.json [--out RIG.json]
'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const CORE=path.resolve(__dirname,'../../src/viewer/js');
function load(file){const root={};new Function('globalThis',fs.readFileSync(path.join(CORE,file),'utf8')).call(root,root);return root}
const R=load('rig-player.js').RigPlayer,encodeGif=load('anim-export.js').AnimExport.encodeGif;
const RAD=Math.PI/180;

// ---------- tiny software canvas: z-buffered triangles and lines, a 3x5 font, PNG out ----------
function canvas(w,h){return {w,h,px:new Uint8ClampedArray(w*h*4),z:new Float32Array(w*h).fill(-1e30)}}
function put(c,x,y,z,col){if(x<0||y<0||x>=c.w||y>=c.h)return;const i=y*c.w+x;if(z<c.z[i])return;c.z[i]=z;c.px.set([col[0],col[1],col[2],255],i*4)}
function tri(c,a,b,d,col){const area=(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);if(Math.abs(area)<1e-9)return;
 const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],d[0]))),x1=Math.min(c.w-1,Math.ceil(Math.max(a[0],b[0],d[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],d[1]))),y1=Math.min(c.h-1,Math.ceil(Math.max(a[1],b[1],d[1])));
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const px=x+.5,py=y+.5,w0=((b[0]-px)*(d[1]-py)-(b[1]-py)*(d[0]-px))/area,w1=((d[0]-px)*(a[1]-py)-(d[1]-py)*(a[0]-px))/area,w2=1-w0-w1;
  if(w0<0||w1<0||w2<0)continue;put(c,x,y,w0*a[2]+w1*b[2]+w2*d[2],col)}}
function dot(c,p,r,col){for(let y=Math.floor(p[1]-r);y<=p[1]+r;y++)for(let x=Math.floor(p[0]-r);x<=p[0]+r;x++)if(Math.hypot(x+.5-p[0],y+.5-p[1])<=r)put(c,x,y,p[2],col)}
function line(c,a,b,wd,col){const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy);dot(c,a,wd/2,col);dot(c,b,wd/2,col);if(l<.5)return;const nx=-dy/l*wd/2,ny=dx/l*wd/2,
 q=[[a[0]+nx,a[1]+ny,a[2]],[a[0]-nx,a[1]-ny,a[2]],[b[0]-nx,b[1]-ny,b[2]],[b[0]+nx,b[1]+ny,b[2]]];tri(c,q[0],q[1],q[2],col);tri(c,q[0],q[2],q[3],col)}
const FONT={a:'010101111101101',b:'110101110101110',c:'011100100100011',d:'110101101101110',e:'111100110100111',f:'111100110100100',g:'011100101101011',h:'101101111101101',i:'111010010010111',j:'001001001101010',k:'101101110101101',l:'100100100100111',m:'101111111101101',n:'110101101101101',o:'010101101101010',p:'110101110100100',q:'010101101111011',r:'110101110101101',s:'011100010001110',t:'111010010010010',u:'101101101101111',v:'101101101101010',w:'101101101111101',x:'101101010101101',y:'101101010010010',z:'111001010100111',
 0:'111101101101111',1:'010110010010111',2:'110001010100111',3:'110001010001110',4:'101101111001001',5:'111100110001110',6:'011100110101010',7:'111001010010010',8:'010101010101010',9:'010101011001110','.':'000000000000010',':':'000010000010000','-':'000000111000000','+':'000010111010000','/':'001001010100100','_':'000000000000111','%':'101001010100101'};
function text(c,x,y,s,col,k=2){for(const ch of String(s).toLowerCase()){const g=FONT[ch];if(g)for(let i=0;i<15;i++)if(g[i]==='1')for(let dy=0;dy<k;dy++)for(let dx=0;dx<k;dx++){const X=x+(i%3)*k+dx,Y=y+Math.floor(i/3)*k+dy;if(X>=0&&Y>=0&&X<c.w&&Y<c.h){const j=(Y*c.w+X)*4;c.px.set([col[0],col[1],col[2],255],j);c.z[Y*c.w+X]=1e30}}x+=4*k}}
function blit(dst,src,ox,oy){for(let y=0;y<src.h;y++)for(let x=0;x<src.w;x++){const i=(y*src.w+x)*4;if(src.px[i+3])dst.px.set(src.px.subarray(i,i+4),((y+oy)*dst.w+x+ox)*4)}}
function fill(c,col){for(let i=0;i<c.w*c.h;i++)c.px.set(col,i*4)}
function png(c){const raw=Buffer.alloc((c.w*4+1)*c.h);for(let y=0;y<c.h;y++)Buffer.from(c.px.buffer,y*c.w*4,c.w*4).copy(raw,y*(c.w*4+1)+1);
 const chunk=(t,d)=>{const b=Buffer.alloc(12+d.length);b.writeUInt32BE(d.length,0);b.write(t,4,'latin1');d.copy(b,8);b.writeUInt32BE(zlib.crc32(b.subarray(4,8+d.length)),8+d.length);return b},ih=Buffer.alloc(13);
 ih.writeUInt32BE(c.w,0);ih.writeUInt32BE(c.h,4);ih.set([8,6,0,0,0],8);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])}

// ---------- scene: a rig at one phase -> coloured lines (skeleton) and triangles (puppet mesh), in rig space ----------
// Rig space: x to the side, y forward, z up. The camera circles the z axis: az 0 looks at the character's front.
const COL={body:[150,155,165],A:[226,74,60],B:[60,120,226],head:[240,190,40],legs:[70,170,90],face:[255,140,0],ground:[205,208,214]};
const PARTCOL=[[150,155,165],[240,190,40],[226,74,60],[60,120,226],[70,170,90],[40,150,140],[240,130,120],[130,170,240],[190,120,200]];
function poseAt(rig,phase,mode){if(R.MOVES[mode]||R.ROUTINES[mode]){const J=R.danceJoints(rig,phase,mode);return {J,yaw:J.yaw||0}}return {J:R.joints(rig,phase&255,mode),yaw:0}}
const yawFn=(yaw,p)=>{const c=Math.cos(yaw*RAD),s=Math.sin(yaw*RAD);return v=>[(v[0]-p[0])*c-(v[1]-p[1])*s+p[0],(v[0]-p[0])*s+(v[1]-p[1])*c+p[1],v[2]]};
function bonesOf(rig){const d=rig.actions&&rig.actions.dance,src=d&&(typeof d.chain==='string'?rig.actions[d.chain]:d.bones?d:null),seen=new Set(),out=[];
 const [s1,a1,s2,a2]=(d&&d.arms)||[],[f1,f2]=(d&&d.fore)||[],role=(a,b)=>[s1,a1,f1].includes(b)?'A':[s2,a2,f2].includes(b)?'B':(d&&b===d.head)||b===19||b===20?'head':Math.max(a,b)>=13&&Math.max(a,b)<=18?'legs':'body';
 for(const b of [...(rig.parts||[]).filter(Boolean),...(src?src.bones:[])]){const k=b[0]+'-'+b[1];if(!seen.has(k)){seen.add(k);out.push([b[0],b[1],role(b[0],b[1])])}}return out}
// Shortest turn that takes direction a to direction b, as a function on vectors.
function arc(a,b){const n=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)},u=n(a),w=n(b),d=u[0]*w[0]+u[1]*w[1]+u[2]*w[2];let ax=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],s=Math.hypot(...ax);
 if(s<1e-6){if(d>0)return v=>v;ax=n(Math.abs(u[2])<.9?[u[1],-u[0],0]:[0,u[2],-u[1]]);s=0}else ax=ax.map(x=>x/s);
 return v=>{const cr=[ax[1]*v[2]-ax[2]*v[1],ax[2]*v[0]-ax[0]*v[2],ax[0]*v[1]-ax[1]*v[0]],k=(ax[0]*v[0]+ax[1]*v[1]+ax[2]*v[2])*(1-d);return [v[0]*d+cr[0]*s+ax[0]*k,v[1]*d+cr[1]*s+ax[1]*k,v[2]*d+cr[2]*s+ax[2]*k]}}
function scene(model,phase,mode){const {rig}=model,{J,yaw}=poseAt(rig,phase,mode),turn=yawFn(yaw,J[0]||[0,0,0]),lines=[],tris=[];
 if(model.mesh){const {mesh,rest}=model,xf=rig.parts.map(p=>{const A0=rest[p[0]],B0=rest[p[1]],A=J[p[0]],B=J[p[1]];if(!A0||!B0||!A||!B)return v=>turn(v);
   const rot=arc(B0.map((v,k)=>v-A0[k]),B.map((v,k)=>v-A[k])),m0=A0.map((v,k)=>(v+B0[k])/2),m=A.map((v,k)=>(v+B[k])/2);return v=>{const r=rot([v[0]-m0[0],v[1]-m0[1],v[2]-m0[2]]);return turn([r[0]+m[0],r[1]+m[1],r[2]+m[2]])}});
  const V=mesh.v.map((v,i)=>xf[mesh.vp[i]](v));for(const f of mesh.f)tris.push({p:[V[f[0]],V[f[1]],V[f[2]]],col:PARTCOL[f[3]%PARTCOL.length]})}
 else{for(const [a,b,role] of bonesOf(rig))if(J[a]&&J[b])lines.push({a:turn(J[a]),b:turn(J[b]),col:COL[role],wd:role==='body'?7:5});
  for(const q of R.dancePuffs(rig,phase,mode))lines.push({a:turn(q.p),b:turn(q.p),col:[200,185,150],wd:6});
  const c=J[1]||J[0];if(c){const h=model.height*.12,t=turn([c[0],c[1]+h,c[2]]);lines.push({a:turn(c),b:t,col:COL.face,wd:2})}}
 if(model.mesh)for(const q of R.dancePuffs(rig,phase,mode))lines.push({a:turn(q.p),b:turn(q.p),col:[200,185,150],wd:6});
 return {lines,tris}}
function restJoints(rig){const d=rig.actions&&rig.actions.dance,J=R.joints(rig,0,(rig.modes||['walk'])[0]);if(!d)return J;const src=typeof d.chain==='string'?rig.actions[d.chain]:d.bones?d:null;
 return src?R.setPoseJoints({bones:src.bones.map((b,k)=>[...b,...src.tabs[d.rest||0][k]])},32,J):J}
function loadModel(rigPath){const rig=JSON.parse(fs.readFileSync(rigPath,'utf8')),rest=restJoints(rig),model={rig,rest,height:Math.max(1,...rest.filter(Boolean).map(v=>v[2]))};
 if(rig.puppet){const P=rig.puppet,obj=readObj(path.resolve(path.dirname(rigPath),P.obj),P),fr=faceRoles(obj,P),v=[],vp=[],f=[];
  obj.f.forEach((t,i)=>{const p=Math.max(0,P.roles.indexOf(fr[i])),n=v.length;for(let k=0;k<3;k++){v.push(obj.v[t[k]]);vp.push(p)}f.push([n,n+1,n+2,p])});
  model.mesh={v,vp,f}}
 return model}
function view(az,el){const ca=Math.cos(az*RAD),sa=Math.sin(az*RAD),ce=Math.cos(el*RAD),se=Math.sin(el*RAD);return v=>{const x=v[0]*ca-v[1]*sa,y=v[0]*sa+v[1]*ca;return [-x,-(v[2]*ce-y*se),y*ce+v[2]*se]}}
function fitter(scenes,cam,w,h,pad){let lo=[1e30,1e30],hi=[-1e30,-1e30];const see=v=>{const p=cam(v);for(let k=0;k<2;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k])}};
 for(const s of scenes){for(const l of s.lines){see(l.a);see(l.b)}for(const t of s.tris)t.p.forEach(see)}
 const k=Math.min((w-2*pad)/Math.max(1,hi[0]-lo[0]),(h-2*pad)/Math.max(1,hi[1]-lo[1])),ox=w/2-(lo[0]+hi[0])/2*k,oy=h/2-(lo[1]+hi[1])/2*k;return v=>{const p=cam(v);return [p[0]*k+ox,p[1]*k+oy,p[2]]}}
function paint(c,s,proj,ground){if(ground){const g=ground,q=[[-g,-g,0],[g,-g,0],[g,g,0],[-g,g,0]].map(proj).map(p=>[p[0],p[1],-1e29]);for(let i=0;i<4;i++)line(c,q[i],q[(i+1)%4],1,COL.ground)}
 for(const t of s.tris){const P=t.p.map(proj),u=P[1].map((v,k)=>v-P[0][k]),w=P[2].map((v,k)=>v-P[0][k]),n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],l=Math.hypot(...n)||1,
   sh=.45+.55*Math.abs((n[0]*.3+n[1]*-.5+n[2]*.8)/l);tri(c,P[0],P[1],P[2],t.col.map(v=>v*sh))}
 for(const l of s.lines)line(c,proj(l.a),proj(l.b),l.wd,l.col)}

// ---------- commands ----------
function args(argv){const o={_:[]};for(let i=0;i<argv.length;i++){const a=argv[i];if(a.startsWith('--')){const n=argv[i+1];if(n===undefined||n.startsWith('--'))o[a.slice(2)]=true;else{o[a.slice(2)]=n;i++}}else o._.push(a)}return o}
function useDraft(file){if(!file)return;const d=JSON.parse(fs.readFileSync(file,'utf8'));Object.assign(R.MOVES,d.moves||{});Object.assign(R.ROUTINES,d.routines||{})}
function whereAt(mode,phase){const seq=R.ROUTINES[mode]||[mode];let ph=phase;for(const m of seq){const n=R.MOVES[m].beats*R.BEAT;if(ph<n)return [m,ph/R.BEAT];ph-=n}return [seq[0],0]}
function cmdSheet(o){useDraft(o.moves);const model=loadModel(o.rig),mode=o.mode||'dance',L=R.loopLen(mode),dance=!!(R.MOVES[mode]||R.ROUTINES[mode]),per=+(o['per-beat']||2),step=dance?R.BEAT/per:L/16,
  cw=+(o.cell||132),ch=Math.round(cw*1.25),cols=+(o.cols||8),phases=[];for(let p=0;p<L;p+=step)phases.push(Math.round(p));
 const scenes=phases.map(p=>scene(model,p,mode)),proj=fitter(scenes,view(+(o.az||25),+(o.el||12)),cw,ch-14,8),rows=Math.ceil(phases.length/cols),sheet=canvas(cols*cw,rows*ch);fill(sheet,[250,250,252,255]);
 phases.forEach((p,i)=>{const c=canvas(cw,ch);paint(c,scenes[i],v=>{const q=proj(v);return [q[0],q[1]+14,q[2]]},model.height*.45);const [m,tb]=dance?whereAt(mode,p):[mode,p];
  text(c,3,3,dance?`${m} ${+tb.toFixed(2)}`:`${m} ${p}`,[40,44,52],cw<110?1:2);blit(sheet,c,(i%cols)*cw,Math.floor(i/cols)*ch)});
 const out=o.out||`${mode}-sheet.png`;fs.writeFileSync(out,png(sheet));console.log(`${out}: ${phases.length} cells (${cols} a row), ${dance?`every 1/${per} beat`:`every ${step} phase steps`}, ${sheet.w}x${sheet.h}. Red = arm A, blue = arm B, yellow = head, green = legs, orange tick = facing.`)}
function cmdGif(o){useDraft(o.moves);const model=loadModel(o.rig),mode=o.mode||'dance',L=R.loopLen(mode),st=+(o.step||3),w=+(o.size||220),h=Math.round(w*1.25),scenes=[];for(let p=0;p<L;p+=st)scenes.push(scene(model,p,mode));
 const proj=fitter(scenes,view(+(o.az||25),+(o.el||12)),w,h,8),frames=scenes.map(s=>{const c=canvas(w,h);paint(c,s,proj,0);return c.px}),out=o.out||`${mode}.gif`;
 fs.writeFileSync(out,Buffer.from(encodeGif(frames,w,h,4)));console.log(`${out}: ${frames.length} frames, ${w}x${h}, ${(frames.length*.04).toFixed(1)} s a loop`)}
// Numbers for "is this move calm or twitchy" and "do two moves look alike". Hands are measured from the chest joint, in arm lengths.
function cmdReport(o){useDraft(o.moves);const model=loadModel(o.rig),rig=model.rig,d=rig.actions.dance,[s1,a1,s2,a2]=d.arms,[f1,f2]=d.fore||[],hA=f1??a1,hB=f2??a2,N=64,
  armLen=Math.hypot(...model.rest[hA].map((v,k)=>v-model.rest[1][k]))||1,names=Object.keys(R.MOVES),S={};
 for(const m of names){const L=R.MOVES[m].beats*R.BEAT,pts=[];for(let i=0;i<N;i++){const {J,yaw}=poseAt(rig,Math.round(i*L/N),m),t=yawFn(yaw,J[0]),c=t(J[1]),r=j=>t(J[j]).map((v,k)=>(v-c[k])/armLen);pts.push([...r(hA),...r(hB),Math.sin(yaw*RAD),Math.cos(yaw*RAD)-1,(J[0][0])/armLen,J[0][1]/armLen])}
  let sp=0,rev=0,prev=null;for(let i=0;i<N;i++){const a=pts[i],b=pts[(i+1)%N],v=b.slice(0,6).map((x,k)=>x-a[k]);sp+=Math.hypot(...v);if(prev&&v.slice(0,6).reduce((s,x,k)=>s+x*prev[k],0)<-1e-4)rev++;prev=v}
  S[m]={pts,speed:sp/R.MOVES[m].beats,rev:rev/R.MOVES[m].beats}}
 const dist=(a,b)=>{let best=1e9;for(let sh=0;sh<N;sh+=4){let s=0;for(let i=0;i<N;i++)s+=Math.hypot(...S[a].pts[i].map((x,k)=>x-S[b].pts[(i+sh)%N][k]));best=Math.min(best,s/N)}return best};
 console.log('move       beats  hand travel/beat  reversals/beat   (travel in arm lengths; many reversals a beat reads as twitchy)');
 for(const m of names)console.log(m.padEnd(10),String(R.MOVES[m].beats).padStart(5),S[m].speed.toFixed(2).padStart(17),S[m].rev.toFixed(1).padStart(15),S[m].rev>3?'  <- twitchy':'');
 console.log('\nHow different two moves look (mean pose distance, arm lengths; under 0.5 they read as the same move):');
 console.log(' '.repeat(10)+names.map(n=>n.slice(0,8).padStart(9)).join(''));
 for(const a of names)console.log(a.padEnd(10)+names.map(b=>a===b?'        -':(dist(a,b).toFixed(2)+(dist(a,b)<.5?'!':' ')).padStart(9)).join(''))}

// ---------- static models (OBJ) -> puppet rigs ----------
const AX={'+x':[1,0,0],'-x':[-1,0,0],'+y':[0,1,0],'-y':[0,-1,0],'+z':[0,0,1],'-z':[0,0,-1]};
// Reads an OBJ into rig space (x side, y forward, z up), feet on the ground, centred, 4000 units tall. Groups come from g/o
// lines; a file without any is split into its connected pieces (c0, c1, ...).
function readObj(file,opt={}){const up=AX[opt.up||'+y'],fr=AX[opt.front||'+z'],side=[fr[1]*up[2]-fr[2]*up[1],fr[2]*up[0]-fr[0]*up[2],fr[0]*up[1]-fr[1]*up[0]],dotv=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
 let v=[],f=[],groups=[],g=-1;const gid=n=>{let i=groups.indexOf(n);if(i<0){i=groups.length;groups.push(n)}return i};
 for(const ln of fs.readFileSync(file,'utf8').split(/\r?\n/)){const t=ln.trim().split(/\s+/);if(t[0]==='v'){const p=t.slice(1,4).map(Number);v.push([dotv(p,side),dotv(p,fr),dotv(p,up)])}
  else if(t[0]==='g'||t[0]==='o')g=gid(t.slice(1).join(' ')||'default');else if(t[0]==='f'){const ix=t.slice(1).map(s=>{const n=parseInt(s);return n<0?v.length+n:n-1});for(let i=1;i+1<ix.length;i++)f.push([ix[0],ix[i],ix[i+1],g])}}
 if(groups.length<2){const par=v.map((_,i)=>i),find=i=>{while(par[i]!==i)i=par[i]=par[par[i]];return i};for(const t of f){par[find(t[0])]=find(t[1]);par[find(t[2])]=find(t[1])}groups=[];const ids=new Map();
  for(const t of f){const r=find(t[0]);if(!ids.has(r)){ids.set(r,groups.length);groups.push('c'+groups.length)}t[3]=ids.get(r)}}
 else for(const t of f)if(t[3]<0)t[3]=gid('default');
 const used=new Set(f.flatMap(t=>t.slice(0,3))),U=[...used].map(i=>v[i]),lo=[0,1,2].map(k=>Math.min(...U.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...U.map(p=>p[k]))),s=4000/Math.max(1e-9,hi[2]-lo[2]);
 v=v.map(p=>[(p[0]-(lo[0]+hi[0])/2)*s,(p[1]-(lo[1]+hi[1])/2)*s,(p[2]-lo[2])*s]);return {v,f,groups}}
function groupStats(obj){return obj.groups.map((name,gi)=>{const ids=[...new Set(obj.f.filter(t=>t[3]===gi).flatMap(t=>t.slice(0,3)))],P=ids.map(i=>obj.v[i]);if(!P.length)return {name,n:0,ids,P,c:[0,0,0],lo:[0,0,0],hi:[0,0,0]};
  const lo=[0,1,2].map(k=>Math.round(Math.min(...P.map(p=>p[k])))),hi=[0,1,2].map(k=>Math.round(Math.max(...P.map(p=>p[k])))),c=[0,1,2].map(k=>Math.round(P.reduce((s,p)=>s+p[k],0)/P.length));return {name,n:P.length,ids,P,lo,hi,c}})}
// Which body part each triangle belongs to. map.cuts {part:[{box:[[x,y,z],[x,y,z]], groups?:[...]}]} wins: a triangle whose
// centre lies in a box (rig space) goes to that part, for models whose groups are materials or that are one single mesh.
// Otherwise map.parts {part:[group names]} decides; what is left over is torso.
function faceRoles(obj,map){const byGroup={};for(const [role,gs] of Object.entries(map.parts||{}))for(const g of gs)byGroup[String(g)]=role;
 const cuts=Object.entries(map.cuts||{}),inBox=(c,b)=>[0,1,2].every(k=>c[k]>=Math.min(b[0][k],b[1][k])&&c[k]<=Math.max(b[0][k],b[1][k]));
 return obj.f.map(t=>{const c=[0,1,2].map(k=>(obj.v[t[0]][k]+obj.v[t[1]][k]+obj.v[t[2]][k])/3),g=obj.groups[t[3]];
  for(const [role,boxes] of cuts)for(const b of boxes)if((!b.groups||b.groups.map(String).includes(g))&&inBox(c,b.box))return role;return byGroup[g]||'torso'})}
// Boxes for an upright two-legged model from its overall size alone: arms outside, legs low and inside, head high and central.
function guessCuts(obj){const hw=Math.max(...obj.v.map(p=>Math.abs(p[0]))),r=Math.round,B=1e5;
 return {head:[{box:[[r(-hw*.45),-B,2700],[r(hw*.45),B,B]]}],armA:[{box:[[r(hw*.6),-B,400],[B,B,B]]}],armB:[{box:[[-B,-B,400],[r(-hw*.6),B,B]]}],legA:[{box:[[0,-B,-B],[r(hw*.6),B,900]]}],legB:[{box:[[r(-hw*.6),-B,-B],[0,B,900]]}]}}
// A first guess at which group is which body part of an upright two-legged model. Always check it against the picture.
function guessRoles(st){const live=st.filter(g=>g.n),M=Math.max(...live.map(g=>Math.max(-g.lo[0],g.hi[0])))*.15,vol=g=>(g.hi[0]-g.lo[0])*(g.hi[1]-g.lo[1])*(g.hi[2]-g.lo[2]),mid=live.filter(g=>Math.abs(g.c[0])<M),roles={torso:[],head:[],armA:[],armB:[],legA:[],legB:[]};
 const torso=(mid.length?mid:live).filter(g=>g.c[2]>900&&g.c[2]<3300).sort((a,b)=>vol(b)-vol(a))[0]||live.sort((a,b)=>vol(b)-vol(a))[0];roles.torso.push(torso.name);const tz=(torso.lo[2]+torso.hi[2])/2;
 for(const g of live){if(g===torso)continue;const side=g.c[0]>=0?'A':'B';if(Math.abs(g.c[0])<M&&g.c[2]>tz)roles.head.push(g.name);else if(Math.abs(g.c[0])<M)roles.torso.push(g.name);else if(g.c[2]>=torso.lo[2]+(torso.hi[2]-torso.lo[2])*.25)roles['arm'+side].push(g.name);else roles['leg'+side].push(g.name)}
 return roles}
function cmdObjInfo(o){const file=o._[0],obj=readObj(file,o),st=groupStats(obj);console.log(`${path.basename(file)}: ${obj.v.length} vertices, ${obj.f.length} triangles, ${obj.groups.length} groups. Rig space: x side, y forward, z up, 4000 tall.`);
 console.log('group        verts   centre (x,y,z)          box min .. max');for(const g of st)console.log(g.name.padEnd(12),String(g.n).padStart(5),'  ',String(g.c).padEnd(22),String(g.lo),'..',String(g.hi));
 const w=300,h=380,sheet=canvas(w*3,h),sc={lines:[],tris:obj.f.map(t=>({p:[obj.v[t[0]],obj.v[t[1]],obj.v[t[2]]],col:PARTCOL[t[3]%PARTCOL.length]}))};fill(sheet,[250,250,252,255]);
 [[0,'front'],[90,'side'],[35,'three-quarter']].forEach(([az,label],i)=>{const c=canvas(w,h),proj=fitter([sc],view(az,10),w,h-16,10);paint(c,sc,v=>{const q=proj(v);return [q[0],q[1]+16,q[2]]},0);
  for(const g of st)if(g.n){const q=proj(g.c);text(c,Math.round(q[0])-4,Math.round(q[1])+12,g.name,[0,0,0],2)}for(let z=0;z<=4000;z+=1000){const a=proj([0,0,z]);for(let x=0;x<w;x+=6)put(c,x,Math.round(a[1])+16,1e29,[190,60,60]);text(c,w-34,Math.round(a[1])+18,'z'+z,[190,60,60],1)}
  if(az!==35)for(let u=-2000;u<=2000;u+=1000){const a=proj(az?[0,u,0]:[u,0,0]);for(let y=16;y<h;y+=6)put(c,Math.round(a[0]),y,1e29,[60,90,190]);text(c,Math.round(a[0])+2,h-8,(az?'y':'x')+u,[60,90,190],1)}
  text(c,4,4,label,[40,44,52],2);blit(sheet,c,i*w,0)});
 const out=o.out||'obj-info.png';fs.writeFileSync(out,png(sheet));console.log(`\n${out}: front, side and three-quarter views, each group in its own colour with its name on it.`);
 console.log('If the model lies on its back or faces away, rerun with --up / --front (+x -x +y -y +z -z).\n\nSuggested map (a guess; fix it after looking at the picture), save as MAP.json:');
 const guess=guessRoles(st),limbs=['armA','armB','legA','legB'].every(k=>guess[k].length);
 console.log(JSON.stringify(limbs?{up:o.up||'+y',front:o.front||'+z',parts:guess}:{up:o.up||'+y',front:o.front||'+z',cuts:guessCuts(obj)},null,1));
 if(!limbs)console.log('The groups here are not body parts (materials, or one mesh), so the guess cuts the model with boxes instead: a triangle whose centre is inside a box joins that part, the rest is torso. Read the red z lines and blue x / y lines off the picture to move the boxes.')}
// Builds a puppet rig: each body part is a rigid piece on one bone. Pivots come from the mesh itself: the end of a limb
// nearest the body is its joint, the far end its tip. Parts: torso, head, armA, armB, legA, legB; optional foreA, foreB.
function cmdPuppet(o){const file=o._[0],map=JSON.parse(fs.readFileSync(o.map,'utf8')),obj=readObj(file,map);for(const n of Object.values(map.parts||{}).flat())if(!obj.groups.includes(String(n)))throw new Error(`map names group "${n}" but the model has: ${obj.groups.join(', ')}`);
 const fr=faceRoles(obj,map),pts=role=>[...new Set(obj.f.flatMap((t,i)=>fr[i]===role?t.slice(0,3):[]))].map(i=>obj.v[i]);
 const mean=P=>[0,1,2].map(k=>P.reduce((s,p)=>s+p[k],0)/P.length),dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]),near=(P,q,far)=>{const s=P.slice().sort((a,b)=>(dist(a,q)-dist(b,q))*(far?-1:1));return mean(s.slice(0,Math.max(3,Math.ceil(P.length*.12))))};
 const T=pts('torso');if(!T.length)throw new Error('the map needs a torso');const tc=mean(T),z0=Math.min(...T.map(p=>p[2])),z1=Math.max(...T.map(p=>p[2])),rnd=v=>v.map(Math.round);
 const J={2:rnd([tc[0],tc[1],z0]),1:rnd([tc[0],tc[1],z1]),0:rnd([tc[0],tc[1],(z0+z1)/2])},bones=[],tab=[],parts=[[2,1]],roles=['torso'];
 const ang=(a,b)=>{const d=b.map((v,k)=>v-a[k]),l=Math.hypot(...d)||1;return [Math.round(l),Math.round(Math.acos(Math.max(-1,Math.min(1,d[2]/l)))/RAD),Math.round((Math.atan2(d[0],d[1])/RAD+360)%360)]};
 const bone=(p,c,to)=>{const [l,a,b]=ang(J[p],to);J[c]=rnd(to);bones.push([p,c,l]);tab.push([a,b])},assign=()=>{};
 // the chest joint sits at shoulder height, so a shoulder bone lies level and raising it does not lift the arm off the body
 {const ch=[tc[0],tc[1],z0+(z1-z0)*.8],zs=['A','B'].map(x=>pts('arm'+x)).filter(P=>P.length).map(P=>near(P,ch)[2]);if(zs.length){J[1]=rnd([tc[0],tc[1],zs.reduce((a,b)=>a+b)/zs.length]);J[0]=rnd([tc[0],tc[1],(z0+J[1][2])/2])}}
 const dance={rest:0,arms:[],feet:[15,18],hop:280,sway:240};
 const H=pts('head');if(H.length){const neck=near(H,J[1]),tip=near(H,neck,true);bone(1,19,neck);bone(19,20,tip);parts.push([19,20]);roles.push('head');assign('head',parts.length-1);dance.head=20;dance.headRest=tab[tab.length-1].slice()}
 for(const [s,sh,el,hand] of [['A',7,8,9],['B',10,11,12]]){const P=pts('arm'+s),F=pts('fore'+s);if(!P.length)throw new Error('the map needs arm'+s);const chest=[tc[0],tc[1],z0+(z1-z0)*.8],piv=near(P,chest);bone(1,sh,piv);
  if(F.length){const elbow=near(F,piv);bone(sh,el,elbow);parts.push([sh,el]);roles.push('arm'+s);assign('arm'+s,parts.length-1);bone(el,hand,near(F,elbow,true));parts.push([el,hand]);roles.push('fore'+s);assign('fore'+s,parts.length-1);(dance.fore=dance.fore||[]).push(hand)}
  else{bone(sh,el,near(P,piv,true));parts.push([sh,el]);roles.push('arm'+s);assign('arm'+s,parts.length-1)}dance.arms.push(sh,el)}
 for(const [s,hip,foot] of [['A',5,15],['B',6,18]]){const P=pts('leg'+s);if(!P.length)continue;const piv=near(P,J[2]);J[hip]=rnd(piv);const lowest=P.slice().sort((a,b)=>a[2]-b[2]),tip=mean(lowest.slice(0,Math.max(3,Math.ceil(P.length*.12))));J[foot]=rnd([piv[0],piv[1],tip[2]]);parts.push([hip,foot]);roles.push('leg'+s);assign('leg'+s,parts.length-1)}
 const body={kind:'puppet',J:Object.fromEntries([0,1,2,5,6,15,18].filter(k=>J[k]).map(k=>[k,J[k]])),bob:40,lift:220,stride:90};
 const out=o.out||file.replace(/\.obj$/i,'')+'.rig.json',rig={modes:['walk','run'],body,legs:{},parts,actions:{dance:{bones,tabs:[tab],...dance}},
  puppet:{obj:path.relative(path.dirname(path.resolve(out)),path.resolve(file)).replace(/\\/g,'/'),up:map.up||'+y',front:map.front||'+z',roles,parts:map.parts,cuts:map.cuts}};
 fs.writeFileSync(out,JSON.stringify(rig,null,1));console.log(`${out}: ${parts.length} parts: ${roles.map(r=>r+' '+fr.filter(x=>x===r).length).join(', ')} triangles.`);
 console.log(`Next: node tools/dance-bench/bench.js sheet --rig ${out} --mode dance`)}

const [cmd,...rest]=process.argv.slice(2),o=args(rest);
const run={sheet:cmdSheet,gif:cmdGif,report:cmdReport,'obj-info':cmdObjInfo,puppet:cmdPuppet,moves:()=>console.log(JSON.stringify({moves:R.MOVES,routines:R.ROUTINES},null,1))}[cmd];
if(!run||((cmd==='sheet'||cmd==='gif'||cmd==='report')&&!o.rig)||((cmd==='obj-info'||cmd==='puppet')&&!o._[0])||(cmd==='puppet'&&!o.map)){console.error(fs.readFileSync(__filename,'utf8').split('\n').slice(1,10).join('\n'));process.exit(2)}
run(o);
