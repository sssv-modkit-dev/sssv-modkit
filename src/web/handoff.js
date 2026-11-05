// Editor -> Play handoff: SSSVHandoff.openPlay({level?, parts?, levelName?, partsName?, rom?, romName?, source})
// opens play.html in a new window, waits for its same-origin 'sssv-play-ready' message, then posts
// {type: 'sssv-build', ...} once. play-build.js fills its build panel from it; the user presses Build & Play there.
// rom is an optional in-memory Blob (the ROM already loaded in the editor). Nothing is written to storage.
(function (root) {
  'use strict';
  const WAIT_MS = 120000;
  function openPlay(payload, options) {
    payload = payload || {};
    if (payload.level == null && payload.parts == null) throw new Error('Nothing to build yet.');
    if (root.location.origin === 'null') throw new Error('Build & Play needs the page served over http(s), not opened as a file.');
    const message = { type: 'sssv-build' };
    for (const key of ['level', 'parts', 'levelName', 'partsName', 'rom', 'romName', 'source'])
      if (payload[key] != null) message[key] = payload[key];
    const win = root.open((options && options.url) || 'play.html', '_blank');
    if (!win) throw new Error('The browser blocked the Play window. Allow pop-ups for this site, or save your edits and open Play yourself.');
    let timer = null;
    const done = () => { root.removeEventListener('message', onMessage); if (timer) clearTimeout(timer); };
    function onMessage(event) {
      if (event.source !== win || event.origin !== root.location.origin) return;
      if (!event.data || event.data.type !== 'sssv-play-ready') return;
      done();
      win.postMessage(message, root.location.origin);
    }
    root.addEventListener('message', onMessage);
    timer = setTimeout(done, WAIT_MS);
    return win;
  }
  root.SSSVHandoff = { openPlay };
})(typeof window !== 'undefined' ? window : this);
