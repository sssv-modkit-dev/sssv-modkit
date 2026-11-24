document.addEventListener('click',e=>{const button=e.target.closest('#level-network-ok');if(button)button.closest('details').hidden=true;});
function startLevelEditor(data){
// Replacing the demo or reopening a scene must retire its touch/keyboard handlers and render loop.
startLevelEditor.controller?.abort();
const controller=startLevelEditor.controller=new AbortController();
function listen(target,type,handler,options={}){target.addEventListener(type,handler,{...(typeof options==='boolean'?{capture:options}:options),signal:controller.signal});}
const {ANIM,MODEL,TBL,ATLAS,LEVELS,EDITOR_STOCK,EDITOR_SHA1}=data;


const $=id=>document.getElementById(id);
const cv=$('c'),attributes={antialias:true,alpha:false};
const gl2=cv.getContext('webgl2',attributes),gl=gl2||cv.getContext('webgl',attributes);
if(!gl){throw Error('WebGL is unavailable. Enable hardware acceleration or try another browser.');}
const largeIndices=gl2||gl.getExtension('OES_element_index_uint');
function dec(s,T){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return new T(u.buffer);}
function prog(vs,fs){
 const p=gl.createProgram();
 if(gl2){
  vs='#version 300 es\n'+vs.replaceAll('attribute ','in ').replaceAll('varying ','out ');
  fs='#version 300 es\nout highp vec4 outputColor;\n'+fs.replaceAll('varying ','in ').replaceAll('texture2D(','texture(').replaceAll('gl_FragColor','outputColor');
 }
 for(const[t,s]of[[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){
  const shader=gl.createShader(t);gl.shaderSource(shader,s);gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));
  gl.attachShader(p,shader);gl.deleteShader(shader);
 }
 gl.linkProgram(p);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
 return p;
}
// Reuse the same 512px star tile and camera offsets as the CSS backdrop.
const skyProgram=prog('attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}',
 'precision highp float;uniform sampler2D tile;uniform vec2 offset;uniform float height;void main(){vec2 p=vec2(gl_FragCoord.x,height-gl_FragCoord.y);gl_FragColor=texture2D(tile,(p-offset)/512.);}');
const skyPosition=gl.getAttribLocation(skyProgram,'p'),skyOffset=gl.getUniformLocation(skyProgram,'offset'),skyHeight=gl.getUniformLocation(skyProgram,'height');
const skyBuffer=buf(new Float32Array([-1,-1,3,-1,-1,3])),skyTexture=gl.createTexture();
{
 const tile=document.createElement('canvas');tile.width=tile.height=512;
 const ctx=tile.getContext('2d');ctx.fillStyle='#050509';ctx.fillRect(0,0,512,512);
 for(let i=0;i<180;i++){const b=Math.random()<.08?.85:.55+Math.random()*.15,r=Math.random()<.25?2:1;
  ctx.fillStyle='rgba(255,255,255,'+b+')';ctx.fillRect(Math.floor(Math.random()*512),Math.floor(Math.random()*512),r,r);}
 gl.bindTexture(gl.TEXTURE_2D,skyTexture);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,tile);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
}
function drawSky(){
 gl.disable(gl.DEPTH_TEST);
 gl.useProgram(skyProgram);
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,skyTexture);
 gl.uniform2fv(skyOffset,LevelSelection.skyOffset(cam,cv.height));
 gl.uniform1f(skyHeight,cv.height);
 gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.enableVertexAttribArray(skyPosition);
 gl.vertexAttribPointer(skyPosition,2,gl.FLOAT,false,0,0);
 gl.drawArrays(gl.TRIANGLES,0,3);
 gl.disableVertexAttribArray(skyPosition);
 gl.enable(gl.DEPTH_TEST);
}
const P=prog('attribute vec3 p;attribute vec3 c;uniform mat4 m;uniform float ps;varying vec3 v;void main(){v=c;gl_Position=m*vec4(p,1.);gl_PointSize=ps;}',
 'precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.);}');
const instances=gl2?prog(
 'attribute vec3 p;attribute vec3 c;attribute vec3 origin;attribute vec2 turn;uniform mat4 m;uniform float scale;varying vec3 v;void main(){vec2 xy=vec2(p.x*turn.x-p.y*turn.y,p.x*turn.y+p.y*turn.x);v=c;gl_Position=m*vec4(origin+vec3(xy,p.z)*scale,1.);}',
 'precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.);}'):null;
