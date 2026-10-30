//#LAB-PURE-START
function validateDemoPreset(value){
  if(!value||value.format!=='sssv-parts-lab-demo-v1'||!Object.hasOwn(PARTS_DEMOS,value.model))throw new Error('Not a Parts Lab demo preset.');
  const symbols=new Set(PARTS_DEMOS[value.model].p.map(p=>p.s));
  const vector=(a,lo,hi)=>Array.isArray(a)&&a.length===3&&a.every(n=>Number.isFinite(n)&&n>=lo&&n<=hi);
  const meshOut={},palette={},deformations={};
  for(const [s,e] of Object.entries(value.mesh||{})){
    if(!symbols.has(s)||!e||!vector(e.s,.1,10)||!vector(e.m,-500,500)||typeof e.o!=='boolean')throw new Error('Invalid mesh settings.');
    meshOut[s]={s:e.s,m:e.m,o:e.o};
  }
  const colours=new Set(PARTS_DEMOS[value.model].p.flatMap(p=>p.demo.cols.map(c=>c.rgba)));
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
function normaliseLocalTable(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Expected an animal table object.');
  const out=Object.create(null),safe=s=>typeof s==='string'&&/^[a-zA-Z0-9_ .|()-]{1,150}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
  const entries=Object.entries(raw);
  if(!entries.length||entries.length>300)throw new Error('Unexpected animal count.');
  for(const [name,a] of entries){
    if(!safe(name)||!a||!Array.isArray(a.parts)||a.parts.length>2000)throw new Error('Invalid animal entry.');
    const b=Object.create(null);
    for(const [seg,base] of Object.entries(a.seg_bases||{})){
      if(!/^\d{1,2}$/.test(seg)||typeof base!=='string'||! /^(0x)?[0-9a-fA-F]{1,8}$/.test(base)||parseInt(base,16)>0x2000000)throw new Error('Invalid segment base.');
      b[seg]=base;
    }
    const sections=a.sections||[];
    if(!Array.isArray(sections)||!sections.every(safe))throw new Error('Invalid sections.');
    const p=[];
    for(const q of a.parts){
      if(!q.ended||q.seg===1)continue;
      if(!safe(q.symbol)||!Number.isInteger(q.rom)||q.rom<0||q.rom>=0x2000000||!Array.isArray(q.sections||[])||!(q.sections||[]).every(safe))throw new Error('Invalid part metadata.');
      p.push({s:q.symbol,r:q.rom,j:'local',v:q.sections||[],t:[]});
    }
    if(p.length)out[name]={b,p,s:sections};
  }
  if(!Object.keys(out).length)throw new Error('No renderable parts in that table.');
  return out;
}
//#LAB-PURE-END
function startDemos(model=Object.keys(PARTS_DEMOS)[0]){
  demoMode=true;TABLE=PARTS_DEMOS;dv=new DataView(new ArrayBuffer(0));pose=null;
  document.body.classList.add('demo-mode');
  const A=$('an');A.replaceChildren(...Object.keys(TABLE).map(n=>new Option(n,n)));A.disabled=false;A.onchange=()=>pick(A.value);
  buildGallery();$('gallery-toggle').disabled=false;$('gallery-toggle').onclick=()=>setGallery(!gallery);
  pick(model);$('variant-label').textContent='Original CC0 demo · drag to orbit';
  $('demo-status').textContent='Original CC0 demo geometry. No game assets included.';
}
function demoPreset(){return validateDemoPreset({format:'sssv-parts-lab-demo-v1',model:name,mesh,palette:map,deform:deformOn?deform:{},exploded:sheet})}
function applyDemoPreset(raw){const p=validateDemoPreset(raw);startDemos(p.model);mesh=p.mesh;map=p.palette;deform=p.deform;deformOn=Object.keys(deform).length>0;sheet=p.exploded;all=!sheet;SH=sheetLayout(visibleParts());ui();rebuild(true);info()}
function downloadJSON(value,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('demo-start').onclick=()=>startDemos();
$('demo-assemble').onclick=()=>{assembled=false;all=true;sheet=false;ui();rebuild(true);info()};
$('demo-explode').onclick=()=>{assembled=false;all=false;sheet=true;SH=sheetLayout(visibleParts());ui();rebuild(true);info()};
$('demo-stretch').onclick=()=>{
  for(const P of parsed.filter(p=>/leg/.test(p.sym)))mesh[P.sym]={s:[1,1.8,1],m:[0,-16,0],o:false};
  if(!parsed.some(p=>/leg/.test(p.sym)))mesh[parsed[0].sym]={s:[1,1.8,1],m:[0,0,0],o:false};
  ui();rebuild(true);info();
};
for(const type of ['bend','twist'])$('demo-'+type).onclick=()=>{
  const P=parsed[sel];if(!P)return;
  deform[P.sym]=[{ops:[{type,axis:'y',degrees:65,...(type==='bend'?{toward:'x'}:{})}]}];deformOn=true;deformCache.clear();ui();rebuild(true);info();
  $('demo-status').textContent=type+' applied to '+P.sym+'. Reset clears edits.';
};
$('demo-colour').onclick=()=>{for(const c of new Set(parsed.flatMap(P=>P.cols.map(c=>c.rgba))))map[c]=[0,1,2].map(()=>Math.floor(60+Math.random()*180).toString(16).padStart(2,'0')).join('').toUpperCase()+'FF';ui();rebuild(false)};
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
    else if(demoMode)throw new Error('Game configs require loading your local table and ROM first.');
    else await importGameConfig(e);
  }catch(err){$('demo-status').textContent=err.message;alert(err.message)}finally{e.target.value=''}
};
$('local-table').onchange=async e=>{
  const f=e.target.files[0];if(!f)return;
  try{if(f.size>16000000)throw new Error('Table is too large (16 MB maximum).');const next=normaliseLocalTable(JSON.parse(await f.text()));romTable=next;
    $('rom').disabled=false;$('msg').textContent=Object.keys(next).length+' animals indexed locally. Now choose your ROM.';
  }catch(err){$('msg').textContent='Could not read table: '+err.message}finally{e.target.value=''}
};
if(!Object.keys(romTable).length){startDemos();$('rom').disabled=true}
else $('msg').textContent='Animal table embedded in this private build. Choose your ROM; remembering it is optional.';
function readSharedDemo(){if(!location.hash.startsWith('#demo='))return;try{if(location.hash.length>16000)throw new Error('Share link is too large.');applyDemoPreset(JSON.parse(decodeURIComponent(location.hash.slice(6))))}catch(err){$('demo-status').textContent='Could not open shared demo: '+err.message}}
readSharedDemo();addEventListener('hashchange',readSharedDemo);

// Two-finger pinch zoom and pan; one-finger orbit keeps the shared pointer controls.
const touches=new Map();let pinch=null;
cv.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size===2){dr=null;pinch=touchMetrics()}},true);
function touchMetrics(){const [a,b]=[...touches.values()];return {d:Math.hypot(a[0]-b[0],a[1]-b[1]),x:(a[0]+b[0])/2,y:(a[1]+b[1])/2}}
cv.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size===2){e.stopImmediatePropagation();const next=touchMetrics();if(pinch&&next.d>2){dist*=pinch.d/next.d;ctr[0]-=(next.x-pinch.x)*dist*.002;ctr[1]+=(next.y-pinch.y)*dist*.002;need()}pinch=next}},true);
for(const event of ['pointerup','pointercancel'])cv.addEventListener(event,e=>{touches.delete(e.pointerId);pinch=null;dr=null},true);
