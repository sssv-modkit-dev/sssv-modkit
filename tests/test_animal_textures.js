const assert=require('node:assert/strict');
const T=require('../src/viewer/js/animal-textures.js');
const bytes=new Uint8Array(0x2000),t={format:'ci4',image:0x1000,palette:0x1100,width:16,height:16};
bytes[0x1000]=0x12;bytes[0x1102]=0xF8;bytes[0x1103]=1;bytes[0x1104]=7;bytes[0x1105]=0xC1;
const decoded=T.decode(bytes,t);assert.deepEqual(decoded.indices.slice(0,2),[1,2]);assert.deepEqual(decoded.palette[1],[255,0,0,255]);assert.deepEqual(decoded.palette[2],[0,255,0,255]);assert.equal(decoded.palette[0][3],0);
assert.equal(T.colourWord('FF0000',true),0xF801);assert.equal(T.colourWord('00FF00',false),0x7C0);
assert.throws(()=>T.decode(bytes,{...t,image:bytes.length-1}));assert.throws(()=>T.decode(bytes,{...t,width:32}));
const changed=bytes.slice();changed[0x1000]=0x21;changed[0x1103]=0;
const patches=T.patches(bytes,changed);assert.equal(patches.length,2);assert.deepEqual(patches.map(p=>p.offset),[0x1000,0x1102]);
const rebuilt=bytes.slice();for(const p of patches){assert.equal(Buffer.from(rebuilt.slice(p.offset,p.offset+p.expect.length/2)).toString('hex').toUpperCase(),p.expect);rebuilt.set(Buffer.from(p.write,'hex'),p.offset)}assert.deepEqual(rebuilt,changed);assert.deepEqual(T.patches(bytes,bytes),[]);
const vertex=(x,y,u,v)=>Object.assign([x,y,0],{uv:[u,v]});const vs=[vertex(0,0,0,0),vertex(16,0,512,0),vertex(16,16,512,512),vertex(0,16,0,512)],part={groups:[{verts:vs}],tris:[{v:[vs[0],vs[1],vs[2]],c:-1}],bb:[0,0,0,16,16,0],cols:[]};
const rendered=T.texelGeometry(part,t,bytes);assert.equal(rendered.tris.length,4,'only two opaque pixels render');assert.deepEqual(rendered.tris[0].v,[[0,0,0],[1,0,0],[1,1,0]]);assert.deepEqual(rendered.bb,part.bb);assert.equal(rendered.groups,part.groups,'builder geometry remains unchanged');assert.equal(rendered.textureMaterial,true);
console.log('CI4 decode, palette quantization, alpha, quad UVs and expected-byte patch round trip pass.');

