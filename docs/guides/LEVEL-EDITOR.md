# Level editor

Open [Levels](https://sssv-modkit-dev.github.io/sssv-modkit/levels.html) and choose
your stock US ROM or a compatible modded build. Big-endian `.z64`, byte-swapped `.v64`, and little-endian
`.n64` files (8–16 MB) are normalized and checked for the US SSSV header and supported data layout. The page
decodes all 36 stage slots locally. No ROM, mesh, texture, or extracted spawn table
is included in the site, and Levels makes no upload requests.

## Select and edit

- Choose a **Category**, then an object in the named **Objects** selector. The
  **Type** selector also shows names. Unknown identifiers retain a numeric label;
  some props vary by stage. Animal forms and states have separate identifiers.
- The toolbar at the top left holds three tools: **Select** (1), **Box select** (2)
  and **Move** (3); Escape returns to Select. Below them, **Snap** (#), **Height**
  (↕) and **Add** (+) toggles do the same as holding Ctrl, Shift and Ctrl.
- Click an object, or use **Box select** and drag a rectangle. Ctrl-click
  toggles an object; Ctrl-box-select adds to the selection. Props are picked by the
  box drawn for them: a click inside several boxes takes the smallest, and a
  rectangle selects every box it overlaps. Animals use the bounding box of their
  drawn shape, so a placeholder's box also covers space behind it. Objects
  hidden behind terrain can still be picked.
- **Focus** frames the selection. Yellow rings mark selected origins. An info card
  stays beside the primary selected object (name, index, type, position, yaw and
  prop box) until the selection changes; it docks at the bottom when the object is
  off screen.
- With **Move**, or Alt-drag in any tool, drag the selection together, preserving
  spacing. The grabbed point stays under the cursor on the horizontal plane at the
  primary object's height. Shift (or **Height**) adjusts height; Ctrl (or **Snap**)
  snaps the primary object's position to 64 units. Out-of-range group moves are
  rejected together. Escape cancels the gesture.
- Arrow keys nudge the selection 8 units (Shift: 64) along the world axis nearest the
  camera view; Up moves away from the camera. PageUp/PageDown change height. Each
  nudge is one undo step. Keys typed into a field do not nudge.
- **Apply** changes the primary object's type, X/Y/Z, yaw, and portal target.
  **Duplicate prop** duplicates the selected props in place; move them afterward.
  Player starts and mixed animal/prop selections cannot be duplicated.
- Undo/redo restores an entire move or duplication. Terrain is read-only. Deletion
  is unavailable because stage scripts refer to spawn indices.

WASD moves the camera at any time (Q/E down/up, Shift faster); keys typed into a
field are ignored. Orbit by dragging, pan with right-drag or Shift-drag in Select,
and zoom with the wheel. The **look** button switches dragging between orbiting
the target and fly-style looking around in place. On a touchscreen, tap an object
to select it. With **Box select** or **Move**, one finger draws the rectangle or
moves the selection; two fingers always pinch and pan the camera. Use the
toolbar toggles in place of Ctrl and Shift.

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

If an edited stage no longer fits its original compressed slot, `--relocate`
allows a level-only build to append the stage and update its table entry. Expanded
ROMs need separate runtime verification. The default refuses relocation.

## Parts Lab projects

Attach an exported production animal configuration with **Attach Parts Lab config**.
**Save project** stores it alongside the level diff; **Open project** restores both.
**Download animal config** returns the attachment for Parts Lab's **Open edits**.
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
