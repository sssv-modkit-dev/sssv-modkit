//#LAB-PURE-START
function editMemory(){const entries=new Map();return {put:(key,value)=>entries.set(key,JSON.parse(JSON.stringify(value))),get:key=>JSON.parse(JSON.stringify(entries.get(key)||{})),entries:()=>JSON.parse(JSON.stringify([...entries])),forget:key=>entries.delete(key)}}
function examplePart(parts,selected,random=Math.random){return parts.find(p=>p.sym===selected)||parts[Math.min(parts.length-1,Math.floor(random()*parts.length))]}

function validateDemoPreset(value){
  if(!value||value.format!=='sssv-parts-lab-demo-v1'||!Object.hasOwn(PARTS_DEMOS,value.model))throw new Error('Not a Model Editor demo preset.');
  const symbols=new Set(PARTS_DEMOS[value.model].p.map(p=>p.s));
  const vector=(a,lo,hi)=>Array.isArray(a)&&a.length===3&&a.every(n=>Number.isFinite(n)&&n>=lo&&n<=hi);
  const meshOut={},palette={},partColours={},deformations={};
  for(const [s,e] of Object.entries(value.mesh||{})){
    if(!symbols.has(s)||!e||!vector(e.s,.1,10)||!vector(e.m,-500,500)||typeof e.o!=='boolean')throw new Error('Invalid mesh settings.');
    if(e.r&&!vector(e.r,-180,180))throw new Error('Invalid rotation.');meshOut[s]={s:e.s,m:e.m,o:e.o,...(e.r?{r:e.r}:{})};
  }
  const colours=new Set(['808080FF',...PARTS_DEMOS[value.model].p.flatMap(p=>p.demo.cols.map(c=>c.rgba))]);
  for(const [a,b] of Object.entries(value.palette||{})){
    if(!colours.has(a)||typeof b!=='string'||!/^([0-9A-F]{8})$/.test(b))throw new Error('Invalid palette.');
    palette[a]=b;
  }
  for(const [symbol,entries] of Object.entries(value.partColors||{})){
    if(!symbols.has(symbol)||!entries||typeof entries!=='object'||Array.isArray(entries))throw new Error('Invalid part palette.');
    const allowed=new Set(['808080FF',...PARTS_DEMOS[value.model].p.find(p=>p.s===symbol).demo.cols.map(c=>c.rgba)]),out={};
    for(const [from,to] of Object.entries(entries)){if(!allowed.has(from)||typeof to!=='string'||!/^([0-9A-F]{8})$/.test(to))throw new Error('Invalid part colour.');if(from!==to)out[from]=to;}
    if(Object.keys(out).length)partColours[symbol]=out;
  }
  for(const [s,entries] of Object.entries(value.deform||{})){
    if(!symbols.has(s)||!Array.isArray(entries)||entries.length>4)throw new Error('Invalid deformation.');
    deformations[s]=entries.map(e=>{
      if(!e||!Array.isArray(e.ops)||e.ops.length>4)throw new Error('Invalid deformation operations.');
      return {ops:e.ops.map(op=>{
        if(!['bend','twist','taper','inflate'].includes(op.type)||(op.type!=='inflate'||op.axis!==undefined)&&!['x','y','z'].includes(op.axis))throw new Error('Invalid deformation type or axis.');
        const common={type:op.type,axis:op.axis};
        if(op.range!==undefined){if(!Array.isArray(op.range)||op.range.length!==2||!op.range.every(Number.isFinite)||op.range[0]<0||op.range[0]>=op.range[1]||op.range[1]>1)throw new Error('Invalid deformation range.');common.range=op.range;}
        if(op.type==='taper'){if(!Number.isFinite(op.from)||!Number.isFinite(op.to)||op.from<.1||op.from>3||op.to<.1||op.to>3)throw new Error('Invalid taper.');return {...common,from:op.from,to:op.to};}
        if(op.type==='inflate'){if(!Number.isFinite(op.amount)||op.amount<.1||op.amount>3||op.axes!==undefined&&!/^[xyz]{1,3}$/.test(op.axes))throw new Error('Invalid inflate.');return {...common,amount:op.amount,...(op.axes?{axes:op.axes}:{})};}
        if(!Number.isFinite(op.degrees)||Math.abs(op.degrees)>180)throw new Error('Invalid bend or twist.');
        if(op.type==='bend'&&(!['x','y','z','-x','-y','-z'].includes(op.toward)||op.toward.replace('-','')===op.axis))throw new Error('Invalid bend direction.');
        return {...common,degrees:op.degrees,...(op.type==='bend'?{toward:op.toward}:{})};
      })};
    });
  }
  return {format:value.format,model:value.model,mesh:meshOut,palette,...(Object.keys(partColours).length?{partColors:partColours}:{}),deform:deformations,exploded:!!value.exploded};
}
//#LAB-PURE-END
const modelEdits=editMemory(),headshots=new Map();
let modelCategory='';
function modelGroup(n){if(!BUNDLED_ANIMALS.has(n)&&Object.hasOwn(PARTS_DEMOS,n))return 'Custom';return /^prop[_-]/.test(n)?'Props':'Animals'}
function headshot(n){
  if(headshots.has(n))return headshots.get(n);
  const P=PARTS_DEMOS[n].p.find(p=>/head/i.test(p.s))||PARTS_DEMOS[n].p[0],canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
  const ctx=canvas.getContext('2d'),tris=P.demo.tris,project=v=>[v[0]*.85+v[2]*.45,-v[1]+v[2]*.2],points=tris.flatMap(t=>t.v.map(project)),lo=[0,1].map(k=>Math.min(...points.map(v=>v[k]))),hi=[0,1].map(k=>Math.max(...points.map(v=>v[k]))),scale=52/Math.max(1,...hi.map((v,k)=>v-lo[k]));
  for(const t of [...tris].sort((a,b)=>a.v.reduce((v,q)=>v+q[2],0)-b.v.reduce((v,q)=>v+q[2],0))){ctx.beginPath();t.v.map(project).forEach((v,i)=>ctx[i?'lineTo':'moveTo'](6+(v[0]-lo[0])*scale,6+(v[1]-lo[1])*scale));ctx.closePath();ctx.fillStyle='#'+(P.demo.cols[t.c]?.rgba||'808080FF').slice(0,6);ctx.fill();ctx.strokeStyle='#0003';ctx.stroke()}
  const url=canvas.toDataURL('image/png');headshots.set(n,url);return url;
}
function buildDemoPicker(){
  const host=$('demo-picker');host.replaceChildren();
  const models=Object.keys(TABLE),groups=[...new Set(models.map(modelGroup))];
  const button=(text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=fn;host.appendChild(b);return b};
  const retained=window.ModelEditorHost?.availableSource?.();
  if(demoMode&&retained){const b=button('Loaded animals ('+Object.keys(retained.table).length+')',()=>{window.ModelEditorHost.restoreSource();modelCategory='Animals';buildDemoPicker()});b.id='return-to-source';b.title='Return to your loaded source without selecting its file again';}
  if(!groups.includes(modelCategory))modelCategory='';
  if(!modelCategory){for(const group of groups){const b=button(group,()=>{modelCategory=group;buildDemoPicker()});const icon=document.createElement('span');icon.className='ph';icon.setAttribute('aria-hidden','true');icon.textContent=({'Custom':'◇','Animals':'🐾','Props':'📦'})[group]||'◇';b.prepend(icon);}return}
  button('← Categories',()=>{modelCategory='';buildDemoPicker()});
  for(const n of models.filter(n=>modelGroup(n)===modelCategory)){const b=button(n.replaceAll('_',' '),()=>{$('an').value=n;pick(n);if(demoMode)markDemoPicker()});b.dataset.model=n;b.setAttribute('aria-pressed',String(n===name));if(modelCategory==='Custom'){const img=new Image();img.alt='';img.src=headshot(n);b.prepend(img)}}
}
function markDemoPicker(){const real=BUNDLED_ANIMALS.has(name),posed=real&&!!BUNDLED_POSES[name];$('variant-label').textContent=posed?'Game model · drag to orbit':real?'Parts view · drag to orbit':'Original CC0 demo · drag to orbit';$('demo-assemble').hidden=real&&!posed;$('demo-status').textContent=posed?'Real game parts, assembled in a pose captured from the running game. Explode parts shows each part on its own.':real?'Parts view: no assembly pose is bundled for this animal, so its parts are laid out flat.':'Original CC0 demo geometry. No game assets included.';for(const b of $('demo-picker').children)b.setAttribute('aria-pressed',String(b.dataset.model===name))}
function startDemos(model=DEFAULT_DEMO){
  rememberCurrentEdits();cur=null;demoMode=true;TABLE=PARTS_DEMOS;dv=new DataView(new ArrayBuffer(0));pose=null;
  document.body.classList.add('demo-mode');
  const A=$('an');A.replaceChildren(...Object.keys(TABLE).map(n=>new Option(n,n)));A.disabled=false;A.onchange=()=>pick(A.value);
  buildGallery();$('gallery-toggle').disabled=false;$('gallery-toggle').onclick=()=>setGallery(!gallery);
  buildDemoPicker();pick(model);markDemoPicker();markDemoPicker();
}
function demoPreset(){return validateDemoPreset({format:'sssv-parts-lab-demo-v1',model:name,mesh,palette:map,partColors:typeof partColors==='undefined'?{}:partColors,deform:deformOn?deform:{},exploded:sheet})}
function applyDemoPreset(raw){const p=validateDemoPreset(raw);startDemos(p.model);mesh=p.mesh;map=p.palette;partColors=p.partColors||{};deform=p.deform;deformOn=Object.keys(deform).length>0;sheet=p.exploded;assembled=!sheet&&poseOk();all=!sheet&&!assembled;SH=sheetLayout(visibleParts());ui();rebuild(true);info()}
function downloadJSON(value,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const DEFAULT_DEMO=Object.keys(PARTS_DEMOS).find(n=>!BUNDLED_ANIMALS.has(n));
$('demo-start').onclick=()=>startDemos();
$('demo-assemble').onclick=()=>{if(poseOk()){variant='';$('variant').value='';}assembled=poseOk();all=!assembled;sheet=false;ui();rebuild(true);info()};
$('demo-explode').onclick=()=>{assembled=false;all=false;sheet=true;roll=0;pit=0;yaw=HOME_VIEW[0];SH={};for(const [i,P] of visibleParts().entries()){const c=[0,1,2].map(k=>(P.bb[k]+P.bb[k+3])/2),length=Math.hypot(...c),size=Math.max(40,...P.bb.slice(3).map((v,k)=>v-P.bb[k]));SH[P.sym]=length?c.map(v=>v/length*size*1.4):[Math.cos(i*2.4)*size,Math.sin(i*2.4)*size,0]}ui();rebuild(true);info()};
$('demo-colour').onclick=()=>{for(const c of new Set(parsed.flatMap(editableColours)))map[c]=[0,1,2].map(()=>Math.floor(60+Math.random()*180).toString(16).padStart(2,'0')).join('').toUpperCase()+'FF';ui();rebuild(false)};
$('demo-share').onclick=async()=>{
 const status=demoMode?$('demo-status'):$('msg');
 try{const hash='#project='+encodeURIComponent(JSON.stringify(demoProject()));if(hash.length>16000)throw new Error('Project is too large for a share link; save the edits file instead.');
   history.replaceState(null,'',hash);await navigator.clipboard.writeText(location.href);status.textContent='Share link copied. It contains edits only; recipients supply their own source files.';
 }catch(e){status.textContent='Copy the address bar to share, or save your edits. '+e.message}
};
const exportGameConfig=$('exp').onclick,importGameConfig=$('impf').onchange;
function demoProject(){rememberCurrentEdits();const demos=modelEdits.entries().filter(([key,state])=>key.startsWith('demo:')&&configChanged(stateConfig(key.slice(5),state))).map(([key,state])=>validateDemoPreset({format:'sssv-parts-lab-demo-v1',model:key.slice(5),mesh:state.mesh||{},palette:state.map||{},partColors:state.partColors||{},deform:state.deformOn?state.deform:{},exploded:state.exploded??false}));return {format:'model-editor-project-v1',demos,animals:allGameConfigs().animals.filter(e=>e.animal),...(window.ModelTextureTools?.projectExtras?.()||{})}}
$('exp').onclick=()=>downloadJSON(demoProject(),'model-edits.json');
function applyModelProject(value){
      if(!Array.isArray(value.demos)||!Array.isArray(value.animals))throw new Error('Invalid model project.');
      const demos=value.demos.map(validateDemoPreset);if(demoMode&&(value.animals.length||value.texture_patches?.length)&&window.ModelEditorHost?.availableSource?.())window.ModelEditorHost.restoreSource();window.ModelTextureTools?.validateProjectExtras?.(value);if(value.animals.length&&demoMode)throw new Error('Load your source data before opening a project with animal edits.');
      if(value.animals.length)importGameConfigs({animals:value.animals});
      rememberCurrentEdits();for(const p of demos)modelEdits.put('demo:'+p.model,{mesh:p.mesh,map:p.palette,partColors:p.partColors||{},deform:p.deform,deformOn:Object.keys(p.deform).length>0,exploded:p.exploded});
      if(demos.length&&!value.animals.length&&!value.texture_patches?.length){cur=null;startDemos(demos[0].model)}window.ModelTextureTools?.loadProjectExtras?.(value);

}
$('impf').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  window.ModelEditorHistory?.begin();
  try{if(f.size>1000000)throw new Error('Config is too large.');const value=JSON.parse(await f.text());
    if(value.format==='model-editor-project-v1')applyModelProject(value);
    else if(value.format==='sssv-parts-lab-demo-v1')applyDemoPreset(value);
    else if(demoMode)throw new Error('This config needs its source data loaded first.');
    else await importGameConfig(e);
  }catch(err){$('demo-status').textContent=err.message;alert(err.message)}finally{e.target.value='';window.ModelEditorHistory?.end()}
};
if(!Object.keys(EMBEDDED_TABLE).length)startDemos();
let pendingSharedProject=null;
function readSharedDemo(){const legacy=location.hash.startsWith('#demo='),project=location.hash.startsWith('#project=');if(!legacy&&!project)return;
 try{if(location.hash.length>16000)throw new Error('Share link is too large.');const value=JSON.parse(decodeURIComponent(location.hash.slice(legacy?6:9)));
  if(legacy)applyDemoPreset(value);else if((value.animals?.length||value.texture_patches?.length)&&demoMode){pendingSharedProject=value;$('demo-status').textContent='Shared edits are ready. Open your matching source files to apply them.';}
  else {applyModelProject(value);pendingSharedProject=null;}
 }catch(err){(demoMode?$('demo-status'):$('msg')).textContent='Could not open shared edits: '+err.message}
}
readSharedDemo();addEventListener('hashchange',readSharedDemo);
addEventListener('model-source-ready',()=>{if(!pendingSharedProject)return;try{applyModelProject(pendingSharedProject);pendingSharedProject=null;$('msg').textContent='Shared edits opened with your local source.'}catch(err){$('msg').textContent='Could not open shared edits: '+err.message}});

