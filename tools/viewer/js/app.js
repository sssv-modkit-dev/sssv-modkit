
let TABLE=/*TABLE*/null;
let romTable=TABLE,demoMode=false;
function readPart(p,B){return p.demo||parseDL(dv,p.r,B)}
//#PURE-START
function vtx(dv,b,off,i){const o=b+off+16*i;if(o<0||o+16>dv.byteLength||dv.getUint16(o+6))return null;const q=[dv.getInt16(o),dv.getInt16(o+2),dv.getInt16(o+4)];q.o=o;q.c=[dv.getUint8(o+12)/255,dv.getUint8(o+13)/255,dv.getUint8(o+14)/255];return q}
function parseDL(dv,addr,bases){const vb={},cols=[],tris=[],groups=[],bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];let c=-1;
for(let i=0;i<800;i++){const o=addr+8*i;if(o+8>dv.byteLength)break;const op=dv.getUint8(o),w0=dv.getUint32(o),w1=dv.getUint32(o+4);
if(op==0xB8)break;
if(op==4){const seg=w1>>>24,off=w1&0xFFFFFF,n=((w0&0x3FF)+1)>>4,v0=((w0>>>16)&255)>>1,b=bases[seg],gv=[];groups.push({verts:gv});for(let k=0;k<n;k++){const q=vb[v0+k]=b===undefined?null:vtx(dv,b,off,k);if(q)gv.push(q);if(q)for(let a=0;a<3;a++){bb[a]=Math.min(bb[a],q[a]);bb[a+3]=Math.max(bb[a+3],q[a])}}}
else if(op==0xFA){cols.push({rgba:w1.toString(16).toUpperCase().padStart(8,'0'),rom:o+4});c=cols.length-1}
else if(op==0xBF||op==0xB1){const T=op==0xBF?[[(w1>>>16)&255,(w1>>>8)&255,w1&255]]:[[(w0>>>16)&255,(w0>>>8)&255,w0&255],[(w1>>>16)&255,(w1>>>8)&255,w1&255]];
for(const t of T){const v=t.map(k=>vb[k>>1]);if(v.every(x=>x)&&new Set(t).size==3)tris.push({v,c})}}}
// Keep the full vertex bounds for builder-compatible mesh transforms, but
// frame/layout only the rendered geometry, excluding unused cache entries.
const viewBB=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(const t of tris)for(const q of t.v)for(let a=0;a<3;a++){viewBB[a]=Math.min(viewBB[a],q[a]);viewBB[a+3]=Math.max(viewBB[a+3],q[a])}
return{cols,tris,bb,viewBB,groups}}
// --- shared op maths: keep every vertex operation here so the deform preview can be added next to it ---
function applyMesh(v,E,bb){if(!E)return v;const c0=E.o?[0,0,0]:[0,1,2].map(k=>(bb[k]+bb[k+3])/2);return v.map((x,k)=>Math.floor(c0[k]+(x-c0[k])*E.s[k]+E.m[k]+.5))}
// true if the part has no G_SETPRIMCOLOR, or has triangles drawn before its first one
function noOwnColour(P){return P.cols.length==0||P.tris.some(t=>t.c<0)}
// exploded layout: one grid cell per part, offsets move each part's bbox centre onto its cell centre
function sheetLayout(parts){parts=parts.map(P=>({...P,bb:P.viewBB||P.bb}));const ok=parts.map(P=>P.bb[0]<=P.bb[3]);let cell=1;
parts.forEach((P,i)=>{if(ok[i])cell=Math.max(cell,P.bb[3]-P.bb[0],P.bb[4]-P.bb[1],P.bb[5]-P.bb[2])});cell=Math.ceil(cell*1.1);
const cols=Math.max(1,Math.ceil(Math.sqrt(parts.length))),out={};
parts.forEach((P,i)=>{const c=[0,1,2].map(k=>ok[i]?(P.bb[k]+P.bb[k+3])/2:0);out[P.sym]=[Math.round((i%cols)*cell-c[0]),Math.round(-Math.floor(i/cols)*cell-c[1]),Math.round(-c[2])]});return out}
// Gallery tiles are thumbnails: normalize each sheet so a large animal cannot
// force every other animal to a tiny fraction of the viewport.
function gallerySheet(parts){
  parts=parts.map(P=>({...P,bb:P.viewBB||P.bb}));
  const layout=sheetLayout(parts),mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
  for(const P of parts){if(P.bb[0]>P.bb[3])continue;const of=layout[P.sym];for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],P.bb[k]+of[k]);mx[k]=Math.max(mx[k],P.bb[k+3]+of[k])}}
  if(!Number.isFinite(mn[0]))return{parts:layout,mn:[0,0,0],mx:[1,1,1],scale:1,offset:[0,0,0]};
  const scale=1/Math.max(1,...mx.map((v,k)=>v-mn[k]));
  return{parts:layout,mn:mn.map(v=>v*scale),mx:mx.map(v=>v*scale),scale,offset:[0,0,0]};
}
// --- deform preview: JS port of plan_deform() in make_animal_mods.py. Keep the two in step (same op names, same maths, same rounding) ---
const DEF_AX={x:0,y:1,z:2};
function axOf(a){const k=DEF_AX[String(a).toLowerCase()];if(k===undefined)throw new Error('deform: bad axis "'+a+'" (use x, y or z)');return k}
// lo/hi = bbox of the selected vertices BEFORE this entry; returns p=>void that moves a [x,y,z] in place (floats, rounded later)
function makeDeform(lo,hi,ops,about){
  const ctr=about||[0,1,2].map(k=>(lo[k]+hi[k])/2);
  if(ctr.length!=3)throw new Error('deform "about" needs 3 numbers');
  const steps=[];
  for(const op of ops){
    const ty=op.type,rg=op.range||[0,1],r0=rg[0],r1=rg[1];
    if(!(r0>=0&&r0<r1&&r1<=1))throw new Error('deform range must satisfy 0 <= a < b <= 1: '+JSON.stringify(op));
    let ax=0,span=0,frac=null,ramp=null;
    if(ty==='taper'||ty==='twist'||ty==='bend'||(ty==='inflate'&&op.range)){
      ax=axOf(op.axis);span=hi[ax]-lo[ax];
      frac=p=>span>0?(p[ax]-lo[ax])/span:.5;
      ramp=p=>Math.min(1,Math.max(0,(frac(p)-r0)/(r1-r0)));
    }
    if(ty==='taper'){
      const s0=op.from!==undefined?+op.from:1,s1=op.to!==undefined?+op.to:1;
      steps.push(p=>{const s=s0+(s1-s0)*ramp(p);for(let k=0;k<3;k++)if(k!==ax)p[k]=ctr[k]+(p[k]-ctr[k])*s});
    }else if(ty==='twist'){
      const u=(ax+1)%3,v=(ax+2)%3,deg=+op.degrees*Math.PI/180;
      if(!isFinite(deg))throw new Error('deform twist needs "degrees"');
      steps.push(p=>{const a=deg*ramp(p),c=Math.cos(a),s=Math.sin(a),du=p[u]-ctr[u],dv=p[v]-ctr[v];p[u]=ctr[u]+du*c-dv*s;p[v]=ctr[v]+du*s+dv*c});
    }else if(ty==='bend'){
      const ts=String(op.toward===undefined?'':op.toward).toLowerCase(),sgn=ts.startsWith('-')?-1:1,tw=axOf(ts.replace(/^[+-]+/,''));
      if(tw===ax)throw new Error('deform bend "toward" must differ from "axis"');
      const th=+op.degrees*Math.PI/180;
      if(!isFinite(th))throw new Error('deform bend needs "degrees"');
      if(th===0||span<=0)continue;
      const start=lo[ax]+r0*span,L=(r1-r0)*span,R=L/th;
      steps.push(p=>{const s=p[ax]-start,phi=th*Math.min(Math.max(s,0),L)/L,extra=Math.max(0,s-L),pre=Math.min(0,s),dd=sgn*(p[tw]-ctr[tw]);
        p[ax]=start+R*Math.sin(phi)-dd*Math.sin(phi)+extra*Math.cos(phi)+pre;
        p[tw]=ctr[tw]+sgn*(R*(1-Math.cos(phi))+dd*Math.cos(phi)+extra*Math.sin(phi))});
    }else if(ty==='inflate'){
      const f=op.amount!==undefined?+op.amount:1,axes=[...(op.axes===undefined?'xyz':op.axes)].map(axOf);
      steps.push(p=>{const w=op.range?((frac(p)>=r0&&frac(p)<=r1)?1:0):1,k_=1+(f-1)*w;for(const k of axes)p[k]=ctr[k]+(p[k]-ctr[k])*k_});
    }else throw new Error('unknown deform op type "'+ty+'" (taper, twist, bend, inflate)');
  }
  return p=>{for(const st of steps)st(p)};
}
// one vertex through one makeDeform fn -> rounded, int16-clamped [x,y,z]; st.clip counts clamped coordinates
function applyDeform(f,v,st){const p=[v[0],v[1],v[2]];f(p);return p.map(x=>{let y=Math.floor(x+.5);if(y<-32768||y>32767){if(st)st.clip++;y=Math.max(-32768,Math.min(32767,y))}return y})}
function bboxOf(pts){const lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(const p of pts)for(let k=0;k<3;k++){if(p[k]<lo[k])lo[k]=p[k];if(p[k]>hi[k])hi[k]=p[k]}return[lo,hi]}
// entries = [{ops,about,groups}] in config order. Like the builder: each entry selects whole vertex groups (all of them unless "groups":[i,..]), every unique vertex (by ROM offset) is deformed once,
// the mesh edit E (or null) runs first, and each entry's bbox comes from its selected vertices as the previous entry left them. Each fn in fs carries .sel (Set of vertex offsets).
function partGroups(P){if(P.groups)return P.groups;const seen=new Set(),gv=[];let n=0;for(const t of P.tris)for(const v of t.v)if(!seen.has(v)){seen.add(v);if(v.o===undefined)v.o=--n;gv.push(v)}return[{verts:gv}]}
function deformPrepare(P,E,entries){
  const G=partGroups(P),cur=new Map();
  for(const g of G)for(const v of g.verts)if(!cur.has(v.o))cur.set(v.o,E?applyMesh(v,E,P.bb):[v[0],v[1],v[2]]);
  const st={clip:0},fs=[];let before=null,after=null;
  if(!cur.size)return{fs,before:[[0,0,0],[0,0,0]],after:[[0,0,0],[0,0,0]],clip:0};
  for(const en of entries){
    const sel=[],seen=new Set();
    for(const i of en.groups||G.map((_,k)=>k)){if(!G[i])throw new Error('deform "groups" index '+i+' is out of range');for(const v of G[i].verts)if(!seen.has(v.o)){seen.add(v.o);sel.push(v.o)}}
    if(!sel.length)throw new Error('deform selects no vertices');
    const pts=sel.map(o=>cur.get(o)),[lo,hi]=bboxOf(pts);if(!before)before=[lo,hi];
    const f=makeDeform(lo,hi,en.ops,en.about);f.sel=seen;fs.push(f);
    sel.forEach((o,k)=>cur.set(o,applyDeform(f,pts[k],st)));after=bboxOf(sel.map(o=>cur.get(o)));
  }
  return{fs,before,after,clip:st.clip};
}
// one drawn vertex v (original, carries .o) at mesh-edited position w -> deformed position; only entries whose groups include v touch it
function deformPoint(R,v,w){return R.fs.reduce((q,f)=>!f.sel||f.sel.has(v.o)?applyDeform(f,q):q,w)}
// Camera helpers use CSS pixels, independently of display pixel density.
function cameraPlaneDelta(R,distance,height,dx,dy){
  const scale=2*distance*Math.tan(.4)/Math.max(1,height);
  return [0,1,2].map(k=>(R[k*4]*dx-R[k*4+1]*dy)*scale);
}
function cameraFit(lo,hi,R,aspect){
  const center=lo.map((v,k)=>(v+hi[k])/2);
  let distance=1;
  for(let i=0;i<8;i++){
    const p=center.map((v,k)=>((i>>k)&1?hi[k]:lo[k])-v);
    const q=[0,1,2].map(k=>p.reduce((sum,v,j)=>sum+R[j*4+k]*v,0));
    distance=Math.max(distance,q[2]+Math.abs(q[0])/(Math.tan(.4)*Math.max(.01,aspect)*.8),q[2]+Math.abs(q[1])/(Math.tan(.4)*.8));
  }
  return {center,distance,radius:Math.max(1,Math.hypot(...hi.map((v,k)=>(v-lo[k])/2)))};
}
//#PURE-END
let deform={},deformOn=false;const deformCache=new Map();
// deform entries per part symbol, prepared (bbox + per-entry fns) and cached; the cache key includes the part's mesh edit
function deformFor(P,E){const en=deform[P.sym];if(!en)return null;const key=P.sym+'|'+(E?JSON.stringify(E):'');let R=deformCache.get(key);if(!R){try{R=deformPrepare(P,E,en)}catch(e){console.error('deform preview',P.sym,e);R={fs:[]}}deformCache.set(key,R)}return R.fs.length?R:null}
const defIn=Object.assign(document.createElement('input'),{type:'file',accept:'.json',hidden:true});document.body.appendChild(defIn);
defIn.onchange=async()=>{const f=defIn.files[0];defIn.value='';if(!f)return;try{
const j=JSON.parse(await f.text()),nd={};let n=0;
for(const e of (j.animals||[j]))for(const d of (e&&e.deform)||[]){if(!d.symbol||!Array.isArray(d.ops))throw new Error('every deform entry needs "symbol" and "ops"');(nd[d.symbol]=nd[d.symbol]||[]).push({ops:d.ops,about:d.about,groups:d.groups});n++}
if(!n)throw new Error('no "deform" entries in that file');
const rows=[],fmt=a=>a.map(b=>b.join(',')).join('  ..  ');
for(const s in nd){const P=parsed.find(q=>q.sym===s);if(!P){rows.push({part:s,note:'not in the animal currently shown'});continue}const R=deformPrepare(P,mesh[s],nd[s]);rows.push({part:s,before:fmt(R.before),after:fmt(R.after),clamped:R.clip})}
if(rows.every(r=>r.note))throw new Error('none of those parts belong to the animal shown ('+name+'); pick that animal first');
console.table(rows);deform=nd;deformCache.clear();deformOn=true;ui();rebuild(false);info()
}catch(e){alert('Deform preview: '+e.message)}};
const $=id=>document.getElementById(id);
let pickTris=[],hoverSym=null,returnMode=null,partNames={},partOffsets={},labelOffsets={},selectedSym=null,moveButton="alt",showGrid=false,showLabels=false,backgroundOverride=null;let mesh={},dv=null,cur=null,name='',bases={},parsed=[],map={},sel=0,variant='',all=false,sheet=false,SH={},useVC=true,yaw=0,pit=-Math.PI/4,roll=0,dist=1,ctr=[0,0,0],nv=0,dirty=false,gallery=false,galleryData=[],galleryLayout=[];
let sceneBounds=null,sceneRadius=1;
const cv=$('cv'),gl=cv.getContext('webgl',{alpha:true});
if(!gl){$('demo-status').textContent='WebGL is unavailable. Enable hardware acceleration or try another browser.';throw new Error('WebGL unavailable')}
function sh(t,s){const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);return x}
const pg=gl.createProgram();
gl.attachShader(pg,sh(gl.VERTEX_SHADER,'attribute vec3 p,c,n;uniform mat4 M,N;varying vec3 vc;varying float vl;void main(){gl_Position=M*vec4(p,1.);vc=c;vec3 q=normalize((N*vec4(n,0.)).xyz);vl=.45+.55*abs(dot(q,normalize(vec3(-.3,.5,.8))));}'));
gl.attachShader(pg,sh(gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 vc;varying float vl;void main(){gl_FragColor=vec4(vc*vl,1.);}'));
gl.linkProgram(pg);gl.useProgram(pg);gl.enable(gl.DEPTH_TEST);
const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);const loc={M:gl.getUniformLocation(pg,'M'),N:gl.getUniformLocation(pg,'N')};
['p','c','n'].forEach((a,i)=>{const l=gl.getAttribLocation(pg,a);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,3,gl.FLOAT,false,36,i*12)});
const mul=(a,b)=>{const r=Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)r[j*4+i]+=a[k*4+i]*b[j*4+k];return r};
const rx=a=>{const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]};
const ry=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]};
const rz=a=>{const c=Math.cos(a),s=Math.sin(a);return[c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]};
const cameraRotation=()=>mul(rz(roll),mul(rx(pit),ry(yaw)));
const tr=(x,y,z)=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];
const pr=(a,n,f)=>{const t=1/Math.tan(.4);return[t/a,0,0,0,0,t,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0]};
const projection=()=>pr(cv.clientWidth/Math.max(1,cv.clientHeight),Math.max(sceneRadius/10000,dist-sceneRadius*2),dist+sceneRadius*2);
function frameCamera(){if(sceneBounds){const f=cameraFit(...sceneBounds,cameraRotation(),cv.clientWidth/Math.max(1,cv.clientHeight));ctr=f.center;dist=f.distance;sceneRadius=f.radius}need()}
function panCamera(dx,dy){const delta=cameraPlaneDelta(cameraRotation(),dist,cv.clientHeight,dx,dy);ctr=ctr.map((v,k)=>v-delta[k]);need()}
function zoomCamera(delta){dist=Math.max(sceneRadius*.02,Math.min(sceneRadius*100,dist*Math.exp(Math.max(-2,Math.min(2,delta)))));need()}
function updateAxes(R){
  const axes=[['x',R[0],R[1]],['y',R[4],R[5]],['z',R[8],R[9]]];
  for(const [key,x,y] of axes){
    const len=25,ex=47+x*len,ey=47-y*len;
    const line=$('ax-'+key),label=$('ax-'+key+'l');
    line.setAttribute('x2',ex);line.setAttribute('y2',ey);
    label.setAttribute('x',47+x*(len+10));label.setAttribute('y',47-y*(len+10));
  }
}
function draw(size){dirty=false;const w=Array.isArray(size)?size[0]:(cv.clientWidth*devicePixelRatio|0),h=Array.isArray(size)?size[1]:(cv.clientHeight*devicePixelRatio|0);
if(cv.width!=w||cv.height!=h){cv.width=w;cv.height=h}gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
const R=cameraRotation(),V=mul(tr(0,0,-dist),mul(R,tr(-ctr[0],-ctr[1],-ctr[2])));
updateAxes(R);
gl.uniformMatrix4fv(loc.M,false,mul(projection(),V));gl.uniformMatrix4fv(loc.N,false,R);gl.drawArrays(gl.TRIANGLES,0,nv);if(showLabels)updateFloatingLabels()}
const need=()=>{if(!dirty){dirty=true;requestAnimationFrame(draw)}};
const NAMED_COLOURS={Black:'000000',White:'FFFFFF',Red:'FF0000',Green:'008000',Blue:'0000FF',Yellow:'FFFF00',Orange:'FFA500',Purple:'800080',Pink:'FFC0CB',Brown:'8B4513',Grey:'808080',Cyan:'00FFFF',Magenta:'FF00FF',Beige:'F5F5DC',Gold:'FFD700',Olive:'808000',Teal:'008080',Navy:'000080'};
function colourName(hex){const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));let best='Colour',dist=Infinity;for(const [name,val] of Object.entries(NAMED_COLOURS)){const c=[0,2,4].map(i=>parseInt(val.slice(i,i+2),16));const d=c.reduce((sum,x,i)=>sum+(x-rgb[i])**2,0);if(d<dist){dist=d;best=name}}return best}
const hex2=s=>[0,2,4].map(i=>parseInt(s.substr(i,2),16)/255);
const visibleParts=()=>parsed.filter(
  P=>!variant||P.sections.includes(variant)
);
const shown=()=>all||sheet
  ?visibleParts()
  :[parsed[sel]].filter(P=>P&&visibleParts().includes(P));
