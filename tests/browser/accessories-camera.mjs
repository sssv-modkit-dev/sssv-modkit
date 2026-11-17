import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launch,open,evaluate,until,sleep} from './cdp.mjs';
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'accessories-'));
execFileSync('python',['src/build_site.py','--pack','packs/sample','--out',tmp,'--no-vendor'],{stdio:'inherit'});
const server=spawn('python',['-m','http.server','8779','--bind','127.0.0.1','--directory',tmp],{stdio:'ignore',windowsHide:true});
await sleep(800);
const c=await launch(9357);
try{
 const s=await open(c,'http://127.0.0.1:8779/model-editor.html');
 await until(c,s,"typeof motionRefresh==='function'&&typeof RigPlayer==='object'");
 const result=await evaluate(c,s,`(async()=>{
 const walk=[0,23,32,23,0,-23,-32,-23],rig={body:{hl:390,hw:150,lift:400},neck:[600,400,10],legs:{seg:1,front:{len:[500]},rear:{len:[500]},tables:{walk:[walk,walk]}},parts:parsed.map((p,i)=>i===0?[1,2]:i===1?[1,20]:[3,7])};
 const J=RigPlayer.quadJoints(rig,0,'walk');
 pose={animal:name,anim:rig,parts:parsed.map((p,i)=>{const m=RigPlayer.partMatrix(J,...rig.parts[i],0);return {dl:p.sym,rows:m.R,T:m.T}})};
 BUNDLED_POSES[name]=pose;assembled=true;sheet=false;gallery=false;all=false;ui();rebuild(true);
 const panel=[...document.querySelectorAll('details')].find(d=>d.textContent.includes('Accessories & camera path'));panel.open=true;motionRefresh();
 const click=text=>{const b=[...panel.querySelectorAll('button')].find(b=>b.textContent===text);if(!b||b.disabled)throw Error('Button unavailable: '+text);b.click()};
 const base=nv;click('Add accessory');const added=nv>base;
 ModelEditorHistory.undo();const undo=motionState().accessories.length===0;ModelEditorHistory.redo();
 const redo=motionState().accessories.length===1;
 const a=motionState().accessories[0];a.parent=pose.parts[2].dl;a.offset=[15,4,3];a.scale=[12,8,5];
 animStart('walk');animPaused=true;animShow();motionRefresh();
 const first=accessorySources()[0].xf([1,0,0]);animPhase+=64;animShow();const moved=accessorySources()[0].xf([1,0,0]);
 animPhase=animStartPhase('walk');animShow();yaw=0;pit=0;roll=0;dist=400;ctr=[0,0,0];motionRefresh();click('Set camera key here');
 animPhase=(animStartPhase('walk')+(animFrames('walk')-1)*animStep('walk'))%256;animShow();yaw=1;dist=800;ctr=[20,10,0];motionRefresh();click('Set camera key here');
 const project=demoProject(),serialized=JSON.stringify(project.motion);motionEdits={};applyModelProject(project);const roundtrip=JSON.stringify(motionProject())===serialized;animStop();animStart('walk');animPaused=true;animShow();
 let rejects=false;try{validateMotion({['demo:'+name]:{accessories:[{...a,scale:[-1,1,1]}],keys:[]}})}catch{rejects=true}
 const oldDraw=draw,views=[];draw=size=>{if(Array.isArray(size))views.push({yaw,dist,ctr:ctr.slice(),nv});return oldDraw(size)};
 const saved={yaw,pit,roll,dist,ctr:ctr.slice()};HTMLAnchorElement.prototype.click=function(){};
 await AnimExport.exportGif();draw=oldDraw;
 const restore=JSON.stringify(saved)===JSON.stringify({yaw,pit,roll,dist,ctr});
 const path=views.length===animFrames('walk')&&views[0].yaw===0&&Math.abs(views.at(-1).yaw-1)<1e-9&&views[0].dist===400&&views.at(-1).dist===800;
 const old=draw;draw=()=>{throw Error('synthetic render failure')};let failed=false;try{await AnimExport.exportGif()}catch{failed=JSON.stringify(saved)===JSON.stringify({yaw,pit,roll,dist,ctr})}finally{draw=old}
 animStop();return {added,undo,redo,moves:JSON.stringify(first)!==JSON.stringify(moved),roundtrip,rejects,restore,path,failed,frames:views.length,first:views[0],last:views.at(-1),keys:motionState().keys};
 })()`);
 for(const key of ['added','undo','redo','moves','roundtrip','rejects','restore','path','failed'])assert.ok(result[key],key);
 assert.deepEqual(c.errors,[]);
 console.log('Synthetic browser: '+JSON.stringify(result));
}finally{c.close();server.kill()}


