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
# Assembly poses: per-part transforms only ({animal, parts:[{dl, rows, T, mirror}]}, the viewer's pose import format).
poses = sorted(p.name for p in (DEMO / 'poses').glob('*.json'))
assert poses == ['bear.json', 'dog.json', 'fox.json', 'seagull.json', 'sheep.json'], poses
for path in (DEMO / 'poses').glob('*.json'):
    pose, name = json.loads(path.read_text()), path.stem
    symbols = {p['s'] for p in animals['models'][name]['p']}
    assert set(pose) == {'animal', 'parts'} and pose['animal'] == name and pose['parts'], name
    assert path.stat().st_size < 5_000, name
    for q in pose['parts']:
        assert set(q) == {'dl', 'rows', 'T', 'mirror'} and q['dl'] in symbols, (name, q.get('dl'))
        r, t = q['rows'], q['T']
        assert len(r) == 3 and all(len(row) == 3 and all(abs(x) < 10 for x in row) for row in r), (name, q['dl'])
        assert len(t) == 3 and all(abs(x) < 1000 for x in t), (name, q['dl'])
        det = (r[0][0] * (r[1][1] * r[2][2] - r[1][2] * r[2][1]) - r[0][1] * (r[1][0] * r[2][2] - r[1][2] * r[2][0])
               + r[0][2] * (r[1][0] * r[2][1] - r[1][1] * r[2][0]))
        assert abs(det) > 1e-4 and q['mirror'] == (1 if det < 0 else 0), (name, q['dl'], det)
heads = sorted(p.name for p in (DEMO / 'heads').glob('*.png'))
assert heads == ['dog.png', 'fox.png', 'seagull.png', 'sheep.png'], heads
for p in (DEMO / 'heads').glob('*.png'):
    assert p.read_bytes()[:8] == b'\x89PNG\r\n\x1a\n' and p.stat().st_size < 10_000

html = (ROOT / 'core/src/web/level-editor.html').read_text(encoding='utf-8')
assert 'id="gallery"' in html and 'gallery.js' in html and '<select id="lv" hidden' in html
assert '<!--slot:level-source-->' in html
assert 'level-rom' in (ROOT / 'packs/sssv/slots/level-source.html').read_text(encoding='utf-8'), 'local ROM chooser must remain in the SSSV pack'

script = """
const assert=require('assert'),fs=require('fs');
global.LevelSelection=require('./core/src/levels/selection.js');
const g=require('./core/src/levels/gallery.js'),level=JSON.parse(fs.readFileSync('src/web/demo/level-4.json','utf8'));
assert.deepStrictEqual(g.animalNames(level.EDITOR_STOCK[4]).sort(),['Racing Dog','Racing Fox','Ram','Sheep']);
for(const n of g.animalNames(level.EDITOR_STOCK[4]))if(g.HEADS[n])assert(fs.existsSync('src/web/demo/heads/'+g.HEADS[n]+'.png')||g.HEADS[n]==='bear');
console.log('Demo level gallery names and head icon mapping passed.');
// Assembled poses stay compact: every posed vertex (through the viewer's own asmXf) lies near the animal's origin.
const app=fs.readFileSync('core/src/viewer/js/app.js','utf8'),xf=new Function('return '+app.split('const asmXf=')[1].split('};')[0]+'}')();
const animals=JSON.parse(fs.readFileSync('src/web/demo/animals.json','utf8')).models;
for(const name of Object.keys(animals)){const pose=JSON.parse(fs.readFileSync('src/web/demo/poses/'+name+'.json','utf8'));let r=0,n=0;
  for(const pp of pose.parts){const P=animals[name].p.find(p=>p.s===pp.dl).demo,f=xf(pp);for(const t of P.tris)for(const v of t.v){const w=f(v);r=Math.max(r,Math.hypot(...w));n++}}
  assert(n>100&&r>5&&r<150,name+' posed radius '+r);}
console.log('Bundled poses assemble within a compact radius.');
"""
subprocess.run(['node', '-e', script], cwd=ROOT, check=True)
subprocess.run(['node', '--check', 'core/src/levels/gallery.js'], cwd=ROOT, check=True)
subprocess.run(['node', '--check', 'core/src/levels/loader.js'], cwd=ROOT, check=True)
print('Demo bundle: level-4.json, animals.json and poses format, size, head icons and gallery wiring passed.')
