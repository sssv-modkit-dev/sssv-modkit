# Releasing

1. `python tools/release.py vX.Y.Z` runs all checks and the history guard, then builds `build/site` for a last look.
2. Tag the release: `git tag vX.Y.Z`.
3. Push the branch and the tag: `git push gitlab main vX.Y.Z`. GitLab Pages builds and publishes only on tags like `vX.Y.Z` (`.gitlab-ci.yml`).
4. Check the published site, or run `node tests/browser/roundtrip.mjs <site URL>` against it.
5. Back up: `git bundle create <backup folder>/sssv-editor-vX.Y.Z.bundle --all`.

Pace: push in batches and publish once per release, not per change.

## Current banner

Pre-alpha v0.5 uses the “Dan Danger” edition banner at `docs/img/dan-danger-v05.png`.
This is a documentation version label; it does not create a Git tag or a published release.
Rendered on 2026-11-16 with the cross-platform Version Banner Generator Python CLI,
using a local Model Editor Save PNG image export from the owner's US 1.0 ROM and the
bundled Dan Danger pose. Vertex colours and the ground patch were disabled: this is
a neutral-material geometry preview, not a claim of accurate in-game materials or animation.
Only the final documentation PNG and its settings are included; source geometry and ROM stay private.