let pose=null,assembled=false;
const poseOk=()=>!!pose&&(pose.animal||'dog')===name;
const poseIn=Object.assign(document.createElement('input'),{type:'file',accept:'.json',hidden:true});document.body.appendChild(poseIn);
poseIn.onchange=async()=>{const f=poseIn.files[0];poseIn.value='';if(!f)return;try{const j=JSON.parse(await f.text());if(!Array.isArray(j.parts))throw 0;pose=j;assembled=true;all=false;sheet=false;ui();rebuild(true);info()}catch(_){alert('Not a pose file from skeleton_preview.py')}};
const asmXf=pp=>{const r=pp.rows,t=pp.T;return w=>{const g=[0,1,2].map(k=>w[0]*r[0][k]+w[1]*r[1][k]+w[2]*r[2][k]+t[k]);return[g[0],g[2],-g[1]]}};
function asmSources(){return pose.parts.flatMap(pp=>{const P=parsed.find(q=>q.sym===pp.dl);return P?[{P,offset:[0,0,0],local:[0,0,0],xf:asmXf(pp),flip:((pp.mirror&1)^((pp.mirror>>1)&1))===1}]:[]})}
function rebuild(fit){const d=[];pickTris=[];let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
const sources=gallery?galleryData.flatMap((A,ai)=>A.parts.map(P=>({P,offset:galleryLayout[ai].offset,local:galleryLayout[ai].parts[P.sym],scale:galleryLayout[ai].scale}))):shown().map(P=>({P,offset:[0,0,0],local:sheet?(SH[P.sym]||[0,0,0]).map((v,k)=>v+(partOffsets[name]?.[P.sym]?.[k]||0)):[0,0,0]}));
for(const S of (assembled&&!gallery&&poseOk()?asmSources():sources)){const P=S.P,E=gallery?null:mesh[P.sym],DF=!gallery&&deformOn?deformFor(P,E):null,of=S.local||[0,0,0],T=v=>{let w=applyMesh(v,E,P.bb);if(DF)w=deformPoint(DF,v,w);return S.xf?S.xf(w):w.map((x,k)=>(x+of[k])*(S.scale||1)+S.offset[k])};
for(const t0 of P.tris){const ord=S.flip?[0,2,1]:[0,1,2],t={c:t0.c,v:ord.map(i=>T(t0.v[i]))};if(!gallery)pickTris.push({v:t.v,sym:P.sym});const o=t.c<0?'808080FF':P.cols[t.c].rgba,col=t.c<0?[.5,.5,.5]:hex2(gallery?o:(map[o]||o)),[a,b,c]=t.v;
let n=[(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])];
const l=Math.hypot(...n)||1;n=n.map(x=>x/l);if(!gallery&&hoverSym===P.sym)col.splice(0,3,...col.map(v=>Math.min(1,v*.55+.45)));const vcol=t.c<0&&useVC&&hoverSym!==P.sym;for(const [i,v] of t.v.entries()){d.push(...v,...(vcol?t0.v[ord[i]].c:col),...n);for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],v[k]);mx[k]=Math.max(mx[k],v[k])}}}}
nv=d.length/9;gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(d),gl.STATIC_DRAW);
sceneBounds=nv?[mn,mx]:null;if(nv)sceneRadius=Math.max(1,Math.hypot(...mx.map((v,k)=>(v-mn[k])/2)));if(fit)frameCamera();need();updateFloatingLabels()}
function ui(){const L=$('parts');L.innerHTML='';if(gallery){$('animal-field').style.display='none';$('variant-field').style.display='none';$('edit-side').classList.add('gallery-hidden');$('rom-panel').style.display='none';$('gallery-action').style.margin='8px 0';$('parts-panel').style.display='none';$('palette-panel').style.display='none';$('vc').parentElement.parentElement.style.display='none';$('info').style.display='none';$('mesh').style.display='none';$('actions').style.display='none';return}else{$('animal-field').style.display='';$('variant-field').style.display='';$('edit-side').classList.remove('gallery-hidden');$('rom-panel').style.display='';$('parts-panel').style.display='';$('palette-panel').style.display='';$('vc').parentElement.parentElement.style.display='';$('info').style.display='';$('mesh').style.display='';$('actions').style.display='flex'}
const mk=(t,on,f)=>{const r=document.createElement('button');r.type='button';r.className='row'+(on?' on':'');r.setAttribute('aria-pressed',String(on));r.innerHTML='<span>'+t+'</span>';r.onclick=f;L.appendChild(r)};
const modeTitle=document.createElement('div');modeTitle.className='parts-section-title';modeTitle.textContent='DISPLAY MODES';L.appendChild(modeTitle);
mk('▦  Parts sheet (exploded grid)',sheet,()=>{assembled=false;sheet=!sheet;all=false;if(sheet)SH=sheetLayout(visibleParts());ui();rebuild(true);info()});
if(!demoMode)mk('◈  All parts overlaid (shared origin)',all,()=>{assembled=false;all=!all;sheet=false;ui();rebuild(true);info()});
mk(demoMode?'◉  Assembled creature':'◉  Assembled (needs pose JSON)',demoMode?all:assembled&&poseOk(),()=>{if(demoMode){all=true;sheet=false;ui();rebuild(true);info();return}if(!poseOk()){poseIn.click();return}assembled=!assembled;all=false;sheet=false;ui();rebuild(true);info()});
const hasDef=Object.keys(deform).length;mk('\u25B3  Deform preview: '+(deformOn?'ON':hasDef?'off':demoMode?'use Bend / Twist':'load a config...')+(hasDef&&!demoMode?'  (shift+click = load another)':''),deformOn,e=>{if(demoMode&&!hasDef)return;if(!demoMode&&(e.shiftKey||!hasDef)){defIn.click();return}deformOn=!deformOn;ui();rebuild(false);info()});
const partsTitle=document.createElement('div');partsTitle.className='parts-section-title';partsTitle.textContent='INDIVIDUAL PARTS';L.appendChild(partsTitle);
cur.p.forEach((p,i)=>{
  if(variant&&!(p.v||[]).includes(variant))return;
  mk((demoMode?p.s+' · '+parsed[i].tris.length+' triangles':p.r.toString(16).toUpperCase()+' &nbsp;'+parsed[i].tris.length+' tris &nbsp;j '+p.j)+
    (noOwnColour(parsed[i])?
      ' &nbsp;<i title="No prim colour in this list">vtx col</i>':''),
    !all&&!sheet&&i==sel,
    ()=>{rememberView();assembled=false;sel=i;all=false;sheet=false;ui();rebuild(true);info()});
});
const pal=[...new Set(parsed.flatMap(P=>P.cols.map(c=>c.rgba)))],D=$('pal');D.innerHTML='';
for(const o of pal){const r=document.createElement('div');r.className='row';const cur2=map[o]||o;
r.innerHTML='<div class="sw" style="background:#'+o.slice(0,6)+'"></div><span>'+colourName(o)+' (Original)<br>#'+o.slice(0,6)+(cur2!==o?' → #'+cur2.slice(0,6):'')+'</span>';
const inp=document.createElement('input');inp.type='color';inp.value='#'+cur2.slice(0,6).toLowerCase();
inp.oninput=()=>{const n=inp.value.slice(1).toUpperCase()+o.slice(6);if(n==o)delete map[o];else map[o]=n;rebuild(false)};r.appendChild(inp);D.appendChild(r)}}
function meshUI(){const D=$('mesh');D.innerHTML='';if(gallery)return;const P=parsed[sel];if(all||sheet||!P){D.innerHTML='<h4>Mesh editing</h4><div class="mut">Select an individual part below to edit its scale and position. Choose a part row to enter single-part mode.</div>';return}const sym=cur.p[sel].s,E=mesh[sym]||{s:[1,1,1],m:[0,0,0],o:false};
D.innerHTML='<h4>Mesh edit · '+sym+'</h4><div class="mut">Scale is logarithmic, so 1× sits in the middle. Movement is in the part’s local axes. Changes export as vertex edits.</div>';
const axes=['X','Y','Z'];
for(const [lab,key] of [['Scale','s'],['Move','m']]){const group=document.createElement('div');group.className='mesh-group';group.innerHTML='<div class="mesh-group-title">'+lab+'</div>';
[0,1,2].forEach(k=>{const row=document.createElement('div');row.className='axis-edit';const tag=document.createElement('span');tag.className='axis-tag '+axes[k].toLowerCase();tag.textContent=axes[k];const i=document.createElement('input');i.type='range';const val=document.createElement('span');val.className='axis-value';
if(key==='s'){i.min='-100';i.max='100';i.step='1';i.value=String(Math.round(Math.log10(Math.max(.1,Math.min(10,E.s[k])))*100));val.textContent=E.s[k].toFixed(2)+'×'}else{i.min='-500';i.max='500';i.step='1';i.value=String(E.m[k]);val.textContent=String(E.m[k])}
i.setAttribute('aria-label',lab+' '+axes[k]);i.oninput=()=>{const e=mesh[sym]||(mesh[sym]={s:[1,1,1],m:[0,0,0],o:false});if(key==='s'){e.s[k]=Math.pow(10,Number(i.value)/100);val.textContent=e.s[k].toFixed(2)+'×'}else{e.m[k]=Number(i.value);val.textContent=String(e.m[k])}rebuild(false)};row.append(tag,i,val);group.appendChild(row)});D.appendChild(group)}
const l=document.createElement('label');l.innerHTML='<input type="checkbox"> Scale about bone origin (0,0,0), useful for parts sharing a bone';l.firstChild.checked=!!E.o;
l.firstChild.onchange=()=>{(mesh[sym]||(mesh[sym]={s:[1,1,1],m:[0,0,0],o:false})).o=l.firstChild.checked;rebuild(false)};D.appendChild(l)}
function info(){meshUI();if(gallery){$('info').textContent='Gallery mode: each animal is shown as an exploded parts sheet. These are browsing layouts, not assembled animals.';return}const P=parsed[sel];$('info').innerHTML=all||sheet||!P?'':'Part '+cur.p[sel].s+(noOwnColour(P)?'<br><b>No prim colour</b>: triangles without one use the mesh vertex colours (toggle in the side panel)':'')+'<br>'+P.cols.map(c=>c.rgba+' @'+c.rom.toString(16).toUpperCase()+(map[c.rgba]?' &rarr; '+map[c.rgba]:'')).join('<br>')}
function buildGallery(){
  galleryData=[];galleryLayout=[];
  for(const [animal,A] of Object.entries(TABLE)){
    const B={};for(const k in A.b)B[k]=parseInt(A.b[k],16);
    const parts=A.p.map(p=>Object.assign(readPart(p,B),{sym:p.s,sections:p.v||[],textures:p.t||[]}));
    if(!parts.length)continue;
    galleryData.push({name:animal,parts});galleryLayout.push(gallerySheet(parts));
  }
  // Sheets use comparable thumbnail sizes, not a shared world-unit scale.
  const cols=Math.max(1,Math.ceil(Math.sqrt(galleryData.length)));
  const rows=Math.ceil(galleryData.length/cols),gap=.08,depthStep=.16;
  galleryLayout.forEach((g,i)=>{
    const col=i%cols,row=Math.floor(i/cols);
    g.offset=[col*(1+gap)-g.mn[0],-row*(1+gap)-g.mn[1],(row-(rows-1)/2)*depthStep];
  });
  const L=$('gallery-list');L.innerHTML='';galleryData.forEach((A,i)=>{const r=document.createElement('div');r.className='row';r.innerHTML='<span>'+A.name.charAt(0).toUpperCase()+A.name.slice(1)+' <small>('+A.parts.length+' parts)</small></span>';r.onclick=()=>{setGallery(false);pick(A.name)};L.appendChild(r);const secs=TABLE[A.name].s||[];for(const sec of secs){const sub=document.createElement('div');sub.className='row variant-item';sub.textContent='↳ '+sec.replaceAll('_',' ');sub.onclick=()=>{setGallery(false);pick(A.name);$('variant').value=sec;$('variant').onchange()};L.appendChild(sub)}});
}
function animalEmoji(n){const x=n.toLowerCase();for(const [key,emoji] of [['bear','🐻'],['dog','🐕'],['fox','🦊'],['mouse','🐭'],['rat','🐀'],['penguin','🐧'],['elephant','🐘'],['lion','🦁'],['sheep','🐑'],['camel','🐪'],['turtle','🐢'],['bird','🐦'],['frog','🐸'],['rabbit','🐇'],['hippo','🦛'],['gorilla','🦍'],['fish','🐟'],['hyena','🐕'],['vulture','🦅']])if(x.includes(key))return emoji;return '🐾'}
function setGallery(on){returnMode=null;hoverSym=null;$('back-to-sheet').hidden=true;gallery=on;$('gallery-toggle').textContent=gallery?'← RETURN TO EDITOR':'🖼️ ALL ANIMALS GALLERY';$('gallery-list').style.display=gallery?'block':'none';$('variant').disabled=gallery;$('an').disabled=gallery;$('animal-label').firstChild.textContent=gallery?'Animal Gallery':name.charAt(0).toUpperCase()+name.slice(1);$('variant-label').textContent=gallery?galleryData.length+' animals · exploded parts sheets':(variant||'All Variants');ui();info();rebuild(true)}
function pick(n){returnMode=null;hoverSym=null;$('back-to-sheet').hidden=true;gallery=false;$('gallery-toggle').textContent='🖼️ ALL ANIMALS GALLERY';$('gallery-list').style.display='none';$('variant').disabled=false;$('an').disabled=false;name=n;$('animal-label').firstChild.textContent=n.charAt(0).toUpperCase()+n.slice(1);$('variant-label').textContent='All Variants';cur=TABLE[n];bases={};for(const k in cur.b)bases[k]=parseInt(cur.b[k],16);
parsed=cur.p.map(p=>Object.assign(
  readPart(p,bases),
  {sym:p.s,sections:p.v||[],textures:p.t||[]}
));const V=$('variant');
const sections=cur.s||[];V.innerHTML=sections.length>1?'<option value="">All Variants ✨</option>'+sections.map(s=>'<option value="'+s+'">'+s.replaceAll('_',' ')+' ✦</option>').join(''):'<option value="">'+(sections.length===1?sections[0].replaceAll('_',' '):'No variants')+'</option>';
V.disabled=sections.length<=1;
variant='';
V.value='';
V.onchange=()=>{
  variant=V.value;
  $('variant-label').textContent=variant||'All Variants';
  const i=parsed.findIndex(P=>!variant||P.sections.includes(variant));
  sel=i<0?0:i;
  sheet=true;
  all=false;
  SH=sheetLayout(visibleParts());
  ui();
  rebuild(true);
  info();
};map={};mesh={};deform={};deformOn=false;deformCache.clear();assembled=false;sel=0;all=demoMode;sheet=!demoMode;SH=sheetLayout(visibleParts());$('an').value=n;ui();rebuild(true);info()}
const ROM_DB='sssv-modkit-viewer';
function openRomDB(){return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}
  const req=indexedDB.open(ROM_DB,1);
  req.onupgradeneeded=()=>req.result.createObjectStore('state');
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not open local ROM storage'));
})}
async function saveLastROM(ab,filename){const db=await openRomDB();try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('state','readwrite');tx.objectStore('state').put({buffer:ab,filename},'last-rom');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not save ROM'));
})}finally{db.close()}}
async function getLastROM(){const db=await openRomDB();try{return await new Promise((resolve,reject)=>{
  const req=db.transaction('state','readonly').objectStore('state').get('last-rom');
  req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('Could not read saved ROM'));
})}finally{db.close()}}
async function forgetLastROM(){const db=await openRomDB();try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('state','readwrite');tx.objectStore('state').delete('last-rom');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not clear saved ROM'));
})}finally{db.close()}}
async function loadROM(ab,filename,restored=false){
  if(!Object.keys(romTable).length){$('msg').textContent='Choose your local animal_table.json first.';return false}
  if(ab.byteLength!=0x2000000&&ab.byteLength!=0x1000000&&ab.byteLength<0x800000){$('msg').textContent='That does not look like an N64 ROM.';return false}
  demoMode=false;TABLE=romTable;document.body.classList.remove('demo-mode');dv=new DataView(ab);let ok='';try{const h=[...new Uint8Array(await crypto.subtle.digest('SHA-1',ab))].map(x=>x.toString(16).padStart(2,'0')).join('');
    ok=h=='e5e09205aa743a9e5043a42df72adc379c746b0b'?'SHA1 matches US 1.0.':'WARNING: not the unmodified US 1.0 ROM (a patched ROM is fine for previewing).'}catch(_){}
  $('msg').textContent=(restored?'Restored saved ROM: ':'')+filename+' loaded. '+ok;
  $('rom-panel').open=false;
  const A=$('an');A.innerHTML=Object.keys(TABLE).map(n=>'<option value="'+n+'">'+n.charAt(0).toUpperCase()+n.slice(1)+' '+animalEmoji(n)+'</option>').join('');A.disabled=false;A.onchange=()=>pick(A.value);buildGallery();$('gallery-toggle').disabled=false;$('gallery-toggle').onclick=()=>setGallery(!gallery);$('forget-rom').disabled=false;
  // Pick and render immediately; no extra click is needed after loading/restoring.
  pick(Object.keys(TABLE)[0]);return true;
}
$('rom').onchange=async e=>{const f=e.target.files[0];if(!f)return;const ab=await f.arrayBuffer();
  try{if(await loadROM(ab,f.name)&&$('remember-rom').checked){try{await saveLastROM(ab,f.name);$('msg').textContent+=' Last ROM saved in this browser.'}catch(err){$('msg').textContent+=' Could not save a local copy for next time: '+err.message}}}catch(err){$('msg').textContent='Could not render ROM with that table: '+err.message}
};
$('forget-rom').onclick=async()=>{try{await forgetLastROM();$('forget-rom').disabled=true;$('msg').textContent='Saved ROM forgotten. The currently loaded ROM remains available until you close this page.'}catch(err){$('msg').textContent='Could not clear saved ROM: '+err.message}};
if(Object.keys(romTable).length)(async()=>{try{const saved=await getLastROM();if(saved&&saved.buffer){$('msg').textContent='Restoring your last ROM from this browser…';await loadROM(saved.buffer,saved.filename||'last ROM',true);$('forget-rom').disabled=false}}catch(err){$('msg').textContent='Choose your ROM file to begin. Local auto-restore is unavailable in this browser: '+err.message}})();
const themeModes=['system','light','dark','matrix','dracula','dracula-deep'];
function setTheme(mode){
  if(!themeModes.includes(mode))mode='system';
  document.documentElement.dataset.theme=mode;
  $('theme-select').value=mode;
  try{localStorage.setItem('sssv-viewer-theme',mode)}catch(_){}
}
let themeMode='system';
try{const savedTheme=localStorage.getItem('sssv-viewer-theme');if(themeModes.includes(savedTheme))themeMode=savedTheme}catch(_){}
setTheme(themeMode);
$('theme-select').onchange=()=>setTheme($('theme-select').value);
$('vc').onchange=()=>{useVC=$('vc').checked;rebuild(false)};
$('rst').onclick=()=>{map={};mesh={};deform={};deformOn=false;deformCache.clear();partOffsets[name]={};ui();rebuild(true);info()};
$('exp').onclick=()=>{if(!cur)return;const r={};for(const o in map)r[o]=map[o].slice(6)==o.slice(6)?map[o].slice(0,6):map[o];
const ms=Object.keys(mesh).filter(k=>mesh[k].s.some(x=>x!=1)||mesh[k].m.some(x=>x!=0)||mesh[k].o).map(k=>(o=>{if(mesh[k].o)o.about=[0,0,0];return o})({symbol:k,scale:mesh[k].s,move:mesh[k].m})),o={animal:name,recolor:r};if(ms.length)o.mesh=ms;
const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(o,null,2)],{type:'application/json'}));a.download=name+'.json';a.click()};
$('imp').onclick=()=>$('impf').click();
// Render a transparent square directly from the current WebGL geometry. Restore
// the viewport and camera synchronously so exporting does not change the view.
$('save-icon').onclick=()=>{
  if(!nv)return;
  const saved={width:cv.style.width,height:cv.style.height,dist,ctr};
  let png;
  try{
    cv.style.width='256px';cv.style.height='256px';frameCamera();draw([1024,1024]);
    const image=document.createElement('canvas');image.width=image.height=1024;
    const ctx=image.getContext('2d');ctx.drawImage(cv,0,0);
    const pixels=ctx.getImageData(0,0,1024,1024).data;
    let left=1024,top=1024,right=-1,bottom=-1;
    for(let y=0;y<1024;y++)for(let x=0;x<1024;x++)if(pixels[(y*1024+x)*4+3]){
      left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);
    }
    if(right<left)return;
    const side=Math.max(right-left+1,bottom-top+1)/.88;
    const output=document.createElement('canvas');output.width=output.height=256;
    output.getContext('2d').drawImage(image,(left+right+1-side)/2,(top+bottom+1-side)/2,side,side,0,0,256,256);
    png=output.toDataURL('image/png');
  }finally{
    cv.style.width=saved.width;cv.style.height=saved.height;dist=saved.dist;ctr=saved.ctr;need();
  }
  const bytes=Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0));
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
  a.download=(name||'viewer')+'-icon.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$('impf').onchange=async e=>{if(gallery)return;const f=e.target.files[0];if(!f||!dv)return;const c=JSON.parse(await f.text());if(!TABLE[c.animal])return;pick(c.animal);