const modelBuffers=new Map();
const instanceLocations=instances&&{
 p:gl.getAttribLocation(instances,'p'),c:gl.getAttribLocation(instances,'c'),
 origin:gl.getAttribLocation(instances,'origin'),turn:gl.getAttribLocation(instances,'turn'),
 m:gl.getUniformLocation(instances,'m'),scale:gl.getUniformLocation(instances,'scale')
};
function appendInstance(groups,model,x,y,z,ca,sa){
 let transforms=groups.get(model);
 if(!transforms){transforms=[];groups.set(model,transforms);}
 transforms.push(x,y,z,ca,sa);
}
function createBatches(groups,scale){
 const batches=[];
 for(const [model,transforms] of groups){
  let geometry=modelBuffers.get(model);
  if(!geometry){
   const positions=model.p instanceof Int16Array?model.p:Float32Array.from(model.p);
   geometry={p:buf(positions),c:buf(Uint8Array.from(model.c)),type:positions instanceof Int16Array?gl.SHORT:gl.FLOAT};
   modelBuffers.set(model,geometry);
  }
  const p=buf(Float32Array.from(transforms)),vao=gl.createVertexArray();
  gl.bindVertexArray(vao);
  for(const [loc,buffer,size,type,normalized,stride,offset,divisor] of [
   [instanceLocations.p,geometry.p,3,geometry.type,false,0,0,0],
   [instanceLocations.c,geometry.c,3,gl.UNSIGNED_BYTE,true,0,0,0],
   [instanceLocations.origin,p,3,gl.FLOAT,false,20,0,1],
   [instanceLocations.turn,p,2,gl.FLOAT,false,20,12,1]
  ]){
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(loc);
   gl.vertexAttribPointer(loc,size,type,normalized,stride,offset);gl.vertexAttribDivisor(loc,divisor);
  }
  batches.push({p,vao,count:transforms.length/5,n:model.n,scale:scale??model.scale});
 }
 gl.bindVertexArray(null);
 return batches;
}
function drawBatches(batches){
 if(!batches?.length)return;
 gl.useProgram(instances);gl.uniformMatrix4fv(instanceLocations.m,false,M);
 for(const batch of batches){
  gl.bindVertexArray(batch.vao);gl.uniform1f(instanceLocations.scale,batch.scale);
  gl.drawArraysInstanced(gl.TRIANGLES,0,batch.n,batch.count);
 }
 gl.bindVertexArray(null);gl.useProgram(P);
}
// The array repeats inside each tile. The WebGL 1 atlas needs explicit taps
// to avoid blending into an adjacent tile at the wrap boundary.
const tileSampling=gl2?
 'uniform highp sampler2DArray tx;vec3 tileColor(vec2 q,float k){return texture(tx,vec3(q/32.,k)).rgb;}':
 'uniform sampler2D tx;vec3 tap(vec2 o,vec2 i){return texture2D(tx,(o+mod(i,32.)+.5)/vec2(256.,128.)).rgb;}'+
 'vec3 tileColor(vec2 q,float k){vec2 o=vec2(mod(k,8.),floor(k/8.))*32.;vec2 p=q-.5,i=floor(p),f=p-i;'+
 'return mix(mix(tap(o,i),tap(o,i+vec2(1.,0.)),f.x),mix(tap(o,i+vec2(0.,1.)),tap(o,i+vec2(1.,1.)),f.x),f.y);}';
const T=prog('attribute vec3 p;attribute vec3 c;attribute vec2 uv;attribute float sl;attribute float wa;uniform mat4 m;uniform float fd;varying vec3 v;varying vec2 q;varying float s;varying float w;varying float dz;void main(){v=c;q=uv;s=sl;w=wa;gl_Position=m*vec4(p,1.);dz=gl_Position.w/fd;}',
 'precision highp float;uniform float up;uniform bool mixedAlpha;uniform vec3 hz;varying vec3 v;varying vec2 q;varying float s;varying float w;varying float dz;'+tileSampling+
 'void main(){bool wt=up>.5;if(mixedAlpha&&((w<.999)!=wt))discard;float al=wt?.35+.65*w:1.;vec3 c=s>200.?v:tileColor(q,clamp(floor(s+.5),0.,31.))*v*1.25;'+
 'float h=clamp(dz,0.,1.);gl_FragColor=vec4(mix(c,hz,h*h*.55),al);}');
