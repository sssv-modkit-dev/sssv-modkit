"""Portable browser discovery, generated page safety and failed-output checks."""
import argparse
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import make_release_banner as banner


class BannerTests(unittest.TestCase):
    def options(self, **overrides):
        values = dict(name='Bear', version='CONCEPT', palette='blue',
                      quote_style='english', recolor='both')
        values.update(overrides)
        return argparse.Namespace(**values)

    def test_path_discovery(self):
        with patch.object(banner.shutil, 'which', side_effect=lambda name: '/bin/chromium' if name == 'chromium' else None):
            self.assertEqual(banner.find_browser(None), '/bin/chromium')

    def test_application_discovery(self):
        home = Path('/home/banner-test')
        for path in (str(Path('/Applications/Chromium.app/Contents/MacOS/Chromium')),
                     str(home / 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
                     str(Path('X:/Programs') / 'Microsoft/Edge/Application/msedge.exe')):
            with self.subTest(path=path), patch.object(banner.shutil, 'which', return_value=None), \
                    patch.dict(banner.os.environ, {'PROGRAMFILES': 'X:/Programs'}, clear=True), \
                    patch.object(Path, 'home', return_value=home), \
                    patch.object(Path, 'is_file', lambda candidate: str(candidate) == path):
                self.assertEqual(banner.find_browser(None), path)

    def test_explicit_browser_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix='banner test ') as directory:
            browser = Path(directory) / 'browser executable'
            browser.touch()
            self.assertEqual(banner.find_browser(str(browser)), str(browser.resolve()))

    def test_custom_text_cannot_end_script(self):
        page = banner.make_page(self.options(name='</script> SCRIPT ICON SETTINGS 日本語'), 'japanese')
        self.assertEqual(page.count('</script>'), 1)
        self.assertIn(r'\u003c/script>', page)
        self.assertIn('ReleaseBanner.draw', page)
        self.assertNotIn('src="release_banner.js"', page)

    def test_existing_output_rejected_before_browser_launch(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'existing.png'
            output.write_bytes(b'keep existing output')
            with patch.object(sys, 'argv', ['banner', '--out', str(output)]), \
                    patch.object(banner, 'find_browser') as find_browser:
                with self.assertRaises(SystemExit) as error:
                    banner.main()
                self.assertEqual(error.exception.code, 1)
                find_browser.assert_not_called()
            self.assertEqual(output.read_bytes(), b'keep existing output')

    def test_failed_render_never_creates_output(self):
        for ready, size in ((False, (1500, 500)), (True, (800, 600))):
            with self.subTest(ready=ready, size=size), tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / 'output.png'

                def fake_browser(command, **kwargs):
                    screenshot = Path(next(arg.split('=', 1)[1] for arg in command if arg.startswith('--screenshot=')))
                    screenshot.write_bytes(b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' + struct.pack('>II', *size))
                    return banner.subprocess.CompletedProcess(command, 0,
                        b'<html data-banner-status="ready">' if ready else b'<html>', b'')

                with patch.object(banner.subprocess, 'run', side_effect=fake_browser):
                    with self.assertRaises(ValueError):
                        banner.render(self.options(), 'browser', output)
                self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
