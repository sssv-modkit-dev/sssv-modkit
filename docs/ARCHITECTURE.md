# Architecture

## Local data flow

The owner's ROM feeds `src/animal_table.py --from-rom` (call-site tracing in `src/animal_rom.py`; external animal C source files are an optional legacy input). It writes a private animal index containing display-list locations, colour words, vertex groups, bounds, and draw/variant metadata.

`src/make_animal_mods.py` reads that index and JSON edit configs, checks the original ROM, plans expected-byte edits, and produces an IPS patch and optionally a patched ROM under `build/`. It repairs the header CRCs and reapplies the IPS to verify the output byte for byte. The original ROM is preserved.

`src/build_viewer.py` bundles the HTML template, CSS, live JavaScript, icon and private index into `viewers/parts_viewer.html`. The user supplies geometry by loading their ROM in the browser. Generated pages contain derived metadata and stay private.

## Sources

| Responsibility | Source |
|---|---|
| ROM lookup | `src/sssv_paths.py` |
| Animal index and draw-event extraction | `src/animal_table.py`, `src/animal_rom.py` |
| Config planning, CRCs and IPS output | `src/make_animal_mods.py` |
| Viewer UI, rendering and live deform math | `src/viewer/js/app.js` |
| Standalone deform math | `src/viewer/js/deform.js` |
| Viewer layout and styles | `src/viewer/index.template.html`, `src/viewer/css/app.css` |
| HTML bundling | `src/build_viewer.py` |
| Synthetic verification | `src/check.py`, `tests/` |
| Stage-shuffle prototype | `src/sssv_logic.py` |

## Geometry and assembly

Parts sheets lay out individual display lists. They do not establish an animal's assembled shape. The viewer assembles an animal from pose JSON: `{animal, parts:[{dl, rows, T, mirror}]}`, one entry per drawn part, where a vertex maps to `v·rows + T` in game space (Z up). The five bundled demo animals ship poses in `src/web/demo/poses/`, which the public build embeds so they open assembled. Each pose is the modelview matrix of every part draw in one frame of the running US 1.0 game, in the draw order of that species' draw function. These matrices come from an emulator RAM dump. The animal's world position and yaw are removed, and it is turned to face the default camera. `mirror` is 1 where the matrix flips handedness, and matches the draw function's mirror flags. The capture and conversion tools are private and are not included here. Poses for other animals can still be imported in the viewer, but they are unchecked.

In ROM mode the index records ordered part-draw events with constant joints, mirror flags and display lists traced from the draw code; variant labels come from a small built-in function index. The legacy C-source mode also records joint and scale expressions as source text. This supports inspection; it does not compile arbitrary character definitions or animation code.

Current mesh/deform operations change positions without changing vertex or triangle counts. Explicit vertex edits can also change the last four normal/colour bytes with expected-value checks. Mesh/deform operations leave those bytes unchanged, so large shape changes can produce different game shading from the viewer's face-normal preview.

Live and standalone JS deform implementations remain separate from Python and each other. Saved golden cases and fresh Python comparisons guard their agreement; these checks do not establish matching real-ROM vertex selection, WebGL behaviour, or game appearance.

## Extension boundaries

An original character can start as a visual replacement that uses an existing animal's rig and behaviour. A new mesh topology needs a display-list/vertex exporter, verified storage and pointer handling, and rendering checks. A custom rig also needs joint/animation and draw-recipe work. A new actor type additionally needs behaviour, collision, spawning and related game integration.

Older private research proposed bank growth and dog assembly work. Its exact offsets and assumptions have not been restored into this guide as verified facts. Recover and check that evidence before writing a loader or rig patch.

The emulator harness is maintained independently. Exchange ROM paths, configs, captures and state provenance; do not make the builder depend on the harness implementation. See its [README](https://github.com/sssv-modkit-dev/sssv-modkit-automated-testing).