for(const o in c.recolor||{}){const k=o.toUpperCase(),n=c.recolor[o].toUpperCase();map[k]=n.length==6?n+k.slice(6):n}for(const m of c.mesh||[])mesh[m.symbol]={s:m.scale||[1,1,1],m:m.move||[0,0,0],o:!!m.about&&m.about.every(x=>x==0)};ui();rebuild(false);info()};
// CPU-side screen-space triangle picking. Uses the same MVP as the renderer,
// then chooses the frontmost triangle under the click (depth interpolation).
function pickPart(clientX,clientY){
  if(gallery||!pickTris.length||!cv.clientWidth||!cv.clientHeight)return null;
  const R=cameraRotation(),V=mul(tr(0,0,-dist),mul(R,tr(-ctr[0],-ctr[1],-ctr[2])));
  const M=mul(projection(),V);
  const rect=cv.getBoundingClientRect(),px=(clientX-rect.left)/rect.width*2-1,py=1-(clientY-rect.top)/rect.height*2;
  const proj=v=>{const x=v[0],y=v[1],z=v[2],w=M[3]*x+M[7]*y+M[11]*z+M[15];if(w<=0)return null;return [(M[0]*x+M[4]*y+M[8]*z+M[12])/w,(M[1]*x+M[5]*y+M[9]*z+M[13])/w,(M[2]*x+M[6]*y+M[10]*z+M[14])/w]};
  let best=null,depth=Infinity;
  for(const t of pickTris){const q=t.v.map(proj);if(q.some(x=>!x))continue;
    const [a,b,c]=q,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-12)continue;
    const u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den;
    const v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den;
    if(u<0||v<0||u+v>1)continue;
    const z=u*a[2]+v*b[2]+(1-u-v)*c[2];if(z<depth){depth=z;best=t.sym}
  }return best;
}
function inspectPartAt(x,y){const sym=pickPart(x,y);if(!sym)return;selectedSym=sym;const el=$('part-inspector');el.hidden=false;$('part-symbol').textContent=sym;$('part-name').value=partNames[name]?.[sym]||'';el.style.left='auto';el.style.right='12px';}
$('part-name').oninput=e=>{if(!selectedSym)return;(partNames[name]||(partNames[name]={}))[selectedSym]=e.target.value;saveViewerPrefs();updateFloatingLabels();};
function rememberView(){if(!gallery&&cur)returnMode={sheet,all,variant,sel}}
function selectMeshAt(x,y){const sym=pickPart(x,y);if(!sym)return;const i=parsed.findIndex(P=>P.sym===sym);if(i<0)return;
  if(sheet||all)returnMode={sheet,all,variant,sel};else if(!returnMode)returnMode={sheet:true,all:false,variant,sel};
  sel=i;all=false;sheet=false;hoverSym=null;$('hover-part').style.display='none';$('back-to-sheet').hidden=false;$('part-inspector').hidden=true;ui();rebuild(true);info();}
