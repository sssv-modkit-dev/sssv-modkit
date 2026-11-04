// Independently authored procedural geometry. No game models, topology, or tables.
// All dimensions and designs below are original contributions under LICENSE (CC0).
const PARTS_DEMOS=(()=>{
  function part(s,center,size,rgba,round=false){
    const rings=round?8:4,levels=4,verts=[];
    for(let j=0;j<=levels;j++)for(let i=0;i<rings;i++){
      const a=2*Math.PI*i/rings+(round?0:Math.PI/4);
      verts.push([Math.round(center[0]+Math.cos(a)*size[0]*(round?1:Math.SQRT2)/2),
        Math.round(center[1]+(j/levels-.5)*size[1]),
        Math.round(center[2]+Math.sin(a)*size[2]*(round?1:Math.SQRT2)/2)]);
    }
    const tris=[],tri=(a,b,c)=>tris.push({v:[verts[a],verts[b],verts[c]],c:0});
    for(let j=0;j<levels;j++)for(let i=0;i<rings;i++){
      const a=j*rings+i,b=j*rings+(i+1)%rings;
      tri(a,b,a+rings);tri(b,b+rings,a+rings);
    }
    for(let i=1;i<rings-1;i++){tri(0,i+1,i);tri(levels*rings,levels*rings+i,levels*rings+i+1)}
    const bb=[0,1,2].map(k=>Math.min(...verts.map(v=>v[k]))).concat([0,1,2].map(k=>Math.max(...verts.map(v=>v[k]))));
    return {s,r:0,j:'demo',v:[],t:[],demo:{cols:[{rgba,rom:0}],tris,bb}};
  }
  const models={};
  let p=[];
  const add=(...a)=>p.push(part(...a));
  add('body',[0,10,0],[92,76,58],'F4B860FF');
  add('head',[0,77,0],[70,48,60],'5ED3C6FF');
  for(const x of [-1,1]){
    add(x<0?'left-eye':'right-eye',[x*17,80,32],[12,13,8],'26364AFF');
    add(x<0?'left-arm':'right-arm',[x*65,12,0],[25,72,26],'5ED3C6FF',true);
    add(x<0?'left-leg':'right-leg',[x*27,-56,0],[22,60,24],'7C91CFFF');
    add(x<0?'left-foot':'right-foot',[x*27,-89,10],[33,16,46],'26364AFF');
  }
  add('antenna',[0,119,0],[8,40,8],'7C91CFFF',true);
  add('beacon',[0,143,0],[22,15,22],'ED6C86FF',true);
  add('wind-up-key',[0,18,-47],[65,17,15],'ED6C86FF');
  models['wind-up robot']={b:{},p,s:[]};p=[];
  for(let i=0;i<5;i++){
    add('segment-'+(i+1),[0,0,(i-2)*37],[55-i*4,43,34],i%2?'A7D579FF':'5ED3C6FF',true);
    for(const x of [-1,1])add((x<0?'left':'right')+'-leg-'+(i+1),[x*38,-25,(i-2)*37],[34,13,15],'7C91CFFF');
  }
  for(const x of [-1,1])add((x<0?'left':'right')+'-eye',[x*13,17,91],[11,20,13],'26364AFF',true);
  models['ribbon crawler']={b:{},p,s:[]};p=[];
  add('chassis',[0,0,0],[105,30,140],'7C91CFFF');
  add('cabin',[0,38,12],[69,48,65],'F4B860FF');
  add('visor',[0,42,47],[55,24,8],'26364AFF');
  for(const x of [-1,1])for(const z of [-45,45])add((x<0?'left':'right')+(z<0?'-rear-wheel':'-front-wheel'),[x*65,-23,z],[30,40,40],'5ED3C6FF',true);
  add('mast',[0,88,-25],[10,60,10],'ED6C86FF',true);
  add('scanner',[0,122,-25],[65,14,20],'A7D579FF');
  add('bumper',[0,-5,80],[115,17,14],'ED6C86FF');
  models['signal rover']={b:{},p,s:[]};
  return models;
})();
