/* Keep filters outside regenerating lists, so a redraw never loses the query or focus. */
(()=>{
'use strict';
const names={'demo-picker':'animals','parts':'parts','gallery-list':'gallery','object-tree':'objects','pal-grid':'objects to add','type-picker':'object types','an':'animals','lv':'levels','bank':'banks','terrain-level':'levels','cutscene-level':'levels','ed-type':'object types','ed-object':'selection'};
const attached=new WeakSet(),refreshers=new Set();let queued=false;
function attach(list){
 if(attached.has(list))return;
 const isSelect=list.tagName==='SELECT',id=list.id;
 if(isSelect&&(list.hidden||list.options.length<16))return;
 if(!isSelect&&!(id in names))return;
 attached.add(list);
 const label=document.createElement('label'),input=document.createElement('input');label.className='list-filter';label.textContent='Find '+(names[id]||list.getAttribute('aria-label')||'items');input.type='search';input.id='find-'+id;input.setAttribute('aria-controls',id);label.append(input);(list.parentElement.tagName==='LABEL'?list.parentElement:list).before(label);
 const filter=()=>{
  label.hidden=list.hidden||getComputedStyle(list).display==='none';
  const query=input.value.trim().toLowerCase();
  for(const item of isSelect?[...list.options]:[...list.children]){
   const matches=!query||item.textContent.toLowerCase().includes(query);
   if(isSelect)item.hidden=!matches;else item.dataset.filtered=String(!matches);
   if(item.tagName==='DETAILS')for(const child of item.querySelectorAll('button'))child.dataset.filtered=String(!!query&&!child.textContent.toLowerCase().includes(query));
  }
  // Category buttons and the return-to-source action stay reachable while searching animals.
  if(id==='demo-picker')for(const b of list.children)if(!b.dataset.model)b.dataset.filtered='false';
 };
 input.oninput=filter;refreshers.add(filter);filter();
}
function scan(){queued=false;document.querySelectorAll('select,#demo-picker,#parts,#gallery-list,#object-tree,#pal-grid,#type-picker').forEach(attach);for(const refresh of refreshers)refresh();}
document.addEventListener('DOMContentLoaded',()=>{scan();new MutationObserver(()=>{if(!queued){queued=true;requestAnimationFrame(scan);}}).observe(document.body,{subtree:true,childList:true});});
})();
