// Animation export (GIF and WebM with transparency) for the animation bar. The encoders are pure functions on RGBA frames;
// the capture/UI half only runs in the browser and reuses the viewer's own draw() so what is exported is what is on screen
// (current camera angle, no ground patch, grid or labels, transparent background). The camera is re-framed for the export so
// that every frame fits: an arm raised mid-animation is not cut off at the edge.
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
// Smallest box holding every [min,max] box in the list (entries may be null).
function unionBounds(list){let lo=null,hi=null;for(const b of list){if(!b)continue;lo=lo?lo.map((v,k)=>Math.min(v,b[0][k])):b[0].slice();hi=hi?hi.map((v,k)=>Math.max(v,b[1][k])):b[1].slice()}return lo?[lo,hi]:null}
// --- MP4 (H.264, one video track): the frames come from the browser's own encoder; this only writes the container ---
// samples: [{data:Uint8Array (length-prefixed NAL units), key:boolean}], avcC: the encoder's decoder description.
function muxMp4({w,h,fps,samples,avcC}){
  const cat=parts=>{let n=0;for(const x of parts)n+=x.length;const o=new Uint8Array(n);let at=0;for(const x of parts){o.set(x,at);at+=x.length}return o};
  const u32=(...v)=>{const o=new Uint8Array(v.length*4);v.forEach((x,i)=>new DataView(o.buffer).setUint32(i*4,x>>>0));return o},u16=(...v)=>{const o=new Uint8Array(v.length*2);v.forEach((x,i)=>new DataView(o.buffer).setUint16(i*2,x));return o};
  const str=t=>Uint8Array.from(t,c=>c.charCodeAt(0)),zero=n=>new Uint8Array(n),box=(type,...kids)=>{const body=cat(kids);return cat([u32(body.length+8),str(type),body])};
  const scale=fps*512,delta=512,dur=samples.length*delta,matrix=u32(0x10000,0,0,0,0x10000,0,0,0,0x40000000),keys=samples.map((x,i)=>x.key?i+1:0).filter(Boolean);
  const moov=off=>box('moov',
    box('mvhd',u32(0,0,0,scale,dur,0x10000),u16(0x100,0),zero(8),matrix,zero(24),u32(2)),
    box('trak',
      box('tkhd',u32(3,0,0,1,0,dur),zero(8),u16(0,0,0,0),matrix,u32(w<<16,h<<16)),
      box('mdia',box('mdhd',u32(0,0,0,scale,dur),u16(0x55C4,0)),box('hdlr',u32(0,0),str('vide'),zero(12),str('VideoHandler'),zero(1)),
        box('minf',box('vmhd',u32(1),zero(8)),box('dinf',box('dref',u32(0,1),box('url ',u32(1)))),
          box('stbl',box('stsd',u32(0,1),box('avc1',zero(6),u16(1,0,0),zero(12),u16(w,h),u32(0x480000,0x480000,0),u16(1),zero(32),u16(0x18,0xFFFF),box('avcC',avcC))),
            box('stts',u32(0,1,samples.length,delta)),box('stss',u32(0,keys.length,...keys)),box('stsc',u32(0,1,1,samples.length,1)),
            box('stsz',u32(0,0,samples.length,...samples.map(x=>x.data.length))),box('stco',u32(0,1,off)))))));
  const ftyp=box('ftyp',str('isom'),u32(0x200),str('isomiso2avc1mp41')),head=ftyp.length+moov(0).length+8;
  return cat([ftyp,moov(head),box('mdat',...samples.map(x=>x.data))]);
}
root.AnimExport={encodeGif,buildPalette,lzw,unionBounds,muxMp4};
if(typeof document==='undefined'||!document.getElementById('anim-gif'))return;