const tP=gl.getAttribLocation(T,'p'),tC=gl.getAttribLocation(T,'c'),tU=gl.getAttribLocation(T,'uv'),tS=gl.getAttribLocation(T,'sl'),tW=gl.getAttribLocation(T,'wa'),tM=gl.getUniformLocation(T,'m'),tUp=gl.getUniformLocation(T,'up'),tHz=gl.getUniformLocation(T,'hz'),tFd=gl.getUniformLocation(T,'fd'),tMixed=gl.getUniformLocation(T,'mixedAlpha');
const atlasTarget=gl2?gl.TEXTURE_2D_ARRAY:gl.TEXTURE_2D,TEX={};
function atlasTex(key){
 if(TEX[key])return TEX[key];
 const texture=gl.createTexture();gl.bindTexture(atlasTarget,texture);
 const grey=new Uint8Array([128,128,128,255]);
 if(gl2){
  const placeholder=new Uint8Array(32*4);for(let i=0;i<placeholder.length;i+=4)placeholder.set(grey,i);
  gl.texImage3D(atlasTarget,0,gl.RGBA8,1,1,32,0,gl.RGBA,gl.UNSIGNED_BYTE,placeholder);
 }else gl.texImage2D(atlasTarget,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,grey);
 const filter=gl2?gl.LINEAR:gl.NEAREST,wrap=gl2?gl.REPEAT:gl.CLAMP_TO_EDGE;
 for(const [name,value] of [[gl.TEXTURE_MIN_FILTER,filter],[gl.TEXTURE_MAG_FILTER,filter],[gl.TEXTURE_WRAP_S,wrap],[gl.TEXTURE_WRAP_T,wrap]])gl.texParameteri(atlasTarget,name,value);
 const image=new Image();
 image.onload=()=>{
  if(controller.signal.aborted)return;
  gl.bindTexture(atlasTarget,texture);
  gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  if(gl2){
   const tile=document.createElement('canvas');tile.width=tile.height=32;
   const ctx=tile.getContext('2d',{willReadFrequently:true});
   gl.texImage3D(atlasTarget,0,gl.RGBA8,32,32,32,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
   for(let i=0;i<32;i++){
    ctx.clearRect(0,0,32,32);ctx.drawImage(image,(i%8)*32,(i>>3)*32,32,32,0,0,32,32);
    gl.texSubImage3D(atlasTarget,0,0,0,i,32,32,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(ctx.getImageData(0,0,32,32).data.buffer));
   }
  }else gl.texImage2D(atlasTarget,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
  requestRender();
 };
 image.src=ATLAS[key];
 return TEX[key]=texture;
}
const aP=gl.getAttribLocation(P,'p'),aC=gl.getAttribLocation(P,'c'),uM=gl.getUniformLocation(P,'m'),uS=gl.getUniformLocation(P,'ps');
function buf(a){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);return b;}
const terrainStride=24;
function bindTerrain(o){
 gl.bindBuffer(gl.ARRAY_BUFFER,o.p);
 for(const [loc,size,type,normalized,offset] of [
  [tP,3,gl.FLOAT,false,0],[tU,2,gl.SHORT,false,12],[tC,3,gl.UNSIGNED_BYTE,true,16],
  [tS,1,gl.UNSIGNED_BYTE,false,19],[tW,1,gl.UNSIGNED_BYTE,true,20]
 ]){
  gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,type,normalized,terrainStride,offset);
 }
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,o.index||null);
}
function createTerrain(positions,colours,level){
 const n=level.n,uv=dec(level.uv,Int16Array),slots=dec(level.sl,Uint8Array),alpha=dec(level.wat,Uint8Array);
 const packed=new ArrayBuffer(n*terrainStride),floats=new Float32Array(packed),
       shorts=new Int16Array(packed),bytes=new Uint8Array(packed);
 for(let i=0;i<n;i++){
  floats.set(positions.subarray(i*3,i*3+3),i*6);
  shorts.set(uv.subarray(i*2,i*2+2),i*12+6);
  bytes.set(colours.subarray(i*3,i*3+3),i*terrainStride+16);
  bytes[i*terrainStride+19]=slots[i];bytes[i*terrainStride+20]=alpha[i];
 }
 const o={p:buf(bytes),c:gl.createBuffer(),n,stride:terrainStride,tx:atlasTex(level.tex),mixed:true};
 if(n<=65535||largeIndices){
  const Index=n<=65535?Uint16Array:Uint32Array,opaque=[],water=[];
  o.mixed=false;
  for(let i=0;i<n;i+=3){
   const solids=Number(alpha[i]===255)+Number(alpha[i+1]===255)+Number(alpha[i+2]===255);
   if(solids)opaque.push(i,i+1,i+2);
   if(solids<3)water.push(i,i+1,i+2);
   if(solids===1||solids===2)o.mixed=true;
  }
  const indices=new Index(opaque.length+water.length);
  indices.set(opaque);indices.set(water,opaque.length);
  o.index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,o.index);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);
  o.indexType=n<=65535?gl.UNSIGNED_SHORT:gl.UNSIGNED_INT;
  o.opaqueCount=opaque.length;o.waterCount=water.length;o.waterOffset=opaque.length*Index.BYTES_PER_ELEMENT;
 }
 if(gl2){o.vao=gl.createVertexArray();gl.bindVertexArray(o.vao);bindTerrain(o);gl.bindVertexArray(null);}
 return o;
}
function drawTerrainRange(water){
 gl.uniform1f(tUp,water?1:0);
 if(mesh.index){
  const count=water?mesh.waterCount:mesh.opaqueCount;
  if(count)gl.drawElements(gl.TRIANGLES,count,mesh.indexType,water?mesh.waterOffset:0);
 }else gl.drawArrays(gl.TRIANGLES,0,mesh.n);
}
function deleteBuffers(...objects){
 for(const object of objects)if(object){
  for(const key of ['p','c','index'])if(object[key])gl.deleteBuffer(object[key]);
  if(object.vao)gl.deleteVertexArray(object.vao);
  if(object.batches)deleteBuffers(...object.batches);
 }
}
function hue(t){const h=((t*47)%360)/60,x=1-Math.abs(h%2-1);const r=[[1,x,0],[x,1,0],[0,1,x],[0,x,1],[x,0,1],[1,0,x]][Math.floor(h)%6];return r;}
const AMOD={};for(const k in ANIM.models){const m=ANIM.models[k],n=m.p.length/3;let top=-1e9,hx=0,hy=0;for(let i=0;i<m.p.length;i+=3){hx=Math.max(hx,Math.abs(m.p[i]));hy=Math.max(hy,Math.abs(m.p[i+1]));top=Math.max(top,m.p[i+2]);}AMOD[k]={p:m.p,c:m.c,n,top,hx,hy,scale:m.scale||.3,label:m.label||'approximate animal model'};}
const MODELS={};for(const k in MODEL){const m=MODEL[k];MODELS[k]={p:dec(m.p,Int16Array),c:dec(m.c,Uint8Array),n:m.n,zmin:m.zmin};}
let EYE=[0,0,0],BX=[1,0,0],BY=[0,1,0],BZ=[0,0,1],ASP=1;
let bxs,bxo,bxl,bxlo,msh,bxs0,L,mesh,lines,grid,spw,cam={yaw:.6,pitch:.8,d:8000,t:[2048,3072,0]},sel=-1;
const mul=(a,b)=>{const o=new Float32Array(16);for(let i=0;i<4;i++)for(let j=0;j<4;j++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+j]*b[i*4+k];o[i*4+j]=s;}return o;};
function tcell(x,y){const gx=Math.max(0,Math.min(64,Math.round((x-256)/64))),gy=Math.max(0,Math.min(96,Math.round((y-512)/64)));return [gx,gy,L.tile[gx*97+gy]];}
function walk(t){return L.bt[t*12]!=0;}
function tcol(t,m){if(m==1)return walk(t)?[.15,.85,.2]:[.95,.1,.1];const h=hue(t*3+1);return t==0?[.5,.5,.5]:h;}
function recolor(){const m=+$('gm').value%3,n=L.n,pf=L.pf,out=new Float32Array(n*3);
 for(let k=0;k<n;k++){let c=[L.cf[k*3],L.cf[k*3+1],L.cf[k*3+2]];
  if(m){const t=tcell(pf[k*3],pf[k*3+1])[2],q=tcol(t,m);c=c.map((v,j)=>v*.4+q[j]*.6);}
  out.set(c,k*3);}
 gl.bindBuffer(gl.ARRAY_BUFFER,mesh.c);gl.bufferData(gl.ARRAY_BUFFER,out,gl.STATIC_DRAW);requestRender();}
