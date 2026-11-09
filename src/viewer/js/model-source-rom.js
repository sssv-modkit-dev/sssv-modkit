/* SSSV pack: load the user's own animal_table.json and US 1.0 ROM into the Model Editor through ModelEditorHost. */
(()=>{
const $=id=>document.getElementById(id),H=window.ModelEditorHost;
let partsTable=H.embeddedTable||{};
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
  if(!Object.keys(partsTable).length){H.message('Choose your local animal_table.json first.');return false}
  if(ab.byteLength!=0x2000000&&ab.byteLength!=0x1000000&&ab.byteLength<0x800000){H.message('That does not look like an N64 ROM.');return false}
  let ok='';try{const h=[...new Uint8Array(await crypto.subtle.digest('SHA-1',ab))].map(x=>x.toString(16).padStart(2,'0')).join('');
    ok=h=='e5e09205aa743a9e5043a42df72adc379c746b0b'?'SHA1 matches US 1.0.':'WARNING: not the unmodified US 1.0 ROM (a patched ROM is fine for previewing).'}catch(_){}
  const error=H.useSource({table:partsTable,bytes:ab,label:(restored?'Restored saved ROM: ':'')+filename,note:ok});
  if(error){H.message(error);return false}
  $('forget-source').disabled=false;return true;
}
$('local-table').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{if(f.size>16000000)throw new Error('Table is too large (16 MB maximum).');const next=normaliseLocalTable(JSON.parse(await f.text()));partsTable=next;
    $('source-file').disabled=false;H.message(Object.keys(next).length+' animals indexed locally. Now choose your ROM.');
  }catch(err){H.message('Could not read table: '+err.message)}finally{e.target.value=''}
};
$('source-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;const ab=await f.arrayBuffer();
  try{if(await loadROM(ab,f.name)&&$('remember-source').checked){try{await saveLastROM(ab,f.name);$('msg').textContent+=' Last ROM saved in this browser.'}catch(err){$('msg').textContent+=' Could not save a local copy for next time: '+err.message}}}catch(err){H.message('Could not render ROM with that table: '+err.message)}
};
$('forget-source').onclick=async()=>{try{await forgetLastROM();$('forget-source').disabled=true;H.message('Saved ROM forgotten. The currently loaded ROM remains available until you close this page.')}catch(err){H.message('Could not clear saved ROM: '+err.message)}};
if(!Object.keys(partsTable).length)$('source-file').disabled=true;
else{H.message('Animal table embedded in this private build. Choose your ROM; remembering it is optional.');
  (async()=>{try{const saved=await getLastROM();if(saved&&saved.buffer){H.message('Restoring your last ROM from this browser…');await loadROM(saved.buffer,saved.filename||'last ROM',true)}}catch(err){H.message('Choose your ROM file to begin. Local auto-restore is unavailable in this browser: '+err.message)}})();}
// Build & Play (public builds only, where handoff.js and play.html ship): hand the game config and the ROM loaded here
// (in memory, as a Blob) to play.html, which builds the patched ROM in the browser.
if(window.SSSVHandoff){$('build-play').hidden=false;$('build-play').onclick=()=>{
  const say=t=>{(demoMode?$('demo-status'):$('msg')).textContent=t};
  if(demoMode||!cur||!dv.byteLength){say('Build & Play needs a game config: open your animal table and US 1.0 ROM first. Demo presets are not ROM patches.');return}
  try{SSSVHandoff.openPlay({parts:gameConfig(),partsName:name+'.json',rom:new Blob([dv.buffer]),romName:'ROM loaded in Model Editor',source:'Model Editor'});say('Opened Play with '+name+' and your loaded ROM. Press Build & Play there.')}
  catch(e){say(e.message)}
}}
})();
