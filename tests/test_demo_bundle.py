"""ROM-free checks of the committed demo bundle: format, size budget and gallery wiring."""
import base64
import json
from pathlib import Path
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / 'src/web/demo'
SHA1 = 'e5e09205aa743a9e5043a42df72adc379c746b0b'

level = json.loads((DEMO / 'level-4.json').read_text())
assert level['format'] == 'sssv-demo-level-v1' and level['EDITOR_SHA1'] == SHA1
assert [l['id'] for l in level['LEVELS']] == [4] and list(level['EDITOR_STOCK']) == ['4']
assert set(level['ATLAS']) == {level['LEVELS'][0]['tex']} and level['ATLAS'][level['LEVELS'][0]['tex']].startswith('data:image/png;base64,')
assert len(level['TBL']) == 247 and level['ANIM'] == {'models': {}, 'names': {}, 'species': {}}
spawn = struct.unpack('<%di' % (len(base64.b64decode(level['LEVELS'][0]['sp'])) // 4), base64.b64decode(level['LEVELS'][0]['sp']))
used = {spawn[i] for i in range(0, len(spawn), 5)}
assert set(map(int, level['MODEL'])) <= used, 'bundle carries a model no spawn uses'
assert (DEMO / 'level-4.json').stat().st_size < 400_000

animals = json.loads((DEMO / 'animals.json').read_text())
assert animals['format'] == 'sssv-demo-animals-v1' and sorted(animals['models']) == ['bear', 'dog', 'fox', 'seagull', 'sheep']
for name, model in animals['models'].items():
    assert model['p'], name
    for part in model['p']:
        d = part['demo']
        assert part['r'] == 0 and part['j'] == 'demo' and d['tris'], (name, part['s'])
        assert all(0 <= t['c'] < len(d['cols']) or t['c'] == -1 for t in d['tris'])
assert (DEMO / 'animals.json').stat().st_size < 120_000
heads = sorted(p.name for p in (DEMO / 'heads').glob('*.png'))
assert heads == ['dog.png', 'fox.png', 'seagull.png', 'sheep.png'], heads
for p in (DEMO / 'heads').glob('*.png'):
    assert p.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n' and p.stat().st_size < 10_000

html = (ROOT / 'src/web/levels.html').read_text(encoding='utf-8')
assert 'id="gallery"' in html and 'gallery.js' in html and '<select id="lv" hidden' in html
assert 'level-rom' in html, 'local ROM chooser must remain'

script = """
const assert=require('assert'),fs=require('fs');
global.LevelSelection=require('./src/levels/selection.js');
const g=require('./src/levels/gallery.js'),level=JSON.parse(fs.readFileSync('src/web/demo/level-4.json','utf8'));
assert.deepStrictEqual(g.animalNames(level.EDITOR_STOCK[4]).sort(),['Racing Dog','Racing Fox','Ram','Sheep']);
for(const n of g.animalNames(level.EDITOR_STOCK[4]))if(g.HEADS[n])assert(fs.existsSync('src/web/demo/heads/'+g.HEADS[n]+'.png')||g.HEADS[n]==='bear');
console.log('Demo level gallery names and head icon mapping passed.');
"""
subprocess.run(['node', '-e', script], cwd=ROOT, check=True)
subprocess.run(['node', '--check', 'src/levels/gallery.js'], cwd=ROOT, check=True)
subprocess.run(['node', '--check', 'src/levels/loader.js'], cwd=ROOT, check=True)
print('Demo bundle: level-4.json and animals.json format, size, head icons and gallery wiring passed.')
