# Dance bench

A command-line bench for writing dance moves and fitting them to characters. It needs only Node: no browser, no ROM.
It runs the Model Editor's own player (`src/viewer/js/rig-player.js`), so a move that looks right here plays the same
in the editor. It is written for an agent working alone: every step ends in a picture or a table the agent can read.

```
node tools/dance-bench/bench.js sheet    --rig RIG.json [--mode dance] [--moves DRAFT.json] [--out sheet.png]
node tools/dance-bench/bench.js gif      --rig RIG.json [--mode dance] [--moves DRAFT.json] [--out dance.gif]
node tools/dance-bench/bench.js report   --rig RIG.json [--moves DRAFT.json]
node tools/dance-bench/bench.js moves
node tools/dance-bench/bench.js obj-info MODEL.obj [--up +y] [--front +z] [--out info.png]
node tools/dance-bench/bench.js puppet   MODEL.obj --map MAP.json [--out RIG.json]
```

`--mode` is a routine (`dance`, `spin`, `thriller`), a single move (`point`, `wave`, ...) or a rig's own cycle (`walk`, `run`).
Sheet options: `--per-beat 2` (cells a beat), `--cols 8`, `--cell 132` (pixels), `--az 25 --el 12` (camera; `--az 90` is side on).

## Words

- **Rig**: the skeleton description the player reads: numbered joints, bones between them, the body kind. Animals from
  the game get theirs from the user's ROM (the pack attaches it as `pose.anim`); this repository stores none of those.
  `rigs/sample-biped.json` is a made-up one for trying moves.
- **Move**: a few beats of dancing, written as data (`MOVES` in `rig-player.js`; the comment above it lists every field).
- **Routine**: a list of moves played in turn (`ROUTINES`). The editor's Dance button plays the routine `dance`.
- **Puppet**: a rig built here for a model that has no skeleton: the mesh is cut into rigid parts, one bone each.

## Write or change a move

1. `bench.js moves > draft.json`, then edit `draft.json`: change a move, or add one and name it in a routine. A draft only
   needs the moves and routines it changes.
2. `bench.js sheet --rig RIG.json --mode MOVE --moves draft.json`, then open the PNG. One cell per half beat, labelled with
   the move and the beat. Red is arm A, blue arm B, yellow the head, green the legs; the orange tick shows which way the
   body faces. Check that each key pose reads clearly and lands on the beat.
3. `bench.js report --rig RIG.json --moves draft.json`. Two tables:
   - hand travel and direction reversals a beat. More than about 3 reversals a beat looks twitchy; slow the leg rate, lower
     `pumpA`/`pumpB`, or use `steady: true`.
   - how different each pair of moves looks. Under 0.5 two moves read as one; change an arm height or which side it is on.
4. Repeat until the sheet and the numbers agree. Use `bench.js gif` for the motion between the poses.
5. Move the finished entries into `MOVES` / `ROUTINES` in `rig-player.js`, add an assertion to `tests/test_rig_player.js`
   that pins what makes the move itself (which arm is up, which way the body goes), and run `python src/check.py`.
   A new routine needs a button: `anim-NAME` in `src/viewer/index.template.html` and the three mode lists in
   `src/viewer/js/parts-lab.js`.

Arm angles are `[down-from-up, out]`: 0 is straight up, 90 level, 180 down; `out` 0 is forward, 90 out to that arm's own
side, negative across the body. Written this way a move fits any rig, whichever side its arm A is on.

## Fit a dance to a character that has a rig

A rig can dance when it has `actions.dance`:

```
"dance": {"chain": "lift", "rest": 3, "arms": [7, 8, 10, 11], "head": 20, "feet": [15, 18], "hop": 300, "sway": 250}
```

- `chain`: the name of an action whose `bones` (`[parent joint, child joint, length]`) and `tabs` (rest angles for each bone)
  describe the arms; or give `bones` and `tabs` inside `dance` itself.
- `arms`: the joints at the end of shoulder A, arm A, shoulder B, arm B. `fore`: the two hand joints of a two-bone arm.
- `rest`: which table of `tabs` holds the resting angles. `head`: the joint at the end of the head bone.
- `hop`, `sway`: how far this body hops and sways, in joint units (about a tenth and a twelfth of its height).

Run `sheet` and `report` for the rig. Arms that pass through the body need a different `rest` table or smaller `sway`;
a head that tips over needs `headRest` (the head bone's own rest angles).

## Fit a dance to a model that has no skeleton

1. `bench.js obj-info MODEL.obj`. It prints every group with its box and writes three views with a ruler (red lines: height
   `z`; blue lines: `x` in the front view, `y` in the side view; the model is scaled to 4000 units tall). If the model lies
   down or faces away, pass `--up` / `--front`. It ends with a suggested map.
2. Save the suggested map as `MAP.json` and correct it. Two ways to name the parts, usable together:
   - `"parts": {"torso": ["body"], "armA": ["l_arm"], ...}` when the model's groups are body parts;
   - `"cuts": {"armA": [{"box": [[x, y, z], [x, y, z]]}], ...}` when they are not (groups by material, or one mesh): a
     triangle whose centre is inside a box joins that part. Cuts are tried in the order written; the rest is torso.
   Parts: `torso`, `head`, `armA`, `armB`, `legA`, `legB`, and optionally `foreA`, `foreB` for a forearm that bends.
3. `bench.js puppet MODEL.obj --map MAP.json --out RIG.json`. Joints are found from the mesh: the end of a limb nearest the
   body is its joint, the far end its tip. It prints how many triangles each part got; a part with very few is a wrong box.
4. `bench.js sheet --rig RIG.json` draws the mesh itself dancing, each part in its own colour. Look for a limb that leaves
   the body (move its box so the joint end touches the torso) and parts that swallow their neighbour (shrink the box).

## Limits

- The bench draws skeletons for game rigs, not their meshes: those exist only in a user's browser with their ROM. For the
  finished look, run the Model Editor and export a GIF there.
- Puppets live in the bench for now. The editor does not load them yet.
- Puppet parts are rigid, so seams open when a limb turns far. Textures are not drawn; parts are coloured by role.
- Do not commit models or rigs you do not have the right to publish. Keep outputs outside the repository.
