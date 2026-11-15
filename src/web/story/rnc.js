/* RNC1 codec ported from our clean-room research tools. */
(function(root){
'use strict';
const u16=(b,p)=>(b[p]<<8)|b[p+1],u32=(b,p)=>(b[p]*16777216+(b[p+1]<<16)+(b[p+2]<<8)+b[p+3])>>>0;
function put16(b,p,v){b[p]=v>>>8;b[p+1]=v;}
function put32(b,p,v){b[p]=v>>>24;b[p+1]=v>>>16;b[p+2]=v>>>8;b[p+3]=v;}
function crc16(b){let c=0;for(const v of b){c^=v;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xa001:c>>>1;}return c;}
function mirror(x,n){let r=0;while(n--){r=r*2+(x&1);x>>>=1;}return r;}
class Bits{
 constructor(b,p){this.b=b;this.p=p;this.buf=this.word(p);this.cnt=16;}
 word(p){return (this.b[p]||0)|((this.b[p+1]||0)<<8);}
 adv(n){this.buf>>>=n;this.cnt-=n;if(this.cnt<16){this.p+=2;this.buf|=this.word(this.p)<<this.cnt;this.cnt+=16;}}
 read(n){const v=this.buf&((1<<n)-1);this.adv(n);return v;}
 fix(){this.cnt-=16;this.buf&=(1<<this.cnt)-1;this.buf|=this.word(this.p)<<this.cnt;this.cnt+=16;}
}
function table(bs){const n=bs.read(5);if(n>16)throw Error('Invalid RNC table');const ls=Array.from({length:n},()=>bs.read(4)),t=[];let code=0;for(let l=1;l<=15;l++){for(let j=0;j<n;j++)if(ls[j]===l)t.push([mirror(code++,l),l,j]);code*=2;}return t;}
function huf(bs,t){for(const [c,l,v] of t)if((bs.buf&((1<<l)-1))===c){bs.adv(l);return v<2?v:(1<<(v-1))|bs.read(v-1);}throw Error('Invalid RNC Huffman code');}
function unpack(b,p=0){
 if(p<0||p+18>b.length||b[p]!==82||b[p+1]!==78||b[p+2]!==67||b[p+3]!==1)throw Error('Expected RNC1 archive');
 const size=u32(b,p+4),packed=u32(b,p+8);if(size>0x2000000||p+18+packed>b.length)throw Error('Invalid RNC size');
 const source=b.subarray(p+18,p+18+packed);if(crc16(source)!==u16(b,p+14))throw Error('RNC packed CRC mismatch');
 const bs=new Bits(source,0),out=new Uint8Array(size);let o=0,blocks=0;bs.adv(2);
 while(o<size){if(++blocks>255)throw Error('Invalid RNC chunks');const raw=table(bs),dist=table(bs),len=table(bs);let n=bs.read(16);if(!n)throw Error('Empty RNC chunk');while(n--){const l=huf(bs,raw);if(o+l>size||(l>0&&bs.p+l>source.length))throw Error('Invalid RNC literal');out.set(source.subarray(bs.p,bs.p+l),o);o+=l;if(l){bs.p+=l;bs.fix();}if(!n)break;const d=huf(bs,dist)+1,k=huf(bs,len)+2;if(d>o||o+k>size)throw Error('Invalid RNC match');for(let j=0;j<k;j++){out[o]=out[o-d];o++;}}}
 if(crc16(out)!==u16(b,p+12))throw Error('RNC output CRC mismatch');return out;
}
class Writer{
 constructor(){this.out=[];this.slot=null;this.nb=0;this.acc=0;}
 bits(v,n){for(let i=0;i<n;i++){if(this.slot===null){this.slot=this.out.length;this.out.push(0,0);this.nb=0;this.acc=0;}this.acc|=((v>>>i)&1)<<this.nb++;this.out[this.slot]=this.acc&255;this.out[this.slot+1]=this.acc>>>8;if(this.nb===16)this.slot=null;}}
 raw(b){for(const v of b)this.out.push(v);}
}
const sym=v=>v<2?[v,0,0]:[32-Math.clz32(v),v-2**(31-Math.clz32(v)),31-Math.clz32(v)];
function lengths(freq){const syms=freq.map((f,i)=>f?i:-1).filter(i=>i>=0),ls=freq.map(()=>0);if(syms.length<2){if(syms.length)ls[syms[0]]=1;return ls;}for(;;){let h=syms.map((s,i)=>[freq[s],i,[s]]),k=syms.length;const depth=freq.map(()=>0);while(h.length>1){h.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const a=h.shift(),b=h.shift(),s=a[2].concat(b[2]);for(const j of s)depth[j]++;h.push([a[0]+b[0],k++,s]);}if(Math.max(...depth)<=15)return depth;freq=freq.map(f=>f?Math.floor((f+1)/2):0);}}
function writeTable(w,ls){let n=ls.length;while(n&&!ls[n-1])n--;if(n>16)throw Error('RNC table too large');w.bits(n,5);for(let i=0;i<n;i++)w.bits(ls[i],4);let code=0;const cs=[];for(let l=1;l<=15;l++){for(let j=0;j<n;j++)if(ls[j]===l)cs[j]=[mirror(code++,l),l];code*=2;}return cs;}
function put(w,cs,v){const [s,e,n]=sym(v),[c,l]=cs[s];w.bits(c,l);if(n)w.bits(e,n);}
function lz(data,start,end,m2){const head=new Int32Array(65536).fill(-1),prev=new Int32Array(end).fill(-1),out=[];let lit=start;
 const insert=p=>{if(p+2<=data.length){const k=data[p]*256+data[p+1];prev[p]=head[k];head[k]=p;}};for(let p=Math.max(0,start-0x8000);p<start;p++)insert(p);
 function best(p){if(p+2>end)return [0,0];let q=head[data[p]*256+data[p+1]],bl=0,bd=0,n=0;const lim=Math.min(0x8000,end-p);while(q>=0&&p-q<=0x8000&&n<256){let l=0;while(l<lim&&data[q+l]===data[p+l])l++;if(l>bl){bl=l;bd=p-q;}if(l===lim)break;q=prev[q];n++;}return [bl,bd];}
 let p=start;while(p<end){const [l,d]=best(p);if(l>=3||(l===2&&d<=m2)){insert(p);if(best(p+1)[0]>l+1){p++;continue;}out.push([data.subarray(lit,p),[d,l]]);for(let q=p+1;q<p+l;q++)insert(q);p+=l;lit=p;}else{insert(p);p++;}}out.push([data.subarray(lit,end),null]);return out;}
function pack(data,chunk=0x3000,m2=0x100){const w=new Writer();w.bits(0,2);let pos=0,n=0;do{const end=Math.min(data.length,pos+chunk),seq=lz(data,pos,end,m2);n++;const fr=Array(17).fill(0),fd=fr.slice(),fl=fr.slice();for(const [lit,m] of seq){fr[sym(lit.length)[0]]++;if(m){fd[sym(m[0]-1)[0]]++;fl[sym(m[1]-2)[0]]++;}}const cr=writeTable(w,lengths(fr)),cd=writeTable(w,lengths(fd)),cl=writeTable(w,lengths(fl));w.bits(seq.length,16);for(const [lit,m] of seq){put(w,cr,lit.length);w.raw(lit);if(m){put(w,cd,m[0]-1);put(w,cl,m[1]-2);}}pos=end;}while(pos<data.length);
 const body=Uint8Array.from(w.out),out=new Uint8Array(18+body.length);out.set([82,78,67,1]);put32(out,4,data.length);put32(out,8,body.length);put16(out,12,crc16(data));put16(out,14,crc16(body));out[16]=Math.min(255,Math.max(0,body.length-data.length)+2);out[17]=n;out.set(body,18);return out;}
function packBest(data,limit){let best;for(const c of [0x3000,0x2000,0x4000,0x1000,0x8000])for(const m of [0x100,0x40,0x400,0]){const p=pack(data,c,m);if(!best||p.length<best.length)best=p;if(limit&&best.length<=limit)return best;}return best;}
const api={u16,u32,put16,put32,crc16,unpack,pack,packBest};if(typeof module!=='undefined')module.exports=api;else root.StoryRNC=api;
})(globalThis);