function load(i){
 deleteBuffers(mesh,lines,grid);
 clearObjectBuffers();
 L={...LEVELS[i]};const pos=dec(L.pos,Int32Array),col=dec(L.col,Uint8Array),n=L.n;
 const pf=new Float32Array(pos),cf=new Float32Array(n*3);
 let zmin=1e9,zmax=-1e9;for(let k=2;k<pf.length;k+=3){zmin=Math.min(zmin,pf[k]);zmax=Math.max(zmax,pf[k]);}
 for(let k=0;k<n;k++)for(let j=0;j<3;j++)cf[k*3+j]=col[k*3+j]/255;
 L.pf=pf;L.cf=cf;L.tile=dec(L.tile,Uint8Array);L.bt=dec(L.bt,Uint8Array);
 mesh=createTerrain(pf,col,L);recolor();
 const lp=new Float32Array(n*6),lc=new Float32Array(n*6).fill(.1);
 for(let t=0;t<n;t+=3)for(let e=0;e<3;e++){const a=t+e,b=t+(e+1)%3;for(let j=0;j<3;j++){lp[(t*2+e*2)*3+j]=pf[a*3+j];lp[(t*2+e*2+1)*3+j]=pf[b*3+j];}}
 for(let k=0;k<lc.length;k++)lc[k]=.95;
 lines={p:buf(lp),c:buf(lc),n:n*2};
 const g=dec(L.grid,Int8Array),gp=new Float32Array(65*97*3),gc=new Float32Array(65*97*3);
 for(let x=0;x<65;x++)for(let y=0;y<97;y++){const k=(x*97+y)*3;gp[k]=x*64+256;gp[k+1]=y*64+512;gp[k+2]=g[x*97+y]*8;gc[k]=1;gc[k+1]=1;gc[k+2]=1;}
 grid={p:buf(gp),c:buf(gc),n:65*97};
 L.grid8=g;L.zmin=zmin;L.zmax=zmax;
 rebuildObjects();
 const b=L.bb;cam.t=[(b[0]+b[3])/2,(b[1]+b[4])/2,(b[2]+b[5])/2];cam.d=Math.max(b[3]-b[0],b[4]-b[1],1000)*1.4;
}
function clearObjectBuffers(){
 deleteBuffers(spw,bxs,bxl,bxo,bxlo,msh,L?.anm);
 spw=bxs=bxl=bxo=bxlo=msh=null;
 if(L)L.anm=null;
}
function rebuildObjects(){
 clearObjectBuffers();
 const sp=dec(L.sp,Int32Array),ns=sp.length/5,sP=new Float32Array(ns*3),sC=new Float32Array(ns*3);
 L.spw=[];for(let k=0;k<ns;k++){const t=sp[k*5],X=sp[k*5+1],Y=sp[k*5+2],Z=sp[k*5+3];L.spw.push([X,Y,Z,t,sp[k*5+4]]);sP.set([X,Y,Z],k*3);
  const c=k==0?[1,1,1]:hue(t);sC.set(c,k*3);}
 spw={p:buf(sP),c:buf(sC),n:ns};
 const KC=[[.6,.6,.6],[.3,.8,.3],[.3,.5,1],[1,.8,.2],[1,.35,.3],[.9,.3,1]];
 const KCOL=[[.65,.65,.65],[.3,.85,.3],[.3,.55,1],[1,.8,.2],[1,.4,.3],[.9,.3,1]];
 const bp=[],bc=[],lp2=[],lc2=[],bpo=[],bco=[],lpo=[],lco=[];
 const FACES=[[0,1,2,3,.6],[4,5,6,7,1],[0,1,5,4,.75],[1,2,6,5,.85],[2,3,7,6,.7],[3,0,4,7,.8]];
 L.spw.forEach((s,k)=>{const e=TBL[s[3]]||[0,0,0,0,0],kd=e[0],MIN=8;
  const w=Math.max(e[2],MIN)/2,d=Math.max(e[3],MIN)/2,h=Math.max(e[4],MIN),a=(s[4]||0)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
  const V=[];for(const zz of[0,h])for(const[qx,qy]of[[-w,-d],[w,-d],[w,d],[-w,d]])V.push([s[0]+qx*ca-qy*sa,s[1]+qx*sa+qy*ca,s[2]+zz]);
  const base=k==0?[1,1,1]:(KCOL[kd]||KCOL[0]);
  const nm=!MODELS[s[3]]||k==0&&false;
  for(const f of FACES){const c=base.map(v=>v*f[4]);for(const i of[0,1,2,0,2,3]){bp.push(...V[f[i]]),bc.push(...c);if(nm)bpo.push(...V[f[i]]),bco.push(...c);}}
  for(const[i,j]of[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]){lp2.push(...V[i],...V[j]),lc2.push(.05,.05,.05,.05,.05,.05);if(nm)lpo.push(...V[i],...V[j]),lco.push(.05,.05,.05,.05,.05,.05);}});
 bxs={p:buf(new Float32Array(bp)),c:buf(new Float32Array(bc)),n:bp.length/3};
 bxl={p:buf(new Float32Array(lp2)),c:buf(new Float32Array(lc2)),n:lp2.length/3};
 bxo={p:buf(new Float32Array(bpo)),c:buf(new Float32Array(bco)),n:bpo.length/3};
 bxlo={p:buf(new Float32Array(lpo)),c:buf(new Float32Array(lco)),n:lpo.length/3};
 buildMeshes();buildAnimals();
 $('info').textContent=`level ${L.id}: ${L.n/3} tris, tex zone ${L.zone} sub ${L.sub}, ${ns} spawns, z ${L.zmin}..${L.zmax}`+L.minfo+' · '+data.SOURCE_LABEL;
 requestRender();
}
function buildAnimals(){
 const P=[],C=[],groups=new Map(),a=L.an||[];L.anl=[];
 const box=(cx,cy,cz,hx,hy,hz,ca,sa,col)=>{const V=[];for(const zz of[-hz,hz])for(const[qx,qy]of[[-hx,-hy],[hx,-hy],[hx,hy],[-hx,hy]])V.push([cx+qx*ca-qy*sa,cy+qx*sa+qy*ca,cz+zz]);
  for(const f of[[0,1,2,3,.6],[4,5,6,7,1],[0,1,5,4,.75],[1,2,6,5,.85],[2,3,7,6,.7],[3,0,4,7,.8]])for(const i of[0,1,2,0,2,3]){P.push(...V[f[i]]);C.push(...col.map(v=>v*f[4]));}};
 for(let k=0;k<a.length;k+=5){const sp=a[k],x=a[k+1],y=a[k+2],z=a[k+3],yw=a[k+4]*Math.PI/180,ca=Math.cos(yw),sa=Math.sin(yw);L.anl.push([x,y,z,sp,a[k+4]]);
  const mk=ANIM.species[sp],mo=mk&&AMOD[mk];
  if(mo){if(gl2)appendInstance(groups,mo,x,y,z,ca,sa);
   else for(let i=0;i<mo.n;i++){const AS=mo.scale,px=mo.p[i*3]*AS,py=mo.p[i*3+1]*AS,pz=mo.p[i*3+2]*AS;P.push(x+px*ca-py*sa,y+px*sa+py*ca,z+pz);C.push(mo.c[i*3]/255,mo.c[i*3+1]/255,mo.c[i*3+2]/255);}
   if(k==0){box(x,y,z+mo.top*mo.scale+22,5,5,5,ca,sa,[1,.85,.2]);}continue;}
  const col=k==0?[1,.85,.2]:hue(sp*5+2),S=3.2;
  box(x,y,z+28*S,26*S,16*S,14*S,ca,sa,col);                       // body
  box(x+30*S*ca,y+30*S*sa,z+44*S,11*S,11*S,11*S,ca,sa,col.map(v=>Math.min(1,v*1.2+.1))); // head (faces yaw)
  for(const[lx,ly]of[[16,10],[16,-10],[-16,10],[-16,-10]])box(x+(lx*ca-ly*sa)*S,y+(lx*sa+ly*ca)*S,z+7*S,4*S,4*S,7*S,ca,sa,col.map(v=>v*.6)); // legs
 }
 L.anm={p:buf(new Float32Array(P)),c:buf(new Float32Array(C)),n:P.length/3};
 if(gl2)L.anm.batches=createBatches(groups);
}
function buildMeshes(){
 const S=+$('ms').value||1,P=[],C=[],groups=new Map();let nt=0,ni=0;
 L.spw.forEach(s=>{const m=MODELS[s[3]];if(!m)return;ni++;nt+=m.n/3;
  const a=(s[4]||0)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a);
  if(gl2){appendInstance(groups,m,s[0],s[1],s[2],ca,sa);return;}
  for(let k=0;k<m.n;k++){const x=m.p[k*3]*S,y=m.p[k*3+1]*S,z=m.p[k*3+2]*S;
   P.push(s[0]+x*ca-y*sa,s[1]+x*sa+y*ca,s[2]+z);C.push(m.c[k*3]/255,m.c[k*3+1]/255,m.c[k*3+2]/255);}});
 msh=gl2?{batches:createBatches(groups,S)}:{p:buf(new Float32Array(P)),c:buf(new Float32Array(C)),n:P.length/3};
 L.minfo=` | ${ni} mesh instances, ${nt} tris`;
}
function matrix(){
 const a=cv.width/cv.height,f=1/Math.tan(.4),n=cameraMode==='free'?4:cam.d/100,fa=Math.max(20000,cam.d*20);
 const pr=new Float32Array([f/a,0,0,0,0,f,0,0,0,0,(fa+n)/(n-fa),-1,0,0,2*fa*n/(n-fa),0]);
 const cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw),cp=Math.cos(cam.pitch),sp=Math.sin(cam.pitch);
 const e=[cam.t[0]+cam.d*cp*cy,cam.t[1]+cam.d*cp*sy,cam.t[2]+cam.d*sp];EYE=e;ASP=a;
 let z=[e[0]-cam.t[0],e[1]-cam.t[1],e[2]-cam.t[2]];const zl=Math.hypot(...z);z=z.map(v=>v/zl);
 let x=[-z[1],z[0],0];const xl=Math.hypot(...x);x=x.map(v=>v/xl);
 const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
 const v=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]),1]);
 BX=x;BY=y;BZ=z;return mul(pr,v);
}
function draw(o,mode,ps){gl.bindBuffer(gl.ARRAY_BUFFER,o.p);gl.enableVertexAttribArray(aP);gl.vertexAttribPointer(aP,3,gl.FLOAT,false,o.stride||0,0);
 gl.bindBuffer(gl.ARRAY_BUFFER,o.c);gl.enableVertexAttribArray(aC);gl.vertexAttribPointer(aC,3,gl.FLOAT,false,0,0);gl.uniform1f(uS,ps||1);gl.drawArrays(mode,0,o.n);}
