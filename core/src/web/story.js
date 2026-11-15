'use strict';
const $ = id => document.getElementById(id);
let dirty = false, busy = false, ready = false;
const status = text => { $('status').textContent = text; };
function changed() { dirty = true; status('Unsaved changes.'); }
function enabled() {
  for (const id of ['save','build']) $(id).disabled = busy || !ready;
}
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  if (!response.ok) { const error = await response.json(); throw Error(error.error || response.statusText); }
  return response.json();
}
async function action(fn) {
  if (busy) return;
  busy = true; enabled();
  try { await fn(); } catch (error) { status(error.message); }
  finally { busy = false; enabled(); }
}
function option(select, value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o); }
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });

async function dialogue() {
  const data = await api('/api/dialogue');
  let bank, line;
  const bytes = strings => 2 + Object.values(strings).reduce((n, s) => n + 4 + 2 * s.length, 0);
  function budget() {
    const used = bytes(data.banks[bank].strings), max = data.capacities[bank];
    $('budget').textContent = `${used} / ${max} bytes · ${max-used} remaining in bank ${bank}`;
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
    row.append(input); parent.append(row);
  }
  function showLine() {
    line = $('lines').value;
    const text = data.banks[bank].strings[line];
    $('text').disabled = text === undefined; $('text').value = text ?? '';
    $('line-title').textContent = line === '' ? 'No matching text' : `Text ${line}`;
    preview(text ?? ''); $('encoding').textContent = '';
    $('holds').replaceChildren();
    const records = Number(bank) < 31 ? data.levels[String(Number(bank)+1)] || [] : [];
    for (const r of records.filter(r => r.op === 'message' && String(r.text) === line)) timingInput($('holds'), r, 'hold_seconds', `Record ${r.i} · hold seconds`);
    if (!$('holds').children.length) $('holds').textContent = 'No decoded message timing for this line.';
  }
  function listLines(preferred = line) {
    $('lines').replaceChildren();
    for (const [id, text] of Object.entries(data.banks[bank].strings)) {
      if (!text.toLowerCase().includes($('search').value.toLowerCase())) continue;
      option($('lines'), id, `${id} · ${text.replace(/\n/g,' ' ).slice(0,110)}`);
    }
    if ([...$('lines').options].some(o => o.value === preferred)) $('lines').value = preferred;
    else $('lines').selectedIndex = 0;
    showLine();
  }
  function showBank() {
    bank = $('bank').value; $('search').value = '';
    listLines(); budget(); $('waits').replaceChildren();
    if (Number(bank) < 31) for (const r of data.levels[String(Number(bank)+1)] || []) {
      if (r.op === 'wait') timingInput($('waits'), r, 'frames', `Record ${r.i} · frames (30/s)`);
    }
  }
  for (const [id,b] of Object.entries(data.banks)) option($('bank'), id, `${Number(id)<31?'Level '+(Number(id)+1)+' / ':''}Bank ${id} · ${b.title || 'Untitled'}`);
  $('help').textContent = data.help;
  $('bank').disabled = false; $('bank').onchange = showBank; $('lines').onchange = showLine; $('search').oninput = () => listLines();
  $('text').oninput = () => {
    const text = $('text').value; data.banks[bank].strings[line] = text;
    const selected = $('lines').selectedOptions[0];
    if (selected) selected.textContent = `${line} · ${text.replace(/\n/g,' ').slice(0,110)}`;
    budget(); preview(text); changed();
    $('encoding').textContent = /^[\x20-\x7e\n]*$/.test(text) ? '' : 'Unsupported character: use plain ASCII and line breaks.';
  };
  async function save() { const result = await api('/api/save', {banks:data.banks, levels:data.levels}); dirty = false; status(result.message); }
  // Freeze editing while saving/building so a late response cannot mark newer edits saved.
  async function locked(fn) {
    const controls = [...document.querySelectorAll('input,select,textarea')];
    const states = controls.map(c => c.disabled); controls.forEach(c => c.disabled = true);
    try { await fn(); } finally { controls.forEach((c,i) => c.disabled = states[i]); }
  }
  $('save').onclick = () => action(() => locked(save));
  $('build').onclick = () => action(() => locked(async () => {
    await save(); status('Building story ROM. This may take a few minutes...');
    const result = await api('/api/build', {kind:'dialogue'}); status(result.message); $('log').textContent = result.log;
  }));
  showBank(); ready = true; enabled(); status('Ready. Changes save to local working JSON files.');
}

