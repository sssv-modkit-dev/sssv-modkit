# Development

Run commands from the repository root. Python 3.8+ and Node.js are required;
no additional packages are needed.

```text
python tools/check.py
```

This checks Python and JavaScript syntax, the builder's safety refusals and
IPS/CRC helpers on a synthetic ROM, camera math and live input handlers,
shared banner rendering rules, browser discovery and failed-output protection,
saved deformation vectors, fresh
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
the browser's stored copy. The viewer embeds `tools/viewer/assets/icon.png` for
its favicon and brand image. A legacy `icon.ico` is also supported; if neither
exists, the builder uses a text icon. The PNG needs no ICO conversion.

For a config change, dry-run that exact file before building:

```text
python tools/make_animal_mods.py configs/bear.json --out build --name bear_test --dry-run
python tools/make_animal_mods.py configs/bear.json --out build --name bear_test
```

The dry run applies the same plan as the real build to an in-memory copy, so its
vertex counts and bounding boxes match the build. Code layout: `tools/romio.py`
holds ROM identity, lookup, CRC and IPS; the builder splits into `plan_edits`
(every check, no writes) and `apply_plan`. When refactoring the builder, rebuild
each config before and after and compare the IPS files byte for byte.

`code_patch` writes raw bytes at ROM file offsets (`examples/code_patch.example.json`;
format in the builder docstring). Each entry needs `expect` (checked against the
base ROM) and a same-length `write`. It refuses out-of-range, odd-length or
overlapping entries, clashes with colour/vertex/mesh/deform edits, writes below
0x1000 without `"allow_header": true`, and non-4-byte-aligned writes without
`"align": false`. `--dry-run` lists each patch; CRC repair and the IPS self-test
apply as usual. The example uses synthetic bytes only; never commit real game
bytes or addresses.

Use one config at a time when comparing edits. Folder input combines every
top-level JSON config, including alternate examples for the same animal.

Synthetic checks do not verify browser event delivery, WebGL, or in-game appearance.
See [viewer controls and browser validation](VIEWER-CONTROLS.md) for the camera
reference, screenshots, browser evidence, and ROM-free fixture instructions.
See [deform preview](DEFORM-TRYOUT.md), [glossary](GLOSSARY.md), and
[release checks](PREPUBLISH.md). Emulator automation is maintained separately in
[sssv-modkit-automated-testing](https://github.com/sssv-modkit-dev/sssv-modkit-automated-testing).

## Coverage and focused checks

`tools/check.py` parses active Python sources, checks JavaScript syntax, runs the
saved deform vectors, compares fresh Python expectations against both live and
standalone JavaScript, and runs the synthetic stage-shuffle example. It does not
read a ROM, regenerate fixtures, build a viewer or start an emulator.

For a focused math check:

```text
node tests/test_deform_parity.js
python tests/test_live_deform.py
```

These compare synthetic coordinates, bounds, clamp counts and rejected inputs.
They do not establish real-ROM vertex selection or matching game shading.

To check bundling without replacing the current generated page:

```text
python tools/build_viewer.py tools/animal_table.json build/viewer-check.html
```

## Find the right context

Start with [agent guidance](../AGENTS.md) and [project status](../PROJECT.md),
then read only the sources needed for the task. [Architecture](ARCHITECTURE.md)
maps responsibilities; the [documentation index](README.md) links user guides.

| Task | Start with | Validation |
|---|---|---|
| Config and patch safety | Builder docstring and affected planner | Synthetic checks; exact-config dry-run and patch self-test when needed |
| Deform math | Python `plan_deform`, live and standalone JS, DEFORM-TRYOUT.md | Saved and fresh parity; browser/game checks for integration |
| Viewer interaction | `tools/viewer/`, `tools/build_viewer.py` | Syntax, rebuild, browser inspection |
| Animal/variant index | `tools/animal_table.py`, GLOSSARY.md | Targeted synthetic checks and local index inspection |
| Custom mesh or rig | ARCHITECTURE.md, donor draw events and private research | Verified budgets, transforms and runtime evidence before ROM writes |
| Emulator scenes and states | Separate harness README and recipes | Synthetic harness tests, followed by real scene/state verification |
| Documentation | User guides and linked CLI entry points | Link/anchor checks, example syntax, whitespace and publication scan |

Keep handoffs short: objective, relevant files, observed evidence, unresolved
question, and next validation. Separate chats that edit code should use isolated
worktrees or distinct repositories. A plain Git worktree starts from committed files; app-managed worktrees may
also carry local changes. Verify that the guidance and inputs needed for the task
are present, and pass private research paths explicitly.
