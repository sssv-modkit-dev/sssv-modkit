# SSSV Model Editor

The public playground uses the same WebGL renderer and editing controls as the private viewer.
Its three demo creatures are independently authored procedural geometry in
`src/viewer/js/demo-models.js`, covered by the project's CC0 dedication.
No ROM, extracted table or pose is bundled. The owner has approved a small set of game assets
for the public demos (see **Bundled demo assets** below); they are not CC0.

Build from the repository root:

```text
python src/check.py
python src/build_viewer.py --public
python -m http.server 8765 --directory site/dist
```

Deploy **only `site/dist`**. The generated `model_editor.html` (Model Editor; `index.html` is the landing page) also works as a downloaded,
offline file; clipboard sharing may require HTTPS or localhost. The public builder
never searches for private inputs and rejects a positional animal table.
The private builder now defaults to `viewers/parts_viewer.html`; an explicit old
output path remains supported.

## Hosting

GitHub Pages: in repository Settings → Pages select **GitHub Actions**. Merge
`.github/workflows/parts-lab-pages.yml` into `main`, or run its manual dispatch.
The workflow runs ROM-free checks and uploads only the public build directory.
The same `dist` directory can be served by Sites or another static host.

## Local game mode

Expand **Open your SSSV files**. Choose the original `animal_table.json` generated
by `src/animal_table.py`, then your legally obtained US 1.0 ROM. Both are read
with browser file APIs; no upload endpoint or analytics is used. The table stays
in memory. ROM persistence is opt-in; **Forget saved ROM** removes the stored copy.
Private builds retain their embedded table and existing local restore support.

Game mode shows the existing exploded parts workbench; assembled game animals
still require a separately generated pose JSON. Demos are assembled from original
geometry positioned in a shared coordinate system, not game skeletons.

## Demo presets

Demo exports use `sssv-parts-lab-demo-v1`, separate from game patch configs. They
contain known model IDs, palette, mesh edits, supported bend/twist settings, and
exploded mode. Share links encode these settings in the URL fragment (not sent
in the HTTP request). ROM bytes, imported game tables, extracted meshes, and
game configs are excluded. Custom labels, dragged part positions and camera
positions are browser-local and are not included in presets.

Use **Save edits** to download a JSON file and **Open edits** to load it again.
In game mode these buttons save and open builder configs; demo presets stay in
their separate demo format. Neither file contains the ROM.

One finger or mouse drag orbits; pinch zooms and pans. Select a named part row
to edit on touch devices. Desktop users can also double-click a part.

## Browser play

The public build also writes `play.html` and `play.js`. Select a local uncompressed
N64 ROM or a patched build; the launcher passes a browser blob URL to EmulatorJS
4.2.3. It fetches the loader and N64 core from the upstream CDN only after Load
game is clicked. No ROM is bundled or uploaded by the launcher. The CDN code runs
in the same page and can access the chosen ROM, so this is not an isolated offline
sandbox. Threads are disabled because GitHub Pages lacks COOP/COEP headers.

### Builder entry (in-memory ROM)

`play.js` exposes `window.SSSVPlay.startGame(blob, name)`, which runs the same
validation (size, all three byte orders, WebGL 2) and start path as the file picker.
A blob cannot survive a page navigation, so a builder on another page should open
Play and post the ROM once Play reports ready:

```js
const w = window.open('play.html');
addEventListener('message', e => {
  if (e.origin !== location.origin || e.source !== w || e.data?.type !== 'sssv-play-ready') return;
  w.postMessage({type: 'sssv-rom', name: 'patched.z64', blob: romBlob}, location.origin);
});
```

Play posts `{type: 'sssv-play-ready'}` to its opener when loaded. It accepts
`{type: 'sssv-rom', name, buffer | blob}` (an ArrayBuffer or a Blob, not both) only
from its own origin and ignores any other message. One game starts per page load.
The ROM stays in memory and is never persisted.

