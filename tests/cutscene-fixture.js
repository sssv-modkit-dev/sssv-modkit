// Invented messages, objects and records only. No game assets.
const R=require('../src/web/story/rnc'),S=require('../src/web/story/rom');
const concat=parts=>Buffer.concat(parts.map(p=>Buffer.from(p)));
function fixture(){
 const rom=new Uint8Array(0x800000);R.put32(rom,0,0x80371240);rom.set(Buffer.from('SSSV TEST FIXTURE'),0x20);rom[0x3e]=0x45;
 const block=S.encodeBlock(['@NInvented level','A made-up greeting','A different line']),text=new Uint8Array(48+block.length+128);R.put32(text,8,48);text.set(block,48);
 const packedText=R.pack(text);rom.set(packedText,0x30000);
 for(let b=0;b<36;b++){R.put32(rom,0x2fc00+8*b,0x30000);R.put32(rom,0x2fc04+8*b,0x30000+packedText.length);}
 const records=[[0x44,1,3,0,0],[0x4d,0x122d,0x08d0,0x006e,0],[0x2e,45,0,0,0],[0x4e,0x122d,0x0405,0x0607,0],[0x26,162,28160,0,0],[6,90,0,0,0],[6,0x7f9b,0,0,0],[1,0,0x7f9b,3,0],[3,0,1,0,0],[4,3,0,0,0],[5,0,0,0,0],[8,1,0,0,0],[0x65,0,0,0,0],[9,0,0,0,0],[0x5a,0,0,0,0],[9,0,0,0,0]];
 const pool=new Uint8Array(2+10*records.length);R.put16(pool,0,pool.length);records.forEach((r,i)=>r.forEach((v,j)=>R.put16(pool,2+10*i+2*j,v)));
 const props=new Uint8Array(46);R.put16(props,0,2);for(let i=0;i<2;i++){R.put16(props,2+22*i,12+i);R.put16(props,18+22*i,1);}
 const animals=new Uint8Array(18);R.put16(animals,0,1);R.put16(animals,2,7);R.put16(animals,14,15);
 const body=concat([[0],R.pack(props),[1],R.pack(animals),[4],R.pack(pool),[12],R.pack(Uint8Array.of(1,2,3)),[3,55,66]]),packed=R.packBest(body);
 for(let lv=1;lv<=36;lv++){const start=0x40000+(lv-1)*0x1000,ent=0x7b72a8+8*(lv-1);rom.set(packed,start);R.put32(rom,ent,start);R.put32(rom,ent+4,start+packed.length);}
 return rom;
}
module.exports={fixture};
