/* Offline-bundle bridge: loaded into every page only by the local launcher.
   Adds a small panel: use the ROM from the bundle's rom/ folder, save downloads
   to out/, and open saved files with the user's own programs. */
(() => {
  'use strict';
  const H = { 'X-SSSV-Bundle': '1' };
  const blobs = new Map();
  const origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (obj) => { const u = origCreate(obj); if (obj instanceof Blob) blobs.set(u, obj); return u; };
  const origRevoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (u) => { blobs.delete(u); origRevoke(u); };

  const saveOn = () => localStorage.getItem('sssvBundleSave') !== 'off';
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const blob = this.download && blobs.get(this.href);
    if (!blob || !saveOn()) return origClick.call(this);
    saveToOut(blob, this.download).catch((e) => { toast('Could not save to out/ (' + e.message + '); downloading instead.'); origClick.call(this); });
  };

  async function api(path, opts) {
    const r = await fetch('/bundle/api/' + path, { credentials: 'same-origin', ...opts });
    if (!r.ok) throw Error((await r.text()).trim() || r.statusText);
    return r;
  }
  async function saveToOut(blob, name) {
    const clean = name.replace(/[^A-Za-z0-9 ._()+-]/g, '_').replace(/^[^A-Za-z0-9]+/, '') || 'download.bin';
    const r = await api('save?name=' + encodeURIComponent(clean), { method: 'POST', headers: H, body: blob });
    const saved = await r.json();
    toast('Saved to out/' + saved.name, saved.name);
    refresh();
  }
  async function openOut(name, how) {
    try { await api('open', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, how }) }); }
    catch (e) { toast(e.message); }
  }
  async function useRom(name) {
    const input = [...document.querySelectorAll('input[type=file]')].find((i) => /\.z64/i.test(i.accept || ''));
    if (!input) { toast('This page has no ROM picker. Open Guided build, Play or an editor first.'); return; }
    try {
      const buf = await (await api('rom?name=' + encodeURIComponent(name))).arrayBuffer();
      const dt = new DataTransfer();
      dt.items.add(new File([buf], name, { type: 'application/octet-stream' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      toast('Loaded ' + name + ' from rom/');
    } catch (e) { toast('Could not load ' + name + ': ' + e.message); }
  }

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, fn, title) => { const b = el('button', 'sb-btn', text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; };
  let panel, body, status = null;

  function toast(msg, outName) {
    const t = el('div', 'sb-toast');
    t.setAttribute('role', 'status');
    t.append(el('span', null, msg));
    if (outName) t.append(btn('Open', () => openOut(outName, 'default')), btn('Show in folder', () => openOut(outName, 'folder')));
    document.body.append(t);
    setTimeout(() => t.remove(), outName ? 9000 : 5000);
  }

  function render() {
    body.replaceChildren();
    const roms = status?.roms || [];
    body.append(el('h3', null, 'ROM (rom/ folder)'));
    if (!roms.length) body.append(el('p', 'sb-note', 'Put your US 1.0 .z64 in the rom/ folder, then press Refresh.'));
    for (const r of roms) { const row = el('div', 'sb-row'); row.append(el('span', 'sb-name', r.name), btn('Use here', () => useRom(r.name), 'Load it into this page\'s ROM picker')); body.append(row); }

    body.append(el('h3', null, 'Builds (out/ folder)'));
    const lab = el('label', 'sb-note'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = saveOn();
    cb.addEventListener('change', () => localStorage.setItem('sssvBundleSave', cb.checked ? 'on' : 'off'));
    lab.append(cb, ' Save downloads to out/'); body.append(lab);
    const outs = (status?.out || []).filter((f) => !f.name.startsWith('.'));
    if (!outs.length) body.append(el('p', 'sb-note', 'Nothing yet. Built ROMs and patches land here.'));
    for (const f of outs.slice(-12).reverse()) {
      const row = el('div', 'sb-row'); row.append(el('span', 'sb-name', f.name));
      row.append(btn('Open', () => openOut(f.name, 'default'), 'Open with the program your system uses for this file type'));
      if (status.emulator && /\.(z64|n64|v64)$/i.test(f.name)) row.append(btn('Emulator', () => openOut(f.name, 'emulator'), 'Open with the emulator set in settings.json'));
      row.append(btn('Folder', () => openOut(f.name, 'folder'), 'Show in folder'));
      body.append(row);
    }
    const foot = el('div', 'sb-row'); foot.append(btn('Refresh', refresh)); body.append(foot);
  }

  async function refresh() {
    try { status = await (await api('status')).json(); } catch (e) { status = null; }
    if (body) render();
  }

  function mount() {
    panel = el('aside', 'sb-panel');
    panel.setAttribute('aria-label', 'Offline bundle');
    const head = btn('Bundle ▾', () => { panel.classList.toggle('sb-open'); if (panel.classList.contains('sb-open')) refresh(); }, 'ROM folder, saved builds and your emulator');
    head.classList.add('sb-head');
    body = el('div', 'sb-body');
    panel.append(head, body);
    document.body.append(panel);
    refresh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
