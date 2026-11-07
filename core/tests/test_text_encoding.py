"""Every tracked text file under src/, tests/, docs/ and the root docs is UTF-8 without double-encoding mojibake.
Agents on Windows have twice written cp1252 or double-encoded UTF-8 (e.g. a middle dot as 'Â·'); this catches both."""
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEXT = {'.py', '.js', '.mjs', '.html', '.css', '.md', '.json', '.svg', '.yml', '.txt'}
MOJIBAKE = ('Â·', 'Â ', 'â€', 'Ã©', 'Ã¨', 'Ã¢')
files = subprocess.run(['git', 'ls-files', 'src', 'tests', 'docs', '*.md'], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
bad = []
for name in files:
    path = ROOT / name
    if path.suffix not in TEXT or not path.is_file():
        continue
    data = path.read_bytes()
    try:
        text = data.decode('utf-8')
    except UnicodeDecodeError as e:
        bad.append(f'{name}: not UTF-8 at byte {e.start}')
        continue
    for m in MOJIBAKE:
        if m in text and name != 'tests/test_text_encoding.py':
            line = text[:text.index(m)].count('\n') + 1
            bad.append(f'{name}:{line}: double-encoded text {m!r}')
assert not bad, '\n'.join(bad)
print(f'Text encoding: {len(files)} tracked files checked, all UTF-8, no mojibake')
