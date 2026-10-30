// Check projection invariants against the actual viewer helpers.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('tools/viewer/js/app.js', 'utf8');
const live = vm.createContext({});
vm.runInContext(source.split('//#PURE-START')[1].split('//#PURE-END')[0], live);
vm.runInContext(source.slice(source.indexOf('const mul='), source.indexOf('const cameraRotation=')), live);
const close = (a,b) => assert(Math.abs(a-b) < 1e-8, `${a} != ${b}`);
// Vertex-cache padding must not push visible geometry out of the fitted view.
const buffer=new ArrayBuffer(256),dv=new DataView(buffer);
dv.setUint32(0,0x0400003F);dv.setUint32(4,0x04000040);
dv.setUint32(8,0xBF000000);dv.setUint32(12,0x00020406);dv.setUint32(16,0xB8000000);
for(const [i,p] of [[-30000,-30000,-30000],[-10,-20,0],[10,-20,0],[0,20,0]].entries())
  p.forEach((v,k)=>dv.setInt16(64+i*16+k*2,v));
assert.deepStrictEqual(Array.from(live.parseDL(dv,0,{4:0}).viewBB),[-10,-20,0,10,20,0]);
assert.strictEqual(live.parseDL(dv,0,{4:0}).bb[0],-30000,'mesh transform bounds must retain loaded vertices');
for(const size of [1,100,30000]){
  const g=live.gallerySheet([{sym:'part',bb:[-size,-size,-size,size,size,size]}]);
  for(let k=0;k<3;k++)close(g.mx[k]-g.mn[k],1);
  assert(Number.isFinite(g.scale)&&g.scale>0);
}
for (const yaw of [0,.7,-1.9]) for (const pitch of [-1.5,0,.8,Math.PI/2]) for (const roll of [0,.6]) {
  const R = vm.runInContext(`mul(rz(${roll}),mul(rx(${pitch}),ry(${yaw})))`, live);
  // A pan must project to the requested screen delta at the target depth,
  // with no motion along the viewing direction, even with roll and pitch.
  const d = live.cameraPlaneDelta(R,500,600,70,-35);
  const q = [0,1,2].map(k=>d.reduce((sum,v,j)=>sum+R[j*4+k]*v,0));
  const scale = 2*500*Math.tan(.4)/600;
  close(q[0],70*scale);close(q[1],35*scale);close(q[2],0);
  for (const aspect of [.25,1,3]) {
    const lo=[-250,-30,-90],hi=[400,80,140],f=live.cameraFit(lo,hi,R,aspect);
    // All eight corners fit within 80% of the frustum on either axis.
    for(let i=0;i<8;i++) {
      const p=f.center.map((v,k)=>((i>>k)&1?hi[k]:lo[k])-v);
      const q=[0,1,2].map(k=>p.reduce((sum,v,j)=>sum+R[j*4+k]*v,0));
      const depth=f.distance-q[2];assert(depth>0);
      assert(Math.abs(q[0])/(depth*Math.tan(.4)*aspect)<=.80000001);
      assert(Math.abs(q[1])/(depth*Math.tan(.4))<=.80000001);
    }
  }
}
const point=live.cameraFit([0,0,0],[0,0,0],[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],1);
assert(point.distance>0 && point.radius>0);
console.log('Camera: rolled screen-plane pan and all-corner framing at 72 orientation/aspect combinations passed.');

// Run the live input handlers with a minimal canvas, without a browser or ROM.
vm.runInContext(`
var yaw=0,pit=0,roll=0,dist=500,ctr=[0,0,0],sceneRadius=200,sceneBounds=null;
var held=new Set(),sheet=true,name='fixture',moveButton='alt',partOffsets={};
var inspected=0,selected=0,rebuilt=0,buttons={},listeners={},captures=new Set();
var cv={clientHeight:600,clientWidth:800,style:{},focus(){},
  setPointerCapture(id){captures.add(id)},hasPointerCapture(id){return captures.has(id)},
  releasePointerCapture(id){captures.delete(id)},addEventListener(type,fn){listeners[type]=fn}};
var $=id=>buttons[id]||(buttons[id]={});
var cameraRotation=()=>mul(rz(roll),mul(rx(pit),ry(yaw)));
var need=()=>{},pickPart=()=>'part',hoverAt=()=>{},rebuild=()=>rebuilt++;
var inspectPartAt=()=>inspected++,selectMeshAt=()=>selected++;
var addEventListener=()=>{};
var ResizeObserver=class{observe(){}};
function event(x,y,button=0,extra={}){return {clientX:x,clientY:y,button,pointerId:1,pointerType:'mouse',preventDefault(){},...extra}}
function drag(button,extra={}){cv.onpointerdown(event(100,100,button,extra));cv.onpointermove(event(160,130,button,extra));cv.onpointerup(event(160,130,button,{...extra,type:'pointerup'}))}
`, live);
vm.runInContext(source.slice(source.indexOf('function frameCamera()'),source.indexOf('function updateAxes(')),live);
vm.runInContext(source.slice(source.indexOf('function cameraView('),source.indexOf('// Resizable sidebars')),live);
const run = code=>vm.runInContext(code,live);
run('drag(2)');assert(run('ctr[0]<0 && ctr[1]>0'));assert.strictEqual(run('Object.keys(partOffsets).length'),0);
run('ctr=[0,0,0];drag(0,{shiftKey:true})');assert(run('ctr[0]<0 && ctr[1]>0'));
run('ctr=[0,0,0];drag(0,{ctrlKey:true})');assert(run('ctr[0]<0 && ctr[1]>0'));
run('ctr=[0,0,0];drag(0,{altKey:true})');assert(run('partOffsets.fixture.part[0]>0 && ctr.every(v=>v===0)'));
run('drag(1)');assert(run('dist>500'));
run('drag(0)');assert(run('yaw<0 && pit>0'));
run('var oldYaw=yaw;cv.onpointerdown(event(100,100));cv.onpointermove(event(102,101));cv.onpointerup(event(102,101,0,{type:"pointerup"}))');
assert.strictEqual(run('inspected'),1);assert(run('yaw===oldYaw'));
run('cv.onpointerdown(event(100,100));cv.onpointercancel(event(100,100,0,{type:"pointercancel"}))');assert.strictEqual(run('inspected'),1);
run(`cv.onpointerdown(event(100,100,0,{pointerType:'touch'}));
cv.onpointerdown(event(200,100,0,{pointerId:2,pointerType:'touch'}));
var oldDistance=dist;
cv.onpointermove(event(250,100,0,{pointerId:2,pointerType:'touch'}));`);
assert(run('dist<oldDistance'));
run('cv.onpointercancel(event(100,100));cv.onpointercancel(event(250,100,0,{pointerId:2}))');
run('for(let i=0;i<100;i++)listeners.wheel({preventDefault(){},deltaY:-1000,deltaMode:0})');close(run('dist'),4);
run('for(let i=0;i<100;i++)listeners.wheel({preventDefault(){},deltaY:1000,deltaMode:1})');close(run('dist'),20000);
run('buttons["camera-top"].onclick()');close(run('pit'),Math.PI/2);close(run('roll'),0);
console.log('Live input: right/modified pan, Alt part move, middle zoom, orbit, click threshold, cancel, pinch, zoom limits and presets passed.');
