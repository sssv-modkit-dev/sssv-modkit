(()=>{'use strict';
const $=id=>document.getElementById(id),base=['load','path','patches'],depth=['models','textures','levels','dialogue'];
let saved;try{saved=JSON.parse(sessionStorage.getItem('guided-path')||'null');}catch{}
let state={step:'load',path:'patch',demo:false,patches:[],...saved},source=null,manifest=[],result=null,busy=false,cpData=null;
{const p=new URLSearchParams(location.search).get('path');if(p==='patch'||p==='depth')state.path=p;}  // home page: Quick build / Customize step by step
if(!Array.isArray(state.patches))state.patches=[];
const chosen=()=>state.patches.filter(id=>manifest.some(p=>p.id===id&&p.status==='available'));
const REQUIRES={'health-energy':'minimap','objectives-hud':'minimap'};
async function classicPlus(){if(!cpData)cpData=await fetch('classicplus.json').then(r=>{if(!r.ok)throw Error('Could not load the patch data. Reload this page.');return r.json();});return cpData;}
const steps=()=>[...base,...(state.path==='depth'?depth:[]),'review'];
const remember=()=>sessionStorage.setItem('guided-path',JSON.stringify(state));
const same=(record)=>record&&record.hash===source?.hash?record:null;
async function inputs(){if(state.path!=='depth')return [];const rows=await Promise.all(['model','level','story','terrain'].map(k=>ROMSession.read(k)));return rows.map(same);}
async function review(){
 const [model,level,story,tiles]=await inputs(),list=$('review-list');list.replaceChildren();
 const add=text=>{const li=document.createElement('li');li.textContent=text;list.append(li);};
 add(source&&!state.demo?'Source: '+source.name:'No ROM: preview only');
 const picks=chosen().length?ClassicPlus.resolve(await classicPlus(),chosen()):[],names=picks.map(id=>manifest.find(p=>p.id===id)?.name||id);add(picks.length?'Patches: '+names.join(', '):'Patches: none selected');
 if(picks.length&&ClassicPlus.needsPak(await classicPlus(),picks))add('Needs the Expansion Pak (8 MB). Turn it on in your emulator or console.');
 const n=model?.config?.animals?.length||0,l=Object.keys(level?.project?.edits?.levels||{}).length,t=Object.keys(tiles?.sheets||{}).length;
 add(`Model changes: ${n} config${n===1?'':'s'}`);add(`Level changes: ${l} stage${l===1?'':'s'}`);add(`Painted tilesets: ${t}`);add(story?'Dialogue session saved':'Dialogue: unchanged');
 const edits=n||l||t||story||picks.length;
 $('build-note').textContent=state.demo||!source?'Building is disabled. Go Back to load your own US 1.0 ROM.':!source.verified?'Building needs the unmodified US 1.0 ROM. Go Back and choose that source.':!edits?(state.path==='patch'?'Patch only excludes saved editor changes. No patches are selected, so this build is an unchanged copy of your ROM.':'No edits or patches selected. Build creates an unchanged copy of your ROM.'):state.path==='patch'?'The selected patches are applied to your ROM.':'All saved editor changes listed above are included, including changes made outside this path, then the selected patches.';
 $('guide-build').disabled=!source?.verified||state.demo||busy;
}
async function render(){
 const path=steps();if(!path.includes(state.step))state.step='patches';const i=path.indexOf(state.step);
 for(const el of document.querySelectorAll('[data-step]'))el.hidden=el.dataset.step!==state.step;
 $('step-label').textContent=`Step ${i+1} of ${path.length} · ${state.demo?'Preview without a ROM':source?'ROM ready':'Load a ROM to build'}`;
 $('guide-progress').max=path.length;$('guide-progress').value=i+1;
 $('guide-back').disabled=i===0||busy;$('guide-next').disabled=busy||state.step==='load'&&!source&&!state.demo;$('guide-next').hidden=state.step==='review';
 $('guide-skip').hidden=!depth.includes(state.step);$('load-note').textContent=source?'Remembered ROM: '+source.name:'No ROM loaded.';$('without-rom').hidden=!!source;
 document.querySelector(`input[name=path][value=${state.path}]`).checked=true;remember();if(state.step==='review')await review();
}
function advance(delta){const path=steps();state.step=path[Math.max(0,Math.min(path.length-1,path.indexOf(state.step)+delta))];result=null;$('guide-play').hidden=true;$('download-rom').disabled=$('download-ips').disabled=true;render().catch(fail);}
function fail(e){$('guide-error').textContent=e.message;}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
async function build(){
 if(busy||!source?.verified||state.demo)return;busy=true;result=null;$('guide-error').textContent='';$('guide-play').hidden=true;$('download-rom').disabled=$('download-ips').disabled=true;await render();
 try{
 const [model,level,story,tiles]=await inputs(),parts=model?.config?.animals?.length?model.config:level?.project?.parts?.config;
 let bytes=source.buffer.slice(0);const edits=level?.project?.edits;
 $('build-status').textContent='Building your saved changes…';
 if(parts||Object.keys(edits?.levels||{}).length){const built=await SSSVBuilder.build({rom:new Blob([bytes]),parts:parts||undefined,level:edits&&Object.keys(edits.levels).length?EditsExport.toBuilderDiff(edits):undefined},{onProgress:p=>{$('build-status').textContent=p.detail||p.stage;}});bytes=await built.rom.arrayBuffer();}
 if(story||Object.keys(tiles?.sheets||{}).length){const project=new StoryROM.Project(bytes);bytes=project.build(story?.data||project.data,Object.values(tiles?.sheets||{}));}
 if(chosen().length){const data=await classicPlus(),picks=ClassicPlus.resolve(data,chosen()),wanted=ClassicPlus.art(data,picks);let pictures={};
  if(wanted.length){$('build-status').textContent='Drawing patch pictures from your ROM…';pictures=await SSSVBuilder.art(new Blob([source.buffer]),wanted,{onProgress:p=>{$('build-status').textContent=p.detail||'Drawing patch pictures from your ROM…';}});}
  $('build-status').textContent='Applying patches…';bytes=ClassicPlus.apply(new Uint8Array(source.buffer),new Uint8Array(bytes),data,picks,pictures).buffer;}
 const rom=new Blob([bytes]),ips=new Blob([StoryROM.ips(new Uint8Array(source.buffer),new Uint8Array(bytes))]);
 await ROMSession.write('guided-build',{hash:source.hash,rom,name:'guided-build.z64'});result={rom,ips};
 $('guide-play').hidden=false;$('download-rom').disabled=$('download-ips').disabled=false;$('build-status').textContent='Build ready. Download it or open Play to try this build.';
 }catch(e){fail(e);$('build-status').textContent='Build stopped. Your source ROM and saved edits are still available.';}finally{busy=false;await render();}
}
document.addEventListener('DOMContentLoaded',async()=>{try{
 source=await ROMSession.get();manifest=await fetch('patches.json').then(r=>{if(!r.ok)throw Error('Could not load patch options. Reload this page.');return r.json();});
 for(const category of ['bugfix','qol']){const title=document.createElement('h3');title.textContent=category==='bugfix'?'Bugfixes':'Quality of life';$('patch-list').append(title);for(const item of manifest.filter(p=>p.category===category)){const ready=item.status==='available',label=document.createElement('label');label.className='patch'+(ready?'':' unavailable');const check=document.createElement('input');check.type='checkbox';check.disabled=!ready;check.value=item.id;check.checked=ready&&state.patches.includes(item.id);check.onchange=()=>{let next=check.checked?[...new Set([...state.patches,item.id])]:state.patches.filter(id=>id!==item.id);if(check.checked&&REQUIRES[item.id])next=[...new Set([...next,REQUIRES[item.id]])];if(!check.checked)next=next.filter(id=>REQUIRES[id]!==item.id);state.patches=next;for(const box of document.querySelectorAll('#patch-list input'))box.checked=state.patches.includes(box.value);remember();};const span=document.createElement('span'),name=document.createElement('strong'),desc=document.createElement('small');name.textContent=ready?item.name:item.name+' · '+(item.status==='coming-soon'?'Coming soon':'Not included in this build');desc.textContent=item.description;span.append(name,desc);label.append(check,span);$('patch-list').append(label);}}
 $('rom').addEventListener('change',async()=>{source=await ROMSession.get();state.demo=false;render().catch(fail);});
 $('without-rom').onclick=()=>{state.demo=true;advance(1);};$('guide-next').onclick=()=>advance(1);$('guide-back').onclick=()=>advance(-1);$('guide-skip').onclick=()=>advance(1);
 for(const radio of document.querySelectorAll('input[name=path]'))radio.onchange=()=>{state.path=radio.value;render().catch(fail);};
 $('guide-build').onclick=build;$('download-rom').onclick=()=>result&&download(result.rom,'guided-build.z64');$('download-ips').onclick=()=>result&&download(result.ips,'guided-build.ips');
 await render();
 }catch(e){fail(e);}});
})();
