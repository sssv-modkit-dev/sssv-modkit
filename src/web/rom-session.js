/* One local source across the editors. IndexedDB never sends file contents to a server. */
(()=>{
'use strict';
const DB='sssv-editor-session',STORE='state',US='e5e09205aa743a9e5043a42df72adc379c746b0b';
let active=null,revision=0;
const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('sssv-editor-session'):null;
if(channel)channel.onmessage=event=>{if(event.data==='forgotten'){active=null;window.dispatchEvent(new Event('rom-session-forgotten'));location.reload();}};
async function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Browser storage is unavailable. Allow local site storage and check again.'));});}
async function storage(key,value,remove=false){const d=await db();try{return await new Promise((resolve,reject)=>{const tx=d.transaction(STORE,value===undefined&&!remove?'readonly':'readwrite'),s=tx.objectStore(STORE),r=remove?s.delete(key):value===undefined?s.get(key):s.put(value,key);let result;r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(Error('Could not save this browser session. Free local site storage and check again.'));});}finally{d.close();}}
// The source check and edit write share a transaction: a stale tab cannot restore forgotten data.
async function write(key,value){const d=await db();try{await new Promise((resolve,reject)=>{const tx=d.transaction(STORE,'readwrite'),s=tx.objectStore(STORE),r=s.get('rom');let stale=false;r.onsuccess=()=>{if(!r.result||r.result.hash!==value.hash){stale=true;tx.abort();}else s.put(value,key);};tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error(stale?'The shared ROM changed or was forgotten. Reload this editor before continuing.':'Could not save these edits. Free local site storage and try again.'));});}finally{d.close();}}
function normalize(buffer){const b=new Uint8Array(buffer.slice(0));if(b.length<0x800000||b.length>0x1000000||b.length%4)throw Error('Choose an unzipped SSSV US ROM (.z64, .v64 or .n64), 8–16 MB.');const magic=new DataView(b.buffer).getUint32(0);if(magic===0x37804012)for(let i=0;i<b.length;i+=2)[b[i],b[i+1]]=[b[i+1],b[i]];else if(magic===0x40123780)for(let i=0;i<b.length;i+=4)[b[i],b[i+1],b[i+2],b[i+3]]=[b[i+3],b[i+2],b[i+1],b[i]];else if(magic!==0x80371240)throw Error('This file is not an unzipped Nintendo 64 ROM. Choose your SSSV US ROM.');return b.buffer;}
async function identify(buffer){const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-1',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==US){const b=new Uint8Array(buffer),title=new TextDecoder().decode(b.slice(0x20,0x34));if(!title.includes('SSSV')&&!title.includes('SILICON VALLEY'))throw Error('This ROM is for a different game. Choose your SSSV US ROM.');if(b[0x3e]!==0x45)throw Error('This ROM is for another region. Choose the US version.');}return {hash,verified:hash===US};}
function show(text){const e=document.getElementById('session-state');if(e)e.textContent=text;}
async function get(){if(active)return active;const saved=await storage('rom');if(saved){const identity=await identify(saved.buffer);if(identity.hash!==saved.hash)throw Error('The saved ROM copy could not be verified. Choose your ROM again.');active={...saved,...identity};}return active;}
async function set(file){const buffer=normalize(await file.arrayBuffer()),identity=await identify(buffer),old=await get();if(old?.hash!==identity.hash){if(window.EditorROMBeforeReplace&&!window.EditorROMBeforeReplace())throw Error('ROM change cancelled. Your shared ROM and edits are still here.');await storage('story',null);await storage('terrain',null);await storage('table',null);await storage('model',null);await storage('level',null);await storage('guided-build',null);}active={buffer,name:file.name,...identity};await storage('rom',active);revision++;showState();return active;}
function showState(){window.dispatchEvent(new Event('rom-session-ready'));const summary=document.querySelector('#source-panel>summary');if(summary){summary.textContent=active?'Change ROM':'Open ROM';if(active)summary.parentElement.open=false;}show(active?`${active.verified?'US 1.0 verified':'Modified US ROM · original identity not verified'} · ${active.name}`:'No ROM loaded');const b=document.getElementById('forget-rom');if(b)b.disabled=!active;}
async function forget(){revision++;active=null;const d=await db();try{await new Promise((resolve,reject)=>{const t=d.transaction(STORE,'readwrite');t.objectStore(STORE).clear();t.oncomplete=resolve;t.onerror=()=>reject(t.error);});}finally{d.close();}await new Promise(resolve=>{const r=indexedDB.deleteDatabase('sssv-modkit-viewer');r.onsuccess=r.onerror=r.onblocked=resolve;});channel?.postMessage('forgotten');window.dispatchEvent(new Event('rom-session-forgotten'));location.reload();}
window.ROMSession={get,set,forget,read:key=>storage(key),write,normalize,identify,show};
document.addEventListener('DOMContentLoaded',async()=>{
 const nav=document.querySelector('.global-nav'),box=document.createElement('div');box.id='rom-session';
 const state=document.createElement('output');state.id='session-state';state.setAttribute('role','status');
 const button=document.createElement('button');button.id='forget-rom';button.textContent='Forget ROM';button.disabled=true;button.onclick=()=>{if(confirm('Forget the shared ROM and saved edits stored in this browser?'))forget().catch(e=>show(e.message));};
 box.title='ROM and edits are remembered locally across editors until you choose Forget ROM. Nothing is uploaded.';box.append(state,button);
 if(nav)nav.append(box);else document.body.prepend(box);
 const input=document.querySelector('#source-file,#level-rom,#rom,#b-rom');
 // The pack's older optional cache is superseded by this one shared source.
 const remember=document.getElementById('remember-source'),legacyForget=document.getElementById('forget-source');
 if(remember){remember.checked=false;remember.closest('label').hidden=true;}
 if(legacyForget)legacyForget.hidden=true;
 const legacyEdits=document.getElementById('remember-edits');if(legacyEdits){legacyEdits.checked=false;legacyEdits.closest('div').hidden=true;}
 if(window.ModelEditorHost){const use=ModelEditorHost.useSource.bind(ModelEditorHost);ModelEditorHost.useSource=value=>{
   if(active){const b=new Uint8Array(value.bytes),a=new Uint8Array(active.buffer);if(a.length!==b.length||a.some((v,i)=>v!==b[i]))return 'The shared ROM has changed. Choose your ROM again to continue.';}
   return use(value);
 };}
 let replay=false,loading=false;
 const deliver=value=>{const files=new DataTransfer();files.items.add(new File([value.buffer],value.name,{type:'application/octet-stream'}));input.files=files.files;replay=true;input.dispatchEvent(new Event('change',{bubbles:true}));replay=false;};
 const browse=document.createElement('label');browse.className='rom-browse';browse.textContent='Browse ROM';
 const picker=document.createElement('input');picker.type='file';picker.accept='.z64,.v64,.n64';picker.id='session-rom-file';picker.setAttribute('aria-label','Browse for your SSSV ROM');browse.append(picker);box.insertBefore(browse,button);
 picker.addEventListener('change',async()=>{const file=picker.files[0];if(!file||loading)return;loading=true;picker.disabled=true;show('Checking ROM identity…');try{const value=await set(file);if(input)deliver(value);}catch(error){show(error.message);}finally{picker.value='';picker.disabled=false;loading=false;}});
 document.addEventListener('change',event=>{if(event.target!==input||replay)return;event.stopImmediatePropagation();const file=input.files[0];if(!file||loading)return;loading=true;const oldDisabled=input.disabled;input.disabled=true;show('Checking ROM identity…');set(file).then(deliver).catch(error=>{input.value='';show(error.message);}).finally(()=>{loading=false;input.disabled=oldDisabled;});},true);
 // Indexing reports actual worker stages and elapsed time; no invented percentage.
 const builder=window.SSSVBuilder;
 if(builder)builder.workerUrl='runtime-progress-worker.js';
 if(builder?.deriveTable){const derive=builder.deriveTable.bind(builder);builder.deriveTable=async(buffer,options={})=>{
   const hash=(await identify(normalize(buffer))).hash,cached=await storage('table');if(cached?.hash===hash){showState();return cached.value;}
   const start=performance.now();let phase='Starting animal index';const progress=document.createElement('progress');progress.id='index-progress';box.append(progress);
   const render=()=>show(`${phase} · ${Math.floor((performance.now()-start)/1000)} s · first index may take 30–60 s`),timer=setInterval(render,1000);render();
   try{const value=await derive(buffer,{...options,onProgress:p=>{phase=p.stage==='runtime'?'Loading Python runtime (about 12 MB, then cached): '+p.detail:p.detail;render();options.onProgress?.(p);}});await write('table',{hash,value});showState();return value;}
   catch(error){const message="Animal indexing could not finish. Check that this site's Python runtime files are available, then choose your ROM again.";show(message);throw Error(message);}
   finally{clearInterval(timer);progress.remove();}
 };}
 try{await get();showState();if(input&&active&&!input.files.length&&!(input.id==='b-rom'&&new URLSearchParams(location.search).get('build')==='guided')){const token=revision;setTimeout(()=>{if(token===revision&&!input.files.length)deliver(active);},100);}}catch(error){show(error.message);}
});
})();
