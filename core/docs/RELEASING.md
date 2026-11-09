# Releasing

1. `python tools/release.py vX.Y.Z` runs all checks and the history guard, then builds `build/site` for a last look.
2. Tag the release: `git tag vX.Y.Z`.
3. Push the branch and the tag: `git push gitlab main vX.Y.Z`. GitLab Pages builds and publishes only on tags like `vX.Y.Z` (`.gitlab-ci.yml`).
4. Check the published site, or run `node tests/browser/roundtrip.mjs <site URL>` against it.
5. Back up: `git bundle create <backup folder>/sssv-editor-vX.Y.Z.bundle --all`.

Pace: push in batches and publish once per release, not per change.
