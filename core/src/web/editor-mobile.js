/* Shared phone workspace. Move real controls, then restore them at their exact desktop anchors. */
(()=>{
 'use strict';
 const phone=matchMedia('(max-width:767px)'), body=document.body;
 const kind=body.dataset.page || (document.getElementById('view')?'model':'level');
 let active=false, moves=[], disclosures=[], bar, dock, viewport, camera, adapter;
 const button=(text,run,id)=>{const b=document.createElement('button');b.type='button';b.textContent=text;if(id)b.id=id;b.onclick=run;return b;};
 function move(el,host){if(!el)return;const anchor=document.createComment('desktop position');el.before(anchor);moves.push([el,anchor]);host.append(el);}
 function panels(hidden){body.classList.toggle('mobile-panels-hidden',hidden);bar.querySelector('#mobile-panels').textContent=hidden?'Show panels':'Hide panels';bar.querySelector('#mobile-panels').setAttribute('aria-expanded',String(!hidden));}
 function attachCamera(){
  adapter=window.EditorTouch;
  if(!active||!adapter)return;
  if(camera){camera.querySelector('select').value=adapter.mode;return;}
  camera=document.createElement('details');camera.id='mobile-camera';camera.className='mobile-camera';camera.open=true;
  const title=document.createElement('summary');title.textContent='Touch & camera controls';camera.append(title);
  const label=document.createElement('label');label.textContent='Drag mode ';
  const select=document.createElement('select');select.id='mobile-touch-mode';
  for(const [value,text] of adapter.modes){const o=document.createElement('option');o.value=value;o.textContent=text;select.append(o);}
  select.value=adapter.mode;select.onchange=()=>adapter.mode=select.value;label.append(select);camera.append(label);
  const pad=document.createElement('div');pad.className='mobile-camera-pad';
  for(const [action,text] of adapter.buttons)pad.append(button(text,()=>adapter.action(action),'touch-'+action));
  camera.append(pad);viewport.after(camera);
 }
 function enter(){
  if(active)return;active=true;body.classList.add('editor-phone');
  bar=document.createElement('div');bar.id='mobile-toolbar';bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Workspace');
  bar.append(button('Hide panels',()=>panels(!body.classList.contains('mobile-panels-hidden')),'mobile-panels'));
  if(kind!=='dialogue')bar.append(button('Full-screen view',()=>{
   const full=body.classList.toggle('mobile-fullscreen');bar.querySelector('#mobile-fullscreen').textContent=full?'Exit full-screen':'Full-screen view';bar.querySelector('#mobile-fullscreen').setAttribute('aria-pressed',String(full));
   window.dispatchEvent(new Event('resize'));
   if(full)adapter?.fit?.();
  },'mobile-fullscreen'));
  dock=document.createElement('div');dock.id='mobile-dock';dock.setAttribute('aria-label','Editor panels');
  viewport=document.createElement('div');viewport.id='mobile-viewport';
  body.prepend(bar,viewport,dock);
  const byId=id=>document.getElementById(id);
  if(kind==='model'){
   move(byId('view'),viewport);
   for(const id of ['animal-label','side','model-state-bar','view-settings','camera-tools','edit-side','part-inspector'])move(byId(id),dock);
  }else if(kind==='level'){
   move(byId('c'),viewport);move(byId('ed-overlay'),viewport);
   for(const id of ['object-tools','ed-info','ui','add-panel','objects-panel','editor','project-panel'])move(byId(id),dock);
   for(const id of ['add-panel','objects-panel','editor','project-panel']){const el=byId(id);disclosures.push([el,el.open]);el.open=false;}
   for(const el of document.querySelectorAll('.net-note'))move(el,dock);
  }else if(kind==='terrain'){
   move(document.querySelector('.columns'),viewport);
   move(document.querySelector('header'),dock);
   for(const el of [...document.querySelector('main').children])move(el,dock);
  }else{
   move(document.querySelector('header'),dock);
   move(document.querySelector('main'),dock);
   viewport.hidden=true;
  }
  panels(false);attachCamera();window.dispatchEvent(new Event('resize'));
 }
 function leave(){
  if(!active)return;active=false;
  for(const [el,anchor] of moves.reverse()){anchor.replaceWith(el);}moves=[];
  for(const [el,open] of disclosures)el.open=open;disclosures=[];
  for(const el of [bar,viewport,dock,camera])el?.remove();camera=null;
  body.classList.remove('editor-phone','mobile-panels-hidden','mobile-fullscreen');window.dispatchEvent(new Event('resize'));
 }
 window.addEventListener('editor-touch-ready',attachCamera);
 const update=()=>phone.matches?enter():leave();phone.addEventListener('change',update);update();
})();
