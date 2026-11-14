/* SSSV pack: decode the user's own ROM in the browser and open every level in the Level Editor. Runs after loader.js. */
// Local ROM path: choose a stock or compatible modded ROM; every level becomes a gallery card.
document.getElementById('level-rom')?.addEventListener('change',async event=>{
  const input=event.target,file=input.files[0],status=document.getElementById('load-status');
  if(!file)return;input.disabled=true;
  try{
    status.textContent='Checking your local ROM…';
    const rom=LevelRom.normalize(await file.arrayBuffer()).buffer,bundle=await LevelRom.decode(rom,message=>status.textContent=message);
    try{bundle.ANIM=await LevelAnimalAssembly.fromROM(rom,message=>status.textContent=message);}catch(error){console.warn('Captured animal previews unavailable:',error.message);}
    const data=SceneImport.fromBundle(bundle);
    window.SSSVLevelRom=file;  // in memory only: Build & Play hands it to play.html (handoff.js)
    enterEditor(data,false);
  }catch(error){status.textContent=error.message;input.disabled=false;input.value='';}
});
// Build & Play: hand the project (and the ROM this page decoded, if any) to play.html; handoff.js waits for its ready message.
window.LevelEditorPlay=(project,parts)=>{const rom=window.SSSVLevelRom||null;
  window.SSSVHandoff.openPlay({level:EditsExport.toBuilderProject(project),levelName:'Level Editor project'+(parts?' + '+parts.name:''),rom,romName:rom?rom.name:undefined,source:'Level Editor'});
  return rom?'Opened Play with this project and your ROM. Press Build & Play there.':'Opened Play with this project. Choose your US 1.0 ROM there, then press Build & Play.';};
