/* Local CI4 texture editing. No texture bytes are shipped with the editor. */
(function(root){
'use strict';
function descriptor(t,length){
  if(!t||t.format!=='ci4'||![16,32].includes(t.width)||t.height!==t.width||!Number.isInteger(t.image)||!Number.isInteger(t.palette)||t.image<0x1000||t.palette<0x1000||t.image%2||t.palette%2||t.image+t.width*t.height/2>length||t.palette+32>length)throw new Error('Unsupported or out-of-bounds CI4 texture.');
  return {format:'ci4',width:t.width,height:t.height,image:t.image,palette:t.palette};
}
// View-only RGBA16 32x32 textures (cutscene characters). 'swap' = odd rows have their 4-byte words swapped.
function viewDescriptor(t,length){
  if(t&&t.format==='rgba16'){
    if(t.width!==32||t.height!==32||!Number.isInteger(t.image)||t.image<0x1000||t.image%2||t.image+2048>length)throw new Error('Unsupported or out-of-bounds RGBA16 texture.');
    return {format:'rgba16',width:32,height:32,image:t.image,swap:!!t.swap};
  }
  return descriptor(t,length);
}
function decodeRgba16(bytes,t){
  const palette=[],lookup=new Map(),indices=[];
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const xs=t.swap&&(y&1)?x^2:x,at=t.image+(y*32+xs)*2,word=bytes[at]*256+bytes[at+1];
    let k=lookup.get(word);if(k===undefined){k=palette.length;lookup.set(word,k);palette.push([Math.round((word>>11&31)*255/31),Math.round((word>>6&31)*255/31),Math.round((word>>1&31)*255/31),word&1?255:0]);}
    indices.push(k);
  }
  return {indices,palette};
}
function decode(bytes,t){
  t=descriptor(t,bytes.length);const indices=[],palette=[];
  for(let i=0;i<t.width*t.height;i++)indices.push((bytes[t.image+(i>>1)]>>(i%2?0:4))&15);
  for(let i=0;i<16;i++){const word=bytes[t.palette+2*i]*256+bytes[t.palette+2*i+1];palette.push([Math.round((word>>11&31)*255/31),Math.round((word>>6&31)*255/31),Math.round((word>>1&31)*255/31),word&1?255:0]);}
  return {indices,palette};
}
function colourWord(hex,alpha){const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));if(!/^[0-9a-f]{6}$/i.test(hex))throw new Error('Invalid colour');return (Math.round(rgb[0]*31/255)<<11)|(Math.round(rgb[1]*31/255)<<6)|(Math.round(rgb[2]*31/255)<<1)|(alpha?1:0);}
function hex(bytes){return Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();}
function patches(original,changed){
  if(original.length%2)throw new Error('Texture patch source must have an even byte length.');
  if(original.length!==changed.length)throw new Error('Texture edit cannot resize the source.');
  const out=[];for(let i=0;i<original.length;i+=2){if(original[i]===changed[i]&&original[i+1]===changed[i+1])continue;const start=i;while(i+2<original.length&&(original[i+2]!==changed[i+2]||original[i+3]!==changed[i+3]))i+=2;
    out.push({offset:start,expect:hex(original.slice(start,i+2)),write:hex(changed.slice(start,i+2)),align:false,note:'Texture Workbench'});
  }return out;
}
// Clip each textured body triangle in UV space to texel cells (s10.5 UVs at texture scale 0.5).
// Triangles drawn under an untextured combiner (tx===false from parseDL, e.g. the bear head) keep their colours.
// Interpolated positions stay on that triangle; wrapping also handles negative UVs.
const CELL_BUDGET=30000;
function bodyGeometry(part,t,bytes){
  const data=t.format==='rgba16'?decodeRgba16(bytes,t):decode(bytes,t),cols=data.palette.map(p=>({rgba:hex(p)})),tris=[];
  const clip=(poly,k,edge,sign)=>{
    const out=[];for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=(a[k]-edge)*sign,db=(b[k]-edge)*sign;
      if(da>=0)out.push(a);
      if((da>=0)!==(db>=0)){const f=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*f));}
    }return out;
  };
  // Dense UV spans (cutscene characters) would explode into hundreds of thousands of cells: past a budget, sample one texel per triangle.
  let cells=0;for(const tri of part.tris){if(!tri.v.every(v=>Array.isArray(v.uv)))continue;const us=tri.v.map(v=>v.uv[0]/32),vs=tri.v.map(v=>v.uv[1]/32);cells+=Math.max(1,Math.ceil(Math.max(...us))-Math.floor(Math.min(...us)))*Math.max(1,Math.ceil(Math.max(...vs))-Math.floor(Math.min(...vs)));}
  if(cells>CELL_BUDGET){
    for(const tri of part.tris){
      if(!tri.v.every(v=>Array.isArray(v.uv))){tris.push({...tri,c:-1});continue;}
      const u=tri.v.reduce((n,v)=>n+v.uv[0],0)/96,w=tri.v.reduce((n,v)=>n+v.uv[1],0)/96,x=((Math.floor(u)%t.width)+t.width)%t.width,y=((Math.floor(w)%t.height)+t.height)%t.height;
      tris.push({...tri,c:data.indices[y*t.width+x]});
    }
    return {...part,cols,tris,textureMaterial:true};
  }
  for(const tri of part.tris){
    if(tri.tx===false||!tri.v.every(v=>Array.isArray(v.uv))){tris.push(tri.tx===false&&tri.c>=0?{...tri,c:cols.length+tri.c}:{...tri,c:-1});continue;}
    // Animals draw with gSPTexture scale 0x8000 (0.5): s10.5 UV / 32 * 0.5 = texels.
    const poly=tri.v.map(v=>[v.uv[0]/64,v.uv[1]/64,...v]);
    const min=[0,1].map(k=>Math.floor(Math.min(...poly.map(v=>v[k])))),max=[0,1].map(k=>Math.max(min[k]+1,Math.ceil(Math.max(...poly.map(v=>v[k])))));
    if((max[0]-min[0])*(max[1]-min[1])>65536)return part;
    for(let y=min[1];y<max[1];y++)for(let x=min[0];x<max[0];x++){
      const col=data.indices[((y%t.height+t.height)%t.height)*t.width+(x%t.width+t.width)%t.width];
      if(!data.palette[col][3])continue;
      let q=clip(poly,0,x,1);q=clip(q,0,x+1,-1);q=clip(q,1,y,1);q=clip(q,1,y+1,-1);
      for(let i=1;i+1<q.length;i++){
        const v=[q[0],q[i],q[i+1]];
        const a=v[1].slice(2).map((n,k)=>n-v[0][k+2]),b=v[2].slice(2).map((n,k)=>n-v[0][k+2]);
        if(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])>1e-10)tris.push({v:v.map(p=>p.slice(2)),c:col});
      }
    }
  }
  return {...part,cols:cols.concat(part.cols||[]),tris,textureMaterial:true};
}
// Preserve the verified planar eye-quad mapping for 16x16 strips.
function texelGeometry(part,t,bytes){
  viewDescriptor(t,bytes.length);if(t.width===32)return bodyGeometry(part,t,bytes);
  const verts=part.groups.flatMap(g=>g.verts).filter(v=>Array.isArray(v.uv));if(verts.length<4)return part;
  const lo=[0,1].map(k=>Math.min(...verts.map(v=>v.uv[k]))),hi=[0,1].map(k=>Math.max(...verts.map(v=>v.uv[k])));if(hi.some((v,k)=>v<=lo[k]))return part;
  const corner=(u,v)=>verts.reduce((best,q)=>{const d=(q.uv[0]-(lo[0]+u*(hi[0]-lo[0])))**2+(q.uv[1]-(lo[1]+v*(hi[1]-lo[1])))**2;return !best||d<best.d?{q,d}:best},null).q;
  const a=corner(0,0),b=corner(1,0),c=corner(1,1),d=corner(0,1),point=(u,v)=>[0,1,2].map(k=>a[k]*(1-u)*(1-v)+b[k]*u*(1-v)+c[k]*u*v+d[k]*(1-u)*v);
  const data=decode(bytes,t),cols=data.palette.map(p=>({rgba:hex(p)})),tris=[];
  const old=part.tris[0];let flip=false;if(old){const cross=(p,q,r)=>[(q[1]-p[1])*(r[2]-p[2])-(q[2]-p[2])*(r[1]-p[1]),(q[2]-p[2])*(r[0]-p[0])-(q[0]-p[0])*(r[2]-p[2]),(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])];flip=cross(...old.v).reduce((s,n,k)=>s+n*cross(a,b,c)[k],0)<0;}
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const col=data.indices[y*16+x];if(!data.palette[col][3])continue;const q=[point(x/16,y/16),point((x+1)/16,y/16),point((x+1)/16,(y+1)/16),point(x/16,(y+1)/16)];for(const order of [[0,1,2],[0,2,3]])tris.push({v:(flip?[...order].reverse():order).map(i=>q[i]),c:col});}
  return {...part,cols,tris,textureMaterial:true};
}
function rectangle(a,b,width=16,height=width){const clamp=(n,limit=width)=>Math.min(limit-1,Math.max(0,Math.floor(n)));const x=clamp(Math.min(a[0],b[0])),y=clamp(Math.min(a[1],b[1]),height);return {x,y,width:clamp(Math.max(a[0],b[0]))-x+1,height:clamp(Math.max(a[1],b[1]),height)-y+1};}
function contains(rect,x,y){return !rect||(x>=rect.x&&y>=rect.y&&x<rect.x+rect.width&&y<rect.y+rect.height);}
function floodFill(indices,x,y,ink,rect=null,width=Math.sqrt(indices.length),height=indices.length/width){
  const out=indices.slice(),old=out[y*width+x];if(old===ink||!contains(rect,x,y))return out;
  const todo=[[x,y]],seen=new Set();while(todo.length){const [a,b]=todo.pop(),i=b*width+a;if(a<0||b<0||a>=width||b>=height||!contains(rect,a,b)||seen.has(i)||out[i]!==old)continue;seen.add(i);out[i]=ink;todo.push([a-1,b],[a+1,b],[a,b-1],[a,b+1]);}return out;
}
function copyPixels(indices,rect={x:0,y:0,width:Math.sqrt(indices.length),height:Math.sqrt(indices.length)},width=Math.sqrt(indices.length)){const pixels=[];for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)pixels.push(indices[(rect.y+y)*width+rect.x+x]);return {width:rect.width,height:rect.height,pixels};}
function pastePixels(indices,clip,x,y,map=Array.from({length:16},(_,i)=>i),width=Math.sqrt(indices.length),height=indices.length/width){
  const out=indices.slice();for(let b=0;b<clip.height;b++)for(let a=0;a<clip.width;a++)if(x+a>=0&&y+b>=0&&x+a<width&&y+b<height)out[(y+b)*width+x+a]=map[clip.pixels[b*clip.width+a]];return out;
}
function paletteMap(from,to){return from.map((p,index)=>to[index]?.every((v,k)=>v===p[k])?index:to.reduce((best,q,i)=>{const d=p.reduce((n,c,k)=>n+(c-q[k])**2*(k===3?4:1),0);return d<best.d?{i,d}:best},{i:0,d:Infinity}).i);}
function writeIndices(bytes,t,indices){descriptor(t,bytes.length);if(indices.length!==t.width*t.height||!indices.every(n=>Number.isInteger(n)&&n>=0&&n<16))throw new Error('Invalid indexed pixels.');for(let i=0;i<t.width*t.height/2;i++)bytes[t.image+i]=(indices[i*2]<<4)|indices[i*2+1];}
const pure={descriptor,viewDescriptor,decode,decodeRgba16,colourWord,patches,texelGeometry,rectangle,contains,floodFill,copyPixels,pastePixels,paletteMap,writeIndices};
if(typeof module!=='undefined')module.exports=pure;
if(!root.document)return;
let source=null,working=null,active=null,colour=1,painting=false,paletteChanging=false,panel=null,unavailablePanel=null,tool='pencil',selection=null,anchor=null,cursor=[0,0],previous=null,clipboard=null,message='';
const originals=new Map();
function syncSource(){if(demoMode||!dv?.byteLength)return false;if(source!==dv.buffer){finishStroke();finishPalette();source=dv.buffer;working=new Uint8Array(source.slice(0));originals.clear();active=null;selection=null;anchor=null;clipboard=null;message='';}return true;}
function supportedParts(parts){return parts.filter(p=>{try{descriptor(p.texture,dv.byteLength);return true}catch(_){return false}});}
function resetTextures(parts){if(!syncSource())return;for(const p of supportedParts(parts))for(const [start,n] of [[p.texture.image,p.texture.width*p.texture.height/2],[p.texture.palette,32]])working.set(new Uint8Array(source,start,n),start);updateGeometry();}
function decoratePart(part,meta,view){if(!meta.texture)return part;try{return texelGeometry(part,meta.texture,working&&source===view.buffer?working:new Uint8Array(view.buffer));}catch(_){return part;}}
function updateGeometry(){if(!syncSource())return;for(let i=0;i<parsed.length;i++){const meta=cur.p[i];if(!meta?.texture)continue;const key=name+':'+meta.s+':'+meta.r;if(!originals.has(key))originals.set(key,parseDL(dv,meta.r,bases));const result=decoratePart(originals.get(key),meta,dv);Object.assign(parsed[i],result);}rebuild(false);refresh();}
function historyBegin(){root.ModelEditorHistory?.begin?.();}
function historyEnd(){root.ModelEditorHistory?.end?.();}
function finishPalette(){if(!paletteChanging)return;paletteChanging=false;historyEnd();}
function instant(action){finishStroke();finishPalette();historyBegin();try{action()}finally{historyEnd()}}
function transparentInk(){const ink=decode(working,active.texture).palette.findIndex(p=>!p[3]);if(ink<0){message='No transparent swatch. Select a palette colour and turn off Opaque explicitly before erasing or cutting.';refresh();return null;}return ink;}
function position(event){const r=event.currentTarget.getBoundingClientRect();return [Math.min(active.texture.width-1,Math.max(0,Math.floor((event.clientX-r.left)*active.texture.width/r.width))),Math.min(active.texture.height-1,Math.max(0,Math.floor((event.clientY-r.top)*active.texture.height/r.height)))];}
function editPixel(event){
  if(!active||!painting)return;const at=position(event);cursor=at;
  if(tool==='select'){selection=rectangle(anchor,at,active.texture.width,active.texture.height);message='Selected '+selection.width+' x '+selection.height+' pixels.';refresh();return;}
  const ink=tool==='eraser'?transparentInk():colour;if(ink===null)return;
  const data=decode(working,active.texture);let next=data.indices;
  if(tool==='bucket')next=floodFill(next,...at,ink,selection);
  else{const from=previous||at,steps=Math.max(Math.abs(at[0]-from[0]),Math.abs(at[1]-from[1]));for(let i=0;i<=steps;i++){const x=steps?Math.round(from[0]+(at[0]-from[0])*i/steps):at[0],y=steps?Math.round(from[1]+(at[1]-from[1])*i/steps):at[1];if(contains(selection,x,y))next[y*active.texture.width+x]=ink;}}
  previous=at;writeIndices(working,active.texture,next);updateGeometry();
}
function finishStroke(){if(!painting)return;painting=false;anchor=null;previous=null;historyEnd();}
function copySelection(cut=false){
  if(!active)return;const data=decode(working,active.texture),rect=selection||{x:0,y:0,width:active.texture.width,height:active.texture.height},ink=cut?transparentInk():null;if(cut&&ink===null)return;
  clipboard={...copyPixels(data.indices,rect),palette:data.palette};message='Copied '+rect.width+' x '+rect.height+' pixels to the local image clipboard.';
  if(cut)instant(()=>{for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)data.indices[y*active.texture.width+x]=ink;writeIndices(working,active.texture,data.indices);updateGeometry()});else refresh();
}
function pasteSelection(){if(!active||!clipboard)return;instant(()=>{const data=decode(working,active.texture),at=selection?[selection.x,selection.y]:cursor;writeIndices(working,active.texture,pastePixels(data.indices,clipboard,...at,paletteMap(clipboard.palette,data.palette)));selection=rectangle(at,[Math.min(active.texture.width-1,at[0]+clipboard.width-1),Math.min(active.texture.height-1,at[1]+clipboard.height-1)],active.texture.width,active.texture.height);message='Pasted locally; pixels outside the image are clipped. Colours match the destination palette.';updateGeometry()});}
function refresh(){
  if(!panel){panel=document.createElement('section');panel.className='panel';panel.id='texture-workbench';panel.innerHTML='<h4>Texture Workbench</h4><p class="mut texture-status"></p><select aria-label="Texture part"></select><canvas width="16" height="16" aria-label="Paint texture pixels" style="width:192px;height:192px;max-width:100%;image-rendering:pixelated;touch-action:none;display:block;border:1px solid #888;background:repeating-conic-gradient(#353945 0% 25%,#252934 0% 50%) 50%/24px 24px"></canvas><div class="texture-tools" role="toolbar" aria-label="Texture tools" style="display:flex;flex-wrap:wrap;gap:4px"><button type="button" class="texture-tool-pencil">Pencil</button><button type="button" class="texture-tool-bucket">Bucket</button><button type="button" class="texture-tool-eraser">Eraser</button><button type="button" class="texture-tool-select">Select rectangle</button></div><div class="texture-clipboard" style="display:flex;flex-wrap:wrap;gap:4px"><button type="button" class="texture-copy">Copy</button><button type="button" class="texture-cut">Cut</button><button type="button" class="texture-paste">Paste</button><button type="button" class="texture-clear-selection">Clear selection</button></div><p class="mut texture-message" role="status"></p><div class="texture-swatches"></div><label>Palette colour <input type="color"></label><label><input class="texture-opaque" type="checkbox">Opaque</label><button type="button" class="texture-reset">Reset this texture</button><p class="mut">16-colour indexed textures. Select a swatch for pencil or bucket. Rectangle selection limits painting; Copy/Cut use the rectangle or whole image. Paste starts at the selection or last touched pixel. Shared textures change every animal using the same pixels or palette. Colours use 5-bit channels. Focus the image for Ctrl/Cmd+A, C, X, V; Escape clears selection.</p>';document.getElementById('palette-panel').after(panel);
    const canvas=panel.querySelector('canvas');canvas.tabIndex=0;canvas.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&['a','c','x','v'].includes(e.key.toLowerCase())){e.preventDefault();finishStroke();finishPalette();if(e.key.toLowerCase()==='a'){selection={x:0,y:0,width:active.texture.width,height:active.texture.height};refresh()}else if(e.key.toLowerCase()==='v')pasteSelection();else copySelection(e.key.toLowerCase()==='x')}else if(e.key==='Escape'){selection=null;message='';refresh()}};canvas.onpointerdown=e=>{if(e.button!==undefined&&e.button!==0)return;finishPalette();finishStroke();historyBegin();painting=true;canvas.focus?.({preventScroll:true});previous=null;anchor=position(e);cursor=anchor;message='';canvas.setPointerCapture(e.pointerId);editPixel(e);if(tool==='bucket')finishStroke()};canvas.onpointermove=editPixel;canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=finishStroke;
    for(const name of ['pencil','bucket','eraser','select'])panel.querySelector('.texture-tool-'+name).onclick=()=>{finishStroke();finishPalette();tool=name;message='';refresh()};
    panel.querySelector('.texture-copy').onclick=()=>copySelection();panel.querySelector('.texture-cut').onclick=()=>copySelection(true);panel.querySelector('.texture-paste').onclick=pasteSelection;panel.querySelector('.texture-clear-selection').onclick=()=>{selection=null;message='';refresh()};
    for(const button of panel.querySelectorAll('.texture-tools button,.texture-clipboard button'))button.style.minHeight='32px';
    panel.querySelector('select').onchange=e=>{finishStroke();finishPalette();active=cur.p.find(p=>p.s===e.target.value);selection=null;message='';refresh()};
    const recolour=()=>{if(!active)return;const w=colourWord(panel.querySelector('input[type=color]').value.slice(1),panel.querySelector('.texture-opaque').checked),o=active.texture.palette+colour*2;working[o]=w>>8;working[o+1]=w&255;updateGeometry()};
    const colourInput=panel.querySelector('input[type=color]');colourInput.oninput=()=>{if(!active)return;if(!paletteChanging){finishStroke();historyBegin();paletteChanging=true;}recolour()};colourInput.onchange=colourInput.onblur=finishPalette;panel.querySelector('.texture-opaque').onchange=()=>instant(recolour);
    panel.querySelector('.texture-reset').onclick=()=>{if(active)instant(()=>resetTextures([active]))};
  }
  const candidates=!demoMode&&cur&&syncSource()?supportedParts(cur.p):[],parts=typeof selectedSym!=='undefined'&&selectedSym?candidates.filter(p=>p.s===selectedSym):candidates;panel.hidden=demoMode||gallery;const unavailable=typeof selectedSym!=='undefined'&&selectedSym&&!parts.length;panel.classList?.toggle('texture-unavailable',!!unavailable);panel.setAttribute?.('aria-disabled',String(!parts.length));panel.setAttribute?.('data-supported',parts.length?'true':'false');if(!unavailablePanel){unavailablePanel=document.createElement('section');unavailablePanel.id='texture-unavailable';unavailablePanel.className='panel';unavailablePanel.innerHTML='<button type="button" disabled>Texture editing unavailable</button><p class="mut">No verified indexed material on this part. Untextured parts use vertex colours; other materials need decoded image/palette data.</p>';panel.after?.(unavailablePanel);}panel.hidden=demoMode||gallery||!parts.length;unavailablePanel.hidden=demoMode||gallery||!!parts.length;const status=panel.querySelector('.texture-status');status.textContent=parts.length?'Paint a verified CI4 texture.':'Texture editing unavailable: this part has no verified indexed material. Untextured parts use vertex colours; other materials need a decoded image/palette descriptor.';
  for(const el of panel.querySelectorAll('select,canvas,input,button,.texture-swatches'))el.hidden=!parts.length;
  if(!parts.length||!syncSource()){finishStroke();finishPalette();active=null;selection=null;anchor=null;return;}
  if(!parts.includes(active)){active=parts[0];selection=null;anchor=null;}const select=panel.querySelector('select');select.replaceChildren(...parts.map(p=>new Option(p.s,p.s)));select.value=active.s;
  status.textContent='Paint a verified CI4 '+active.texture.width+' x '+active.texture.height+' texture.';
  const canvas=panel.querySelector('canvas');if(canvas.width!==active.texture.width)canvas.width=active.texture.width;if(canvas.height!==active.texture.height)canvas.height=active.texture.height;
  const data=decode(working,active.texture),ctx=canvas.getContext('2d'),im=ctx.createImageData(active.texture.width,active.texture.height);for(let i=0;i<data.indices.length;i++)im.data.set(data.palette[data.indices[i]],4*i);ctx.putImageData(im,0,0);if(selection){ctx.strokeStyle='#000000';ctx.lineWidth=.25;ctx.strokeRect(selection.x+.08,selection.y+.08,selection.width-.16,selection.height-.16);ctx.strokeStyle='#FFFFFF';ctx.lineWidth=.1;ctx.strokeRect(selection.x+.08,selection.y+.08,selection.width-.16,selection.height-.16);}
  panel.querySelector('.texture-message').textContent=message;for(const name of ['pencil','bucket','eraser','select'])panel.querySelector('.texture-tool-'+name).setAttribute('aria-pressed',String(tool===name));panel.querySelector('.texture-paste').disabled=!clipboard;panel.querySelector('.texture-clear-selection').disabled=!selection;
  const swatches=panel.querySelector('.texture-swatches');swatches.replaceChildren();data.palette.forEach((rgba,i)=>{const b=document.createElement('button');b.type='button';b.title='Palette '+i+(rgba[3]?'':' (transparent)');b.textContent=String(i);b.setAttribute('aria-pressed',String(i===colour));b.style.background='#'+hex(rgba.slice(0,3));b.style.color=rgba[0]+rgba[1]+rgba[2]>380?'#000':'#fff';b.onclick=()=>{finishPalette();colour=i;refresh()};swatches.appendChild(b)});
  panel.querySelector('input[type=color]').value='#'+hex(data.palette[colour].slice(0,3));panel.querySelector('.texture-opaque').checked=!!data.palette[colour][3];
}
function buildPatches(){if(!syncSource()||!source||!working)return [];return patches(new Uint8Array(source),working);}
// Patches retain byte ranges and expected source bytes. Size is implied by the
// matching table descriptor, so legacy 16x16 projects need no migration.
function projectExtras(){const retained=root.ModelEditorHost?.availableSource?.();const code_patch=demoMode&&retained?.bytes===source&&working?patches(new Uint8Array(source),working):buildPatches();return code_patch.length?{texture_patches:code_patch}:{};}
function historyExtras(){return {texture_patches:source&&working?patches(new Uint8Array(source),working):[]};}
function loadProjectExtras(value,validateOnly=false){
  const edits=value.texture_patches===undefined?[]:value.texture_patches;
  if(!Array.isArray(edits)||edits.length>4096)throw new Error('Invalid texture edits.');
  if(!edits.length&&!syncSource())return;
  if(!syncSource())throw new Error('Open the source ROM before loading texture edits.');
  const original=new Uint8Array(source),next=original.slice(),allowed=new Set();
  for(const animal of Object.values(TABLE))for(const p of supportedParts(animal.p))for(const [s,n] of [[p.texture.image,p.texture.width*p.texture.height/2],[p.texture.palette,32]])for(let i=s;i<s+n;i++)allowed.add(i);
  const seen=new Set();for(const p of edits){if(!Number.isInteger(p.offset)||p.offset%2||typeof p.expect!=='string'||typeof p.write!=='string'||p.expect.length!==p.write.length||!/^([0-9a-f]{4})+$/i.test(p.expect)||!/^([0-9a-f]{4})+$/i.test(p.write))throw new Error('Invalid texture patch.');const length=p.expect.length/2;if(p.offset<0||p.offset+length>next.length||hex(original.slice(p.offset,p.offset+length))!==p.expect.toUpperCase())throw new Error('Texture edits belong to a different source.');for(let i=0;i<length;i++){const at=p.offset+i;if(!allowed.has(at)||seen.has(at))throw new Error('Texture patch outside supported textures or overlapping.');seen.add(at);next[at]=parseInt(p.write.slice(i*2,i*2+2),16);}}
  if(!validateOnly){finishStroke();finishPalette();working=next;selection=null;updateGeometry();}
}
document.getElementById('rst')?.addEventListener('click',()=>{if(!demoMode&&cur)resetTextures(cur.p)});
root.ModelTextureTools={...pure,decoratePart,refresh,buildPatches,projectExtras,historyExtras,loadProjectExtras,restoreHistoryExtras:loadProjectExtras,finishGesture:()=>{finishStroke();finishPalette()},validateProjectExtras:value=>loadProjectExtras(value,true)};
})(typeof window!=='undefined'?window:globalThis);
