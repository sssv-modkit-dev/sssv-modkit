/* SSSV pack: decode the user's own ROM in the browser and open every level in the Level Editor. Runs after loader.js. */
// Local ROM path: choose a stock or compatible modded ROM; every level becomes a gallery card.
document.getElementById('level-rom')?.addEventListener('change',async event=>{
  const input=event.target,file=input.files[0],status=document.getElementById('load-status');
  if(!file)return;input.disabled=true;
  try{
    status.textContent='Checking your local ROM…';
    const data=SceneImport.fromBundle(await LevelRom.decode(await file.arrayBuffer(),message=>status.textContent=message));
    window.SSSVLevelRom=file;  // in memory only: Build & Play hands it to play.html (handoff.js)
    enterEditor(data,false);
  }catch(error){status.textContent=error.message;input.disabled=false;input.value='';}
});
