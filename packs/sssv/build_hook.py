"""SSSV pack build hook: copies the Python build modules for the in-browser builder and vendors the runtimes."""
import re, shutil, sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / 'src'


def run(out, no_vendor):
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