assert.throws(()=>T.descriptor({...t,image:0x1001},bytes.length),/Unsupported/,'odd image offset cannot produce safe word patches');
assert.throws(()=>T.patches(new Uint8Array(3),new Uint8Array(3)),/even byte/);
// Exercise project/source state through the browser module with a minimal DOM.
const vm=require('node:vm'),fs=require('node:fs');
function fixture(texture=t){
  const button=()=>({style:{},attributes:{},setAttribute(k,v){this.attributes[k]=v}});
  const input={value:'#FF0000'},opaque={checked:true},select={replaceChildren(){},value:''},status={},swatches={children:[],replaceChildren(){this.children=[]},appendChild(b){this.children.push(b)}},reset={};
  let outlines=0;
  const canvas={getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},strokeRect(){outlines++}}),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:192,height:192})};
  const nodes={'.texture-status':status,'select':select,'canvas':canvas,'.texture-swatches':swatches,'input[type=color]':input,'.texture-opaque':opaque,'.texture-reset':reset};
  for(const name of ['pencil','bucket','eraser','select'])nodes['.texture-tool-'+name]=button();
  for(const name of ['copy','cut','paste','clear-selection'])nodes['.texture-'+name]=button();
  nodes['.texture-message']={textContent:''};
  const panel={querySelector:s=>nodes[s],querySelectorAll:s=>s.startsWith('.texture-tools')?Object.entries(nodes).filter(([key])=>key.startsWith('.texture-tool-')||['.texture-copy','.texture-cut','.texture-paste','.texture-clear-selection'].includes(key)).map(([,node])=>node):Object.values(nodes)};
  let resetAll;
  const document={createElement:tag=>tag==='section'?panel:button(),getElementById:id=>id==='rst'?{addEventListener:(event,fn)=>resetAll=fn}:{after(){}}};
  const history={begins:0,ends:0,begin(){this.begins++},end(){this.ends++}};
  const meta={s:'eye',r:0x1500,texture},context={document,Uint8Array,Uint8ClampedArray,DataView,Map,Set,Option:function(text,value){this.text=text;this.value=value},demoMode:false,gallery:false,dv:new DataView(bytes.slice().buffer),cur:{p:[meta]},TABLE:{one:{p:[meta]},two:{p:[{...meta}]}},name:'one',parsed:[{...part}],bases:{},parseDL:()=>({...part}),rebuild(){}};
  context.ModelEditorHistory=history;
  context.window=context;
  vm.createContext(context);vm.runInContext(fs.readFileSync('src/viewer/js/animal-textures.js','utf8'),context);
  return {context,api:context.ModelTextureTools,panel,nodes,history,outlines:()=>outlines,reset:()=>resetAll()};
}
const f=fixture(),edit={offset:0x1000,expect:'1200',write:'2100'};
f.api.refresh();f.api.loadProjectExtras({texture_patches:[edit]});assert.equal(f.api.buildPatches().length,1);
f.api.validateProjectExtras({});assert.equal(f.api.buildPatches().length,1,'validation does not clear current paint');
f.api.loadProjectExtras({});assert.equal(f.api.buildPatches().length,0,'opening a project without texture patches clears old paint');
f.api.loadProjectExtras({texture_patches:[edit]});f.reset();assert.equal(f.api.buildPatches().length,0,'main Reset clears textures used by current animal');
f.api.loadProjectExtras({texture_patches:[edit]});f.context.demoMode=true;assert.equal(f.api.buildPatches().length,0,'demo exports do not leak source paint');assert.equal(f.api.historyExtras().texture_patches.length,1,'undo snapshots retain source paint while browsing demos');
f.context.ModelEditorHost={availableSource:()=>({bytes:f.context.dv.buffer})};assert.equal(f.api.projectExtras().texture_patches.length,1,'project saves include paint for the matching retained source while browsing demos');
f.context.demoMode=false;assert.equal(f.api.buildPatches().length,1,'browsing demos preserves source texture working state');
f.context.dv=new DataView(bytes.slice().buffer);assert.equal(f.api.buildPatches().length,0,'source replacement clears previous source patches');
f.context.cur={p:[{s:'bad',texture:{...t,image:bytes.length-1}}]};f.context.TABLE={bad:f.context.cur};f.api.refresh();
assert.throws(()=>f.api.loadProjectExtras({texture_patches:[edit]}),/outside supported textures/);
f.context.cur={p:[{s:'eye',r:0x1500,texture:t}]};f.context.TABLE={one:f.context.cur};f.api.refresh();
assert.throws(()=>f.api.loadProjectExtras({texture_patches:[edit,edit]}),/overlapping/);
assert.throws(()=>f.api.loadProjectExtras({texture_patches:[{...edit,expect:'FFFF'}]}),/different source/);
assert.throws(()=>f.api.loadProjectExtras({texture_patches:null}),/Invalid texture edits/);
console.log('Texture project/source/reset state, demo isolation, malformed metadata and patch boundaries pass.');

f.api.loadProjectExtras({});
const paintCanvas=f.nodes.canvas;
paintCanvas.onpointerdown({pointerId:1,currentTarget:paintCanvas,clientX:13,clientY:1});
assert.equal(f.api.buildPatches()[0].write,'1100','brush writes only selected pixel nibble');
f.context.dv=new DataView(bytes.slice().buffer);f.api.refresh();
paintCanvas.onpointermove({currentTarget:paintCanvas,clientX:13,clientY:1});
assert.equal(f.api.buildPatches().length,0,'source switch terminates an active brush stroke');paintCanvas.onpointerup();
f.nodes['input[type=color]'].value='#00FF00';f.nodes['input[type=color]'].oninput();
assert.equal(f.api.buildPatches()[0].offset,0x1102);assert.equal(f.api.buildPatches()[0].write,'07C1','palette recolour quantizes and retains opacity');
f.nodes['input[type=color]'].onchange();
f.nodes['.texture-opaque'].checked=false;f.nodes['.texture-opaque'].onchange();assert.equal(f.api.buildPatches()[0].write,'07C0');
f.reset();assert.equal(f.api.buildPatches().length,0);
console.log('Texture brush nibble writes, stroke cancellation, palette recolour and opacity controls pass.');

