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
    output = temp / 'index.html'
    command = [sys.executable, str(ROOT / 'tools/build_viewer.py'), '--public', '--out', str(output)]
    subprocess.run(command, cwd=temp, check=True, capture_output=True)
    first = output.read_bytes()
    subprocess.run(command, cwd=temp, check=True, capture_output=True)
    assert first == output.read_bytes()
    html = first.decode('utf-8')
    assert 'PRIVATE_INPUT_CANARY' not in html
    assert 'let TABLE={};' in html
    assert 'wind-up robot' in html and 'sssv-parts-lab-demo-v1' in html
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
    private = [sys.executable, str(ROOT / 'tools/build_viewer.py'), str(table),
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
