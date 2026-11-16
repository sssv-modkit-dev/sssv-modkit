const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.style={setProperty(){}};this.attributes={};this.value='';this.disabled=false;this.clientWidth=320;this.parentElement={clientWidth:320};this.pixels=new Uint8ClampedArray(272*136*4);}
 append(...nodes){this.children.push(...nodes);if(this.tagName==='select'&&!this.value)this.value=String(nodes[0].value);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k];}
 get firstChild(){return this.children[0];}
 get options(){return this.children;}
 getContext(){const e=this;return {getImageData(){return {data:e.pixels.slice()};},putImageData(image){e.pixels=image.data.slice();},drawImage(){},clearRect(){}};}
 focus(){}
}
const html=fs.readFileSync('src/web/textures.html','utf8');
for(const id of html.matchAll(/id="([^"]+)"/g))elements.set(id[1],new Element(id[1]==='terrain-level'?'select':'div'));
elements.get('tile-zoom').append(new Element());
const document={getElementById:id=>elements.get(id),createElement:tag=>new Element(tag),body:{dataset:{page:'terrain'}},querySelectorAll:()=>[]};
const context=vm.createContext({document,window:{addEventListener(){},dispatchEvent(){}},Event:class{},matchMedia:()=>({matches:false}),structuredClone,console,Uint8ClampedArray,ImageData:class{constructor(data){this.data=data;}},StoryROM:{hasChanges:()=>false,validate(){}},setTimeout});
vm.runInContext(fs.readFileSync('src/web/story.js','utf8'),context);
(async()=>{
 await vm.runInContext(`localData={banks:{}};project={original:localData,sheet(){const p=new Uint8ClampedArray(272*136*4);for(let i=0;i<32;i++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){const o=4*((Math.floor(i/8)*34+y)*272+i%8*34+x);p[o]=i;p[o+3]=255;}return p;}};terrain()`,context);
 const groups=elements.get('tile-groups').children;
 assert.equal(groups.length,2);assert.match(groups[0].children[0].textContent,/Shared by every level/);assert.equal(groups[0].className,'tile-group');
 const buttons=groups.flatMap(g=>g.children[1].children);
 assert.equal(buttons.length,32);buttons.forEach((b,i)=>assert.match(b.children[1].textContent,new RegExp('Tile '+i+' /')));
 buttons[23].onclick();assert.equal(elements.get('tile-number').value,23);assert.match(elements.get('tile-uses').textContent,/Level 2, tile 23/);assert.doesNotMatch(elements.get('tile-uses').textContent,/tile 22/);
 buttons[23].onkeydown({key:'ArrowRight',preventDefault(){}});assert.equal(elements.get('tile-number').value,24);
 elements.get('tile-number').value='7';elements.get('tile-number').onchange();assert.equal(buttons[7].getAttribute('aria-pressed'),'true');
 for(const path of ['src/web/textures.html','src/web/dialogue.html','src/web/story.js'])assert.doesNotMatch(fs.readFileSync(path,'utf8'),/bridge/i);
 console.log('Texture labels, shared box, exact pixel matches, grid click, arrows, number selection and bridge removal passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
