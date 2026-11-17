(function(root){
'use strict';
class SoundPlayer{
 constructor(){this.context=null;this.voices=[];this.cache=new WeakMap();this.position=0;this.generation=0;this.state='stopped';this.clock=new Worker('sound-clock.js');this.clock.onmessage=()=>{try{this.schedule();}catch(e){this.stop();this.onerror?.(e);}};}
 async unlock(){if(!this.context)this.context=new AudioContext({sampleRate:44100});await this.context.resume();return this.context;}
 buffer(bank,w){if(!this.cache.has(w)){const pcm=bank.pcm(w),b=this.context.createBuffer(1,pcm.length,bank.rate);b.copyToChannel(pcm,0);this.cache.set(w,b);}return this.cache.get(w);}
 voice(bank,spec,when,elapsed=0,raw=false){
  const ctx=this.context,w=spec.sound.wave;this.voices=this.voices.filter(v=>v.end>ctx.currentTime);
  if(this.voices.length>=48){const old=this.voices.shift();old.source.stop(ctx.currentTime);}
  const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.buffer(bank,w);source.playbackRate.value=spec.ratio;source.connect(gain);gain.connect(ctx.destination);
  const loop=w.loop;if(!raw&&loop?.count&&loop.end>loop.start&&loop.end<=source.buffer.length){source.loop=true;source.loopStart=loop.start/bank.rate;source.loopEnd=loop.end/bank.rate;}
  const duration=raw?source.buffer.duration/spec.ratio:spec.duration,remaining=duration+.25-elapsed;if(remaining<=0)return;
  let offset=elapsed*spec.ratio;if(source.loop&&offset>=source.loopEnd)offset=source.loopStart+(offset-source.loopStart)%(source.loopEnd-source.loopStart);if(offset>=source.buffer.duration)return;
  const level=spec.gain*.9;gain.gain.setValueAtTime(elapsed>=.004?level:level*elapsed/.004,when);if(elapsed<.004)gain.gain.linearRampToValueAtTime(level,when+.004-elapsed);
  if(!raw){const release=when+Math.max(0,duration-elapsed);gain.gain.setValueAtTime(elapsed>duration?level*Math.max(0,1-(elapsed-duration)/.25):level,release);gain.gain.linearRampToValueAtTime(0,when+remaining);}
  source.start(when,offset);const end=when+remaining;source.stop(end);const voice={source,gain,end};this.voices.push(voice);source.onended=()=>{source.disconnect();gain.disconnect();this.voices=this.voices.filter(v=>v!==voice);};return source;
 }
 silence(){for(const v of this.voices){try{v.source.stop();}catch{}}this.voices=[];}
 async audition(bank,sound,ins,key=null,raw=false,duration=.6){const token=++this.generation;await this.unlock();if(token!==this.generation)return;this.silence();if(!sound)return;const spec={sound,ratio:key===null?1:2**((key-sound.key[4])/12+sound.key[5]/1200),duration,gain:raw ? .3 : ins.volume/127*sound.volume/127*.3};this.voice(bank,spec,this.context.currentTime+.02,0,raw);}
 async play(seq,bank,loop=false,offset=this.position){const token=++this.generation;await this.unlock();if(token!==this.generation)return;this.silence();this.seq=seq;this.bank=bank;this.loop=loop;this.position=offset;this.origin=this.context.currentTime+.06-offset;this.duration=SoundCore.songInfo(seq).duration;
  this.durations=new Map(SoundCore.notes(seq).map(e=>[e.track+':'+e.start,e.seconds]));this.stream=SoundCore.timeline(seq,loop);this.next=this.stream.next();this.end=this.duration;this.state='playing';this.schedule();this.clock.postMessage(true);
 }
 schedule(){if(this.state!=='playing')return;const ctx=this.context,horizon=ctx.currentTime+.6;let steps=0;
  while(!this.next.done&&this.origin+this.next.value.time<horizon){if(++steps>50000)throw Error('This song has a loop without a time gap.');const e=this.next.value;
   if(e.type==='note'){const duration=this.durations.get(e.track+':'+e.start)??e.duration*(e.tempo||500000)/this.seq.division/1e6,spec=SoundCore.noteSpec(this.bank,e,duration),at=this.origin+e.time,elapsed=Math.max(0,ctx.currentTime+.01-at);if(spec&&at+spec.duration+.25>ctx.currentTime)this.voice(this.bank,spec,Math.max(ctx.currentTime+.01,at),elapsed);this.end=Math.max(this.end,e.time+duration+.25);}
   this.next=this.stream.next();
  }
  if(this.next.done&&this.current()>=this.end){this.stop();this.onended?.();}
 }
 current(){return this.state==='playing'?Math.max(0,this.context.currentTime-this.origin):this.position;}
 pause(){this.generation++;this.position=this.current();this.state='paused';this.clock.postMessage(false);this.silence();}
 stop(){this.generation++;this.state='stopped';this.position=0;this.clock.postMessage(false);this.silence();}
}
root.SoundPlayer=SoundPlayer;
})(globalThis);
