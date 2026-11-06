"""Vendored third-party code must come with its license files and a NOTICE.md entry (offline check)."""
import copy
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import vendor_deps  # noqa: E402

deps = vendor_deps.load_manifest()
assert not vendor_deps.manifest_problems(deps), vendor_deps.manifest_problems(deps)
assert {d['id'] for d in deps} >= {'pyodide', 'emulatorjs', 'mupen64plus_next', 'parallel_n64'}
notice = (ROOT / 'NOTICE.md').read_text(encoding='utf-8')
for dep in deps:
    assert dep['license_files'], dep['id']
    assert re.search(r'/[0-9a-f]{40}$|/(v?\d[\w.]*)$', dep['source_url']), 'source link must be an exact tag or commit: ' + dep['id']
# The check must actually fail when a license file or NOTICE entry is missing.
broken = copy.deepcopy(deps)
broken[1]['license_files'] = []
assert any('no license file' in p for p in vendor_deps.manifest_problems(broken))
assert any('NOTICE.md has no entry' in p for p in vendor_deps.manifest_problems(deps, notice.replace('EmulatorJS', 'X').replace('`emulatorjs`', 'X')))
assert any('does not mention' in p for p in vendor_deps.manifest_problems(deps, notice.replace('vendor/parallel_n64/LICENSES', '')))
# Code that loads vendored files must not point at a third-party origin.
for name in ('builder-core.js', 'builder-worker.js', 'play.js'):
    text = (ROOT / 'src' / 'web' / name).read_text(encoding='utf-8')
    assert 'cdn.jsdelivr.net' not in text and 'cdn.emulatorjs.org' not in text, name
print('vendor manifest: %d dependencies, licenses and NOTICE entries present' % len(deps))
