/* Decode the owner's local US 1.0 ROM. This file contains format logic only. */
const LevelRom = (() => {
  const SHA1 = 'e5e09205aa743a9e5043a42df72adc379c746b0b';
  const view = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const b64 = b => {let s=''; for(let i=0;i<b.length;i+=8192)s+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(s);};
  const encoded = (values, Type) => b64(new Uint8Array(new Type(values).buffer));
  const hex = b => Array.from(b,v=>v.toString(16).padStart(2,'0')).join('');
  function normalize(input) {
    const b = new Uint8Array(input).slice();
    if(b.length<0x800000||b.length>0x1000000||b.length%4)throw Error('Use an 8–16 MB SSSV US ROM.');
    const magic=view(b).getUint32(0);
    if(magic===0x37804012){for(let i=0;i<b.length;i+=2)[b[i],b[i+1]]=[b[i+1],b[i]];}
    else if(magic===0x40123780){for(let i=0;i<b.length;i+=4)[b[i],b[i+1],b[i+2],b[i+3]]=[b[i+3],b[i+2],b[i+1],b[i]];}
    else if(magic!==0x80371240)throw Error('Unrecognized N64 ROM byte order.');
    if(view(b).getUint32(0x3B)!==0x4E535645)throw Error('Use a US SSSV ROM; this is a different game or region.');
    return b;
  }
  function crc16(bytes){let c=0;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xA001:c>>>1;}return c;}
  function unpack(input, offset=0) {
    const b=input.subarray(offset),v=view(b);
    if(b.length<18||v.getUint32(0)!==0x524e4301)throw Error('Expected an RNC1 stream.');
    const size=v.getUint32(4),packed=v.getUint32(8);
    if(size>0x1000000||packed>b.length-18)throw Error('Invalid RNC stream size.');
    const bytes=b.subarray(18,18+packed);
    if(crc16(bytes)!==v.getUint16(14))throw Error('RNC packed checksum mismatch.');
    let p=18,cnt=16,acc=(b[18]||0)|((b[19]||0)<<8),out=0,steps=0;
    const output=new Uint8Array(size);
    const word=at=>(b[at]||0)|((b[at+1]||0)<<8);
    function advance(n){acc>>>=n;cnt-=n;if(cnt<16){p+=2;acc=(acc|(word(p)<<cnt))>>>0;cnt+=16;}}
    function read(n){const val=acc&((1<<n)-1);advance(n);return val;}
    function table(){const n=read(5),lens=Array.from({length:n},()=>read(4)),t=[];let code=0;
      for(let len=1;len<=Math.max(1,...lens);len++){for(let i=0;i<n;i++)if(lens[i]===len){let r=0,x=code;for(let j=0;j<len;j++){r=(r<<1)|(x&1);x>>>=1;}t.push([r,len,i]);code++;}code<<=1;}return t;}
    function huf(t){for(const [code,len,value] of t)if((acc&((1<<len)-1))===code){advance(len);return value<2?value:(1<<(value-1))|read(value-1);}throw Error('Invalid RNC Huffman code.');}
    advance(2);
    while(out<size){if(++steps>size+1)throw Error('RNC stream did not advance.');const raw=table(),dist=table(),length=table();let n=read(16);
      if(!n)throw Error('Empty RNC block.');
      while(n--){const count=huf(raw);if(out+count>size||(count>0&&p+count>18+packed))throw Error('RNC literal out of bounds.');
        if(count){output.set(b.subarray(p,p+count),out);out+=count;p+=count;cnt-=16;acc&=(1<<cnt)-1;acc=(acc|(word(p)<<cnt))>>>0;cnt+=16;}
        if(n){const distance=huf(dist)+1,count=huf(length)+2;if(distance>out||out+count>size)throw Error('RNC match out of bounds.');for(let i=0;i<count;i++){output[out]=output[out-distance];out++;}}
      }
    }
    if(crc16(output)!==v.getUint16(12))throw Error('RNC unpacked checksum mismatch.');
    return output;
  }
  function chunks(rom,level){const v=view(rom),entry=0x7B72A8+(level-1)*8,start=v.getUint32(entry),end=v.getUint32(entry+4);
    if(start>=end||end>rom.length)throw Error('Level slot out of bounds.');
    const body=unpack(rom.subarray(start,end)),parts={};let p=0;
    while(p<body.length){const id=body[p++];if(id===3)return parts;if(p+4>body.length)break;
      const v=view(body),compressed=v.getUint32(p)===0x524e4301,size=compressed?18+v.getUint32(p+8):4+v.getUint32(p);
      if(size>body.length-p)throw Error('Level chunk out of bounds.');
      parts[id]=compressed?unpack(body.subarray(p,p+size)):body.slice(p+4,p+size);p+=size;
    }throw Error('Missing level end marker.');
  }
  function records(data,size){const n=view(data).getUint16(0);if(data.length!==2+n*size)throw Error('Invalid spawn table length.');return Array.from({length:n},(_,i)=>hex(data.subarray(2+i*size,2+(i+1)*size)));}
  function recordValues(data,size){const v=view(data),n=v.getUint16(0),out=[];for(let i=0;i<n;i++){const p=2+i*size;out.push(v.getUint16(p),v.getInt16(p+2),v.getInt16(p+4),v.getInt16(p+6),v.getInt16(p+(size===22?10:8)));}return out;}
  function terrain(data,header){const v=view(data),pos=[],col=[],uv=[],sl=[],wat=[];let p=0,block=0;
    const signed10=n=>((n&1023)^512)-512;
    while(block<24&&p+52<=data.length){const flags=v.getUint16(p),count=flags&1?3:4,vertices=[],lit=header[0x5C+block]===0;
      for(let i=0;i<count;i++){const o=p+4+i*12,x=v.getUint8(o+7)*64+(block%4)*1024+256,y=v.getUint8(o+10)*64+Math.floor(block/4)*1024+512,z=v.getInt16(o+8)*8;
        let color=[data[o+4],data[o+5],data[o+6]];if(lit){const normal=color.map(a=>(a>127?a-256:a)/127),shade=Math.floor(255*(.35+.65*Math.max(0,normal[0]*.35+normal[1]*.45+normal[2]*.82)));color=[shade,shade,shade];}
        vertices.push({p:[x,y,z],c:color,uv:[signed10(v.getInt16(o)),signed10(v.getInt16(o+2))],a:data[o+11]});}
      for(const i of count===3?[0,1,2]:[0,1,2,1,3,2]){const a=vertices[i];pos.push(...a.p);col.push(...a.c);uv.push(...a.uv);sl.push(data[p+2]<32?data[p+2]:255);wat.push(flags&(0x10|0x20|0x200|0x8000)?Math.min(a.a,254):255);}
      p+=52;if(flags&2)block++;
    }
    if(block!==24)throw Error('Incomplete ground polygon blocks.');
    return {pos,col,uv,sl,wat};
  }
  function models(rom){const v=view(rom),MODEL={},TBL=[];
    function walk(address,depth=0,state={gm:0}){let p=0x398D0+(address&0xffffff),vertices=new Array(32),tris=[];
      for(let commands=0;commands<20000;commands++){if(p+8>rom.length)throw Error('Model list out of bounds.');const a=v.getUint32(p),b=v.getUint32(p+4),op=a>>>24;p+=8;
        if(op===0xB8)break;
        if(op===4){const count=(a>>>10)&63,start=(a>>>16)&255;if(b>>>24!==1){vertices=new Array(32);continue;}const base=0x398D0+(b&0xffffff);
          for(let i=0;i<count&&start+i<32;i++){const q=base+i*16;vertices[start+i]=[v.getInt16(q),v.getInt16(q+2),v.getInt16(q+4),rom[q+12],rom[q+13],rom[q+14],state.gm&0x20000];}}
        else if(op===0xBF||op===0xB1){for(const word of op===0xBF?[b]:[a,b]){const points=[(word>>>16)&255,(word>>>8)&255,word&255].map(i=>vertices[i>>>1]);if(points.every(Boolean))tris.push(...points);}}
        else if(op===6){if(b>>>24===1&&depth<8)tris.push(...walk(b,depth+1,state));if((a>>>16)&255)break;}
        else if(op===0xB6)state.gm&=~b;else if(op===0xB7)state.gm|=b;
      }return tris;
    }
    for(let type=0;type<247;type++){const p=0x7B9BD8+type*0x9C;TBL.push([rom[p+0x15],v.getInt16(p+0x1C),v.getInt16(p+0x72),v.getInt16(p+0x74),v.getInt16(p+0x7A)]);
      const address=v.getUint32(p+4);if(address>>>24!==1)continue;const triangles=walk(address),positions=[],colors=[];if(!triangles.length)continue;
      for(const point of triangles){positions.push(...point.slice(0,3));let c=point.slice(3,6);if(point[6]){const n=c.map(a=>(a>127?a-256:a)/127),shade=Math.floor(255*(.35+.65*Math.max(0,n[0]*.35+n[1]*.45+n[2]*.82)));c=[shade,shade,shade];}colors.push(...c);}
      MODEL[type]={p:encoded(positions,Int16Array),c:encoded(colors,Uint8Array),n:positions.length/3,zmin:Math.min(...positions.filter((_,i)=>i%3===2))};
    }return {MODEL,TBL};
  }
  function atlas(rom,zone,sub){const v=view(rom),ram=a=>0x6A6500+a-0x80294E50,rd=a=>v.getUint32(ram(a)),u5=zone===4?5:zone,u6=[4,5].includes(u5)?0:u5;
    const a=unpack(rom,rd(0x803A5770+8*u5)),p=unpack(rom,rd(rd(0x803A5918+4*u6)+8*(sub-1))),data=new Uint8Array(32*0xAB8);
    data.set(a.subarray(0,20*0xAB8));data.set(p.subarray(0,12*0xAB8),20*0xAB8);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;const ctx=canvas.getContext('2d'),image=ctx.createImageData(256,128),d=view(data);
    for(let i=0;i<32;i++)for(let y=0;y<32;y++)for(let x=0;x<32;x++){const c=d.getUint16(i*0xAB8+2*(y*32+(x^(y&1?2:0)))),o=((Math.floor(i/8)*32+y)*256+(i%8)*32+x)*4;image.data.set([(c>>>11)*255/31,((c>>>6)&31)*255/31,((c>>>1)&31)*255/31,c&1?255:0],o);}
    ctx.putImageData(image,0,0);return canvas.toDataURL('image/png');
  }
  async function decode(input,progress=()=>{}){const rom=normalize(input),sha=hex(new Uint8Array(await crypto.subtle.digest('SHA-1',rom)));
    // Patched ROMs retain their own identity; structural decoders validate the layout.
    const {MODEL,TBL}=models(rom),LEVELS=[],EDITOR_STOCK={},ATLAS={};
    for(let id=1;id<=36;id++){progress(`Decoding level ${id} of 36…`);await new Promise(resolve=>setTimeout(resolve,0));const ch=chunks(rom,id),h=ch[12],m=terrain(ch[10],h),zone=h[0x21],sub=h[0x53],key=`${zone}_${sub}`;
      if(!ATLAS[key])ATLAS[key]=atlas(rom,zone,sub);
      EDITOR_STOCK[id]={props:records(ch[0],22),animals:records(ch[1],16)};
      const xs=m.pos.filter((_,i)=>i%3===0),ys=m.pos.filter((_,i)=>i%3===1),zs=m.pos.filter((_,i)=>i%3===2),bounds=a=>a.length?[Math.min(...a),Math.max(...a)]:[0,0],xb=bounds(xs),yb=bounds(ys),zb=bounds(zs);
      const grid=[],tile=[];for(let i=0;i<65*97;i++){grid.push(ch[9][i*8]);tile.push(ch[9][i*8+2]);}
      LEVELS.push({id,tex:key,zone,sub,n:m.pos.length/3,bb:[xb[0],yb[0],zb[0],xb[1],yb[1],zb[1]],nsp:EDITOR_STOCK[id].props.length,pos:encoded(m.pos,Int32Array),col:encoded(m.col,Uint8Array),uv:encoded(m.uv,Int16Array),sl:encoded(m.sl,Uint8Array),wat:encoded(m.wat,Uint8Array),grid:encoded(grid,Uint8Array),tile:encoded(tile,Uint8Array),bt:b64(ch[11].subarray(0,3072)),sp:encoded(recordValues(ch[0],22),Int32Array),an:recordValues(ch[1],16)});
    }
    return {ANIM:{models:{},names:{},species:{}},MODEL,TBL,ATLAS,LEVELS,EDITOR_STOCK,EDITOR_SHA1:sha,SOURCE_LABEL:sha===SHA1?'stock ROM':'modded ROM'};
  }
  return {SHA1,normalize,unpack,chunks,records,terrain,decode};
})();
if(typeof module!=='undefined')module.exports=LevelRom;
