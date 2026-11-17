const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
 constructor(){this.hidden=false;this.children=[];this.attrs={};this.isConnected=true;this.style={setProperty(){}};this.classList={add(){},remove(){}};}
 append(...v){this.children.push(...v);}setAttribute(k,v){this.attrs[k]=v;}addEventListener(){}focus(){}remove(){}select(){}
 querySelectorAll(){return this.children.flatMap(c=>[c,...(c.querySelectorAll?.()||[])]).filter(c=>c.tag==='button'&&!c.hidden);}
}
let time=0,interval,events={},docEvents={},copied='';const body=new Element();
const document={body,activeElement:new Element(),createElement:tag=>Object.assign(new Element(),{tag}),addEventListener:(k,f)=>docEvents[k]=f};
const window={addEventListener:(k,f)=>events[k]=f,removeEventListener:k=>delete events[k]};
const context={window,document,navigator:{userAgent:'test phone',hardwareConcurrency:2,clipboard:{writeText:async t=>copied=t}},performance:{now:()=>time},Date,
 setTimeout:fn=>{fn();return 1;},clearTimeout(){},setInterval:fn=>{interval=fn;return 1;},clearInterval(){interval=null;},location:{reload(){}},matchMedia:()=>({matches:true}),console};
const file=fs.existsSync('src/web/load-progress.js')?'src/web/load-progress.js':'core/src/web/load-progress.js';
context.requestAnimationFrame=fn=>fn();vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
(async()=>{
 const api=window.LoadProgress;docEvents.change({target:{id:'level-rom',files:[{name:'secret-ROM.z64',size:8388608,bytes:'PRIVATE_BYTES_CANARY'}]}});await api.start(['Opening levels']);
 assert.equal(typeof interval,'function','loading must arm a watchdog');
 time=21000;interval();
 const all=()=>body.children.flatMap(c=>[c,...c.querySelectorAll()]);
 const card=body.children[0].children[0],watch=card.children.find(c=>c.id==='load-watchdog');
 assert.equal(watch.hidden,false);assert.match(watch.children[0].textContent,/Opening levels.*21 s/);
 await watch.children[1].onclick();const details=JSON.parse(copied);assert.equal(details.stage,'Opening levels');
 assert.equal(details.romSize,8388608);assert.ok(!/buffer|filename|\.z64|rom bytes|PRIVATE_BYTES_CANARY/i.test(copied));
 const event={reason:Error('secret-ROM.z64'),preventDefault(){}};events.unhandledrejection(event);
 assert.equal(card.children[2].hidden,true,'rejection must end in fail');assert.equal(interval,null);
 await watch.children[1].onclick();assert.ok(!copied.includes('secret-ROM'));assert.match(copied,/unhandledrejection/);
 await api.done();assert.equal(body.children[0].hidden,false,'late completion must not hide failure');
 await api.start(['Next load']);time+=21000;interval();await api.step('Next stage',.8);assert.equal(watch.hidden,true);
 api.fail('Stopped');console.log('Watchdog, private diagnostics, rejection failure and late completion checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
