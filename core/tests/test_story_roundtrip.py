"""Optional private integration: actual writer calls and disk readback (no emulator claim).

python tests/test_story_roundtrip.py [research folder]
All generated data stays in ignored build/. No source assets are changed.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('story_editor', ROOT / 'tools/story_editor.py')
story = importlib.util.module_from_spec(spec)
spec.loader.exec_module(story)
research = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'research'
base = research / 'work/ghidra/sssv.z64'
inputs = [base, research / 'work/downunder/script_english.json', research / 'work/script/timing.json']
before = [hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs]
(ROOT / 'build').mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='story-roundtrip-', dir=ROOT / 'build') as folder:
    work = Path(folder)
    p = story.Project(research, base, work)
    bank = '0'
    record = next(r for r in p.timing['levels']['1'] if r['op'] == 'message')
    line = str(record['text'])
    replacement = 'Test story!'
    p.text['banks'][bank]['strings'][line] = replacement
    record['hold_seconds'] += 1
    hold = record['hold_seconds']
    p.save({'banks': p.text['banks'], 'levels': p.timing['levels']})
    from PIL import Image
    sheet = p.sheet(1)
    image = Image.open(sheet).convert('RGB')
    image.putpixel((0, 0), (255, 0, 255))
    image.save(sheet)
    result = p.build({'kind':'terrain', 'level':1})
    output = Path(result['message'].removeprefix('Built '))
    p.run('downunder/textmod.py', 'export', work / 'text-readback.json', output)
    p.run('script/scripttool.py', 'export', work / 'timing-readback.json', output)
    p.run('terrain/terrain.py', 'export', 1, work / 'tile-readback.png', '--rom', output)
    text = json.loads((work / 'text-readback.json').read_text(encoding='utf-8'))
    timing = json.loads((work / 'timing-readback.json').read_text(encoding='utf-8'))
    assert text['banks'][bank]['strings'][line] == replacement
    found = next(r for r in timing['levels']['1'] if r['i'] == record['i'])
    assert found['hold_seconds'] == hold
    with Image.open(work / 'tile-readback.png') as readback:
        assert readback.getpixel((0,0)) == (255,0,255)
    reopened = story.Project(research, base, work)
    assert reopened.text['banks'][bank]['strings'][line] == replacement
    assert next(r for r in reopened.timing['levels']['1'] if r['i'] == record['i'])['hold_seconds'] == hold
assert [hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs] == before
print('Private disk round trip: edited text, hold seconds and tile pixel survived all three writers; saved JSON reopens; source inputs unchanged.')
