/* Keep editing sections discoverable while reserving the canvas for the model. */
(()=>{
 const side=document.getElementById('side'),right=document.getElementById('edit-side');
 for(const id of ['model-state-bar','view-settings','camera-tools'])side.append(document.getElementById(id));
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
