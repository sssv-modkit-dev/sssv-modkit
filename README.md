# Space Station Silicon Valley Modkit

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/releases/velvet-midnight-rat-dark.png">
  <img alt="SSSV Modkit — Velvet Midnight Rat edition" src="docs/images/releases/velvet-midnight-rat-light.png">
</picture>

A fan-made toolkit for exploring and editing *Space Station Silicon Valley* (Nintendo 64). Use the browser editors or build ROM patches from your own game files.

> [!WARNING]
> This is an unofficial fan project. It is not affiliated with or endorsed by the game's rights holders. **No ROMs or patched ROMs are included.** The site and tools process files you choose locally; see the [network audit](docs/NETWORK.md) for details.

**Try it:** [Model Editor](https://sssv-modkit-dev.github.io/sssv-modkit/model-editor.html) · [Level Editor](https://sssv-modkit-dev.github.io/sssv-modkit/level-editor.html) · [Browser Play](https://sssv-modkit-dev.github.io/sssv-modkit/play.html)

**Guides:** [Getting started](docs/guides/GETTING-STARTED.md) · [Documentation index](docs/README.md) · [Project status](docs/PROJECT.md) · [Contributing](CONTRIBUTING.md)

## What you can do

| If you want to… | Start here | Requirements and notes |
| --- | --- | --- |
| Explore and edit demo models | [Model Editor](https://sssv-modkit-dev.github.io/sssv-modkit/model-editor.html) | The bundled demos work without a ROM. Use your own supported game files for game-specific edits and builds. |
| Edit a stage | [Level Editor](https://sssv-modkit-dev.github.io/sssv-modkit/level-editor.html) · [Guide](docs/guides/LEVEL-EDITOR.md) | Choose your own supported ROM in the browser. Terrain editing is not available; check each build in game. |
| Try browser play | [Browser Play](https://sssv-modkit-dev.github.io/sssv-modkit/play.html) | Select your own uncompressed ROM or patched build. Experimental; compatibility and performance vary. |
| Build an animal edit locally | [Getting started](docs/guides/GETTING-STARTED.md) | Requires your own unmodified US 1.0 ROM and Python. |

## Build an animal patch

From the repository root, generate a private animal table from your own US 1.0 ROM, then dry-run an example config before building:

```sh
python src/animal_table.py --from-rom --out src/animal_table
python src/make_animal_mods.py configs/bear.json --out build --name bear --dry-run
python src/make_animal_mods.py configs/bear.json --out build --name bear
```

The builder writes an IPS patch and, by default, a patched ROM under `build/`. It checks the ROM identity and expected bytes, refuses conflicting edits, repairs the header checksum, and verifies the patch round trip. **Always review the dry-run report and test your build.** See [Getting started](docs/guides/GETTING-STARTED.md) for ROM setup and [config guide](docs/guides/CONFIGS.md) for edit formats.

## Features and limits

- **Model Editor:** recolour and reshape existing animal parts, edit vertices, preview changes, and import or export configs. Geometry edits preserve vertex and triangle counts; shading and in-game appearance still need testing.
- **Level Editor:** inspect and edit supported stage objects, save projects, and build ROMs or IPS patches. Terrain is read-only, and arbitrary edits are not guaranteed to work in game.
- **Patch builders:** create animal and level edits locally, with source checks and IPS round-trip validation. Animal configs require the US 1.0 ROM; level-edit support and constraints are described in the [Level Editor guide](docs/guides/LEVEL-EDITOR.md).
- **Browser Play and Build & Play:** experimental. Game compatibility, controls, and performance need further testing.
- **Not implemented:** importing entirely new character rigs, terrain editing, and a finished combined mod campaign. See [project status](docs/PROJECT.md) for prototypes and planned work.

## Project background

This project makes **ROM patches**; it is not a decompilation, recompilation, or native PC port. Development has been substantially assisted by AI coding tools. Read the [FAQ](docs/FAQ.md) and [development notes](docs/DEVELOPMENT-NOTES.md) for more context.

To run the ROM-free checks, install Python and Node.js and run:

```sh
python src/check.py
```

See [development](docs/DEVELOPMENT.md) for what the checks cover and what still requires browser or in-game testing.

## Credits and licensing

Created and maintained by [sssv-modkit dev](https://github.com/sssv-modkit-dev). Contact: [sssv-modkit-dev@protonmail.me](mailto:sssv-modkit-dev@protonmail.me).

Original contributions are dedicated under [CC0 1.0 Universal](LICENSE). Game imagery and the small, owner-approved set of demo assets remain third-party material and are **not** covered by CC0. See [NOTICE.md](NOTICE.md) for asset, license, and project notices.
