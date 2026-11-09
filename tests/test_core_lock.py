#!/usr/bin/env python3
"""core/ must equal what core.lock recorded (line-ending independent); core/ is never edited by hand."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import sync_core  # noqa: E402


def main():
    edits = sync_core.local_edits()
    if edits:
        print('core/ differs from core.lock:\n  ' + '\n  '.join(edits[:20]), file=sys.stderr)
        return 1
    print('core.lock: %d files match' % len(json.loads(sync_core.LOCK.read_text(encoding='utf-8'))['files']))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
