# Project status

Updated 2026-10-30. [Working rules](AGENTS.md) · [Documentation](docs/README.md) · [Development checks](docs/DEVELOPMENT.md)

The public modkit provides config-driven edits to the owner's US 1.0 ROM and a locally generated browser viewer. The emulator harness is a [separate project](https://github.com/sssv-modkit-dev/sssv-modkit-automated-testing). ROMs and generated game data are local inputs.

## Current capabilities

| Area | Present in this checkout | Next useful verification |
|---|---|---|
| Builder | Recolour, colour-word exclusions/edits, scale/move, deform, explicit vertex edits; SHA1, expected-byte, conflict, CRC and IPS safeguards | Exact-config dry-run and cold-boot inspection of a chosen edit |
| Viewer | Modular sources; parts sheets, variants, picking, config import/export, themes, local ROM caching, deform preview, pose JSON import | Browser interaction pass using locally generated inputs |
| Deform | Python, live JS and standalone JS; saved and fresh synthetic parity suites | Same-config preview/builder vertex coverage and game shading |
| Assembly | Pose-transform import and rendering in the viewer | Recover/verify external pose-generation tools and compare one animal against the same game state |
| Custom characters | Existing vertex edits can reshape current parts | Audit a donor rig and geometry budget; no arbitrary mesh/rig importer exists |
| Stage shuffle | Synthetic logic prototype | Real stage data and ROM write operations are not implemented |

## Evidence and limits

- Rechecked on 2026-10-30: `python tools/check.py` passes, with 334 matching / 66 rejected saved cases and 344 matching / 66 rejected fresh cases across the Python and JS deform implementations. These are synthetic results, not game validation.
- The owner previously reported that the deform preview looked good. Assembly accuracy and new deform appearance still need specific in-game evidence.
- Earlier private notes described dog skeleton decoding and candidate bank-growth space. Those research files and helpers are absent from this public checkout; their claims must be recovered and verified before implementation.
- The public harness has synthetic tests and capture/recipe support. A historical one-frame run produced a black capture with a core error; that run did not establish scene correctness or state replay reliability.
- Both projects have been published. Local source checks do not establish the current live remote state.
- Claude, 2026-10-31: `deform` verified in game for the first time. A `bear_deform` build loaded on the Fat Bear Mountain stage from the cartridge; original and patched frames differ only around the bear, whose arms and shoulders are tapered and bent with no tearing. The effect looks milder than the config suggests. The crazy bear variant was not seen. Emulator capture (save state with forced level id); evidence in private `lab/`.

## Next tasks

1. Generate the table and viewer from a clean documented setup; verify browser interactions.
2. Make the harness reliably reach a known scene and capture it; keep execution success distinct from scene correctness.
3. Audit one existing quadruped as a donor for a simple original character. Start with an unchanged rig and behaviour, then determine whether a mesh replacement requires new display lists or bank work.
4. Recover the missing assembly/loader research selectively before attempting custom rigs, bank relocation, or new actor behaviour.
5. Add documentation screenshots using original synthetic geometry first; review any game imagery separately.

Use [ARCHITECTURE.md](docs/ARCHITECTURE.md) for current data flow and implementation boundaries. Keep detailed local research and concept assessments in ignored `lab/` rather than duplicating them in this entry point.
