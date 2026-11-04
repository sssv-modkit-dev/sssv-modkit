# Release checks

Run the ROM-free checks, then inspect the exact staged paths and contents:

```text
python src/check.py
git diff --cached --name-status
git diff --cached
python src/prepublish_check.py --staged
```

The checker reads indexed content. Use `--all` for the full Git index or
`--paths FILE ...` for specific working-tree files. It detects common mistakes;
also inspect the files themselves.

Keep ROMs, extracted indexes/assets, generated viewer pages, save states,
captures, local research, and personal paths outside commits. Configs contain
edits and their expected values, rather than asset dumps. Distribute patches
through releases; never distribute original or patched ROMs.

The owner approved the documentation screenshots listed in
[`images/features/README.md`](images/features/README.md) on 2026-11-04. Keep that
exception limited to those reviewed images; it does not cover raw captures,
extracted assets, generated viewers, or other private inputs.

Check commit author and committer identities with `git log --format=fuller -1`.
From a clean checkout, run the checks and follow the README setup using your own
local inputs. Inspect viewer interactions and the exact config's dry-run report
before building. Verify the result in game before describing it as play-tested.
