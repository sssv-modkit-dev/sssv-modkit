const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const app=fs.readFileSync('src/viewer/js/app.js','utf8');
const project=app.split('//#PROJECT-START')[1].split('//#PROJECT-END')[0];
const room=app.slice(app.indexOf('function referenceRoomLines('),app.indexOf('function drawReferenceGrid('));
const context=vm.createContext({});vm.runInContext(project+'\n'+room,context);
const state={map:{AABBCCFF:'010203FF'},mesh:{},wordEdits:{4100:{word_rom:4100,expect:'AABBCCFF',new:'FF00FFFF'}},partColors:{head:{AABBCCFF:'112233FF'}}};
const config=JSON.parse(JSON.stringify(context.stateConfig('test',state)));
assert.deepEqual(config.words,[{word_rom:4100,expect:'AABBCCFF',new:'FF00FFFF'}]);
assert.deepEqual(config.skip_recolor_words,[4100],'explicit part words override animal-wide recolour without conflicts');
assert.equal(context.configChanged(config),true);
assert.equal(context.configChanged(context.stateConfig('test',{partColors:state.partColors})),true,'local demo part colours count as edits');
assert.equal(context.configChanged(context.stateConfig('test',{})),false);
const lines=context.referenceRoomLines([-10,0,-5],[10,30,5],1);assert.equal(lines.length%6,0);assert.ok(lines.every(Number.isFinite));
const xs=lines.filter((v,i)=>i%3===0),ys=lines.filter((v,i)=>i%3===1),zs=lines.filter((v,i)=>i%3===2);
assert.ok(Math.max(...xs)-Math.min(...xs)<=45.001);assert.ok(Math.max(...zs)-Math.min(...zs)<=45.001);
{const pts=[];for(let i=0;i<lines.length;i+=3)pts.push(lines.slice(i,i+3));const [x0,x1,y0,y1,z0,z1]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys),Math.min(...zs),Math.max(...zs)];
 for(const [k,v] of [[0,x0],[0,x1],[1,y0],[1,y1],[2,z0],[2,z1]])assert.ok(pts.filter(p=>Math.abs(p[k]-v)<1e-6).length>=40,'closed skybox room: every face is gridded');}
{const pick=name=>{const i=app.indexOf(name);return app.slice(i,app.indexOf(String.fromCharCode(10),i))};const m=vm.createContext({});vm.runInContext([pick('const mul='),pick('const rx='),pick('const ry='),pick('function starOffset(')].join(String.fromCharCode(10))+';this.f={mul,rx,ry,starOffset}',m);const {mul,rx,ry,starOffset}=m.f,H=800,ppr=H/(2*Math.tan(.4));
 const screen=(yaw,pit,d)=>{const R=mul(rx(pit),ry(yaw)),c=[0,1,2].map(i=>R[i]*d[0]+R[4+i]*d[1]+R[8+i]*d[2]);return [c[0]/-c[2]*ppr,-c[1]/-c[2]*ppr]};
 const a=[.4,.3],b=[.41,.31],R=mul(rx(a[1]),ry(a[0])),d=[-R[2],-R[6],-R[10]],sa=screen(...a,d),sb=screen(...b,d),oa=starOffset(...a,H),ob=starOffset(...b,H);
 for(const i of [0,1]){const want=sb[i]-sa[i],got=ob[i]-oa[i];assert.ok(Math.sign(want)===Math.sign(got)&&Math.abs(got-want)<Math.abs(want)*.1,'starfield axis '+i+' follows the view: '+want+' vs '+got)}}
assert.ok(Math.min(...ys)<0&&Math.max(...ys)>30,'finite floor and corner walls frame the model');
console.log('Workbench part-word export, local colours and closed skybox room grid and starfield parallax pass.');

const expanded=context.referenceRoomLines([-10,0,-5],[10,30,5]);assert.ok(Math.max(...expanded.filter((v,i)=>i%3===0))>Math.max(...xs));assert.ok(Math.max(...expanded.filter((v,i)=>i%3===1))>Math.max(...ys));
