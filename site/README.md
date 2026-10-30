# SSSV Parts Lab

The public playground uses the same WebGL renderer and editing controls as the private viewer.
Its three demo creatures are independently authored procedural geometry in
`tools/viewer/js/demo-models.js`, covered by the project's CC0 dedication.
No game geometry, textures, extracted table, pose, or ROM is bundled.

Build from the repository root:

```text
python tools/check.py
python tools/build_viewer.py --public
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
by `tools/animal_table.py`, then your legally obtained US 1.0 ROM. Both are read
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

One finger or mouse drag orbits; pinch zooms and pans. Select a named part row
to edit on touch devices. Desktop users can also double-click a part.
