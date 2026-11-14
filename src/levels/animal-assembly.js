/* Captured static poses applied to geometry decoded from the user's ROM.
   Only exact supported base species are mapped; other species retain placeholders. */
(function(root){
function vtx(dv,b,off,i){const o=b+off+16*i;if(o<0||o+16>dv.byteLength||dv.getUint16(o+6))return null;const q=[dv.getInt16(o),dv.getInt16(o+2),dv.getInt16(o+4)];q.o=o;q.uv=[dv.getInt16(o+8),dv.getInt16(o+10)];q.c=[dv.getUint8(o+12)/255,dv.getUint8(o+13)/255,dv.getUint8(o+14)/255];return q}
function parseDL(dv,addr,bases){const vb={},cols=[],tris=[],groups=[],bb=[1e9,1e9,1e9,-1e9,-1e9,-1e9];let c=-1;
for(let i=0;i<800;i++){const o=addr+8*i;if(o+8>dv.byteLength)break;const op=dv.getUint8(o),w0=dv.getUint32(o),w1=dv.getUint32(o+4);
if(op==0xB8)break;
if(op==4){const seg=w1>>>24,off=w1&0xFFFFFF,n=((w0&0x3FF)+1)>>4,v0=((w0>>>16)&255)>>1,b=bases[seg],gv=[];groups.push({verts:gv});for(let k=0;k<n;k++){const q=vb[v0+k]=b===undefined?null:vtx(dv,b,off,k);if(q)gv.push(q);if(q)for(let a=0;a<3;a++){bb[a]=Math.min(bb[a],q[a]);bb[a+3]=Math.max(bb[a+3],q[a])}}}
else if(op==0xFA){cols.push({rgba:w1.toString(16).toUpperCase().padStart(8,'0'),at:o+4});c=cols.length-1}
else if(op==0xBF||op==0xB1){const T=op==0xBF?[[(w1>>>16)&255,(w1>>>8)&255,w1&255]]:[[(w0>>>16)&255,(w0>>>8)&255,w0&255],[(w1>>>16)&255,(w1>>>8)&255,w1&255]];
for(const t of T){const v=t.map(k=>vb[k>>1]);if(v.every(x=>x)&&new Set(t).size==3)tris.push({v,c})}}}
// Keep the full vertex bounds for builder-compatible mesh transforms, but
// frame/layout only the rendered geometry, excluding unused cache entries.
const viewBB=[1e9,1e9,1e9,-1e9,-1e9,-1e9];
for(const t of tris)for(const q of t.v)for(let a=0;a<3;a++){viewBB[a]=Math.min(viewBB[a],q[a]);viewBB[a+3]=Math.max(viewBB[a+3],q[a])}
return{cols,tris,bb,viewBB,groups}}

function assembleAnimal(rom,animal,pose){
 const dv=new DataView(rom),bases=Object.fromEntries(Object.entries(animal.seg_bases||{}).map(([k,v])=>[k,parseInt(v,16)])),parts=new Map(animal.parts.filter(p=>p.ended).map(p=>[p.symbol,p])),p=[],c=[];
 if(!pose.parts.every(pp=>parts.has(pp.dl)))return null;
 for(const pp of pose.parts){const part=parseDL(dv,parts.get(pp.dl).rom,bases),flip=((pp.mirror&1)^((pp.mirror>>1)&1))===1;
 for(const tri of part.tris){const color=tri.c<0?'808080FF':part.cols[tri.c].rgba;for(const i of flip?[0,2,1]:[0,1,2]){const v=tri.v[i],g=[0,1,2].map(k=>v.reduce((n,x,j)=>n+x*pp.rows[j][k],pp.T[k]));
 // Captured game axes: forward -Y, up Z. Level objects face +X.
 p.push(-g[1],-g[0],g[2]);c.push(...[0,2,4].map(k=>parseInt(color.slice(k,k+2),16)));}}}
 if(!p.length)return null;let floor=Infinity;for(let i=2;i<p.length;i+=3)floor=Math.min(floor,p[i]);for(let i=2;i<p.length;i+=3)p[i]-=floor;
 return {p,c,scale:3.2,label:'captured static pose; approximate size and materials'};
}
async function fromROM(rom,progress=()=>{}){
 progress('Reading animal geometry from your ROM...');const table=await root.SSSVBuilder.deriveTable(rom,{onProgress:p=>progress(p.detail)}),models={},species={},names={};
 for(const [id,name] of [[0,'seagull'],[6,'fox'],[22,'bear'],[31,'dog'],[33,'sheep']]){if(!table[name])continue;const response=await fetch('demo/poses/'+name+'.json');if(!response.ok)throw Error('Could not load captured '+name+' pose');const model=assembleAnimal(rom,table[name],await response.json());if(model){models[name]=model;species[id]=name;names[name]=name;}}
 return {models,species,names};
}
root.LevelAnimalAssembly={assembleAnimal,fromROM};
})(typeof window==='undefined'?globalThis:window);
if(typeof module!=='undefined')module.exports=globalThis.LevelAnimalAssembly;
