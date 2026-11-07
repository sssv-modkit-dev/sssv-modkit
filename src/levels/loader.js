let editorSession=null;
const query=new URLSearchParams(location.search),$g=id=>document.getElementById(id);
const meta=name=>document.querySelector('meta[name="'+name+'"]')?.content||'';
function enterEditor(doc,demo){
  const data=Scene.toRuntime(doc);
  editorSession=startLevelEditor(data);
  $g('setup').hidden=true;
  const list=$g('gallery-list'),select=$g('lv');
  const close=()=>{$g('gallery').hidden=true;$g('gallery-open').focus();};
  const pick=index=>{select.value=index;select.onchange();LevelGallery.mark(list,index);close();};
  LevelGallery.render(list,data,pick,meta('scene-icons'));
  $g('gallery-source').textContent=demo?'Bundled demo scene':data.SOURCE_LABEL+' · '+data.LEVELS.length+' levels';
  $g('gallery-open-file').hidden=!demo;
  $g('gallery-open').onclick=()=>{LevelGallery.mark(list,select.value);$g('gallery').hidden=false;(list.querySelector('[aria-current="true"]')||list.firstChild)?.focus();};
  $g('gallery-close').onclick=close;
  $g('gallery').addEventListener('click',e=>{if(e.target===$g('gallery'))close();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$g('gallery').hidden)close();});
  LevelGallery.mark(list,select.value||0);
}
// Open a scene file the user saved or made (scene-v1).
const sceneInput=$g('scene-file');
if(sceneInput)sceneInput.addEventListener('change',async()=>{
  const file=sceneInput.files[0],status=$g('load-status');if(!file)return;
  try{const doc=JSON.parse(await file.text()),errors=Scene.validate(doc);if(errors.length)throw Error(errors.join('; '));enterEditor(doc,false);}
  catch(error){status.textContent='Could not open that scene: '+error.message;}finally{sceneInput.value='';}
});
// Default path: the pack's default scene opens first. ?open=1 (or a failed fetch, e.g. file://) shows the file chooser instead.
async function showChooser(note){
  $g('setup').hidden=false;$g('demo-back').hidden=!query.has('open');
  if(note)$g('load-status').textContent=note;
}
(async()=>{
  if(query.has('open'))return showChooser();
  try{
    if(!meta('default-scene'))return showChooser();
    const response=await fetch(meta('default-scene'));
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json(),errors=Scene.validate(data);
    if(errors.length)throw Error(errors.join('; '));
    enterEditor(data,true);
  }catch(error){showChooser('The bundled demo level could not be loaded ('+error.message+'). Open a file to begin.');}
})();
