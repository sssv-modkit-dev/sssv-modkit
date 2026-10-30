#!/usr/bin/env python3
"""Render release banners using Python's stdlib and a local Chromium browser."""
import argparse
import base64
import json
import os
from pathlib import Path
import random
import shutil
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
        candidate = shutil.which(explicit) or explicit
        if Path(candidate).is_file():
            return str(Path(candidate).resolve())
        raise ValueError('Browser executable not found: ' + explicit)
    for name in ('chromium', 'chromium-browser', 'google-chrome', 'chrome', 'msedge'):
        if shutil.which(name):
            return shutil.which(name)
    candidates = [Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
                  Path('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')]
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
    source = (ROOT / 'tools/release_banner.html').read_text(encoding='utf-8')
    _, opening, script = source.partition('<script>')
    script, closing, _ = script.partition('</script>')
    script, handlers, _ = script.partition("for(const id of ['name','version','accent'])")
    if not opening or not closing or not handlers:
        raise ValueError('Composer script structure changed; update the banner renderer.')
    icon = base64.b64encode((ROOT / 'tools/viewer/assets/icon.png').read_bytes()).decode('ascii')
    settings = json.dumps({
        'name': options.name or PRESETS[options.palette][0],
        'version': options.version, 'accent': PRESETS[options.palette][1],
        'style': style, 'recolor': options.recolor,
    }, ensure_ascii=True).replace('<', '\\u003c')
    # Reuse the composer's actual draw routine and quote definitions.
    script = script.replace('document.getElementById(id)', 'values[id]')
    return r'''<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;width:1500px;height:500px;overflow:hidden}canvas{display:block}</style>
<canvas width="1500" height="500"></canvas><script>
const settings=SETTINGS;
const values={name:{value:settings.name},version:{value:settings.version},accent:{value:settings.accent}};
SCRIPT
chosenStyle=settings.style;
const img=new Image();
img.onload=()=>{
 const raster=document.createElement('canvas');raster.width=img.width;raster.height=img.height;
 const r=raster.getContext('2d');r.drawImage(img,0,0);
 const pixels=r.getImageData(0,0,img.width,img.height),p=pixels.data;
 const target=settings.accent.match(/\w\w/g).map(v=>parseInt(v,16));
 for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++){
  const i=(y*img.width+x)*4;if(!p[i+3])continue;
  const [red,green,blue]=[p[i],p[i+1],p[i+2]];let factor=0;
  if(blue>red*1.5&&blue>green*1.25&&['head','both'].includes(settings.recolor))factor=.65*blue/128;
  if(y<40&&red>blue&&green>=blue&&['ears','both'].includes(settings.recolor))factor=.9*Math.max(red,green)/200;
  if(factor>0)for(let c=0;c<3;c++)p[i+c]=Math.min(255,Math.round(target[c]*factor));
 }
 r.putImageData(pixels,0,0);head=raster;draw();
};
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
                   '--user-data-dir=' + str(work / 'profile'),
                   '--screenshot=' + str(screenshot), page.as_uri()]
        result = subprocess.run(command, capture_output=True, timeout=60)
        if result.returncode or not screenshot.is_file():
            raise ValueError('Browser could not render the banner: ' +
                             result.stderr.decode(errors='replace')[-2000:])
        output.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation also protects against a file appearing during rendering.
        with output.open('xb') as destination:
            destination.write(screenshot.read_bytes())
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
    output = options.out or ROOT / ('build/future-banners' if options.batch else 'build/release-banner.png')
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
