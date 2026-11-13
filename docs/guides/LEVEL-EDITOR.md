# Level Editor

Open [Level Editor](https://sssv-modkit-dev.github.io/sssv-modkit/level-editor.html) and choose
your stock US ROM or a compatible modded build. Big-endian `.z64`, byte-swapped `.v64`, and little-endian
`.n64` files (8–16 MB) are normalized and checked for the US SSSV header and supported data layout. The page
decodes all 36 stage slots locally. No ROM, mesh, texture, or extracted spawn table
is included in the site, and Level Editor makes no upload requests.

## Select and edit

Freecam is the default: right-drag looks around while keeping the camera eye
fixed, WASD travels, Q/E or Space changes height, and the wheel moves forward or
back. Choose Orbit in the Camera menu for the previous orbiting view.

Drag panel titles to move them and resize their corners. Save/project controls
have a separate panel. Reset panels restores the default layout; narrow screens
stack panels below the viewport.

- **Select (1)**: click an object; click empty space to clear; drag empty space to select a rectangle. Ctrl/Shift adds. The **Objects** panel lists every spawn grouped by type and reflects selection.
- **Move (3)** or Alt-drag moves the selection. Ctrl snaps to 64 units; Shift changes height. Arrow keys nudge, PageUp/PageDown adjust height. Escape cancels a gesture. Modifier hints are available in the tool tooltip.
- Use the visual **Change type** picker and paired X/Y/Z/yaw sliders and number fields, then **Apply**. **Focus** frames the selection. **Duplicate prop** copies selected props except player starts.
- The separate **Add objects** panel offers animal and prop tiles. Choose **Place objects (4)** and a type; a translucent preview follows the terrain under the pointer. Click to place it, or tap once to preview and again nearby to place on touch devices. Sky misses create nothing. **Place at target** remains available. New records copy stock extra fields where available, otherwise use zeros. Player starts cannot be added.
- **Delete** or Del fully removes only appended objects added by this editor or loaded project, with undo/redo. Original spawns cannot be deleted because scripts refer to their indices. Mixed selections containing originals cannot be deleted. No tombstones are written; original indices stay unchanged. Appended objects are not wired to scripts.
- Terrain is read-only. Hold the right mouse button to look around and fly using WASD/QE (Shift faster). Pan with Shift-left-drag or the middle button; zoom with the wheel. Touch supports tap selection, selection drags and two-finger pinch/pan.
- **Info** contains level stats, display-save information and camera controls. Phone portrait panels collapse automatically when entering that layout; resizing or rotating updates the layout.

## Save and build

**Save level edits** writes a source-bound `sssv-editor-diff` v1 JSON file.
**Open level edits** restores it. View files save camera/display settings separately.
Edits are bound to the exact ROM you selected, not the stock fingerprint. Open them with that same ROM; another modded build is a different source. Mods that reorganize tables or change record layouts may be unsupported.

Downloaded edits and projects stay on your computer; save before closing the page.

From the repository root:

```text
python src/build_levels.py sssv-level-edits.json --rom rom/sssv.z64 --dry-run
python src/build_levels.py sssv-level-edits.json --rom rom/sssv.z64 --out build/levels --name my-stage
```

The local builder accepts the same stock or modded ROM in any supported byte order, checks the saved source
identity, recompresses edited records, repairs the header CRC, and verifies the IPS
roundtrip. It writes a new `.z64` and `.ips`. Open the resulting ROM in **Play** or
your emulator. Share patches rather than ROMs.

New props are appended like duplicates. New **animals** are refused by default
because appended animal spawns have not been checked in game; add `--new-animals`
to `build_levels.py` to allow them. Stage scripts do not know about appended
objects, so they appear but are not wired to switches or goals.

If an edited stage no longer fits its original compressed slot, `--relocate`
allows a level-only build to append the stage and update its table entry. Expanded
ROMs need separate runtime verification. The default refuses relocation.

## Model Editor projects

Attach an exported production animal configuration with **Attach Model Editor config**.
**Save project** stores it alongside the level diff; **Open project** restores both.
**Download animal config** returns the attachment for Model Editor's **Open edits**.
The attachment is carried unchanged and does not alter the animal preview here.

Build a combined project using the local animal table:

```text
python src/build_levels.py sssv-project.json --rom rom/sssv.z64 --table animal_table.json --dry-run
python src/build_levels.py sssv-project.json --rom rom/sssv.z64 --table animal_table.json --out build/levels --name combined
```

Attached production-animal builds still require the stock ROM for the animal builder safeguards. Combined builds require the level edits to fit in place. Original demo-creature
presets are rejected as production animal patch configurations.

## Current limits and evidence

The preview includes terrain textures and supported static prop meshes. Animal
shapes are approximate placeholders, not their in-game rigs. Dynamic or unsupported
props may need **meshes + boxes** to remain visible. Labels describe known type
identities; unidentified types keep their numbers.

Portal destinations are metadata for a separate runtime hook. This release does
not include that hook or establish working hub transitions, return trips, unlocks,
or progression saving. Collision and collectability need testing for each layout.

The Level 1 power-cell move was verified after cold boot and briefing dismissal;
the public builder reproduces that tested ROM byte-for-byte. Browser checks cover
ROM loading, named filters, rectangle selection, group movement with undo/redo,
duplication, stage revisits, and project file roundtrips. These checks do not make
arbitrary edits or expanded ROMs game-validated.
