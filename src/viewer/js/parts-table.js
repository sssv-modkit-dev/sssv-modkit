/* SSSV pack: validate a local animal_table.json into the Model Editor's parts table (pure; also used by tests). */
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
if(typeof module!=='undefined')module.exports={normaliseLocalTable};
