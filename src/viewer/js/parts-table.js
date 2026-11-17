/* SSSV pack: validate a local animal_table.json into the Model Editor's parts table (pure; also used by tests). */
function normaliseLocalTable(raw,romLength=0x2000000){
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
    const p=[],prop=Number.isInteger(a.prop)&&a.prop>=0&&a.prop<256?a.prop:null;
    for(const q of a.parts){
      if(!q.ended||q.seg===1&&prop===null)continue;   // props may live in segment 1; animal seg-1 parts are shared extras
      if(!safe(q.symbol)||!Number.isInteger(q.rom)||q.rom<0||q.rom>=0x2000000||!Array.isArray(q.sections||[])||!(q.sections||[]).every(safe))throw new Error('Invalid part metadata.');
      const part={s:q.symbol,r:q.rom,j:'local',v:q.sections||[],t:[]};
      if(q.texture&&q.texture.format==='rgba16'){const t=q.texture;if(t.width!==32||t.height!==32||!Number.isInteger(t.image)||t.image<0x1000||t.image%2||t.image+2048>romLength)throw new Error('Invalid texture metadata.');part.texture={format:'rgba16',width:32,height:32,image:t.image,swap:!!t.swap};}
      else if(q.texture){const t=q.texture;if(t.format!=='ci4'||![16,32].includes(t.width)||t.height!==t.width||![t.image,t.palette].every(n=>Number.isInteger(n)&&n>=0x1000&&n%2===0)||t.image+t.width*t.height/2>romLength||t.palette+32>romLength)throw new Error('Invalid texture metadata.');part.texture={format:'ci4',width:t.width,height:t.height,image:t.image,palette:t.palette};}
      p.push(part);
    }
    if(p.length)out[name]=prop===null?{b,p,s:sections,draw_funcs:a.draw_funcs||[]}:{b,p,s:sections,draw_funcs:[],prop};
  }
  if(!Object.keys(out).length)throw new Error('No renderable parts in that table.');
  return out;
}
// Normalize every supported dump order before hashing, extracting or handing off to Play.
function normaliseModelROM(source){
  const bytes=new Uint8Array(source instanceof ArrayBuffer?source.slice(0):source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength));
  if(bytes.length<0x800000||bytes.length>0x1000000||bytes.length%4)throw new Error('Use an 8-16 MB SSSV US ROM.');
  const magic=new DataView(bytes.buffer).getUint32(0);
  if(magic===0x37804012){for(let i=0;i<bytes.length;i+=2)[bytes[i],bytes[i+1]]=[bytes[i+1],bytes[i]]}
  else if(magic===0x40123780){for(let i=0;i<bytes.length;i+=4)[bytes[i],bytes[i+1],bytes[i+2],bytes[i+3]]=[bytes[i+3],bytes[i+2],bytes[i+1],bytes[i]]}
  else if(magic!==0x80371240)throw new Error('Unrecognized N64 ROM byte order.');
  if(String.fromCharCode(...bytes.slice(0x3B,0x3F))!=='NSVE')throw new Error('Use a US SSSV ROM, not a different game or region.');
  return bytes.buffer;
}
if(typeof module!=='undefined')module.exports={normaliseLocalTable,normaliseModelROM};
