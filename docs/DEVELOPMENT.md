# Development

Run commands from the repository root. Python 3.8+ and Node.js are required;
no additional packages are needed.

```text
python tools/check.py
```

This checks Python and JavaScript syntax, saved deformation vectors, fresh
Python/JavaScript parity, and a synthetic progression example. It needs no ROM
and does not rewrite fixtures. Keep the saved golden vectors as an independent
baseline; regenerate them only after reviewing an intentional behavior change.

Viewer sources are in `tools/viewer/`. After generating the private table using
the README instructions, build the viewer locally:

```text
python tools/build_viewer.py tools/animal_table.json
```

Open `viewers/parts_viewer.html` in a modern browser with WebGL support. Test ROM
loading, animal/variant selection, parts sheets, mesh controls, config
import/export, themes, and local ROM storage. Use **Forget saved ROM** to remove
the browser's stored copy. The public sources use a simple text icon; no game
imagery is required to build the page.

For a config change, dry-run that exact file before building:

```text
python tools/make_animal_mods.py configs/bear.json --out build --name bear_test --dry-run
python tools/make_animal_mods.py configs/bear.json --out build --name bear_test
```

Use one config at a time when comparing edits. Folder input combines every
top-level JSON config, including alternate examples for the same animal.

Synthetic checks do not verify WebGL, event handlers, or in-game appearance.
See [deform preview](DEFORM-TRYOUT.md), [glossary](GLOSSARY.md), and
[release checks](PREPUBLISH.md). Emulator automation is maintained separately in
[sssv-modkit-automated-testing](https://github.com/sssv-modkit-dev/sssv-modkit-automated-testing).
