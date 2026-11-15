# Advanced: model editing reference

## Static pose coverage

Captured poses support bear, dog, fox, seagull, sheep, camel, cool cod, desert fox, elephant, gorilla, husky, hyena, kangaroo, lion, mouse, piranha, polar bear, rabbit, rat, scorpion, tortoise, vulture and walrus. Loading your ROM enables the additional animals without bundling their geometry.

Partial captures: camel 19/22 parts, elephant 6/9, polar bear 6/8 and rat 7/8. Selected variant captures include desert fox attacking, boxing kangaroo, racing mouse, heli rabbit and tortoise tank. Other variants may differ. These are static poses, not animation clips.

## Available tools

- Categories, variants, contact sheets and parts sheets.
- Shift/Ctrl-click or enable Multi-select to transform several parts together;
  click empty space to clear selection. Hover highlights parts and gizmo handles.
- Draggable part-name window with a close button, and a world-space reference grid.
- Undo/Redo buttons and Ctrl+Z/Ctrl+Y (Cmd+Z/Shift+Cmd+Z on Mac). A drag or
  brush stroke is one undo step; typing in text fields keeps native undo.
- Transform sliders have numeric fields: type a value or focus one and scroll
  to increment it. Bend, twist, taper and inflate are available under Deform.
- The bottom state picker shows available sections/variants and captured static
  poses. It does not synthesize the game's procedural animations.
- Returning to sample models retains your source animals and edits; use Return to loaded
  animals in Categories to get back without selecting the ROM again.
- Recolouring, scale, position and individual vertex edits.
- Taper, bend, twist and inflate previews.
- Config import/export, themes and local ROM storage.
- Bundled animal assembly and pose-transform import; poses for other animals need their own checks.

## Eye textures

The Texture Workbench decodes supported 16-by-16 CI4 eye materials from your ROM.
Choose a palette swatch to paint individual pixels, recolour a swatch, or change
its opacity. Colours are quantized to the game's five-bit channels. The first
eye-animation frame is editable; other frames and unverified torso materials
are not exposed as paintable textures yet.

Eye images and palettes can be shared between animals. Editing one changes all
users of those bytes. Save edits includes the changed texture bytes with their
expected original values; Build & Play sends them through the protected builder.
Reset this texture restores its image and palette, while the main Reset restores
the current animal's supported textures and geometry. The original ROM stays intact.

The image editor includes pencil, bucket, eraser, rectangle selection and local
copy/cut/paste. Selection restricts painting and filling. Eraser and cut need a
transparent swatch; if none exists, explicitly make a palette entry transparent
first. Paste is clipped to the image and maps colours into the destination palette.

## Per-part colours

Choose **Selected parts** in Palette Workbench to change only their primitive
colour commands. Whole-animal colours remain available; selected-part overrides
use expected original words and the same builder safeguards. Shared commands
still affect every user. A sheep leg drawn four times from one part cannot have
four independent colours without separate material or mesh references. Parts
that inherit their colour need further material decoding before such overrides.

Existing geometry edits preserve vertex and triangle counts. Custom model import
can preview and export a package, but cannot write replacement models or rigs into a ROM. Preview appearance still needs checking
in the game, particularly deformation coverage and shading.

The site also includes a [Level Editor](guides/LEVEL-EDITOR.md) and experimental
[browser play](https://sssv-modkit-dev.github.io/sssv-modkit/play.html).
Game compatibility and performance still need direct testing.

[Viewer reference](guides/VIEWER.md) · [Back to the project](../README.md)



[Models guide](guides/MODEL-EDITOR.md) · [All guides](README.md)
