"""The SSSV pack builds on the synced core: every file of the pre-split public site is still produced, with no unfilled slots."""
from pathlib import Path
import subprocess, sys, tempfile

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
    out = Path(tmp) / 'site'
    result = subprocess.run([sys.executable, str(ROOT / 'core/src/build_site.py'), '--pack', str(ROOT / 'packs/sssv'), '--out', str(out), '--no-vendor'], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    produced = {p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    today = set((ROOT / 'tests/fixtures/sssv-site-files.txt').read_text(encoding='utf-8').split())
    assert today <= produced, sorted(today - produced)
    for page in out.rglob('*.html'):
        text = page.read_text(encoding='utf-8')
        assert '<!--slot:' not in text and '__PACK_TITLE__' not in text, page
print('Pack site: superset of the pre-split site, all slots filled.')
