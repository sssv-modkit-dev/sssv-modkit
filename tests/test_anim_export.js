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
console.log('Animation export: GIF encoder header, loop, per-frame transparency passed.');