$('back-to-sheet').onclick=()=>{$('back-to-sheet').hidden=true;if(returnMode){({sheet,all,sel}=returnMode);returnMode=null}else{sheet=true;all=false}if(sheet)SH=sheetLayout(visibleParts());ui();rebuild(true);info()};
function hoverAt(x,y){if(dr||gallery||!sheet&&!all){if(hoverSym){hoverSym=null;rebuild(false)}$('hover-part').style.display='none';cv.style.cursor='grab';return}
  const next=pickPart(x,y);if(next!==hoverSym){hoverSym=next;rebuild(false)}
  const tip=$('hover-part');tip.style.display=next?'block':'none';if(next){tip.textContent=partNames[name]?.[next] ? partNames[name][next]+' · '+next : next;const r=cv.getBoundingClientRect();tip.style.left=Math.min(r.width-120,x-r.left+12)+'px';tip.style.top=Math.max(5,y-r.top-24)+'px'}cv.style.cursor=next?'pointer':'grab';}
cv.addEventListener('pointerleave',()=>{hoverSym=null;$('hover-part').style.display='none';rebuild(false)});

function cameraView(view){
  held.clear();roll=0;
  [yaw,pit]=({front:[0,0],right:[-Math.PI/2,0],top:[0,Math.PI/2],reset:[0,-Math.PI/4]})[view];
  frameCamera();
}
$('camera-reset').onclick=()=>cameraView('reset');
$('camera-fit').onclick=frameCamera;
for(const view of ['front','right','top'])$('camera-'+view).onclick=()=>cameraView(view);
$('camera-in').onclick=()=>zoomCamera(-.2);
$('camera-out').onclick=()=>zoomCamera(.2);
$('camera-roll-left').onclick=()=>{roll-=Math.PI/12;need()};
$('camera-roll-right').onclick=()=>{roll+=Math.PI/12;need()};
let dr=null;
const pointers=new Map();let gesture=null;
cv.oncontextmenu=e=>e.preventDefault();
cv.onpointerdown=e=>{
  if(e.pointerType!=='touch'&&e.button>2)return;
  cv.focus();e.preventDefault();cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,[e.clientX,e.clientY]);
  if(pointers.size>1){const [a,b]=[...pointers.values()];gesture={x:(a[0]+b[0])/2,y:(a[1]+b[1])/2,d:Math.hypot(a[0]-b[0],a[1]-b[1])};dr=null;return}
  const modified=e.shiftKey||e.ctrlKey||e.metaKey;
  const movePart=e.pointerType!=='touch'&&!modified&&sheet&&(e.altKey||e.button===(moveButton==='left'?0:moveButton==='right'?2:-1));
  const sym=movePart?pickPart(e.clientX,e.clientY):null;
  dr={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false,
    mode:sym?'part':e.button===1?'zoom':e.button===2||modified?'pan':'orbit',sym,
    inspect:e.button===0&&!modified&&!e.altKey};
};
function endPointer(e){
  pointers.delete(e.pointerId);
  if(dr&&dr.id===e.pointerId&&e.type==='pointerup'&&!dr.moved&&dr.inspect)inspectPartAt(e.clientX,e.clientY);
  dr=null;gesture=null;cv.style.cursor='grab';
  if(cv.hasPointerCapture(e.pointerId))cv.releasePointerCapture(e.pointerId);
}
cv.onpointerup=endPointer;cv.onpointercancel=endPointer;
cv.onlostpointercapture=e=>{pointers.delete(e.pointerId);dr=null;gesture=null};
cv.ondblclick=e=>{if(!e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey)selectMeshAt(e.clientX,e.clientY)};
cv.onpointermove=e=>{
  if(pointers.has(e.pointerId))pointers.set(e.pointerId,[e.clientX,e.clientY]);
  if(gesture&&pointers.size>1){
    const [a,b]=[...pointers.values()],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,d=Math.hypot(a[0]-b[0],a[1]-b[1]);
    if(d>0&&gesture.d>0)zoomCamera(Math.log(gesture.d/d));
    panCamera(x-gesture.x,y-gesture.y);gesture={x,y,d};return;
  }
  if(!dr){if(!pointers.size)hoverAt(e.clientX,e.clientY);return}
  if(e.pointerId!==dr.id)return;
  // A click must not nudge either the camera or a part.
  if(!dr.moved&&Math.hypot(e.clientX-dr.startX,e.clientY-dr.startY)<5)return;
  dr.moved=true;cv.style.cursor='grabbing';
  const dx=e.clientX-dr.x,dy=e.clientY-dr.y;
  if(dr.mode==='part'){
    const offsets=partOffsets[name]||(partOffsets[name]={}),o=offsets[dr.sym]||(offsets[dr.sym]=[0,0,0]);
    const delta=cameraPlaneDelta(cameraRotation(),dist,cv.clientHeight,dx,dy);
    for(let k=0;k<3;k++)o[k]+=delta[k];rebuild(false);
  }else if(dr.mode==='pan')panCamera(dx,dy);
  else if(dr.mode==='zoom')zoomCamera(dy*.01);
  else{const speed=2*Math.PI/Math.max(1,cv.clientHeight);yaw-=dx*speed;pit=Math.max(-Math.PI/2,Math.min(Math.PI/2,pit+dy*speed));need()}
  dr.x=e.clientX;dr.y=e.clientY;
};
cv.addEventListener('wheel',e=>{e.preventDefault();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?cv.clientHeight:1);zoomCamera(pixels*.001)},{passive:false});
new ResizeObserver(need).observe(cv);addEventListener('resize',need);need();

