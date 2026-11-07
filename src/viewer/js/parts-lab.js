//#LAB-PURE-START
function editMemory(){const entries=new Map();return {put:(key,value)=>entries.set(key,JSON.parse(JSON.stringify(value))),get:key=>JSON.parse(JSON.stringify(entries.get(key)||{}))}}
function examplePart(parts,selected,random=Math.random){return parts.find(p=>p.sym===selected)||parts[Math.min(parts.length-1,Math.floor(random()*parts.length))]}

function validateDemoPreset(value){
  if(!value||value.format!=='sssv-parts-lab-demo-v1'||!Object.hasOwn(PARTS_DEMOS,value.model))throw new Error('Not a Model Editor demo preset.');
  const symbols=new Set(PARTS_DEMOS[value.model].p.map(p=>p.s));
  const vector=(a,lo,hi)=>Array.isArray(a)&&a.length===3&&a.every(n=>Number.isFinite(n)&&n>=lo&&n<=hi);
  const meshOut={},palette={},deformations={};
  for(const [s,e] of Object.entries(value.mesh||{})){
    if(!symbols.has(s)||!e||!vector(e.s,.1,10)||!vector(e.m,-500,500)||typeof e.o!=='boolean')throw new Error('Invalid mesh settings.');
    meshOut[s]={s:e.s,m:e.m,o:e.o};
  }
  const colours=new Set(['808080FF',...PARTS_DEMOS[value.model].p.flatMap(p=>p.demo.cols.map(c=>c.rgba))]);
  for(const [a,b] of Object.entries(value.palette||{})){
    if(!colours.has(a)||typeof b!=='string'||!/^([0-9A-F]{8})$/.test(b))throw new Error('Invalid palette.');
    palette[a]=b;
  }
  for(const [s,entries] of Object.entries(value.deform||{})){
    if(!symbols.has(s)||!Array.isArray(entries)||entries.length>4)throw new Error('Invalid deformation.');
    deformations[s]=entries.map(e=>{
      if(!e||!Array.isArray(e.ops)||e.ops.length>4)throw new Error('Invalid deformation operations.');
      return {ops:e.ops.map(op=>{
        if(!['bend','twist'].includes(op.type)||!['x','y','z'].includes(op.axis)||!Number.isFinite(op.degrees)||Math.abs(op.degrees)>180)throw new Error('Invalid bend or twist.');
        if(op.type==='bend'&&(!['x','y','z','-x','-y','-z'].includes(op.toward)||op.toward.replace('-','')===op.axis))throw new Error('Invalid bend direction.');
        return {type:op.type,axis:op.axis,degrees:op.degrees,...(op.type==='bend'?{toward:op.toward}:{})};
      })};
    });
  }
  return {format:value.format,model:value.model,mesh:meshOut,palette,deform:deformations,exploded:!!value.exploded};
}
//#LAB-PURE-END
const modelEdits=editMemory(),headshots=new Map();
let modelCategory='';
function modelGroup(n){if(!BUNDLED_ANIMALS.has(n)&&Object.hasOwn(PARTS_DEMOS,n))return 'Custom';if(/bird|parrot|penguin|seagull|vulture/.test(n))return 'Birds';if(/fish|cod|pirana|frog|tortoise|turtle/.test(n))return 'Water & reptiles';return 'Mammals'}
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
  if(!groups.includes(modelCategory))modelCategory='';
  if(!modelCategory){for(const group of groups){const b=button(group,()=>{modelCategory=group;buildDemoPicker()});const icon=document.createElement('span');icon.className='ph';icon.setAttribute('aria-hidden','true');icon.textContent=({'Custom':'◇','Mammals':'🐾','Birds':'🐦','Water & reptiles':'🐢'})[group]||'◇';b.prepend(icon);}return}
  button('← Categories',()=>{modelCategory='';buildDemoPicker()});
  for(const n of models.filter(n=>modelGroup(n)===modelCategory)){const b=button(n.replaceAll('_',' '),()=>{$('an').value=n;pick(n);if(demoMode)markDemoPicker()});b.dataset.model=n;b.setAttribute('aria-pressed',String(n===name));if(modelCategory==='Custom'){const img=new Image();img.alt='';img.src=headshot(n);b.prepend(img)}}
}
function markDemoPicker(){const real=BUNDLED_ANIMALS.has(name),posed=real&&!!BUNDLED_POSES[name];$('variant-label').textContent=posed?'Game model · drag to orbit':real?'Parts view · drag to orbit':'Original CC0 demo · drag to orbit';$('demo-assemble').hidden=real&&!posed;$('demo-status').textContent=posed?'Real game parts, assembled in a pose captured from the running game. Explode parts shows each part on its own.':real?'Parts view: no assembly pose is bundled for this animal, so its parts are laid out flat.':'Original CC0 demo geometry. No game assets included.';for(const b of $('demo-picker').children)b.setAttribute('aria-pressed',String(b.dataset.model===name))}
function startDemos(model=DEFAULT_DEMO){
  demoMode=true;TABLE=PARTS_DEMOS;dv=new DataView(new ArrayBuffer(0));pose=null;
  document.body.classList.add('demo-mode');
  const A=$('an');A.replaceChildren(...Object.keys(TABLE).map(n=>new Option(n,n)));A.disabled=false;A.onchange=()=>pick(A.value);
  buildGallery();$('gallery-toggle').disabled=false;$('gallery-toggle').onclick=()=>setGallery(!gallery);
  buildDemoPicker();pick(model);markDemoPicker();markDemoPicker();
}
function demoPreset(){return validateDemoPreset({format:'sssv-parts-lab-demo-v1',model:name,mesh,palette:map,deform:deformOn?deform:{},exploded:sheet})}
function applyDemoPreset(raw){const p=validateDemoPreset(raw);startDemos(p.model);mesh=p.mesh;map=p.palette;deform=p.deform;deformOn=Object.keys(deform).length>0;sheet=p.exploded;assembled=!sheet&&poseOk();all=!sheet&&!assembled;SH=sheetLayout(visibleParts());ui();rebuild(true);info()}
function downloadJSON(value,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
const DEFAULT_DEMO=Object.keys(PARTS_DEMOS).find(n=>!BUNDLED_ANIMALS.has(n));
$('demo-start').onclick=()=>{cur=null;startDemos()};
$('demo-assemble').onclick=()=>{assembled=poseOk();all=!assembled;sheet=false;ui();rebuild(true);info()};
$('demo-explode').onclick=()=>{assembled=false;all=false;sheet=true;roll=0;pit=0;yaw=HOME_VIEW[0];SH={};for(const [i,P] of visibleParts().entries()){const c=[0,1,2].map(k=>(P.bb[k]+P.bb[k+3])/2),length=Math.hypot(...c),size=Math.max(40,...P.bb.slice(3).map((v,k)=>v-P.bb[k]));SH[P.sym]=length?c.map(v=>v/length*size*1.4):[Math.cos(i*2.4)*size,Math.sin(i*2.4)*size,0]}ui();rebuild(true);info()};
$('demo-stretch').onclick=()=>{const P=examplePart(visibleParts(),selectedSym);if(!P)return;selectedSym=P.sym;mesh[P.sym]={s:[1,1.8,1],m:[0,0,0],o:false};ui();rebuild(true);info()};
for(const type of ['bend','twist'])$('demo-'+type).onclick=()=>{
  const P=examplePart(visibleParts(),selectedSym);if(!P)return;selectedSym=P.sym;
  deform[P.sym]=[{ops:[{type,axis:'y',degrees:65,...(type==='bend'?{toward:'x'}:{})}]}];deformOn=true;deformCache.clear();ui();rebuild(true);info();
  $('demo-status').textContent=type+' applied to '+P.sym+'. Reset clears edits.';
};
$('demo-colour').onclick=()=>{for(const c of new Set(parsed.flatMap(P=>[...P.cols.map(c=>c.rgba),...(noOwnColour(P)?['808080FF']:[])])))map[c]=[0,1,2].map(()=>Math.floor(60+Math.random()*180).toString(16).padStart(2,'0')).join('').toUpperCase()+'FF';ui();rebuild(false)};
$('demo-share').onclick=async()=>{
  try{const hash='#demo='+encodeURIComponent(JSON.stringify(demoPreset()));if(hash.length>16000)throw new Error('Preset is too large; export it instead.');
    history.replaceState(null,'',hash);await navigator.clipboard.writeText(location.href);$('demo-status').textContent='Share link copied. It contains only original-demo settings.';
  }catch(e){$('demo-status').textContent='Copy the address bar to share, or export the preset. '+e.message}
};
const exportGameConfig=$('exp').onclick,importGameConfig=$('impf').onchange;
$('exp').onclick=()=>demoMode?downloadJSON(demoPreset(),name+'.parts-lab.json'):exportGameConfig();
$('impf').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{if(f.size>1000000)throw new Error('Config is too large.');const value=JSON.parse(await f.text());
    if(value.format==='sssv-parts-lab-demo-v1')applyDemoPreset(value);
    else if(demoMode)throw new Error('This config needs its source data loaded first.');
    else await importGameConfig(e);
  }catch(err){$('demo-status').textContent=err.message;alert(err.message)}finally{e.target.value=''}
};
if(!Object.keys(EMBEDDED_TABLE).length)startDemos();
function readSharedDemo(){if(!location.hash.startsWith('#demo='))return;try{if(location.hash.length>16000)throw new Error('Share link is too large.');applyDemoPreset(JSON.parse(decodeURIComponent(location.hash.slice(6))))}catch(err){$('demo-status').textContent='Could not open shared demo: '+err.message}}
readSharedDemo();addEventListener('hashchange',readSharedDemo);