const region=Array(256).fill(0);region[0]=region[1]=region[16]=region[34]=1;region[17]=2;
const filled=T.floodFill(region,0,0,7);assert.deepEqual(filled.slice(0,2),[7,7]);assert.equal(filled[16],7);assert.equal(filled[34],1,'diagonal/disconnected island is not filled');assert.equal(region[0],1,'fill leaves input unchanged');
const limited=T.floodFill(region,0,0,7,{x:0,y:0,width:1,height:2});assert.equal(limited[0],7);assert.equal(limited[16],7);assert.equal(limited[1],1,'selection bounds stop fill');
assert.deepEqual(T.rectangle([18,-2],[14,2]),{x:14,y:0,width:2,height:3});
const pattern=Array.from({length:256},(_,i)=>i%16),clip=T.copyPixels(pattern,{x:14,y:14,width:2,height:2});assert.deepEqual(clip,{width:2,height:2,pixels:[14,15,14,15]});
const pasted=T.pastePixels(Array(256).fill(0),clip,15,15);assert.equal(pasted[255],14);assert.equal(pasted.filter(Boolean).length,1,'paste clips right/bottom instead of wrapping rows');
assert.equal(T.paletteMap([[255,255,255,0]],[[255,255,255,255],[0,0,0,0]])[0],1,'transparent clipboard entries prefer transparent destination colour');
assert.deepEqual(T.paletteMap([[0,0,0,255],[0,0,0,255]],[[0,0,0,255],[0,0,0,255]]),[0,1],'same-palette paste preserves duplicate swatch indices exactly');
assert.throws(()=>T.writeIndices(bytes.slice(),t,Array(256).fill(16)),/Invalid indexed/);
console.log('Bucket connectivity/selection, rectangle clipping and indexed clipboard palette mapping pass.');

function point(canvas,x,y){return {pointerId:1,button:0,currentTarget:canvas,clientX:x*12+1,clientY:y*12+1};}
function drag(f,from,to=from){const canvas=f.nodes.canvas;canvas.onpointerdown(point(canvas,...from));canvas.onpointermove(point(canvas,...to));canvas.onpointerup();}
const tools=fixture();tools.api.refresh();
tools.nodes['.texture-tool-select'].onclick();drag(tools,[0,0],[1,0]);assert.ok(tools.outlines()>0,'selection has a visible outline');
tools.nodes['.texture-copy'].onclick();assert.equal(tools.nodes['.texture-paste'].disabled,false);tools.nodes['.texture-cut'].onclick();assert.equal(tools.api.buildPatches()[0].write,'0000','cut uses an existing transparent palette index');
tools.nodes['.texture-paste'].onclick();assert.equal(tools.api.buildPatches().length,0,'copy/cut/paste restores selected pixels exactly');
tools.nodes['.texture-clear-selection'].onclick();assert.equal(tools.nodes['.texture-clear-selection'].disabled,true);
tools.nodes['.texture-tool-eraser'].onclick();drag(tools,[0,0]);assert.equal(tools.api.buildPatches()[0].write,'0200');assert.equal(tools.api.buildPatches().length,1,'eraser does not alter palette opacity');tools.reset();
tools.nodes['.texture-swatches'].children[2].onclick();tools.nodes['.texture-tool-bucket'].onclick();drag(tools,[0,0]);assert.equal(tools.api.buildPatches()[0].write,'2200');tools.reset();
tools.nodes['.texture-tool-pencil'].onclick();const starts=tools.history.begins,ends=tools.history.ends;drag(tools,[0,1],[4,1]);assert.equal(tools.history.begins-starts,1);assert.equal(tools.history.ends-ends,1,'entire pencil stroke is one undo transaction');
tools.reset();const paletteStarts=tools.history.begins,paletteEnds=tools.history.ends;tools.nodes['input[type=color]'].value='#FF00FF';tools.nodes['input[type=color]'].oninput();tools.nodes['input[type=color]'].value='#00FFFF';tools.nodes['input[type=color]'].oninput();assert.equal(tools.history.begins-paletteStarts,1);assert.equal(tools.history.ends-paletteEnds,0);tools.nodes['input[type=color]'].onchange();assert.equal(tools.history.ends-paletteEnds,1,'colour picker drag commits once on change');
const opaqueSource=bytes.slice();for(let i=0;i<16;i++)opaqueSource[t.palette+2*i+1]|=1;tools.context.dv=new DataView(opaqueSource.buffer);tools.api.refresh();tools.nodes['.texture-tool-eraser'].onclick();drag(tools,[0,0]);assert.equal(tools.api.buildPatches().length,0);assert.match(tools.nodes['.texture-message'].textContent,/No transparent swatch/);tools.nodes['.texture-cut'].onclick();assert.equal(tools.api.buildPatches().length,0,'cut refuses to mutate a palette without transparency');
console.log('Texture tool buttons, selection/clipboard, transparency refusals and gesture undo grouping pass.');
const keyboard=fixture();keyboard.api.refresh();let prevented=0;
const key=letter=>keyboard.nodes.canvas.onkeydown({key:letter,ctrlKey:true,preventDefault(){prevented++}});
key('a');key('c');assert.match(keyboard.nodes['.texture-message'].textContent,/Copied 16 x 16/);key('x');assert.ok(keyboard.api.buildPatches().length);key('v');assert.equal(keyboard.api.buildPatches().length,0);assert.equal(prevented,4);
keyboard.nodes.canvas.onkeydown({key:'Escape'});assert.equal(keyboard.nodes['.texture-clear-selection'].disabled,true);
console.log('Image-focused select/copy/cut/paste keyboard shortcuts preserve native controls elsewhere.');

