(()=>{'use strict';
const modes=['system','light','dark','matrix','dracula','dracula-deep'],key='sssv-viewer-theme',select=document.getElementById('home-theme');
function apply(value){const mode=modes.includes(value)?value:'system';document.documentElement.dataset.theme=mode;select.value=mode;}
try{apply(localStorage.getItem(key));}catch(_){apply('system');}
select.addEventListener('change',()=>{apply(select.value);try{localStorage.setItem(key,select.value);}catch(_){}});
window.addEventListener('storage',event=>{if(event.key===key)apply(event.newValue);});
})();
