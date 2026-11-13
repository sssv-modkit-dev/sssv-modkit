/* Small edit history. Snapshots contain edit descriptions, never source bytes. */
(function(root){
'use strict';
const copy=value=>JSON.parse(JSON.stringify(value));
function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
function createHistory(options={}){
  let capture=options.capture||(()=>({})),restore=options.restore||(()=>{}),notify=options.onChange||(()=>{}),before=null,restoring=false;
  const limit=Math.max(1,Math.min(100,options.limit||50)),back=[],forward=[];
  const equal=options.equal||((a,b)=>stable(a.edits??a)===stable(b.edits??b));
  const changed=()=>notify({canUndo:back.length>0,canRedo:forward.length>0,undoCount:back.length,redoCount:forward.length});
  const api={
    configure(value){capture=value.capture||capture;restore=value.restore||restore;notify=value.onChange||notify;api.reset();return api;},
    begin(){if(!restoring&&before===null)before=copy(capture());},
    end(){if(restoring||before===null)return false;const previous=before;before=null;const after=copy(capture());if(equal(previous,after))return false;back.push({before:previous,after});if(back.length>limit)back.shift();forward.length=0;changed();return true;},
    cancel(){before=null;},
    reset(){before=null;back.length=0;forward.length=0;changed();},
    undo(){if(restoring)return false;api.end();const step=back.pop();if(!step)return false;restoring=true;try{restore(copy(step.before));forward.push(step);}catch(error){back.push(step);throw error;}finally{restoring=false;changed();}return true;},
    redo(){if(restoring)return false;api.end();const step=forward.pop();if(!step)return false;restoring=true;try{restore(copy(step.after));back.push(step);}catch(error){forward.push(step);throw error;}finally{restoring=false;changed();}return true;},
    transaction(fn){api.begin();try{return fn();}finally{api.end();}},
    get restoring(){return restoring;},get canUndo(){return back.length>0;},get canRedo(){return forward.length>0;},get size(){return back.length;}
  };return api;
}
const api=createHistory();api.create=createHistory;api.stable=stable;
if(typeof module!=='undefined')module.exports={createHistory,stable};
if(root.document){
  root.ModelEditorHistory=api;
  const editable=target=>!!target?.closest?.('input,textarea,select,[contenteditable="true"]');
  root.document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey||editable(event.target))return;
    const key=event.key.toLowerCase(),undo=key==='z'&&!event.shiftKey,redo=key==='y'||key==='z'&&event.shiftKey;
    if(!undo&&!redo)return;event.preventDefault();undo?api.undo():api.redo();
  });
  // Capture before the app's target handlers; commit after its complete gesture.
  root.document.addEventListener('pointerdown',event=>{if(!event.target.closest?.('#undo-edit,#redo-edit'))api.begin();},true);
  for(const event of ['pointerup','pointercancel'])root.document.addEventListener(event,()=>queueMicrotask(()=>api.end()),true);
  root.document.addEventListener('click',event=>{if(event.target.closest?.('#undo-edit,#redo-edit'))return;api.begin();queueMicrotask(()=>api.end());},true);
  root.document.addEventListener('focusin',event=>{if(editable(event.target)&&event.target.type!=='file')api.begin();},true);
  root.document.addEventListener('focusout',()=>queueMicrotask(()=>api.end()),true);
  root.document.addEventListener('input',event=>{if(event.target.type!=='file')api.begin();},true);
  root.document.addEventListener('change',event=>{if(event.target.type!=='file')queueMicrotask(()=>api.end());},true);
  root.document.addEventListener('wheel',event=>{if(editable(event.target)){api.begin();queueMicrotask(()=>api.end());}},true);
}
})(typeof window!=='undefined'?window:globalThis);
