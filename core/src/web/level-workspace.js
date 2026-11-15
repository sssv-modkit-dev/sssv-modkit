/* Anchored desktop rails; the shared phone adapter moves the same live controls. */
(()=>{
 const right=document.createElement('aside');right.id='level-right';right.setAttribute('aria-label','Level controls');
 for(const id of ['ui','editor','add-panel','project-panel'])right.append(document.getElementById(id));
 for(const note of document.querySelectorAll('.net-note'))right.append(note);
 document.body.append(right);
})();
