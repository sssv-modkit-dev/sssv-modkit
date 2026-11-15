/* Source-bound edit descriptions shared across page navigation. No source assets are duplicated. */
(()=>{'use strict';
let ready=false,restoring=false,editHash=null,pending=Promise.resolve(),timer;
const model=()=>window.ModelEditorHost,level=()=>typeof editorSession!=='undefined'?editorSession:null;
function error(e){ROMSession.show('Could not save shared edits: '+e.message+'. Keep this page open and save an edit file.');}
async function save(){
 clearTimeout(timer);if(!ready||restoring)return pending;
 const source=await ROMSession.get();if(!source||source.hash!==editHash)return pending;
 const h=model(),l=level(),key=h?'model':l?'level':null;if(!key)return pending;
 const value=h?{hash:source.hash,snapshot:h.captureSession(),config:h.buildConfig()}:{hash:source.hash,project:l.project()};
 pending=pending.catch(()=>{}).then(()=>ROMSession.write(key,value));await pending;
}
async function restore(key){
 if(restoring)return;restoring=true;ready=false;const blocker=document.createElement('output');blocker.id='session-restoring';blocker.setAttribute('role','status');blocker.textContent='Restoring saved edits...';document.body.append(blocker);
 try{const source=await ROMSession.get(),saved=source?await ROMSession.read(key):null;
  if(saved&&source&&saved.hash===source.hash){if(key==='model')model().restoreSession(saved.snapshot);else level().restoreProject(saved.project);}
  editHash=source?.hash||null;ready=true;
 }catch(e){ROMSession.show('Could not restore shared edits: '+e.message);}
 finally{blocker.remove();restoring=false;window.dispatchEvent(new Event('editor-session-restored'));}
}
window.EditorSession={flush:save,get ready(){return ready;}};
addEventListener('model-source-ready',()=>{if(!restoring&&!window.ModelEditorHistory?.restoring)queueMicrotask(()=>restore('model'));});
addEventListener('level-session-ready',()=>restore('level'));
for(const name of ['model-edits-changed','level-edits-changed'])addEventListener(name,()=>{if(ready&&!restoring){clearTimeout(timer);timer=setTimeout(()=>save().catch(error),100);}});
addEventListener('rom-session-forgotten',()=>{ready=false;clearTimeout(timer);});
document.addEventListener('DOMContentLoaded',()=>{
 if(!new URLSearchParams(location.search).has('guided'))return;
 const bar=document.createElement('div');bar.id='guided-return';const a=document.createElement('a');a.href='start.html';a.textContent='\u2190 Back to guided build';
 const note=document.createElement('small');note.textContent='Checking saved session...';ROMSession.get().then(source=>{note.textContent=source?'Your edits are remembered in this browser.':'Preview mode: load a ROM to remember game edits and build.';}).catch(error);bar.append(a,note);
 const nav=document.querySelector('.global-nav');nav?.after(bar);
});
// Await the transaction before leaving through a link, including the guided return bar.
document.addEventListener('click',async e=>{
 const a=e.target.closest('a[href]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||a.target==='_blank'||a.origin!==location.origin||a.pathname===location.pathname)return;
 if(!ready&&typeof persistSession!=='function')return;
 e.preventDefault();try{await save();if(typeof persistSession==='function'){await persistSession();if(!sessionSaved)return;}location.href=a.href;}catch(err){error(err);}
},true);
})();
