// End-to-end script editing and source-bound session restoration, using invented data only.
import {execFileSync} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {launch,open,evaluate,until,sleep,findChrome} from './cdp.mjs';
import fixtureAPI from '../cutscene-fixture.js';
import S from '../../src/web/story/rom.js';
if(!findChrome()){console.log('SKIP cutscenes: Chrome unavailable');process.exit(0);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cutscenes-')),site=path.join(tmp,'site'),rom=path.join(tmp,'invented.z64');
fs.writeFileSync(rom,fixtureAPI.fixture());
execFileSync('python',['src/build_site.py','--pack','packs/sample','--out',site,'--no-vendor']);
const server=http.createServer((req,res)=>{const file=path.join(site,decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(site+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
console.log('Cutscenes: site built');await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));console.log('Cutscenes: server listening');const url=`http://127.0.0.1:${server.address().port}/dialogue.html`,c=await launch(9366);console.log('Cutscenes: browser connected');
try{
 await c.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:tmp});
 let s=await open(c,url),run=code=>evaluate(c,s,code);
 await until(c,s,"!!$('rom')?.onchange");console.log('Cutscenes: page ready');await setROM();console.log('Cutscenes: ROM loaded');
 async function setROM(){const {setFile}=await import('./cdp.mjs');await setFile(c,s,'#rom',rom);try{await until(c,s,"$('build').disabled===false");}catch(error){console.error(await run("$('status').textContent"));throw error;}}
 await run("$('cutscenes-tab').click()");
 assert.equal(await run("$('raw-edit').checked"),false);
 assert.equal(await run("$('script-list').children.length"),2);
 assert.equal(await run("$('cutscene-level').options.length"),36);
 assert.equal(await run("document.querySelector('[data-record=\"13\"] input')===null"),true);
 assert.equal(await run("document.querySelector('[data-record=\"7\"] input').value"),'$7F9B');
 assert.equal(await run("document.querySelector('[data-record=\"7\"] input').disabled"),true);
 await run(`window.setShot=val=>{const i=document.querySelector('[data-record="2"] input');i.focus();i.value=val;i.dispatchEvent(new Event('input',{bubbles:true}));i.blur();};setShot('120')`);
 assert.equal(await run('currentData.cutscenes[1][1].args[0]'),0x1278);
 assert.equal(await run(`document.querySelector('[data-record="2"] p').textContent`),'camera: on target, 120 frames, style 110');
 assert.equal(await run(`document.querySelectorAll('[data-record="2"] input').length`),5);
 assert.equal(await run(`document.querySelector('[data-record="2"]').textContent.includes('zoom -3 to -3')`),true);
 assert.equal(await run(`document.querySelector('[data-record="2"] input[data-arg="3"]')===null`),true);
 await run("ModelEditorHistory.undo()");assert.equal(await run('currentData.cutscenes[1][1].args[0]'),0x122d);
 await run("ModelEditorHistory.redo()");assert.equal(await run('currentData.cutscenes[1][1].args[0]'),0x1278);
 await run("$('raw-edit').click()");assert.equal(await run("document.querySelectorAll('[data-record=\"13\"] input').length"),4);
 await run(`(()=>{const i=document.querySelector('[data-record="2"] input[data-arg="3"]');i.value='1210';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 assert.equal(await run(`document.querySelector('[data-record="2"]').textContent.includes('zoom -1 to -1')`),true);
 await run(`(()=>{const i=document.querySelector('[data-record="2"] input[data-arg="3"]');i.value='F800';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 assert.equal(await run(`document.querySelector('[data-record="2"]').textContent.includes('zoom -3 to 5')`),true);
 await run(`(()=>{const i=document.querySelector('[data-record="2"] input[data-arg="3"]');i.value='0000';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await run("$('raw-edit').click()");
 // Rejected input cannot overwrite the record; a valid correction clears the error.
 await run("setShot('256')");assert.equal(await run('currentData.cutscenes[1][1].args[0]'),0x1278);await run("setShot('120')");
 await run(`(()=>{const i=document.querySelector('[data-record="1"] input');i.value='2';i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 assert.equal(await run('currentData.levels[1][0].text'),2);assert.match(await run("document.querySelector('[data-record=\"1\"] p').textContent"),/A different line/);
 await run("$('dialogue-tab').click();$('lines').value='2';$('lines').onchange()");
 assert.equal(await run("document.querySelector('#holds input').value"),'3');
 await run("document.querySelector('#holds input').value='5';document.querySelector('#holds input').dispatchEvent(new Event('input',{bubbles:true}));$('cutscenes-tab').click()");
 assert.equal(await run('currentData.cutscenes[1][0].args[1]'),5);
 // Shared persistence survives a full page load, and raw editing returns to its safe default.
 await run('persistSession()');await c.send('Page.navigate',{url},s);await until(c,s,"$('build').disabled===false");
 assert.equal(await run('currentData.cutscenes[1][1].args[0]'),0x1278);assert.equal(await run('currentData.cutscenes[1][0].args[1]'),5);
 await run("$('cutscenes-tab').click();$('build').click()");await until(c,s,"$('status').textContent.includes('ROM downloaded')");
 for(let i=0;i<50&&!fs.existsSync(path.join(tmp,'story-patched.z64'));i++)await sleep(100);
 const output=fs.readFileSync(path.join(tmp,'story-patched.z64')),built=new S.Project(output);
 assert.equal(built.data.cutscenes[1][1].args[0],0x1278);assert.equal(built.data.cutscenes[1][0].args[0],2);assert.equal(built.data.cutscenes[1][0].args[1],5);
 await run("$('ips').click()");await until(c,s,"$('status').textContent.includes('IPS downloaded')");
 for(let i=0;i<50&&!fs.existsSync(path.join(tmp,'story-patched.ips'));i++)await sleep(100);
 assert.deepEqual(fs.readFileSync(path.join(tmp,'story-patched.ips')),Buffer.from(S.ips(fs.readFileSync(rom),output)));
 await run("$('save').click()");await until(c,s,"$('status').textContent.includes('Edits downloaded')");
 for(let i=0;i<50&&!fs.existsSync(path.join(tmp,'story-edits.json'));i++)await sleep(100);
 assert.equal(JSON.parse(fs.readFileSync(path.join(tmp,'story-edits.json'))).cutscenes[1][1].args[0],0x1278);
 for(const width of [1400,390,360]){
  await c.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500},s);await sleep(250);
  assert.equal(await run(`document.documentElement.scrollWidth<=${width}`),true,`${width}px horizontal overflow`);
  await run(width<500?`document.querySelector('[data-record="2"]').scrollIntoView()`:"$('cutscenes-panel').scrollIntoView()");const shot=await c.send('Page.captureScreenshot',{format:'png'},s);fs.writeFileSync(path.join(tmp,`cutscenes-${width}.png`),Buffer.from(shot.data,'base64'));
 }
 assert.deepEqual(c.errors,[]);console.log(`Cutscenes browser: safe defaults, edits, undo/redo, session restore, ROM/IPS/JSON and 1400/390/360px passed; screenshots ${tmp}`);
}catch(error){console.error(c.errors);throw error;}finally{c.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
