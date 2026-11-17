/* Local bank/sequence reader and sampler primitives. Contains format constants only. */
(function(root){
'use strict';
const BANKS=[[0x12edc0,0x133450],[0x1b6510,0x1c7c80]], SEQUENCES=0x40b210;
function reader(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return {u8:p=>v.getUint8(p),s8:p=>v.getInt8(p),u16:p=>v.getUint16(p),s16:p=>v.getInt16(p),u32:p=>v.getUint32(p),s32:p=>v.getInt32(p)};}
function parseBank(rom,ctl,tbl){
 const c=reader(rom.subarray(ctl));if(c.u16(0)!==0x4231)throw Error('Unsupported sound bank. Choose a US 1.0 ROM.');
 const waves=new Map();
 function wave(p){if(waves.has(p))return waves.get(p);const w={id:p,base:c.s32(p),length:c.s32(p+4),type:c.u8(p+8)};
  if(w.type!==0)throw Error('Unsupported sample format.');const lp=c.u32(p+12),bk=c.u32(p+16);w.order=c.s32(bk);w.predictors=c.s32(bk+4);
  if(w.order!==2||w.predictors<1||w.predictors>16||w.length<0||tbl+w.base<0||tbl+w.base+w.length>rom.length)throw Error('Invalid sound bank.');
  w.book=Array.from({length:w.order*w.predictors*8},(_,i)=>c.s16(bk+8+2*i));if(lp)w.loop={start:c.u32(lp),end:c.u32(lp+4),count:c.u32(lp+8)};
  waves.set(p,w);return w;
 }
 function instrument(p){if(!p)return null;const ins={volume:c.u8(p),pan:c.u8(p+1),sounds:[]};const n=c.s16(p+14);if(n<0||n>1024)throw Error('Invalid instrument.');
  for(let k=0;k<n;k++){const s=c.u32(p+16+4*k);if(!s){ins.sounds.push(null);continue;}const e=c.u32(s),key=c.u32(s+4);ins.sounds.push({key:key?[...Array.from({length:5},(_,i)=>c.u8(key+i)),c.s8(key+5)]:null,volume:c.u8(s+13),pan:c.u8(s+12),env:e?{attack:c.s32(e),release:c.s32(e+8)}:null,wave:wave(c.u32(s+8))});}return ins;
 }
 const b=c.u32(4),n=c.s16(b);if(n<0||n>1024)throw Error('Invalid bank.');const bank={rate:c.s32(b+4)||44100,instruments:Array.from({length:n},(_,i)=>instrument(c.u32(b+12+4*i))),percussion:instrument(c.u32(b+8))};
 bank.waves=[...waves.values()].sort((a,b)=>a.base-b.base);bank.pcm=w=>{if(!w.pcm)w.pcm=decode(rom.subarray(tbl+w.base,tbl+w.base+w.length),w);return w.pcm;};return bank;
}
function decode(data,w){
 const out=new Float32Array(Math.floor(data.length/9)*16);let a=0,b=0,o=0;
 for(let f=0;f+9<=data.length;f+=9){const scale=data[f]>>>4,p=Math.min(data[f]&15,w.predictors-1)*16,h1=w.book.slice(p,p+8),h2=w.book.slice(p+8,p+16);
  for(let half=0;half<2;half++){const ex=Array.from({length:8},(_,i)=>{const j=half*8+i,v=(data[f+1+(j>>>1)]>>>(j%2?0:4))&15;return (v>7?v-16:v)*2**scale;});const r=[];
   for(let i=0;i<8;i++){let acc=ex[i]*2048+a*h1[i]+b*h2[i];for(let j=0;j<i;j++)acc+=ex[j]*h1[i-1-j];r[i]=Math.max(-32768,Math.min(32767,Math.floor(acc/2048)));out[o++]=r[i]/32768;}a=r[7];b=r[6];
  }
 }return out;
}
function expand(data,start,end){const bytes=[],positions=[];for(let p=start;p<end;){const at=p,b=data[p++];if(b!==254){bytes.push(b);positions.push(at);continue;}if(p>=end)throw Error('Truncated sample sequence.');if(data[p]===254){p++;bytes.push(254);positions.push(at);continue;}if(p+3>end)throw Error('Truncated sequence copy.');const offset=data[p]*256+data[p+1],length=data[p+2];p+=3;const from=at-offset;if(from<0||from+length>data.length||!offset)throw Error('Invalid sequence copy.');for(let i=0;i<length;i++){bytes.push(data[from+i]);positions.push(at);}}
 return {bytes:Uint8Array.from(bytes),positions};
}
function parseTrack(expanded){const d=expanded.bytes||expanded,positions=expanded.positions||Array.from(d,(_,i)=>i),r=reader(d),events=[];let p=0,tick=0,status=0;
 const byte=()=>{if(p>=d.length)throw Error('Truncated sequence event.');return d[p++];};
 const vl=()=>{let n=0;for(let i=0;i<5;i++){const b=byte();n=n*128+(b&127);if(!(b&128))return n;}throw Error('Invalid sequence delta.');};
 while(p<d.length){const start=p,delta=vl();tick+=delta;if(d[p]&128)status=byte();if(!status)throw Error('Missing sequence status.');const e={tick,delta,start,raw:positions[start],channel:status&15};
  if(status===255){const type=byte();if(type===47)e.type='end';else if(type===81){e.type='tempo';e.tempo=byte()*65536+byte()*256+byte();if(!e.tempo)throw Error('Invalid tempo.');}else if(type===46){e.type='loopstart';e.id=byte();e.count=byte();}else if(type===45){e.type='loopend';e.count=byte();byte();const blockEnd=positions[p+3]+1;if(p+4>d.length)throw Error('Truncated loop.');e.targetRaw=blockEnd-r.u32(p);p+=4;}else throw Error('Unsupported sequence event.');
  }else{const kind=status>>>4;e.a=byte();if(kind!==12&&kind!==13)e.b=byte();if(kind===9){e.type='note';e.duration=vl();}else e.type=({8:'off',10:'pressure',11:'cc',12:'program',13:'pressure1',14:'bend'})[kind];if(!e.type)throw Error('Unsupported sequence status.');}
  events.push(e);if(e.type==='end')break;
 }
 for(const e of events)if(e.type==='loopend'){e.target=events.findIndex(x=>x.raw===e.targetRaw);if(e.target<0)throw Error('Invalid sequence loop target.');}
 return events;
}
function parseSequence(data){const r=reader(data),offsets=Array.from({length:16},(_,i)=>r.u32(i*4)),ends=[...new Set([...offsets.filter(Boolean),data.length])].sort((a,b)=>a-b),division=r.u32(64);if(!division||division>32767)throw Error('Invalid sequence division.');const tracks=offsets.map(o=>o?parseTrack(expand(data,o,ends.find(e=>e>o))):[]);return {division,tracks};}
function load(rom){if(!(rom instanceof Uint8Array))rom=new Uint8Array(rom);const banks=BANKS.map(([c,t])=>parseBank(rom,c,t)),r=reader(rom),n=r.u16(SEQUENCES+2);if(n!==30)throw Error('Unsupported music file. Choose a US 1.0 ROM.');const songs=Array.from({length:n},(_,i)=>{const p=SEQUENCES+4+i*8,o=r.u32(p),l=r.u32(p+4);return parseSequence(rom.subarray(SEQUENCES+o,SEQUENCES+o+l));});return {banks,songs};}
function selectSound(ins,key,velocity){return ins?.sounds.find(s=>s&&s.key&&key>=s.key[2]&&key<=s.key[3]&&velocity>=s.key[0]&&velocity<=s.key[1]);}
/* Track cursors retain absolute time while loop jumps restore the encoded event position. */
function* trackEvents(events,loop=false){let i=0,tick=0,steps=0;const counters=new Map();while(i<events.length){if(++steps>2000000)throw Error('Sequence loop exceeded its event limit.');const e=events[i];tick+=e.delta;yield {...e,sourceTick:e.tick,tick};if(e.type==='end')return;
 if(loop&&e.type==='loopend'&&e.count){const left=counters.has(i)?counters.get(i):e.count;if(left){if(e.count!==255)counters.set(i,left-1);i=e.target;continue;}counters.delete(i);}i++;}}
function* timeline(seq,loop=false){const cursors=seq.tracks.map(t=>trackEvents(t,loop)),next=cursors.map(c=>c.next()),states=cursors.map(()=>({program:{},volume:{}}));let tick=0,time=0,tempo=500000;
 while(true){let t=-1;for(let i=0;i<next.length;i++)if(!next[i].done&&(t<0||next[i].value.tick<next[t].value.tick))t=i;if(t<0)return;
 const e=next[t].value;time+=(e.tick-tick)*tempo/seq.division/1e6;tick=e.tick;const state=states[t],ch=e.channel;
 if(e.type==='tempo')tempo=e.tempo;if(e.type==='program')state.program[ch]=e.a;if(e.type==='cc'&&e.a===7)state.volume[ch]=e.b;
 yield {...e,track:t,time,tempo,program:state.program[ch]||0,volume:state.volume[ch]??100};next[t]=cursors[t].next();
 }}
const infoCache=new WeakMap();
function songInfo(seq){if(infoCache.has(seq))return infoCache.get(seq);let end=0;const tempos=[];for(const e of timeline(seq)){end=Math.max(end,e.time);if(e.type==='tempo')tempos.push(e);}const info={duration:end,tempo:tempos[0]?.tempo||500000};infoCache.set(seq,info);return info;}
function noteSpec(bank,e,duration){const ins=e.channel===9&&bank.percussion?bank.percussion:bank.instruments[e.program],sound=selectSound(ins,e.a,e.b);if(!sound||!e.b)return null;return {sound,pcm:bank.pcm(sound.wave),ratio:2**((e.a-sound.key[4])/12+sound.key[5]/1200),duration:Math.max(.03,duration),gain:ins.volume/127*sound.volume/127*e.b/127*e.volume/127*.35};}
function notes(seq){const ev=[...timeline(seq)],tempos=ev.filter(e=>e.type==='tempo');function seconds(tick){let t=0,last=0,tempo=500000;for(const e of tempos){if(e.tick>=tick)break;t+=(e.tick-last)*tempo/seq.division/1e6;last=e.tick;tempo=e.tempo;}return t+(tick-last)*tempo/seq.division/1e6;}return ev.filter(e=>e.type==='note').map(e=>({...e,seconds:Math.max(.03,seconds(e.tick+e.duration)-e.time)}));}
const yieldUI=()=>new Promise(r=>setTimeout(r,0));
async function render(seq,bank,progress=()=>{},options={}){const rate=bank.rate,info=songInfo(seq),duration=Math.min(options.maxSeconds??600,info.duration+3),out=new Float32Array(Math.ceil(duration*rate)),ns=notes(seq);let slice=performance.now();progress(0);
 for(let ni=0;ni<ns.length;ni++){const e=ns[ni];if(e.time>=duration)continue;const spec=noteSpec(bank,e,e.seconds);if(!spec)continue;const {pcm,ratio,gain}=spec,loop=spec.sound.wave.loop,start=Math.floor(e.time*rate),length=Math.min(Math.floor((spec.duration+.25)*rate),out.length-start),release=Math.floor(spec.duration*rate),attack=Math.floor(.004*rate);
  for(let j=0;j<length;j++){let p=j*ratio;if(loop?.count&&loop.end>loop.start&&p>=loop.end)p=loop.start+(p-loop.start)%(loop.end-loop.start);const k=Math.floor(p),f=p-k;if(k<pcm.length-1){const env=j<attack?j/Math.max(1,attack-1):j>=release?1-(j-release)/Math.max(1,Math.floor((spec.duration+.25)*rate)-release-1):1;out[start+j]+=(pcm[k]*(1-f)+pcm[k+1]*f)*env*gain;}
   if(j%16384===0&&performance.now()-slice>16){progress(.95*(ni+j/Math.max(1,length))/ns.length);await yieldUI();slice=performance.now();}
  }
 }let peak=1;for(let i=0;i<out.length;i++){peak=Math.max(peak,Math.abs(out[i]));if(i%262144===0){await yieldUI();progress(.95+.025*i/out.length);}}for(let i=0;i<out.length;i++){out[i]*=.9/peak;if(i%262144===0){await yieldUI();progress(.975+.025*i/out.length);}}progress(1);return {pcm:out,rate,duration,truncated:info.duration+3>duration};}
function wav(pcm,rate){const data=new Uint8Array(44+pcm.length*2),v=new DataView(data.buffer),text=(p,s)=>[...s].forEach((c,i)=>data[p+i]=c.charCodeAt(0));text(0,'RIFF');v.setUint32(4,data.length-8,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,pcm.length*2,true);for(let i=0;i<pcm.length;i++)v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);return data;}
function midi(seq){const vl=n=>{const a=[n&127];while(n=Math.floor(n/128))a.unshift((n&127)|128);return a;},be=n=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255],chunks=[];
 for(const track of seq.tracks){if(!track.length)continue;const events=[];for(const e of track){const ch=e.channel;if(e.type==='note'){events.push([e.tick,1,[144|ch,e.a,e.b]],[e.tick+e.duration,0,[128|ch,e.a,0]]);}else{const bytes=e.type==='tempo'?[255,81,3,...be(e.tempo).slice(1)]:e.type==='program'?[192|ch,e.a]:e.type==='pressure1'?[208|ch,e.a]:({cc:176,bend:224,off:128,pressure:160})[e.type]!==undefined?[({cc:176,bend:224,off:128,pressure:160})[e.type]|ch,e.a,e.b]:null;if(bytes)events.push([e.tick,0,bytes]);}}
  events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const body=[];let last=0;for(const [tick,,bytes] of events){body.push(...vl(tick-last),...bytes);last=tick;}body.push(0,255,47,0);chunks.push([77,84,114,107,...be(body.length),...body]);
 }return Uint8Array.from([77,84,104,100,0,0,0,6,0,1,chunks.length>>>8,chunks.length&255,seq.division>>>8,seq.division&255,...chunks.flat()]);}
const api={parseBank,decode,expand,parseTrack,parseSequence,load,selectSound,trackEvents,timeline,songInfo,noteSpec,notes,render,wav,midi};if(typeof module!=='undefined')module.exports=api;else root.SoundCore=api;
})(globalThis);
