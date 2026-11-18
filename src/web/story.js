'use strict';
const $ = id => document.getElementById(id);
let dirty = false, busy = false, ready = false, project = null, localData = null;
let originalData = null, currentData = null, terrainEdit = () => undefined, contentChanged = () => false;
function download(bytes, name, type = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([bytes], {type})), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let sessionSave=Promise.resolve(),sessionSaved=true,saveVersion=0;
async function persistSession(){
 if(!project||!window.ROMSession)return;
 const version=++saveVersion,source=await ROMSession.get();if(!source)return;sessionSaved=false;
 const data=document.body.dataset.page==='dialogue'?{hash:source.hash,data:structuredClone(currentData)}:{hash:source.hash,sheets:structuredClone(terrainSheets)};
 sessionSave=sessionSave.catch(()=>{}).then(()=>ROMSession.write(document.body.dataset.page==='dialogue'?'story':'terrain',data));
 try{await sessionSave;if(version===saveVersion)sessionSaved=true;}catch(error){status(error.message+' Keep this page open or download your edits.');}
}
let terrainSheets={};
window.addEventListener('rom-session-forgotten',()=>{dirty=false;busy=false;sessionSaved=true;});
async function exportROM(asIPS = false) {
  status('Building in your browser...');
  await persistSession();await sessionSave;
  const source=await window.ROMSession?.get(),story=source?await ROMSession.read('story'):null,tiles=source?await ROMSession.read('terrain'):null;
  const data=story&&story.hash===source?.hash?story.data:localData;
  StoryROM.validate(project.original,data);
  const sheets=tiles&&tiles.hash===source?.hash?Object.values(tiles.sheets):terrainEdit();
  const rom = project.build(data, sheets);
  download(asIPS ? StoryROM.ips(project.rom, rom) : rom, asIPS ? 'story-patched.ips' : 'story-patched.z64');
  status(asIPS ? 'IPS downloaded for the current edits.' : 'ROM downloaded for the current edits.');
}
const status = text => { $('status').textContent = text; };
function changed() { dirty = contentChanged(); enabled(); status(dirty ? (project?'Edits applied live; shared with Dialogue / Textures & Tilesets in this browser.':'Unsaved changes.') : 'No changes from the loaded original.');persistSession(); }
function enabled() {
  for (const id of ['save','build']) $(id).disabled = busy || !ready;
  $('ips').hidden = ready && !project;
  let valid = true;
  if (project && currentData) { try { StoryROM.validate(project.original, currentData); } catch { valid = false; } }
  const hasEdits=dirty||project&&(StoryROM.hasChanges(project.original,currentData)||Object.keys(terrainSheets).length>0);
  $('ips').disabled = busy || !ready || !project || !hasEdits || !valid;
  if (project) $('build').disabled ||= !valid;
}
async function action(fn) {
  if (busy) return;
  busy = true; enabled();
  try { await fn(); } catch (error) { window.LoadProgress?.fail(error.message);status(error.message); }
  finally { busy = false; enabled(); }
}
function option(select, value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o); }
window.addEventListener('beforeunload', event => { if ((!project&&dirty) || (project&&!sessionSaved) || busy) { event.preventDefault(); event.returnValue = ''; } });