// Body textures use the same linear high-nibble-first ROM layout as eyes.
const body={...t,width:32,height:32,palette:0x1200};
const pixels=Array.from({length:1024},(_,i)=>(i*7+(i>>5))%16),encoded=bytes.slice();
T.writeIndices(encoded,body,pixels);assert.deepEqual(T.decode(encoded,body).indices,pixels);
assert.equal(encoded[body.image+16],(pixels[32]<<4)|pixels[33],'odd rows are linear, with 16 bytes per row');
assert.throws(()=>T.descriptor({...body,image:bytes.length-510},bytes.length));
assert.throws(()=>T.descriptor({...body,width:24,height:24},bytes.length));
assert.deepEqual(T.rectangle([31,31],[30,29],32),{x:30,y:29,width:2,height:3});
const full=Array(1024).fill(2);assert.ok(T.floodFill(full,31,31,3).every(v=>v===3));
const tail=T.copyPixels(pixels,{x:30,y:31,width:2,height:1});
assert.deepEqual(tail.pixels,pixels.slice(1022));
assert.equal(T.pastePixels(full,tail,31,31)[1023],pixels[1022]);
const bodyBytes=bytes.slice();bodyBytes[body.palette+3]=1;
const bv=[vertex(0,0,0,0),vertex(2,0,128,0),vertex(0,2,0,128)];// s10.5 at texture scale 0.5: 128 = 2 texels
const mesh={...part,tris:[{v:bv,c:-1}]};
bodyBytes[body.image]=0x11;bodyBytes[body.image+16]=0x11;
const mapped=T.texelGeometry(mesh,body,bodyBytes);
assert.ok(mapped.tris.length>1);assert.ok(mapped.tris.every(tri=>tri.v.every(v=>v[0]+v[1]<=2+1e-9)),'UV clipping stays within original triangle');
assert.equal(mapped.groups,mesh.groups);assert.deepEqual(mapped.bb,mesh.bb);
const big=fixture(body);big.api.refresh();assert.equal(big.nodes.canvas.width,32);assert.equal(big.nodes.canvas.height,32);
const bc=big.nodes.canvas;bc.onpointerdown({pointerId:1,currentTarget:bc,clientX:191,clientY:191});bc.onpointerup();
assert.equal(big.api.buildPatches()[0].offset,body.image+510,'last pixel of 32x32 is writable');
const saved=JSON.parse(JSON.stringify(big.api.projectExtras()));big.api.loadProjectExtras({});big.api.loadProjectExtras(saved);
assert.equal(big.api.buildPatches()[0].offset,body.image+510,'size is implied by source table; project patches round-trip');
const snapshot=big.api.historyExtras();big.reset();big.api.restoreHistoryExtras(snapshot);assert.ok(big.api.buildPatches().length);big.api.restoreHistoryExtras({});assert.equal(big.api.buildPatches().length,0);
bc.onkeydown({key:'a',ctrlKey:true,preventDefault(){}});big.nodes['.texture-copy'].onclick();assert.match(big.nodes['.texture-message'].textContent,/Copied 32 x 32/);
const flat=T.texelGeometry({...part,cols:[{rgba:'AD6B52FF'}],tris:[{v:bv,c:0,tx:false},{v:bv,c:-1}]},body,bodyBytes);
assert.equal(flat.tris[0].tx,false,'untextured-combiner triangles stay whole');assert.equal(flat.cols[flat.tris[0].c].rgba,'AD6B52FF','and keep their own colour');assert.ok(flat.tris.length>2);
console.log('32x32 decode/encode, UV triangle clipping, tools, source-bound project sizes and history restoration pass (legacy 16x16 above).');

