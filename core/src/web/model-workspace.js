/* Keep editing sections discoverable while reserving the canvas for the model. */
(()=>{
 const side=document.getElementById('side'),right=document.getElementById('edit-side');
 const el=id=>document.getElementById(id),chooser=el('model-chooser');
 el('parts-panel').before(el('model-state-bar'));
 const network=el('model-header').querySelector('.net-note');
 if(network)el('about-controls').append(network);
 const source=el('source-panel');
 if(source){right.append(source);if(el('source-file')&&el('model-header').querySelector('.global-nav'))source.querySelector('summary').textContent='ROM options';}

 const phone=matchMedia('(max-width:767px) and (orientation:portrait)');
 const drawer=el('model-drawer-tabs'),drawerButtons=[...drawer.querySelectorAll('button')],pad=el('model-camera-pad');
 const dragMode=el('mobile-touch-mode'),fullscreen=el('model-fullscreen');
 function fullView(on){
  document.body.classList.toggle('model-fullscreen',on);
  fullscreen.textContent=on?'Exit full-screen':'Full-screen view';
  fullscreen.setAttribute('aria-pressed',String(on));
  window.dispatchEvent(new Event('resize'));
  if(on)window.EditorTouch?.fit();
 }
 fullscreen.onclick=()=>fullView(!document.body.classList.contains('model-fullscreen'));
 function selectDrawer(name){
  document.body.dataset.modelDrawer=name;
  for(const button of drawerButtons){
   const selected=button.dataset.drawer===name;
   button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;
  }
  if(name==='animals')chooser.open=true;
  side.setAttribute('aria-labelledby','drawer-'+name);
 }
 for(const [i,button] of drawerButtons.entries()){
  button.onclick=()=>selectDrawer(button.dataset.drawer);
  button.onkeydown=event=>{
   const index={ArrowLeft:(i+2)%3,ArrowRight:(i+1)%3,Home:0,End:2}[event.key];
   if(index===undefined)return;
   event.preventDefault();drawerButtons[index].click();drawerButtons[index].focus();
  };
 }
 function syncPhone(){
  drawer.hidden=pad.hidden=!phone.matches;
  el('model-header-settings').open=!phone.matches;
  if(phone.matches){
   side.setAttribute('role','tabpanel');right.setAttribute('role','tabpanel');right.setAttribute('aria-labelledby','drawer-edit');
   selectDrawer(document.body.dataset.modelDrawer||'animals');
  }else{
   fullView(false);side.removeAttribute('role');side.removeAttribute('aria-labelledby');right.removeAttribute('role');right.removeAttribute('aria-labelledby');
  }
 }
 phone.addEventListener('change',syncPhone);syncPhone();
 el('demo-picker').addEventListener('click',event=>{
  if(!event.target.closest('button[data-model]'))return;
  chooser.open=false;
  if(phone.matches){selectDrawer('parts');drawerButtons[1].focus();}
  else el('model-chooser-label').focus();
 });
 function fillPad(){
  const adapter=window.EditorTouch;
  if(!adapter)return;
  dragMode.replaceChildren(...adapter.modes.map(([value,label])=>new Option(label,value)));
  dragMode.value=adapter.mode;
  dragMode.onchange=()=>adapter.mode=dragMode.value;
  const group=pad.querySelector('.model-camera-buttons');
  group.replaceChildren(...adapter.buttons.map(([action,label])=>{
   const button=document.createElement('button');
   button.type='button';button.id='touch-'+action;button.textContent=label;button.onclick=()=>adapter.action(action);
   return button;
  }));
 }
 window.addEventListener('editor-touch-ready',fillPad);fillPad();
 const timeline=el('anim-timeline'),playback=document.createElement('div'),exportMenu=document.createElement('details');
 playback.className='animation-playback';exportMenu.id='animation-export';
 const exportLabel=document.createElement('summary'),exportOptions=document.createElement('div');
 exportLabel.textContent='Export';exportOptions.className='animation-export-options';
 exportMenu.append(exportLabel,exportOptions);
 for(const id of ['anim-frame-mode','anim-gif','anim-mp4','anim-webm'])exportOptions.append(el(id));
 for(const child of [...timeline.children])if(child.id!=='anim-queue')playback.append(child);
 playback.append(exportMenu);timeline.prepend(playback);
 document.addEventListener('click',event=>{if(!exportMenu.contains(event.target))exportMenu.open=false;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')exportMenu.open=false;});
 const tabs=document.createElement('div');tabs.id='workbench-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Workbench sections');
 const sections=[['shape','Shape'],['colour','Colour & pixels'],['files','Import & save']];
 const panel=document.createElement('div');panel.id='workbench-content';panel.setAttribute('role','tabpanel');
 right.querySelector('.workbench-row').after(tabs);tabs.after(panel);
 let current='shape';
 const group=e=>e.id==='mesh-panel'||e.id==='info'?'shape':e.id==='palette-panel'||e.id==='texture-workbench'||e.id==='texture-unavailable'||e.querySelector('#vc')?'colour':'files';
 function apply(){for(const e of [...right.children])if(!['workbench-tabs','workbench-content'].includes(e.id)&&!e.classList.contains('workbench-row')){e.dataset.workbench=group(e);panel.append(e);}for(const e of panel.children){e.dataset.workbench=group(e);e.classList.toggle('workbench-hidden',e.dataset.workbench!==current);}for(const b of tabs.children){b.setAttribute('aria-selected',String(b.dataset.tab===current));b.tabIndex=b.dataset.tab===current?0:-1;}panel.setAttribute('aria-labelledby','tab-'+current);}
 for(const [id,label]of sections){const b=document.createElement('button');b.id='tab-'+id;b.type='button';b.dataset.tab=id;b.textContent=label;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel.id);b.onclick=()=>{current=id;apply();};b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const i=sections.findIndex(([id])=>id===current),n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowLeft'?2:1))%3;tabs.children[n].click();tabs.children[n].focus();};tabs.append(b);}
 apply();const observer=new MutationObserver(apply);observer.observe(right,{childList:true});observer.observe(panel,{childList:true});
})();
