# Editing configs

A config describes edits to one animal. Copy an included file from `configs/`
and change one thing at a time. Use the [viewer](VIEWER.md) and your generated
animal table to identify part symbols and colours.

```json
{
  "animal": "bear",
  "recolor": { "B03F00FF": "3A2418FF", "AD6B52FF": "D9A441" },
  "mesh": [
    { "symbol": "D_04002D90_CA7C0", "scale": [1.2, 1.2, 1.2], "move": [0, 0, 3] }
  ]
}
```

The example illustrates the format. Check its part and colour coverage against
your local table before building.

## Available edits

| Key | What it changes |
|---|---|
| `recolor` | Matching RGBA colours in the animal's own display lists; an RGB replacement keeps the old alpha |
| `words` | Individual colour words by ROM address, checked against an expected old value |
| `skip_words` | Colour word addresses to leave untouched |
| `mesh` | Part scale and position in local axes, around the bounding-box centre or an explicit `about` point |
| `deform` | Taper, bend, twist or inflate operations, applied in order |
| `vertices` | Individual vertex edits with required expected positions; optional normal/colour-byte edits also require expected bytes |

Geometry counts stay fixed. Mesh/deform edits leave stored normals unchanged;
large changes can affect shading. Shared-vertex protection prevents unintended
edits to other parts or animals. Use `allow_shared` only after checking every user.

For deform examples and preview limitations, see [Deform preview](../DEFORM-TRYOUT.md).
The complete field reference is the opening docstring in
[`tools/make_animal_mods.py`](../../tools/make_animal_mods.py).

## Build and combine

Always dry-run your exact config before building:

```sh
python tools/make_animal_mods.py configs/bear.json --out build --name bear_test --dry-run
python tools/make_animal_mods.py configs/bear.json --out build --name bear_test
```

The CLI also accepts multiple files, wildcard patterns, folders and combined packs.
Folder input combines every top-level JSON config, so a folder containing alternate
edits for the same animal may create conflicts. Select individual files while experimenting.

A combined pack has an optional name and an `animals` array of ordinary configs:

```json
{
  "name": "my_pack",
  "animals": [
    { "animal": "bear", "recolor": { "B03F00FF": "3A2418FF" } }
  ]
}
```

Use `--save-pack FILE` to combine the supplied inputs into a pack, or `--name NAME`
to override its output name. See the builder's `--help` for CLI options.

[Getting started](GETTING-STARTED.md) · [Viewer guide](VIEWER.md) · [Documentation index](../README.md)
