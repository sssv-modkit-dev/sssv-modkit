"""build_site.py --pack: the sample pack builds a complete site; an incomplete pack is refused with the missing name."""
from pathlib import Path
import json, shutil, subprocess, sys, tempfile

ROOT = Path(__file__).resolve().parents[1]
BUILD = [sys.executable, str(ROOT / 'src/build_site.py')]


def build(pack, out):
    return subprocess.run(BUILD + ['--pack', str(pack), '--out', str(out), '--no-vendor'], capture_output=True, text=True)


def pages(out):
    return {p: p.read_text(encoding='utf-8') for p in out.rglob('*.html')}


with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    # test_sample_build
    out = tmp / 'sample'
    result = build(ROOT / 'packs/sample', out)
    assert result.returncode == 0, result.stderr
    for name in ('index.html', 'level-editor.html', 'model-editor.html'):
        assert (out / name).is_file(), name
    assert not (out / 'play.html').exists()
    for path, text in pages(out).items():
        assert '<!--slot:' not in text and '__PACK_TITLE__' not in text, path
    assert 'SSSV Editor' in (out / 'model-editor.html').read_text(encoding='utf-8')

    # test_missing_slot_fails
    broken = tmp / 'broken'
    shutil.copytree(ROOT / 'packs/sample', broken)
    manifest = json.loads((broken / 'pack.json').read_text(encoding='utf-8'))
    manifest['slots'].pop('level-source')
    (broken / 'pack.json').write_text(json.dumps(manifest), encoding='utf-8')
    result = build(broken, tmp / 'broken-out')
    assert result.returncode == 2 and 'level-source' in result.stderr, (result.returncode, result.stderr)

    # a listed file that does not exist names the file
    manifest = json.loads((ROOT / 'packs/sample/pack.json').read_text(encoding='utf-8'))
    manifest['files'] = manifest.get('files', []) + [{'src': 'nope.html', 'dest': 'nope.html'}]
    (broken / 'pack.json').write_text(json.dumps(manifest), encoding='utf-8')
    result = build(broken, tmp / 'broken-out2')
    assert result.returncode == 2 and 'nope.html' in result.stderr, (result.returncode, result.stderr)
print('Site build: sample pack complete, missing slot/file refused.')
