# SSSV Editor

![SSSV Editor, "Velvet Midnight Rat" edition, v0.1.0-rc2](docs/img/banner-dark.png)

A fan-made editor for *Space Station Silicon Valley* (1998, N64). Level and model editing runs in the browser: open a scene or a model, move and add objects, recolour and reshape parts, then save your edits as a small JSON file you can reopen later. Dialogue and terrain editing uses an optional local Python bridge.

**Unofficial fan project. Not affiliated with or endorsed by the rights holders. Ships no game code, ROM or extracted assets. Screenshots and the banner are captures or renders from the game, used only for illustration.**

This repository ships with original sample content only: a generated island scene, three original models and three CC0 models by Quaternius (see [THIRD_PARTY.md](THIRD_PARTY.md)).

## Try it

```sh
python src/build_site.py --pack packs/sample --out build/site
python -m http.server --directory build/site 8000
```

Then open http://localhost:8000/. Nothing is uploaded; files you open are read inside your browser.

In ROM-enabled packs, opening a ROM shares it across the editors using local browser storage. Each page shows its identity; **Forget ROM** removes the shared source and saved edits. Dialogue and painted terrain sheets combine in one browser build. Model and Level edits are also remembered with their source ROM. Controls apply live; Undo reverses an edit or a complete slider gesture. Download your edit files to keep a separate backup.

| Page | What you can do |
|---|---|
| Level Editor | Select, move, rotate and add objects; undo/redo; save and reopen edits (`scene-edits-v1`) |
| Model Editor | Take models apart, recolour, stretch, bend and twist parts; save and reopen edits; share a link |

## Local dialogue and terrain editing

With the separate private research checkout and its Python dependencies (Pillow and NumPy) available:

```sh
python tools/story_editor.py
```

Open `http://127.0.0.1:8010/dialogue.html` or `/textures.html`. Use `--research <folder>` and
`--rom <base.z64>` to override the sibling research checkout and its stock base. The dialogue page
groups lines by level/bank, shows the actual language-block byte budget and edits each message
occurrence's hold time. Text-code colours use an approximate letter-font preview.

The terrain page exports an 8 by 4 sheet with 32-pixel tiles and 2-pixel gaps. Select a tile,
paint pixels, right-click to pick a colour, replace that colour, or undo a stroke. The repeating
preview shows seams. Tiles 0–19 affect the entire zone; sub-bank tiles may also be shared.

Save writes working `dialogue.json`, `timing.json` and `level-N.png` files under ignored
`build/story-data/`; research inputs stay unchanged. Reopening the bridge restores those edits.
Build calls the research `textmod.py apply` and `scripttool.py apply` writers; a terrain build then
calls `terrain.py apply` for the selected sheet. Other saved sheets are not included. Every build
uses a fresh output folder and reports its ROM path. Timing has disk validation only; check results
in the game before relying on pacing. No camera or actor scripting is provided.

The static pages display setup guidance without the local bridge. No source ROM or research assets
are bundled in a site build. The bridge binds only to `127.0.0.1` and checks request origins.

## How it is built

The editors read a neutral scene format (`scene-v1`) and know nothing about where a scene came from. A **pack** supplies the content and the page copy: `packs/sample/` is the one in this repository. `src/build_site.py --pack <dir>` combines the editors with a pack into a static site. The formats are described in [docs/FORMAT.md](docs/FORMAT.md).

## Background: how game files are usually edited

Some terms you will meet around projects like this:

- **ROM:** a file holding a copy of a cartridge's contents. The optional local story bridge reads a separately supplied base; no ROM is included here.
- **IPS patch:** a small file that lists byte changes to apply to a ROM. People share patches instead of whole files, because a patch contains only their own changes.
- **Decompilation vs recompilation:** decompilation turns a game's machine code back into readable source code that compiles to the same bytes. Recompilation translates the machine code directly into a program for another platform, without first recovering readable source.

## Checks

```sh
python src/check.py
```

It runs the unit tests, a headless browser start-up test, and `tools/guards.py`. The guards check banned words, third-party licences and binary file rules (see `tools/banned-words.txt`).

## Licence

CC0-1.0 ([LICENSE](LICENSE)) for the code and original content. Third-party models keep their own licences, listed in [THIRD_PARTY.md](THIRD_PARTY.md).

**Exception:** the banner (`docs/img/banner-*.png`) is **not** CC0. Its rat head is our render of a character model from the game, which belongs to its rights holders; it is shown for illustration only and is not covered by this project's licence.
