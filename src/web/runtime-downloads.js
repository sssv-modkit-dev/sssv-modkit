/* Explicit consent before a runtime worker or player can make any large requests. */
(()=>{
'use strict';
const granted=new Set(),pending=new Map();let queue=Promise.resolve();
const read=(store,key)=>{try{return window[store].getItem(key)==='yes';}catch(_){return false;}};
const write=(store,key)=>{try{window[store].setItem(key,'yes');}catch(_){}};
function request(id,reason=''){
 const spec=window.SSSVRuntimeSizes?.[id];if(!spec)return Promise.reject(Error('Runtime download sizes are unavailable. Reload this page.'));
 const key='sssv-runtime-consent-v1:'+id+':'+spec.bytes;
 if(granted.has(key)||read('sessionStorage',key)||read('localStorage',key))return Promise.resolve(true);
 if(pending.has(key))return pending.get(key);
 const job=queue.then(()=>new Promise(resolve=>{
  const previous=document.activeElement,wasLoading=window.LoadProgress?.isLoading();window.LoadProgress?.suspend();
  const overlay=document.createElement('section');overlay.id='runtime-consent';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','runtime-consent-title');
  const card=document.createElement('div'),title=document.createElement('h2');title.id='runtime-consent-title';title.textContent='Download '+spec.name+'?';
  const about=(spec.bytes/1e6).toFixed(1),text=document.createElement('p');text.textContent=`About ${about} MB from this same site. It runs on your own device. Nothing is uploaded. Your browser caches it, so later uses normally need no download; clearing the cache can download it again.`;
  const why=document.createElement('p');why.textContent=reason;
  const hint=document.createElement('p'),connection=navigator.connection;hint.textContent='You may be on mobile data.';hint.hidden=!(connection?.saveData||/^(slow-2g|2g|3g)$/.test(connection?.effectiveType)||connection?.type==='cellular');
  const label=document.createElement('label'),remember=document.createElement('input');remember.type='checkbox';remember.id='runtime-remember';label.append(remember,document.createTextNode(" Don't ask again"));
  const yes=document.createElement('button');yes.id='runtime-download';yes.type='button';yes.textContent=`Download (about ${about} MB)`;
  const no=document.createElement('button');no.id='runtime-not-now';no.type='button';no.textContent='Not now';
  function finish(ok){if(ok){granted.add(key);write('sessionStorage',key);if(remember.checked)write('localStorage',key);}overlay.remove();if(wasLoading)window.LoadProgress?.resume();if(previous?.isConnected)previous.focus();resolve(ok);}
  yes.onclick=()=>finish(true);no.onclick=()=>finish(false);
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false);}if(e.key==='Tab'){e.preventDefault();const focus=[remember,yes,no],i=focus.indexOf(document.activeElement);focus[(i+(e.shiftKey?-1:1)+focus.length)%focus.length].focus();}});
  card.append(title,text,why,hint,label,yes,no);overlay.append(card);document.body.append(overlay);yes.focus();
 }));
 pending.set(key,job);queue=job.catch(()=>{});job.then(()=>pending.delete(key),()=>pending.delete(key));return job;
}
window.SSSVDownloads={request};
})();
