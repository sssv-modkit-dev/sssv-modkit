# Glossary (one word = one meaning; use these in code, configs, docs and chat)

| Term | Meaning |
|---|---|
| **animal** | A species definition (mesh parts + colours + rig). One per base animal. |
| **variant** | A `// NAME` section marker in the decomp animal file (normal / crazy / attacking ...). Variants of one animal draw different part sets. |
| **part** | One display list drawn with one transform (a body piece). Stable ID = decomp symbol, e.g. `D_04002D90_CA7C0`. |
| **rig** | Skeleton tables + draw recipe for an animal (what the viewer needs for "Assembled" mode). |
| **recipe** | The ordered list of part-draw calls (joints, scales, roll, mirror, mode, display list). |
| **pose** | A static joint table (root xyz + inclination/azimuth per bone). Not an animation. |
| **bank** | A segment-4 biome bank in the ROM; only one is loaded in RAM at a time. |
| **stage** | One playable level. (Pick this word, never "level", so it never clashes with "level of detail" or "level editor".) |
| **door** | A hub entrance that leads to a stage slot. A **slot** is where a stage sits in the progression. |
| **spawn** | One entry in a stage's object list: what appears, where, with what parameters. |
| **ability** | A capability an animal has (swim, fly, ...). Stages *need* abilities; animals *have* them. |
| **op** | A config operation (`recolor`, `mesh`, `deform`, `vertices`, later `texture`, `rename`, `spawn`, `code_patch`). |
| **edit** | The lowest-level change: `(rom offset, expected bytes, new bytes)`. Every op compiles to a list of edits. |
| **ju / mu** | Joint units vs mesh units (1 mu = 8 ju). Put the suffix on variable names: `bone_len_ju`. |
| **game_xyz / view_xyz** | Game space (z up) vs viewer space (y up). Convert in exactly one function. |
| **ground truth** | Numbers read from the running game (RAM). Beats screenshots. |
| **private / public** | Private = lab/, dumps, tables, states. Public = tools, configs, schemas, docs, .ips. |
