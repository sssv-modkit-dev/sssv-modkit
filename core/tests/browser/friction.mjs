// Private acceptance: FRICTION_SITE, FRICTION_ROM and FRICTION_EVIDENCE supply local inputs.
// One Chrome instance; no ROM or derived table is written to disk.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {launch,open,evaluate,until,setFile,sleep} from './cdp.mjs';
const site=process.env.FRICTION_SITE,rom=process.env.FRICTION_ROM,evidence=process.env.FRICTION_EVIDENCE;
assert.ok(site&&rom&&evidence,'Set FRICTION_SITE, FRICTION_ROM and FRICTION_EVIDENCE');
fs.mkdirSync(evidence,{recursive:true});
const server=spawn('python',['-c',"import mimetypes,runpy;mimetypes.add_type('text/javascript','.mjs');runpy.run_module('http.server',run_name='__main__')",'8768','--bind','127.0.0.1','--directory',site],{stdio:'ignore',windowsHide:true});
await sleep(500);const c=await launch(9338),results=[],progress=[];
const js=(s,code)=>evaluate(c,s,code);
let s;
async function check(code,label){assert.ok(await js(s,code),label);results.push(label);}
async function go(page,width){
 if(!s)s=await open(c,'about:blank');
 await c.send('Emulation.setDeviceMetricsOverride',{width,height:width<768?930:1080,deviceScaleFactor:1,mobile:width<768},s);
 await c.send('Page.navigate',{url:`http://127.0.0.1:8768/${page}.html`},s);
 await until(c,s,"document.readyState==='complete'&&!!document.getElementById('session-state')");
 await until(c,s,page==='model-editor'?'!!ModelEditorHost.getSource()':page==='level-editor'?'!!window.SSSVLevelRom':page==='dialogue'||page==='terrain'?'ready&&!busy':page==='play'?"!document.getElementById('b-go').disabled":'true',180000);
 await until(c,s,"document.getElementById('session-state').textContent.includes('US 1.0 verified')");
 await check("document.querySelectorAll('.global-nav').length===1&&document.querySelectorAll('.global-nav>a').length===6",`${page} ${width}: one six-page navigation`);
 await check("document.getElementById('session-state').textContent.includes('US 1.0 verified')",`${page} ${width}: verified source restored`);
 await check('document.documentElement.scrollWidth<=innerWidth',`${page} ${width}: no horizontal overflow`);
}
async function screenshot(name){console.log(name+' checks passed');await js(s,'scrollTo(0,0)');await sleep(80);const r=await c.send('Page.captureScreenshot',{format:'png'},s);fs.writeFileSync(`${evidence}/${name}.png`,Buffer.from(r.data,'base64'));}
try{
 for(const width of [1920,430]){
  s=await open(c,'http://127.0.0.1:8768/model-editor.html');
  await c.send('Emulation.setDeviceMetricsOverride',{width,height:width<768?930:1080,deviceScaleFactor:1,mobile:width<768},s);
  await until(c,s,"!!document.getElementById('session-state')");
  await js(s,"window.indexUpdates=[];new MutationObserver(()=>indexUpdates.push(document.getElementById('session-state').textContent)).observe(document.getElementById('session-state'),{childList:true})");
  await setFile(c,s,'#source-file',rom);
  await until(c,s,'!!ModelEditorHost.getSource()',180000);
  progress.push(...await js(s,'indexUpdates'));
  await check("document.getElementById('session-state').textContent.includes('US 1.0 verified')",`model ${width}: verified ROM`);
  await check("(async()=>{try{await ROMSession.identify(ROMSession.normalize(new ArrayBuffer(12)));return false;}catch(error){return error.message.includes('unzipped SSSV US ROM');}})()",`model ${width}: plain wrong-file error`);
  await js(s,"document.getElementById('find-demo-picker').value='dog';document.getElementById('find-demo-picker').dispatchEvent(new Event('input'))");await sleep(80);
  await check("[...document.querySelectorAll('#demo-picker [data-model]')].filter(b=>b.dataset.filtered!=='true').every(b=>b.textContent.toLowerCase().includes('dog'))",`model ${width}: animal filter`);
  await js(s,"pick('dog');selectedSym=parsed[0].sym;selectedParts.clear();selectedParts.add(selectedSym);sel=0;mesh[selectedSym]={s:[1.2000000476837158,1,1],m:[0,0,0]};ui();info()");
  await check("document.querySelector('#mesh input[aria-label=\"Scale X value\"]').value==='1.2'",`model ${width}: rounded restored scale`);
  await check("[...document.querySelectorAll('#parts .custom-part-name')].length===parsed.length",`model ${width}: friendly part names`);
  await check("!document.getElementById('model-pose').textContent.includes('Exploded')",`model ${width}: parts excluded from pose`);
  await js(s,"sheet=true;assembled=false;pick('dog')");await check('poseOk()&&assembled&&!sheet',`model ${width}: valid view on animal change`);
  await js(s,"const v=document.getElementById('variant');v.value=v.options[0].value;v.onchange()");await check('assembled===poseOk()&&sheet===!poseOk()',`model ${width}: valid view on variant change`);
  await js(s,"selectedSym=parsed[0].sym;selectedParts.clear();selectedParts.add(selectedSym);sel=0;ui();info();ModelEditorHistory.reset();window.oldScale=mesh[selectedSym]?.s?.[0]||1;const n=document.querySelector('#mesh input[aria-label=\"Scale X value\"]');n.focus();n.value='1.4';n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));n.blur()");await sleep(80);
  await check('Math.abs(mesh[selectedSym].s[0]-1.4)<1e-6',`model ${width}: live numeric edit`);
  await js(s,'ModelEditorHistory.undo()');await check('Math.abs((mesh[selectedSym]?.s[0]||1)-oldScale)<1e-6',`model ${width}: numeric undo`);
  await screenshot(`friction-model-${width}`);
  await go('level-editor',width);
  await check("!document.getElementById('ed-category').hidden",`level ${width}: visible category filter`);
  await js(s,"document.getElementById('ed-category').value='animals';document.getElementById('ed-category').dispatchEvent(new Event('change'))");
  await check("[...document.querySelectorAll('#object-tree summary')].every(e=>!e.textContent.includes('portal'))",`level ${width}: category filters object tree`);
  await js(s,"window.camBefore=JSON.stringify(editorSession.camera.t);const b=document.querySelector('#object-tree button');b.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await check("JSON.stringify(editorSession.camera.t)!==camBefore",`level ${width}: double-click in object tree focuses the camera`);
  await js(s,"document.getElementById('ed-category').value='all';document.getElementById('ed-category').dispatchEvent(new Event('change'));document.getElementById('ed-tool-add').click();document.getElementById('find-pal-grid').value='dog';document.getElementById('find-pal-grid').dispatchEvent(new Event('input'))");
  await check("[...document.querySelectorAll('#pal-grid button')].filter(b=>b.dataset.filtered!=='true').every(b=>b.textContent.toLowerCase().includes('dog'))",`level ${width}: palette filter`);
  await js(s,"window.beforeX=+document.getElementById('ed-x').value;window.undoCount=editorSession.undo?.length;const n=document.getElementById('ed-x-slider');n.value=beforeX+1;n.dispatchEvent(new Event('input'));n.value=beforeX+2;n.dispatchEvent(new Event('input'));n.dispatchEvent(new Event('change'))");
  await check("+document.getElementById('ed-x').value===beforeX+2",`level ${width}: slider applies live`);
  await js(s,"document.getElementById('ed-undo').click()");await check("+document.getElementById('ed-x').value===beforeX",`level ${width}: slider gesture is one undo`);
  await js(s,"document.getElementById('ed-redo').click()");await check("+document.getElementById('ed-x').value===beforeX+2",`level ${width}: slider redo`);
  await screenshot(`friction-level-${width}`);
  await go('dialogue',width);
  await js(s,"(async()=>{window.bankID=document.getElementById('bank').value;window.lineID=document.getElementById('lines').value;window.originalText=document.getElementById('text').value;document.getElementById('text').value='T052';document.getElementById('text').dispatchEvent(new Event('input'));await persistSession()})()");
  const story=await js(s,'({bank:bankID,line:lineID,text:originalText})');
  await check("!(document.getElementById('ips').disabled)",`dialogue ${width}: valid edit enables IPS`);
  await screenshot(`friction-dialogue-${width}`);
  await go('terrain',width);
  await check(`localData.banks[${JSON.stringify(story.bank)}].strings[${JSON.stringify(story.line)}]==='T052'`,`terrain ${width}: dialogue edits restored`);
  await js(s,"(async()=>{const ctx=document.getElementById('sheet').getContext('2d');window.basePixel=[...ctx.getImageData(0,0,1,1).data];ctx.fillStyle=basePixel[0]>128?'#000000':'#ffffff';ctx.fillRect(0,0,1,1);changed();await persistSession()})()");
  await check('dirty',`terrain ${width}: painted sheet persisted`);
  await js(s,"document.getElementById('terrain-level').value='2';document.getElementById('terrain-level').dispatchEvent(new Event('change'))");
  await until(c,s,"ready&&!busy&&document.getElementById('terrain-level').value==='2'");
  await check('!!terrainSheets[1]',`terrain ${width}: changing level retains painted sheet`);
  await js(s,"(async()=>{const ctx=document.getElementById('sheet').getContext('2d');window.secondOffset=4*(2*34*272+4*34);window.secondPixel=ctx.getImageData(0,0,272,136).data[secondOffset];ctx.fillStyle=secondPixel>128?'#000000':'#ffffff';ctx.fillRect(4*34,2*34,1,1);changed();await persistSession()})()");
  // Deny downloads. Exercise the real build button and inspect its result only in browser memory.
  await c.send('Browser.setDownloadBehavior',{behavior:'deny'});
  await js(s,"window.capturedBuild=null;const build=project.build.bind(project);project.build=(...args)=>{const rom=build(...args);capturedBuild={rom,args};return rom;};document.getElementById('build').click()");
  await until(c,s,'!!window.capturedBuild&&!busy',180000);
  await check(`(()=>{const out=new StoryROM.Project(capturedBuild.rom);return out.data.banks[${JSON.stringify(story.bank)}].strings[${JSON.stringify(story.line)}]==='T052'&&out.sheet(1)[0]!==basePixel[0]})()`,`terrain ${width}: one build contains dialogue and paint`);
  await check('new StoryROM.Project(capturedBuild.rom).sheet(2)[secondOffset]!==secondPixel',`terrain ${width}: build includes both painted sheets`);
  await screenshot(`friction-terrain-${width}`);
  await go('dialogue',width);await check(`localData.banks[${JSON.stringify(story.bank)}].strings[${JSON.stringify(story.line)}]==='T052'`,`dialogue ${width}: edit survives page return`);
  await go('play',width);await screenshot(`friction-play-${width}`);
  await go('index',width);await screenshot(`friction-home-${width}`);
  const oldHash=await js(s,'ROMSession.get().then(value=>value.hash)'),peer=await open(c,'http://127.0.0.1:8768/index.html');
  await until(c,peer,"document.getElementById('session-state')?.textContent.includes('US 1.0 verified')");
  await js(s,'confirm=()=>true;document.getElementById("forget-rom").click()');await sleep(500);await until(c,s,"document.getElementById('session-state')?.textContent==='No ROM loaded'");
  await check("(async()=>((await ROMSession.read('rom'))===undefined&&(await ROMSession.read('story'))===undefined&&(await ROMSession.read('terrain'))===undefined))()",`session ${width}: Forget removes ROM and shared edits`);
  await until(c,peer,"document.getElementById('session-state')?.textContent==='No ROM loaded'");
  await check(`(async()=>{try{await ROMSession.write('story',{hash:${JSON.stringify(oldHash)},data:{}});return false;}catch(error){return error.message.includes('forgotten');}})()`,`session ${width}: stale writes cannot restore forgotten data`);
  const peerInfo=await c.send('Target.getTargetInfo',{},peer);await c.send('Target.closeTarget',{targetId:peerInfo.targetInfo.targetId});
  const {targetInfo}=await c.send('Target.getTargetInfo',{},s);await c.send('Target.closeTarget',{targetId:targetInfo.targetId});s=null;
 }
 assert.ok(progress.some(p=>p.includes('MB')&&p.includes('received')),'measured Pyodide byte progress');
 assert.ok(progress.some(p=>p.includes('Reading animals')||p.includes('index')),'actual indexing phase');
 assert.deepEqual(c.errors,[],'no browser exceptions or failed resources');
 fs.writeFileSync(`${evidence}/friction-checks.json`,JSON.stringify({results,progress,errors:c.errors},null,2));
 console.log(`Friction: ${results.length} checks passed at 1920 and 430 px, with shared ROM, combined in-memory build and measured runtime progress.`);
}finally{c.close();server.kill();}