let M,viewState,frameId=0,renderDirty=false,hoverPoint=null;
function syncView(){
 const next=[cv.width,cv.height,cameraMode,cam.yaw,cam.pitch,cam.d,...cam.t];
 if(!viewState||next.some((value,index)=>value!==viewState[index])){viewState=next;M=matrix();}
 return M;
}
function queueFrame(){if(!frameId&&!controller.signal.aborted)frameId=requestAnimationFrame(frame);}
function requestRender(){renderDirty=true;queueFrame();}
function sizeCanvas(width,height){
 const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));
 if(cv.width!==w)cv.width=w;
 if(cv.height!==h)cv.height=h;
 requestRender();
}
const canvasObserver=new ResizeObserver(([entry])=>sizeCanvas(entry.contentRect.width,entry.contentRect.height));
canvasObserver.observe(cv);
sizeCanvas(cv.clientWidth,cv.clientHeight);
controller.signal.addEventListener('abort',()=>{
 canvasObserver.disconnect();cancelAnimationFrame(frameId);
 gl.deleteBuffer(skyBuffer);gl.deleteTexture(skyTexture);gl.deleteProgram(skyProgram);
 deleteBuffers(mesh,lines,grid);clearObjectBuffers();
 for(const model of modelBuffers.values())deleteBuffers(model);
 for(const texture of Object.values(TEX))gl.deleteTexture(texture);
 gl.deleteProgram(P);gl.deleteProgram(T);
 if(instances)gl.deleteProgram(instances);
});
function frame(now){
 frameId=0;
 if(controller.signal.aborted)return;
 const moving=flyStep(now);
 if(renderDirty||moving){
  renderDirty=false;
  gl.viewport(0,0,cv.width,cv.height);
  gl.clearColor(5/255,5/255,9/255,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  drawSky();
  drawScene();
 }
 if(hoverPoint){const point=hoverPoint;hoverPoint=null;if(!drag&&!fly&&!edMove&&!edBox)updateHover(point);}
 if(moving)queueFrame();
}
function drawScene(){
 gl.useProgram(P);gl.uniformMatrix4fv(uM,false,syncView());
 if(!$('wf').checked&&$('gm').value=='3'){
  gl.useProgram(T);gl.uniformMatrix4fv(tM,false,M);gl.uniform3f(tHz,.42,.55,.75);gl.uniform1f(tFd,Math.max(9000,cam.d*3));gl.uniform1i(tMixed,mesh.mixed?1:0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(atlasTarget,mesh.tx);
  if(gl2)gl.bindVertexArray(mesh.vao);else bindTerrain(mesh);
  drawTerrainRange(false);
  if($('wt').checked){
   gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
   drawTerrainRange(true);gl.depthMask(true);gl.disable(gl.BLEND);
  }
  if(gl2)gl.bindVertexArray(null);else for(const a of [tU,tS,tW])gl.disableVertexAttribArray(a);
  gl.useProgram(P);
 }
 else draw($('wf').checked?lines:mesh,$('wf').checked?gl.LINES:gl.TRIANGLES);
 if($('an').checked){if(L.anm.n)draw(L.anm,gl.TRIANGLES);drawBatches(L.anm.batches);}
 if($('gr').checked)draw(grid,gl.POINTS,2);
 if($('sp').checked){if($('bx').checked){const pv=$('pm').value,mm=pv!='0';if(mm){if(gl2)drawBatches(msh.batches);else draw(msh,gl.TRIANGLES);}if(pv!='2'){draw(mm?bxo:bxs,gl.TRIANGLES);draw(mm?bxlo:bxl,gl.LINES);}}else draw(spw,gl.POINTS,9);}
 edOverlay();edDrawGhost();
}
function pick(mx,my){let best=-1,bd=100;if(!$('sp').checked)return -1;L.spw.forEach((s,i)=>{const x=M[0]*s[0]+M[4]*s[1]+M[8]*s[2]+M[12],y=M[1]*s[0]+M[5]*s[1]+M[9]*s[2]+M[13],w=M[3]*s[0]+M[7]*s[1]+M[11]*s[2]+M[15];if(w<=0)return;
 const px=(x/w*.5+.5)*cv.width,py=(1-(y/w*.5+.5))*cv.height,d=(px-mx)**2+(py-my)**2;if(d<bd){bd=d;best=i;}});return best;}
function gpick(mx,my){const nx=mx/cv.width*2-1,ny=1-my/cv.height*2,f=Math.tan(.4);
 const d=[0,1,2].map(j=>-BZ[j]+BX[j]*nx*ASP*f+BY[j]*ny*f),dl=Math.hypot(...d);
 const step=cam.d/400;let px=EYE[0],py=EYE[1],pz=EYE[2];
 for(let s=0;s<1200;s++){px+=d[0]/dl*step;py+=d[1]/dl*step;pz+=d[2]/dl*step;
  if(px<256||py<512||px>4352||py>6656)continue;const[gx,gy]=tcell(px,py);
  if(pz<=L.grid8[gx*97+gy]*8){return tcell(px,py);}}
 return null;}
let drag=null;
/* Left-drag pans when the editor's Pan tool is active (mouse), as does Shift+left or the middle button. */
cv.onmousedown=e=>{const panTool=e.button===0&&typeof edPanMode!=='undefined'&&edPanMode;if(e.button===2)setFly(true);if(e.button===2||e.button===1||e.shiftKey||panTool)drag={x:e.clientX,y:e.clientY,pan:e.button===1||e.button===0&&(e.shiftKey||panTool)};};
window.onmouseup=()=>{drag=null;fly=false;};cv.oncontextmenu=e=>e.preventDefault();
window.onmousemove=e=>{
 if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
  if(drag.pan){const s=cam.d/cv.height*1.2,cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw);cam.t[0]+=(dx*sy-dy*cy*Math.sin(cam.pitch))*s;cam.t[1]+=(-dx*cy-dy*sy*Math.sin(cam.pitch))*s;}
  else if(fly)LevelSelection.cameraLook(cam,dx,dy,cameraMode==='free');
  else{cam.yaw+=dx*.01;cam.pitch=Math.max(-1.5,Math.min(1.5,cam.pitch+dy*.01));}
  hoverPoint=null;$('tip').style.display='none';requestRender();return;}
 if(e.target!==cv||fly){hoverPoint=null;$('tip').style.display='none';return;}
 hoverPoint=e;queueFrame();
};
function updateHover(e){
 syncView();
 const [x0,y0]=edPoint(e);
 if($('an').checked&&L.anl){let bi=-1,bd=150;L.anl.forEach((q,k)=>{const z=q[2]+50,x=M[0]*q[0]+M[4]*q[1]+M[8]*z+M[12],y=M[1]*q[0]+M[5]*q[1]+M[9]*z+M[13],w=M[3]*q[0]+M[7]*q[1]+M[11]*z+M[15];if(w<=0)return;
  const d=((x/w*.5+.5)*cv.width-x0)**2+((1-(y/w*.5+.5))*cv.height-y0)**2;if(d<bd){bd=d;bi=k;}});
  if(bi>=0){const q=L.anl[bi],t=$('tip');t.style.display='block';t.style.left=e.clientX+12+'px';t.style.top=e.clientY+12+'px';t.textContent=`${LevelSelection.name('animals',q[3])} (species ${q[3]})${bi==0?' — player':''} · yaw ${q[4]} · xyz ${q[0]}, ${q[1]}, ${q[2]}${ANIM.species[q[3]]&&AMOD[ANIM.species[q[3]]]?' · torso+head from game, rough fit':' · placeholder shape'}`;return;}}
 const i=pick(x0,y0),t=$('tip');
 if(i<0){const c=gpick(x0,y0);if(!c){t.style.display='none';return;}
  const ty=c[2],b=Array.from(L.bt.slice(ty*12,ty*12+12)).map(v=>v.toString(16).padStart(2,'0')).join(' ');
  t.style.display='block';t.style.left=e.clientX+12+'px';t.style.top=e.clientY+12+'px';
  t.textContent=`cell ${c[0]},${c[1]} tile type ${ty} ${walk(ty)?'walkable':'BLOCKED'}${$('tile-details').checked?' B: '+b+' (+0 '+L.bt[ty*12]+', +1*8 = '+L.bt[ty*12+1]*8+')':''}`;return;}const s=L.spw[i];
 t.style.display='block';t.style.left=e.clientX+12+'px';t.style.top=e.clientY+12+'px';const te=TBL[s[3]]||[];t.textContent=`${LevelSelection.name('props',s[3])} · #${i}${s[3]===55?' (player start)':''} type 0x${s[3].toString(16)} (${s[3]}) kind ${te[0]} bank ${te[1]} box ${te[2]}x${te[3]}x${te[4]} yaw ${s[4]} xyz ${s[0]}, ${s[1]}, ${s[2]}`;};
