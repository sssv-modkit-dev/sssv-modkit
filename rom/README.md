# rom/

Put your own **Space Station Silicon Valley (US 1.0)** ROM here as a big-endian `.z64` file.
Use `sssv.z64` as the filename for the simplest setup.

- Required SHA1: `e5e09205aa743a9e5043a42df72adc379c746b0b`
- From the repository root, check it on Windows: `certutil -hashfile rom/sssv.z64 SHA1`
- Byte-swapped `.n64` or `.v64` files must be converted to `.z64` first.
- Dump it from a cartridge you own. This project does not provide or link to ROMs.

The tools can also discover a differently named `.z64` here by its SHA1.
The patch builder verifies the required SHA1 before editing.
Everything in this folder except this README is ignored by git and must never be committed.
