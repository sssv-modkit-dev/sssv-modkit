#!/usr/bin/env node
/* Converts baked part meshes ([{name, verts, cols, faces}], Y up, metres) into the Model Editor's demo-model format.
   node tools/import_baked_model.js --out packs/sample/assets/models.json "<name>=<model.json>" ...
   Only use sources whose licence allows redistribution (CC0 here); list each one in THIRD_PARTY.md. */
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2),outIndex=args.indexOf('--out');
if(outIndex<0)throw Error('--out is required');
const out=args[outIndex+1],inputs=args.filter((_,i)=>i!==outIndex&&i!==outIndex+1);
const SIZE=200;  // longest side in editor units, like the original demos
const hex=c=>c.slice(0,3).map(v=>Math.max(0,Math.min(255,Math.round(v*255))).toString(16).padStart(2,'0')).join('').toUpperCase()+'FF';
function convert(parts){
  const all=parts.flatMap(p=>p.verts),lo=[0,1,2].map(i=>Math.min(...all.map(v=>v[i]))),hi=[0,1,2].map(i=>Math.max(...all.map(v=>v[i])));
  const centre=lo.map((v,i)=>(v+hi[i])/2),scale=SIZE/Math.max(...hi.map((v,i)=>v-lo[i]));
  const used=new Map();
  return {b:{},s:[],p:parts.map(part=>{
    const cols=[],index=new Map(),tris=[];
    const at=k=>part.verts[k].map((v,i)=>Math.round((v-centre[i])*scale));
    for(const f of part.faces){const rgba=hex(part.cols[f[0]]);if(!index.has(rgba)){index.set(rgba,cols.length);cols.push({rgba,rom:0});}
      tris.push({v:f.map(at),c:index.get(rgba)});}
    const vs=tris.flatMap(t=>t.v),bb=[0,1,2].map(k=>Math.min(...vs.map(v=>v[k]))).concat([0,1,2].map(k=>Math.max(...vs.map(v=>v[k]))));
    let s=part.name.replace(/_\d+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');const n=(used.get(s)||0)+1;used.set(s,n);if(n>1)s+='-'+n;
    return {s,r:0,j:'demo',v:[],t:[],demo:{cols,tris,bb}};})};
}
const models={};
for(const spec of inputs){const [name,file]=spec.split('=');models[name]=convert(JSON.parse(fs.readFileSync(file,'utf8')));}
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({models}));
console.log('Models: '+Object.keys(models).join(', ')+' -> '+out);