// Resizable sidebars: drag the handles, or use arrow keys when focused.
(function(){let active=null;const root=document.body;
  function setWidth(which,value){const w=Math.max(which==='left'?185:220,Math.min(Math.round(value),window.innerWidth-400));root.style.setProperty(which==='left'?'--left-width':'--right-width',w+'px');need();}
  for(const [id,which] of [['resize-left','left'],['resize-right','right']]){const el=$(id);
    el.addEventListener('pointerdown',e=>{active={which,start:e.clientX,left:$('side').getBoundingClientRect().width,right:$('edit-side').getBoundingClientRect().width};el.setPointerCapture(e.pointerId);el.classList.add('resizing');e.preventDefault()});
    el.addEventListener('pointermove',e=>{if(!active)return;const delta=e.clientX-active.start;setWidth(which,which==='left'?active.left+delta:active.right-delta)});
    const stop=()=>{active=null;el.classList.remove('resizing')};el.addEventListener('pointerup',stop);el.addEventListener('pointercancel',stop);
    el.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const current=which==='left'?$('side').getBoundingClientRect().width:$('edit-side').getBoundingClientRect().width;setWidth(which,current+(e.key==='ArrowRight'?1:-1)*(which==='left'?16:-16))});
  }
})();
// Fly-through navigation is active only while the 3D canvas has focus.
const held=new Set();let lastFrame=0;
cv.tabIndex=0;
cv.addEventListener('pointerdown',()=>cv.focus());
cv.setAttribute('aria-label','3D viewport. Drag to orbit, Shift drag to pan, wheel to zoom. F frames the scene; Home resets the camera.');
cv.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase();
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(['w','a','s','d','q','e',' ','shift'].includes(k)){held.add(k);e.preventDefault();return}
  const actions={f:frameCamera,home:()=>cameraView('reset'),'1':()=>cameraView('front'),'3':()=>cameraView('right'),'7':()=>cameraView('top'),'+':()=>zoomCamera(-.15),'=':()=>zoomCamera(-.15),'-':()=>zoomCamera(.15),arrowleft:()=>panCamera(-32,0),arrowright:()=>panCamera(32,0),arrowup:()=>panCamera(0,-32),arrowdown:()=>panCamera(0,32)};
  if(actions[k]){e.preventDefault();actions[k]()}
});
cv.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));
cv.addEventListener('blur',()=>held.clear());window.addEventListener('blur',()=>held.clear());
function flyFrame(t){const dt=Math.min((t-lastFrame)/1000||0,.06);lastFrame=t;
  if(held.size&&dv){if(held.has('q')!==held.has('e')){roll+=(held.has('e')?1:-1)*dt*1.25;need()}const speed=dist*.55*dt*(held.has('shift')?3:1),R=cameraRotation(),f=[R[2],R[6],R[10]],r=[R[0],R[4],R[8]],up=[R[1],R[5],R[9]];let move=[0,0,0];
    for(const [key,vec,sign] of [['w',f,-1],['s',f,1],['a',r,-1],['d',r,1],[' ',up,1]])if(held.has(key))for(let k=0;k<3;k++)move[k]+=vec[k]*sign;
    const len=Math.hypot(...move);if(len){for(let k=0;k<3;k++)ctr[k]+=move[k]/len*speed;need()}
  }requestAnimationFrame(flyFrame)
}requestAnimationFrame(flyFrame);

