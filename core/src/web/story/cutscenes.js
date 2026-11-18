/* Level script records and editable shot fields. Contains format definitions only. */
(function(root){
'use strict';
const R=typeof module!=='undefined'?require('./rnc.js'):root.StoryRNC;
const hex=v=>v.toString(16).toUpperCase().padStart(4,'0');
const variable=v=>v>=0x7f7f&&v<0x8000;
const value=(v,signed=false)=>variable(v)?'$'+hex(v):String(signed&&v>=0x8000?v-65536:v);
const names={0:'no action',1:'if',2:'remember condition',3:'wait until',4:'loop',5:'loop end',6:'wait',7:'no action',8:'go to',9:'end',10:'no action',0x0e:'start script',0x14:'select target',0x26:'sound',0x2e:'camera: on player',0x44:'message',0x48:'call',0x49:'return',0x4d:'camera: on target',0x4e:'camera: fixed point',0x5a:'camera: back to play'};
function parse(c){
 const d=c.out.find(ch=>ch.id===4)?.data,records=[],entries=new Map();
 if(d){const n=R.u16(d,0);if(n<2||n>d.length||(n-2)%10)throw Error('Invalid script length');for(let p=2;p<n;p+=10)records.push({op:R.u16(d,p),args:Array.from({length:4},(_,j)=>R.u16(d,p+2+2*j))});}
 for(const [id,size,field,kind] of [[0,22,16,'prop'],[1,16,12,'animal']]){
  const spawn=c.out.find(ch=>ch.id===id)?.data;if(!spawn)continue;
  const n=R.u16(spawn,0);if(2+n*size>spawn.length)throw Error('Invalid object list');
  for(let i=0;i<n;i++){const p=2+i*size,entry=R.u16(spawn,p+field);if(!entry)continue;if(entry>records.length)throw Error('Script entry outside record pool');if(!entries.has(entry))entries.set(entry,[]);entries.get(entry).push(`${kind} #${i} (type ${R.u16(spawn,p)})`);}
 }
 const scripts=[...entries].sort((a,b)=>a[0]-b[0]).map(([entry,objects])=>{let end=entry-1;while(end<records.length&&records[end].op!==9)end++;return {entry,objects,count:Math.min(end+1,records.length)-entry+1,terminated:end<records.length};});
 return {records,scripts};
}
function describe(r,text={}){
 const a=r.args,v=i=>value(a[i]);
 switch(r.op){
 case 0x44:return `message ${variable(a[0])?v(0):JSON.stringify(text[a[0]]??`[text ${a[0]} unavailable]`)} hold ${v(1)} s`;
 case 6:return `wait ${v(0)} frames`;
 case 0x26:return `sound ${v(0)} volume ${v(1)}`;
 case 0x2e:return `camera: on player, ${v(0)} frames`;
 case 0x4d:return `camera: on target, ${a[0]&255} frames, style ${a[2]&255}`;
 case 0x4e:return `camera: fixed point ${a[1]>>>8},${a[1]&255},${a[2]>>>8} (x32), ${a[0]&255} frames, style ${a[2]&255}`;
 case 0x5a:return 'camera: back to play';
 default:return (names[r.op]||'other action')+(r.op===9?'':' '+a.map(n=>value(n,true)).join(' '));
 }
}
function zoom(r){
 const min=r.args[3]>>>11;
 return min===31?{min:-3,max:5}:{min:min-3,max:((r.args[3]>>>3)&31)-3};
}
function fields(r,advanced=false){
 const f=(label,arg,shift=null)=>({label,arg,shift,max:shift===null?0x7f7e:255,disabled:shift===null&&variable(r.args[arg])});
 let out=[];
 if(r.op===0x44)out=[f('Text index',0),f('Hold (seconds)',1)];
 if(r.op===6)out=[f('Wait (frames)',0)];
 if(r.op===0x26)out=[f('Sound ID',0),f('Volume',1)];
 if(r.op===0x2e)out=[f('Camera shot (frames)',0)];
 if(r.op===0x4d||r.op===0x4e)out=[f('Camera shot (frames)',0,0),f('Camera style',2,0),f('Camera position x (x32, used by some styles)',1,8),f('Camera position y (x32, used by some styles)',1,0),f('Camera position z (x32, used by some styles)',2,8)];
 if(advanced)out=Array.from({length:4},(_,arg)=>({label:'Argument '+arg+' (hex)',arg,shift:null,max:65535,disabled:false,raw:true}));
 return out;
}
function edit(r,field,next,advanced=false){
 const allowed=fields(r,advanced).find(f=>f.arg===field.arg&&f.shift===field.shift);
 if(!allowed||allowed.disabled||!Number.isInteger(next)||next<0||next>allowed.max)throw Error('Enter a whole number within the displayed range.');
 r.args[field.arg]=field.shift===null?next:(r.args[field.arg]&~(255<<field.shift))|(next<<field.shift);
}
function validate(original,current){
 if(!current||Object.keys(original).sort().join()!==Object.keys(current).sort().join())throw Error('Do not add or remove script levels.');
 for(const [lv,old] of Object.entries(original)){const rs=current[lv];if(!Array.isArray(rs)||rs.length!==old.length)throw Error('Do not add or remove script records.');rs.forEach((r,i)=>{if(r.op!==old[i].op||!Array.isArray(r.args)||r.args.length!==4||r.args.some(v=>!Number.isInteger(v)||v<0||v>65535))throw Error('Invalid script record.');});}
}
const api={parse,describe,zoom,fields,edit,validate,variable,value,hex,names};if(typeof module!=='undefined')module.exports=api;else root.Cutscenes=api;
})(globalThis);