const opaque=bodyBytes.slice();for(let i=0;i<16;i++)opaque[body.palette+i*2+1]|=1;
const uvLine=[vertex(0,0,0,0),vertex(2,0,128,0),vertex(0,2,0,0)];
const lineResult=T.texelGeometry({...part,tris:[{v:uvLine,c:-1}]},body,opaque);
assert.ok(lineResult.tris.length>1,'one-dimensional UV domains still interpolate across texels');
const constant=uvLine.map(v=>Object.assign([...v],{uv:[-32,-32]}));
assert.equal(T.texelGeometry({...part,tris:[{v:constant,c:-1}]},body,opaque).tris.length,1,'constant/negative UVs retain the original triangle');
const area=tri=>{const [a,b,c]=tri.v;return ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2};
assert.ok(lineResult.tris.every(tri=>area(tri)>0),'triangle winding is preserved');
assert.ok(Math.abs(lineResult.tris.reduce((sum,t)=>sum+area(t),0)-2)<1e-9,'UV clipping neither loses nor overlaps mesh area');
big.nodes['.texture-cut'].onclick();assert.ok(big.api.buildPatches().length);big.nodes['.texture-paste'].onclick();assert.equal(big.api.buildPatches().length,0,'32x32 select-all cut/paste restores the original');
console.log('Body UV degeneracy, negative wrapping, area/winding and whole-image clipboard restoration pass.');

// View-only RGBA16 32x32 (cutscene characters): swap exchanges 4-byte words on odd rows; other sizes/formats refused.
{const b=new Uint8Array(0x1000+2048+8),r={format:'rgba16',width:32,height:32,image:0x1000,swap:true};
 b[0x1000]=0xF8;b[0x1001]=0x01;                         // row 0, x 0 = red opaque
 const row1=0x1000+64;b[row1+4]=0x07;b[row1+5]=0xC1;    // row 1 stored word 1 (x 2..3 after swap)
 const d=T.decodeRgba16(b,r);assert.deepEqual(d.palette[d.indices[0]],[255,0,0,255]);
 assert.deepEqual(d.palette[d.indices[32+0]],[0,255,0,255],'odd-row swap puts stored x=2 at x=0');
 assert.deepEqual(T.decodeRgba16(b,{...r,swap:false}).palette[T.decodeRgba16(b,{...r,swap:false}).indices[32+2]],[0,255,0,255]);
 assert.equal(T.viewDescriptor(r,b.length).format,'rgba16');
 assert.throws(()=>T.viewDescriptor({...r,width:16,height:16},b.length));assert.throws(()=>T.viewDescriptor(r,0x1000+2047));
 assert.throws(()=>T.descriptor(r,b.length),/Unsupported/,'RGBA16 is view-only: the editing descriptor still refuses it');}
console.log('RGBA16 view textures: odd-row swap, bounds and edit refusal pass.');
