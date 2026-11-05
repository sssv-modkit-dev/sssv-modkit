# SSSV Parts Lab

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

Deploy **only `site/dist`**. The generated `index.html` also works as a downloaded,
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

The upstream [N64 core example](https://emulatorjs.org/docs/systems/nintendo-64/)
and [CDN versioning](https://emulatorjs.org/docs/cdn/) document the integration.
Game compatibility, mobile performance, controller behaviour and save persistence
still require direct testing. Parts Lab JSON must first be built into a ROM with
the local builder. The private level editor is not bundled in the public site.

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
- `animals.json`: bear, dog, fox, sheep and seagull parts (base variants) in Parts Lab demo shape.
- `heads/dog.png`, `fox.png`, `sheep.png`, `seagull.png`: 128 px head icons rendered from those parts.
  `heads/bear.png` is the existing `src/viewer/assets/icon.png`, copied at build time.

Regenerate with your own ROM: `python src/animal_table.py --from-rom --out TABLE`, then
`node src/build_demo_assets.js rom/sssv.z64 TABLE.json`. Pages builds never read a ROM.
