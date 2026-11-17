const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/viewer/js/parts-lab.js','utf8');
const controls=Object.fromEntries(['anim-timeline','anim-play','anim-back','anim-fwd','anim-speed','anim-scrub'].map(id=>[id,{}]));
const timers=new Map();let nextTimer=0;
const context=vm.createContext({
  $:id=>controls[id]||null,addEventListener:()=>{},
  setInterval:(tick,delay)=>{const id=++nextTimer;timers.set(id,{tick,delay});return id},
  clearInterval:id=>timers.delete(id),
  window:{RigPlayer:{bind:()=>({rest:{ph:0},frame:()=>[]})}},
  pose:{},ui:()=>{},rebuild:()=>{}
});
vm.runInContext(source.slice(source.indexOf('var animBind=')),context);
vm.runInContext('animBar=()=>{};animSync=()=>{};animShow=()=>{};',context);
const change=value=>controls['anim-speed'].onchange({target:{value:String(value)}});
const timer=()=>{assert.equal(timers.size,1);return [...timers.values()][0]};
context.animStart('walk');
assert.equal(timer().delay,40,'default speed is 25 fps');
context.animPhase=45;context.animTravel=50;context.animQueue=['walk','run'];
change(0.5);assert.equal(timer().delay,80);
change(2);assert.equal(timer().delay,20);
assert.equal(context.animPhase,45);assert.equal(context.animTravel,50);
assert.deepEqual(context.animQueue,['walk','run'],'speed changes retain queue and current pose');
const before=context.animSequence().length;
context.animPaused=true;timer().tick();assert.equal(context.animPhase,45,'speed change respects pause');
context.animPaused=false;timer().tick();assert.equal(context.animPhase,50,'each timer tick advances one frame');
context.animFrameStep(-1);assert.equal(context.animPhase,45,'manual step stays one frame at 2x');
assert.ok(context.animPaused);
change('bad');assert.equal(timer().delay,20,'invalid speed is ignored');
assert.equal(context.animSequence().length,before,'preview speed preserves exported frame sequence');
context.animStop();assert.equal(timers.size,0);
change(0.5);assert.equal(timers.size,0,'inactive animation does not start a timer');
context.animStart('run');assert.equal(timer().delay,80,'chosen speed applies to the next animation');
context.animStop();
console.log('Preview speed changes cadence, preserves queue/pose/pause, keeps frame stepping, and releases timers.');
