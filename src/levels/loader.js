let editorSession=null;
const query=new URLSearchParams(location.search),$g=id=>document.getElementById(id);
function enterEditor(data,demo){
  editorSession=startLevelEditor(data);
  $g('setup').hidden=true;
  const list=$g('gallery-list'),select=$g('lv');
  const close=()=>{$g('gallery').hidden=true;$g('gallery-open').focus();};
  const pick=index=>{select.value=index;select.onchange();LevelGallery.mark(list,index);close();};
  LevelGallery.render(list,data,pick,'demo/heads/');
  $g('gallery-source').textContent=demo?'Bundled demo level, no ROM needed':data.SOURCE_LABEL+' · '+data.LEVELS.length+' levels';
  $g('gallery-rom').hidden=!demo;
  $g('gallery-open').onclick=()=>{LevelGallery.mark(list,select.value);$g('gallery').hidden=false;(list.querySelector('[aria-current="true"]')||list.firstChild)?.focus();};
  $g('gallery-close').onclick=close;
  $g('gallery').addEventListener('click',e=>{if(e.target===$g('gallery'))close();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$g('gallery').hidden)close();});
  LevelGallery.mark(list,select.value||0);
}
// Local ROM path: choose a stock or compatible modded ROM; every level becomes a gallery card.
document.getElementById('level-rom').addEventListener('change',async event=>{
  const input=event.target,file=input.files[0],status=document.getElementById('load-status');
  if(!file)return;input.disabled=true;
  try{
    status.textContent='Checking your local ROM…';
    const data=await LevelRom.decode(await file.arrayBuffer(),message=>status.textContent=message);
    window.SSSVLevelRom=file;  // in memory only: Build & Play hands it to play.html (handoff.js)
    enterEditor(data,false);
  }catch(error){status.textContent=error.message;input.disabled=false;input.value='';}
});
// Default path: the bundled demo level opens with no ROM. ?rom=1 (or a failed fetch, e.g. file://) shows the ROM chooser instead.
async function showChooser(note){
  $g('setup').hidden=false;$g('demo-back').hidden=!query.has('rom');
  if(note)$g('load-status').textContent=note;
}
(async()=>{
  if(query.has('rom'))return showChooser();
  try{
    const response=await fetch('demo/level-4.json');
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();
    if(data.format!=='sssv-demo-level-v1')throw Error('Unexpected demo bundle');
    enterEditor(data,true);
  }catch(error){showChooser('The bundled demo level could not be loaded ('+error.message+'). Choose your own ROM to begin.');}
})();
