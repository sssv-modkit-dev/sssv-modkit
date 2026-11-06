# Network audit

Every network request the public pages can make. The public build (`python src/build_viewer.py --public`) puts all of it on one origin; nothing is loaded from a CDN or any third-party host, and **ROM bytes are never uploaded** (no page contains code that sends user data anywhere: there is no `XMLHttpRequest`/`fetch` with a body, `sendBeacon`, `WebSocket` or form submission).

Audited by grepping `src/web`, `src/viewer`, `src/levels` for `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `import(`, `new Worker`, `<script src>`, `<link href>`, `img src`/`new Image`, `window.open`, and by reading the EmulatorJS 4.2.3 loader and `emulator.min.js`. Re-checked in headless Chrome by logging every request (only same-origin URLs and `blob:`/`data:` URLs appeared).

## Enforcement

Each page carries a `Content-Security-Policy` meta tag starting from `default-src 'none'`, so a request not listed below is blocked by the browser, not just absent from the code. Exceptions:

| Page | Directive | Why |
|---|---|---|
| all but index | `style-src 'unsafe-inline'` | pages ship inline `<style>` and set styles on generated elements; no script runs from this |
| model-editor | `script-src 'sha256-...'` | its single inline script is pinned by hash (computed at build time); no `'unsafe-inline'` |
| level-editor, play | `img-src data: blob:` | textures and ROM-derived images are created in the browser |
| play | `script-src blob:` | EmulatorJS runs the emulator core as a script built from a Blob in memory |
| play | `'wasm-unsafe-eval'` | WebAssembly cores |
| play | `'unsafe-eval'` | the Emscripten-built N64 cores evaluate generated strings (observed: they fail to start without it). Mitigated by `connect-src 'self' blob:`, no third-party hosts and `form-action 'none'` |
| play | `worker-src blob:`, `connect-src blob:` | EmulatorJS unpacks the 7z core in a Blob worker and reads your ROM from a `blob:` URL |
| redirects | `script-src 'sha256-...'` | the one-line `location.replace` script |

Limits: a `<meta>` CSP does not apply to the Pyodide worker (`builder-worker.js` is a separate document with no headers on GitHub Pages) and cannot set `frame-ancestors`. The worker's only requests are the ones in the table below. `tests/test_public_build.py` checks every built page for the CSP, the noscript note, the page's favicon, hash-pinned inline scripts, and the absence of third-party URLs.

## Requests by page

Paths are relative to the site root. "Always" means on opening the page.

### index.html
| Request | When | Sent |
|---|---|---|
| `favicon.svg` (`<link rel=icon>`) | always | nothing |

Links to the other pages and to GitHub are ordinary navigation (only on click).

### model-editor.html (also `parts_lab.html`, which redirects)
| Source | Request | When |
|---|---|---|
| `<link rel=icon>` | `favicon-model-editor.svg` | always |
| `src/viewer/js/parts-lab.js:60` | `demo/heads/<name>.png` (8 demo heads; three original creatures have none and fall back to a placeholder, which shows as 404 in the console) | always |
| `src/viewer/js/app.js` | none; the page is one inline script. Your ROM and table are read with the File API; the optional "Remember ROM" uses IndexedDB (local) | on your action |
| `src/web/handoff.js:15` | `window.open('play.html')` plus a same-origin `postMessage` of your edit JSON (and the ROM, if loaded) | on Build & Play |

### level-editor.html (also `levels.html`)
| Source | Request | When |
|---|---|---|
| `<link rel=stylesheet>`, `<script src>` | `levels/levels.css`, `levels/{rom,selection,palette,runtime,gallery,loader}.js`, `handoff.js`, `favicon-level-editor.svg` | always |
| `levels/loader.js:37` | `fetch('demo/level-4.json')` (GET, no body) | always unless `?rom=1` |
| `levels/loader.js:9`, `gallery.js:33`, `editor.js:92` | `demo/heads/<name>.png` | always |
| `levels/runtime.js:23` | texture atlas from a `data:` URL (embedded in the demo JSON or decoded from your ROM) | always |
| `handoff.js` | as above | on Build & Play |

### play.html
| Source | Request | When |
|---|---|---|
| `<script src>`, icon | `builder.js`, `play-build.js`, `play.js`, `favicon-build-play.svg` | always |
| `builder.js:20` | `new Worker('builder-worker.js', {type:'module'})`, which imports `builder-core.js` | first Build & Play |
| `builder-worker.js:14` | `fetch('py/<module>.py')` for the 8 modules listed in `builder-core.js` (GET) | first Build & Play |
| `builder-worker.js:25` | `import('vendor/pyodide/pyodide.mjs')`; Pyodide then fetches `pyodide.asm.mjs`, `pyodide.asm.wasm`, `python_stdlib.zip`, `pyodide-lock.json` from the same folder (about 20 MB) | first Build & Play |
| `play.js:35` | `<script src="vendor/emulatorjs/data/loader.js">`; it adds `emulator.min.js` and `emulator.min.css` | Load game |
| EmulatorJS (`emulator.min.js`) | `cores/reports/<core>.json`, `cores/<core>[-legacy]-wasm.data` (1 to 1.5 MB), `compression/extract7z.js` (all under `vendor/emulatorjs/data/`), then `blob:` URLs for the unpacked core and your ROM | Load game |

Pages can also be reached with a `?` query or `#` hash (share links, view state); these are read locally and never sent.

## EmulatorJS options that could phone home

Checked in `loader.js` and `emulator.min.js` (4.2.3):

- **Update check** (`checkForUpdates` fetches `https://cdn.emulatorjs.org/stable/data/version.json`): runs only when `EJS_DEBUG_XX` is set or the page is served from `localhost`/`127.0.0.1`. Never on the published site. On a local test server the request is blocked by the CSP and shows as a console error; it is harmless.
- **Core fallback**: if a core file returns 404, EmulatorJS retries on `cdn.emulatorjs.org`. The vendored cores exist, and the CSP blocks the fallback. (Third-party code; not patched.)
- **Netplay** (`netplay.emulatorjs.org`, Socket.IO): only active with `EJS_DEBUG_XX` and `EJS_EXPERIMENTAL_NETPLAY` and a game id; none is set, so the button is hidden.
- **Ads** (`EJS_AdUrl`): set to empty in `play.js`.
- **Localization** (`localization/<lang>.json`): `play.js` sets `EJS_language='en-US'` and `EJS_disableAutoLang=false`, so no language file is requested.
- **Threads/SharedArrayBuffer**: disabled (`EJS_threads=false`), so the `-thread` cores are neither needed nor vendored.
- Not vendored because not used: `socket.io` (bundled in `emulator.min.js`, unused), zip/rar helpers are vendored but run only if you supply a zipped ROM, `ppsspp-assets.zip` and the unminified `src/*.js`.

## Third-party code and its integrity

`tools/vendor_deps.py` downloads Pyodide 314.0.7, EmulatorJS 4.2.3 and the `mupen64plus_next` and `parallel_n64` cores at build time (the only time the build touches the network) and rejects any file whose SHA-256 differs from `tools/vendor-manifest.json`. The result is under `vendor/` in the built site, together with each project's license; see `NOTICE.md`. The binaries are not committed.