// --- browser half ---
const FPS=25,MAXSIDE=480,TIGHT=.8;
let busy=false,frameMode='tight';
// Export framing: tight = the typical frame fills the picture (a raised arm or a hop may be cut off), all = every frame fits,
// mine = keep the camera exactly as the user left it (pause, orbit/zoom/pan, then export).
const FRAME_MODES=[['tight','Tight','Zoomed in on the animal; an arm or jump may be cut off.'],['all','Fit all','Zoomed out so every frame fits whole.'],['mine','My view','Exports the camera exactly as you have framed it now: pause, orbit, zoom and pan first.']];
const status=msg=>{animBusy=msg;const el=document.getElementById('anim-frame');if(el)el.textContent=msg};
function save(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}
// Runs `fn(draw1)` with the viewer in export state (paused, bare), restoring it afterwards. draw1(i) renders loop frame i into the
// canvas and returns the canvas; n frames (one pass of the queue, see animSequence), w by h pixels.
async function withFrames(fn){
  if(!animMode||!animBind||busy)return;busy=true;
  const saved={mode:animMode,phase:animPhase,paused:animPaused,ground:showGround,grid:showGrid,labels:showLabels,ctr:ctr&&ctr.slice?ctr.slice():ctr,dist},seq=animSequence(),n=seq.length,name=[...new Set(seq.map(f=>f.m))].join('-'),
    cw=cv.clientWidth*devicePixelRatio,ch=cv.clientHeight*devicePixelRatio,k=Math.min(1,MAXSIDE/Math.max(cw,ch)),w=Math.max(2,Math.round(cw*k)&~1),h=Math.max(2,Math.round(ch*k)&~1);
  animPaused=true;showGround=false;showGrid=false;showLabels=false;
  try{
    if(frameMode!=='mine'){
      const list=seq.map(f=>{animMode=f.m;animPhase=f.ph;animShow();return sceneBounds}).filter(Boolean);
      if(frameMode==='all'){const B=unionBounds(list);if(B){const f=cameraFit(B[0],B[1],cameraRotation(),w/h);ctr=f.center;dist=f.distance*1.04}}
      else if(list.length){const fits=list.map(b=>cameraFit(b[0],b[1],cameraRotation(),w/h)),mid=a=>a.slice().sort((x,y)=>x-y)[a.length>>1];
        ctr=[0,1,2].map(k=>mid(fits.map(f=>f.center[k])));dist=mid(fits.map(f=>f.distance))*TIGHT}
    }
  }catch(e){ctr=saved.ctr;dist=saved.dist}
  try{return await fn({n,w,h,name,frame(i){animMode=seq[i].m;animPhase=seq[i].ph;animShow();draw([w,h]);return cv}})}
  finally{animBusy='';const live=!!animBind;if(live)animMode=saved.mode;animPhase=saved.phase;animPaused=saved.paused;ctr=saved.ctr;dist=saved.dist;showGround=saved.ground;showGrid=saved.grid;showLabels=saved.labels;busy=false;if(live)animShow();need();animBar()}
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
// MP4 has no transparency: frames are laid over the page's backdrop colour. Every frame gets an exact timestamp, so the file
// plays at the right speed in any player (the WebM above is recorded live and many players show only its first frame).
async function exportMp4(){
  if(!window.VideoEncoder){status('MP4 not supported here');return}
  await withFrames(async({n,w,h,name,frame})=>{
    const cfg={codec:'avc1.42E01F',width:w,height:h,bitrate:3e6,framerate:FPS,avc:{format:'avc'}};
    if(!(await VideoEncoder.isConfigSupported(cfg)).supported){status('MP4 not supported here');return}
    const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'),samples=[];let avcC=null,err=null;
    const bg=[cv,cv.parentElement,document.body].map(e=>e&&getComputedStyle(e).backgroundColor).find(v=>v&&!/rgba(.*, 0)|transparent/.test(v))||'#14181f';
    const enc=new VideoEncoder({output(chunk,meta){const d=new Uint8Array(chunk.byteLength);chunk.copyTo(d);samples.push({data:d,key:chunk.type==='key'});const desc=meta?.decoderConfig?.description;if(desc&&!avcC)avcC=new Uint8Array(desc.buffer||desc,desc.byteOffset||0,desc.byteLength)},error(e){err=e}});
    enc.configure(cfg);
    for(let i=0;i<n&&!err;i++){status(`MP4 ${i+1}/${n}`);frame(i);x.fillStyle=bg;x.fillRect(0,0,w,h);x.drawImage(cv,0,0);
      const vf=new VideoFrame(c,{timestamp:Math.round(i*1e6/FPS),duration:Math.round(1e6/FPS)});enc.encode(vf,{keyFrame:i%50===0});vf.close();
      if(enc.encodeQueueSize>4||i%8===7)await new Promise(r=>setTimeout(r))}
    await enc.flush();enc.close();if(err)throw err;if(!avcC||samples.length!==n)throw new Error('encoder returned '+samples.length+' of '+n+' frames');
    save(new Blob([muxMp4({w,h,fps:FPS,samples,avcC})],{type:'video/mp4'}),`${name}.mp4`);
  });
}
{const b=document.getElementById('anim-frame-mode');if(b){const show=()=>{const m=FRAME_MODES.find(x=>x[0]===frameMode);b.textContent='Frame: '+m[1];b.title=m[2]+' Click to change.'};show();b.onclick=()=>{frameMode=FRAME_MODES[(FRAME_MODES.findIndex(x=>x[0]===frameMode)+1)%FRAME_MODES.length][0];show()}}}
root.AnimExport.setFrameMode=m=>{if(FRAME_MODES.some(x=>x[0]===m))frameMode=m};
if(document.getElementById('anim-mp4')){document.getElementById('anim-mp4').onclick=()=>exportMp4().catch(e=>{busy=false;status('MP4 failed: '+e.message)});root.AnimExport.exportMp4=exportMp4}
document.getElementById('anim-gif').onclick=()=>exportGif().catch(e=>{busy=false;status('GIF failed: '+e.message)});
document.getElementById('anim-webm').onclick=()=>exportWebm().catch(e=>{busy=false;status('WebM failed: '+e.message)});
root.AnimExport.exportGif=exportGif;root.AnimExport.exportWebm=exportWebm;
})(typeof window!=='undefined'?window:globalThis);
