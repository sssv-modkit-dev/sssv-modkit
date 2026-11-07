# File formats

All files are JSON. Binary arrays are base64 strings of little-endian typed arrays.

## scene-v1 (a scene the Level Editor opens)

| Field | Meaning |
|---|---|
| `format` | `"scene-v1"` |
| `title`, `source.label` | Display names |
| `source.sha1` | Identity of the scene; edits files must name the same value |
| `types` | Object type table: one `[kind, flags, width, depth, height]` row per prop type |
| `meshes` | `{type: {p, c, n, zmin}}`: Int16 xyz triangle list, Uint8 rgb per vertex, vertex count |
| `creatures` | `{models, names, species}` for creature previews (may be empty) |
| `atlases` | `{id: "data:image/png;base64,..."}`: 256x128 texture atlas of 32x32 tiles |
| `levels[]` | One entry per level (below) |

Each level has `id`, `atlas`, `group`, `sub`, `bounds` (`[xmin,ymin,zmin,xmax,ymax,zmax]`), `vertexCount`, `spawnCount` and:

- `terrain`: `positions` (Int32 xyz), `colours` (Uint8 rgb), `uvs` (Int16), `slots` (Uint8 atlas tile; 255 = colour only), `water` (Uint8; below 255 = translucent water), `heights` and `tiles` (65x97 grids, Int8 and Uint8), `tileTypes` (12 bytes per tile type; byte 0 = walkable).
- `objects`: `props` (Int32 `[type, x, y, z, yaw]` per prop) and `creatures` (the same five numbers per creature, as a plain list).
- `records`: the editable object records as hex strings. Props are 22 bytes and creatures 16 bytes, big-endian: type at 0, x/y/z at 2/4/6, yaw at 10 (props) or 8 (creatures).

`tools/make_island.js` is a complete, commented example that writes one.

## scene-edits-v1 (what the Level Editor saves)

```json
{"format": "scene-edits-v1", "version": 1, "source_sha1": "<scene source.sha1>",
 "levels": {"1": {"props": {"set": [{"index": 3, "bytes": "<hex>"}], "add": [{"bytes": "<hex>"}]},
                  "creatures": {"set": [], "add": []}}}}
```

`set` replaces an existing record by index; `add` appends new ones in order. Opening edits for a different `source_sha1` is refused.

`scene-project-v1` wraps edits with an attached Model Editor config: `{format, version, source_sha1, parts, edits}`.

## pack.json (what a pack provides)

| Key | Meaning |
|---|---|
| `id`, `title` | Pack name; `title` appears in page titles |
| `slots` | HTML for `model-noscript`, `model-source`, `model-nav`, `level-noscript`, `level-source`, `level-network`, `level-gallery-open`. All are required |
| `scripts` | Extra scripts per page: `{"model-editor": [...], "level-editor": [...]}` |
| `scenes` | `[{src, dest}]`; the first is the Level Editor's default scene |
| `scene_icons` | Optional folder of creature icons for the level gallery |
| `model_demos` | Optional `{models, poses?, assembled?}`: extra Model Editor models |
| `files` | `[{src, dest, exclude?}]` copied into the site; must include `index.html` |
| `build_hook` | Optional Python file with `run(out_dir, no_vendor)` |

A missing slot or file stops the build with exit code 2 and names it.
