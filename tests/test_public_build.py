"""Verify public output is reproducible and independent of private local inputs."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    temp = Path(directory)
    # A private-input canary must never be read, even if present in cwd.
    (temp / 'animal_table.json').write_text('PRIVATE_INPUT_CANARY: invalid JSON')
    output = temp / 'model_editor.html'
    command = [sys.executable, str(ROOT / 'src/build_viewer.py'), '--public', '--out', str(output)]
    subprocess.run(command, cwd=temp, check=True, capture_output=True)
    assert output.is_file()
    redirect = (temp / 'parts_lab.html').read_text(encoding='utf-8')
    assert '<meta http-equiv="refresh" content="0; url=model_editor.html">' in redirect
    assert '<link rel="canonical" href="model_editor.html">' in redirect
    redirect_script = redirect.split('<script>')[1].split('</script>')[0]
    subprocess.run(['node', '-e', """
const vm = require('node:vm');
const assert = require('node:assert/strict');
for (const [search, hash] of [['', ''], ['?demo=fox&color=blue', '#pose=2'], ['', '#shared'], ['?x=%23%26', '']]) {
    let target;
    vm.runInNewContext(process.argv[1], {location: {search, hash, replace: value => {target = value;}}});
    assert.equal(target, 'model_editor.html' + search + hash);
}
""", redirect_script], check=True, capture_output=True)
    assert (temp / 'play.html').is_file() and (temp / 'play.js').is_file()
    for asset in ('builder.js', 'builder-worker.js', 'builder-core.js', 'play-build.js', 'handoff.js'):
        assert (temp / asset).is_file(), asset
    for module in ('web_build.py', 'build_levels.py', 'make_animal_mods.py', 'animal_rom.py', 'romio.py'):
        assert (temp / 'py' / module).is_file(), module
    assert (temp/'level-editor.html').is_file() and (temp/'index.html').is_file()
    level_redirect = (temp / 'levels.html').read_text(encoding='utf-8')
    assert '<meta http-equiv="refresh" content="0; url=level-editor.html">' in level_redirect
    assert '<link rel="canonical" href="level-editor.html">' in level_redirect
    level_redirect_script = level_redirect.split('<script>')[1].split('</script>')[0]
    subprocess.run(['node', '-e', """
const vm = require('node:vm');
const assert = require('node:assert/strict');
for (const [search, hash] of [['', ''], ['?rom=1&x=%23%26', '#stage=2'], ['', '#shared'], ['?rom=1', '']]) {
    let target;
    vm.runInNewContext(process.argv[1], {location: {search, hash, replace: value => {target = value;}}});
    assert.equal(target, 'level-editor.html' + search + hash);
}
""", level_redirect_script], check=True, capture_output=True)
    assert b'level-editor.html' in (temp/'index.html').read_bytes()
    assert b'model_editor.html' in (temp/'index.html').read_bytes()
    for asset in ('rom.js','selection.js','palette.js','gallery.js','loader.js','runtime.js','levels.css'):
        assert (temp/'levels'/asset).is_file()
    for asset in ('level-4.json','animals.json','heads/dog.png','heads/sheep.png','heads/bear.png'):
        assert (temp/'demo'/asset).is_file(), asset
    subprocess.run(['node','--check',str(temp/'levels/runtime.js')],check=True,capture_output=True)
    assert b'/*EDITOR*/' not in (temp/'levels/runtime.js').read_bytes()
    first = output.read_bytes()
    subprocess.run(command, cwd=temp, check=True, capture_output=True)
    assert first == output.read_bytes()
    html = first.decode('utf-8')
    assert 'PRIVATE_INPUT_CANARY' not in html
    assert 'let TABLE={};' in html
    assert 'wind-up robot' in html and 'sssv-parts-lab-demo-v1' in html
    assert 'SSSVHandoff' in html and 'id="build-play"' in html  # Build & Play hands off to play.html
    poses = json.loads(html.split('Object.assign(BUNDLED_POSES,')[1].split(');', 1)[0])
    assert sorted(poses) == ['bear', 'dog', 'fox', 'seagull', 'sheep'], 'bundled animals must ship their assembly poses'
    assert (temp / 'demo/poses/dog.json').is_file()
    assert '/*VIEWER_' not in html and '/*TABLE*/' not in html
    script = html.split('<script>')[1].split('</script>')[0]
    subprocess.run(['node', '--check', '-'], input=script, text=True, encoding='utf-8', check=True, capture_output=True)
    # Explicit private labels must be rejected before reading them in public mode.
    rejected = subprocess.run(command + ['--labels', str(temp / 'nonexistent-private-labels.json')],
                              cwd=temp, capture_output=True, text=True)
    assert rejected.returncode and '--public rejects' in rejected.stderr
    table = temp / 'synthetic.json'
    table.write_text(json.dumps({'synthetic': {'seg_bases': {}, 'parts': [
        {'symbol': 'synthetic-head', 'ended': True, 'seg': 4, 'rom': 0, 'joint_calls': []}
    ]}}))
    labels = temp / 'labels.json'
    label = 'Head </script><script>PRIVATE_LABEL_CANARY</script>'
    document = {'format': 'sssv-viewer-labels-v1', 'partNames': {'synthetic': {'synthetic-head': label}}}
    labels.write_text(json.dumps(document))
    private = [sys.executable, str(ROOT / 'src/build_viewer.py'), str(table),
               '--labels', str(labels), '--out', str(output)]
    subprocess.run(private, cwd=temp, check=True, capture_output=True)
    built = output.read_text(encoding='utf-8')
    embedded = built.split('let TABLE=')[1].split(';', 1)[0]
    assert json.loads(embedded)['synthetic']['p'][0]['n'] == label
    assert label not in built, 'embedded labels must not terminate a script element'
    document['partNames']['synthetic'] = {'unknown-part': 'Head'}
    labels.write_text(json.dumps(document))
    rejected = subprocess.run(private, cwd=temp, capture_output=True, text=True)
    assert rejected.returncode and 'unknown part' in rejected.stderr
    document['partNames']['synthetic'] = {'synthetic-head': 'Head'}
    document['table_sha256'] = 'wrong-table'
    labels.write_text(json.dumps(document))
    rejected = subprocess.run(private, cwd=temp, capture_output=True, text=True)
    assert rejected.returncode and 'different animal table' in rejected.stderr
    subprocess.run(command, cwd=temp, check=True, capture_output=True)
    assert b'PRIVATE_LABEL_CANARY' not in output.read_bytes()
print('Public build: deterministic, empty ROM table, no private inputs, generated JS syntax valid.')
