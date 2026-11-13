"""Synthetic mesh rotation, project texture safety and IPS checks; no game inputs."""
import copy
import json
import math
import os
from pathlib import Path
import random
import struct
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / 'src'))
import make_animal_mods as B
import romio

VTX, PATCH = 0x1100, 0x1800
VERTICES = [(-4, -6, -8), (4, 6, 8), (3, 2, 1), (-2, 5, -3)]


def fixture():
    base = bytearray(0x2000)
    for i, xyz in enumerate(VERTICES):
        struct.pack_into('>hhhHhhBBBB', base, VTX + i * 16, *xyz, 0, 32 + i, -64 - i, 12, 34, 56, 255)
    part = {'symbol': 'BODY', 'ended': True, 'seg': 4, 'rom': 0x1400,
            'groups': [{'rom': VTX, 'n': len(VERTICES), 'bbox': [[-4, 4], [-6, 6], [-8, 8]]}], 'primcolors': []}
    return bytes(base), {'test': {'parts': [part]}}


def build(mesh=None, deform=None, document=None, table=None):
    base, default_table = fixture()
    if document is None:
        config = {'animal': 'test'}
        if mesh is not None: config['mesh'] = [dict(symbol='BODY', **mesh)]
        if deform is not None: config['deform'] = [dict(symbol='BODY', **deform)]
        document = config
    entries, _ = B.config_entries(document, 'synthetic')
    plan = B.plan_edits(table or default_table, base, entries, log=lambda _: None)
    out, count = B.apply_plan(base, plan, log=lambda _: None)
    return base, bytes(out), count


def xyz(out):
    return [list(struct.unpack_from('>hhh', out, VTX + i * 16)) for i in range(len(VERTICES))]


class MeshRotation(unittest.TestCase):
    def test_quarter_turns_and_fixed_vertex_bytes(self):
        for angles, expected in [([90, 0, 0], [3, -1, 2]), ([0, 90, 0], [1, 2, -3]),
                                 ([0, 0, 90], [-2, 3, 1]), ([0, 0, -90], [2, -3, 1])]:
            with self.subTest(angles=angles):
                base, out, count = build({'rotate': angles})
                self.assertEqual(xyz(out)[2], expected)
                self.assertEqual(count, len(VERTICES))
                self.assertEqual(len(base), len(out))
                for i in range(len(VERTICES)):
                    o = VTX + i * 16
                    self.assertEqual(base[o + 6:o + 16], out[o + 6:o + 16], 'flags, UV and normal/colour bytes unchanged')

    def test_scale_xyz_rotation_move_and_custom_pivot(self):
        # [3,2,1] - [1,1,1], scale -> [4,3,0]; X90 -> [4,0,3];
        # Y90 -> [3,0,-4]; Z90 -> [0,3,-4]; restore pivot and move -> [11,24,27].
        _, out, _ = build({'scale': [2, 3, 4], 'rotate': [90, 90, 90], 'about': [1, 1, 1], 'move': [10, 20, 30]})
        self.assertEqual(xyz(out)[2], [11, 24, 27])

    def test_default_zero_rotation_preserves_old_mesh_result(self):
        _, old, _ = build({'scale': [2, .5, 3], 'move': [.5, -.5, 1]})
        _, new, _ = build({'scale': [2, .5, 3], 'move': [.5, -.5, 1], 'rotate': [0, 0, 0]})
        self.assertEqual(old, new)
        self.assertEqual(xyz(new)[2], [7, 1, 4])

    def test_rotation_before_deform(self):
        mesh = {'rotate': [20, -35, 70], 'scale': [1.5, 1, .75], 'move': [2, -3, 1]}
        deform = {'ops': [{'type': 'twist', 'axis': 'y', 'degrees': 35}]}
        _, rotated, _ = build(mesh)
        base, table = fixture()
        plan = B.plan_edits(table, rotated, [('synthetic', {'animal': 'test', 'deform': [dict(symbol='BODY', **deform)]})], log=lambda _: None)
        expected, _ = B.apply_plan(rotated, plan, log=lambda _: None)
        _, combined, _ = build(mesh, deform)
        self.assertEqual(combined, bytes(expected))
        self.assertNotEqual(combined, rotated)

    def test_finite_numeric_vectors_required(self):
        invalid = [None, 'x', [1, 2], [1, 2, 3, 4], [0, 0, float('nan')], [0, float('inf'), 0],
                   [0, 0, '90'], [0, 0, True], [0, {}, 0]]
        for key in ['rotate', 'scale', 'move', 'about']:
            for value in invalid:
                with self.subTest(key=key, value=value), self.assertRaisesRegex(SystemExit, '3 finite numbers'):
                    build({key: value})

    def test_rotation_preserves_shared_vertex_refusal(self):
        _, table = fixture()
        table['other'] = {'parts': copy.deepcopy(table['test']['parts'])}
        table['other']['parts'][0]['symbol'] = 'SHARED'
        with self.assertRaisesRegex(SystemExit, 'allow_shared'):
            build({'rotate': [0, 0, 15]}, table=table)
        build({'rotate': [0, 0, 15], 'allow_shared': True}, table=table)

    def test_int16_clamping_unchanged(self):
        _, out, _ = build({'rotate': [0, 0, 90], 'move': [50000, -50000, 0]})
        self.assertEqual(xyz(out)[2], [32767, -32768, 1])


