"""Verify public output is reproducible and independent of private local inputs."""
from pathlib import Path
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
print('Public build: deterministic, empty ROM table, no private inputs, generated JS syntax valid.')
