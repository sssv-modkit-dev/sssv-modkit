import {launch, open, evaluate, sleep} from './cdp.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser=await launch(9348);
try {
  const session=await open(browser,'about:blank');
  await browser.send('Page.bringToFront',{},session);
  await sleep(300);
  await evaluate(browser,session,`
    document.body.innerHTML='<button id="anim-gif"></button><button id="anim-webm"></button><span id="anim-frame"></span>';
    window.cv=document.createElement('canvas');cv.width=64;cv.height=64;
    cv.style.width='64px';cv.style.height='64px';document.body.append(cv);
    Object.assign(window,{animMode:'test',animBind:{},animPhase:0,animPaused:false,
      showGround:true,showGrid:true,showLabels:true,ctr:[0,0,0],dist:1,animBusy:'',sceneBounds:null,
      animSequence:()=>Array.from({length:10},(_,i)=>({m:'test',ph:i})),
      animShow:()=>{},need:()=>{},animBar:()=>{},
      draw:()=>{const x=cv.getContext('2d');x.clearRect(0,0,64,64);x.fillStyle='red';x.fillRect(animPhase*4,10,20,20)}});
    window.tracks=[];
    const capture=HTMLCanvasElement.prototype.captureStream;
    HTMLCanvasElement.prototype.captureStream=function(...args){
      const stream=capture.apply(this,args);tracks.push(...stream.getTracks());return stream;
    };
    HTMLAnchorElement.prototype.click=function(){};
    const makeURL=URL.createObjectURL.bind(URL);
    URL.createObjectURL=blob=>{window.exported=blob;return makeURL(blob)};
  `);
  await evaluate(browser,session,fs.readFileSync(new URL('../../src/viewer/js/anim-export.js',import.meta.url),'utf8'));
  const result=await evaluate(browser,session,`(async()=>{
    await AnimExport.exportWebm();
    const video=document.createElement('video');video.muted=true;
    video.src=URL.createObjectURL(exported);
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;video.onerror=()=>reject(Error(video.error.message))});
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    async function pixels(time){
      await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=reject;video.currentTime=time});
      context.clearRect(0,0,64,64);context.drawImage(video,0,0);
      return Array.from(context.getImageData(0,0,64,64).data);
    }
    const first=await pixels(Math.max(0.01,video.duration-0.35));
    const last=await pixels(video.duration-0.05);
    return {duration:video.duration,bytes:exported.size,moved:first.some((v,i)=>v!==last[i]),
      stopped:tracks.every(t=>t.readyState==='ended'),restored:animMode==='test'&&!animPaused&&showGround&&showGrid&&showLabels};
  })()`);
  assert.ok(Number.isFinite(result.duration)&&result.duration>=0.3,'short WebM has a finite playable duration');
  assert.ok(result.moved,'decoded video contains moving frames');
  assert.ok(result.stopped,'capture tracks stop after download');
  assert.ok(result.restored,'viewer state is restored');
  const failure=await evaluate(browser,session,`(async()=>{
    const previousDraw=draw;draw=()=>{throw Error('test render failure')};
    let message='';try{await AnimExport.exportWebm()}catch(error){message=error.message}finally{draw=previousDraw}
    return {message,stopped:tracks.every(t=>t.readyState==='ended'),restored:!animPaused&&showGround&&showGrid&&showLabels};
  })()`);
  assert.equal(failure.message,'test render failure');
  assert.ok(failure.stopped&&failure.restored,'render failure releases tracks and restores viewer');
  console.log('WebM short export decodes moving frames, releases capture tracks and restores viewer on success/failure.');
} finally {
  browser.close();
}
