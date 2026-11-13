const assert=require('assert'),fs=require('fs'),vm=require('vm');
const selection=require('../src/levels/selection.js');
// Without a pack table the core names objects by type number only.
assert.equal(selection.name('animals',33),'Animal 33');
assert.equal(selection.name('props',34),'Prop 34');
assert.equal(selection.category('props',56),'other');
// A pack supplies names and groups through define().
selection.define({animals:{33:'Goat'},props:{34:'Crystal',41:'Lever'},portals:[56],collectibles:[34],switches:[41]});
assert.equal(selection.name('animals',33),'Goat');
assert.equal(selection.name('props',34),'Crystal');
assert.equal(selection.name('props',999),'Prop 999');
assert.equal(selection.category('animals',33),'animals');
assert.equal(selection.category('props',56),'portals');
assert.equal(selection.category('props',34),'collectibles');
assert.equal(selection.category('props',41),'switches');
assert.equal(selection.category('props',999),'other');
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
assert.deepEqual(selection.project([0,0,0],identity,100,100),[50,50]);
assert.equal(selection.project([0,0,2],identity,100,100),null);
assert(selection.inRectangle([50,50],[60,60],[40,40]));
assert(!selection.inRectangle([70,50],[60,60],[40,40]));
// Footprint picking: props are drawn as yawed boxes, so pick and box-select against the same box.
const ortho=[.01,0,0,0,0,.01,0,0,0,0,.001,0,0,0,0,1];
const corners=selection.corners([34,0,0,0,0,0],[40,20,30]);
assert.equal(corners.length,8);
assert.deepEqual(corners[0],[-20,-10,0]);assert.deepEqual(corners[6],[20,10,30]);
const tiny=selection.corners([34,0,0,0,0,0],[0,0,0]);assert.deepEqual(tiny[6],[4,4,8]);
const turned=selection.corners([34,0,0,0,90,0],[40,20,30]);assert(Math.abs(turned[0][0]-10)<1e-9&&Math.abs(turned[0][1]+20)<1e-9);
const rect=selection.screenRect(corners,ortho,100,100);
assert.deepEqual(rect.map(v=>Math.round(v*100)/100),[40,45,60,55]);
assert.equal(selection.screenRect([[0,0,5000]],ortho,100,100),null);
const items=[{key:'big',origin:[50,50],rect:[0,0,100,100]},{key:'small',origin:[80,80],rect:[70,70,90,90]},{key:'animal',origin:[20,20],rect:null}];
assert.equal(selection.pickAt(items,[75,75]).key,'small');
assert.equal(selection.pickAt(items,[10,10]).key,'big');
assert.equal(selection.pickAt(items.slice(1),[25,22]).key,'animal');
assert.equal(selection.pickAt(items.slice(1),[50,50]),null);
// Keyboard nudges follow the world axis nearest the camera's view direction.
assert.deepEqual(selection.nudge('ArrowUp',0,8),[8,0,0]);
assert.deepEqual(selection.nudge('ArrowRight',0,8),[0,-8,0]);
assert.deepEqual(selection.nudge('ArrowUp',Math.PI/2+.3,64),[0,64,0]);
assert.deepEqual(selection.nudge('ArrowLeft',Math.PI,8),[0,-8,0]);
assert.deepEqual(selection.nudge('PageDown',1,8),[0,0,-8]);
assert.equal(selection.nudge('a',0,8),null);
assert(selection.hitsRect(items[1],[85,85],[200,200]));
assert(!selection.hitsRect(items[1],[91,91],[200,200]));
assert(selection.hitsRect(items[2],[10,10],[30,30]));
assert(!selection.hitsRect(items[2],[30,30],[40,40]));
assert(!selection.hitsRect({key:'off',origin:null,rect:null},[0,0],[100,100]));
const group=[[34,100,200,300,0,0],[34,120,180,350,45,0]],before=structuredClone(group);
const moved=selection.translate(group,[64,-10,20]);
assert.deepEqual(group,before);
assert.deepEqual(moved.map(v=>v.slice(1,4)),[[164,190,320],[184,170,370]]);
assert.throws(()=>selection.translate(group,[32767,0,0]));
assert.throws(()=>selection.translate(group,[.5,0,0]));
// Object drag follows the cursor (regression: the old move reused the camera-pan formula and went the opposite way).
// Same perspective/look-at construction as runtime.js matrix().
function viewMatrix(t,yaw,pitch,d,w,h){const a=w/h,f=1/Math.tan(.4),n=d/100,fa=d*20,pr=[f/a,0,0,0,0,f,0,0,0,0,(fa+n)/(n-fa),-1,0,0,2*fa*n/(n-fa),0];
 const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),e=[t[0]+d*cp*cy,t[1]+d*cp*sy,t[2]+d*sp];
 let z=[e[0]-t[0],e[1]-t[1],e[2]-t[2]];const zl=Math.hypot(...z);z=z.map(v=>v/zl);let x=[-z[1],z[0],0];const xl=Math.hypot(...x);x=x.map(v=>v/xl);
 const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]],v=[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]),-(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]),-(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]),1];
 const m=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=pr[k*4+r]*v[c*4+k];return m;}
