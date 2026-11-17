const assert=require('assert'),fs=require('fs');
global.window=undefined;const root={};
new Function('globalThis',fs.readFileSync('src/viewer/js/anim-export.js','utf8')).call(root,root);
const {encodeGif}=root.AnimExport;assert.ok(encodeGif,'encodeGif exported');
const w=24,h=16,frames=[];
for(let f=0;f<6;f++){const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,on=(x+f*3)%w<8;a[i]=on?200:0;a[i+1]=on?(x*9)&255:0;a[i+2]=on?90:0;a[i+3]=on?255:0}frames.push(a)}
const g=encodeGif(frames,w,h,4);
assert.equal(String.fromCharCode(...g.slice(0,6)),'GIF89a');assert.equal(g[6]|g[7]<<8,w);assert.equal(g[8]|g[9]<<8,h);assert.equal(g[g.length-1],0x3B);
const s=Buffer.from(g).toString('latin1');assert.ok(s.includes('NETSCAPE2.0'),'loops');assert.equal(s.split('\x21\xF9\x04\x09').length-1,frames.length,'one transparent graphic control block per frame');
assert.throws(()=>encodeGif([],w,h,4));
if(process.env.GIF_OUT)fs.writeFileSync(process.env.GIF_OUT,g);
const {muxMp4,unionBounds}=root.AnimExport,mp4=muxMp4({w:16,h:16,fps:25,samples:[{data:new Uint8Array(10).fill(1),key:true},{data:new Uint8Array(7).fill(2),key:false}],avcC:new Uint8Array([1,66,0,31,255,224,0])}),dv=new DataView(mp4.buffer);
{let o=0;const top=[];while(o<mp4.length){top.push(String.fromCharCode(...mp4.slice(o+4,o+8)));o+=dv.getUint32(o)}assert.deepEqual(top,['ftyp','moov','mdat']);assert.equal(o,mp4.length);
 const m=Buffer.from(mp4).toString('latin1'),co=m.indexOf('stco'),off=dv.getUint32(co+12);assert.equal(mp4[off],1,'chunk offset points at the first sample');assert.equal(mp4[off+10],2,'samples are back to back');
 const sz=m.indexOf('stsz');assert.deepEqual([dv.getUint32(sz+12),dv.getUint32(sz+16),dv.getUint32(sz+20)],[2,10,7],'sample sizes');assert.equal(dv.getUint32(m.indexOf('stss')+8),1,'one key frame')}
assert.deepEqual(unionBounds([null,[[0,0,0],[1,2,3]],[[-1,1,0],[0,5,1]]]),[[-1,0,0],[1,5,3]]);assert.equal(unionBounds([null]),null);
console.log('Animation export: GIF encoder header, loop, per-frame transparency; MP4 container layout; bounds union passed.');
const ck=(t,yaw,dist,ctr)=>({t,yaw,pit:0,roll:0,dist,ctr});
const ca=ck(.2,170*Math.PI/180,10,[0,2,4]),cb=ck(.8,-170*Math.PI/180,30,[10,12,14]);
assert.equal(root.AnimExport.cameraAt([],0),null);
assert.deepEqual(root.AnimExport.cameraAt([ca],.9).ctr,ca.ctr);
assert.equal(root.AnimExport.cameraAt([ca,cb],0).dist,10);
assert.equal(root.AnimExport.cameraAt([cb,ca],1).dist,30);
const cm=root.AnimExport.cameraAt([cb,ca],.5);
assert.ok(Math.abs(cm.yaw-Math.PI)<1e-9);assert.ok(Math.abs(cm.dist-20)<1e-9);
assert.deepEqual(cm.ctr.map(Math.round),[5,7,9]);
console.log('Camera path: empty/single/end holds, sorted keys, shortest angular arc, pan and zoom interpolation.');