async function dialogue() {
  const data = localData;
  currentData = data; originalData = structuredClone(project?project.original:data);
  terrainEdit = () => undefined;
  contentChanged = () => StoryROM.hasChanges(originalData, data);
  let bank, line, cutsceneUI;
  const H=window.ModelEditorHistory;
  if(H)H.configure({capture:()=>({banks:data.banks,levels:data.levels,cutscenes:data.cutscenes}),restore:value=>{data.banks=value.banks;data.levels=value.levels;data.cutscenes=value.cutscenes;showBank();cutsceneUI?.refresh();changed();}});
  window.EditorShortcuts={help:['Ctrl+Z undo · Ctrl+Y / Ctrl+Shift+Z redo','Text fields use normal text editing shortcuts.'],action(key){if(busy)return false;if(key==='undo'||key==='redo'){H?.[key]();return true;}if(key==='escape'){document.activeElement?.blur();return true;}return false;}};
  const bytes = strings => 2 + Object.values(strings).reduce((n, s) => n + 4 + 2 * s.length, 0);
  function budget() {
    const used = bytes(data.banks[bank].strings), max = data.capacities[bank];
    $('budget').textContent = `${used} / ${max} bytes / ${max-used} remaining in bank ${bank}`;
    $('budget').classList.toggle('bad', used > max);
    $('budget-bar').max = max; $('budget-bar').value = used;
  }
  function preview(text) {
    $('preview').replaceChildren();
    const colours = {Y:'yellow',B:'blue',R:'red',W:'white',G:'green'};
    let colour = 'white';
    for (const part of text.replace(/^(#S|##|@N)/,'').split(/(@C[YBRWG])/)) {
      if (/^@C[YBRWG]$/.test(part)) { colour = colours[part[2]]; continue; }
      const span = document.createElement('span'); span.className = colour; span.textContent = part; $('preview').append(span);
    }
  }
  function timingInput(parent, record, field, label) {
    const row = document.createElement('label'), input = document.createElement('input');
    row.textContent = label; input.type = 'number'; input.min = '0'; input.max = '32511'; input.step = '1'; input.value = record[field];
    input.disabled = Cutscenes.variable(record[field]);
    if(input.disabled){input.type='text';input.value=Cutscenes.value(record[field]);}
    input.oninput = () => { record[field] = input.value === '' ? null : Number(input.value); const raw=data.cutscenes?.[Number(bank)+1]?.[record.i];if(raw)raw.args[raw.op===0x44?1:0]=record[field];changed(); };
    row.append(input);
    if (field === 'frames'&&!input.disabled) { const out = document.createElement('output'); out.className = 'mut'; const show = () => { const f = Number(input.value) || 0; out.textContent = ` ≈ ${(f / 30).toFixed(f < 300 ? 1 : 0)} s`; }; input.addEventListener('input', show); show(); row.append(out); }
    parent.append(row); return row;
  }
  const snip = (t, n = 40) => { t = String(t || '').replace(/@[A-Z]{2}/g, '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
  function nearMessages(records, i) {
    let before = null, after = null;
    for (const r of records) if (r.op === 'message') { if (r.i < i) before = r; else if (r.i > i && !after) after = r; }
    return { before, after };
  }
  function showLine() {
    line = $('lines').value;
    for(const b of $('lines-list').children)b.setAttribute('aria-selected',String(b.dataset.line===line));
    const text = data.banks[bank].strings[line];
    $('text').disabled = text === undefined; $('text').value = text ?? '';
    $('line-title').textContent = line === '' ? 'No matching text' : `Text ${line}`;
    preview(text ?? ''); $('encoding').textContent = '';
    $('holds').replaceChildren();
    const records = Number(bank) < 31 ? data.levels[String(Number(bank)+1)] || [] : [];
    const uses = records.filter(r => r.op === 'message' && String(r.text) === line);
    for (const [n, r] of uses.entries()) { const row = timingInput($('holds'), r, 'hold_seconds', uses.length > 1 ? `Time on screen, showing ${n + 1} of ${uses.length} (seconds)` : 'Time on screen (seconds)'); row.title = `Set by step ${r.i} of the level script`; }
    if (uses.length) { const hint = document.createElement('p'); hint.className = 'mut'; hint.textContent = uses.length > 1 ? 'The level shows this line more than once; each showing has its own time.' : 'How long the level keeps this line on screen before moving on.'; $('holds').append(hint); }
    if (!$('holds').children.length) $('holds').textContent = 'This line has no on-screen time in the level script (it is shown somewhere else, such as a menu or the pause screen).';
  }
  function listLines(preferred = line) {
    $('lines').replaceChildren(); $('lines-list').replaceChildren();
    for (const [id, text] of Object.entries(data.banks[bank].strings)) {
      if (!text.toLowerCase().includes($('search').value.toLowerCase())) continue;
      option($('lines'), id, `${id} / ${text.replace(/\n/g,' ')}`);
      const b=document.createElement('button');b.type='button';b.dataset.line=id;b.setAttribute('role','option');b.textContent=`${id} / ${text}`;
      b.onclick=()=>{$('lines').value=id;showLine();};$('lines-list').append(b);
    }
    if ([...$('lines').options].some(o => o.value === preferred)) $('lines').value = preferred;
    else $('lines').selectedIndex = 0;
    showLine();
  }
  function listWaits() {
    $('waits').replaceChildren();
    const query=$('wait-search').value.trim().toLowerCase();
    const all=Number(bank)<31?data.levels[String(Number(bank)+1)]||[]:[],says=r=>r?snip(data.banks[bank].strings[r.text]??r.says):'';
    const ctx=r=>{const m=nearMessages(all,r.i);return {m,text:`${says(m.before)} ${says(m.after)}`.toLowerCase()}};
    const records=all.filter(r=>r.op==='wait'&&`${r.i} ${r.frames} ${ctx(r).text}`.includes(query));
    for(let n=0;n<records.length;n+=10){
      const group=document.createElement('details'),title=document.createElement('summary'),batch=records.slice(n,n+10),first=nearMessages(all,batch[0].i);
      const near=says(first.after||first.before);
      title.textContent=`Script steps ${batch[0].i}–${batch.at(-1).i} (${batch.length} waits)${near?` · near “${near}”`:''}`;group.open=!!query;group.append(title);
      for(const r of batch){const {m}=ctx(r),row=timingInput(group,r,'frames',`Step ${r.i}: pause, frames `);
        const hint=document.createElement('small');hint.className='mut';hint.style.display='block';
        hint.textContent=(m.before?`after “${says(m.before)}”`:'before any message')+(m.after?` · before “${says(m.after)}”`:'');row.append(hint);}
      $('waits').append(group);
    }
    if(!records.length)$('waits').textContent='No matching wait records.';
  }
  $('wait-search').oninput=listWaits;
  function showBank() {
    bank = $('bank').value; $('search').value = '';
    listLines(); budget(); $('wait-search').value='';listWaits();
  }
  for (const [id,b] of Object.entries(data.banks)) option($('bank'), id, `${Number(id)<31?'Level '+(Number(id)+1)+' / ':''}Bank ${id} / ${b.title || 'Untitled'}`);
  $('help').textContent = data.help;
  $('bank').disabled = false; $('bank').onchange = showBank; $('lines').onchange = showLine; $('search').oninput = () => listLines();
  $('text').oninput = () => {
    const text = $('text').value; data.banks[bank].strings[line] = text;
    const selected = $('lines').selectedOptions[0];
    if (selected) selected.textContent = `${line} / ${text.replace(/\n/g,' ')}`;
    const row=[...$('lines-list').children].find(b=>b.dataset.line===line);if(row)row.textContent=`${line} / ${text}`;
    budget(); preview(text); changed();
    $('encoding').textContent = /^[\x20-\x7e\n]*$/.test(text) ? '' : 'Unsupported character: use plain ASCII and line breaks.';
  };
  async function save() { download(JSON.stringify({banks:data.banks,levels:data.levels,cutscenes:data.cutscenes},null,2), 'story-edits.json', 'application/json'); status('Edits downloaded.'); }
  // Freeze editing while saving/building so a late response cannot mark newer edits saved.
  async function locked(fn) {
    const controls = [...document.querySelectorAll('input,select,textarea')];
    const states = controls.map(c => c.disabled); controls.forEach(c => c.disabled = true);
    try { await fn(); } finally { controls.forEach((c,i) => c.disabled = states[i]); }
  }
  $('save').onclick = () => action(() => locked(save));
  $('build').onclick = () => action(() => locked(async () => {
    await exportROM();
  }));
  if(data.cutscenes)cutsceneUI=mountCutscenes({data,scripts:project.scripts,onChange:changed,onDialogue:showBank,onError:status,isBusy:()=>busy});
  showBank(); dirty = contentChanged(); ready = true; enabled(); status('ROM loaded. Edit dialogue or timing, then download.');
}

async function terrain() {
  for(const el of document.querySelectorAll('.tile-tools,.tile-palette'))el.remove();
  const data = localData;
  const sheet = $('sheet'), ctx = sheet.getContext('2d', {willReadFrequently:true});
  const tile = $('tile'), tc = tile.getContext('2d'), rc = $('repeat').getContext('2d');
  let level = '1', index = 0, loaded = false, drawing = false, last, picked = null, history = [], future = [];
  let originalPixels;
  const scroller=tile.parentElement,zoom=$('tile-zoom');let touchMode='paint',pixelSize=matchMedia('(max-width:767px)').matches?44:10;
  function setZoom(size){
    pixelSize=Math.max(1,Math.min(64,size));tile.style.setProperty('--tile-size',pixelSize*32+'px');scroller.style.setProperty('--grid-step',pixelSize+'px');scroller.style.setProperty('--grid-size',pixelSize*32+'px');
    const value=[...zoom.options].find(o=>+o.value===pixelSize);zoom.value=value?value.value:'';
  }
  function mode(value){touchMode=value;$('eyedropper').setAttribute('aria-pressed',String(value==='pick'));$('tile-navigate').setAttribute('aria-pressed',String(value==='navigate'));if(window.EditorTouch)window.EditorTouch.mode=value;const select=$('mobile-touch-mode');if(select)select.value=value;}
  $('eyedropper').onclick=()=>mode(touchMode==='pick'?'paint':'pick');
  $('tile-navigate').onclick=()=>mode(touchMode==='navigate'?'paint':'navigate');
  zoom.onchange=()=>setZoom(+zoom.value||Math.max(1,(scroller.clientWidth-2)/32));setZoom(pixelSize);
  window.EditorTouch={get mode(){return touchMode;},set mode(value){touchMode=value;$('eyedropper').setAttribute('aria-pressed',String(value==='pick'));$('tile-navigate').setAttribute('aria-pressed',String(value==='navigate'));},
    modes:[['paint','Paint pixels'],['pick','Pick colour'],['navigate','Pan / pinch zoom']],
    buttons:[['in','Zoom +'],['out','Zoom -'],['fit','Fit tile'],['pixels','44 px pixels'],['left','Pan left'],['right','Pan right'],['up','Pan up'],['down','Pan down']],
    action(action){if(action==='in')setZoom(pixelSize*1.5);if(action==='out')setZoom(pixelSize/1.5);if(action==='fit')setZoom((scroller.clientWidth-2)/32);if(action==='pixels')setZoom(44);const d={left:[-96,0],right:[96,0],up:[0,-96],down:[0,96]}[action];if(d)scroller.scrollBy(...d);}
  };window.dispatchEvent(new Event('editor-touch-ready'));
  currentData = data; originalData = structuredClone(data);
  terrainEdit = () => ({level,rgba:ctx.getImageData(0,0,272,136).data,original:originalPixels});
  contentChanged = () => {const value=terrainEdit(),changed=!!originalPixels&&StoryROM.pixelsChanged(originalPixels,value.rgba);if(loaded){if(changed)terrainSheets[level]=value;else delete terrainSheets[level];}return changed;};
  const tileKey = (pixels,i) => {
    let key=''; const x=(i%8)*34,y=Math.floor(i/8)*34;
    for(let r=0;r<32;r++)for(let c=0;c<32;c++){const p=4*((y+r)*272+x+c);key+=String.fromCharCode(...pixels.subarray(p,p+4));}
    return key;
  };
  const originals={};for(let lv=1;lv<=31;lv++)originals[lv]=project.sheet(lv);
  const buttons=[];
  function selectTile(i){if(!loaded||busy)return;index=Math.max(0,Math.min(31,i));picked=null;$('recolour').disabled=true;render();}
  $('tile-groups').replaceChildren();
  for(const [start,end,title] of [[0,20,'Shared by every level in this zone'],[20,32,'Level sub-bank']]){
    const group=document.createElement('section'),heading=document.createElement('h2'),grid=document.createElement('div');
    group.className='tile-group';heading.textContent=title;grid.className='tile-grid';group.append(heading,grid);$('tile-groups').append(group);
    for(let i=start;i<end;i++){
      const button=document.createElement('button'),preview=document.createElement('canvas'),label=document.createElement('span');
      preview.width=preview.height=32;preview.setAttribute('aria-hidden','true');label.textContent=`Tile ${i} / ${i<20?'Zone bank A':'Level sub-bank'}`;
      button.type='button';button.disabled=true;button.dataset.tile=i;button.append(preview,label);button.onclick=()=>selectTile(i);
      button.onkeydown=event=>{const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-4,ArrowDown:4}[event.key];if(step){event.preventDefault();selectTile(index+step);buttons[index].focus();}};
      buttons.push(button);grid.append(button);
    }
  }
  const keyCache=new WeakMap();
  function refreshTiles(){
    const pixels=ctx.getImageData(0,0,272,136).data,uses=new Map();
    for(let lv=1;lv<=31;lv++){
      const source=String(lv)===String(level)?pixels:(terrainSheets[lv]?.rgba||originals[lv]);
      if(!keyCache.has(source))keyCache.set(source,Array.from({length:32},(_,i)=>tileKey(source,i)));
      for(let i=0;i<32;i++){const key=keyCache.get(source)[i];if(!uses.has(key))uses.set(key,[]);uses.get(key).push([lv,i]);}
    }
    buttons.forEach((button,i)=>{button.disabled=false;button.firstChild.getContext('2d').drawImage(sheet,(i%8)*34,Math.floor(i/8)*34,32,32,0,0,32,32);
      button.dataset.uses=(uses.get(tileKey(pixels,i))||[]).filter(([lv,n])=>String(lv)!==String(level)||n!==i).map(([lv,n])=>`Level ${lv}, tile ${n}`).join('; ');
    });
  }
  const origin = () => [(index%8)*34, Math.floor(index/8)*34];
  function render() {
    const [x,y] = origin(); tc.clearRect(0,0,32,32); tc.drawImage(sheet,x,y,32,32,0,0,32,32);
    for(let r=0;r<3;r++) for(let c=0;c<3;c++) rc.drawImage(tile,c*32,r*32);
    $('tile-label').textContent = index < 20 ? 'Zone bank A / shared' : 'Level sub-bank';
    buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    $('tile-uses').textContent=buttons[index].dataset.uses?'Also used in '+buttons[index].dataset.uses:'No identical tiles in other levels or slots.';
    $('tile-number').value = index; $('undo').disabled = !history.length || busy; $('redo').disabled = !future.length || busy; renderPalette();
  }
  function snapshot() { future = []; history.push(ctx.getImageData(0,0,272,136)); if(history.length>30) history.shift(); }
  async function load() {
    if(project&&loaded){contentChanged();await persistSession();}
    const next = $('terrain-level').value;
    loaded = false; ready = false; enabled(); $('terrain-level').disabled = true;
    status('Loading tile sheet...');
    try {
      ctx.putImageData(new ImageData(originals[next],272,136),0,0);
      level = next; originalPixels = ctx.getImageData(0,0,272,136).data.slice();
      if(project&&terrainSheets[level])ctx.putImageData(new ImageData(terrainSheets[level].rgba,272,136),0,0);
      dirty = !!terrainSheets[level]; history = []; future = []; picked = null; loaded = true; ready = true;
      $('recolour').disabled = true; $('tile-number').disabled=false; refreshTiles(); render(); status(`Level ${level} ready. Select a tile, then paint.`);
    } finally { $('terrain-level').disabled = false; enabled(); }
  }
  for(let lv=1;lv<=31;lv++) option($('terrain-level'), lv, `Level ${lv} / ${data.banks[String(lv-1)]?.title || ''}`);
  $('terrain-level').onchange = () => action(load);
  sheet.onclick = event => {
    if(!loaded || busy) return;
    const box = sheet.getBoundingClientRect(), x = Math.floor((event.clientX-box.left)*272/box.width), y = Math.floor((event.clientY-box.top)*136/box.height);
    if(x%34>=32 || y%34>=32) return;
    index = Math.floor(y/34)*8 + Math.floor(x/34); picked = null; $('recolour').disabled = true; render();
  };
  $('tile-number').onchange = () => { if(busy) return; index = Math.min(31,Math.max(0,Number($('tile-number').value)||0)); index = Math.floor(index); picked = null; $('recolour').disabled = true; render(); };
  function point(event) { const box = tile.getBoundingClientRect(); return [Math.min(31,Math.max(0,Math.floor((event.clientX-box.left)*32/box.width))),Math.min(31,Math.max(0,Math.floor((event.clientY-box.top)*32/box.height)))]; }
  let tool='pencil', brush=1, secondary='#000000', clipboard=null, strokeStart=null, strokeImage=null;
  const tools=[['pencil','\u270e Pencil','B'],['eraser','\u232b Eraser','E'],['fill','\u25a7 Fill','G'],['line','\u2571 Line','L'],['rect','\u25a1 Rectangle','R'],['filled','\u25a0 Filled rectangle','Shift+R']];
  const toolbar=document.createElement('div');toolbar.className='actions tile-tools';tile.closest('.columns').before(toolbar);
  function choose(value){tool=value;mode(value==='pick'?'pick':'paint');for(const b of toolbar.querySelectorAll('[data-tool]'))b.setAttribute('aria-pressed',String(b.dataset.tool===tool));}
  for(const [value,label,key] of tools){const b=document.createElement('button');b.textContent=label;b.title=label+' ('+key+')';b.dataset.tool=value;b.onclick=()=>choose(value);toolbar.append(b);}
  function command(label,key,fn){const b=document.createElement('button');b.textContent=label;b.title=label+' ('+key+')';b.onclick=()=>{if(loaded&&!busy&&!drawing)fn();};toolbar.append(b);return b;}
  const size=document.createElement('select');size.setAttribute('aria-label','Brush size');for(const n of [1,2,3])option(size,n,n+' px');size.onchange=()=>brush=+size.value;toolbar.append(size);
  const swatches=document.createElement('div');swatches.className='actions tile-palette';toolbar.after(swatches);
  function renderPalette(){
    const colours=new Set(['#000000',$('colour').value]),[x,y]=origin(),px=ctx.getImageData(x,y,32,32).data;
    for(let i=0;i<px.length;i+=4)colours.add('#'+Array.from(px.slice(i,i+3),n=>n.toString(16).padStart(2,'0')).join(''));
    swatches.replaceChildren();const current=document.createElement('output');current.textContent='Colour '+$('colour').value;swatches.append(current);
    for(const c of [...colours].slice(0,64)){const b=document.createElement('button');b.className='tile-swatch';b.style.background=c;b.title=c;b.setAttribute('aria-label','Colour '+c);b.setAttribute('aria-pressed',String(c===$('colour').value));b.onclick=()=>{$('colour').value=c;renderPalette();};swatches.append(b);}
  }
  $('colour').oninput=renderPalette;
  function finish(){refreshTiles();render();changed();}
  function transform(kind){snapshot();const [x,y]=origin(),src=ctx.getImageData(x,y,32,32),out=ctx.createImageData(32,32);for(let r=0;r<32;r++)for(let c=0;c<32;c++){const [u,v]=kind==='h'?[31-c,r]:kind==='v'?[c,31-r]:[r,31-c];out.data.set(src.data.subarray((v*32+u)*4,(v*32+u)*4+4),(r*32+c)*4);}ctx.putImageData(out,x,y);finish();}
  function copyTile(){const [x,y]=origin();clipboard=ctx.getImageData(x,y,32,32);status('Tile copied.');}
  function pasteTile(){if(!clipboard)return;snapshot();ctx.putImageData(clipboard,...origin());finish();}
  function clearTile(){snapshot();ctx.fillStyle='#000000';ctx.fillRect(...origin(),32,32);finish();}
  command('\u2194 Flip H','H',()=>transform('h'));command('\u2195 Flip V','V',()=>transform('v'));command('\u21bb Rotate','T',()=>transform('rotate'));
  command('\u25a3 Copy','Ctrl+C',copyTile);command('\u25a3 Paste','Ctrl+V',pasteTile);
  command('+ Zoom','+',()=>setZoom(pixelSize*1.5));command('- Zoom','-',()=>setZoom(pixelSize/1.5));
  const grid=command('\u25a6 Grid','#',()=>{tile.parentElement.classList.toggle('pixel-grid');grid.setAttribute('aria-pressed',String(tile.parentElement.classList.contains('pixel-grid')));});
  $('eyedropper').textContent='\u2316 Pick colour';$('eyedropper').title='Pick colour (I)';$('eyedropper').onclick=()=>choose(touchMode==='pick'?'pencil':'pick');
  function paint(a,b) {
    const [ox,oy]=origin(),steps=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]),1);
    ctx.save();ctx.beginPath();ctx.rect(ox,oy,32,32);ctx.clip();ctx.fillStyle=tool==='eraser'?'#000000':$('colour').value;
    const dot=(x,y)=>ctx.fillRect(ox+x-Math.floor(brush/2),oy+y-Math.floor(brush/2),brush,brush);
    if(tool==='fill'){
      const px=ctx.getImageData(ox,oy,32,32),at=(a[1]*32+a[0])*4,target=Array.from(px.data.slice(at,at+4)),colour=$('colour').value.match(/\w\w/g).map(v=>parseInt(v,16)).concat(255),queue=[a],seen=new Set();
      while(queue.length){const [x,y]=queue.pop(),i=y*32+x;if(x<0||y<0||x>31||y>31||seen.has(i))continue;seen.add(i);if(!target.every((v,k)=>px.data[i*4+k]===v))continue;px.data.set(colour,i*4);queue.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);}ctx.putImageData(px,ox,oy);
    }else if(tool==='rect'||tool==='filled'){
      const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0])+1,h=Math.abs(a[1]-b[1])+1;
      if(tool==='filled')ctx.fillRect(ox+x,oy+y,w,h);else {for(let c=x;c<x+w;c++){dot(c,y);dot(c,y+h-1);}for(let r=y;r<y+h;r++){dot(x,r);dot(x+w-1,r);}}
    }else for(let n=0;n<=steps;n++)dot(Math.round(a[0]+(b[0]-a[0])*n/steps),Math.round(a[1]+(b[1]-a[1])*n/steps));
    ctx.restore();render();
  }
  function pickColour(event){
    if(!loaded || busy)return;
    const [x,y] = point(event), [ox,oy] = origin(); picked = [...ctx.getImageData(ox+x,oy+y,1,1).data].slice(0,3);
    $('colour').value = '#'+picked.map(n=>n.toString(16).padStart(2,'0')).join(''); $('recolour').disabled = false;renderPalette();
    status('Colour picked. Choose a replacement colour, then click Replace.');
  }
  const fingers=new Map();let nav=null;
  const gesture=()=>{const a=[...fingers.values()],b=a[1]||a[0];return {x:(a[0][0]+b[0])/2,y:(a[0][1]+b[1])/2,d:a.length>1?Math.hypot(a[0][0]-b[0],a[0][1]-b[1]):0};};
  tile.onpointerdown = event => {
    if(!loaded || busy || event.button!==0)return;event.preventDefault();tile.setPointerCapture(event.pointerId);
    if(touchMode==='pick'){pickColour(event);return;}
    if(touchMode==='navigate'){fingers.set(event.pointerId,[event.clientX,event.clientY]);nav=gesture();return;}
    snapshot(); drawing=true;last=point(event);strokeStart=last;strokeImage=ctx.getImageData(0,0,272,136);paint(last,last);
  };
  tile.onpointermove = event => {
    if(fingers.has(event.pointerId)){
      fingers.set(event.pointerId,[event.clientX,event.clientY]);const next=gesture();
      if(nav.d&&next.d){const ratio=next.d/nav.d,x=scroller.scrollLeft+nav.x-scroller.getBoundingClientRect().left,y=scroller.scrollTop+nav.y-scroller.getBoundingClientRect().top;setZoom(pixelSize*ratio);scroller.scrollLeft+=x*(ratio-1);scroller.scrollTop+=y*(ratio-1);}
      scroller.scrollLeft-=next.x-nav.x;scroller.scrollTop-=next.y-nav.y;nav=next;return;
    }
    if(drawing){const next=point(event);if(['line','rect','filled'].includes(tool)){ctx.putImageData(strokeImage,0,0);paint(strokeStart,next);}else if(tool!=='fill')paint(last,next);last=next;}
  };
  tile.onpointerup = tile.onpointercancel = event => { if(drawing){drawing=false;finish();}fingers.delete(event.pointerId);nav=fingers.size?gesture():null; };
  tile.oncontextmenu = event => {
    event.preventDefault();pickColour(event);
  };
  $('recolour').onclick = () => {
    if(!picked || busy) return; snapshot();
    const [x,y] = origin(), pixels = ctx.getImageData(x,y,32,32), target = $('colour').value.match(/\w\w/g).map(v=>parseInt(v,16));
    for(let p=0;p<pixels.data.length;p+=4) if(picked.every((v,k)=>pixels.data[p+k]===v)) target.forEach((v,k)=>pixels.data[p+k]=v);
    ctx.putImageData(pixels,x,y); refreshTiles(); render(); changed();
  };
  $('undo').onclick = () => { if(busy || drawing || !history.length) return; future.push(ctx.getImageData(0,0,272,136));ctx.putImageData(history.pop(),0,0);finish(); };
  $('redo').onclick = () => { if(busy || drawing || !future.length)return;history.push(ctx.getImageData(0,0,272,136));ctx.putImageData(future.pop(),0,0);finish(); };
  window.EditorShortcuts={help:['B pencil · E eraser · G fill · L line · R rectangle · Shift+R filled rectangle','I pick colour · X swap colours · H/V flip · T rotate · # grid','Ctrl+C/V copy/paste tile · Delete clear tile · +/- zoom'],action(key){if(!loaded||busy)return false;if(key==='escape'){if(drawing){ctx.putImageData(history.pop(),0,0);drawing=false;finish();}choose('pencil');return true;}if(drawing)return false;const keys={b:'pencil',e:'eraser',g:'fill',l:'line',r:'rect','shift+r':'filled',i:'pick'};if(keys[key])choose(keys[key]);else if(key==='undo')$('undo').click();else if(key==='redo')$('redo').click();else if(key==='copy')copyTile();else if(key==='paste')pasteTile();else if(key==='delete')clearTile();else if(key==='x'){const c=$('colour').value;$('colour').value=secondary;secondary=c;renderPalette();}else if(key==='h'||key==='v'||key==='t')transform(key==='t'?'rotate':key);else if(key==='#')grid.click();else if(key==='+'||key==='-')setZoom(pixelSize*(key==='+'?1.5:1/1.5));else return false;return true;}};
  choose('pencil');
  async function save() { download(await new Promise(resolve => sheet.toBlob(resolve, 'image/png')), 'terrain-sheet.png','image/png'); status('Edits downloaded.'); }
  $('save').onclick = () => action(save);
  $('build').onclick = () => action(() => exportROM());
  await load();
}

