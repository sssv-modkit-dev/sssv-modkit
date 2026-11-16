/* Standard editor keys. Text controls retain native editing. */
(()=>{
 'use strict';
 const editable=t=>t?.isContentEditable||!!t?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
 if(!document.body.dataset.page&&!document.getElementById('view')&&!document.getElementById('ed-object'))return;
 const details=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');
 summary.textContent='Keyboard shortcuts (?)';details.append(summary,list);(document.getElementById('edit-side')||document.getElementById('project-panel')||document.querySelector('main')||document.body).append(details);
 function help(){list.replaceChildren();for(const text of ['Ctrl+Z undo · Ctrl+Y / Ctrl+Shift+Z redo','Escape cancel / deselect · +/- zoom (where available)',...(window.EditorShortcuts?.help||[])]){const li=document.createElement('li');li.textContent=text;list.append(li);}}
 details.addEventListener('toggle',help);
 document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.altKey||editable(e.target))return;
  const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
  if(!mod&&k==='?'){e.preventDefault();help();details.open=!details.open;if(details.open){for(let p=details.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;details.scrollIntoView({block:'nearest'});}return;}
  const key=mod?(k==='z'?(e.shiftKey?'redo':'undo'):k==='y'?'redo':k==='c'?'copy':k==='v'?'paste':null):k==='='?'+':e.shiftKey&&k==='r'?'shift+r':k;
  if(key&&window.EditorShortcuts?.action(key)){e.preventDefault();}
 });
})();
