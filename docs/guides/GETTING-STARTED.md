# Getting started

Run these commands from the repository root. Python 3.8+ is sufficient for the
builder; no extra Python packages are needed.

## 1. Supply your ROM

Place your US 1.0 ROM in `rom/` as a big-endian `.z64` file. The expected SHA1 is:

```text
e5e09205aa743a9e5043a42df72adc379c746b0b
```

The builder finds a matching ROM automatically. You can also pass `--rom FILE`.
See the [ROM folder instructions](../../rom/README.md).

## 2. Generate the animal table

Supply a local directory of animal C source files outside this repository.
The parser expects the game's display-list symbols, draw calls and section markers;
it cannot generate the table from a ROM alone. These source files are not included.
Replace the source path below with your animal-source directory:

```sh
python src/animal_table.py /path/to/animal-sources src/animal_table
```

The generator reads your ROM from `--rom FILE`, `SSSV_ROM` or `rom/` and writes
`src/animal_table.json` and `src/animal_table.md`. These are private, locally
derived files. The builder needs the JSON table; it is not shipped with the project.

## 3. Review and build an edit

Start with one config so you can see exactly what it changes:

```sh
python src/make_animal_mods.py configs/bear.json --out build --name mypack --dry-run
```

Read the report, then build:

```sh
python src/make_animal_mods.py configs/bear.json --out build --name mypack
```

Outputs are `build/mypack.ips` and `build/mypack.z64`. Add `--no-rom` to emit
only the patch. Every build checks the original ROM and expected values, refuses
conflicting edits, repairs header checksums, and verifies the IPS round trip.

Inspect the result in game. Those checks establish patch consistency; they do not
establish visual quality or gameplay correctness. Use a cold boot to check a new
geometry build because an existing savestate may contain older geometry in RAM.

## Apply a downloaded patch

Use an IPS patcher on a copy of your original US 1.0 `.z64` ROM. The patch contains
the changed bytes, including repaired N64 header checksums. Start from the ROM
version specified by the patch author rather than assuming patches can be stacked.

## Next

[Preview in the viewer](VIEWER.md) · [Edit a config](CONFIGS.md) · [Documentation index](../README.md)