let tch=null;const tinfo=t=>t.length>1?{x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2,d:Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY)}:{x:t[0].clientX,y:t[0].clientY};
listen(cv,'touchstart',e=>{e.preventDefault();tch=tinfo(e.touches);tch.n=e.touches.length;},{passive:false});
listen(cv,'touchmove',e=>{e.preventDefault();if(!tch)return;const n=tinfo(e.touches);if(e.touches.length!=tch.n){tch=n;tch.n=e.touches.length;return;}
 const dx=n.x-tch.x,dy=n.y-tch.y;
 if(tch.n==1&&(window.EditorTouch?.mode==='pan'||window.EditorTouch?.mode!=='look'&&typeof edPanMode!=='undefined'&&edPanMode)){const s=cam.d/cv.clientHeight*1.2,cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw);cam.t[0]+=(dx*sy-dy*cy*Math.sin(cam.pitch))*s;cam.t[1]+=(-dx*cy-dy*sy*Math.sin(cam.pitch))*s;}
 else if(tch.n==1)LevelSelection.cameraLook(cam,dx,dy,cameraMode==='free');
 else{if(tch.d&&n.d){if(cameraMode==='free')LevelSelection.cameraTravel(cam,(n.d-tch.d)*.006,0,0,Math.max(200,cam.d*.35));else cam.d=Math.max(10,cam.d*tch.d/n.d);}if(typeof edPanMode!=='undefined'&&!edPanMode){tch=Object.assign(n,{n:e.touches.length});requestRender();return;}const s=cam.d/cv.height*1.2,cy=Math.cos(cam.yaw),sy=Math.sin(cam.yaw);cam.t[0]+=(dx*sy-dy*cy*Math.sin(cam.pitch))*s;cam.t[1]+=(-dx*cy-dy*sy*Math.sin(cam.pitch))*s;}
 n.n=tch.n;tch=n;requestRender();},{passive:false});
