// Current ROM-free interface captures. Uses the existing core browser helper.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const core=path.resolve(process.argv[2]);
const {launch,open,until,evaluate,sleep}=await import(pathToFileURL(path.join(core,'tests/browser/cdp.mjs')));
const server=spawn('python',['-m','http.server','8774','--bind','127.0.0.1','--directory',path.join(root,'build/docs-review')],{stdio:'ignore',windowsHide:true});
const images=path.join(root,'docs/images/guides');fs.mkdirSync(images,{recursive:true});
let c;
try{
 await sleep(700);c=await launch(9344);
 for(const page of ['start','model-editor','textures','level-editor','dialogue','play']){
  const s=await open(c,'http://127.0.0.1:8774/'+page+'.html');
  await until(c,s,"document.readyState==='complete'");
  if(!await evaluate(c,s,"!!document.querySelector('.global-nav a[href=\"guides.html\"]')"))throw Error('Missing global Guides link on '+page);
  if(page==='model-editor'){
   await until(c,s,"typeof startDemos==='function'");
   await evaluate(c,s,"startDemos('wind-up robot')");
  }
  if(page==='level-editor')await until(c,s,"document.getElementById('setup').hidden");
  await sleep(500);
  const shot=await c.send('Page.captureScreenshot',{format:'png'},s);
  fs.writeFileSync(path.join(images,page+'.png'),Buffer.from(shot.data,'base64'));
  console.log('Captured '+page);
 }
 for(const width of [390,1400]){
  const s=await open(c,'http://127.0.0.1:8774/guides.html');
  await c.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768},s);
  await until(c,s,"document.readyState==='complete'");
  if(!await evaluate(c,s,"document.documentElement.scrollWidth<=innerWidth"))throw Error('Guide overflow at '+width);
  const shot=await c.send('Page.captureScreenshot',{format:'png'},s);
  fs.writeFileSync(path.join(root,'build/docs-review-'+width+'.png'),Buffer.from(shot.data,'base64'));
 }
 console.log('Guides fit desktop and phone; captures contain no supplied ROM.');
}finally{c?.close();server.kill();}
