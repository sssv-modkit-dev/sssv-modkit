"""Synthetic boundary tests for the local story bridge; no game data needed."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from http.server import HTTPServer
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('story_editor', ROOT / 'tools/story_editor.py')
story = importlib.util.module_from_spec(spec)
spec.loader.exec_module(story)


def fixture(work):
    project = story.Project.__new__(story.Project)
    project.work = work
    project.rom = work / 'base.z64'
    project.rom.write_bytes(b'base')
    project.text = {'banks': {'0': {'title': 'Test meadow', 'strings': {'0': '@CYHello\nworld!', '1': 'Bye'}}}}
    project.timing = {'levels': {'1': [{'i': 7, 'op': 'message', 'text': 0, 'hold_seconds': 3, 'says': 'Hello'},
                                        {'i': 8, 'op': 'message', 'text': 0, 'hold_seconds': 4, 'says': 'Hello'},
                                        {'i': 9, 'op': 'wait', 'frames': 30}]}}
    project.original_text, project.original_timing = copy.deepcopy(project.text), copy.deepcopy(project.timing)
    project.capacities = {'0': 128}
    return project


class StoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.work = Path(self.tmp.name)
        self.project = fixture(self.work)

    def data(self):
        return copy.deepcopy({'banks': self.project.text['banks'], 'levels': self.project.timing['levels']})

    def test_byte_budget_and_encoding(self):
        self.assertEqual(story.block_size({'0': 'A\nB'}), 12)
        data = self.data()
        for text in ('x'*100, '\u00e9', 'tab\there', '\x00'):
            data['banks']['0']['strings']['0'] = text
            with self.assertRaises(ValueError):
                self.project.save(data)
        self.assertFalse((self.work / 'dialogue.json').exists())

    def test_shape_and_timing_boundaries(self):
        for field, value in [('i', 8), ('text', 1), ('hold_seconds', -1), ('hold_seconds', 32512),
                             ('hold_seconds', 1.5), ('hold_seconds', True), ('hold_seconds', None)]:
            data = self.data()
            data['levels']['1'][0][field] = value
            with self.assertRaises(ValueError):
                self.project.save(data)
        data = self.data()
        del data['banks']['0']['strings']['1']
        with self.assertRaises(ValueError):
            self.project.save(data)

    def test_save_roundtrip_and_independent_message_occurrences(self):
        data = self.data()
        data['banks']['0']['strings']['0'] = 'New line / ASCII'
        data['levels']['1'][1]['hold_seconds'] = 12
        data['levels']['1'][2]['frames'] = 60
        self.project.save(data)
        self.assertEqual(story.Project.read(self.work / 'dialogue.json')['banks'], data['banks'])
        levels = story.Project.read(self.work / 'timing.json')['levels']
        self.assertEqual(levels['1'][0]['hold_seconds'], 3)
        self.assertEqual(levels['1'][1]['hold_seconds'], 12)
        self.assertEqual(levels['1'][2]['frames'], 60)

    def test_build_calls_research_writers_in_order_with_fresh_outputs(self):
        calls = []
        def run(tool, *args):
            calls.append((tool, args))
            if tool == 'terrain/terrain.py':
                self.assertEqual(args[0], 'apply')
                Path(args[2]).write_bytes(b'final')
            else:
                self.assertEqual(args[0], 'apply')
                Path(args[3]).write_bytes(b'edited')
            return 'ok\n'
        self.project.run = run
        (self.work / 'level-1.png').write_bytes(b'fixture')
        result = self.project.build({'kind': 'terrain', 'level': 1})
        self.assertEqual([c[0] for c in calls], ['downunder/textmod.py', 'script/scripttool.py', 'terrain/terrain.py'])
        self.assertEqual(calls[1][1][2], calls[0][1][3])
        padded = Path(calls[2][1][1]).read_bytes()
        self.assertEqual(padded[:6], b'edited')
        self.assertEqual(set(padded[6:]), {255})
        self.assertIn('story-terrain.z64', result['message'])
        self.assertEqual(self.project.rom.read_bytes(), b'base')
        self.project.build({'kind': 'dialogue'})
        self.assertEqual(len(list(self.work.glob('rom-*'))), 2)

    def test_http_rejects_foreign_origin_and_serves_state(self):
        server = HTTPServer(('127.0.0.1', 0), story.handler(self.project, self.work))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            url = 'http://127.0.0.1:%d' % server.server_port
            with urlopen(url + '/api/dialogue') as response:
                self.assertEqual(json.load(response)['capacities'], {'0':128})
            request = Request(url + '/api/save', json.dumps(self.data()).encode(),
                              {'Content-Type':'application/json', 'Origin':'https://example.invalid'})
            with self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertEqual(error.exception.code, 403)
            request = Request(url + '/api/dialogue', headers={'Host':'evil.invalid'})
            with self.assertRaises(HTTPError) as error:
                urlopen(request)
            self.assertEqual(error.exception.code, 403)
        finally:
            server.shutdown()
            thread.join()
            server.server_close()


if __name__ == '__main__':
    unittest.main()
