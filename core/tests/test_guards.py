"""Guards: banned words by zone, licences, binaries and history. Banned words are built by concatenation."""
from pathlib import Path
import os, shutil, subprocess, sys, tempfile

ROOT = Path(__file__).resolve().parents[1]
GUARDS = [sys.executable, str(ROOT / 'tools/guards.py')]
R, N, NIN, Z, DEC = 'r' + 'om', 'n' + '64', 'nin' + 'tendo', 'z' + '64', 'decom' + 'pilation'
D = 'decom' + 'p'


def tree(files):
    root = Path(tempfile.mkdtemp(prefix='guards-'))
    (root / 'tools').mkdir()
    shutil.copyfile(ROOT / 'tools/banned-words.txt', root / 'tools/banned-words.txt')
    (root / 'THIRD_PARTY.md').write_text('| Item | Files | Licence |\n', encoding='utf-8')
    for name, body in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body if isinstance(body, bytes) else body.encode('utf-8'))
    return root


def run(root, *extra):
    return subprocess.run(GUARDS + [str(root), *extra], capture_output=True, text=True)


def fails(files, needle):
    result = run(tree(files))
    assert result.returncode == 1 and needle.lower() in result.stdout.lower(), (files, result.stdout, result.stderr)


def passes(files):
    result = run(tree(files))
    assert result.returncode == 0, (files, result.stdout, result.stderr)


# test_hyphen_and_extension: banned code-zone words are caught, also inside names and attributes
fails({'src/page.html': '<details id="%s-panel">' % D}, 'src/page.html:1: ' + D)
fails({'src/app.js': 'let %sTable={};' % D}, D)  # a trailing * matches any ending
# test_naming_is_allowed: the game, its platform and ROM files may be named anywhere
passes({'src/load.js': "accept='.%s,.%s'" % (Z, R), 'src/x.js': '// %s %s' % (N, R), 'README.md': '%s %s. %s' % (NIN.title(), N.upper(), N.upper())})
# test_explainer_zone: the docs may explain, the code may not
passes({'README.md': 'An %s patch?' % ('I' + 'PS'), 'docs/HOW.md': DEC + ' vs re' + 'compilation'})
fails({'src/x.js': '// ' + DEC}, DEC)
# test_gpl_fails
root = tree({})
(root / 'THIRD_PARTY.md').write_text('| x | vendor/x.js | GPL-3.0 |\n', encoding='utf-8')
result = run(root)
assert result.returncode == 1 and 'GPL' in result.stdout, result.stdout
# test_unlisted_asset_fails
fails({'packs/sample/assets/thing.json': '{}'}, 'packs/sample/assets/thing.json')
# test_big_binary_fails / binaries only in allowed folders
fails({'src/blob.bin': b'\0' * 10}, 'src/blob.bin')
root = tree({'docs/img/big.png': b'\0' * (3 * 1024 * 1024)})
result = run(root)
assert result.returncode == 1 and 'docs/img/big.png' in result.stdout, result.stdout
passes({'docs/img/ok.png': b'\x89PNG\0\0'})
# test_snake_case_and_paths: underscores separate words; file names are checked too
fails({'tests/t.js': "x={%s_sha1:1}" % D}, 'tests/t.js:1: ' + D)
fails({'src/level-source-' + D + '.js': '// ok'}, 'src/level-source-' + D + '.js:path')
# test_history: a banned word that was committed and later removed still fails --history
root = tree({'src/a.js': '// ' + D + ' loader'})
git = lambda *a: subprocess.run(['git', '-C', str(root), *a], check=True, capture_output=True)
git('init', '-q'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'one')
(root / 'src/a.js').write_text('// loader', encoding='utf-8')
git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'two')
assert run(root).returncode == 0
result = run(root, '--history')
assert result.returncode == 1 and D in result.stdout, result.stdout
# commit messages are prose (explainer zone): code-zone words are allowed there
root = tree({'src/b.js': '// fine'})
git = lambda *a: subprocess.run(['git', '-C', str(root), *a], check=True, capture_output=True)
git('init', '-q'); git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A')
git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'add ' + D + ' loader')
result = run(root, '--history')
assert result.returncode == 0, result.stdout
print('Guards: zones, naming allowed, licences, binaries and history passed.')
