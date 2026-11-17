/* Checks run before identity/storage work, including restored sources. */
(()=>{
'use strict';
window.SSSVCompat={check(file){
 if(!globalThis.crypto?.subtle)throw Error('ROM loading needs a secure connection. Open this site with HTTPS (or localhost).');
 if(typeof structuredClone!=='function')throw Error('This browser is missing structuredClone, needed by the editors. Update your browser and try again.');
 if(file&&typeof file.arrayBuffer!=='function')throw Error('This browser cannot read local files. Update your browser and try again.');
 try{const input=document.createElement('input');input.type='file';const transfer=new DataTransfer();transfer.items.add(new File(['test'],'test'));input.files=transfer.files;if(input.files.length!==1)throw Error();}
 catch(_){throw Error('This browser cannot pass a local ROM to the editor. Update Safari or your Android browser and try again.');}
}};
document.addEventListener('webglcontextlost',event=>{
 event.preventDefault();window.SSSVBuilder?.terminate();window.LoadProgress?.fail('The graphics context was lost, possibly because device memory is full. Reload this page and close other tabs before trying again.');
},true);
})();
