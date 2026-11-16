const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
class Element{
 constructor(){this.hidden=false;this.attrs={};this.children=[];this.isConnected=true;this.classList={add(){},remove(){}};this.style={setProperty:(k,v)=>this.attrs[k]=v};}
 setAttribute(k,v){this.attrs[k]=v;}append(...v){this.children.push(...v);}focus(){document.activeElement=this;}addEventListener(){}
}
const document={createElement:()=>new Element(),body:new Element(),activeElement:new Element()};
const context={document,window:{},requestAnimationFrame:fn=>setTimeout(fn,0),setTimeout,clearTimeout,matchMedia:()=>({matches:true})};
vm.runInNewContext(fs.readFileSync('src/web/load-progress.js','utf8'),context);
(async()=>{const api=context.window.LoadProgress;const original=document.activeElement;
 await api.start(['Checking your ROM']);const panel=document.body.children[0],card=panel.children[0],label=card.children[1],bar=card.children[2],close=card.children[3];
 assert.equal(panel.hidden,false);assert.equal(close.hidden,true);assert.equal(bar.attrs.role,'progressbar');
 await api.step('Reading animals',.5);assert.equal(label.textContent,'Reading animals');assert.equal(bar.attrs['aria-valuenow'],'50');
 await api.done();await new Promise(r=>setTimeout(r,10));assert.equal(panel.hidden,true);assert.equal(document.activeElement,original);
 await api.start();api.fail('Could not read this ROM.');assert.equal(panel.hidden,false);assert.equal(label.textContent,'Could not read this ROM.');assert.equal(close.hidden,false);assert.equal(document.activeElement,close);close.onclick();assert.equal(panel.hidden,true);
 await api.start();const finishing=api.done();await api.start(['Reading again']);await finishing;await new Promise(r=>setTimeout(r,10));assert.equal(panel.hidden,false);api.fail('Stopped');close.onclick();
 console.log('Load progress API passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
