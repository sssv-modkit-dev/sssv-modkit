"""ROM-free decoder checks and opt-in ROM/target comparisons.

Set SSSV_ROM to a US 1.0 .z64. Set HEADS_TARGET_DIR to a directory containing
<name>_32.png to compare all 26 results; no target images are included here.
"""
import json
import os
from pathlib import Path
import struct
import sys

import pytest

np = pytest.importorskip('numpy')
pytest.importorskip('PIL')
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import heads


def test_walk_nested_lists_colours_normals_and_rejected_vertices():
    rom = bytearray(256)
    # A child inherits its parent's colour; changing colour after a vertex
    # load must not recolour those cached vertices. The fourth is out of range.
    struct.pack_into('>IIIIII', rom, 0, 0xFA000000, 0xF08020FF,
                     0x06000000, 0x01000020, 0xB8000000, 0)
    struct.pack_into('>IIIIIIII', rom, 32, 0x04001000, 0x01000080,
                     0xFA000000, 0x000000FF, 0xBF000000, 0x00000204,
                     0xBF000000, 0x00000206)
    struct.pack_into('>II', rom, 64, 0xB8000000, 0)
    for i, xyz in enumerate(((0, 0, 0), (20, 0, 0), (0, 20, 0), (401, 0, 0))):
        struct.pack_into('>hhhhhhBBBB', rom, 128 + 16 * i, *xyz,
                         0, 0, 0, 127, 129, 0, 255)
    tris = heads._Renderer(rom, {})._walk(0, {1: 0})
    assert len(tris) == 1
    assert tris[0][0] == (0, 0, 0, 1.0, -1.0, 0.0, (240, 128, 32))


def test_texture_ci4_nibbles_and_rgba5551():
    rom = bytearray(160)
    struct.pack_into('>HH', rom, 0, 0xF801, 0x07C0)
    rom[32:] = bytes([0x01] * 128)
    tex = heads._Renderer(rom, {})._texture({'image': 32, 'palette': 0})
    assert len(tex) == 16 and all(len(row) == 16 for row in tex)
    assert tex[0][:2] == [(255, 0, 0, 1), (0, 255, 0, 0)]


def test_part_lookup_uses_rom_offset_not_list_order():
    rom = struct.pack('>II', 0xB8000000, 0)
    chosen = {'rom': 0, 'primcolors': [{'rgba': '123456FF'}]}
    other = {'rom': 4, 'primcolors': []}
    for parts in ([chosen, other], [other, chosen]):
        renderer = heads._Renderer(rom, {'sample': {'parts': parts, 'seg_bases': {}}})
        assert renderer._part('sample', 0) == ([], [(18, 52, 86)])


def test_bad_rom_and_out_of_bounds_data_are_rejected():
    with pytest.raises(ValueError, match='big-endian'):
        heads.icons(b'')
    with pytest.raises(ValueError, match='beyond'):
        heads._Renderer(b'', {})._walk(0, {})
    with pytest.raises(ValueError, match='beyond'):
        heads._Renderer(b'', {})._texture({'image': 0, 'palette': 0})


def test_spec_has_all_names_and_rom_offsets():
    spec = json.loads(Path(heads.__file__).with_name('heads_spec.json').read_text())
    assert len(heads.ICON_NAMES) == len(set(heads.ICON_NAMES)) == 26
    assert set(spec) == set(heads.ICON_NAMES)
    for s in spec.values():
        offsets = s['parts'] + [e['part'] for e in s.get('extras', [])]
        assert all(isinstance(o, int) and 0 < o < heads.US10_SIZE for o in offsets)


@pytest.mark.parametrize('reverse', [False, True])
def test_eye_overlay_uses_table_texture_and_joint_direction(reverse):
    main = {'rom': 10, 'symbol': 'main'}
    eye = {'rom': 20, 'symbol': 'eye', 'texture': {'image': 32, 'palette': 0}}
    table = {'sample': {'parts': [eye, main], 'seg_bases': {}, 'draw_funcs': [
        {'events': [{'t': 'part', 'dl': 'main', 'joints': ['1', '2']},
                    {'t': 'part', 'dl': 'eye', 'joints': ['2', '1'] if reverse else ['1', '2']}]}
    ]}}
    renderer = heads._Renderer(b'', table)
    quad = [(-1, -1, 1, 0, 0), (1, -1, 1, 1, 0),
            (1, 1, 1, 1, 1), (-1, 1, 1, 0, 1)]
    if reverse:
        quad = [(-x, y, -z, u, v) for x, y, z, u, v in quad]
    renderer._quad = lambda offset, bases: quad
    def texture(metadata):
        assert metadata == eye['texture']
        tex = [[(0, 0, 0, 0)] * 16 for _ in range(16)]
        tex[0][0] = (255, 255, 255, 1)
        return tex
    renderer._texture = texture
    head = [[(-1, -1, -1), (1, -1, -1), (0, 1, 0)]]
    tris = renderer._eyes('sample', {'parts': [10]}, head, np.eye(3))
    assert len(tris) == 2
    assert all(v[2] > 1 and v[6] == (255, 255, 255) for t in tris for v in t)


@pytest.fixture(scope='module')
def rendered():
    filename = os.environ.get('SSSV_ROM')
    if not filename:
        pytest.skip('SSSV_ROM is not set')
    rom = bytearray(Path(filename).read_bytes())
    before = bytes(rom)
    result = heads.icons(rom)
    assert rom == before, 'rendering must not change its input'
    assert tuple(result) == heads.ICON_NAMES
    for name, im in result.items():
        assert im.mode == 'RGBA' and im.size == (32, 32), name
        assert im.getchannel('A').getbbox(), name
    return result


def test_rom_icons(rendered):
    assert len(rendered) == 26


@pytest.mark.parametrize('name', heads.ICON_NAMES)
def test_target_match(name, rendered):
    directory = os.environ.get('HEADS_TARGET_DIR')
    if not directory:
        pytest.skip('HEADS_TARGET_DIR is not set')
    with Image.open(Path(directory) / (name + '_32.png')) as target:
        assert target.size == (32, 32), name
        actual = np.asarray(rendered[name]).astype(np.int16)
        expected = np.asarray(target.convert('RGBA')).astype(np.int16)
    delta = np.abs(actual - expected)
    pixels, channel = int(np.any(delta, axis=2).sum()), int(delta.max())
    assert pixels <= 2 and channel <= 8, f'{name}: {pixels} differing pixels, max channel delta {channel}'
