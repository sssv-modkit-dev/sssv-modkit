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
async function bridgeAPI(path, data) {
  let response;
  try { response = await fetch(path, {...(data === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)}), ...(path === '/api/dialogue' ? {signal:AbortSignal.timeout(5000)} : {})}); }
  catch { throw Error('The optional Python bridge is not available on this page.'); }
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('The optional Python bridge is not available on this page.');
  let result;
  try { result = await response.json(); } catch { throw Error('The Python bridge returned an unreadable response. Check that it is running, then check again.'); }
  if (!response.ok) throw Error(result.error || 'The Python bridge could not complete that request.');
  return result;
}
async function api(path, data) {
  if (project) {
    if (path === '/api/dialogue') return localData;
    if (path === '/api/save') { localData.banks = data.banks; localData.levels = data.levels; return {message:'Edits ready in browser memory.'}; }
  }
  return bridgeAPI(path, data);
}
async function action(fn) {
  if (busy) return;
  busy = true; enabled();
  try { await fn(); } catch (error) { status(error.message); }
  finally { busy = false; enabled(); }
}
function option(select, value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o); }
window.addEventListener('beforeunload', event => { if ((!project&&dirty) || (project&&!sessionSaved) || busy) { event.preventDefault(); event.returnValue = ''; } });

async function dialogue() {
  const data = await api('/api/dialogue');
  currentData = data; originalData = structuredClone(project?project.original:data);
  terrainEdit = () => undefined;
  contentChanged = () => StoryROM.hasChanges(originalData, data);
  let bank, line;
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
    input.oninput = () => { record[field] = input.value === '' ? null : Number(input.value); changed(); };
    row.append(input);
    if (field === 'frames') { const out = document.createElement('output'); out.className = 'mut'; const show = () => { const f = Number(input.value) || 0; out.textContent = ` ≈ ${(f / 30).toFixed(f < 300 ? 1 : 0)} s`; }; input.addEventListener('input', show); show(); row.append(out); }
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
  async function save() { if(!project) await api('/api/save', {banks:data.banks, levels:data.levels}); download(JSON.stringify({banks:data.banks,levels:data.levels},null,2), 'story-edits.json', 'application/json'); status('Edits downloaded.'); }
  // Freeze editing while saving/building so a late response cannot mark newer edits saved.
  async function locked(fn) {
    const controls = [...document.querySelectorAll('input,select,textarea')];
    const states = controls.map(c => c.disabled); controls.forEach(c => c.disabled = true);
    try { await fn(); } finally { controls.forEach((c,i) => c.disabled = states[i]); }
  }
  $('save').onclick = () => action(() => locked(save));
  $('build').onclick = () => action(() => locked(async () => {
    if(project) { await exportROM(); return; }
    await save(); status('Building story ROM. This may take a few minutes...');
    const result = await api('/api/build', {kind:'dialogue'}); status(result.message); $('log').textContent = result.log;
  }));
  showBank(); dirty = contentChanged(); ready = true; enabled(); status(project ? 'ROM loaded. Edit dialogue or timing, then download.' : 'Ready. Changes save to local working JSON files.');
}

