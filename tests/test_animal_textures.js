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
function fixture(){
  const input={value:'#FF0000'},opaque={checked:true},select={replaceChildren(){},value:''},status={},swatches={replaceChildren(){},appendChild(){}},reset={};
  const canvas={getContext:()=>({createImageData:()=>({data:new Uint8ClampedArray(1024)}),putImageData(){}}),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0,width:192,height:192})};
  const nodes={'.texture-status':status,'select':select,'canvas':canvas,'.texture-swatches':swatches,'input[type=color]':input,'.texture-opaque':opaque,'.texture-reset':reset};
  const panel={querySelector:s=>nodes[s],querySelectorAll:()=>Object.values(nodes)};
  let resetAll;
  const document={createElement:tag=>tag==='section'?panel:{style:{},setAttribute(){}},getElementById:id=>id==='rst'?{addEventListener:(event,fn)=>resetAll=fn}:{after(){}}};
  const meta={s:'eye',r:0x1500,texture:t},context={document,Uint8Array,Uint8ClampedArray,DataView,Map,Set,Option:function(text,value){this.text=text;this.value=value},demoMode:false,gallery:false,dv:new DataView(bytes.slice().buffer),cur:{p:[meta]},TABLE:{one:{p:[meta]},two:{p:[{...meta}]}},name:'one',parsed:[{...part}],bases:{},parseDL:()=>({...part}),rebuild(){}};
  context.window=context;
  vm.createContext(context);vm.runInContext(fs.readFileSync('src/viewer/js/animal-textures.js','utf8'),context);
  return {context,api:context.ModelTextureTools,panel,nodes,reset:()=>resetAll()};
}
const f=fixture(),edit={offset:0x1000,expect:'1200',write:'2100'};
f.api.refresh();f.api.loadProjectExtras({texture_patches:[edit]});assert.equal(f.api.buildPatches().length,1);
f.api.validateProjectExtras({});assert.equal(f.api.buildPatches().length,1,'validation does not clear current paint');
f.api.loadProjectExtras({});assert.equal(f.api.buildPatches().length,0,'opening a project without texture patches clears old paint');
f.api.loadProjectExtras({texture_patches:[edit]});f.reset();assert.equal(f.api.buildPatches().length,0,'main Reset clears textures used by current animal');
f.api.loadProjectExtras({texture_patches:[edit]});f.context.demoMode=true;assert.equal(f.api.buildPatches().length,0,'demo exports do not leak source paint');
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
f.nodes['.texture-opaque'].checked=false;f.nodes['.texture-opaque'].onchange();assert.equal(f.api.buildPatches()[0].write,'07C0');
f.reset();assert.equal(f.api.buildPatches().length,0);
console.log('Texture brush nibble writes, stroke cancellation, palette recolour and opacity controls pass.');
