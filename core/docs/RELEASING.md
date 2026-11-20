# Releasing

The core ships inside the sssv-modkit repository (folder `core/`, since 2026-11-20). There is no separate core release:
`python src/check.py` at the repository root runs the core checks, and a push to `main` deploys the site through GitHub Actions.
The last core-only release is the `editor-final` tag on the retired `editor` branch; the old GitLab tag flow is kept there.

Pace: push in batches and publish once per release, not per change.

## Current banner

Pre-alpha v0.5 uses the “Dan Danger” edition banner at `docs/img/dan-danger-v05.png`.
This is a documentation version label; it does not create a Git tag or a published release.
Rendered on 2026-11-16 with the cross-platform Version Banner Generator Python CLI,
using a local Model Editor Save PNG image export from the owner's US 1.0 ROM and the
bundled Dan Danger pose. Vertex colours and the ground patch were disabled: this is
a neutral-material geometry preview, not a claim of accurate in-game materials or animation.
Only the final documentation PNG and its settings are included; source geometry and ROM stay private.
