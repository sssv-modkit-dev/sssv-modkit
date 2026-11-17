/* Standard MIDI -> duration-based game sequences. Format constants only. */
(function(root){
'use strict';
const TABLE=0x40b210,MAX_TICK=0x0fffffff;
const vl=n=>{if(!Number.isInteger(n)||n<0||n>MAX_TICK)throw Error('MIDI timing is too large.');const a=[n&127];while(n=Math.floor(n/128))a.unshift((n&127)|128);return a;};
const be=n=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255];
function readSMF(data){
 if(!(data instanceof Uint8Array))data=new Uint8Array(data);
 if(data.length>4*1024*1024)throw Error('Choose a MIDI smaller than 4 MB.');
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength),events=[],warnings=[];
 let p=0,end=data.length;
 const need=n=>{if(p+n>end)throw Error('Truncated MIDI file.');};
 const byte=()=>{need(1);return data[p++];},u16=()=>{need(2);const v=view.getUint16(p);p+=2;return v;},u32=()=>{need(4);const v=view.getUint32(p);p+=4;return v;};
 const tag=s=>{need(4);if(s!==String.fromCharCode(...data.subarray(p,p+4)))throw Error('Expected MIDI '+s+' chunk.');p+=4;};
 const variable=()=>{let n=0;for(let i=0;i<4;i++){const b=byte();n=n*128+(b&127);if(!(b&128))return n;}throw Error('Invalid MIDI variable length value.');};
 tag('MThd');const header=u32();if(header<6)throw Error('Invalid MIDI header.');need(header);const format=u16(),count=u16(),division=u16();
 if(format!==0&&format!==1)throw Error('Choose a format 0 or 1 MIDI.');
 if(division&0x8000)throw Error('SMPTE timing is not supported. Use ticks per quarter note.');
 if(!division||!count||count>512||(format===0&&count!==1))throw Error('Invalid MIDI track count or division.');
 p=8+header;let ignored=false;
 for(let track=0;track<count;track++){
  end=data.length;tag('MTrk');const length=u32();need(length);end=p+length;let tick=0,status=0,ended=false;
  while(p<end){
   tick+=variable();if(tick>MAX_TICK)throw Error('MIDI timing is too large.');
   let s=byte();if(s<128){if(!status)throw Error('Missing MIDI running status.');p--;s=status;}else status=s<240?s:0;
   if(s===255){const type=byte(),n=variable();need(n);
    if(type===81){if(n!==3)throw Error('Invalid MIDI tempo.');const tempo=data[p]*65536+data[p+1]*256+data[p+2];if(!tempo)throw Error('Invalid MIDI tempo.');events.push({tick,type:'tempo',tempo});}
    if(type===47){if(n!==0)throw Error('Invalid MIDI end event.');ended=true;}
    p+=n;if(ended){if(p!==end)throw Error('Unexpected data after MIDI end event.');break;}
   }else if(s===240||s===247){const n=variable();need(n);p+=n;ignored=true;
   }else if(s>=128&&s<240){
    const kind=s>>>4,channel=s&15,a=byte(),b=kind===12||kind===13?undefined:byte();
    if(a>127||b>127)throw Error('Invalid MIDI data byte.');
    const type=kind===9&&b?'on':kind===8||kind===9?'off':({11:'cc',12:'program',14:'bend'})[kind];
    if(type)events.push({tick,type,channel,a,b});else ignored=true;
   }else throw Error('Unsupported MIDI system status.');
   if(events.length>200000)throw Error('MIDI has too many events. Simplify it first.');
  }
  if(!ended)throw Error('MIDI track is missing its end event.');
 }
 if(p!==data.length)throw Error('Unexpected data after MIDI tracks.');
 if(ignored)warnings.push('SysEx and pressure events are omitted.');
 const channels=[...new Set(events.filter(e=>e.channel!==undefined).map(e=>e.channel))].sort((a,b)=>a-b);
 if(channels.length>15)throw Error('Use at most 15 MIDI channels (one track is reserved for tempo).');
 return {division,events,channels,warnings};
}
function encode(midi,options={}){
 const {division}=midi,transpose=options.transpose??0,mapping=options.programs||{},muted=new Set(options.muted||[]);
 if(!Number.isInteger(transpose)||transpose< -48||transpose>48)throw Error('Transpose must be a whole number from -48 to 48.');
 for(const program of Object.values(mapping))if(!Number.isInteger(program)||program<0||program>9)throw Error('Choose a game instrument from 0 to 9.');
 const active=new Map(),notes=[],rest=[],warnings=[...midi.warnings];let dangling=0,clipped=0;
 for(const e of [...midi.events].sort((a,b)=>a.tick-b.tick||(a.type==='off'?0:1)-(b.type==='off'?0:1))){
  if(muted.has(e.channel))continue;
  const key=e.channel+':'+e.a;
  if(e.type==='on'){if(!active.has(key))active.set(key,[]);active.get(key).push(e);}
  else if(e.type==='off'){const q=active.get(key);if(q?.length){const on=q.shift();notes.push({...on,type:'note',duration:Math.max(1,e.tick-on.tick)});}else dangling++;}
  else rest.push(e);
 }
 for(const q of active.values())for(const on of q){notes.push({...on,type:'note',duration:division});dangling++;}
 if(dangling)warnings.push('Unpaired notes: '+dangling+'. Notes without an end use one beat.');
 if(!notes.length)throw Error('This MIDI has no unmuted notes.');
 const channels=[...new Set([...notes,...rest].filter(e=>e.channel!==undefined).map(e=>e.channel))].sort((a,b)=>a-b);
 if(channels.length>15)throw Error('Use at most 15 MIDI channels (one track is reserved for tempo).');
 const conductor=rest.filter(e=>e.type==='tempo').map(e=>[e.tick,[255,81,...be(e.tempo).slice(1)]]);
 if(!conductor.some(e=>e[0]===0))conductor.unshift([0,[255,81,7,161,32]]);
 const tracks=[conductor];
 for(const ch of channels){const events=[];
  if(mapping[ch]!==undefined)events.push([0,0,[192|ch,mapping[ch]]]);
  for(const e of rest.filter(e=>e.channel===ch)){
   if(e.type==='program')events.push([e.tick,0,[192|ch,mapping[ch]??e.a]]);
   if(e.type==='cc'||e.type==='bend')events.push([e.tick,0,[(e.type==='cc'?176:224)|ch,e.a,e.b]]);
  }
  for(const e of notes.filter(e=>e.channel===ch)){const key=ch===9?e.a:e.a+transpose,n=Math.max(0,Math.min(127,key));if(n!==key)clipped++;events.push([e.tick,1,[144|ch,n,e.b,...vl(e.duration)]]);}
  tracks.push(events.sort((a,b)=>a[0]-b[0]||a[1]-b[1]).map(([tick,,bytes])=>[tick,bytes]));
 }
 if(clipped)warnings.push(clipped+' notes were clamped to MIDI keys 0-127.');
 const bodies=tracks.map(events=>{const body=[];let last=0;for(const [tick,bytes] of events){body.push(...vl(tick-last),...bytes);last=tick;}body.push(0,255,47);
  // FE is the sequence reader's copy marker, even inside tempo and VLQ bytes.
  return Uint8Array.from(body.flatMap(b=>b===254?[254,254]:[b]));});
 const bytes=new Uint8Array(68+bodies.reduce((n,b)=>n+b.length,0)),v=new DataView(bytes.buffer);v.setUint32(64,division);let pos=68;
 bodies.forEach((body,i)=>{v.setUint32(i*4,pos);bytes.set(body,pos);pos+=body.length;});
 return {bytes,warnings,channels,noteCount:notes.length};
}
function slots(rom){
 if(!(rom instanceof Uint8Array)||rom.length<0x800000||rom.length>0x1000000)throw Error('Load an 8-16 MB US 1.0 ROM.');
 const v=new DataView(rom.buffer,rom.byteOffset,rom.byteLength);
 if(v.getUint32(0)!==0x80371240||v.getUint16(TABLE)!==0x5331||v.getUint16(TABLE+2)!==30)throw Error('Unsupported music table. Choose a US 1.0 ROM.');
 const result=Array.from({length:30},(_,i)=>{const p=TABLE+4+i*8,start=TABLE+v.getUint32(p),capacity=v.getUint32(p+4);if(start<TABLE+244||capacity<68||start+capacity>rom.length)throw Error('Invalid music slot.');return {index:i,start,capacity};});
 const ordered=[...result].sort((a,b)=>a.start-b.start);for(let i=1;i<ordered.length;i++)if(ordered[i].start<ordered[i-1].start+ordered[i-1].capacity)throw Error('Overlapping music slots are not supported.');
 return result;
}
function fit(rom,index,bytes){const slot=slots(rom)[index];if(!slot||!Number.isInteger(index))throw Error('Choose a song slot from 0 to 29.');return {...slot,used:bytes.length,fits:bytes.length<=slot.capacity};}
function build(rom,index,bytes){const slot=fit(rom,index,bytes);if(!slot.fits)throw Error('Song needs '+slot.used+' bytes; slot holds '+slot.capacity+'. Simplify the MIDI, mute channels or choose a larger slot.');
 const core=typeof module!=='undefined'?require('./sound-core.js'):root.SoundCore;core.parseSequence(bytes);
 const helpers=typeof module!=='undefined'?require('./story/rom.js'):root.StoryROM,out=rom.slice();out.fill(0,slot.start,slot.start+slot.capacity);out.set(bytes,slot.start);helpers.fixCRC(out);return out;
}
function ips(source,out){
 if(source.length!==out.length||out.length>0x1000000)throw Error('Music IPS requires equal ROM sizes up to 16 MB.');
 const parts=[Uint8Array.from([80,65,84,67,72])];let length=8;
 for(let p=0;p<out.length;){if(source[p]===out[p]){p++;continue;}let start=p;
  // EOF is a reserved record address. Include the preceding byte in this case.
  if(start===0x454f46)start--;
  do{p++;}while(p<out.length&&p-start<65535&&source[p]!==out[p]);
  const size=p-start;parts.push(Uint8Array.of(start>>>16,start>>>8&255,start&255,size>>>8,size&255),out.slice(start,p));length+=5+size;
 }
 parts.push(Uint8Array.of(69,79,70));const result=new Uint8Array(length);let pos=0;for(const part of parts){result.set(part,pos);pos+=part.length;}return result;
}
const api={readSMF,encode,slots,fit,build,ips};if(typeof module!=='undefined')module.exports=api;else root.SoundEncode=api;
})(globalThis);