listen(cv,'touchend',e=>{tch=e.touches.length?Object.assign(tinfo(e.touches),{n:e.touches.length}):null;});
let fly=false,cameraMode='free';const keys={};
$('camera-mode').onchange=()=>{cameraMode=$('camera-mode').value;setFly(false);requestRender();};
/* Freecam keeps the eye fixed while looking; keyboard travel works without holding a mouse button. */
function setFly(on){fly=on;if(on){hoverPoint=null;$('tip').style.display='none';queueFrame();}}
$('mn').onclick=()=>{const u=$('ui');u.classList.toggle('min');$('mn').innerHTML=u.classList.contains('min')?'+':'&ndash;';};
listen(window,'keydown',e=>{if(e.defaultPrevented||e.target.isContentEditable)return;const t=e.target.tagName;if(t=='INPUT'||t=='SELECT'||t=='TEXTAREA'||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();keys[k]=true;if(k.length==1&&'wasdqe '.includes(k)){e.preventDefault();queueFrame();}});
listen(window,'blur',()=>{for(const k of Object.keys(keys))delete keys[k];drag=null;fly=false;lastT=null;});
listen(window,'keyup',e=>{keys[e.key.toLowerCase()]=false;});
let lastT=null;
function flyStep(now){
 const ahead=Number(!!keys.w)-Number(!!keys.s),side=Number(!!keys.d)-Number(!!keys.a),
       up=Number(!!(keys.e||keys[' ']))-Number(!!keys.q);
 if((!fly&&cameraMode!=='free')||(!ahead&&!side&&!up)){lastT=null;return false;}
 const dt=lastT===null?0:Math.min(.05,(now-lastT)/1000);lastT=now;
 LevelSelection.cameraTravel(cam,ahead,side,up,(keys.shift?3.4:1)*Math.max(700,cam.d*.35)*dt);
 return true;
}
cv.onwheel=e=>{e.preventDefault();if(cameraMode==='free')LevelSelection.cameraTravel(cam,-e.deltaY*.001,0,0,Math.max(200,cam.d*.35));else cam.d=Math.max(10,Math.min(100000,cam.d*Math.exp(e.deltaY*.001)));requestRender();};
$('lv').replaceChildren();
LEVELS.forEach((l,i)=>{const o=document.createElement('option');o.value=i;o.textContent='Level '+l.id;$('lv').appendChild(o);});
$('gm').onchange=recolor;$('ms').onchange=()=>{deleteBuffers(msh);buildMeshes();requestRender();};
for(const id of ['wt','an','wf','gr','sp','bx','pm','tile-details'])if($(id))listen($(id),'change',requestRender);
$('lv').onchange=()=>load(+$('lv').value);
(function(root){
  'use strict';
  const checks=['wt','an','wf','gr','sp','bx','ml'];
  const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  function validate(v,levelIds){
    if(!v||v.format!=='sssv-level-view-v1'||!levelIds.includes(v.level))throw Error('Choose a compatible SSSV level view file.');
    const c=v.camera,s=v.settings;if(c?.mode!==undefined&&!['free','orbit'].includes(c.mode))throw Error('Invalid camera mode.');
    if(!c||!Array.isArray(c.target)||c.target.length!==3||!c.target.every(n=>number(n,-10000000,10000000))||!number(c.yaw,-1000000,1000000)||!number(c.pitch,-1.5,1.5)||!number(c.distance,0.01,10000000)||typeof v.fly!=='boolean')throw Error('Invalid camera settings.');
    if(!s||!['0','1','2','3'].includes(s.gm)||!['0','1','2'].includes(s.pm)||!number(s.ms,0.1,100)||!checks.every(k=>typeof s[k]==='boolean')||typeof s.panelCollapsed!=='boolean')throw Error('Invalid display settings.');
    // Reconstruct a whitelist: scene meshes, textures and arbitrary fields never enter a saved preset.
    const settings={gm:s.gm,pm:s.pm,ms:s.ms,panelCollapsed:s.panelCollapsed};
    for(const k of checks)settings[k]=s[k];
    return {format:'sssv-level-view-v1',level:v.level,camera:{target:c.target.slice(),yaw:c.yaw,pitch:c.pitch,distance:c.distance,mode:c.mode||'free'},fly:v.fly,settings};
  }
  const api={validate,checks};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ViewPreset=api;
})(typeof globalThis!=='undefined'?globalThis:this);

function currentView(){
 const settings={gm:$('gm').value,pm:$('pm').value,ms:Number($('ms').value),panelCollapsed:$('ui').classList.contains('min')};
 for(const k of ViewPreset.checks)settings[k]=k==='ml'?false:$(k).checked;
 return ViewPreset.validate({format:'sssv-level-view-v1',level:L.id,camera:{target:cam.t.slice(),yaw:cam.yaw,pitch:cam.pitch,distance:cam.d,mode:cameraMode},fly,settings},LEVELS.map(l=>l.id));
}
function openView(value){
 const v=ViewPreset.validate(value,LEVELS.map(l=>l.id)); // Validate everything before changing the view.
 for(const k of ViewPreset.checks)if(k!=='ml')$(k).checked=v.settings[k];
 $('gm').value=v.settings.gm;$('pm').value=v.settings.pm;$('ms').value=v.settings.ms;
 const i=LEVELS.findIndex(l=>l.id===v.level);load(i);$('lv').value=i;
 setFly(false);cameraMode=v.camera.mode;$('camera-mode').value=cameraMode;cam={t:v.camera.target.slice(),yaw:v.camera.yaw,pitch:v.camera.pitch,d:v.camera.distance};
 for(const k of Object.keys(keys))delete keys[k];drag=null;tch=null;
 $('ui').classList.toggle('min',v.settings.panelCollapsed);$('mn').innerHTML=v.settings.panelCollapsed?'+':'&ndash;';
 $('ui').style.display='';$('view-status').textContent='View opened. This file contains display settings, not level edits.';
}
$('save-view').onclick=()=>{
 try{const v=currentView(),a=document.createElement('a'),u=URL.createObjectURL(new Blob([JSON.stringify(v,null,2)],{type:'application/json'}));
 a.href=u;a.download='sssv-level-'+v.level+'-view.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);
 $('view-status').textContent='View saved (camera and display settings only).';
 }catch(e){$('view-status').textContent=e.message;}
};
$('open-view').onclick=()=>$('view-file').click();
$('view-file').onchange=async e=>{
 const f=e.target.files[0];if(!f)return;
 try{if(f.size>65536)throw Error('View files must be smaller than 64 KB.');openView(JSON.parse(await f.text()));}
 catch(err){$('view-status').textContent='Could not open view: '+err.message;}finally{e.target.value='';}
};

const HP=new URLSearchParams(location.hash.slice(1));
if(gl){load(+(HP.get('lv')||0));$('lv').value=+(HP.get('lv')||0);
 if(HP.get('cam')){const c=HP.get('cam').split(',').map(Number),d=Math.hypot(c[3]-c[0],c[4]-c[1],c[5]-c[2]);cam.t=c.slice(0,3);cam.d=d;cam.yaw=Math.atan2(c[4]-c[1],c[3]-c[0]);cam.pitch=Math.asin((c[5]-c[2])/d);}
 for(const k of['an','sp'])if(HP.get(k)=='0')$(k).checked=false;if(HP.get('ui')=='0')$('ui').style.display='none';
 requestRender();}

/*EDITOR*/
return {sourceSha1:EDITOR_SHA1,get level(){return L;},get records(){return edRecords;},get camera(){return cam;},get parts(){return edParts;},get selection(){return Array.from(edSelection);},project:edProject,restoreProject(p){if(p.source_sha1!==EDITOR_SHA1)throw Error('These edits need their original source ROM.');edRecords=EditorRecords.validate(p.edits);edParts=p.parts||null;edRefresh();edPartsStatus();},diff:edDiff,select(value){edSelected=value;edSelection=new Set([value]);$('ed-category').value='all';edList();},load,current:edCurrent,view:currentView};
}
