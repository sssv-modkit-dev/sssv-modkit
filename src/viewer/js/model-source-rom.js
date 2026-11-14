// Local opt-in project storage. A source hash binds edits to matching bytes.
//#MODEL-STORE-START
function makeModelEditStore(storage){
  const prefix='sssv-model-edits-v1:',preference='sssv-model-remember-edits';
  const key=source=>{if(source!=='demo'&&!/^[a-f0-9]{40}$/.test(source||''))throw new Error('A matching source identity is required.');return prefix+source;};
  function project(value){if(!value||value.format!=='model-editor-project-v1'||!Array.isArray(value.demos)||!Array.isArray(value.animals))throw new Error('Invalid remembered edit project.');return value;}
  function forget(){const keys=[];for(let i=0;i<storage.length;i++){const name=storage.key(i);if(name?.startsWith(prefix))keys.push(name);}for(const name of keys)storage.removeItem(name);storage.removeItem(preference);}
  return {enabled:()=>storage.getItem(preference)==='true',setEnabled:enabled=>{if(enabled)storage.setItem(preference,'true');else forget();},forget,
    save(source,value){if(!this.enabled())return false;const encoded=JSON.stringify({format:'sssv-model-local-edits-v1',source,project:project(value)});if(encoded.length>1000000)throw new Error('Edits are too large to remember (1 MB maximum).');storage.setItem(key(source),encoded);return true;},
    load(source){const encoded=storage.getItem(key(source));if(!encoded)return null;if(encoded.length>1000000)throw new Error('Remembered edits are too large.');const saved=JSON.parse(encoded);if(saved.format!=='sssv-model-local-edits-v1'||saved.source!==source)throw new Error('Remembered edits do not match this source.');return project(saved.project);}
  };
}
//#MODEL-STORE-END
if(typeof module!=='undefined')module.exports={makeModelEditStore};
/* SSSV pack: load the user's own animal_table.json and US 1.0 ROM into the Model Editor through ModelEditorHost. */
(()=>{
if(typeof window==='undefined'||!window.ModelEditorHost)return;
const $=id=>document.getElementById(id),H=window.ModelEditorHost;
let partsTable=H.embeddedTable||{},providedTable=Object.keys(partsTable).length>0;
const ROM_DB='sssv-modkit-viewer';
let editStore=null,rememberEdits=null,editTimer=null,loadingROM=false,restoringEdits=false,currentSourceHash=null,currentSourceBytes=null;
try{if(window.localStorage)editStore=makeModelEditStore(window.localStorage);}catch(_){}
function editIdentity(){const source=H.availableSource?.()||H.getSource?.();return source?source.bytes===currentSourceBytes&&currentSourceHash?currentSourceHash:null:'demo';}
function saveEdits(){if(editTimer!==null){clearTimeout(editTimer);editTimer=null;}if(!editStore?.enabled()||loadingROM||restoringEdits||!H.getProject)return;const identity=editIdentity();if(!identity)return;try{editStore.save(identity,H.getProject());}catch(error){H.message('Could not remember edits: '+error.message);}}
function restoreEdits(identity){if(!editStore?.enabled()||!H.applyProject)return false;try{const saved=editStore.load(identity);if(!saved)return false;restoringEdits=true;H.applyProject(saved);if(identity!=='demo'&&!H.getSource?.())H.restoreSource?.();H.expandSourceAnimals?.();return true;}catch(error){H.message('Could not restore remembered edits: '+error.message);return false;}finally{restoringEdits=false;}}
function scheduleEdits(){if(loadingROM||restoringEdits||!editStore?.enabled())return;if(editTimer!==null)clearTimeout(editTimer);editTimer=setTimeout(saveEdits,250);}
if(document.createElement&&$('forget-source')?.before){
 const box=document.createElement('div'),label=document.createElement('label');rememberEdits=document.createElement('input');rememberEdits.type='checkbox';rememberEdits.id='remember-edits';rememberEdits.checked=!!editStore?.enabled();rememberEdits.disabled=!editStore;label.append(rememberEdits,document.createTextNode(' Remember edits in this browser'));
 const explanation=document.createElement('p');explanation.className='mut';explanation.textContent='Only edit descriptions are saved locally and matched to the source ROM. Remembering the ROM itself is separate.';
 const forget=document.createElement('button');forget.type='button';forget.id='forget-edits';forget.textContent='Forget saved edits';forget.disabled=!editStore;
 rememberEdits.onchange=()=>{try{editStore.setEnabled(rememberEdits.checked);if(rememberEdits.checked){saveEdits();H.message('Edits will be remembered locally for this source.');}else H.message('Saved edits forgotten. Current edits remain available until you close this page.');}catch(error){H.message('Could not update remembered edits: '+error.message);rememberEdits.checked=false;}};
 forget.onclick=()=>{try{editStore.forget();rememberEdits.checked=false;H.message('Saved edits forgotten. Your current edits and loaded ROM remain available.');}catch(error){H.message('Could not clear remembered edits: '+error.message);}};
 box.append(label,explanation,forget);$('forget-source').before(box);
}
window.addEventListener?.('model-edits-changed',scheduleEdits);
window.addEventListener?.('pagehide',saveEdits);

function openRomDB(){return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}
  const req=indexedDB.open(ROM_DB,1);
  req.onupgradeneeded=()=>req.result.createObjectStore('state');
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('Could not open local ROM storage'));
})}
async function saveLastROM(ab,filename){const db=await openRomDB();try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('state','readwrite');tx.objectStore('state').put({buffer:ab,filename},'last-rom');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not save ROM'));
})}finally{db.close()}}
async function getLastROM(){const db=await openRomDB();try{return await new Promise((resolve,reject)=>{
  const req=db.transaction('state','readonly').objectStore('state').get('last-rom');
  req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('Could not read saved ROM'));
})}finally{db.close()}}
async function forgetLastROM(){const db=await openRomDB();try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('state','readwrite');tx.objectStore('state').delete('last-rom');
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not clear saved ROM'));
})}finally{db.close()}}
async function loadROM(ab,filename,restored=false){
  saveEdits();loadingROM=true;
  try{
    ab=normaliseModelROM(ab);
    let hash=null,ok='';try{hash=[...new Uint8Array(await crypto.subtle.digest('SHA-1',ab))].map(x=>x.toString(16).padStart(2,'0')).join('');ok=hash==='e5e09205aa743a9e5043a42df72adc379c746b0b'?'SHA1 matches US 1.0.':'WARNING: not the unmodified US 1.0 ROM (a patched ROM is fine for previewing).';}catch(_){}
    if(!providedTable){
      if(!window.SSSVBuilder?.deriveTable)throw new Error('Automatic indexing needs this page served over HTTP(S) with its builder files. You can also open an existing animal table.');
      H.message('Reading animals from your ROM...');
      const raw=await window.SSSVBuilder.deriveTable(ab,{onProgress:p=>H.message(p.detail)});
      partsTable=normaliseLocalTable(raw);
    }
    currentSourceHash=hash;currentSourceBytes=ab;
    const error=H.useSource({table:partsTable,bytes:ab,label:(restored?'Restored saved ROM: ':'')+filename,note:ok});
    if(error){H.message(error);return false}
    const opened=hash&&restoreEdits(hash);H.expandSourceAnimals?.();
    if(opened)H.message('Restored remembered edits for '+filename+'. '+ok);
    if(restored)$('remember-source').checked=true;
    $('forget-source').disabled=false;return true;
  }finally{loadingROM=false;}
}
$('local-table').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{if(f.size>16000000)throw new Error('Table is too large (16 MB maximum).');const next=normaliseLocalTable(JSON.parse(await f.text()));partsTable=next;providedTable=true;
    $('source-file').disabled=false;H.message(Object.keys(next).length+' animals indexed locally. Now choose your ROM.');
  }catch(err){H.message('Could not read table: '+err.message)}finally{e.target.value=''}
};
$('source-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;
  try{const ab=await f.arrayBuffer();if(await loadROM(ab,f.name)&&$('remember-source').checked){try{await saveLastROM(ab,f.name);$('msg').textContent+=' Last ROM saved in this browser.'}catch(err){$('msg').textContent+=' Could not save a local copy for next time: '+err.message}}}catch(err){H.message('Could not render ROM with that table: '+err.message)}
};
$('forget-source').onclick=async()=>{try{await forgetLastROM();$('forget-source').disabled=true;H.message('Saved ROM forgotten. The currently loaded ROM remains available until you close this page.')}catch(err){H.message('Could not clear saved ROM: '+err.message)}};
$('source-file').disabled=false;
restoreEdits('demo');
{H.message(Object.keys(partsTable).length?'Animal table available. Choose your ROM; remembering it is optional.':'Choose your US ROM. Its animal table will be generated locally.');
  (async()=>{try{const saved=await getLastROM();if(saved&&saved.buffer){H.message('Restoring your last ROM from this browser…');await loadROM(saved.buffer,saved.filename||'last ROM',true)}}catch(err){H.message('Choose your ROM file to begin. Local auto-restore is unavailable in this browser: '+err.message)}})();}
// Build & Play (public builds only, where handoff.js and play.html ship): hand the game config and the ROM loaded here
// (in memory, as a Blob) to play.html, which builds the patched ROM in the browser.
if(window.SSSVHandoff){$('build-play').hidden=false;$('build-play').onclick=()=>{
  const say=t=>H.message(t),source=H.getSource?.();
  if(!source){say('Open your US ROM first. Demo presets cannot be built into a ROM.');return}
  const parts=H.getBuildConfig?.();
  if(!parts||!parts.animals?.length){say('Change an animal first, then use Build & Play.');return}
  try{SSSVHandoff.openPlay({parts,partsName:'Animal edits.json',rom:new Blob([source.bytes]),romName:source.label||'ROM loaded in Model Editor',source:'Model Editor'});say('Opened Play with all edited animals and your loaded ROM. Press Build & Play there.')}
  catch(e){say(e.message)}
}}
// Acknowledge disclosures without inline event handlers (the page has a strict CSP).
for(const button of document.querySelectorAll('[data-network-ok]'))button.addEventListener('click',()=>{const note=button.closest('details');if(note)note.hidden=true});
})();
