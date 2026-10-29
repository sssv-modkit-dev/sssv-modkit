# Deform preview

Generate the viewer locally, open it, load your ROM, and select the animal.
Under Display Modes, click **Deform preview** to load a config. Click again to
toggle it; Shift+click loads another config. The browser console shows a table
of each part's bounds before and after deformation.

Run the builder dry-run on the same config and compare its `deform` bounds
with that table:

```text
python tools/make_animal_mods.py configs/bear_deform.json --out build --name deform_test --dry-run
```

The preview uses triangle-drawn vertices; the builder uses whole selected vertex
groups. The preview ignores `groups` and warns when they are present. Repeated
triangle vertices can inflate its clamp count. Preview face-normal shading
differs from the game's stored normals.

For a new edit, copy `examples/deform_example.json` to a new config and replace
its animal and part-symbol placeholders using your locally generated table.
Start with one gentle operation, such as tapering from 1.0 to 0.8. Inspect the
dry-run report for unexpected bounds or clamped coordinates. Enable
`allow_shared` only when you intend to affect every part sharing those vertices.

Build by removing `--dry-run`, then inspect the result in game. Vertex and
triangle counts stay fixed; normals remain unchanged. Strong bends and twists
can affect shading. Save states used for comparisons must match the ROM build.

`python tests/test_live_deform.py` compares fresh Python expectations with both
JavaScript implementations. The saved golden suite provides another regression
check. Neither establishes browser behavior or in-game appearance.
