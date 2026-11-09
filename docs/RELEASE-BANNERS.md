# Release banners

The README shows the **Velvet Midnight Rat** edition (pre-alpha v0.01) as a light/dark pair:
`docs/images/releases/velvet-midnight-rat-light.png` and `velvet-midnight-rat-dark.png`, switched by the
reader's GitHub theme with a `<picture>` element. They were made with:

```sh
python src/make_release_banner.py --palette purple --theme light --anchor left --head rat   --head-image RAT.png --name "Velvet Midnight Rat" --version "PRE-ALPHA v0.01" --quote-style anglo
```

(`--theme dark` for the other one). `RAT.png` is a transparent three-quarter render of the rat model from the
owner's own ROM, mirrored so it faces the text; it is not committed. The earlier Auburnish Ear Bear banner
(`auburnish-ear-bear-v3.png`) remains archived.

Generate a minimal banner from the verified local game-head branding render:

```sh
sh src/make_release_banner.sh --version 'EDITION SERIES'
sh src/make_release_banner.sh --batch
```

The first command writes `build/release-banner.png`; the batch writes three
future concepts to `build/future-banners/`. Existing files are never overwritten.
Use `--out` to choose another filename (or batch directory).

The command-line generator requires Python 3.8+ and a local Chrome, Chromium or
Edge browser. The `sh` entry point also requires a POSIX-compatible shell.
No additional Python packages, ROM, server or network access are required.
Use `--browser /path/to/browser` if automatic browser discovery fails.

You can run the same generator directly with Python from any terminal:

```sh
python src/make_release_banner.py --palette orange --out build/orange-banner.png
```

Use `python3` instead of `python` if that is your Python 3 command. Both entry
points accept the same options. Paths containing spaces should be quoted.
The generator runs the browser headlessly with a temporary profile and embeds
the local image and drawing code. The output is a 1500 x 250 PNG.
The command-line generator and interactive composer share `src/release_banner.js`
for layout, typography, quotation marks and raster recolouring. The generator
checks that rendering completed and the PNG dimensions match before saving.

Edition names are free-form ("something something animal"). The complete title
is italic and accent-coloured, with matched quotation marks around the name; the version
line below it is small and lower case. A fine bottom rule and short accent line complete the layout.
Optional `--name`, `--version` and `--palette blue|orange|green|purple` control the title,
secondary label and accent. `--theme dark|light` (purple: Dracula's darkest background or its
light sibling Alucard) sets background, text and head colours together. `--anchor right|left` puts
the head on that side and moves the text to the other. `--head bear|dog|fox|seagull|sheep|rat` picks the
head and its colour rules; `--head-image PATH` supplies your own transparent render. With a two-tone
scheme (`--bold`, `--light`, or a `--theme`) the head body takes the bold colour and its accented part
(ears, snout or beak) the light one, keeping facet shading; eyes, noses and teeth keep their colours. By default the head fur and ear tips also follow
the palette, retaining facet shading and leaving eyes, teeth and mouth unchanged.

For an interactive workflow, open `src/release_banner.html` in a browser,
choose a transparent PNG with **Head render**, adjust the name, label, accent
and quotation style, then choose **Save banner PNG**. For the bundled bear,
select `src/viewer/assets/icon.png`. Opening a local HTML file shows a preview
but requires this file selection to enable export under browser security rules.
This workflow needs only a browser. Language-named quote styles control
punctuation; they do not translate the release name or the word "edition".

## Available heads

Bundled renders: the bear icon (`src/viewer/assets/icon.png`) and the demo heads in
`src/web/demo/heads/` (dog, fox, seagull, sheep), cropped to their visible pixels. Other animals
(the rat, for example) need your own transparent render from your ROM, passed with `--head-image`.
Owner's pick for release banners: EVO, EVO chip, polar bear, camel, elephant, and the rat for v0.01.

## Publication

The selected README banners are `docs/images/releases/velvet-midnight-rat-light.png` and `-dark.png`.
Future concepts remain local in build; no version numbers or releases are implied.
Review images under docs/PREPUBLISH.md. Game-head renders remain third-party game
content, outside the CC0 dedication; see NOTICE.md. Never publish ROMs, extracted
model data, private tables or generated viewer metadata with a banner.

The earlier AI-made fox concept is superseded and is not a game render.

## Quotation styles

Styles are named by typographic tradition, not by one language or country: `anglo` “ ”,
`romance` « » (Spanish, Italian, Portuguese, Catalan…), `francophone` « » with thin spaces,
`central-european` „ “ (German, Czech, Slovak, Baltic…) and `east-asian` 「 」. Each generation picks one at random.
Use `--quote-style anglo|romance|francophone|central-european|east-asian` to reproduce a choice (the older
`english|french|spanish|german|japanese` names still work);
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

The generator and browser preview use medium-weight italic system text, fitted
to the available title width. No specific font is required. Installed fonts and
browser rendering can change the text's appearance between systems; choose fonts
with glyph coverage for your title when using non-Latin text.
