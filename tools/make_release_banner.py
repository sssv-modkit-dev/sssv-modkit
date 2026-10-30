#!/usr/bin/env python3
"""Render release banners using Python's stdlib and a local Chromium browser."""
import argparse
import base64
import json
import os
from pathlib import Path
import random
import shutil
import struct
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PRESETS = {
    'blue': ('Ceruleanish Ear Bear', '#8dc4ed'),
    'orange': ('Amberish Ear Bear', '#efb16b'),
    'green': ('Jadeish Ear Bear', '#91cbb1'),
}
STYLES = ('english', 'french', 'spanish', 'german', 'japanese')


def find_browser(explicit):
    if explicit:
        candidate = shutil.which(explicit) or Path(explicit).expanduser()
        if Path(candidate).is_file():
            return str(Path(candidate).resolve())
        raise ValueError('Browser executable not found: ' + explicit)
    for name in ('chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable', 'chrome', 'msedge', 'microsoft-edge'):
        if shutil.which(name):
            return shutil.which(name)
    candidates = []
    for directory in (Path('/Applications'), Path.home() / 'Applications'):
        for application, binary in (('Google Chrome', 'Google Chrome'),
                                    ('Chromium', 'Chromium'), ('Microsoft Edge', 'Microsoft Edge')):
            candidates.append(directory / f'{application}.app/Contents/MacOS/{binary}')
    for variable in ('PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'):
        if os.environ.get(variable):
            for suffix in ('Google/Chrome/Application/chrome.exe',
                           'Microsoft/Edge/Application/msedge.exe'):
                candidates.append(Path(os.environ[variable]) / suffix)
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    raise ValueError('Install Chrome, Chromium or Edge, or supply --browser PATH.')


def make_page(options, style):
    # Inline local assets so rendering never needs a server or network request.
    script = (ROOT / 'tools/release_banner.js').read_text(encoding='utf-8')
    icon = base64.b64encode((ROOT / 'tools/viewer/assets/icon.png').read_bytes()).decode('ascii')
    settings = json.dumps({
        'name': options.name or PRESETS[options.palette][0],
        'version': options.version, 'accent': PRESETS[options.palette][1],
        'style': style, 'recolor': options.recolor,
    }, ensure_ascii=True).replace('<', '\\u003c')
    return r'''<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;width:1500px;height:500px;overflow:hidden}canvas{display:block}</style>
<canvas width="1500" height="500"></canvas><script>
const settings=SETTINGS;
SCRIPT
const img=new Image();
img.onload=async()=>{
 try {
  await document.fonts.ready;
  ReleaseBanner.draw(document.querySelector('canvas'),settings,img);
  document.documentElement.dataset.bannerStatus='ready';
 } catch(error) {
  document.documentElement.dataset.bannerStatus='failed';
 }
};
img.onerror=()=>{document.documentElement.dataset.bannerStatus='failed'};
img.src='data:image/png;base64,ICON';
</script>'''.replace('SCRIPT', script).replace('ICON', icon).replace('SETTINGS', settings)


def render(options, browser, output):
    style = random.choice(STYLES) if options.quote_style == 'random' else options.quote_style
    with tempfile.TemporaryDirectory(prefix='sssv-banner-') as temporary:
        work = Path(temporary)
        page, screenshot = work / 'banner.html', work / 'banner.png'
        page.write_text(make_page(options, style), encoding='utf-8')
        command = [browser, '--headless', '--disable-gpu', '--no-first-run',
                   '--no-default-browser-check', '--hide-scrollbars',
                   '--force-device-scale-factor=1', '--window-size=1500,500',
                   '--virtual-time-budget=3000', '--run-all-compositor-stages-before-draw',
                   '--user-data-dir=' + str(work / 'profile'), '--dump-dom',
                   '--screenshot=' + str(screenshot), page.as_uri()]
        result = subprocess.run(command, capture_output=True, timeout=60)
        if result.returncode or not screenshot.is_file():
            raise ValueError('Browser could not render the banner: ' +
                             result.stderr.decode(errors='replace')[-2000:])
        if b'data-banner-status="ready"' not in result.stdout:
            raise ValueError('Banner rendering did not complete; no output was written.')
        png = screenshot.read_bytes()
        if (png[:16] != b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' or
                len(png) < 24 or struct.unpack('>II', png[16:24]) != (1500, 500)):
            raise ValueError('Browser returned an invalid banner size; expected 1500 x 500 PNG.')
        output.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation also protects against a file appearing during rendering.
        with output.open('xb') as destination:
            destination.write(png)
    print(f'Banner saved: {output}\nQuotation style: {style}\nBear raster recolour: {options.recolor}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', default='')
    parser.add_argument('--version', default='CONCEPT')
    parser.add_argument('--out', type=Path)
    parser.add_argument('--palette', choices=PRESETS, default='blue')
    parser.add_argument('--quote-style', choices=('random',) + STYLES, default='random')
    parser.add_argument('--recolor', choices=('original', 'head', 'ears', 'both'), default='both')
    parser.add_argument('--batch', action='store_true')
    parser.add_argument('--browser', help='Path to Chrome, Chromium or Edge')
    options = parser.parse_args()
    output = options.out.expanduser() if options.out else ROOT / ('build/future-banners' if options.batch else 'build/release-banner.png')
    jobs = [(palette, output / f'{palette}-bear.png') for palette in PRESETS] if options.batch else [(options.palette, output)]
    try:
        for _, path in jobs:
            if path.exists():
                raise ValueError(f'Output exists; choose a new --out path: {path}')
        browser = find_browser(options.browser)
        for palette, path in jobs:
            options.palette = palette
            render(options, browser, path.resolve())
    except (ValueError, OSError, subprocess.TimeoutExpired) as error:
        parser.exit(1, f'{error}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