const start = () => document.body.dataset.page === 'dialogue' ? dialogue() : terrain();
window.EditorROMBeforeReplace=()=>!dirty||confirm('Discard current edits and load another ROM?');
$('rom').onchange = () => action(async () => {
  if (!window.ROMSession && !window.EditorROMBeforeReplace()) return;
  const file = $('rom').files[0]; if (!file) return;
  await window.LoadProgress?.start(['Checking your ROM']);
  const source=await window.ROMSession?.get();
  status('Reading dialogue banks and terrain metadata...');await new Promise(resolve=>setTimeout(resolve,0));
  await window.LoadProgress?.step('Reading dialogue and tilesets',.35);
  let next;try{next = new StoryROM.Project(new Uint8Array(await file.arrayBuffer()));}catch{throw Error('This ROM could not be read. Choose your unmodified SSSV US 1.0 ROM and try again.');}
  const saved=source?await ROMSession.read('story'):null,tiles=source?await ROMSession.read('terrain'):null;
  if(saved&&saved.hash===source?.hash){StoryROM.validate(next.original,saved.data);next.data=saved.data;if(!next.data.cutscenes){next.data.cutscenes=structuredClone(next.original.cutscenes);for(const [lv,records] of Object.entries(next.data.levels))for(const r of records)next.data.cutscenes[lv][r.i].args[r.op==='message'?1:0]=r.op==='message'?r.hold_seconds:r.frames;}}
  terrainSheets=tiles&&tiles.hash===source?.hash?tiles.sheets:{};
  project = next; localData = next.data; dirty = false; ready = false;
  let filename=$('rom-name');if(!filename){filename=document.createElement('output');filename.id='rom-name';$('rom').parentElement.after(filename);}filename.textContent=file.name;filename.title=file.name;
  for(const id of ['bank','lines','terrain-level']) if($(id)) $(id).replaceChildren();
  $('ips').disabled = true;
  $('save').textContent = document.body.dataset.page === 'dialogue' ? 'Download edits JSON' : 'Download sheet PNG';
  $('build').textContent = 'Save & build ROM';
  await window.LoadProgress?.step(document.body.dataset.page==='dialogue'?'Opening dialogue':'Building tilesets',.75);
  await start();
  window.LoadProgress?.done();
});
$('ips').onclick = () => action(() => exportROM(true));
for(const link of document.querySelectorAll('.global-nav>a'))link.addEventListener('click',async event=>{if(!project||event.ctrlKey||event.metaKey||event.shiftKey)return;event.preventDefault();await persistSession();if(!sessionSaved)return;location.href=link.href;});
