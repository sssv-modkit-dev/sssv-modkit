# Model variant part-list audit (2026-11-15)

Read-only US 1.0 indexing with `web_build.derive_table`; compare unique part-draw
DL membership per section and per indexed draw function. This compares lists, not
animation, texture parameters, joint transforms or conditional runtime paths.

All separately labelled section lists differ: bear (6 / 5 / 6), desert fox (8 / 4),
dog (8 / 7 / 9), fox (6 / 6 / 6), hyena (13 / 14), kangaroo (8 / 7), and mouse
(racing / hard: 6 / 7). Equal counts do not mean identical DLs. Keep these selectors.

The index gives the same single function/part list to these named state pairs:
CHAMELEON / SNEAKY_CHAMELEON (8), PARROT / PARROT_ATTACKING (10),
SEAGULL / SEAGULL2 (9), VULTURE / VULTURE2 (9). They are identical at this
static list granularity, not proven visually identical in game. Do not manufacture
separate geometry choices for these aliases.

Other alias labels lack a one-to-one function mapping: husky has two different
lists (8 / 10), polar bear two different lists (6 / 6), tortoise three (6 / 5 / 1),
and mouse has an unlabelled base list (6) in addition to racing/hard lists.
Do not collapse these species or claim all their named states are identical.
Their metadata needs finer state-to-function attribution before exposing more states.

Captured assembly defaults to the available static pose; selecting a variant uses
it only when that variant's indexed parts are covered. Otherwise the editor clearly
shows the parts layout. No animation clip is bundled or inferred.
