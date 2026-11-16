// ROM-free real canvas tests for tile tools and shared keyboard routing.
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launch,open,evaluate,until,sleep,findChrome} from './cdp.mjs';
if(!findChrome()){console.log('SKIP tile tools: Chrome unavailable');process.exit(0);}
const site=path.resolve('.scratch/T059/site');
execFileSync('python',['src/build_site.py','--pack','packs/sample','--out',site,'--no-vendor']);
const server=spawn('python',['-m','http.server','8769','--bind','127.0.0.1','--directory',site],{stdio:'ignore',windowsHide:true});
await sleep(500);const c=await launch(9349);
try{
 const s=await open(c,'http://127.0.0.1:8769/textures.html');
 await until(c,s,"document.readyState==='complete'");
 await evaluate(c,s,`(async()=>{
  localData={banks:{}};project={original:localData,sheet(){const p=new Uint8ClampedArray(272*136*4);for(let i=3;i<p.length;i+=4)p[i]=255;return p;}};await terrain();
  window.key=(key,options={})=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
  window.pixel=(x,y)=>Array.from($('tile').getContext('2d').getImageData(x,y,1,1).data).slice(0,3).join(',');
  window.stroke=(x,y,u=x,v=y,cancel=false)=>{const t=$('tile'),r=t.getBoundingClientRect(),ev=(a,b)=>({button:0,pointerId:1,clientX:r.left+(a+.5)*r.width/32,clientY:r.top+(b+.5)*r.height/32,preventDefault(){}});const capture=t.setPointerCapture;t.setPointerCapture=()=>{};t.onpointerdown(ev(x,y));t.onpointermove(ev(u,v));if(cancel)key('Escape');else t.onpointerup(ev(u,v));t.setPointerCapture=capture;};
 })()`);
 const run=code=>evaluate(c,s,code);
 assert.equal(await run("$('undo').disabled&&$('redo').disabled"),true);
 await run("$('colour').value='#ff0000';key('g');stroke(0,0)");
 assert.equal(await run('pixel(31,31)'),'255,0,0');
 await run("key('z',{ctrlKey:true})");assert.equal(await run('pixel(31,31)'),'0,0,0');
 assert.equal(await run("$('redo').disabled"),false);
 await run("key('z',{ctrlKey:true,shiftKey:true});key('z',{ctrlKey:true});key('y',{ctrlKey:true})");assert.equal(await run('pixel(31,31)'),'255,0,0');
 await run("key('Delete');$('colour').value='#00ff00';key('l');stroke(1,1,5,5)");
 assert.equal(await run('pixel(3,3)'),'0,255,0');assert.equal(await run('pixel(3,4)'),'0,0,0');
 await run("key('r');stroke(8,8,12,12)");assert.equal(await run('pixel(8,10)'),'0,255,0');assert.equal(await run('pixel(10,10)'),'0,0,0');
 await run("key('r',{shiftKey:true});stroke(15,15,18,18)");assert.equal(await run('pixel(16,16)'),'0,255,0');
 await run("key('Delete');key('b');$('colour').value='#112233';stroke(2,3);key('h')");assert.equal(await run('pixel(29,3)'),'17,34,51');
 await run("key('v')");assert.equal(await run('pixel(29,28)'),'17,34,51');
 await run("key('t')");assert.equal(await run('pixel(3,29)'),'17,34,51');
 await run("$('colour').value='#ffffff';key('i');stroke(3,29)");assert.equal(await run("$('colour').value"),'#112233');
 await run("key('c',{ctrlKey:true});document.querySelectorAll('[data-tile]')[1].click();key('v',{ctrlKey:true})");assert.equal(await run('pixel(3,29)'),'17,34,51');
 await run("key('e');stroke(3,29)");assert.equal(await run('pixel(3,29)'),'0,0,0');
 await run("key('z',{ctrlKey:true});key('b');$('colour').value='#abcdef';stroke(0,0,8,8,true)");assert.equal(await run('pixel(0,0)'),'0,0,0');
 await run("$('tile-number').focus();$('tile-number').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}));$('tile-number').dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));");assert.equal(await run('pixel(3,29)'),'17,34,51');
 await run("$('tile-number').blur();key('#');key('+');key('?')");assert.equal(await run("document.querySelector('.pixel-grid')!==null"),true);
 await c.send('Emulation.setDeviceMetricsOverride',{width:360,height:740,deviceScaleFactor:1,mobile:true},s);
 await until(c,s,"document.body.classList.contains('editor-phone')");
 assert.equal(await run('document.documentElement.scrollWidth<=360'),true);
 await c.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5},s);
 await run("document.querySelector('details[open]')?.removeAttribute('open');key('b');$('colour').value='#654321';$('tile-zoom').value='0';$('tile-zoom').onchange();$('tile').scrollIntoView({block:'center'});");
 await sleep(250);
 const point=await run("(()=>{const r=$('tile').getBoundingClientRect();return {x:r.left+4.5*r.width/32,y:r.top+4.5*r.height/32};})()");
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]},s);
 await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},s);await sleep(100);
 assert.equal(await run('pixel(4,4)'),'101,67,33');
 await run("document.querySelector('.tile-tools').scrollIntoView({block:'start'});");
 const shot=await c.send('Page.captureScreenshot',{format:'png'},s);fs.writeFileSync('.scratch/T059/tile-tools-360.png',Buffer.from(shot.data,'base64'));
 await run("key('b');const size=document.querySelector('.tile-tools select');size.value='3';size.onchange();$('colour').value='#ff00ff';stroke(10,10);");
 assert.equal(await run('pixel(9,9)'),'255,0,255');assert.equal(await run('pixel(11,11)'),'255,0,255');assert.equal(await run('pixel(12,12)'),'0,0,0');
 await run("key('x')");assert.equal(await run("$('colour').value"),'#000000');
 // Help and editor-specific routing on every built page.
 for(const name of ['model-editor','level-editor','dialogue','terrain']){
  const t=await open(c,`http://127.0.0.1:8769/${name}.html`);await until(c,t,"document.readyState==='complete'");
  await evaluate(c,t,"window.key=(key,options={})=>document.body.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));key('?');");
  assert.equal(await evaluate(c,t,"Array.from(document.querySelectorAll('summary')).some(e=>e.textContent==='Keyboard shortcuts (?)'&&e.parentElement.open)"),true);
  if(name==='dialogue'){
   await evaluate(c,t,`(async()=>{localData={banks:{0:{title:'Test',strings:{0:'Hello'}}},levels:{1:[]},capacities:{0:1000},help:''};await dialogue();$('text').focus();$('text').value='Changed';$('text').dispatchEvent(new Event('input',{bubbles:true}));$('text').blur();await Promise.resolve();key('z',{ctrlKey:true});})()`);
   assert.equal(await evaluate(c,t,"$('text').value"),'Hello');
   await evaluate(c,t,"key('y',{ctrlKey:true})");assert.equal(await evaluate(c,t,"$('text').value"),'Changed');
  }
  if(name==='level-editor'){
   await until(c,t,"!!window.EditorShortcuts&&!!document.getElementById('ed-duplicate').onclick");
   const count=()=>evaluate(c,t,"document.querySelectorAll('#ed-object option').length");const n=await count();
   await evaluate(c,t,"document.getElementById('ed-object').value='props:1';document.getElementById('ed-object').onchange();");
   await evaluate(c,t,"key('c',{ctrlKey:true});key('v',{ctrlKey:true})");assert.equal(await count(),n+1);
   await evaluate(c,t,"key('z',{ctrlKey:true})");assert.equal(await count(),n);
   await evaluate(c,t,"key('y',{ctrlKey:true})");assert.equal(await count(),n+1);
   await evaluate(c,t,"const select=document.getElementById('ed-object');select.value=Array.from(select.options).filter(o=>o.value.startsWith('props:')).at(-1).value;select.onchange();key('Delete');");assert.equal(await count(),n);
   await evaluate(c,t,"key('Escape')");assert.equal(await evaluate(c,t,"document.getElementById('ed-count').textContent"),'0 selected');
  }
  if(name==='model-editor'){
   await until(c,t,'!!window.EditorShortcuts&&!!window.ModelEditorHistory');
   // Isolate key routing from the model data, keeping the real history instance.
   await evaluate(c,t,"window.historyValue=0;ModelEditorHistory.configure({capture:()=>({n:historyValue}),restore:v=>historyValue=v.n});ModelEditorHistory.transaction(()=>historyValue=1);key('z',{ctrlKey:true});");
   assert.equal(await evaluate(c,t,'historyValue'),0);await evaluate(c,t,"key('y',{ctrlKey:true})");assert.equal(await evaluate(c,t,'historyValue'),1);
  }
 }
 assert.deepEqual(c.errors,[]);
 console.log('Tile tools: synthetic canvas fill/line/rect/filled rect, transforms, pick, erase, copy/paste, keyboard history/cancel, input guard, grid, zoom, 360px layout, real touch, 3px brush, swap and all-page help passed.');
}finally{c.close();server.kill();}

