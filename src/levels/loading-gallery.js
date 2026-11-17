/* Build expensive thumbnails one level per macrotask, before the synchronous editor installs them. */
(()=>{
const render=LevelGallery.render;let prepared=null;
LevelGallery.prepare=async(doc)=>{
 const data=Scene.toRuntime(doc),cards=[];
 for(let i=0;i<data.LEVELS.length;i++){
  await window.LoadProgress?.step(`Building level ${i+1} of ${data.LEVELS.length}`,.88+(i+1)/data.LEVELS.length*.1);
  await new Promise(resolve=>setTimeout(resolve,0));
  const list=document.createElement('div');
  try{render(list,{...data,LEVELS:[data.LEVELS[i]]},()=>{},document.querySelector('meta[name="scene-icons"]')?.content||'');}
  catch(error){throw Error('Could not draw a level preview. Close other tabs to free device memory, then reload. '+error.message);}
  const card=list.firstChild;card.dataset.index=String(i);cards.push(card);
 }
 prepared={sha:data.EDITOR_SHA1,cards};
};
LevelGallery.render=(list,data,pick,heads)=>{
 if(!prepared||prepared.sha!==data.EDITOR_SHA1)return render(list,data,pick,heads);
 list.replaceChildren();prepared.cards.forEach((card,i)=>{card.onclick=()=>pick(i);list.append(card);});prepared=null;
};
})();
