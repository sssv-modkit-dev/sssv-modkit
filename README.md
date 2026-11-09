# SSSV Editor

![SSSV Editor, "Velvet Midnight Rat" edition, v0.1.0-rc2](docs/img/banner-dark.png)

A fan-made level and model editor for *Space Station Silicon Valley* (1998, N64). It runs entirely in the browser: open a scene or a model, move and add objects, recolour and reshape parts, then save your edits as a small JSON file you can reopen later.

**Unofficial fan project. Not affiliated with or endorsed by the rights holders. Ships no game code, ROM or extracted assets. Screenshots and the banner are captures or renders from the game, used only for illustration.**

This repository ships with original sample content only: a generated island scene, three original models and three CC0 models by Quaternius (see [THIRD_PARTY.md](THIRD_PARTY.md)).

## Try it

```sh
python src/build_site.py --pack packs/sample --out build/site
python -m http.server --directory build/site 8000
```

Then open http://localhost:8000/. Nothing is uploaded; files you open are read inside your browser.

| Page | What you can do |
|---|---|
| Level Editor | Select, move, rotate and add objects; undo/redo; save and reopen edits (`scene-edits-v1`) |
| Model Editor | Take models apart, recolour, stretch, bend and twist parts; save and reopen edits; share a link |

## How it is built

The editors read a neutral scene format (`scene-v1`) and know nothing about where a scene came from. A **pack** supplies the content and the page copy: `packs/sample/` is the one in this repository. `src/build_site.py --pack <dir>` combines the editors with a pack into a static site. The formats are described in [docs/FORMAT.md](docs/FORMAT.md).

## Background: how game files are usually edited

Some terms you will meet around projects like this:

- **ROM:** a file holding a copy of a cartridge's contents. Editing tools read one to find levels and models. This repository does not include or read one.
- **IPS patch:** a small file that lists byte changes to apply to a ROM. People share patches instead of whole files, because a patch contains only their own changes.
- **Decompilation vs recompilation:** decompilation turns a game's machine code back into readable source code that compiles to the same bytes. Recompilation translates the machine code directly into a program for another platform, without first recovering readable source.

## Checks

```sh
python src/check.py
```

It runs the unit tests, a headless browser start-up test, and `tools/guards.py`. The guards check banned words, third-party licences and binary file rules (see `tools/banned-words.txt`).

## Licence

CC0-1.0 ([LICENSE](LICENSE)) for the code and original content. Third-party models keep their own licences, listed in [THIRD_PARTY.md](THIRD_PARTY.md).
