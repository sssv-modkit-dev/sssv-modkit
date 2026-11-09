#!/usr/bin/env node
/* Generates the sample pack's island scene (scene-v1). Everything here is original and CC0: terrain, texture atlas,
   object placement and meshes all come from a seeded generator.
   node tools/make_island.js [--seed 1] [--out packs/sample/assets/island.scene.json] */
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0?process.argv[i+1]:fallback;};
const SEED=+arg('seed',1),OUT=arg('out',path.join(__dirname,'../packs/sample/assets/island.scene.json'));

function rng(seed){let a=seed>>>0;return()=>{a=a+0x6D2B79F5>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const rand=rng(SEED);
// Value noise on a 9x13 lattice, smoothly interpolated.
const LAT=Array.from({length:9*13},()=>rand());
function noise(gx,gy){const x=gx/8,y=gy/8,i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,s=t=>t*t*(3-2*t);
  const at=(a,b)=>LAT[Math.min(8,a)*13+Math.min(12,b)];
  return (at(i,j)*(1-s(fx))+at(i+1,j)*s(fx))*(1-s(fy))+(at(i,j+1)*(1-s(fx))+at(i+1,j+1)*s(fx))*s(fy);}

// Runtime grid: 65 x 97 cells of 64 units from (256,512); heights are stored as Int8 x 8.
const GX=65,GY=97,X0=256,Y0=512,CELL=64;
const WATER=0,SAND=1,GRASS=2,ROCK=3;
const heights=new Int8Array(GX*GY),tiles=new Uint8Array(GX*GY);
for(let x=0;x<GX;x++)for(let y=0;y<GY;y++){
  const r=Math.hypot((x-32)/28,(y-48)/42),h=(1-r)*560+(noise(x,y)-.5)*260;
  const g=Math.max(-16,Math.min(110,Math.round(h/8)));heights[x*GY+y]=g;
  tiles[x*GY+y]=g<=0?WATER:g<6?SAND:g<55?GRASS:ROCK;}
const tileTypes=new Uint8Array(4*12);for(const t of [SAND,GRASS])tileTypes[t*12]=1; // walkable flag
const H=(x,y)=>heights[x*GY+y]*8;

// Terrain mesh: one quad per 2x2 cells, textured by tile (atlas slots 0-2), plus one translucent water quad.
const P=[],C=[],UV=[],SL=[],WA=[];
const SLOT={[SAND]:1,[GRASS]:0,[ROCK]:2,[WATER]:1};
function vert(x,y,z,col,slot,water){P.push(x,y,z);C.push(...col);UV.push(Math.round(x/4),Math.round(y/4));SL.push(slot);WA.push(water);}
for(let x=0;x<GX-2;x+=2)for(let y=0;y<GY-2;y+=2){
  const corner=(cx,cy)=>{const t=tiles[cx*GY+cy],shade=Math.round(200+noise(cx*3,cy*3)*55);return [X0+cx*CELL,Y0+cy*CELL,H(cx,cy),[shade,shade,shade],SLOT[t]];};
  const a=corner(x,y),b=corner(x+2,y),c=corner(x+2,y+2),d=corner(x,y+2);
  for(const v of [a,b,c,a,c,d])vert(v[0],v[1],v[2],v[3],v[4],255);}
const xe=X0+(GX-1)*CELL,ye=Y0+(GY-1)*CELL,sea=[60,140,190];
for(const [x,y] of [[X0,Y0],[xe,Y0],[xe,ye],[X0,Y0],[xe,ye],[X0,ye]])vert(x,y,4,sea,255,140);
const n=P.length/3;

// Texture atlas 256x128 with three 32x32 tiles: grass, sand, rock.
function png(w,h,rgba){const crcT=[...Array(256)].map((_,k)=>{let c=k;for(let i=0;i<8;i++)c=c&1?0xEDB88320^c>>>1:c>>>1;return c>>>0;});
  const crc=b=>{let c=0xFFFFFFFF;for(const x of b)c=crcT[(c^x)&255]^c>>>8;return (c^0xFFFFFFFF)>>>0;};
  const chunk=(type,data)=>{const len=Buffer.alloc(4),body=Buffer.concat([Buffer.from(type),data]),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(body));return Buffer.concat([len,body,sum]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr.set([8,6,0,0,0],8);
  const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)rgba.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
const AW=256,AH=128,atlas=Buffer.alloc(AW*AH*4);
const BASE=[[96,160,72],[222,200,140],[128,120,112]];
for(let slot=0;slot<3;slot++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const v=.8+.4*rand(),o=((y)*AW+slot*32+x)*4;
  atlas.set([...BASE[slot].map(c=>Math.min(255,Math.round(c*v))),255],o);}
const ATLAS_ID='island';

// Objects: spawn 0 is the player start; then trees, boulders, collectibles, props and one exit portal.
const PLAN=[55,3,3,3,3,3,2,2,2,2,34,34,34,34,27,27,40,36,42,56];
const CREATURES=[33,33,31,16];
function landSpot(){for(;;){const x=4+Math.floor(rand()*(GX-8)),y=4+Math.floor(rand()*(GY-8)),t=tiles[x*GY+y];if(t===GRASS||t===SAND)return [X0+x*CELL,Y0+y*CELL,H(x,y)];}}
const hex=b=>b.toString('hex');
const props=[],propRecords=[];
for(const type of PLAN){const [x,y,z]=landSpot(),yaw=Math.floor(rand()*360);
  props.push(type,x,y,z,yaw);const r=Buffer.alloc(22);r.writeUInt16BE(type,0);r.writeInt16BE(x,2);r.writeInt16BE(y,4);r.writeInt16BE(z,6);r.writeInt16BE(yaw,10);if(type===56)r.writeUInt16BE(1,18);propRecords.push(hex(r));}
const creatures=[],creatureRecords=[];
for(const type of CREATURES){const [x,y,z]=landSpot(),yaw=Math.floor(rand()*360);
  creatures.push(type,x,y,z,yaw);const r=Buffer.alloc(16);r.writeUInt16BE(type,0);r.writeInt16BE(x,2);r.writeInt16BE(y,4);r.writeInt16BE(z,6);r.writeInt16BE(yaw,8);creatureRecords.push(hex(r));}

// Meshes (Z up, Int16 triangle lists) for the prop types that have one; others draw as boxes from the type table.
function mesh(parts){const p=[],c=[];for(const part of parts)for(const [v,col] of part){p.push(...v.map(Math.round));c.push(...col);}
  return {p:Buffer.from(new Int16Array(p).buffer).toString('base64'),c:Buffer.from(Uint8Array.from(c)).toString('base64'),n:p.length/3,zmin:Math.min(...p.filter((_,i)=>i%3===2))};}
function prism(r,z0,z1,sides,col,top=r){const out=[];for(let i=0;i<sides;i++){const a=2*Math.PI*i/sides,b=2*Math.PI*(i+1)/sides,
  A=[Math.cos(a)*r,Math.sin(a)*r,z0],B=[Math.cos(b)*r,Math.sin(b)*r,z0],At=[Math.cos(a)*top,Math.sin(a)*top,z1],Bt=[Math.cos(b)*top,Math.sin(b)*top,z1],dark=col.map(v=>Math.round(v*.75));
  out.push([A,dark],[B,dark],[Bt,col],[A,dark],[Bt,col],[At,col],[[0,0,z1],col],[At,col],[Bt,col]);}return out;}
const MODEL={
  3:mesh([prism(14,0,160,6,[140,96,60]),prism(90,140,300,7,[70,150,70],0)]),
  2:mesh([prism(70,0,90,5,[150,146,140],40)]),
  34:mesh([prism(18,0,60,6,[250,210,70],18)]),
  27:mesh([prism(30,0,70,8,[170,110,60])]),
  36:mesh([prism(26,0,220,6,[200,200,210],22)])};
const TYPES=Array.from({length:247},()=>[0,0,0,0,0]);
for(const [type,kind,w,d,h] of [[3,1,180,180,300],[2,1,140,140,90],[34,3,36,36,60],[27,1,60,60,70],[40,1,40,20,120],[36,1,52,52,220],[42,4,40,40,20],[55,5,80,80,40],[56,5,80,80,40]])TYPES[type]=[kind,0,w,d,h];

const zs=[];for(let i=2;i<P.length;i+=3)zs.push(P[i]);
const level={id:1,atlas:ATLAS_ID,group:0,sub:0,bounds:[X0,Y0,Math.min(...zs),xe,ye,Math.max(...zs)],vertexCount:n,spawnCount:PLAN.length,
  terrain:{positions:Buffer.from(new Int32Array(P).buffer).toString('base64'),colours:Buffer.from(Uint8Array.from(C)).toString('base64'),
    uvs:Buffer.from(new Int16Array(UV).buffer).toString('base64'),slots:Buffer.from(Uint8Array.from(SL)).toString('base64'),
    water:Buffer.from(Uint8Array.from(WA)).toString('base64'),heights:Buffer.from(heights.buffer).toString('base64'),
    tiles:Buffer.from(tiles.buffer).toString('base64'),tileTypes:Buffer.from(tileTypes.buffer).toString('base64')},
  objects:{props:Buffer.from(new Int32Array(props).buffer).toString('base64'),creatures},
  records:{props:propRecords,creatures:creatureRecords}};
const sha1=crypto.createHash('sha1').update(JSON.stringify(level)).digest('hex');
const doc={format:'scene-v1',title:'Sample island',source:{label:'Sample island',sha1},types:TYPES,meshes:MODEL,
  creatures:{models:{},names:{},species:{}},atlases:{[ATLAS_ID]:'data:image/png;base64,'+png(AW,AH,atlas).toString('base64')},levels:[level]};
fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(doc));
console.log('Island: '+n+' vertices, '+PLAN.length+' props, '+CREATURES.length+' creatures -> '+OUT);
