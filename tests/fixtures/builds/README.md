# Build golden fixtures

ROM-free pins of the Python build output, so an in-browser builder (Pyodide or a JS port) can be checked byte for byte.
All inputs are synthetic; nothing here comes from the real ROM. Regenerate with `python tests/make_build_fixtures.py --write`;
`python src/check.py` runs the same script in compare mode and fails on any difference.

`builds.json`: `{format: "sssv-build-fixtures", version: 1, cases: [...]}`. Each case:

- `name`, `kind`: `level-diff` or `animal-configs`.
- `rom`: how to rebuild the synthetic input ROM. `size` bytes, `fill` = byte i is `(i*mul + add) & 0xFF`, then `writes` applied in order (`offset`, `hex`).
- `rom_sha256`: sha256 of that input ROM (check your reconstruction first).
- `inputs`:
  - `level-diff`: `diff` (an `sssv-editor-diff` v1 whose `rom_sha1` is the input ROM's SHA1) and `relocate` (bool). Reference: `build_levels.build(diff, rom, relocate)` then `build_levels.patch(rom, out)`. Level 2 has no spare slot space, so it exercises relocation and the RNC pack step (`level_rnc_pack.pack_best`).
  - `animal-configs`: `table` (synthetic animal table, same shape as `animal_table.json`) and `configs` (list of animal configs, applied together). Reference: `make_animal_mods.plan_edits`, `apply_plan`, then `romio.fix_crc`, then `romio.make_ips(input, output)`.
- `outputs`: `rom_size`, `rom_sha256` (patched ROM), `ips_size`, `ips_sha256`, and `ips_hex` when the IPS is at most 2048 bytes.

A port passes a case when its output ROM and IPS hash to the stored values. Level IPS files append relocated data past the original size (hunks of up to 65535 bytes, ending in `EOF`), as `build_levels.patch` does.
