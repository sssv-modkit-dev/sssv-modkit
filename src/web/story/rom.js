/* ROM-derived story and terrain editing. Format constants only; no extracted data.
 * Behaviour ported from our clean-room textmod.py, scripttool.py and terrain.py.
 * Text/level pointer tables and terrain bank selectors are read from the user's ROM.
 * Compression, zero padding, relocation, mip rounding and CIC-6102 CRC match those tools.
 */
(function(root){
'use strict';
const R=typeof module!=='undefined'?require('./rnc.js'):root.StoryRNC;
const {u16,u32,put16,put32,unpack,packBest}=R, BTAB=0x2fc00,LTAB=0x7b72a8,ENT=0xab8;
const concat=parts=>{const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let o=0;for(const p of parts){b.set(p,o);o+=p.length;}return b;};
function readBlock(d){const s=u32(d,8),offsets=Array.from({length:12},(_,i)=>u32(d,4*i)),e=Math.min(d.length,...offsets.filter(o=>o>s));if(s<48||s+2>e)throw Error('Invalid English block');let p=s+2;const strings=[];for(let i=0,n=u16(d,s);i<n;i++){const len=u16(d,p);p+=2;if(len<2||len%2||p+len>e||u16(d,p+len-2)!==0x7530)throw Error('Invalid text record');let t='';for(let q=p;q<p+len-2;q+=2){const c=u16(d,q);t+=c===0x4e20?'\n':String.fromCharCode(c-0x110);}strings.push(t);p+=len;}return {s,e,strings};}
function encodeBlock(strings){let size=2;for(const t of strings){if(typeof t!=='string'||!/^[\x20-\x7e\n]*$/.test(t))throw Error('Use plain ASCII and line breaks only.');size+=4+2*t.length;}const b=new Uint8Array(size);put16(b,0,strings.length);let p=2;for(const t of strings){put16(b,p,2*t.length+2);p+=2;for(const c of t){put16(b,p,c==='\n'?0x4e20:c.charCodeAt(0)+0x110);p+=2;}put16(b,p,0x7530);p+=2;}return b;}
function chunks(rom,lv){const ent=LTAB+8*(lv-1),s=u32(rom,ent),e=u32(rom,ent+4),body=unpack(rom,s),out=[];let p=0;while(p<body.length){const id=body[p++];if(id===3)return {ent,s,e,out,tail:body.slice(p)};const start=p;let data;if(body[p]===82&&body[p+1]===78&&body[p+2]===67){data=unpack(body,p);p+=18+u32(body,p+8);}else{const n=u32(body,p);p+=4;data=body.slice(p,p+n);p+=n;}if(p>body.length)throw Error('Invalid level chunk');out.push({id,stored:body.slice(start,p),data});}throw Error('Missing level terminator');}
function timing(c,text){const d=c.out.find(x=>x.id===4)?.data;if(!d)return [];const rs=[];for(let i=0,n=Math.floor(u16(d,0)/10);i<n;i++){const p=2+10*i,op=u16(d,p),a=u16(d,p+2);if(op===0x44)rs.push({i,op:'message',text:a,hold_seconds:u16(d,p+4),says:text[a]||''});else if(op===6&&a<0x7f00)rs.push({i,op:'wait',frames:a});}return rs;}
function fixCRC(b){let t1=0xf8ca4ddc,t2=t1,t3=t1,t4=t1,t5=t1,t6=t1;for(let p=0x1000;p<0x101000;p+=4){const d=u32(b,p),sum=(t6+d)>>>0;if(sum<t6)t4=(t4+1)>>>0;t6=sum;t3=(t3^d)>>>0;const n=d&31,r=((d<<n)|(d>>>(32-n)))>>>0;t5=(t5+r)>>>0;t2=(t2^(t2>d?r:t6^d))>>>0;t1=(t1+(t5^d>>>0))>>>0;}put32(b,16,t6^t4^t3);put32(b,20,t5^t2^t1);return b;}
function validate(original,data){
 const keys=(a,b)=>Object.keys(a).sort().join()===Object.keys(b).sort().join();
 if(!keys(original.banks,data.banks)||!keys(original.levels,data.levels))throw Error('Do not add or remove banks or timing levels.');
 for(const [b,bank] of Object.entries(data.banks)){
  if(!keys(original.banks[b].strings,bank.strings))throw Error('Do not add or remove strings.');
  const block=encodeBlock(Object.values(bank.strings));if(block.length>original.capacities[b])throw Error('Bank '+b+' exceeds its byte budget.');
 }
 for(const [lv,rs] of Object.entries(data.levels)){
  const old=original.levels[lv];if(rs.length!==old.length)throw Error('Do not add or remove timing records.');
  rs.forEach((r,i)=>{const field=old[i].op==='message'?'hold_seconds':'frames';
   for(const key of Object.keys(old[i]))if(key!==field&&r[key]!==old[i][key])throw Error('Only timing values are editable.');
   if(!keys(old[i],r)||!Number.isInteger(r[field])||r[field]<0||r[field]>=0x7f00)throw Error('Timing must be an integer from 0 to 32511.');
  });
 }
}
function install(rom,ent,blob,zero=true){const s=u32(rom,ent),e=u32(rom,ent+4);if(blob.length<=e-s){if(zero)rom.fill(0,s,e);rom.set(blob,s);return rom;}const ns=(rom.length+15)&~15,out=new Uint8Array((ns+blob.length+15)&~15);out.set(rom);out.set(blob,ns);put32(out,ent,ns);put32(out,ent+4,ns+blob.length);return out;}
const r2r=ram=>0x6a6500+(ram-0x80294e50);
function terrainBanks(rom,lv){const h=chunks(rom,lv).out.find(x=>x.id===12)?.data;if(!h||h.length<=0x53)throw Error('Missing terrain metadata');const z=h[0x21],sub=h[0x53],u5=z===4?5:z,u6=[4,5].includes(u5)?0:u5,pa=r2r(0x803a5770+8*u5),pp=r2r(u32(rom,r2r(0x803a5918+4*u6))+8*(sub-1));return [[pa,20],[pp,12]].map(([slot,n])=>({slot,n,data:unpack(rom,u32(rom,slot))}));}
function decodeTile(d){const px=new Uint16Array(1024);for(let y=0;y<32;y++)for(let x=0;x<32;x++)px[y*32+x]=u16(d,2*(y*32+(y%2?x^2:x)));return px;}
const evenRound=v=>{const f=Math.floor(v),r=v-f;return r===0.5?f+(f%2):Math.round(v);};
function encodeTile(px){let cur=Array.from(px,v=>[v>>>11,(v>>>6)&31,(v>>>1)&31,v&1]);const out=new Uint8Array(ENT);let o=0;for(let w=32;w;w>>=1){const rb=Math.max(8,w*2);for(let y=0;y<w;y++)for(let x=0;x<w;x++){const c=cur[y*w+x],v=(evenRound(c[0])<<11)|(evenRound(c[1])<<6)|(evenRound(c[2])<<1)|(c[3]>=0.5?1:0),xx=rb/2>=4&&y%2?x^2:x;put16(out,o+y*rb+xx*2,v);}o+=rb*w;if(w>1){const next=[];for(let y=0;y<w;y+=2)for(let x=0;x<w;x+=2)next.push([0,1,2,3].map(k=>(cur[y*w+x][k]+cur[y*w+x+1][k]+cur[(y+1)*w+x][k]+cur[(y+1)*w+x+1][k])/4));cur=next;}}return out;}
function sheet(rom,lv){const rgba=new Uint8ClampedArray(272*136*4);for(let p=3;p<rgba.length;p+=4)rgba[p]=255;let i=0;for(const b of terrainBanks(rom,lv))for(let k=0;k<b.n;k++,i++){const px=decodeTile(b.data.subarray(k*ENT,(k+1)*ENT));for(let y=0;y<32;y++)for(let x=0;x<32;x++){const v=px[y*32+x],p=4*((Math.floor(i/8)*34+y)*272+(i%8)*34+x);rgba[p]=Math.floor((v>>>11)*255/31);rgba[p+1]=Math.floor(((v>>>6)&31)*255/31);rgba[p+2]=Math.floor(((v>>>1)&31)*255/31);}}return rgba;}
class Project{
 constructor(bytes){this.rom=new Uint8Array(bytes);if(this.rom.length<0x800000||u32(this.rom,0)!==0x80371240)throw Error('Load a big-endian US 1.0 .z64 ROM (at least 8 MB).');this.data={banks:{},levels:{},capacities:{},help:'Plain ASCII and line breaks. Keep @Gnn game-number codes. #S brief, ## objective, @N title. Colours: @CY yellow, @CB blue, @CR red, @CW white, @CG green.'};
 for(let b=0;b<36;b++){const d=unpack(this.rom,u32(this.rom,BTAB+8*b)),v=readBlock(d);if(!v.strings.length)continue;this.data.banks[b]={title:v.strings.find(t=>t.startsWith('@N'))?.slice(2)||'',strings:Object.fromEntries(v.strings.map((t,i)=>[i,t]))};this.data.capacities[b]=v.e-v.s;}
 for(let lv=1;lv<=36;lv++){const rs=timing(chunks(this.rom,lv),lv<=31?Object.values(this.data.banks[lv-1]?.strings||{}):[]);if(rs.length)this.data.levels[lv]=rs;}
 this.original=JSON.parse(JSON.stringify(this.data));
 }
 build(data=this.data,terrain){validate(this.original,data);let rom=this.rom.slice();for(const [b,bank] of Object.entries(data.banks)){const old=this.original.banks[b];if(!old||Object.keys(bank.strings).join()!==Object.keys(old.strings).join())throw Error('Do not add or remove strings.');if(JSON.stringify(bank.strings)===JSON.stringify(old.strings))continue;const ent=BTAB+8*Number(b),d=unpack(rom,u32(rom,ent)),v=readBlock(d),block=encodeBlock(Object.values(bank.strings));if(block.length>v.e-v.s)throw Error('Bank '+b+' exceeds its byte budget.');d.fill(0,v.s,v.e);d.set(block,v.s);rom=install(rom,ent,packBest(d,u32(rom,ent+4)-u32(rom,ent)));}
 for(const [lv,rs] of Object.entries(data.levels)){const c=chunks(rom,Number(lv));let hit=false;for(const ch of c.out)if(ch.id===4){for(const r of rs){const message=r.op==='message',v=message?r.hold_seconds:r.frames,p=2+10*r.i,slot=p+(message?4:2);if(!Number.isInteger(v)||v<0||v>=0x7f00)throw Error('Timing must be an integer from 0 to 32511.');if(u16(ch.data,p)!==(message?0x44:6))throw Error('Timing record mismatch');if(u16(ch.data,slot)!==v){put16(ch.data,slot,v);hit=true;}}if(hit)ch.stored=packBest(ch.data);}if(hit){const body=concat([...c.out.map(ch=>concat([Uint8Array.of(ch.id),ch.stored])),Uint8Array.of(3),c.tail]);rom=install(rom,c.ent,packBest(body,c.e-c.s));}}
 fixCRC(rom);const sheets=Array.isArray(terrain)?terrain:terrain?[terrain]:[];let tail=Math.max(0xb00000,(rom.length+15)&~15);if(sheets.length){const padded=new Uint8Array(tail+0x100000).fill(255);padded.set(rom);rom=padded;}for(const edit of sheets){const lv=Number(edit.level),rgba=edit.rgba;if(!Number.isInteger(lv)||lv<1||lv>31||rgba.length!==272*136*4)throw Error('Invalid terrain sheet');let i=0;for(const b of terrainBanks(rom,lv)){let dirty=false;for(let k=0;k<b.n;k++,i++){const old=decodeTile(b.data.subarray(k*ENT,(k+1)*ENT)),next=old.slice();let changed=false;for(let y=0;y<32;y++)for(let x=0;x<32;x++){const p=4*((Math.floor(i/8)*34+y)*272+(i%8)*34+x),q=y*32+x,v=(Math.floor((rgba[p]*31+127)/255)<<11)|(Math.floor((rgba[p+1]*31+127)/255)<<6)|(Math.floor((rgba[p+2]*31+127)/255)<<1)|(old[q]&1);const untouched=edit.original&&[0,1,2].every(c=>rgba[p+c]===edit.original[p+c]);next[q]=untouched?old[q]:v;if(next[q]!==old[q])changed=true;}if(changed){b.data.set(encodeTile(next),k*ENT);dirty=true;}}if(!dirty)continue;const s=u32(rom,b.slot),e=u32(rom,b.slot+4),blob=packBest(b.data,e-s);if(blob.length<=e-s)rom.set(blob,s);else{if(tail+blob.length>rom.length)throw Error('Terrain tail full');rom.set(blob,tail);put32(rom,b.slot,tail);put32(rom,b.slot+4,tail+blob.length);tail=(tail+blob.length+15)&~15;}}fixCRC(rom);}return rom;
 }
 sheet(lv){return sheet(this.rom,Number(lv));}
}
function ips(a,b){if(b.length>0x1000000)throw Error('IPS supports ROMs up to 16 MB');const parts=[Uint8Array.from([80,65,84,67,72])];let i=0;const diff=k=>k>=a.length||a[k]!==b[k];while(i<b.length){if(!diff(i)){i++;continue;}const start=i;let j=i;while(j<b.length){if(diff(j)){j++;continue;}let k=j;while(k<b.length&&k-j<6&&!diff(k))k++;if(k<b.length&&k-j<6&&diff(k))j=k;else break;}for(let q=start;q<j;){let o=q;if(o===0x454f46)o--;const e=Math.min(j,o+65535);q=e;const h=new Uint8Array(5);h[0]=o>>>16;h[1]=o>>>8;h[2]=o;put16(h,3,e-o);parts.push(h,b.slice(o,e));}i=j;}parts.push(Uint8Array.of(69,79,70));return concat(parts);}
function stable(value){if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';return JSON.stringify(value);}
function hasChanges(original,current){return stable(original)!==stable(current);}
function pixelsChanged(original,current){
 if(original.length!==current.length)return true;
 // Compare the editable tile pixels at the ROM's 5-bit channel precision. Sheet gaps and alpha are not painted into the ROM.
 for(let i=0;i<32;i++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const p=4*((Math.floor(i/8)*34+y)*272+(i%8)*34+x);
  for(let k=0;k<3;k++)if(Math.floor((original[p+k]*31+127)/255)!==Math.floor((current[p+k]*31+127)/255))return true;
 }
 return false;
}
const api={Project,readBlock,encodeBlock,decodeTile,encodeTile,fixCRC,ips,chunks,timing,validate,hasChanges,pixelsChanged};if(typeof module!=='undefined')module.exports=api;else root.StoryROM=api;
})(globalThis);
