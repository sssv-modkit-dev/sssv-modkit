"""SSSV pack build hook: copies the Python build modules for the in-browser builder and vendors the runtimes."""
import json, re, shutil, sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / 'src'


def run(out, no_vendor):
    # Site-only loading overrides; core/ remains an unmodified, lock-checked vendor snapshot.
    for name in ('load-progress.js', 'runtime-downloads.js', 'rom-compat.js', 'loading.css', 'runtime-progress-worker.js'):
        shutil.copyfile(SRC / 'web' / name, out / name)
    deps = {d['id']: d for d in json.loads((SRC.parent / 'tools/vendor-manifest.json').read_text(encoding='utf-8'))['deps']}
    sizes = {'pyodide': {'name': 'Python runtime', 'bytes': sum(f['size'] for f in deps['pyodide']['files'])}}
    common = sum(f['size'] for f in deps['emulatorjs']['files'] if f['path'].endswith(('loader.js', 'emulator.min.js', 'emulator.min.css', 'extract7z.js')))
    for name in ('mupen64plus_next', 'parallel_n64'):
        files = deps[name]['files']
        sizes[name] = {'name': 'EmulatorJS and N64 core', 'bytes': common + max(f['size'] for f in files if f['path'].endswith('.data')) + sum(f['size'] for f in files if f['path'].endswith('.json'))}
    (out / 'runtime-sizes.js').write_text('window.SSSVRuntimeSizes=' + json.dumps(sizes, separators=(',', ':')) + ';\n', encoding='utf-8')
    # Fail the build if a future core changes these integration seams; never silently lose error handling.
    session = out / 'rom-session.js'
    text = session.read_text(encoding='utf-8')
    fixes = [
        ('async function identify(buffer){', 'async function identify(buffer){window.SSSVCompat.check();'),
        ('async function set(file){', 'async function set(file){window.SSSVCompat.check(file);'),
        ('if(input)deliver(value);', 'if(input)await deliver(value);else window.LoadProgress?.done();'),
        ('catch(error){const message="Animal indexing', 'catch(error){if(error.code===\'RUNTIME_DECLINED\')throw error;const message="Animal indexing'),
        ('show(message);throw Error(message);', "show(message);throw Error(message+' '+error.message);"),
        ('Loading Python runtime (about 12 MB, then cached): ', 'Loading Python runtime (then cached): '),
        ("p.stage==='runtime'?'Preparing animal reader':'Reading animals',.3", "p.detail||'Reading animals',input?.id==='level-rom'?0.68:0.3"),
        ('deliver(active);', 'deliver(active).catch(error=>{window.LoadProgress?.fail(error.message);show(error.message);});'),
    ]
    for old, new in fixes:
        if text.count(old) != 1:
            raise RuntimeError('ROM loading integration seam changed: ' + old)
        text = text.replace(old, new, 1)
    session.write_text(text, encoding='utf-8')
    for page in out.glob('*.html'):
        html = page.read_text(encoding='utf-8')
        # Redirect stubs allow only their own hashed inline script; injecting
        # shared scripts there only produces CSP errors.
        if "script-src 'sha256-" in html and "script-src 'self'" not in html:
            continue
        html = html.replace('</head>', '<link rel="stylesheet" href="loading.css"><script src="runtime-sizes.js" defer></script><script src="runtime-downloads.js" defer></script><script src="rom-compat.js" defer></script></head>', 1)
        page.write_text(html, encoding='utf-8')
    sys.path.insert(0, str(SRC.parent / 'tools'))
    import build_guides
    build_guides.build(out)
    page = out / 'model-editor.html'
    html = page.read_text(encoding='utf-8').replace('type="image/svg+xml" href="favicon-model-editor.svg"', 'type="image/png" href="demo/heads/bear.png"')
    html = re.sub(r'(<div class="brand"><img src=")[^"]+', r'\1demo/heads/bear.png', html)
    page.write_text(html, encoding='utf-8')
    # Pyodide builder: the worker loads these repo sources from py/ (list kept in builder-core.js).
    core = (SRC / 'web/builder-core.js').read_text(encoding='utf-8')
    modules = re.findall(r"'(\w+\.py)'", re.search(r'PY_MODULES = \[(.*?)\]', core, re.S).group(1))
    (out / 'py').mkdir(exist_ok=True)
    for name in modules:
        shutil.copyfile(SRC / name, out / 'py' / name)
    if not no_vendor:
        # Third-party runtimes (Pyodide, EmulatorJS and its cores) are fetched here, hash-checked and served same-origin.
        sys.path.insert(0, str(SRC.parent / 'tools'))
        import vendor_deps
        print(f'Vendored {vendor_deps.vendor(out)/1e6:.1f} MB (SHA-256 verified) -> {out / "vendor"}')
