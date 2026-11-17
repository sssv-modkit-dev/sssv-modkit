// Synthetic MIDI and ROM by default. SOUND_ROM is read-only; downloads are captured in memory.
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {launch,open,until,setFile,sleep,findChrome} from './cdp.mjs';
const require=createRequire(import.meta.url),F=require('../music-fixture.js'),E=require('../../src/web/sound-encode.js');
async function evaluate(c,s,expression){const r=await c.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true},s);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
if(!findChrome()){console.log('SKIP custom music browser: Chrome unavailable');process.exit(0);}
const root=path.resolve(import.meta.dirname,'../..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'music-')),site=path.join(tmp,'site');
execFileSync('python',[path.join(root,'src/build_site.py'),'--pack',path.join(root,'packs/sample'),'--out',site,'--no-vendor']);
let rom=process.env.SOUND_ROM;if(!rom){const f=require('../sound-fixture.js')(),v=new DataView(f.rom.buffer);v.setUint32(0x40b210+4+29*8,0x600000-0x40b210);v.setUint32(0x40b210+8+29*8,4096);f.rom.set(f.sequence,0x600000);rom=path.join(tmp,'synthetic.z64');fs.writeFileSync(rom,f.rom);}
const small=path.join(tmp,'tiny.mid'),large=path.join(tmp,'large.mid'),bad=path.join(tmp,'bad.mid');fs.writeFileSync(small,F.tiny());fs.writeFileSync(bad,Uint8Array.of(1,2,3));
const events=[[0,[192,42]]];for(let i=0;i<2500;i++){events.push([i*480,[144,60,100]],[(i+1)*480,[128,60,0]]);}fs.writeFileSync(large,F.midi([events]));
const origin='http://127.0.0.1:8776',server=spawn('python',['-c',"import mimetypes,runpy;mimetypes.add_type('text/javascript','.js');runpy.run_module('http.server',run_name='__main__')",'8776','--bind','127.0.0.1','--directory',site],{stdio:'ignore',windowsHide:true});
await sleep(600);const c=await launch(9356);
try{
 const s=await open(c,origin+'/sound.html');await until(c,s,"!!window.ROMSession && !!window.SoundEncode && document.readyState==='complete'");
 await c.send('Emulation.setDeviceMetricsOverride',{width:360,height:740,deviceScaleFactor:1,mobile:true},s);
 await setFile(c,s,'#rom',rom);await until(c,s,"!document.getElementById('sound-tools').disabled",30000);
 assert.equal(await evaluate(c,s,"document.querySelectorAll('#music-slot option').length"),30);
 await evaluate(c,s,`(async()=>{window.sourceHash=(await ROMSession.get()).hash;window.downloads=[];window.createURL=URL.createObjectURL;URL.createObjectURL=blob=>{downloads.push(blob);return createURL(blob)};document.addEventListener('click',e=>{if(e.target.closest('a[download]'))e.preventDefault()},true);
 window.starts=[];window.makeSource=AudioContext.prototype.createBufferSource;AudioContext.prototype.createBufferSource=function(){const source=makeSource.call(this),start=source.start.bind(source);source.start=(...args)=>{starts.push(args);return start(...args)};return source};})()`);
 await setFile(c,s,'#music-file',small);await until(c,s,"!document.getElementById('music-preview').disabled");
 assert.match(await evaluate(c,s,"document.getElementById('music-fit').textContent"),/bytes - fits/);
 assert.equal(await evaluate(c,s,"document.querySelectorAll('[data-music-program]').length"),1);
 await evaluate(c,s,"document.querySelector('[data-music-program]').value=0;document.querySelector('[data-music-program]').dispatchEvent(new Event('change'));document.getElementById('music-preview').click()");await until(c,s,'starts.length>0');assert.equal(await evaluate(c,s,"document.getElementById('music-stop').disabled"),false);
 await evaluate(c,s,"document.getElementById('music-stop').click();document.getElementById('music-slot').value=4;document.getElementById('music-slot').dispatchEvent(new Event('change'));document.getElementById('music-rom').click();document.getElementById('music-ips').click()");
 await until(c,s,'downloads.length===2');
 const formats=await evaluate(c,s,"Promise.all(downloads.map(async b=>{const a=new Uint8Array(await b.arrayBuffer());return [...a.slice(0,5)]}))");assert.deepEqual(formats[0].slice(0,4),[128,55,18,64]);assert.deepEqual(formats[1],[80,65,84,67,72]);
 assert.equal(await evaluate(c,s,"(async()=>sourceHash===(await ROMSession.get()).hash)()"),true,'download leaves shared source unchanged');
 const downloadChecks=await evaluate(c,s,`(async()=>{const source=new Uint8Array((await ROMSession.get()).buffer),out=new Uint8Array(await downloads[0].arrayBuffer()),patch=new Uint8Array(await downloads[1].arrayBuffer()),slot=SoundEncode.slots(source)[4],rebuilt=source.slice();let p=5,records=0;while(!(patch[p]===69&&patch[p+1]===79&&patch[p+2]===70)){const at=patch[p]*65536+patch[p+1]*256+patch[p+2],n=patch[p+3]*256+patch[p+4];if(at===0x454f46||!n)throw Error('Invalid IPS record');p+=5;rebuilt.set(patch.subarray(p,p+n),at);p+=n;records++;}let outside=0,tableSame=true;for(let i=0;i<out.length;i++)if(out[i]!==source[i]&&!(i>=16&&i<24||i>=slot.start&&i<slot.start+slot.capacity))outside++;for(let i=0x40b210;i<0x40b210+244;i++)tableSame=tableSame&&out[i]===source[i];return {outside,tableSame,ipsEqual:out.every((x,i)=>x===rebuilt[i]),records};})()`);
 assert.equal(downloadChecks.outside,0);assert.equal(downloadChecks.tableSame,true);assert.equal(downloadChecks.ipsEqual,true);assert.ok(downloadChecks.records>0);
 await evaluate(c,s,"document.querySelector('[data-music-program]').value=0;document.querySelector('[data-music-program]').dispatchEvent(new Event('change'));document.getElementById('music-transpose').value=7;document.getElementById('music-transpose').dispatchEvent(new Event('input'));document.querySelector('[data-music-mute]').click()");
 assert.equal(await evaluate(c,s,"document.getElementById('music-rom').disabled"),true);assert.match(await evaluate(c,s,"document.getElementById('music-fit').textContent"),/no unmuted notes/);
 await evaluate(c,s,"document.querySelector('[data-music-mute]').click()");assert.equal(await evaluate(c,s,"document.getElementById('music-rom').disabled"),false);
 await setFile(c,s,'#music-file',large);await until(c,s,"document.getElementById('music-fit').textContent.includes('too large')");
 assert.equal(await evaluate(c,s,"document.getElementById('music-rom').disabled && document.getElementById('music-ips').disabled"),true);
 assert.match(await evaluate(c,s,"document.getElementById('music-warnings').textContent"),/no music-bank instrument/);
 // A direct click cannot export a stale earlier import after a malformed file.
 await setFile(c,s,'#music-file',bad);await until(c,s,"document.getElementById('music-fit').textContent.includes('Truncated')");
 await evaluate(c,s,"document.getElementById('music-rom').click()");assert.equal(await evaluate(c,s,'downloads.length'),2);
 await setFile(c,s,'#music-file',small);await until(c,s,"!document.getElementById('music-rom').disabled");
 const layout=await evaluate(c,s,'document.documentElement.scrollWidth<=innerWidth');assert.equal(layout,true,'360px custom music layout');
 if(process.env.SOUND_EVIDENCE){fs.mkdirSync(process.env.SOUND_EVIDENCE,{recursive:true});await evaluate(c,s,"document.getElementById('custom-title').scrollIntoView()");const shot=await c.send('Page.captureScreenshot',{format:'png'},s);fs.writeFileSync(path.join(process.env.SOUND_EVIDENCE,'custom-music-mobile.png'),Buffer.from(shot.data,'base64'));fs.writeFileSync(path.join(process.env.SOUND_EVIDENCE,'custom-music-browser.json'),JSON.stringify({downloadChecks,layout,errors:c.errors},null,2));}
 await evaluate(c,s,"document.getElementById('music-revert').click()");assert.equal(await evaluate(c,s,"document.getElementById('music-rom').disabled && !document.getElementById('music-file').value && !document.querySelectorAll('[data-music-program]').length"),true);
 const restored=await open(c,origin+'/sound.html');await until(c,restored,"document.querySelectorAll('#songs option').length===30",30000);assert.equal(await evaluate(c,restored,"document.getElementById('music-rom').disabled"),true);
 assert.deepEqual(c.errors,[]);console.log('Custom music browser: 30 slot budgets, MIDI import, preview audio, mapping/transpose/mute, size refusal, invalid import, ROM/IPS memory downloads, source unchanged, revert, reload and 360px passed.');
}finally{c.close();server.kill();}