The upstream [N64 core example](https://emulatorjs.org/docs/systems/nintendo-64/)
and [CDN versioning](https://emulatorjs.org/docs/cdn/) document the integration.
Game compatibility, mobile performance, controller behaviour and save persistence
still require direct testing. Model Editor JSON must first be built into a ROM with
the local builder. The private level editor is not bundled in the public site.

## In-browser builder (Pyodide)

`builder.js` builds a patched ROM and IPS in the browser from the user's ROM plus a
level project/diff JSON and/or a Parts config (single config or pack). A Web Worker
(`builder-worker.js`, an ES module worker) runs the repository's own Python (`py/*.py`, copied from `src/`)
in [Pyodide](https://pyodide.org/) 314.0.7, which it downloads from the jsDelivr CDN
on the first build (about 6–7 MB over the network, about 12 MB unpacked, then cached). That third-party code runs in the worker.
Output matches `build_levels.py` / `make_animal_mods.py` byte for byte, with the same
checks: animal edits need the unmodified US 1.0 ROM, and the animal table is derived
from that ROM in memory (`animal_table.py --from-rom`); nothing ROM-derived is shipped.
The ROM is never uploaded or persisted.

```js
const result = await SSSVBuilder.build(
  {rom: romFile, level: projectFile, parts: partsFile, relocate: false, newAnimals: false},
  {onProgress: ({stage, detail, ms}) => show(detail)});
// result: {rom: Blob, ips: Blob, romSha1, sourceSha1, log: [lines], timings: {stage: ms}}
```

`rom` is a File, Blob, ArrayBuffer or typed array (copied, not detached); `level` and
`parts` are a File/Blob, JSON text or a parsed object (at least one is required).
A project's attached Parts config is used automatically; giving `parts` as well is
an error. Errors reject with the CLI's message. Progress stages: `runtime` (first
build only), `rom`, `levels`, `table`, `animals`, `ips`, `done`. Builds run one at a
time in one warm worker; `SSSVBuilder.terminate()` frees it. Set
`SSSVBuilder.workerUrl` before the first build if the files live elsewhere; the
worker reads Python from `py/` beside itself, or from `?py=<dir>/` on its URL.

Worker protocol: post `{type: 'build', id, rom: ArrayBuffer, level?, parts?, options?:
{relocate, new_animals}}`; it replies `{type: 'progress', id, stage, detail, ms}`, then
`{type: 'done', id, rom: ArrayBuffer, ips: ArrayBuffer, romSha1, sourceSha1, log,
timings}` (buffers transferred) or `{type: 'error', id, message}`. Hand the ROM blob
to Play with `SSSVPlay.startGame(result.rom, 'patched.z64')` on the same page.

Build panel: `play.html` has a "Build from your edits" panel (`play-build.js`). It takes
the ROM plus a level project/diff and/or a Parts config, shows the worker's progress
stages, starts the patched ROM in the emulator, and offers Download IPS and Download ROM.
The build log is in a collapsible area. Wrong-ROM messages from the CLI get a hint added.
Relocate and new animals are under "Advanced"; new animals are not game-verified.
Levels and Model Editor (public build) have a Build & Play button. `handoff.js` opens
`play.html` with `window.open`, waits for its same-origin `sssv-play-ready`, then posts
`{type: 'sssv-build', level?, parts?, levelName?, partsName?, rom?, romName?, source}` once.
`rom` is the ROM already loaded on that page, sent as an in-memory Blob. If it is
missing, the user picks the ROM on Play. Nothing is written to storage. The handoff needs
http(s) (not `file://`) and is blocked if pop-ups are not allowed.

## Levels

The public build includes `levels.html` and the `levels/` source bundle. It opens the
bundled demo level (no ROM needed); the **Levels** button opens a gallery of level cards.
For every level, use **Open local ROM** and choose
your own stock or compatible modded US ROM; stage records, ground textures, and supported prop meshes
are decoded locally. Named categories, rectangle selection, group movement,
undo/redo and project files are described in [the editor guide](../docs/guides/LEVEL-EDITOR.md).
No game data is read during the public build. Animal shapes are approximate,
terrain is read-only, and portal hooks remain separate.

## Bundled demo assets

Committed under `src/web/demo/` and copied to `dist/demo/` (owner-approved, 2026-11-05;
third-party game content, see `NOTICE.md`):

- `level-4.json`: stage 4 (terrain, texture atlas, spawn records, and the 26 prop meshes that stage uses).
- `animals.json`: bear, dog, fox, sheep and seagull parts (base variants) in Model Editor demo shape.
- `heads/dog.png`, `fox.png`, `sheep.png`, `seagull.png`: 128 px head icons rendered from those parts.
  `heads/bear.png` is the existing `src/viewer/assets/icon.png`, copied at build time.

Regenerate with your own ROM: `python src/animal_table.py --from-rom --out TABLE`, then
`node src/build_demo_assets.js rom/sssv.z64 TABLE.json`. Pages builds never read a ROM.
