// Animation export (GIF and WebM with transparency) for the animation bar. The encoders are pure functions on RGBA frames;
// the capture/UI half only runs in the browser and reuses the viewer's own draw() so what is exported is what is on screen
// (current camera, no ground patch, grid or labels, transparent background).
(function(root){
'use strict';
// --- GIF89a: one global palette, index 0 = transparent (alpha < 128), LZW, looping, 1-bit transparency only ---
function buildPalette(frames){
  const hist=new Float64Array(4096),sr=new Float64Array(4096),sg=new Float64Array(4096),sb=new Float64Array(4096);
  for(const f of frames)for(let i=0;i<f.length;i+=4){
    if(f[i+3]<128)continue;
    const k=(f[i]>>4)<<8|(f[i+1]>>4)<<4|f[i+2]>>4;hist[k]++;sr[k]+=f[i];sg[k]+=f[i+1];sb[k]+=f[i+2];
  }
  const bins=[];for(let k=0;k<4096;k++)if(hist[k])bins.push(k);
  bins.sort((a,b)=>hist[b]-hist[a]);
  const top=bins.slice(0,255),pal=[[0,0,0]];
  for(const k of top)pal.push([Math.round(sr[k]/hist[k]),Math.round(sg[k]/hist[k]),Math.round(sb[k]/hist[k])]);
  return pal;
}
function indexer(pal){
  const cache=new Int16Array(4096).fill(-1);
  return (r,g,b)=>{
    const k=(r>>4)<<8|(g>>4)<<4|b>>4;let c=cache[k];
    if(c<0){let best=1,bd=1e9;for(let j=1;j<pal.length;j++){const dr=pal[j][0]-r,dg=pal[j][1]-g,db=pal[j][2]-b,d=dr*dr+dg*dg+db*db;if(d<bd){bd=d;best=j}}c=cache[k]=pal.length>1?best:0}
    return c;
  };
}
function lzw(idx,minCode){
  const clear=1<<minCode,eoi=clear+1,out=[];let bits=0,nbits=0,size=minCode+1,next=eoi+1,dict=new Map();
  const put=code=>{bits|=code<<nbits;nbits+=size;while(nbits>=8){out.push(bits&255);bits>>>=8;nbits-=8}};
  put(clear);let prefix=idx[0];
  for(let i=1;i<idx.length;i++){
    const c=idx[i],key=prefix<<8|c,hit=dict.get(key);
    if(hit!==undefined){prefix=hit;continue}
    put(prefix);
    if(next<4096){dict.set(key,next++);if(next-1===(1<<size)&&size<12)size++}
    else{put(clear);dict=new Map();size=minCode+1;next=eoi+1}
    prefix=c;
  }
  put(prefix);put(eoi);if(nbits>0)out.push(bits&255);
  return out;
}
function blocks(bytes,push){for(let i=0;i<bytes.length;i+=255){const n=Math.min(255,bytes.length-i);push(n);for(let j=0;j<n;j++)push(bytes[i+j])}push(0)}
// frames: array of Uint8ClampedArray RGBA (w*h*4); delayCs: centiseconds per frame. Returns a Uint8Array.
function encodeGif(frames,w,h,delayCs){
  if(!frames.length)throw new Error('no frames to encode');
  const pal=buildPalette(frames),idx=indexer(pal),out=[];const u16=v=>{out.push(v&255,v>>8&255)};
  for(const ch of 'GIF89a')out.push(ch.charCodeAt(0));
  u16(w);u16(h);out.push(0xF7,0,0);                       // global table, 256 entries, background index 0
  for(let i=0;i<256;i++){const c=pal[i]||[0,0,0];out.push(c[0],c[1],c[2])}
  out.push(0x21,0xFF,11);for(const ch of 'NETSCAPE2.0')out.push(ch.charCodeAt(0));out.push(3,1,0,0,0);   // loop forever
  for(const f of frames){
    out.push(0x21,0xF9,4,0x09);u16(Math.max(2,delayCs));out.push(0,0);       // dispose to background, transparent index 0
    out.push(0x2C);u16(0);u16(0);u16(w);u16(h);out.push(0,8);
    const px=new Uint8Array(w*h);
    for(let i=0,p=0;i<f.length;i+=4,p++)px[p]=f[i+3]<128?0:idx(f[i],f[i+1],f[i+2]);
    blocks(lzw(px,8),b=>out.push(b));
  }
  out.push(0x3B);return Uint8Array.from(out);
}
root.AnimExport={encodeGif,buildPalette,lzw};
if(typeof document==='undefined'||!document.getElementById('anim-gif'))return;

// --- browser half ---
const FPS=25,MAXSIDE=480;
let busy=false;
const status=msg=>{animBusy=msg;const el=document.getElementById('anim-frame');if(el)el.textContent=msg};
function save(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}
// Runs `fn(draw1)` with the viewer in export state (paused, bare), restoring it afterwards. draw1(i) renders loop frame i into the
// canvas and returns the canvas; n frames (one pass of the queue, see animSequence), w by h pixels.
async function withFrames(fn){
  if(!animMode||!animBind||busy)return;busy=true;
  const saved={mode:animMode,phase:animPhase,paused:animPaused,ground:showGround,grid:showGrid,labels:showLabels},seq=animSequence(),n=seq.length,name=[...new Set(seq.map(f=>f.m))].join('-'),
    cw=cv.clientWidth*devicePixelRatio,ch=cv.clientHeight*devicePixelRatio,k=Math.min(1,MAXSIDE/Math.max(cw,ch)),w=Math.max(2,Math.round(cw*k)&~1),h=Math.max(2,Math.round(ch*k)&~1);
  animPaused=true;showGround=false;showGrid=false;showLabels=false;
  try{return await fn({n,w,h,name,frame(i){animMode=seq[i].m;animPhase=seq[i].ph;animShow();draw([w,h]);return cv}})}
  finally{animBusy='';const live=!!animBind;if(live)animMode=saved.mode;animPhase=saved.phase;animPaused=saved.paused;showGround=saved.ground;showGrid=saved.grid;showLabels=saved.labels;busy=false;if(live)animShow();need();animBar()}
}
async function exportGif(){
  await withFrames(async({n,w,h,name,frame})=>{
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true}),frames=[];
    for(let i=0;i<n;i++){status(`GIF ${i+1}/${n}`);frame(i);x.clearRect(0,0,w,h);x.drawImage(cv,0,0);frames.push(x.getImageData(0,0,w,h).data);if(i%4===3)await new Promise(r=>setTimeout(r))}
    status('GIF encoding');await new Promise(r=>setTimeout(r));
    save(new Blob([encodeGif(frames,w,h,Math.round(100/FPS))],{type:'image/gif'}),`${name}.gif`);
  });
}
async function exportWebm(){
  const type=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t));
  if(!type){status('WebM not supported here');return}
  await withFrames(async({n,w,h,name,frame})=>{
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),stream=c.captureStream(0),track=stream.getVideoTracks()[0],
      rec=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:4e6}),chunks=[],done=new Promise(r=>{rec.onstop=r});
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.start();
    for(let i=0;i<n;i++){status(`WebM ${i+1}/${n}`);frame(i);x.clearRect(0,0,w,h);x.drawImage(cv,0,0);track.requestFrame?.();await new Promise(r=>setTimeout(r,1000/FPS))}
    rec.stop();await done;save(new Blob(chunks,{type:'video/webm'}),`${name}.webm`);
  });
}
document.getElementById('anim-gif').onclick=()=>exportGif().catch(e=>{busy=false;status('GIF failed: '+e.message)});
document.getElementById('anim-webm').onclick=()=>exportWebm().catch(e=>{busy=false;status('WebM failed: '+e.message)});
root.AnimExport.exportGif=exportGif;root.AnimExport.exportWebm=exportWebm;
})(typeof window!=='undefined'?window:globalThis);
