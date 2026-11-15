// Optional private-ROM integration. Writes private outputs only to caller-provided scratch.
import {launch,open,evaluate,until,setFile,sleep} from './cdp.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';
import S from '../../src/web/story/rom.js';
const [site,romPath,output]=process.argv.slice(2);
if(!output) throw Error('Usage: node tests/browser/story-rom.mjs BUILT_SITE ROM SCRATCH_OUTPUT');
const dir=output.replaceAll('\\','/').replace(/\/$/,'')+'/';
fs.mkdirSync(dir,{recursive:true});
const project=new S.Project(fs.readFileSync(romPath));project.data.banks[0].strings[0]='@CYTEST';
fs.writeFileSync(dir+'js-dialogue.z64',project.build());
const rgba=project.sheet(1);rgba.set([255,0,0],0);
fs.writeFileSync(dir+'js-terrain.z64',project.build(project.data,{level:1,rgba}));
const c=await launch(9352);
if(fs.existsSync(dir+'story-patched.z64'))fs.renameSync(dir+'story-patched.z64',dir+'previous-browser-terrain.z64');
let s;
try{
await c.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir.replaceAll("/",String.fromCharCode(92))});
s=await open(c,'file:///'+site.replaceAll('\\','/')+'/dialogue.html');
await until(c,s,"!!document.getElementById('rom')?.onchange");await setFile(c,s,'#rom',romPath);
await until(c,s,"document.getElementById('build').disabled === false");
await evaluate(c,s,"document.getElementById('text').value='@CYTEST';document.getElementById('text').dispatchEvent(new Event('input'));document.getElementById('build').click()");
await until(c,s,"document.getElementById('status').textContent.includes('ROM downloaded')");for(let i=0;i<60&&!fs.existsSync(dir+'story-patched.z64');i++)await sleep(200);
assert.ok(fs.readFileSync(dir+'story-patched.z64').equals(fs.readFileSync(dir+'js-dialogue.z64')), 'dialogue bytes differ');fs.renameSync(dir+'story-patched.z64',dir+'browser-dialogue.z64');
let shot=await c.send('Page.captureScreenshot',{format:'png'},s);fs.writeFileSync(dir+'dialogue.png',Buffer.from(shot.data,'base64'));
s=await open(c,'file:///'+site.replaceAll('\\','/')+'/terrain.html');await until(c,s,"!!document.getElementById('rom')?.onchange");await setFile(c,s,'#rom',dir+'browser-dialogue.z64');await until(c,s,"document.getElementById('build').disabled === false");
await evaluate(c,s,"document.getElementById('colour').value='#ff0000'");
await evaluate(c,s,"document.getElementById('tile').scrollIntoView()");
const box=await evaluate(c,s,"(()=>{const r=document.getElementById('tile').getBoundingClientRect();return {x:r.x+1,y:r.y+1}})()");
await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1},s);await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1},s);
assert.deepEqual(await evaluate(c,s,"Array.from(document.getElementById('sheet').getContext('2d').getImageData(0,0,1,1).data)"),[255,0,0,255]);
await evaluate(c,s,"document.getElementById('build').click()");await until(c,s,"document.getElementById('status').textContent.includes('ROM downloaded')");for(let i=0;i<60&&!fs.existsSync(dir+'story-patched.z64');i++)await sleep(200);
fs.writeFileSync(dir+'browser-sheet.rgba',Buffer.from(await evaluate(c,s,"Array.from(document.getElementById('sheet').getContext('2d').getImageData(0,0,272,136).data)")));assert.ok(fs.readFileSync(dir+'story-patched.z64').equals(fs.readFileSync(dir+'js-terrain.z64')), 'terrain bytes differ');fs.renameSync(dir+'story-patched.z64',dir+'browser-terrain.z64');
await evaluate(c,s,"document.getElementById('ips').click()");await sleep(500);assert.ok(fs.readFileSync(dir+'story-patched.ips').equals(Buffer.from(S.ips(fs.readFileSync(dir+'browser-dialogue.z64'),fs.readFileSync(dir+'browser-terrain.z64')))));
await evaluate(c,s,"document.getElementById('save').click()");await sleep(500);assert.ok(fs.existsSync(dir+'terrain-sheet.png'));
shot=await c.send('Page.captureScreenshot',{format:'png'},s);fs.writeFileSync(dir+'terrain.png',Buffer.from(shot.data,'base64'));
assert.deepEqual(c.errors,[]);console.log('Browser file:// dialogue + pixel brush downloads match JS parity outputs; IPS downloaded; screenshots captured.');
}catch(e){console.log(c.errors);if(s)console.log(await evaluate(c,s,"document.getElementById('status')?.textContent"));throw e;}finally{c.close();}

