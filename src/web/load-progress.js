/* Pack loading UI. Diagnostics contain stage metadata only, never source data or file names. */
(()=>{
'use strict';
let panel,bar,label,close,watch,note,copy,cancel,previous,timer,ticker,generation=0;
let loading=false,failed=false,paused=false,stage='',last=0,started=0,romSize=null,log=[],errors=[],fractionNow=null;
const now=()=>performance.now();
// A macrotask also runs in background tabs, where requestAnimationFrame may stop entirely.
const paint=()=>new Promise(resolve=>setTimeout(resolve,0));
const clean=text=>String(text).replace(/\S+\.(?:z64|v64|n64|rom)\b/gi,'[ROM]').slice(0,180);
function trap(e){
 if(e.key==='Escape'&&!close.hidden){e.preventDefault();hide();return;}
 if(e.key!=='Tab')return;
 const buttons=[...panel.querySelectorAll('button')].filter(b=>!b.hidden&&(!watch.hidden||!watch.contains(b)));
 const i=buttons.indexOf(document.activeElement),next=buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length];
 e.preventDefault();(next||panel).focus();
}
function ensure(){
 if(panel)return;
 panel=document.createElement('section');panel.id='load-progress';panel.hidden=true;panel.tabIndex=-1;
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','load-progress-title');
 const card=document.createElement('div'),title=document.createElement('h2');title.id='load-progress-title';title.textContent='Loading your ROM';
 label=document.createElement('p');label.id='load-progress-label';label.setAttribute('aria-live','polite');label.setAttribute('aria-atomic','true');
 bar=document.createElement('div');bar.className='load-progress-bar';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','ROM loading progress');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');
 close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=hide;
 watch=document.createElement('div');watch.id='load-watchdog';watch.hidden=true;
 note=document.createElement('p');note.setAttribute('role','status');
 copy=document.createElement('button');copy.type='button';copy.textContent='Copy details';copy.onclick=async()=>{
  const details=JSON.stringify({stage:clean(stage),elapsedSeconds:Math.floor((now()-started)/1000),
   userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency??null,deviceMemory:navigator.deviceMemory??null,
   romSize,stages:log,errors},null,2);
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(details);else{
   const text=document.createElement('textarea');text.value=details;panel.append(text);text.select();
   const ok=document.execCommand('copy');text.remove();if(!ok)throw Error('Copy unavailable');
  }copy.textContent='Copied';}catch(_){copy.textContent='Copy unavailable in this browser';}
 };
 cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel and reload';cancel.onclick=()=>{window.SSSVBuilder?.terminate();location.reload();};
 watch.append(note,copy,cancel);card.append(title,label,bar,close,watch);panel.append(card);document.body.append(panel);panel.addEventListener('keydown',trap);
}
function stop(){clearInterval(ticker);ticker=null;window.removeEventListener('unhandledrejection',rejection);window.removeEventListener('error',exception);}
function hide(){stop();loading=false;clearTimeout(timer);panel.hidden=true;panel.classList.remove('finishing');if(previous?.isConnected)previous.focus();}
function check(){if(!loading||paused)return;const seconds=Math.floor((now()-last)/1000);if(seconds<20)return;watch.hidden=false;note.textContent=`${stage} · ${seconds} s without a new step. Still working... large files can take a minute on a phone`;}
function rejection(e){if(!loading)return;errors.push({type:'unhandledrejection'});fail('Loading stopped after an unexpected error. Copy details or reload to try again.');}
function exception(e){if(!loading)return;errors.push({type:'error'});fail('Loading stopped after a browser error. Copy details or reload to try again.');}
function start(steps=[]){
 generation++;ensure();stop();clearTimeout(timer);if(panel.hidden)previous=document.activeElement;
 if(!loading){started=now();log=[];errors=[];}loading=true;failed=false;paused=false;
 panel.hidden=false;panel.classList.remove('finishing');close.hidden=true;bar.hidden=false;watch.hidden=true;fractionNow=null;copy.textContent='Copy details';panel.focus();
 window.addEventListener('unhandledrejection',rejection);window.addEventListener('error',exception);ticker=setInterval(check,1000);
 return step(steps[0]||'Checking your ROM',0);
}
function step(text,fraction){
 ensure();if(failed)return paint();label.textContent=text;
 if(stage!==text||!log.length||(Number.isFinite(fraction)&&fraction!==fractionNow)){stage=clean(text);last=now();log.push({stage,seconds:Math.floor((last-started)/1000)});if(log.length>180)log.shift();watch.hidden=true;}
 if(Number.isFinite(fraction))fractionNow=fraction;
 if(Number.isFinite(fraction)){const value=Math.round(Math.max(0,Math.min(1,fraction))*100);bar.setAttribute('aria-valuenow',String(value));bar.style.setProperty('--progress',value+'%');}
 return paint();
}
async function done(){if(!panel||panel.hidden||failed)return;const current=generation;await step('Ready',1);if(current!==generation||failed||panel.hidden)return;stop();loading=false;panel.classList.add('finishing');timer=setTimeout(hide,180);}
function fail(message){generation++;ensure();stop();loading=false;failed=true;if(!errors.length)errors.push({type:'load-failure'});clearTimeout(timer);panel.hidden=false;panel.classList.remove('finishing');label.textContent=message||'Could not load your ROM. Try again.';bar.hidden=true;close.hidden=false;watch.hidden=false;note.textContent='Loading stopped at '+stage+'. Copy details or reload to try again.';close.focus();}
document.addEventListener('change',event=>{const file=event.target?.files?.[0];if(file&&/^(session-rom-file|level-rom|source-file|rom|b-rom)$/.test(event.target.id))romSize=file.size;},true);
window.LoadProgress={start,step,done,fail,suspend(){paused=true;},resume(){paused=false;last=now();},isLoading:()=>loading};
})();
