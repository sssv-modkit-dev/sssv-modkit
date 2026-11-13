/* Local CI4 texture editing. No texture bytes are shipped with the editor. */
(function(root){
'use strict';
function descriptor(t,length){
  if(!t||t.format!=='ci4'||t.width!==16||t.height!==16||!Number.isInteger(t.image)||!Number.isInteger(t.palette)||t.image<0x1000||t.palette<0x1000||t.image%2||t.palette%2||t.image+128>length||t.palette+32>length)throw new Error('Unsupported or out-of-bounds eye texture.');
  return {format:'ci4',width:16,height:16,image:t.image,palette:t.palette};
}
function decode(bytes,t){
  t=descriptor(t,bytes.length);const indices=[],palette=[];
  for(let i=0;i<256;i++)indices.push((bytes[t.image+(i>>1)]>>(i%2?0:4))&15);
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
// Eyes use a planar quad with a rectangular UV domain. Subdivide it into texels,
// matching the static renderer used to verify the eye research.
function texelGeometry(part,t,bytes){
  const verts=part.groups.flatMap(g=>g.verts).filter(v=>Array.isArray(v.uv));if(verts.length<4)return part;
  const lo=[0,1].map(k=>Math.min(...verts.map(v=>v.uv[k]))),hi=[0,1].map(k=>Math.max(...verts.map(v=>v.uv[k])));if(hi.some((v,k)=>v<=lo[k]))return part;
  const corner=(u,v)=>verts.reduce((best,q)=>{const d=(q.uv[0]-(lo[0]+u*(hi[0]-lo[0])))**2+(q.uv[1]-(lo[1]+v*(hi[1]-lo[1])))**2;return !best||d<best.d?{q,d}:best},null).q;
  const a=corner(0,0),b=corner(1,0),c=corner(1,1),d=corner(0,1),point=(u,v)=>[0,1,2].map(k=>a[k]*(1-u)*(1-v)+b[k]*u*(1-v)+c[k]*u*v+d[k]*(1-u)*v);
  const data=decode(bytes,t),cols=data.palette.map(p=>({rgba:hex(p)})),tris=[];
  const old=part.tris[0];let flip=false;if(old){const cross=(p,q,r)=>[(q[1]-p[1])*(r[2]-p[2])-(q[2]-p[2])*(r[1]-p[1]),(q[2]-p[2])*(r[0]-p[0])-(q[0]-p[0])*(r[2]-p[2]),(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])];flip=cross(...old.v).reduce((s,n,k)=>s+n*cross(a,b,c)[k],0)<0;}
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){const col=data.indices[y*16+x];if(!data.palette[col][3])continue;const q=[point(x/16,y/16),point((x+1)/16,y/16),point((x+1)/16,(y+1)/16),point(x/16,(y+1)/16)];for(const order of [[0,1,2],[0,2,3]])tris.push({v:(flip?[...order].reverse():order).map(i=>q[i]),c:col});}
  return {...part,cols,tris,textureMaterial:true};
}
function rectangle(a,b){const clamp=n=>Math.min(15,Math.max(0,Math.floor(n)));const x=clamp(Math.min(a[0],b[0])),y=clamp(Math.min(a[1],b[1]));return {x,y,width:clamp(Math.max(a[0],b[0]))-x+1,height:clamp(Math.max(a[1],b[1]))-y+1};}
function contains(rect,x,y){return !rect||(x>=rect.x&&y>=rect.y&&x<rect.x+rect.width&&y<rect.y+rect.height);}
function floodFill(indices,x,y,ink,rect=null){
  const out=indices.slice(),old=out[y*16+x];if(old===ink||!contains(rect,x,y))return out;
  const todo=[[x,y]],seen=new Set();while(todo.length){const [a,b]=todo.pop(),i=b*16+a;if(a<0||b<0||a>=16||b>=16||!contains(rect,a,b)||seen.has(i)||out[i]!==old)continue;seen.add(i);out[i]=ink;todo.push([a-1,b],[a+1,b],[a,b-1],[a,b+1]);}return out;
}
function copyPixels(indices,rect={x:0,y:0,width:16,height:16}){const pixels=[];for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)pixels.push(indices[(rect.y+y)*16+rect.x+x]);return {width:rect.width,height:rect.height,pixels};}
function pastePixels(indices,clip,x,y,map=Array.from({length:16},(_,i)=>i)){
  const out=indices.slice();for(let b=0;b<clip.height;b++)for(let a=0;a<clip.width;a++)if(x+a>=0&&y+b>=0&&x+a<16&&y+b<16)out[(y+b)*16+x+a]=map[clip.pixels[b*clip.width+a]];return out;
}
function paletteMap(from,to){return from.map((p,index)=>to[index]?.every((v,k)=>v===p[k])?index:to.reduce((best,q,i)=>{const d=p.reduce((n,c,k)=>n+(c-q[k])**2*(k===3?4:1),0);return d<best.d?{i,d}:best},{i:0,d:Infinity}).i);}
function writeIndices(bytes,t,indices){descriptor(t,bytes.length);if(indices.length!==256||!indices.every(n=>Number.isInteger(n)&&n>=0&&n<16))throw new Error('Invalid indexed pixels.');for(let i=0;i<128;i++)bytes[t.image+i]=(indices[i*2]<<4)|indices[i*2+1];}
const pure={descriptor,decode,colourWord,patches,texelGeometry,rectangle,contains,floodFill,copyPixels,pastePixels,paletteMap,writeIndices};
if(typeof module!=='undefined')module.exports=pure;
if(!root.document)return;
let source=null,working=null,active=null,colour=1,painting=false,paletteChanging=false,panel=null,tool='pencil',selection=null,anchor=null,cursor=[0,0],previous=null,clipboard=null,message='';
const originals=new Map();
function syncSource(){if(demoMode||!dv?.byteLength)return false;if(source!==dv.buffer){finishStroke();finishPalette();source=dv.buffer;working=new Uint8Array(source.slice(0));originals.clear();active=null;selection=null;anchor=null;clipboard=null;message='';}return true;}
function supportedParts(parts){return parts.filter(p=>{try{descriptor(p.texture,dv.byteLength);return true}catch(_){return false}});}
function resetTextures(parts){if(!syncSource())return;for(const p of supportedParts(parts))for(const [start,n] of [[p.texture.image,128],[p.texture.palette,32]])working.set(new Uint8Array(source,start,n),start);updateGeometry();}
function decoratePart(part,meta,view){if(!meta.texture)return part;try{return texelGeometry(part,meta.texture,working&&source===view.buffer?working:new Uint8Array(view.buffer));}catch(_){return part;}}
function updateGeometry(){if(!syncSource())return;for(let i=0;i<parsed.length;i++){const meta=cur.p[i];if(!meta?.texture)continue;const key=name+':'+meta.s+':'+meta.r;if(!originals.has(key))originals.set(key,parseDL(dv,meta.r,bases));const result=decoratePart(originals.get(key),meta,dv);Object.assign(parsed[i],result);}rebuild(false);refresh();}
function historyBegin(){root.ModelEditorHistory?.begin?.();}
function historyEnd(){root.ModelEditorHistory?.end?.();}
function finishPalette(){if(!paletteChanging)return;paletteChanging=false;historyEnd();}
function instant(action){finishStroke();finishPalette();historyBegin();try{action()}finally{historyEnd()}}
function transparentInk(){const ink=decode(working,active.texture).palette.findIndex(p=>!p[3]);if(ink<0){message='No transparent swatch. Select a palette colour and turn off Opaque explicitly before erasing or cutting.';refresh();return null;}return ink;}
function position(event){const r=event.currentTarget.getBoundingClientRect();return [Math.min(15,Math.max(0,Math.floor((event.clientX-r.left)*16/r.width))),Math.min(15,Math.max(0,Math.floor((event.clientY-r.top)*16/r.height)))];}
function editPixel(event){
  if(!active||!painting)return;const at=position(event);cursor=at;
  if(tool==='select'){selection=rectangle(anchor,at);message='Selected '+selection.width+' x '+selection.height+' pixels.';refresh();return;}
  const ink=tool==='eraser'?transparentInk():colour;if(ink===null)return;
  const data=decode(working,active.texture);let next=data.indices;
  if(tool==='bucket')next=floodFill(next,...at,ink,selection);
  else{const from=previous||at,steps=Math.max(Math.abs(at[0]-from[0]),Math.abs(at[1]-from[1]));for(let i=0;i<=steps;i++){const x=steps?Math.round(from[0]+(at[0]-from[0])*i/steps):at[0],y=steps?Math.round(from[1]+(at[1]-from[1])*i/steps):at[1];if(contains(selection,x,y))next[y*16+x]=ink;}}
  previous=at;writeIndices(working,active.texture,next);updateGeometry();
}
function finishStroke(){if(!painting)return;painting=false;anchor=null;previous=null;historyEnd();}
function copySelection(cut=false){
  if(!active)return;const data=decode(working,active.texture),rect=selection||{x:0,y:0,width:16,height:16},ink=cut?transparentInk():null;if(cut&&ink===null)return;
  clipboard={...copyPixels(data.indices,rect),palette:data.palette};message='Copied '+rect.width+' x '+rect.height+' pixels to the local image clipboard.';
  if(cut)instant(()=>{for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++)data.indices[y*16+x]=ink;writeIndices(working,active.texture,data.indices);updateGeometry()});else refresh();
}
function pasteSelection(){if(!active||!clipboard)return;instant(()=>{const data=decode(working,active.texture),at=selection?[selection.x,selection.y]:cursor;writeIndices(working,active.texture,pastePixels(data.indices,clipboard,...at,paletteMap(clipboard.palette,data.palette)));selection=rectangle(at,[Math.min(15,at[0]+clipboard.width-1),Math.min(15,at[1]+clipboard.height-1)]);message='Pasted locally; pixels outside the image are clipped. Colours match the destination palette.';updateGeometry()});}
function refresh(){
  if(!panel){panel=document.createElement('section');panel.className='panel';panel.id='texture-workbench';panel.innerHTML='<h4>Texture Workbench</h4><p class="mut texture-status"></p><select aria-label="Texture part"></select><canvas width="16" height="16" aria-label="Paint texture pixels" style="width:192px;height:192px;max-width:100%;image-rendering:pixelated;touch-action:none;display:block;border:1px solid #888;background:repeating-conic-gradient(#353945 0% 25%,#252934 0% 50%) 50%/24px 24px"></canvas><div class="texture-tools" role="toolbar" aria-label="Texture tools" style="display:flex;flex-wrap:wrap;gap:4px"><button type="button" class="texture-tool-pencil">Pencil</button><button type="button" class="texture-tool-bucket">Bucket</button><button type="button" class="texture-tool-eraser">Eraser</button><button type="button" class="texture-tool-select">Select rectangle</button></div><div class="texture-clipboard" style="display:flex;flex-wrap:wrap;gap:4px"><button type="button" class="texture-copy">Copy</button><button type="button" class="texture-cut">Cut</button><button type="button" class="texture-paste">Paste</button><button type="button" class="texture-clear-selection">Clear selection</button></div><p class="mut texture-message" role="status"></p><div class="texture-swatches"></div><label>Palette colour <input type="color"></label><label><input class="texture-opaque" type="checkbox">Opaque</label><button type="button" class="texture-reset">Reset this texture</button><p class="mut">16-colour eye textures. Select a swatch for pencil or bucket. Rectangle selection limits painting; Copy/Cut use the rectangle or whole image. Paste starts at the selection or last touched pixel. Shared eye textures change every animal using the same pixels or palette. Colours use 5-bit channels. Focus the image for Ctrl/Cmd+A, C, X, V; Escape clears selection.</p>';document.getElementById('palette-panel').after(panel);
    const canvas=panel.querySelector('canvas');canvas.tabIndex=0;canvas.onkeydown=e=>{if((e.ctrlKey||e.metaKey)&&['a','c','x','v'].includes(e.key.toLowerCase())){e.preventDefault();finishStroke();finishPalette();if(e.key.toLowerCase()==='a'){selection={x:0,y:0,width:16,height:16};refresh()}else if(e.key.toLowerCase()==='v')pasteSelection();else copySelection(e.key.toLowerCase()==='x')}else if(e.key==='Escape'){selection=null;message='';refresh()}};canvas.onpointerdown=e=>{if(e.button!==undefined&&e.button!==0)return;finishPalette();finishStroke();historyBegin();painting=true;canvas.focus?.({preventScroll:true});previous=null;anchor=position(e);cursor=anchor;message='';canvas.setPointerCapture(e.pointerId);editPixel(e);if(tool==='bucket')finishStroke()};canvas.onpointermove=editPixel;canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=finishStroke;
    for(const name of ['pencil','bucket','eraser','select'])panel.querySelector('.texture-tool-'+name).onclick=()=>{finishStroke();finishPalette();tool=name;message='';refresh()};
    panel.querySelector('.texture-copy').onclick=()=>copySelection();panel.querySelector('.texture-cut').onclick=()=>copySelection(true);panel.querySelector('.texture-paste').onclick=pasteSelection;panel.querySelector('.texture-clear-selection').onclick=()=>{selection=null;message='';refresh()};
    for(const button of panel.querySelectorAll('.texture-tools button,.texture-clipboard button'))button.style.minHeight='32px';
    panel.querySelector('select').onchange=e=>{finishStroke();finishPalette();active=cur.p.find(p=>p.s===e.target.value);selection=null;message='';refresh()};
    const recolour=()=>{if(!active)return;const w=colourWord(panel.querySelector('input[type=color]').value.slice(1),panel.querySelector('.texture-opaque').checked),o=active.texture.palette+colour*2;working[o]=w>>8;working[o+1]=w&255;updateGeometry()};
    const colourInput=panel.querySelector('input[type=color]');colourInput.oninput=()=>{if(!active)return;if(!paletteChanging){finishStroke();historyBegin();paletteChanging=true;}recolour()};colourInput.onchange=colourInput.onblur=finishPalette;panel.querySelector('.texture-opaque').onchange=()=>instant(recolour);
    panel.querySelector('.texture-reset').onclick=()=>{if(active)instant(()=>resetTextures([active]))};
  }
  const parts=!demoMode&&cur&&syncSource()?supportedParts(cur.p):[];panel.hidden=demoMode||gallery;panel.setAttribute?.('data-supported',parts.length?'true':'false');const status=panel.querySelector('.texture-status');status.textContent=parts.length?'Paint frame 0 of a verified eye texture.':'No supported eye texture found for this animal. Other surfaces use the Palette Workbench.';
  for(const el of panel.querySelectorAll('select,canvas,input,button,.texture-swatches'))el.hidden=!parts.length;
  if(!parts.length||!syncSource()){active=null;return;}
  if(!parts.includes(active)){active=parts[0];selection=null;anchor=null;}const select=panel.querySelector('select');select.replaceChildren(...parts.map(p=>new Option(p.s,p.s)));select.value=active.s;
  const data=decode(working,active.texture),ctx=panel.querySelector('canvas').getContext('2d'),im=ctx.createImageData(16,16);for(let i=0;i<256;i++)im.data.set(data.palette[data.indices[i]],4*i);ctx.putImageData(im,0,0);if(selection){ctx.strokeStyle='#000000';ctx.lineWidth=.25;ctx.strokeRect(selection.x+.08,selection.y+.08,selection.width-.16,selection.height-.16);ctx.strokeStyle='#FFFFFF';ctx.lineWidth=.1;ctx.strokeRect(selection.x+.08,selection.y+.08,selection.width-.16,selection.height-.16);}
  panel.querySelector('.texture-message').textContent=message;for(const name of ['pencil','bucket','eraser','select'])panel.querySelector('.texture-tool-'+name).setAttribute('aria-pressed',String(tool===name));panel.querySelector('.texture-paste').disabled=!clipboard;panel.querySelector('.texture-clear-selection').disabled=!selection;
  const swatches=panel.querySelector('.texture-swatches');swatches.replaceChildren();data.palette.forEach((rgba,i)=>{const b=document.createElement('button');b.type='button';b.title='Palette '+i+(rgba[3]?'':' (transparent)');b.textContent=String(i);b.setAttribute('aria-pressed',String(i===colour));b.style.background='#'+hex(rgba.slice(0,3));b.style.color=rgba[0]+rgba[1]+rgba[2]>380?'#000':'#fff';b.onclick=()=>{finishPalette();colour=i;refresh()};swatches.appendChild(b)});
  panel.querySelector('input[type=color]').value='#'+hex(data.palette[colour].slice(0,3));panel.querySelector('.texture-opaque').checked=!!data.palette[colour][3];
}
function buildPatches(){if(!syncSource()||!source||!working)return [];return patches(new Uint8Array(source),working);}
function projectExtras(){const retained=root.ModelEditorHost?.availableSource?.();const code_patch=demoMode&&retained?.bytes===source&&working?patches(new Uint8Array(source),working):buildPatches();return code_patch.length?{texture_patches:code_patch}:{};}
function historyExtras(){return {texture_patches:source&&working?patches(new Uint8Array(source),working):[]};}
function loadProjectExtras(value,validateOnly=false){
  const edits=value.texture_patches===undefined?[]:value.texture_patches;
  if(!Array.isArray(edits)||edits.length>4096)throw new Error('Invalid texture edits.');
  if(!edits.length&&!syncSource())return;
  if(!syncSource())throw new Error('Open the source ROM before loading texture edits.');
  const original=new Uint8Array(source),next=original.slice(),allowed=new Set();
  for(const animal of Object.values(TABLE))for(const p of supportedParts(animal.p))for(const [s,n] of [[p.texture.image,128],[p.texture.palette,32]])for(let i=s;i<s+n;i++)allowed.add(i);
  const seen=new Set();for(const p of edits){if(!Number.isInteger(p.offset)||p.offset%2||typeof p.expect!=='string'||typeof p.write!=='string'||p.expect.length!==p.write.length||!/^([0-9a-f]{4})+$/i.test(p.expect)||!/^([0-9a-f]{4})+$/i.test(p.write))throw new Error('Invalid texture patch.');const length=p.expect.length/2;if(p.offset<0||p.offset+length>next.length||hex(original.slice(p.offset,p.offset+length))!==p.expect.toUpperCase())throw new Error('Texture edits belong to a different source.');for(let i=0;i<length;i++){const at=p.offset+i;if(!allowed.has(at)||seen.has(at))throw new Error('Texture patch outside supported textures or overlapping.');seen.add(at);next[at]=parseInt(p.write.slice(i*2,i*2+2),16);}}
  if(!validateOnly){finishStroke();finishPalette();working=next;selection=null;updateGeometry();}
}
document.getElementById('rst')?.addEventListener('click',()=>{if(!demoMode&&cur)resetTextures(cur.p)});
root.ModelTextureTools={...pure,decoratePart,refresh,buildPatches,projectExtras,historyExtras,loadProjectExtras,restoreHistoryExtras:loadProjectExtras,finishGesture:()=>{finishStroke();finishPalette()},validateProjectExtras:value=>loadProjectExtras(value,true)};
})(typeof window!=='undefined'?window:globalThis);
