'use strict';
const assert=require('node:assert/strict'),S=require('../src/web/sound-core.js'),fixture=require('./sound-fixture.js');
// Predictor h1=[1024,...], h2=0 adds half the preceding excitation, floored.
const wave={predictors:1,book:[1024,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]},pcm=S.decode(Uint8Array.from([0,0x12,0x34,0x56,0x70,0x12,0x34,0x56,0x70]),wave);
assert.deepEqual([...pcm].map(x=>x*32768),[1,2,4,5,7,8,10,3,2,2,4,5,7,8,10,3]);
const negative=S.decode(Uint8Array.from([0,0x8f,0,0,0,0,0,0,0]),{predictors:1,book:Array(16).fill(0)});assert.equal(negative[0]*32768,-8);assert.equal(negative[1]*32768,-1);
assert.deepEqual([...S.expand(Uint8Array.from([7,254,254,8,254,0,4,3]),4,8).bytes],[7,254,254]);
assert.deepEqual([...S.expand(Uint8Array.from([254,254]),0,2).bytes],[254]);assert.throws(()=>S.expand(Uint8Array.of(254),0,1));
const f=fixture(),loaded=S.load(f.rom),seq=loaded.songs[0],events=seq.tracks[0];assert.equal(loaded.songs.length,30);assert.equal(loaded.banks[0].waves.length,1);assert.equal(events.filter(e=>e.type==='note').length,3);
const iter=S.trackEvents(events,true),notes=[];for(let i=0;i<24;i++){const e=iter.next().value;if(e.type==='note')notes.push(e.tick);}assert.deepEqual(notes.slice(0,6),[0,0,60,120,120,180]);
const finite=events.map(e=>({...e}));finite.find(e=>e.type==='loopend').count=2;assert.equal([...S.trackEvents(finite,true)].filter(e=>e.type==='note').length,9);assert.equal([...S.trackEvents(finite,false)].filter(e=>e.type==='note').length,3);
const a={key:[0,63,20,60,40,0]},b={key:[64,127,20,60,40,-20]},ins={sounds:[null,a,b]};assert.equal(S.selectSound(ins,60,63),a);assert.equal(S.selectSound(ins,60,64),b);assert.equal(S.selectSound(ins,61,64),undefined);
const simple={division:480,tracks:[[{tick:0,type:'tempo',tempo:500000},{tick:0,type:'program',channel:0,a:2},{tick:0,type:'note',channel:0,a:60,b:100,duration:480}]]};
const midi=S.midi(simple);assert.deepEqual([...midi],[77,84,104,100,0,0,0,6,0,1,0,1,1,224,77,84,114,107,0,0,0,23,0,255,81,3,7,161,32,0,192,2,0,144,60,100,131,96,128,60,0,0,255,47,0]);
const pressure=S.parseTrack(Uint8Array.from([0,208,20,0,192,1,0,255,47]));assert.equal(pressure[0].type,'pressure1');assert.equal(pressure[1].type,'program');
(async()=>{const result=await S.render(seq,loaded.banks[0]);assert.ok(result.pcm.every(Number.isFinite));assert.ok(result.pcm.some(x=>Math.abs(x)>.001));const wav=S.wav(result.pcm,result.rate),v=new DataView(wav.buffer);assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(40,true),result.pcm.length*2);console.log('Sound: hand VADPCM vector, FE raw copy/literal, loop target/count, MIDI bytes, key maps, bank parse and non-silent render passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
