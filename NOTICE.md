# Notice

This is an **unofficial fan project**. It is not affiliated with, endorsed by, or connected to the
original developer or publisher of Space Station Silicon Valley or its rights holders.
All trademarks and game content belong to their respective owners.

- This repository contains no ROM, patched ROM, or audio files. With the owner's approval it ships one small
  public demo set under `src/web/demo/`: the stage 4 level data and texture atlas with its prop models, five
  animals' parts (bear, dog, fox, sheep, seagull) and four head icons rendered from them (see `site/README.md`).
  These remain third-party material and are not covered by the CC0 dedication.
  You must supply your own legally obtained copy of the US 1.0 ROM (see `rom/README.md`).
- The bear branding and release banners include renders of game geometry. Documentation also
  includes in-game screenshots. This game content remains third-party material and is not
  covered by the project's CC0 dedication.
- Patches (.ips) distributed with releases contain only the bytes this project changes.
- The public pages load no third-party origin. EmulatorJS (Play) and Pyodide (the in-browser builder's Python runtime) are
  fetched at build time, checked against pinned SHA-256 hashes (`tools/vendor-manifest.json`) and served from the site's own
  `vendor/` directory; see "Vendored third-party software" below and `docs/NETWORK.md`.
- The tools read your ROM locally; nothing is uploaded anywhere (the browser viewer runs entirely on your machine).
- To the extent possible under law, sssv-modkit dev has waived all copyright and related rights
  in their original contributions under CC0 1.0 Universal (see `LICENSE`). Attribution is not required.
  This dedication applies only to rights held by that contributor; third-party rights remain separate.
- Project origin and LLM assistance are described in [development notes](docs/DEVELOPMENT-NOTES.md).
- Provided as-is, without warranty. Back up your files; patched ROMs may behave unexpectedly.

If you are a rights holder and have a concern about anything here, please open an issue or contact
sssv-modkit-dev@protonmail.me and it will be addressed promptly.

## Vendored third-party software

`python tools/vendor_deps.py` (run by the public build) downloads these into `vendor/` of the built site; the binaries are not
committed. Each dependency's license text ships beside it, and `tests/test_vendor_manifest.py` fails if a dependency lacks a
license file or an entry here. These programs keep their own licenses and are not covered by the CC0 dedication above. GPL
components are distributed unmodified; the source links below point to the exact upstream tag or commit.

| Dependency | Version | License | Source | Shipped license file |
|---|---|---|---|---|
| `pyodide` (Pyodide with the CPython 3.14.2 standard library) | 314.0.7 | MPL-2.0 (Pyodide), PSF-2.0 (CPython); the runtime also links permissively licensed libraries listed in the Pyodide repository | https://github.com/pyodide/pyodide/tree/314.0.7 | `vendor/pyodide/LICENSE`, `vendor/pyodide/LICENSE-CPython` |
| `emulatorjs` (EmulatorJS front end and decompression helpers) | 4.2.3 | GPL-3.0 | https://github.com/EmulatorJS/EmulatorJS/tree/v4.2.3 | `vendor/emulatorjs/LICENSE` |
| `mupen64plus_next` (Mupen64Plus-Next core) | EmulatorJS 4.2.3 build of 2025-06-14 | GPL-2.0 | https://github.com/libretro/mupen64plus-libretro-nx/tree/0346d3ef26016bb4de604cf918d004bd791447ee | `vendor/mupen64plus_next/LICENSE` |
| `parallel_n64` (ParaLLEl N64 core) | EmulatorJS 4.2.3 build of 2025-06-14 | GPL-2.0 | https://github.com/libretro/parallel-n64/tree/f8605345e13c018a30c8f4ed03c05d8fc8f70be8 | `vendor/parallel_n64/LICENSE`, `vendor/parallel_n64/LICENSES` |

The two core builds are produced by EmulatorJS, which does not publish the exact upstream commit; the links give the last upstream commit
before the build date, so confirm the corresponding source with the EmulatorJS build repository if you need it for redistribution.