// History stores only edit descriptions. Source bytes remain in the retained host.
function captureModelHistory(){
  rememberCurrentEdits();
  const entries=modelEdits.entries().filter(([key,state])=>configChanged(stateConfig(key.slice(key.indexOf(':')+1),state))||Object.values(state.partColors||{}).some(v=>Object.entries(v).some(([a,b])=>a!==b))||Object.keys(state.wordEdits||{}).length).sort(([a],[b])=>a.localeCompare(b));
  return {edits:{entries,names:partNames,offsets:partOffsets,labels:labelOffsets,textures:window.ModelTextureTools?.historyExtras?.()||window.ModelTextureTools?.projectExtras?.()||{}},current:{demo:demoMode,name,variant,sheet,all,assembled,sel,selected:[...selectedParts],selectedSym,camera:{yaw,pit,roll,dist,ctr:ctr.slice()}}};
}
function restoreModelHistory(snapshot){
  const state=snapshot.edits,current=snapshot.current;
  cur=null;for(const [key] of modelEdits.entries())modelEdits.forget(key);
  for(const [key,value] of state.entries)modelEdits.put(key,value);
  partNames=state.names||{};partOffsets=state.offsets||{};labelOffsets=state.labels||{};
  const retained=window.ModelEditorHost?.availableSource?.();
  if(retained){window.ModelEditorHost.restoreSource();const load=window.ModelTextureTools?.restoreHistoryExtras||window.ModelTextureTools?.loadProjectExtras;load?.(state.textures||{});}
  if(current.demo){cur=null;startDemos(Object.hasOwn(PARTS_DEMOS,current.name)?current.name:DEFAULT_DEMO);}
  else if(retained&&Object.hasOwn(TABLE,current.name))pick(current.name);
  variant=(cur.s||[]).includes(current.variant)?current.variant:'';$('variant').value=variant;
  sheet=!!current.sheet;all=!!current.all;assembled=!!current.assembled&&poseOk();sel=Math.min(current.sel||0,parsed.length-1);
  selectedParts.clear();for(const sym of current.selected||[])if(parsed.some(p=>p.sym===sym))selectedParts.add(sym);selectedSym=selectedParts.has(current.selectedSym)?current.selectedSym:[...selectedParts].at(-1)||null;
  if(current.camera){({yaw,pit,roll,dist}=current.camera);ctr=current.camera.ctr.slice();}
  SH=sheetLayout(visibleParts());deformCache.clear();saveViewerPrefs();ui();rebuild(false);info();
}
if(window.ModelEditorHistory){
 const H=window.ModelEditorHistory;
 const buttons=state=>{for(const [id,key] of [['undo-edit','canUndo'],['redo-edit','canRedo']]){const b=$(id);if(b)b.disabled=!state[key];}};
 H.configure({capture:captureModelHistory,restore:restoreModelHistory,onChange:buttons});
 for(const [id,method,label] of [['undo-edit','undo','Undo'],['redo-edit','redo','Redo']]){let b=$(id);if(!b){b=document.createElement('button');b.id=id;b.textContent=label;$('actions').prepend(b);}b.type='button';b.title=label+(method==='undo'?' (Ctrl+Z)':' (Ctrl+Y)');b.onclick=()=>H[method]();}
 buttons(H);let lastSource=window.ModelEditorHost?.availableSource?.()?.bytes;
 addEventListener('model-source-ready',()=>{if(H.restoring)return;const source=window.ModelEditorHost?.availableSource?.()?.bytes;if(source!==lastSource){lastSource=source;H.reset();}});
}
