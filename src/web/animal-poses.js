/* SSSV captured static poses. Geometry is always decoded from the selected ROM. */
(function(root){
const species=[[0,"seagull"],[6,"fox"],[22,"bear"],[31,"dog"],[33,"sheep"],[46,"camel"],[66,"cool_cod"],[51,"desert_fox"],[56,"elephant"],[54,"gorilla"],[40,"husky"],[57,"hyena"],[50,"kangaroo"],[1,"lion"],[16,"mouse"],[30,"pirana"],[38,"polar_bear"],[10,"rabbit"],[32,"rat"],[53,"scorpion"],[27,"tortoise"],[19,"vulture"],[14,"parrot"],[44,"walrus"]];
// Characters outside the animal draw code (New Game cutscene); listed under Characters in the Model Editor.
const extras=[["dan_danger","Dan Danger"],["evo_cutscene","EVO (cutscene)"]];
const names=()=>species.map(([,name])=>name).concat(extras.map(([name])=>name));
async function load(names=species.map(([,name])=>name)){
 const poses={},errors={};
 await Promise.all(names.map(async name=>{try{
  if(typeof BUNDLED_POSES!=='undefined'&&BUNDLED_POSES[name]){poses[name]=BUNDLED_POSES[name];return;}
  const response=await fetch('demo/poses/'+name+'.json');
  if(!response.ok)throw Error('HTTP '+response.status);
  const pose=await response.json();
  if(pose.animal!==name||!Array.isArray(pose.parts)||!pose.parts.length)throw Error('Invalid pose');
  for(const p of pose.parts){
   if(typeof p.dl!=='string'||!Array.isArray(p.rows)||p.rows.length!==3||!p.rows.every(r=>Array.isArray(r)&&r.length===3&&r.every(Number.isFinite))||!Array.isArray(p.T)||p.T.length!==3||!p.T.every(Number.isFinite)||![0,1,2,3].includes(p.mirror))throw Error('Invalid part transform');
  }
  poses[name]=pose;
 }catch(error){errors[name]=error.message;}}));
 return {poses,errors};
}
root.SSSVAnimalPoses={species,extras,names,load};
if(typeof module!=='undefined')module.exports=root.SSSVAnimalPoses;
})(typeof window==='undefined'?globalThis:window);
