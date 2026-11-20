#!/usr/bin/env python3
"""Build offline bundles: the public site + a small launcher per OS, zipped.

    python tools/bundle/make_bundle.py                 # all targets, rebuild site
    python tools/bundle/make_bundle.py --skip-site -t windows-x64

Needs Go 1.22+ (cross-compiles every target from one machine) and, unless
--skip-site, the same inputs as the Pages build. Output: build/bundles/.
No ROM or ROM-derived data is ever included.
"""
import argparse, os, shutil, subprocess, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = ROOT / 'tools' / 'bundle' / 'launcher'
TARGETS = {  # name: (GOOS, GOARCH, exe suffix)
    'windows-x64': ('windows', 'amd64', '.exe'),
    'macos-arm64': ('darwin', 'arm64', ''),
    'macos-x64': ('darwin', 'amd64', ''),
    'linux-x64': ('linux', 'amd64', ''),
}
ROM_EXT = {'.z64', '.n64', '.v64', '.rom'}

README = """sssv-modkit offline bundle ({target})
=====================================

1. Put your own Space Station Silicon Valley (US 1.0) ROM in the rom/ folder.
2. Start the launcher: {start}
   It opens the modkit in your web browser. Keep its window open while you work.
3. In any page, open the "Bundle" button (bottom right) and press "Use here"
   to load your ROM, then build as usual. Builds are saved to out/.
4. From the Bundle panel: Open (your system's program for .z64 files),
   Folder (show it), or Emulator (if you set one in settings.json).
   Or just take the file from out/ to the emulator you like.

Nothing is installed. Everything stays in this folder; delete the folder to remove it.
The launcher only listens on 127.0.0.1 (this computer). No ROM is included.

{warning}
Unofficial fan project; not affiliated with or endorsed by the game's rights holders.
Licences: LICENSE, NOTICE.md and app/vendor/ (third-party runtimes).
"""
START = {
    'windows': 'double-click sssv-modkit.exe',
    'darwin': 'double-click sssv-modkit (or run ./sssv-modkit in Terminal)',
    'linux': 'run ./sssv-modkit (from a terminal, or mark it executable and double-click)',
}
WARN = {
    'windows': 'Windows may warn "Windows protected your PC" because the program is not code-signed.\n'
               'Choose "More info" then "Run anyway" if you trust where you downloaded it.\n',
    'darwin': 'macOS may refuse to open an unsigned program. Right-click sssv-modkit, choose Open,\n'
              'then Open again. If it still refuses: xattr -d com.apple.quarantine sssv-modkit\n',
    'linux': 'If it does not start: chmod +x sssv-modkit\n',
}


def run(cmd, **kw):
    print('+', ' '.join(map(str, cmd)), flush=True)
    subprocess.run(cmd, check=True, **kw)


def build_site():
    run([sys.executable, 'src/build_viewer.py', '--public'], cwd=ROOT)
    run([sys.executable, 'tools/vendor_deps.py', '--out', 'site/dist', '--offline'], cwd=ROOT)


def assert_rom_free(folder: Path):
    bad = [p for p in folder.rglob('*') if p.suffix.lower() in ROM_EXT]
    if bad:
        sys.exit(f'refusing to bundle ROM-like files: {bad[:5]}')


def make(target: str, out: Path, version: str):
    goos, goarch, suffix = TARGETS[target]
    name = f'sssv-modkit-{version}-{target}'
    stage = out / name
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    env = dict(os.environ, GOOS=goos, GOARCH=goarch, CGO_ENABLED='0')
    run(['go', 'build', '-trimpath', '-ldflags=-s -w', '-o', str(stage / ('sssv-modkit' + suffix)), '.'], cwd=LAUNCHER, env=env)
    shutil.copytree(ROOT / 'site' / 'dist', stage / 'app')
    for d in ('rom', 'out'):
        (stage / d).mkdir()
    (stage / 'rom' / 'PUT-YOUR-ROM-HERE.txt').write_text('Copy your own US 1.0 .z64 ROM into this folder.\n')
    for f in ('LICENSE', 'NOTICE.md'):
        if (ROOT / f).exists():
            shutil.copy2(ROOT / f, stage / f)
    (stage / 'README.txt').write_text(README.format(target=target, start=START[goos], warning=WARN[goos]), newline='\r\n' if goos == 'windows' else '\n')
    assert_rom_free(stage)
    zpath = out / (name + '.zip')
    zpath.unlink(missing_ok=True)
    with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(stage.rglob('*')):
            arc = Path(name) / p.relative_to(stage)
            if p.is_dir():
                z.writestr(str(arc).replace('\\', '/') + '/', '')
                continue
            info = zipfile.ZipInfo.from_file(p, arc)
            if p.name == 'sssv-modkit':
                info.external_attr = 0o100755 << 16  # executable on macOS/Linux after unzip
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, p.read_bytes(), compresslevel=9)
    print(f'{zpath}  {zpath.stat().st_size / 2**20:.1f} MiB')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('-t', '--target', action='append', choices=sorted(TARGETS), help='repeatable; default all')
    ap.add_argument('--skip-site', action='store_true', help='reuse the existing site/dist')
    ap.add_argument('--version', default='dev')
    ap.add_argument('--out', type=Path, default=ROOT / 'build' / 'bundles')
    a = ap.parse_args()
    if not a.skip_site:
        build_site()
    if not (ROOT / 'site' / 'dist' / 'index.html').exists():
        sys.exit('site/dist is missing; run without --skip-site')
    assert_rom_free(ROOT / 'site' / 'dist')
    a.out.mkdir(parents=True, exist_ok=True)
    for t in a.target or TARGETS:
        make(t, a.out, a.version)


if __name__ == '__main__':
    main()