// Viewer-only annotations and layout offsets: never write to the ROM.
function saveViewerPrefs(){try{localStorage.setItem('sssv-viewer-annotations-v1',JSON.stringify({partNames,partOffsets,labelOffsets}))}catch(_){}}
try{const p=JSON.parse(localStorage.getItem('sssv-viewer-annotations-v1')||'{}');partNames=p.partNames||{};partOffsets=p.partOffsets||{};labelOffsets=p.labelOffsets||{}}catch(_){}
$('part-name').addEventListener('change',saveViewerPrefs);
$('part-name-ok').onclick=()=>{$('part-inspector').hidden=true;saveViewerPrefs()};
$('part-name').addEventListener('keydown',e=>{if(e.key==='Enter'){$('part-name-ok').click();cv.focus()}});
cv.addEventListener('pointerup',()=>saveViewerPrefs());
$('grid-toggle').onchange=e=>{showGrid=e.target.checked;$('view').classList.toggle('show-grid',showGrid)};
$('move-button').onchange=e=>{moveButton=e.target.value};
$('labels-toggle').onchange=e=>{showLabels=e.target.checked;updateFloatingLabels()};
$('background-color').oninput=e=>{backgroundOverride=e.target.value;$('view').style.background=backgroundOverride};
function updateFloatingLabels(){const host=$('floating-labels');if(!showLabels||gallery||!dv){host.replaceChildren();return}const R=cameraRotation(),V=mul(tr(0,0,-dist),mul(R,tr(-ctr[0],-ctr[1],-ctr[2]))),M=mul(projection(),V);host.replaceChildren();for(const P of shown()){if(!P||P.bb[0]>P.bb[3])continue;const b=P.viewBB||P.bb,of=sheet?(SH[P.sym]||[0,0,0]).map((v,k)=>v+(partOffsets[name]?.[P.sym]?.[k]||0)):[0,0,0];const q=[0,1,2].map(k=>(b[k]+b[k+3])/2+of[k]);const w=M[3]*q[0]+M[7]*q[1]+M[11]*q[2]+M[15];if(w<=0)continue;const x=(M[0]*q[0]+M[4]*q[1]+M[8]*q[2]+M[12])/w,y=(M[1]*q[0]+M[5]*q[1]+M[9]*q[2]+M[13])/w;if(Math.abs(x)>1||Math.abs(y)>1)continue;const label=document.createElement('span');label.textContent=partNames[name]?.[P.sym]||P.sym;const shift=labelOffsets[name]?.[P.sym]||[0,0];label.style.left=`calc(${(x+1)*50}% + ${shift[0]}px)`;label.style.top=`calc(${(1-y)*50}% + ${shift[1]}px)`;label.dataset.sym=P.sym;label.dataset.baseX=(x+1)*50;label.dataset.baseY=(1-y)*50;host.appendChild(label)}}
$('collapse-left').onclick=()=>document.body.classList.toggle('left-collapsed');
$('collapse-right').onclick=()=>document.body.classList.toggle('right-collapsed');

// Drag labels independently of the geometry. Pixel offsets are viewer-only annotations.
let labelDrag=null;
$('floating-labels').addEventListener('pointerdown',e=>{const el=e.target.closest('span[data-sym]');if(!el)return;e.preventDefault();e.stopPropagation();labelDrag={sym:el.dataset.sym,x:e.clientX,y:e.clientY,el};el.setPointerCapture(e.pointerId)});
$('floating-labels').addEventListener('pointermove',e=>{if(!labelDrag)return;const {sym,el}=labelDrag,off=(labelOffsets[name]||(labelOffsets[name]={}))[sym]||[0,0];off[0]+=e.clientX-labelDrag.x;off[1]+=e.clientY-labelDrag.y;labelDrag.x=e.clientX;labelDrag.y=e.clientY;el.style.left=`calc(${parseFloat(el.dataset.baseX||"0")}% + ${off[0]}px)`;el.style.top=`calc(${parseFloat(el.dataset.baseY||"0")}% + ${off[1]}px)`;});
$('floating-labels').addEventListener('pointerup',()=>{if(labelDrag){labelDrag=null;saveViewerPrefs();updateFloatingLabels()}});
$('floating-labels').addEventListener('pointercancel',()=>{labelDrag=null;updateFloatingLabels()});
