# Release banners

Generate a minimal banner from the verified local game-head branding render:

```sh
sh tools/make_release_banner.sh --version 'EDITION SERIES'
sh tools/make_release_banner.sh --batch
```

The first command writes `build/release-banner.png`; the batch writes three
future concepts to `build/future-banners/`. Existing files are never overwritten.
Use `--out` to choose another filename (or batch directory).

The default command uses a POSIX shell (Linux, macOS, WSL or Git Bash), Python
3.8+ and an installed Chrome, Chromium or Edge browser. No Python packages or
network access are required. The browser runs headlessly with a temporary
profile, using the HTML composer's drawing routine and embedded local assets.
Fonts depend on the host, so typography can vary between platforms.
Use `--browser '/path/to/browser'` if automatic browser discovery fails. Under
WSL, install Python and Chromium inside WSL; under Git Bash, Windows Python and
Chrome/Edge are supported.

Python is also a direct entry point, including from Windows terminals:

```sh
python tools/make_release_banner.py --palette orange --out build/orange-banner.png
```

The existing Windows System.Drawing generator remains available for its original
rendering and PowerShell syntax:

```powershell
powershell -NoProfile -File tools/make_release_banner.ps1 -Version 'EDITION SERIES'
```

Names follow invented colour adjective + animal part + animal. The complete title
is italic and accent-coloured, with matched quotation marks around the name.
A fine bottom rule and short accent line complete the minimal layout.
Optional `--name`, `--version` and `--palette blue|orange|green` control the title,
secondary label and accent. By default the head fur and ear tips also follow
the palette, retaining facet shading and leaving eyes, teeth and mouth unchanged.

The optional `tools/release_banner.html` composer provides an interactive
alternative without Python or a shell. Language-named quote styles control
punctuation; they do not translate the release name or the word "edition".

## Available heads

Only the blue bear preset is currently wired in. It uses the existing crazy-bear
head raster; see `tools/viewer/assets/README.md` for provenance and camera setup.
The viewer can render other animals from the owner's local ROM and private table,
but those require verified part and camera presets before automatic banner use.
The current 256 x 256 head export is enlarged in the 1500 x 500 composition.

## Publication

The selected README banner is `docs/images/releases/ceruleanish-ear-bear-v3.png`.
Future concepts remain local in build; no version numbers or releases are implied.
Review images under docs/PREPUBLISH.md. Game-head renders remain third-party game
content, outside the CC0 dedication; see NOTICE.md. Never publish ROMs, extracted
model data, private tables or generated viewer metadata with a banner.

The earlier AI-made fox concept is superseded and is not a game render.

## Quotation styles

Each generation randomly chooses English curly quotes, French spaced guillemets,
Spanish guillemets, German low/high quotes, or Japanese corner brackets. These are
selected typographic conventions, not an exhaustive rule for each language.
Use `--quote-style english|french|spanish|german|japanese` to reproduce a choice;
`random` is the default. The command prints the selected style. Batch mode chooses
independently per banner unless a style is pinned. The HTML composer holds its
choice while editing; its shuffle button explicitly chooses again.

## Raster recolouring

Use `--recolor both|head|ears|original` (default: `both`). This remaps the cached
bear PNG using a blue-fur colour mask and a pale-ear mask restricted to its top
40 pixel rows. It does not modify model vertices, ROM data or the source icon.
These masks are specific to the verified 256px bear render; they are not generic
part detection. Other animals or named parts need their own reviewed masks or
fresh renders. The browser composer keeps supplied PNG colours unchanged.

The shell/Python generator and browser preview use medium-weight italic system
text. The PowerShell generator uses Segoe UI Semibold Italic on Windows.
Its equivalent options are `-Name`, `-Version`, `-Out`, `-Palette`, `-QuoteStyle`,
`-Recolor` and `-Batch`.
