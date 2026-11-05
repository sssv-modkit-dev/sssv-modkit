"""ROM-free codec, record-safety and cross-language decoder checks."""
import base64
import json
from pathlib import Path
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'src'))
import build_levels as levels
import level_rnc as rnc
import level_rnc_pack as packer


def rejects(call):
    try:
        call()
    except (ValueError, TypeError, KeyError):
        return
    raise AssertionError('Invalid input accepted')


fixtures = [b'', b'a', b'abc'*1000, bytes(range(256))*35, bytes((i*i+17*i)%251 for i in range(20000))]
cases = []
for raw in fixtures:
    packed = packer.pack(raw)
    assert rnc.unpack(packed, 0)[0] == raw
    cases.append({'packed': base64.b64encode(packed).decode(), 'raw': base64.b64encode(raw).decode()})
script = """
const assert=require('assert'),fs=require('fs'),rom=require('./src/levels/rom.js');
for(const c of JSON.parse(fs.readFileSync(0,'utf8'))){
 const packed=Buffer.from(c.packed,'base64');
 assert.deepStrictEqual(Buffer.from(rom.unpack(packed)),Buffer.from(c.raw,'base64'));
 const bad=Buffer.from(packed);bad[14]^=1;assert.throws(()=>rom.unpack(bad));
}
console.log('Python/JS RNC roundtrips and corrupt-stream rejection passed');
"""
subprocess.run(['node','-e',script],input=json.dumps(cases),text=True,cwd=ROOT,check=True)
record = bytearray(22)
struct.pack_into('>Hhhh',record,0,34,100,200,300)
data = b'\0\1'+record
changed = bytearray(record)
struct.pack_into('>h',changed,2,400)
spec = {'set':[{'index':0,'bytes':changed.hex()}], 'add':[{'bytes':record.hex()}]}
edited = levels.edit_records(data,22,spec,'props')
assert struct.unpack_from('>H',edited)[0] == 2 and edited[2:24] == changed
assert data == b'\0\1'+record
rejects(lambda: levels.edit_records(data,22,{'delete':[0]},'props'))
rejects(lambda: levels.edit_records(data,22,{'set':[{'index':True,'bytes':changed.hex()}]},'props'))
rejects(lambda: levels.edit_records(data,22,{'set':[{'index':0,'bytes':'00'}]},'props'))
rejects(lambda: levels.edit_records(b'\0\0',16,{'add':[{'bytes':'00'*16}]},'animals'))
grown = levels.edit_records(b'\0\0',16,{'add':[{'bytes':'00'*16}]},'animals',new_animals=True)
assert struct.unpack_from('>H',grown)[0] == 1 and len(grown) == 18
rejects(lambda: levels.edit_records(b'\0\0',16,{'add':[{'bytes':'00'*22}]},'animals',new_animals=True))
stock=b'synthetic stock'
diff={'format':'sssv-editor-diff','version':1,'rom_sha1':levels.romio.sha1(stock),'levels':{}}
assert levels.validate(diff,stock)[0] == diff
rejects(lambda: levels.validate({**diff,'rom_sha1':'wrong'},stock))
rejects(lambda: levels.validate({**diff,'levels':{'0':{}}},stock))
rejects(lambda: levels.validate({**diff,'levels':{'1':{'terrain':{}}}},stock))
project={'format':'sssv-workspace-project','version':1,'rom_sha1':diff['rom_sha1'],'level_diff':diff,'parts':{'config':{'format':'sssv-parts-lab-demo-v1'}}}
rejects(lambda: levels.validate(project,stock))
assert levels.romio.apply_ips(stock,levels.patch(stock,stock+b'expanded'))==stock+b'expanded'
print('Level builder: source binding, record boundaries, deletion rejection and expanded IPS roundtrip passed.')

# Modded bases and all three N64 byte orders normalize to the same identity.
base = bytearray(0x800000)
base[:4] = bytes.fromhex('80371240')
base[0x3B:0x3F] = b'NSVE'
base[0x2000] = 123
assert levels.normalize_rom(base) == base
swapped = bytearray(base)
swapped[0::2], swapped[1::2] = swapped[1::2], swapped[0::2]
assert levels.normalize_rom(swapped) == base
little = bytearray(base)
little[0::4], little[1::4], little[2::4], little[3::4] = little[3::4], little[2::4], little[1::4], little[0::4]
assert levels.normalize_rom(little) == base
assert levels.normalize_rom(base + bytes(16)) == base + bytes(16)
wrong = bytearray(base); wrong[0x3B:0x3F] = b'ABCD'
rejects(lambda: levels.normalize_rom(wrong))
rejects(lambda: levels.normalize_rom(base[:-1]))
script = """
const assert=require('assert'),fs=require('fs'),r=require('./src/levels/rom.js');
const base=Buffer.from(fs.readFileSync(0,'utf8'),'base64');
assert.deepStrictEqual(Buffer.from(r.normalize(base)),base);
for(const stride of [2,4]){const swap=Buffer.from(base);for(let i=0;i<swap.length;i+=stride)swap.subarray(i,i+stride).reverse();assert.deepStrictEqual(Buffer.from(r.normalize(swap)),base);}
const expanded=Buffer.concat([base,Buffer.alloc(16)]);assert.deepStrictEqual(Buffer.from(r.normalize(expanded)),expanded);
const bad=Buffer.from(base);bad[0x3B]=0;assert.throws(()=>r.normalize(bad));
console.log('Stock/modded-size ROM normalization, byte orders and wrong-game rejection passed in Python/JS.');
"""
subprocess.run(['node','-e',script],input=base64.b64encode(base).decode(),text=True,cwd=ROOT,check=True)
