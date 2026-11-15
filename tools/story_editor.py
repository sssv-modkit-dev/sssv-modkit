#!/usr/bin/env python3
"""Loopback bridge for the private dialogue and terrain pages. No game data ships here."""
import argparse
import base64
import copy
import importlib.util
import io
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True  # Imported research tools are read-only.


def block_size(strings):
    return 2 + sum(4 + 2 * len(text) for text in strings.values())


def validate_dialogue(original, candidate, capacities):
    if candidate.keys() != original.keys():
        raise ValueError('Do not add or remove banks.')
    for bank, old in original.items():
        new = candidate[bank]['strings']
        if new.keys() != old['strings'].keys():
            raise ValueError('Do not add or remove strings.')
        for text in new.values():
            if not isinstance(text, str) or not all(c == '\n' or 32 <= ord(c) < 127 for c in text):
                raise ValueError('Use plain ASCII and line breaks only.')
        if block_size(new) > capacities[bank]:
            raise ValueError('Bank %s exceeds its byte budget.' % bank)


def validate_timing(original, candidate):
    if candidate.keys() != original.keys():
        raise ValueError('Do not add or remove timing levels.')
    for level, records in original.items():
        if len(records) != len(candidate[level]):
            raise ValueError('Do not add or remove timing records.')
        for old, new in zip(records, candidate[level]):
            field = 'hold_seconds' if old['op'] == 'message' else 'frames'
            if {k: v for k, v in new.items() if k != field} != {k: v for k, v in old.items() if k != field}:
                raise ValueError('Only hold times and wait frames are editable.')
            value = new[field]
            if type(value) is not int or not 0 <= value < 0x7F00:
                raise ValueError('Timing must be an integer from 0 to 32511.')


def write_json(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, indent=1, ensure_ascii=True), encoding='utf-8')
    temporary.replace(path)


class Project:
    def __init__(self, research, rom, work):
        self.research, self.rom, self.work = research, rom, work
        work.mkdir(parents=True, exist_ok=True)
        self.text = self.read(research / 'work/downunder/script_english.json')
        self.timing = self.read(research / 'work/script/timing.json')
        spec = importlib.util.spec_from_file_location('story_textmod', research / 'work/downunder/textmod.py')
        textmod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(textmod)
        raw = rom.read_bytes()
        self.capacities = {}
        for bank in self.text['banks']:
            pointer = struct.unpack_from('>I', raw, textmod.BTAB + 8 * int(bank))[0]
            start, end, strings = textmod.read_block(textmod._unpack(raw, pointer), textmod.ENGLISH)
            if len(strings) != len(self.text['banks'][bank]['strings']):
                raise ValueError('Source JSON does not match the base ROM string count.')
            self.capacities[bank] = end - start
        self.original_text, self.original_timing = copy.deepcopy(self.text), copy.deepcopy(self.timing)
        if (work / 'dialogue.json').exists():
            self.text = self.read(work / 'dialogue.json')
        if (work / 'timing.json').exists():
            self.timing = self.read(work / 'timing.json')
        self.validate(self.text['banks'], self.timing['levels'])

    @staticmethod
    def read(path):
        return json.loads(path.read_text(encoding='utf-8'))

    def validate(self, banks, levels):
        validate_dialogue(self.original_text['banks'], banks, self.capacities)
        validate_timing(self.original_timing['levels'], levels)

    def save(self, data):
        self.validate(data['banks'], data['levels'])
        text, timing = copy.deepcopy(self.text), copy.deepcopy(self.timing)
        # Keep metadata from the source, regardless of the client payload.
        for bank in text['banks']:
            text['banks'][bank]['strings'] = data['banks'][bank]['strings']
        timing['levels'] = data['levels']
        write_json(self.work / 'dialogue.json', text)
        write_json(self.work / 'timing.json', timing)
        self.text, self.timing = text, timing
        return {'message': 'Saved dialogue.json and timing.json in ' + str(self.work)}

    @staticmethod
    def level(value):
        level = int(value)
        if not 1 <= level <= 31:
            raise ValueError('Terrain level must be 1 to 31.')
        return level

    def run(self, relative, *args):
        result = subprocess.run([sys.executable, '-B', str(self.research / 'work' / relative), *map(str, args)],
                                capture_output=True, text=True, timeout=300)
        if result.returncode:
            raise ValueError((result.stdout + result.stderr)[-4000:])
        return result.stdout

    def sheet(self, level):
        path = self.work / ('level-%d.png' % self.level(level))
        if not path.exists():
            self.run('terrain/terrain.py', 'export', level, path, '--rom', self.rom)
        return path

    def save_sheet(self, data):
        from PIL import Image
        level = self.level(data['level'])
        raw = base64.b64decode(data['png'], validate=True)
        image = Image.open(io.BytesIO(raw))
        if image.format != 'PNG' or image.size != (272, 136):
            raise ValueError('Expected a 272 by 136 PNG with two-pixel tile gaps.')
        path = self.work / ('level-%d.png' % level)
        image.convert('RGB').save(path)
        return {'message': 'Saved ' + str(path)}

    def build(self, data):
        # Every build has fresh outputs. Failed subprocesses never replace a good ROM.
        self.save({'banks': self.text['banks'], 'levels': self.timing['levels']})
        folder = Path(tempfile.mkdtemp(prefix='rom-', dir=self.work))
        text_rom, timing_rom = folder / 'text.z64', folder / 'story.z64'
        log = self.run('downunder/textmod.py', 'apply', self.work / 'dialogue.json', self.rom, text_rom)
        log += self.run('script/scripttool.py', 'apply', self.work / 'timing.json', text_rom, timing_rom)
        output = timing_rom
        if data.get('kind') == 'terrain':
            level = self.level(data['level'])
            sheet = self.sheet(level)
            # The terrain writer requires free FF space for relocated banks.
            raw = timing_rom.read_bytes()
            tail = max(0xB00000, (len(raw) + 15) & ~15)
            padded = folder / 'terrain-base.z64'
            padded.write_bytes(raw + b'\xff' * (tail + 0x100000 - len(raw)))
            output = folder / 'story-terrain.z64'
            log += self.run('terrain/terrain.py', 'apply', padded, output, level, sheet, '--tail', hex(tail))
        return {'message': 'Built ' + str(output), 'log': log}