for(const [yaw,pitch] of [[0,.6],[1.1,.4],[Math.PI,1.2],[-2.3,.25]]){
 const W=1280,H=800,m=viewMatrix([2000,3000,100],yaw,pitch,4000,W,H),P=[2100,2950,300],D=[180,-70];
 const inv=selection.invert(m),id=[0,1,2,3].flatMap(c=>[0,1,2,3].map(r=>[0,1,2,3].reduce((s,k)=>s+m[k*4+r]*inv[c*4+k],0)));
 id.forEach((v,i)=>assert(Math.abs(v-(i%5===0?1:0))<1e-6));
 const start=selection.project(P,m,W,H),now=selection.project([P[0]+D[0],P[1]+D[1],P[2]],m,W,H);
 const got=selection.dragDelta(m,W,H,start,now,P[2]);
 assert(got&&Math.abs(got[0]-D[0])<.5&&Math.abs(got[1]-D[1])<.5,`drag ${yaw}/${pitch}: ${got}`);
 // Fallback direction: a rightward/downward screen drag moves the object right/down on screen.
 for(const [dx,dy] of [[40,0],[0,40]]){const s=selection.screenDelta(dx,dy,yaw,2),q=selection.project([P[0]+s[0],P[1]+s[1],P[2]],m,W,H);
  assert(dx?q[0]>start[0]:q[1]>start[1],`fallback ${dx},${dy} at yaw ${yaw}`);}
}
assert.equal(selection.groundPoint(viewMatrix([0,0,0],0,.5,1000,100,100),100,100,[50,0],5000),null);
const source=fs.readFileSync(require.resolve('../src/levels/editor.js'),'utf8').split('let edRecords=')[0];
const record='00000000000000000000000000000000000000000000',stock={'1':{props:[record],animals:[]}};
const ctx={Uint8Array,DataView,structuredClone,EDITOR_STOCK:stock,EDITOR_SHA1:'synthetic'};vm.createContext(ctx);vm.runInContext(source+';this.api=EditorRecords;',ctx);
const edited=ctx.api.update(record,'props',[34,100,200,300,90,0]);
assert.deepEqual(Array.from(ctx.api.values(edited,'props')),[34,100,200,300,90,0]);
assert.throws(()=>ctx.api.validate({format:'scene-edits-v1',version:1,source_sha1:'wrong',levels:{}}));
assert.throws(()=>ctx.api.validate({format:'scene-edits-v1',version:1,source_sha1:'synthetic',levels:{'1':{props:{delete:[0]}}}}));
console.log('Cursor-following object drag, named categories, rectangle projection, footprint picking, spacing-preserving atomic group moves and record validation passed.');

// Appended deletion physically removes records while preserving original indices; atomic rejection of mixed selection.
const originals={props:['original0','original1'],animals:['animal0']};
const records={props:[...originals.props,'addedA','addedB','addedC'],animals:[...originals.animals,'addedAnimal']};
assert.throws(()=>selection.removeAppended(records,originals,['props:0','props:2']));
assert.equal(records.props.length,5);
selection.removeAppended(records,originals,['props:2','props:4','animals:1']);
assert.deepEqual(records,{props:['original0','original1','addedB'],animals:['animal0']});
assert.equal(selection.pickAt(items,[9999,9999]),null);
assert(selection.hitsRect(items[0],[100,100],[0,0]));

// Actual terrain ray placement: nearest surface wins, slope height follows the mesh, sky misses.
const view=viewMatrix([2000,3000,0],.6,.8,5000,1280,800);
const terrain=[1500,2500,0,2500,2500,0,2500,3500,200,1500,2500,0,2500,3500,200,1500,3500,200];
const target=[2100,3100,120],pixel=selection.project(target,view,1280,800);
const hit=selection.terrainPoint(view,1280,800,pixel,terrain);
assert(hit&&Math.hypot(...hit.map((v,i)=>v-target[i]))<.1);
assert.equal(selection.terrainPoint(view,1280,800,[-10000,-10000],terrain),null);
const under=[...terrain.map((v,i)=>i%3===2?v-100:v),...terrain];
assert(Math.abs(selection.terrainPoint(view,1280,800,pixel,under)[2]-120)<.1);
// Free-look pivots the direction around a fixed eye, whereas orbit retains the target.
const free={t:[2000,3000,100],d:5000,yaw:.6,pitch:.8},eye=selection.cameraEye(free);
selection.cameraLook(free,80,-30,true);
assert(Math.hypot(...selection.cameraEye(free).map((v,i)=>v-eye[i]))<1e-8);
const orbit={t:[2000,3000,100],d:5000,yaw:.6,pitch:.8},targetBefore=orbit.t.slice();
selection.cameraLook(orbit,80,-30,false);assert.deepEqual(orbit.t,targetBefore);
const moving={t:[0,0,0],d:1000,yaw:0,pitch:0};selection.cameraTravel(moving,1,1,1,100);assert.deepEqual(moving.t,[-100,100,100]);
console.log('Terrain slope/nearest-hit placement and eye-preserving freecam checks passed.');

const look={t:[0,0,0],d:1000,yaw:0,pitch:0};selection.cameraLook(look,100,100,true);
assert(look.yaw<0&&look.pitch>0,'mouse right/down looks right/down in freecam');