class ProjectTextures(unittest.TestCase):
    def project(self, patch=None):
        return {'format': 'model-editor-project-v1', 'demos': [], 'animals': [],
                'texture_patches': [patch or {'offset': hex(PATCH), 'expect': '00000000', 'write': '12345678'}]}

    def test_saved_project_matches_live_config_and_ips_round_trip(self):
        project = self.project()
        project['animals'] = [{'animal': 'test', 'mesh': [{'symbol': 'BODY', 'rotate': [0, 0, 90]}]}]
        before = copy.deepcopy(project)
        base, saved, _ = build(document=json.loads(json.dumps(project)))
        live = {'animals': project['animals'] + [{'code_patch': project['texture_patches']}]}
        _, live_out, _ = build(document=live)
        self.assertEqual(project, before, 'flattening must not mutate saved project')
        self.assertEqual(saved, live_out)
        self.assertEqual(saved[PATCH:PATCH + 4], bytes.fromhex('12345678'))
        self.assertEqual(romio.apply_ips(base, romio.make_ips(base, saved)), saved)

    def test_texture_only_project(self):
        _, out, moved = build(document=self.project())
        self.assertEqual(moved, 0)
        self.assertEqual(out[PATCH:PATCH + 4], bytes.fromhex('12345678'))

    def test_wrong_original_header_and_geometry_overlap_refused(self):
        for patch, reason in [({'offset': PATCH, 'expect': 'FFFFFFFF', 'write': '12345678'}, 'expected'),
                              ({'offset': 0x100, 'expect': '00000000', 'write': '12345678'}, 'header'),
                              ({'offset': PATCH, 'expect': '00000000', 'write': '1234'}, 'bytes')]:
            with self.subTest(reason=reason), self.assertRaisesRegex(SystemExit, reason):
                build(document=self.project(patch))
        base, _ = fixture()
        project = self.project({'offset': VTX, 'expect': base[VTX:VTX + 4].hex(), 'write': '12345678'})
        project['animals'] = [{'animal': 'test', 'mesh': [{'symbol': 'BODY', 'rotate': [0, 0, 10]}]}]
        with self.assertRaisesRegex(SystemExit, 'overlaps'):
            build(document=project)

    def test_project_shape_and_format_boundary(self):
        project = self.project()
        project['texture_patches'] = 'invalid'
        with self.assertRaisesRegex(SystemExit, 'texture_patches.*list'):
            B.config_entries(project, 'synthetic')
        project['format'] = 'unrelated-format'
        entries, _ = B.config_entries(project, 'synthetic')
        self.assertEqual(entries, [], 'texture_patches field is consumed only for the model project format')
        with self.assertRaisesRegex(SystemExit, 'animals.*list'):
            B.config_entries({'animals': {}}, 'synthetic')


if (Path(os.environ.get('SSSV_EDITOR_CORE', ROOT / 'core')) / 'src/viewer/js/app.js').exists():
    class LiveViewerParity(unittest.TestCase):
        def test_mesh_against_live_applyMesh(self):
            source = Path(os.environ.get('SSSV_EDITOR_CORE', ROOT / 'core')) / 'src/viewer/js/app.js'
            rng = random.Random(4762)
            edits = [{'scale': [1.25, .8, 2], 'move': [2, -.5, 3], 'rotate': [rng.uniform(-175, 175) for _ in range(3)]} for _ in range(25)]
            js = "const fs=require('fs');const s=fs.readFileSync(process.argv[1],'utf8');const p=s.split('//#PURE-START')[1].split('//#PURE-END')[0];eval(p);const cases=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(cases.edits.map(e=>cases.vertices.map(v=>applyMesh(v,{s:e.scale,m:e.move,r:e.rotate,o:false},[-4,-6,-8,4,6,8])))));"
            result = subprocess.run(['node', '-e', js, str(source)], input=json.dumps({'edits': edits, 'vertices': VERTICES}), capture_output=True, text=True, check=True)
            expected = json.loads(result.stdout)
            for edit, wanted in zip(edits, expected):
                self.assertEqual(xyz(build(edit)[1]), wanted)


if __name__ == '__main__':
    unittest.main()

