// Device-emulated interaction regression. Optional MOBILE_SITE / MOBILE_ROM / MOBILE_TABLE
// validate a separately built content pack; MOBILE_EVIDENCE keeps private screenshots there.
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {launch,open,evaluate,until,setFile,sleep,findChrome} from './cdp.mjs';
if(!findChrome()){console.log('SKIP mobile: Chrome unavailable');process.exit(0);}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mobile-'));
const site=process.env.MOBILE_SITE||path.join(tmp,'site'),evidence=process.env.MOBILE_EVIDENCE;
if(!process.env.MOBILE_SITE)execFileSync('python',[path.join(root,'src/build_site.py'),'--pack',path.join(root,'packs/sample'),'--out',site,'--no-vendor']);
const server=spawn('python',['-c',"import mimetypes,runpy;mimetypes.add_type('text/javascript','.mjs');runpy.run_module('http.server',run_name='__main__')",'8767','--bind','127.0.0.1','--directory',site],{stdio:'ignore',windowsHide:true});
await sleep(700);const c=await launch(9337),results=[];
const js=(s,code)=>evaluate(c,s,code);
async function screenshot(s,name){if(evidence){fs.mkdirSync(evidence,{recursive:true});const r=await c.send('Page.captureScreenshot',{format:'png'},s);fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from(r.data,'base64'));}}
async function touch(s,x,y,dx=0,dy=0){
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]},s);
 if(dx||dy)for(let i=1;i<=5;i++)await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/5,y:y+dy*i/5}]},s);
 await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},s);await sleep(40);
}
async function rect(s,selector){return js(s,`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`);}
async function mode(s,value){await js(s,`document.getElementById('mobile-touch-mode').value=${JSON.stringify(value)};document.getElementById('mobile-touch-mode').dispatchEvent(new Event('change'))`);}
try{
 for(const [width,height] of [[360,740],[430,930],[1920,1080]])for(const page of ['model-editor','level-editor','terrain','dialogue']){
  const s=await open(c,`http://127.0.0.1:8767/${page}.html`);
  await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<768},s);
  await c.send('Emulation.setTouchEmulationEnabled',{enabled:width<768,maxTouchPoints:5},s);
  await until(c,s,"document.readyState==='complete'");
  const rom=process.env.MOBILE_ROM;
  if(rom){
   // A shared source auto-loads after navigation. Do not race it by waiting for
   // the transient "table indexed" message from the old manual upload flow.
   const shared=await js(s,"(async()=>!!(await window.ROMSession?.get()))()");
   if(page==='model-editor'){
    if(!shared){await setFile(c,s,'#local-table',process.env.MOBILE_TABLE);await until(c,s,"document.getElementById('msg').textContent.includes('indexed locally')");await setFile(c,s,'#source-file',rom);}
    await until(c,s,'!!ModelEditorHost.getSource()&&EditorSession.ready',60000);
   }else if(page==='level-editor'){
    await until(c,s,"document.getElementById('setup').hidden");
    if(!shared)await setFile(c,s,'#level-rom',rom);await until(c,s,"!!window.SSSVLevelRom && EditorSession.ready && document.getElementById('setup').hidden",60000);
   }else{if(!shared)await setFile(c,s,'#rom',rom);await until(c,s,'ready && !busy',60000);}
  }else if(page==='model-editor')await until(c,s,"typeof demoPreset==='function'");
  else if(page==='level-editor'){
   await until(c,s,"document.getElementById('setup').hidden");
   await js(s,"fetch(document.querySelector('meta[name=default-scene]').content).then(r=>r.json()).then(doc=>enterEditor(doc,true))");
  }
  await sleep(250);
  const check=async(code,label)=>assert.ok(await js(s,code),`${page} ${width}: ${label}`);
  await check('document.documentElement.scrollWidth<=innerWidth','no page horizontal overflow');
  await screenshot(s,`after-${page}-${width}`);
  if(width<768){
   await check("document.body.classList.contains('editor-phone')",'shared phone workspace');
   await check("document.querySelector('#mobile-panels').getBoundingClientRect().height>=44",'44 px toggle');
   await check("[...document.querySelectorAll('button,select,summary,input:not([type=hidden]):not([type=checkbox])')].filter(e=>e.getClientRects().length).every(e=>e.getBoundingClientRect().height>=44)",'44 px visible controls');
   if(page==='model-editor'||page==='level-editor'){
    await check("(t=>!!t&&document.elementFromPoint(t.getBoundingClientRect().x+20,t.getBoundingClientRect().y+20)?.closest('#mobile-desktop-tip')===t)(document.getElementById('mobile-desktop-tip'))",'desktop tip visible on phones');
    await js(s,"document.getElementById('mobile-desktop-tip-close').click()");
    await check("!document.getElementById('mobile-desktop-tip')&&localStorage.getItem('editor-desktop-tip-dismissed')==='1'",'desktop tip dismiss remembered');
    await check("document.getElementById('mobile-dock').getBoundingClientRect().top>=document.getElementById('mobile-viewport').getBoundingClientRect().bottom",'panels below canvas');
    await check("[...document.querySelectorAll('#mobile-camera button')].every(b=>b.getBoundingClientRect().height>=44&&b.getBoundingClientRect().width>=44)",'44 px camera buttons');
    await js(s,"document.getElementById('mobile-panels').click()");await check("getComputedStyle(document.getElementById('mobile-dock')).display==='none'",'hide all panels');
    await js(s,"document.getElementById('mobile-panels').click();document.getElementById('mobile-fullscreen').click()");
    await check("document.getElementById('mobile-viewport').getBoundingClientRect().height>innerHeight-100",'full screen canvas');
    if(page==='model-editor')await check("dist>=cameraFit(...sceneBounds,cameraRotation(),cv.clientWidth/cv.clientHeight).distance*.99",'whole model framed in full screen');
    await screenshot(s,`fullscreen-${page}-${width}`);
    await js(s,"document.getElementById('mobile-fullscreen').click()");
    const cameraState=page==='model-editor'?'[yaw,pit,dist,...ctr]':'Object.values(editorSession.camera).flat()';
    for(const id of ['touch-left','touch-panright','touch-in']){
     const before=await js(s,`JSON.stringify(${cameraState})`);await js(s,`document.getElementById('${id}').click()`);
     assert.notEqual(await js(s,`JSON.stringify(${cameraState})`),before,`${page} ${id} works`);
    }
    await js(s,"document.getElementById('touch-reset').click()");
    const cv=page==='model-editor'?'#cv':'#c',r=await rect(s,cv),x=r.width/2,y=r.y+r.height/2;
    if(page==='model-editor'){
     for(const m of ['orbit','pan','zoom']){
      await mode(s,m);const before=await js(s,`JSON.stringify(${cameraState})`);await touch(s,x,y,36,20);
      assert.notEqual(await js(s,`JSON.stringify(${cameraState})`),before,`model touch ${m}`);
     }
     await js(s,"document.getElementById('camera-reset').click();document.getElementById('demo-explode').click()");await sleep(120);
     // Find a projected sheet part, then exercise the actual touch pointer path.
     const p=await js(s,`(()=>{const r=cv.getBoundingClientRect();for(let y=20;y<r.height;y+=12)for(let x=20;x<r.width;x+=12)if(pickPart(r.x+x,r.y+y))return [r.x+x,r.y+y];return null})()`);
     assert.ok(p,'a part is visible');await mode(s,'part');const before=await js(s,'JSON.stringify(partOffsets)');await touch(s,...p,24,12);assert.notEqual(await js(s,'JSON.stringify(partOffsets)'),before,'touch moves sheet part');
     const q=await js(s,`(()=>{const r=cv.getBoundingClientRect();for(let y=20;y<r.height;y+=12)for(let x=20;x<r.width;x+=12)if(pickPart(r.x+x,r.y+y))return [r.x+x,r.y+y]})()`);
     await mode(s,'rename');await touch(s,...q);await check("!document.getElementById('part-inspector').hidden",'tap rename');
     await js(s,"document.getElementById('part-name').value='Mobile test part';document.getElementById('part-name').dispatchEvent(new Event('input'));document.getElementById('part-name-close').click();scrollTo(0,0)");
     await mode(s,'isolate');await touch(s,...q);await check("!document.getElementById('back-to-sheet').hidden",'tap isolate');
     await js(s,"document.getElementById('back-to-sheet').click()");
    }else{
     await js(s,"document.getElementById('ed-tool-pan').click()");
     for(const m of ['look','pan']){await mode(s,m);const before=await js(s,`JSON.stringify(${cameraState})`),yawBefore=await js(s,'editorSession.camera.yaw');await touch(s,x,y,30,20);assert.notEqual(await js(s,`JSON.stringify(${cameraState})`),before,`level touch ${m}`);if(m==='look')assert.notEqual(await js(s,'editorSession.camera.yaw'),yawBefore,'explicit look overrides pan tool');}
     await js(s,"document.getElementById('touch-reset').click();document.getElementById('ed-tool-add').click();document.querySelector('#pal-grid button').click();scrollTo(0,0)");await mode(s,'tool');
     const count='editorSession.records[editorSession.level.id].animals.length',old=await js(s,count);
     await touch(s,x,y);assert.equal(await js(s,count),old,'first touch previews');await touch(s,x,y);assert.equal(await js(s,count),old+1,'second touch places exactly one');
     await js(s,"document.getElementById('ed-undo').click()");assert.equal(await js(s,count),old,'placement undo');await js(s,"document.getElementById('ed-redo').click()");assert.equal(await js(s,count),old+1,'placement redo');
     await check("document.getElementById('pal-hint').textContent.includes('tap to preview and tap again to place')",'placement help retained');
     await check("!!document.getElementById('ed-height')&&!!document.getElementById('ed-snap')&&!!document.getElementById('ed-add')",'touch object modifiers');
    }
   }else if(page==='terrain'&&rom){
    await check("document.querySelector('.sheet-scroll').scrollWidth>document.querySelector('.sheet-scroll').clientWidth",'deliberate sheet scroll');
    await check("document.getElementById('tile').getBoundingClientRect().width>=32*44",'44 px brush pixels');
    const r=await rect(s,'#tile'),x=r.x+22,y=r.y+22;
    await js(s,"document.getElementById('colour').value='#ff00ff'");await touch(s,x,y);await check('dirty','tap paints');await js(s,"document.getElementById('undo').click()");await check('!dirty','undo restores original');
    await js(s,"document.getElementById('eyedropper').click()");await touch(s,x,y);await check("!document.getElementById('recolour').disabled&&!dirty",'touch colour pick does not paint');
    await mode(s,'navigate');const before=await js(s,"document.querySelector('.tile-scroll').scrollLeft");await touch(s,x+100,y+70,-60,0);await check(`document.querySelector('.tile-scroll').scrollLeft>${before}`,'touch pans tile');
    const size=await js(s,"document.getElementById('tile').getBoundingClientRect().width");
    await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:90,y:y+60},{x:190,y:y+60}]},s);await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:60,y:y+60},{x:220,y:y+60}]},s);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},s);
    await check(`document.getElementById('tile').getBoundingClientRect().width>${size}`,'pinch zoom');
   }else if(page==='dialogue'&&rom){
    await check("[...document.querySelectorAll('#lines-list button')].every(b=>getComputedStyle(b).whiteSpace==='pre-wrap'&&b.scrollWidth<=b.clientWidth)",'full wrapping lines');
    await js(s,"document.querySelector('#lines-list button').click()");await check("document.getElementById('text').value.length>0",'tap selects editable line');
    await check("[...document.querySelectorAll('#waits details')].every(d=>!d.open&&d.querySelectorAll('input').length<=10)",'wait groups collapsed');
    await js(s,"document.getElementById('wait-search').value='0';document.getElementById('wait-search').dispatchEvent(new Event('input'))");
    await check("[...document.querySelectorAll('#waits details')].every(d=>d.open)",'wait search opens matches');
    await check("document.getElementById('rom-name').textContent===document.getElementById('rom').files[0].name",'full ROM filename');
   }
   const panelSelector=page==='model-editor'?'#side':page==='level-editor'?'#add-panel':page==='terrain'?'.sheet-scroll':'#lines-list';
   await js(s,`document.querySelector(${JSON.stringify(panelSelector)}).scrollIntoView({block:'center'})`);
   await check("document.getElementById('mobile-toolbar').getBoundingClientRect().top===0",'panel toggle remains reachable while scrolling');
   await screenshot(s,`panels-${page}-${width}`);
   await js(s,'scrollTo(0,0)');
   // Crossing the breakpoint restores desktop anchors, then the same phone layout.
   await c.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false},s);
   await until(c,s,"!document.getElementById('mobile-dock')",3000).catch(()=>{});
   await check("!document.getElementById('mobile-dock')",'desktop restoration');
   await c.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true},s);await sleep(80);
   await until(c,s,"document.body.classList.contains('editor-phone')",3000).catch(async error=>{throw Error(error.message+' '+JSON.stringify(await js(s,"({width:innerWidth,media:matchMedia('(max-width:767px)').matches,errors:document.body.className})"))+' '+JSON.stringify(c.errors));});
  }else{
   await check("!document.getElementById('mobile-dock')",'desktop unchanged');
   await check("!document.getElementById('mobile-desktop-tip')",'no desktop tip on desktop');
   if(page==='model-editor')await check("getComputedStyle(document.body).display==='grid'&&document.getElementById('view-settings').parentElement.id!=='side'&&getComputedStyle(document.getElementById('view-settings')).position==='absolute'",'desktop model columns and floating viewport panel');
   if(page==='level-editor')await check("document.getElementById('project-panel').parentElement.id==='level-right'&&getComputedStyle(document.getElementById('objects-panel')).position==='fixed'",'desktop anchored tree and rail');
  }
  await js(s,'localStorage.clear()');
  results.push({page,width,romLoaded:!!rom,passed:true});console.log(`Mobile checks: ${page} ${width} passed`);
  const {targetInfo}=await c.send('Target.getTargetInfo',{},s);await c.send('Target.closeTarget',{targetId:targetInfo.targetId});
 }
 assert.deepEqual(c.errors,[],'no browser exceptions or resource errors: '+JSON.stringify(c.errors).slice(0,600));
 if(evidence)fs.writeFileSync(path.join(evidence,'mobile-checks.json'),JSON.stringify({results,errors:c.errors},null,2));
 console.log('Mobile layout, touch actions, breakpoint restoration and desktop checks passed.');
}finally{c.close();server.kill();}