def handler(project, site):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(site), **kwargs)

        def trusted(self):
            expected = '127.0.0.1:%d' % self.server.server_port
            return self.headers.get('Host') == expected and self.headers.get('Origin', 'http://' + expected) == 'http://' + expected

        def reply(self, status, data):
            raw = json.dumps(data).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            if not self.trusted():
                return self.reply(403, {'error': 'Use the printed loopback URL.'})
            path = urlsplit(self.path)
            try:
                if path.path == '/api/dialogue':
                    return self.reply(200, {'banks': project.text['banks'], 'levels': project.timing['levels'],
                                            'capacities': project.capacities, 'help': project.text.get('_help', '')})
                if path.path == '/api/sheet':
                    raw = project.sheet(parse_qs(path.query)['level'][0]).read_bytes()
                    self.send_response(200)
                    self.send_header('Content-Type', 'image/png')
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Content-Length', str(len(raw)))
                    self.end_headers()
                    self.wfile.write(raw)
                    return
                if path.path.startswith('/api/'):
                    return self.reply(404, {'error': 'Unknown endpoint.'})
                super().do_GET()
            except Exception as error:
                self.reply(400, {'error': str(error)})

        def do_POST(self):
            if not self.trusted() or self.headers.get('Content-Type') != 'application/json':
                return self.reply(403, {'error': 'Same-origin JSON required.'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 2 * 1024 * 1024:
                    raise ValueError('Invalid request size.')
                data = json.loads(self.rfile.read(size))
                action = {'/api/save': project.save, '/api/sheet': project.save_sheet, '/api/build': project.build}.get(self.path)
                if not action:
                    return self.reply(404, {'error': 'Unknown endpoint.'})
                self.reply(200, action(data))
            except Exception as error:
                self.reply(400, {'error': str(error)})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research', type=Path, default=ROOT.parent / 'research')
    parser.add_argument('--rom', type=Path)
    parser.add_argument('--port', type=int, default=8010)
    args = parser.parse_args()
    research = args.research.resolve()
    rom = (args.rom or research / 'work/ghidra/sssv.z64').resolve()
    project = Project(research, rom, ROOT / 'build/story-data')
    sys.path.insert(0, str(ROOT / 'src'))
    from build_site import build
    site = ROOT / 'build/story-site'
    build(ROOT / 'packs/sample', site, no_vendor=True)
    server = HTTPServer(('127.0.0.1', args.port), handler(project, site))
    print('Story editor: http://127.0.0.1:%d/dialogue.html' % server.server_port, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
