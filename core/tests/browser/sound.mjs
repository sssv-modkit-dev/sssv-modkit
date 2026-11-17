// Synthetic by default. Optional SOUND_ROM / SOUND_EVIDENCE exercise a user's local ROM.
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {launch,open,until,setFile,sleep,findChrome} from './cdp.mjs';
async function evaluate(c,s,expression){const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},s);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
const require=createRequire(import.meta.url),fixture=require('../sound-fixture.js');
if(!findChrome()){console.log('SKIP sound browser: Chrome unavailable');process.exit(0);}
const root=path.resolve(import.meta.dirname,'../..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sound-')),site=path.join(tmp,'site');
execFileSync('python',[path.join(root,'src/build_site.py'),'--pack',path.join(root,'packs/sample'),'--out',site,'--no-vendor']);
let rom=process.env.SOUND_ROM;if(!rom){rom=path.join(tmp,'synthetic.z64');fs.writeFileSync(rom,fixture().rom);}
const port=process.env.SOUND_ROM?8775:8774,origin=`http://127.0.0.1:${port}`;
const server=spawn('python',['-c',"import mimetypes,runpy;mimetypes.add_type('text/javascript','.js');runpy.run_module('http.server',run_name='__main__')",String(port),'--bind','127.0.0.1','--directory',site],{stdio:'ignore',windowsHide:true});
await sleep(600);const c=await launch(process.env.SOUND_ROM?9355:9354);
try{
 const s=await open(c,origin+'/sound.html');await until(c,s,"!!window.ROMSession && !!window.SoundPlayer && document.readyState==='complete'");
 assert.equal(await evaluate(c,s,"document.getElementById('sound-tools').disabled"),true);
 await c.send('Emulation.setDeviceMetricsOverride',{width:360,height:740,deviceScaleFactor:1,mobile:true},s);
 await setFile(c,s,'#rom',rom);await until(c,s,"!document.getElementById('sound-tools').disabled",30000);
 assert.equal(await evaluate(c,s,"document.querySelectorAll('#songs option').length"),30);
 const status=await evaluate(c,s,"document.getElementById('status').textContent");if(process.env.SOUND_ROM)assert.match(status,/355 instrument slots.*371 waves/);
 for(const [bank,instruments,waves] of process.env.SOUND_ROM?[[0,10,69],[1,345,302]]:[[0,1,1],[1,1,1]]){
  await evaluate(c,s,`document.getElementById('bank').value=${bank};document.getElementById('bank').dispatchEvent(new Event('change'))`);
  assert.equal(await evaluate(c,s,"document.querySelectorAll('#instruments option').length"),instruments);assert.equal(await evaluate(c,s,"document.querySelectorAll('#samples option').length"),waves);
 }
 if(process.env.SOUND_ROM)assert.equal(await evaluate(c,s,"document.querySelectorAll('.effect').length"),308);
 assert.equal(await evaluate(c,s,'document.documentElement.scrollWidth<=innerWidth'),true,'360px loaded layout');
 await evaluate(c,s,`window.downloads=[];window.createURL=URL.createObjectURL;URL.createObjectURL=blob=>{downloads.push(blob);return createURL(blob)};document.addEventListener('click',e=>{if(e.target.closest('a[download]'))e.preventDefault()},true);
  window.starts=[];window.makeSource=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(){const source=makeSource.call(this),start=source.start.bind(source);source.start=(...args)=>{starts.push({when:args[0],now:this.currentTime,loop:source.loop,rate:source.playbackRate.value});return start(...args)};return source};
  document.getElementById('songs').value=4;document.getElementById('songs').dispatchEvent(new Event('change'));document.getElementById('play').click();`);
 await until(c,s,'starts.length>0');assert.ok(await evaluate(c,s,'starts.some(v=>v.when>v.now+.02)'),'scheduled with AudioContext lookahead');
 await evaluate(c,s,"document.getElementById('pause').click()");await sleep(150);assert.equal(await evaluate(c,s,"document.getElementById('play').disabled"),false);
 await evaluate(c,s,"document.getElementById('play').click()");await sleep(150);await evaluate(c,s,"document.getElementById('stop').click()");await sleep(50);assert.match(await evaluate(c,s,"document.getElementById('time').textContent"),/^0:00/);
 // Exercise loop scheduling and voice cap on the tiny fixture even during a real-ROM run.
 await evaluate(c,s,fs.readFileSync(path.join(root,'tests/sound-fixture.js'),'utf8'));
 const live=await evaluate(c,s,`(async()=>{const d=SoundCore.load(soundFixture().rom),p=new SoundPlayer();await p.play(d.songs[0],d.banks[0],true);const initial=p.voices.length;for(let i=0;i<60;i++)p.voice(d.banks[0],SoundCore.noteSpec(d.banks[0],{channel:0,program:0,a:60,b:100,volume:100},1),p.context.currentTime+.02);const capped=p.voices.length;p.pause();const pos=p.position;p.stop();p.clock.terminate();await p.context.close();return {initial,capped,pos}})()`);
 assert.ok(live.initial>=6,'loop jumps schedule repeated notes');assert.ok(live.capped<=48);assert.ok(live.pos>=0);
 await evaluate(c,s,"document.getElementById('midi').click();document.getElementById('sample-wav').click()");
 const formats=await evaluate(c,s,"Promise.all(downloads.map(async b=>{const a=new Uint8Array(await b.arrayBuffer());return new TextDecoder().decode(a.slice(0,4))}))");assert.deepEqual(formats,['MThd','RIFF']);
 // Run the visible WAV export; progress callbacks must allow other UI work.
 await evaluate(c,s,`window.renderStats=null;window.renderProgress=[];window.originalRender=SoundCore.render;SoundCore.render=async(...args)=>{const progress=args[2];args[2]=v=>{renderProgress.push(v);progress(v)};const r=await originalRender(...args);let sum=0,peak=0,finite=true;for(const x of r.pcm){sum+=x*x;peak=Math.max(peak,Math.abs(x));finite=finite&&Number.isFinite(x)}const rms=[];for(let i=0;i<100;i++){const start=Math.floor(i*.1*r.rate),end=Math.min(r.pcm.length,Math.floor((i+1)*.1*r.rate));let n=0;for(let j=start;j<end;j++)n+=r.pcm[j]**2;rms.push(end>start?Math.sqrt(n/(end-start)):0)}window.renderStats={rate:r.rate,length:r.pcm.length,finite,peak,rms:Math.sqrt(sum/r.pcm.length),envelope:rms};return r};document.getElementById('song-wav').click()`);
 await until(c,s,'renderStats!==null && downloads.length===3',120000);
 const stats=await evaluate(c,s,'renderStats');assert.ok(stats.finite&&stats.peak>.001&&stats.rms>0,'finite non-silent offline audio');assert.ok(await evaluate(c,s,'renderProgress.length>2'));
 await evaluate(c,s,"document.getElementById('sample-play').click();document.querySelector('#effects button').click();document.querySelector('#keyboard button:not(:disabled)').click()");
 await evaluate(c,s,"document.getElementById('filter').value='no match expected';document.getElementById('filter').dispatchEvent(new Event('input'))");assert.equal(await evaluate(c,s,"document.getElementById('sample-play').disabled"),true);
 assert.equal(await evaluate(c,s,'document.documentElement.scrollWidth<=innerWidth'),true);
 if(process.env.SOUND_EVIDENCE){fs.mkdirSync(process.env.SOUND_EVIDENCE,{recursive:true});const shot=await c.send('Page.captureScreenshot',{format:'png'},s);fs.writeFileSync(path.join(process.env.SOUND_EVIDENCE,'sound-mobile.png'),Buffer.from(shot.data,'base64'));}
 // Navigation restores the same source without another upload.
 const restored=await open(c,origin+'/sound.html');await until(c,restored,"document.querySelectorAll('#songs option').length===30",30000);
 assert.deepEqual(c.errors,[]);
 if(process.env.SOUND_EVIDENCE){fs.mkdirSync(process.env.SOUND_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.SOUND_EVIDENCE,'browser-results.json'),JSON.stringify({status,stats,live,errors:c.errors},null,2));}
 console.log('Sound browser: local ROM/session restore, counts, 360px, audio scheduling/loop/48 voices, pause/resume/stop, MIDI/sample/song WAV, progress and keyboard/effects passed. '+JSON.stringify({peak:stats.peak,rms:stats.rms}));
}finally{c.close();server.kill();}
