// ROM loading and Build & Play through the actual pack adapter, without WebGL or a ROM asset.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const elements=Object.fromEntries(['source-file','local-table','remember-source','forget-source','msg','build-play'].map(id=>[id,{disabled:false,checked:false,textContent:''}]));
let current=null,indexCalls=0;const sent=[];
const raw={synthetic:{seg_bases:{4:'0x100'},parts:[{ended:true,seg:4,symbol:'part',rom:64}]}};
const config={animals:[{animal:'synthetic',recolor:{'112233FF':'445566'}},{animal:'another',recolor:{'778899FF':'001122'}}]};
const host={embeddedTable:{},message:t=>elements.msg.textContent=t,useSource:s=>{current=s},getSource:()=>current,getBuildConfig:()=>config};
const window={ModelEditorHost:host,SSSVBuilder:{deriveTable:async bytes=>{indexCalls++;assert.equal(new DataView(bytes).getUint32(0),0x80371240);return raw}},SSSVHandoff:{openPlay:v=>sent.push(v)}};
const context={window,document:{getElementById:id=>elements[id],querySelectorAll:()=>[]},crypto:webcrypto,ArrayBuffer,Uint8Array,DataView,Blob,SSSVHandoff:window.SSSVHandoff,console};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/viewer/js/parts-table.js','utf8'),context);
vm.runInContext(fs.readFileSync('src/viewer/js/model-source-rom.js','utf8'),context);
(async()=>{
  assert.equal(elements['source-file'].disabled,false,'ROM is selectable before a table');
  elements['build-play'].onclick();assert.equal(sent.length,0,'no source cannot build');
  const rom=new Uint8Array(0x800000);rom.set([0x80,0x37,0x12,0x40]);rom.set(Buffer.from('NSVE'),0x3B);
  const file={name:'test.v64',arrayBuffer:async()=>{const v=rom.slice();for(let i=0;i<v.length;i+=2)[v[i],v[i+1]]=[v[i+1],v[i]];return v.buffer}};
  await elements['source-file'].onchange({target:{files:[file]}});
  assert.equal(indexCalls,1,'ROM alone generates the table');assert.ok(current.table.synthetic);
  assert.equal(new DataView(current.bytes).getUint32(0),0x80371240,'host receives normalized bytes');
  elements['build-play'].onclick();assert.equal(sent.length,1);assert.equal(sent[0].parts.animals.length,2,'all edited animals are handed off');
  assert.equal(sent[0].rom.size,rom.length);assert.match(elements.msg.textContent,/all edited animals/);
  await elements['source-file'].onchange({target:{files:[file]}});assert.equal(indexCalls,2,'new ROM selection is reindexed');
  console.log('Model ROM source: ROM-only indexing, byte order normalization, host loading, and multi-animal Build & Play handoff passed.');
})().catch(e=>{console.error(e);process.exit(1)});
