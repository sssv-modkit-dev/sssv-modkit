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
    output = temp / 'model-editor.html'
    command = [sys.executable, str(ROOT / 'src/build_viewer.py'), '--public', '--no-vendor', '--out', str(output)]
    subprocess.run(command, cwd=temp, check=True, capture_output=True)
    assert output.is_file()
    redirect = (temp / 'parts_lab.html').read_text(encoding='utf-8')
    assert '<meta http-equiv="refresh" content="0; url=model-editor.html">' in redirect
    assert '<link rel="canonical" href="model-editor.html">' in redirect
    redirect_script = redirect.split('<script>')[1].split('</script>')[0]
    subprocess.run(['node', '-e', """
const vm = require('node:vm');
const assert = require('node:assert/strict');
for (const [search, hash] of [['', ''], ['?demo=fox&color=blue', '#pose=2'], ['', '#shared'], ['?x=%23%26', '']]) {
    let target;
    vm.runInNewContext(process.argv[1], {location: {search, hash, replace: value => {target = value;}}});
    assert.equal(target, 'model-editor.html' + search + hash);
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
    assert b'model-editor.html' in (temp/'index.html').read_bytes()
    for asset in ('rom.js','scene.js','scene-import.js','edits-export.js','selection.js','palette.js','gallery.js','loader.js','runtime.js','levels.css'):
        assert (temp/'levels'/asset).is_file()
    assert not (temp/'demo'/'level-4.json').exists()
    page = (temp/'level-editor.html').read_text(encoding='utf-8')
    assert page.index('levels/scene.js') < page.index('levels/runtime.js') and 'levels/edits-export.js' in page
    for asset in ('level-4.scene.json','animals.json','heads/dog.png','heads/sheep.png','heads/bear.png'):
        assert (temp/'demo'/asset).is_file(), asset
    subprocess.run(['node','--check',str(temp/'levels/runtime.js')],check=True,capture_output=True)
    assert b'/*EDITOR*/' not in (temp/'levels/runtime.js').read_bytes()
    # Every public page: CSP meta, noscript explanation, own favicon, no third-party origin loaded.
    import base64, hashlib, re
    titles = {'index.html': 'sssv-modkit', 'model-editor.html': 'Model Editor (sssv-modkit)', 'level-editor.html': 'Level Editor (sssv-modkit)',
              'play.html': 'Build &amp; Play (sssv-modkit)', 'parts_lab.html': 'Model Editor (sssv-modkit)', 'levels.html': 'Level Editor (sssv-modkit)'}
    for page, title in titles.items():
        text = (temp / page).read_text(encoding='utf-8')
        assert '<title>' + title + '</title>' in text, page
        assert 'http-equiv="Content-Security-Policy"' in text and '<noscript>' in text, page
        csp = re.search(r'Content-Security-Policy" content="([^"]+)"', text).group(1)
        assert "default-src 'none'" in csp and (page == 'play.html' or 'unsafe-eval' not in csp.replace('wasm-unsafe-eval', '')), page  # play.html: Emscripten cores eval strings
        assert not re.search(r'https?://[^/]*(jsdelivr|cdn\.|unpkg|cloudflare|googleapis|gstatic)', text), page
        # Only GitHub links (navigation) may be absolute; nothing is fetched from them.
        for url in re.findall(r'(?:src|href)="(https?://[^"]+)"', text):
            assert url.startswith(('https://github.com/sssv-modkit-dev/', 'https://emulatorjs.org/', 'https://pyodide.org/')), (page, url)
        for body in re.findall(r'<script>(.*?)</script>', text, re.S):   # inline scripts must be pinned by hash
            digest = base64.b64encode(hashlib.sha256(body.encode('utf-8')).digest()).decode('ascii')
            assert "'sha256-" + digest + "'" in csp, (page, 'inline script not covered by CSP')
    for icon in ('favicon.svg', 'favicon-model-editor.svg', 'favicon-level-editor.svg', 'favicon-build-play.svg'):
        assert (temp / icon).read_text(encoding='utf-8').startswith('<svg'), icon
    for page, icon in (('model-editor.html', 'favicon-model-editor.svg'), ('level-editor.html', 'favicon-level-editor.svg'), ('play.html', 'favicon-build-play.svg')):
        assert 'href="' + icon + '"' in (temp / page).read_text(encoding='utf-8'), page
    for script in ('play.js', 'builder-core.js', 'builder-worker.js'):
        assert not re.search(r'https?://', (temp / script).read_text(encoding='utf-8').replace('https://emulatorjs.org', '')), script
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
