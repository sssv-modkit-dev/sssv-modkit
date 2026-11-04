"""Generate original geometry for ROM-free browser checks and documentation.

Run python tests/make_viewer_fixture.py, then build_viewer.py with the printed
table path. The .z64 is a synthetic parser fixture, not a playable game ROM.
"""
import json
from pathlib import Path
import struct

OUT = Path(__file__).resolve().parents[1] / 'build' / 'viewer-validation'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    data = bytearray(0x800000)
    parts = []
    colors = [0x709CF0FF, 0x53C9AAFF, 0xF0B85DFF, 0xCC8CE8FF]
    shapes = [(110, 70, 60), (65, 110, 65), (80, 80, 100), (100, 45, 85)]
    triangles = [(0, 2, 1), (1, 2, 3), (4, 5, 6), (5, 7, 6),
                 (0, 1, 4), (1, 5, 4), (2, 6, 3), (3, 6, 7),
                 (0, 4, 2), (2, 4, 6), (1, 3, 5), (3, 7, 5)]
    for i, (x, y, z) in enumerate(shapes):
        vertex = 0x1000 + i * 0x100
        address = 0x2000 + i * 0x100
        for k in range(8):
            point = [x if k & 1 else -x, y if k & 2 else -y, z if k & 4 else -z]
            if i == 2 and k & 2:
                point[0] = int(point[0] * .35)
            struct.pack_into('>hhhHhhBBBB', data, vertex + k * 16, *point, 0, 0, 0, 255, 255, 255, 255)
        commands = [(0xFA000000, colors[i]), (0x0400007F, 0x04000000 + vertex)]
        commands += [(0xBF000000, (a * 2 << 16) | (b * 2 << 8) | c * 2) for a, b, c in triangles]
        commands += [(0xB8000000, 0)]
        for j, command in enumerate(commands):
            struct.pack_into('>II', data, address + j * 8, *command)
        parts.append(dict(symbol='SYNTHETIC_PART_' + str(i + 1), rom=address,
                          ended=True, seg=4, joint_calls=[], sections=['SYNTHETIC']))
    table = {'synthetic demo': dict(parts=parts, seg_bases={'4': '0'}, sections=['SYNTHETIC'])}
    (OUT / 'synthetic.z64').write_bytes(data)
    table_path = OUT / 'synthetic-table.json'
    table_path.write_text(json.dumps(table), encoding='utf-8')
    print(table_path)


if __name__ == '__main__':
    main()