async function terrain() {
  const data = await api('/api/dialogue');
  const sheet = $('sheet'), ctx = sheet.getContext('2d', {willReadFrequently:true});
  const tile = $('tile'), tc = tile.getContext('2d'), rc = $('repeat').getContext('2d');
  let level = '1', index = 0, loaded = false, drawing = false, last, picked = null, history = [];
  let originalPixels;
  const scroller=tile.parentElement,zoom=$('tile-zoom');let touchMode='paint',pixelSize=matchMedia('(max-width:767px)').matches?44:10;
  function setZoom(size){
    pixelSize=Math.max(1,Math.min(64,size));tile.style.setProperty('--tile-size',pixelSize*32+'px');
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
  const origin = () => [(index%8)*34, Math.floor(index/8)*34];
  function render() {
    const [x,y] = origin(); tc.clearRect(0,0,32,32); tc.drawImage(sheet,x,y,32,32,0,0,32,32);
    for(let r=0;r<3;r++) for(let c=0;c<3;c++) rc.drawImage(tile,c*32,r*32);
    $('tile-label').textContent = index < 20 ? 'Zone-wide tile' : 'Sub-bank tile';
    $('tile-number').value = index; $('undo').disabled = !history.length || busy;
  }
  function snapshot() { history.push(ctx.getImageData(0,0,272,136)); if(history.length>30) history.shift(); }
  async function load() {
    if (dirty && !project && !confirm('Discard unsaved tile changes before changing level?')) { $('terrain-level').value = level; status('Level change cancelled. Your tile changes are still here.'); return; }
    if(project&&loaded){contentChanged();await persistSession();}
    const next = $('terrain-level').value;
    loaded = false; ready = false; enabled(); $('terrain-level').disabled = true;
    status('Loading tile sheet...');
    try {
      if(project) { ctx.putImageData(new ImageData(project.sheet(next),272,136),0,0); } else {
      const response = await fetch('/api/sheet?level='+next);
      if (!response.ok) throw Error((await response.json()).error);
      const bitmap = await createImageBitmap(await response.blob());
      ctx.clearRect(0,0,272,136); ctx.drawImage(bitmap,0,0); bitmap.close(); }
      level = next; originalPixels = ctx.getImageData(0,0,272,136).data.slice();
      if(project&&terrainSheets[level])ctx.putImageData(new ImageData(terrainSheets[level].rgba,272,136),0,0);
      dirty = !!terrainSheets[level]; history = []; picked = null; loaded = true; ready = true;
      $('recolour').disabled = true; render(); status(`Level ${level} ready. Select a tile, then paint.`);
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
  function paint(a,b) {
    const [ox,oy] = origin(), steps = Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]),1);
    ctx.fillStyle = $('colour').value;
    for(let n=0;n<=steps;n++) ctx.fillRect(ox+Math.round(a[0]+(b[0]-a[0])*n/steps),oy+Math.round(a[1]+(b[1]-a[1])*n/steps),1,1);
    render(); changed();
  }
  function pickColour(event){
    if(!loaded || busy)return;
    const [x,y] = point(event), [ox,oy] = origin(); picked = [...ctx.getImageData(ox+x,oy+y,1,1).data].slice(0,3);
    $('colour').value = '#'+picked.map(n=>n.toString(16).padStart(2,'0')).join(''); $('recolour').disabled = false;
    status('Colour picked. Choose a replacement colour, then click Replace.');
  }
  const fingers=new Map();let nav=null;
  const gesture=()=>{const a=[...fingers.values()],b=a[1]||a[0];return {x:(a[0][0]+b[0])/2,y:(a[0][1]+b[1])/2,d:a.length>1?Math.hypot(a[0][0]-b[0],a[0][1]-b[1]):0};};
  tile.onpointerdown = event => {
    if(!loaded || busy || event.button!==0)return;event.preventDefault();tile.setPointerCapture(event.pointerId);
    if(touchMode==='pick'){pickColour(event);return;}
    if(touchMode==='navigate'){fingers.set(event.pointerId,[event.clientX,event.clientY]);nav=gesture();return;}
    snapshot(); drawing=true;last=point(event);paint(last,last);
  };
  tile.onpointermove = event => {
    if(fingers.has(event.pointerId)){
      fingers.set(event.pointerId,[event.clientX,event.clientY]);const next=gesture();
      if(nav.d&&next.d){const ratio=next.d/nav.d,x=scroller.scrollLeft+nav.x-scroller.getBoundingClientRect().left,y=scroller.scrollTop+nav.y-scroller.getBoundingClientRect().top;setZoom(pixelSize*ratio);scroller.scrollLeft+=x*(ratio-1);scroller.scrollTop+=y*(ratio-1);}
      scroller.scrollLeft-=next.x-nav.x;scroller.scrollTop-=next.y-nav.y;nav=next;return;
    }
    if(drawing){const next=point(event);paint(last,next);last=next;}
  };
  tile.onpointerup = tile.onpointercancel = event => { drawing=false;fingers.delete(event.pointerId);nav=fingers.size?gesture():null; };
  tile.oncontextmenu = event => {
    event.preventDefault();pickColour(event);
  };
  $('recolour').onclick = () => {
    if(!picked || busy) return; snapshot();
    const [x,y] = origin(), pixels = ctx.getImageData(x,y,32,32), target = $('colour').value.match(/\w\w/g).map(v=>parseInt(v,16));
    for(let p=0;p<pixels.data.length;p+=4) if(picked.every((v,k)=>pixels.data[p+k]===v)) target.forEach((v,k)=>pixels.data[p+k]=v);
    ctx.putImageData(pixels,x,y); render(); changed();
  };
  $('undo').onclick = () => { if(busy || !history.length) return; ctx.putImageData(history.pop(),0,0); render(); changed(); };
  async function save() { if(project) { download(await new Promise(resolve => sheet.toBlob(resolve, 'image/png')), 'terrain-sheet.png','image/png'); status('Edits downloaded.'); return; } const result = await api('/api/sheet', {level, png:sheet.toDataURL('image/png').split(',')[1]}); status(result.message); }
  $('save').onclick = () => action(save);
  $('build').onclick = () => action(async () => {
    if(project) { await exportROM(); return; }
    await save(); status('Building selected terrain + saved story ROM. This may take a few minutes...');
    const result = await api('/api/build', {kind:'terrain', level}); status(result.message); $('log').textContent = result.log;
  });
  await load();
}

