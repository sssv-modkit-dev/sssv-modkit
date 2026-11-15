# Guide screenshots

Captured on 2026-11-15 from the current browser site at 1384 × 805 pixels. These are unretouched interface captures. No user ROM was loaded. They document controls, not a successful ROM build or in-game results.

| Image | Visible state |
| --- | --- |
| start.png | Guided build waiting for a ROM |
| model-editor.png | Original wind-up robot sample in Models |
| textures.png | Textures & Tilesets waiting for a ROM |
| level-editor.png | Bundled sample stage with freecam and object controls |
| dialogue.png | Dialogue waiting for a ROM |
| play.png | Play waiting for a ROM |

The level image shows the already bundled stage; it is not new game-validation evidence. Game imagery and branding belong to their rights holders and are not included in the project's CC0 dedication. Original sample geometry is CC0.

Reproduce with `node tools/capture_guides.mjs CORE_SOURCE` after building the site into `build/docs-review`. The capture tool uses the existing core browser helper. The guide HTML comes from the same Markdown as the repository guides; it is generated during the site build.
