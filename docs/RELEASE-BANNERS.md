# Release banners

Generate a minimal banner from the verified local game-head branding render:

```powershell
powershell -NoProfile -File tools/make_release_banner.ps1 -Version 'EDITION SERIES'
powershell -NoProfile -File tools/make_release_banner.ps1 -Batch
```

The first command writes `build/release-banner.png`; the batch writes three
future concepts to `build/future-banners/`. Existing files are never overwritten.
Use `-Out` to choose another filename (or batch directory).

Names follow invented colour adjective + animal part + animal. The complete title
is italic, with double quotes around the name: **"Ceruleanish Ear Bear" edition**.
Optional `-Name`, `-Version` and `-Palette blue|orange|green` control the title,
secondary label and accent. Palette changes do not recolour the blue head.

Windows System.Drawing provides rendering without added packages, network calls,
manual uploads or AI image generation. The optional `tools/release_banner.html`
composer provides an interactive alternative.

## Available heads

Only the blue bear preset is currently wired in. It uses the existing crazy-bear
head raster; see `tools/viewer/assets/README.md` for provenance and camera setup.
The viewer can render other animals from the owner's local ROM and private table,
but those require verified part and camera presets before automatic banner use.
The current 256 x 256 head export is enlarged in the 1500 x 500 composition.

## Publication

The selected README banner is `docs/images/releases/ceruleanish-ear-bear.png`.
Future concepts remain local in build; no version numbers or releases are implied.
Review images under docs/PREPUBLISH.md. Game-head renders remain third-party game
content, outside the CC0 dedication; see NOTICE.md. Never publish ROMs, extracted
model data, private tables or generated viewer metadata with a banner.

The earlier AI-made fox concept is superseded and is not a game render.