async function terrain() {
  const data = await api('/api/dialogue');
  const sheet = $('sheet'), ctx = sheet.getContext('2d', {willReadFrequently:true});
  const tile = $('tile'), tc = tile.getContext('2d'), rc = $('repeat').getContext('2d');
  let level = '1', index = 0, loaded = false, drawing = false, last, picked = null, history = [];
  const origin = () => [(index%8)*34, Math.floor(index/8)*34];
  function render() {
    const [x,y] = origin(); tc.clearRect(0,0,32,32); tc.drawImage(sheet,x,y,32,32,0,0,32,32);
    for(let r=0;r<3;r++) for(let c=0;c<3;c++) rc.drawImage(tile,c*32,r*32);
    $('tile-label').textContent = index < 20 ? 'Zone-wide tile' : 'Sub-bank tile';
    $('tile-number').value = index; $('undo').disabled = !history.length || busy;
  }
  function snapshot() { history.push(ctx.getImageData(0,0,272,136)); if(history.length>30) history.shift(); }
  async function load() {
    if (dirty && !confirm('Discard unsaved tile changes before changing level?')) { $('terrain-level').value = level; return; }
    const next = $('terrain-level').value;
    loaded = false; ready = false; enabled(); $('terrain-level').disabled = true;
    status('Loading tile sheet...');
    try {
      const response = await fetch('/api/sheet?level='+next);
      if (!response.ok) throw Error((await response.json()).error);
      const bitmap = await createImageBitmap(await response.blob());
      ctx.clearRect(0,0,272,136); ctx.drawImage(bitmap,0,0); bitmap.close();
      level = next; dirty = false; history = []; picked = null; loaded = true; ready = true;
      $('recolour').disabled = true; render(); status(`Level ${level} ready. Select a tile, then paint.`);
    } finally { $('terrain-level').disabled = false; enabled(); }
  }
  for(let lv=1;lv<=31;lv++) option($('terrain-level'), lv, `Level ${lv} · ${data.banks[String(lv-1)]?.title || ''}`);
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
  tile.onpointerdown = event => { if(!loaded || busy || event.button !== 0) return; snapshot(); drawing = true; last = point(event); tile.setPointerCapture(event.pointerId); paint(last,last); };
  tile.onpointermove = event => { if(drawing) { const next = point(event); paint(last,next); last = next; } };
  tile.onpointerup = tile.onpointercancel = () => { drawing = false; };
  tile.oncontextmenu = event => {
    event.preventDefault(); if(!loaded || busy) return;
    const [x,y] = point(event), [ox,oy] = origin(); picked = [...ctx.getImageData(ox+x,oy+y,1,1).data].slice(0,3);
    $('colour').value = '#'+picked.map(n=>n.toString(16).padStart(2,'0')).join(''); $('recolour').disabled = false;
    status('Colour picked. Choose a replacement colour, then click Replace.');
  };
  $('recolour').onclick = () => {
    if(!picked || busy) return; snapshot();
    const [x,y] = origin(), pixels = ctx.getImageData(x,y,32,32), target = $('colour').value.match(/\w\w/g).map(v=>parseInt(v,16));
    for(let p=0;p<pixels.data.length;p+=4) if(picked.every((v,k)=>pixels.data[p+k]===v)) target.forEach((v,k)=>pixels.data[p+k]=v);
    ctx.putImageData(pixels,x,y); render(); changed();
  };
  $('undo').onclick = () => { if(busy || !history.length) return; ctx.putImageData(history.pop(),0,0); render(); changed(); };
  async function save() { const result = await api('/api/sheet', {level, png:sheet.toDataURL('image/png').split(',')[1]}); dirty = false; status(result.message); }
  $('save').onclick = () => action(save);
  $('build').onclick = () => action(async () => {
    await save(); status('Building selected terrain + saved story ROM. This may take a few minutes...');
    const result = await api('/api/build', {kind:'terrain', level}); status(result.message); $('log').textContent = result.log;
  });
  await load();
}
(document.body.dataset.page === 'dialogue' ? dialogue() : terrain()).catch(error => status(`Local bridge unavailable: ${error.message}\nRun python tools/story_editor.py, then open its printed URL.`));