const start = () => document.body.dataset.page === 'dialogue' ? dialogue() : terrain();
window.EditorROMBeforeReplace=()=>!dirty||confirm('Discard current edits and load another ROM?');
$('rom').onchange = () => action(async () => {
  if (!window.ROMSession && !window.EditorROMBeforeReplace()) return;
  const file = $('rom').files[0]; if (!file) return;
  const source=await window.ROMSession?.get();
  status('Reading dialogue banks and terrain metadata...');await new Promise(resolve=>setTimeout(resolve,0));
  let next;try{next = new StoryROM.Project(new Uint8Array(await file.arrayBuffer()));}catch{throw Error('This ROM could not be read. Choose your unmodified SSSV US 1.0 ROM and try again.');}
  const saved=source?await ROMSession.read('story'):null,tiles=source?await ROMSession.read('terrain'):null;
  if(saved&&saved.hash===source?.hash){StoryROM.validate(next.original,saved.data);next.data=saved.data;}
  terrainSheets=tiles&&tiles.hash===source?.hash?tiles.sheets:{};
  project = next; localData = next.data; dirty = false; ready = false;
  let filename=$('rom-name');if(!filename){filename=document.createElement('output');filename.id='rom-name';$('rom').parentElement.after(filename);}filename.textContent=file.name;filename.title=file.name;
  for(const id of ['bank','lines','terrain-level']) if($(id)) $(id).replaceChildren();
  $('ips').disabled = true;
  $('save').textContent = document.body.dataset.page === 'dialogue' ? 'Download edits JSON' : 'Download sheet PNG';
  $('build').textContent = 'Save & build ROM';
  $('bridge-setup').hidden = true;
  await start();
});
$('ips').onclick = () => action(() => exportROM(true));
for(const link of document.querySelectorAll('.global-nav>a'))link.addEventListener('click',async event=>{if(!project||event.ctrlKey||event.metaKey||event.shiftKey)return;event.preventDefault();await persistSession();if(!sessionSaved)return;location.href=link.href;});
const useBridge = () => action(async () => {
  // Probe before replacing a working in-browser project.
  $('bridge-setup').hidden = false;
  try { await bridgeAPI('/api/dialogue'); }
  catch { status('The optional Python bridge is not available on this page. Follow the setup below, or keep editing your ROM in this browser.'); return; }
  if(dirty && !confirm('Discard current edits and use the bridge?')) return;
  project = null; localData = null; ready = false; dirty = false;
  $('ips').disabled = true; $('save').textContent = document.body.dataset.page === 'dialogue' ? 'Download edits JSON' : 'Save sheet PNG';
  $('build').textContent = 'Save & build ROM';
  for(const id of ['bank','lines','terrain-level']) if($(id)) $(id).replaceChildren();
  await start();
  $('bridge-setup').hidden = true;
});
$('bridge').onclick = $('bridge-check').onclick = useBridge;
