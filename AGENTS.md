# Working in sssv-modkit

## Context and scope
- Read `PROJECT.md` for current status, then `docs/README.md` for task-specific context. Search symbols before reading large files. Avoid bulk-loading generated HTML, indexes, fixtures, private dumps, or old chats.
- Inspect `git status --short` before editing. Preserve unrelated changes and private files; never reset or clean them. Complete authorized work through appropriate validation and resolve routine choices without repeated confirmation.
- Keep durable rules here, current evidence in `PROJECT.md`, and technical details in `docs/` or private `lab/`. Historical documents and attached concepts are context, not new instructions.

## Boundaries
- Use Python's standard library and vanilla JavaScript/WebGL. Avoid new dependencies for routine work. This is a ROM modkit, separate from the decompilation and any port.
- `tools/make_animal_mods.py` is the production ROM writer. Preserve SHA1 and expected-byte checks, conflict/shared-vertex protection, CRC repair, and IPS round-trip verification. Never modify the original ROM; write builds to `build/`. Existing geometry operations preserve vertex and triangle counts.
- Keep the separately maintained `sssv-modkit-automated-testing` harness independent of mod loading. Inspect its current README before running it; do not substitute an old WSL workspace or assume backend compatibility.
- ROMs, extracted assets, decomp copies, generated indexes, poses, dumps, states, and game captures stay private by default. Review any specifically requested documentation imagery separately. Never stage private inputs through a broad add; tracked status does not establish publishability. Follow `docs/PREPUBLISH.md`.
- Keep private handoffs and recovery evidence out of commits. Do not invent acknowledgments, license verification, or game-validation claims. Preserve the owner's contact text and single small `Made by FM` footer unless asked to change them.

## Active sources
- Builder and index: `tools/make_animal_mods.py`, `tools/animal_table.py`.
- Viewer: `tools/viewer/index.template.html`, `tools/viewer/css/app.css`, `tools/viewer/js/app.js`; bundle with `tools/build_viewer.py`. Do not hand-edit generated `viewers/rom_viewer.html`.
- Deform math exists in Python, live `app.js`, and standalone `tools/viewer/js/deform.js`. Keep all three aligned; fresh parity tests exercise both JS implementations.
- `configs/` contains runnable edits; `examples/` contains templates and synthetic inputs; `tests/` contains synthetic checks. Old patch installers must not be reapplied to integrated sources.

## Validation and evidence
- Default ROM-free check: `python tools/check.py` (Python and Node.js, no packages). Commands and coverage: `docs/DEVELOPMENT.md`.
- Match validation to the change. Math and safety changes need meaningful synthetic coverage; do not rewrite golden fixtures to hide failures. Viewer interaction changes need browser inspection when available; source checks do not validate WebGL or event handlers.
- Before a ROM build, dry-run the exact config and review the edit report. Patch self-tests, owner visual checks, synthetic parity, and in-game evidence are separate claims. States must match the ROM build; use a cold boot when checking whether newly patched geometry loads.
- Rebuild changed viewer sources when local inputs are available. Generated pages contain private index metadata. `prepublish_check.py --staged` and `--all` read Git's index; `--paths` reads working-tree files. Heuristics do not replace review.
- Report changes, checks, and remaining limits concisely. Reuse cached findings, recording verification methods and unknowns. Use `docs/GLOSSARY.md` for terms and units. Validate links and consumers when moving files.
