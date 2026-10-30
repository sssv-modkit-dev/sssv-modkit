# Using the viewer

The viewer is a local HTML page for inspecting animal parts and trying edits.
First [generate the animal table](GETTING-STARTED.md#2-generate-the-animal-table), then build the page:

```sh
python tools/build_viewer.py tools/animal_table.json
```

Open `viewers/parts_viewer.html` in a modern browser with WebGL and load your ROM.
The page processes it locally. Its embedded animal metadata is also derived from
your local inputs, so keep the generated page private.

## What to try

- Select an animal and filter its variants to see which parts are used.
- Use the gallery and parts sheet to compare individual meshes.
- Pick a part and adjust its scale or position; import or export an edit config.
- Load a deform config using **Deform preview**. [Compare its bounds with the builder](../DEFORM-TRYOUT.md).
- Switch themes and try local ROM storage. **Forget saved ROM** removes the stored copy.

Parts sheets are layouts of separate meshes. The viewer's pose import can place
parts using supplied transforms, but the public tools do not yet include a general
rig authoring or custom-character import workflow.

The preview does not replace game testing. In particular, deform group selection,
triangle coverage and shading can differ from the builder or game. Existing
geometry operations preserve counts and leave normals unchanged.

## Editing the viewer itself

Private builds can embed reviewed part labels with `--labels path/to/labels.json`.
Use format `sssv-viewer-labels-v1` with a `partNames` object mapping animal names
to part-symbol/name objects. Labels appear in part rows, hover text, the inspector
and floating labels. Local custom names take precedence. An optional
`table_sha256` binds a review to the exact input table. Unknown animals/parts are
rejected. Keep game-specific label catalogues private alongside research evidence;
`--public` rejects label files and never embeds them.

Edit `tools/viewer/`, then rebuild the HTML. The generated bundle is not a source
file. See [Development](../DEVELOPMENT.md) for checks and [Architecture](../ARCHITECTURE.md)
for source responsibilities.

[Getting started](GETTING-STARTED.md) · [Config guide](CONFIGS.md) · [Documentation index](../README.md)
