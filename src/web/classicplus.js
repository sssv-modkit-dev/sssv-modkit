/* Classic+ patches for the guided build: applies the published patch records (classicplus.json) to a ROM in the browser.
   The records hold only the bytes these patches write, never the game's own bytes. Toggles that share the code block
   come as one record set per combination; the minimap pictures and head icons are left as gaps that the caller fills
   with art drawn from the user's own ROM (see art()). Works on top of other editor changes; refuses if a patch would
   overwrite a byte those changes already altered. */
(function(root){
 'use strict';
 const FORMAT='sssv-classicplus-web-v3',PAK=new Set(['jukebox']);
 function check(data){if(!data||data.format!==FORMAT||!Array.isArray(data.block_toggles)||typeof data.block!=='object'||typeof data.toggles!=='object'||!Array.isArray(data.pool))throw Error('Classic+ patch data is missing or from a different version. Reload this page.');return data;}
 function ids(data){check(data);return [...data.block_toggles,...Object.keys(data.toggles)];}
 /* Adds what a choice depends on (e.g. health pips need the minimap) and drops unknown ids. */
 function resolve(data,selected){const known=ids(data),sel=new Set(selected.filter(id=>known.includes(id)));for(const [id,need] of Object.entries(data.requires||{}))if(sel.has(id))sel.add(need);return known.filter(id=>sel.has(id));}
 function variant(data,selected){
  const sel=new Set(selected);for(const s of sel)if(!ids(data).includes(s))throw Error('Unknown patch: '+s);
  for(const [id,need] of Object.entries(data.requires||{}))if(sel.has(id)&&!sel.has(need))throw Error('Patch '+id+' needs '+need);
  const block=data.block_toggles.filter(t=>sel.has(t));if(!block.length)return null;
  const v=data.block[block.join('+')];if(!v)throw Error('Classic+ patch data has no entry for '+block.join(' + '));return v;
 }
 /* Which pictures the caller must draw from the user's ROM: subset of ['minimap','icons_big','icons_small']. */
 function art(data,selected){const v=variant(check(data),selected);return v?Object.keys(v.art||{}):[];}
 function needsPak(data,selected){const sel=new Set(selected);return check(data).block_toggles.some(t=>sel.has(t))||[...PAK].some(t=>sel.has(t));}
 /* stock: the verified source ROM; edited: the ROM after other editor changes; pictures: {name: Uint8Array} for art().
    Returns a new array (longer when the patches need room past 8 MB) with a fixed CRC. */
 function apply(stock,edited,data,selected,pictures={},fixCRC){
  const v=variant(check(data),selected),sel=new Set(selected);
  const recs=[...(v?v.records:[]),...Object.keys(data.toggles).filter(t=>sel.has(t)).flatMap(t=>data.toggles[t])].map(i=>data.pool[i]);
  if(!recs.length&&!v)return edited;
  const size=Math.max(edited.length,v?v.rom_len:0);if(size>edited.length&&edited.length!==stock.length)throw Error('These patches need the space past 8 MB, which your other changes already use.');
  const rom=new Uint8Array(size).fill(255);rom.set(edited);
  const base=at=>at<stock.length?stock[at]:255;
  const write=(offset,bytes,what)=>{if(!Number.isInteger(offset)||offset<0x18||offset+bytes.length>size)throw Error('Classic+ patch data is damaged. Reload this page.');
   for(let i=0;i<bytes.length;i++){const at=offset+i;if(at<edited.length&&edited[at]!==base(at))throw Error(`${what} overlaps your editor changes at ROM offset 0x${at.toString(16)}. Build without that patch or undo the overlapping edit.`);rom[at]=bytes[i];}};
  for(const rec of recs){const [offset,hex]=rec||[];if(typeof hex!=='string'||hex.length%2)throw Error('Classic+ patch data is damaged. Reload this page.');const b=new Uint8Array(hex.length/2);for(let i=0;i<b.length;i++)b[i]=parseInt(hex.slice(2*i,2*i+2),16);write(offset,b,'A selected patch');}
  for(const [name,[offset,length]] of Object.entries(v?.art||{})){const p=pictures[name];if(!p||p.length!==length)throw Error('The '+(name==='minimap'?'minimap pictures':'head icons')+' could not be drawn from your ROM.');write(offset,p,'The '+name+' data');}
  (fixCRC||root.StoryROM.fixCRC)(rom);return rom;
 }
 const api={FORMAT,ids,resolve,art,needsPak,apply};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ClassicPlus=api;
})(typeof globalThis!=='undefined'?globalThis:this);
