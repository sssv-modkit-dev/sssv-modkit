/* Shared, optional ROM loading UI. Fractions describe stages, not elapsed time. */
(()=>{
'use strict';
let panel,bar,label,close,previous,timer,generation=0;
const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
function ensure(){
 if(panel)return;
 panel=document.createElement('section');panel.id='load-progress';panel.hidden=true;
 panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','load-progress-title');panel.tabIndex=-1;
 const card=document.createElement('div'),title=document.createElement('h2');title.id='load-progress-title';title.textContent='Loading your ROM';
 label=document.createElement('p');label.id='load-progress-label';label.setAttribute('aria-live','polite');label.setAttribute('aria-atomic','true');
 bar=document.createElement('div');bar.className='load-progress-bar';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','ROM loading progress');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');
 close=document.createElement('button');close.type='button';close.textContent='Close';close.onclick=hide;
 card.append(title,label,bar,close);panel.append(card);document.body.append(panel);
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'&&!close.hidden){e.preventDefault();hide();}if(e.key==='Tab'){e.preventDefault();(close.hidden?panel:close).focus();}});
}
function hide(){clearTimeout(timer);panel.hidden=true;panel.classList.remove('finishing');if(previous?.isConnected)previous.focus();}
function start(steps=[]){generation++;ensure();clearTimeout(timer);if(panel.hidden)previous=document.activeElement;panel.hidden=false;panel.classList.remove('finishing');close.hidden=true;bar.hidden=false;panel.focus();return step(steps[0]||'Checking your ROM',0);}
function step(text,fraction){ensure();label.textContent=text;if(Number.isFinite(fraction)){const value=Math.round(Math.max(0,Math.min(1,fraction))*100);bar.setAttribute('aria-valuenow',String(value));bar.style.setProperty('--progress',value+'%');}return paint();}
async function done(){if(!panel||panel.hidden)return;const current=generation;await step('Ready',1);if(current!==generation||panel.hidden||!close.hidden)return;panel.classList.add('finishing');timer=setTimeout(hide,matchMedia('(prefers-reduced-motion: reduce)').matches?0:180);}
function fail(message){generation++;ensure();clearTimeout(timer);panel.hidden=false;panel.classList.remove('finishing');label.textContent=message||'Could not load your ROM. Try again.';bar.hidden=true;close.hidden=false;close.focus();}
window.LoadProgress={start,step,done,fail};
})();
