/* Entirely synthetic bank and compressed sequence. No game content. */
'use strict';
function soundFixture(){
 const rom=new Uint8Array(0x800000),v=new DataView(rom.buffer);v.setUint32(0,0x80371240);rom.set([83,83,83,86],0x20);rom[0x3e]=0x45;
 for(const [ctl,tbl] of [[0x12edc0,0x133450],[0x1b6510,0x1c7c80]]){
  const u16=(p,n)=>v.setUint16(ctl+p,n),u32=(p,n)=>v.setUint32(ctl+p,n);
  u16(0,0x4231);u16(2,1);u32(4,16);u16(16,1);u32(20,44100);u32(28,40);
  rom[ctl+40]=127;rom[ctl+41]=64;u16(54,1);u32(56,64);
  u32(64,80);u32(68,96);u32(72,112);rom[ctl+76]=64;rom[ctl+77]=127;
  u32(80,4000);u32(88,250000);rom.set([0,127,0,127,60,0],ctl+96);
  u32(112,0);u32(116,9);u32(124,144);u32(128,160);u32(144,0);u32(148,16);u32(152,0xffffffff);u32(160,2);u32(164,1);
  rom.set([0x90,0x77,0x77,0x77,0x77,0x99,0x99,0x99,0x99],tbl);
 }
 const seq=new Uint8Array(160),s=new DataView(seq.buffer);s.setUint32(0,68);s.setUint32(64,480);
 // Tempo 500000, program 0, loop marker, three notes (middle one copied RAW).
 const track=[0,255,81,7,161,32,0,192,0,0,255,46,0,0,0,144,60,100,60];
 const copyAt=68+track.length;track.push(254,0,5,5,60,144,64,100,60,60,255,45,255,255,0,0,0,0,0,255,47);
 seq.set(track,68);const blockEnd=68+track.length-3;s.setUint32(blockEnd-4,blockEnd-(68+14));
 const sequence=seq.slice(0,68+track.length);const base=0x40b210;v.setUint16(base,0x5331);v.setUint16(base+2,30);
 for(let i=0;i<30;i++){const off=256+i*sequence.length;v.setUint32(base+4+i*8,off);v.setUint32(base+8+i*8,sequence.length);rom.set(sequence,base+off);}
 return {rom,sequence,copyAt};
}
if(typeof module!=='undefined')module.exports=soundFixture;
