/* SSSV pack: load the user's own animal_table.json and US 1.0 ROM into the Model Editor through ModelEditorHost. */
(()=>{
const $=id=>document.getElementById(id),H=window.ModelEditorHost;
let partsTable=H.embeddedTable||{},providedTable=Object.keys(partsTable).length>0;
const ROM_DB='sssv-modkit-viewer';
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
  ab=normaliseModelROM(ab);
  if(!providedTable){
    if(!window.SSSVBuilder?.deriveTable)throw new Error('Automatic indexing needs this page served over HTTP(S) with its builder files. You can also open an existing animal table.');
    H.message('Reading animals from your ROM...');
    const raw=await window.SSSVBuilder.deriveTable(ab,{onProgress:p=>H.message(p.detail)});
    partsTable=normaliseLocalTable(raw);
  }
  let ok='';try{const h=[...new Uint8Array(await crypto.subtle.digest('SHA-1',ab))].map(x=>x.toString(16).padStart(2,'0')).join('');
    ok=h=='e5e09205aa743a9e5043a42df72adc379c746b0b'?'SHA1 matches US 1.0.':'WARNING: not the unmodified US 1.0 ROM (a patched ROM is fine for previewing).'}catch(_){}
  const error=H.useSource({table:partsTable,bytes:ab,label:(restored?'Restored saved ROM: ':'')+filename,note:ok});
  if(error){H.message(error);return false}
  $('forget-source').disabled=false;return true;
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
