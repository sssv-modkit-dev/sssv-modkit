# Documentation inventory

Reviewed 2026-11-15 against the current guided build, shared ROM/session handling, renamed tools and live controls. Historical evidence remains dated; it is not a new game-validation claim.

| Document | Audience | True after current tool changes? | Overlap / disposition |
| --- | --- | --- | --- |
| [docs/DOCS-INVENTORY.md](DOCS-INVENTORY.md) | Contributors | Current source inventory | Records consolidation decisions |
| [docs/images/guides/README.md](images/guides/README.md) | Maintainers | Current capture states and reproduction | Provenance for the six short-guide images |
| [README.md](../README.md) | New users | Updated browser/CLI split and naming | Entry summary; points to Guides |
| [docs/README.md](README.md) | All users | Replaced competing menus with guided order | Single docs entry |
| [docs/guides/GETTING-STARTED.md](guides/GETTING-STARTED.md) | New users | Rewritten for shared ROM and guided build | Absorbs GUIDED-BUILD; CLI moved |
| [docs/guides/GUIDED-BUILD.md](guides/GUIDED-BUILD.md) | Old links | Redirect note retained | Merged into Getting started |
| [docs/guides/MODEL-EDITOR.md](guides/MODEL-EDITOR.md) | Model users | Rewritten; ROM-only indexing, saved edits, pixel painting | Controls moved to model reference; obsolete tail removed |
| [docs/guides/TEXTURES-TILESETS.md](guides/TEXTURES-TILESETS.md) | Tile users | Expanded to steps, backups and combined build limits | Complements in-page painting help |
| [docs/guides/LEVEL-EDITOR.md](guides/LEVEL-EDITOR.md) | Level users | Rewritten for live edits, freecam and source-bound saves | Details moved to level reference |
| [docs/guides/DIALOGUE.md](guides/DIALOGUE.md) | Text users | New guide for current browser flow | Complements in-page text help |
| [docs/guides/PLAY.md](guides/PLAY.md) | Players | New; guided result versus manual attachments | Complements Play help |
| [docs/guides/CLI-BUILDS.md](guides/CLI-BUILDS.md) | Advanced users | Retains Python build path; removes legacy source setup | Former Getting started |
| [docs/guides/CONFIGS.md](guides/CONFIGS.md) | Advanced users | Still applies; build link corrected | Config schema examples, not browser onboarding |
| [docs/guides/VIEWER.md](guides/VIEWER.md) | Advanced users | Still applies to generated viewer; setup link corrected | Separate from public Models guide |
| [docs/MODEL-REFERENCE.md](MODEL-REFERENCE.md) | Advanced users | Retains controls and texture limits | Extracted from long model guide |
| [docs/LEVEL-REFERENCE.md](LEVEL-REFERENCE.md) | Advanced users | Retains CLI options; static preview wording corrected | Extracted from long level guide |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md) | Contributors | Still applies; advanced headings and unsupported claims clarified | Source/data-flow reference |
| [docs/CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community | Unchanged; still applies | None |
| [docs/DEFORM-TRYOUT.md](DEFORM-TRYOUT.md) | Advanced users | Still applies to generated viewer | Focused preview/builder comparison |
| [docs/DEVELOPMENT.md](DEVELOPMENT.md) | Contributors | Current commands retained; context wording cleaned | Validation reference |
| [docs/DEVELOPMENT-NOTES.md](DEVELOPMENT-NOTES.md) | Project readers | Attribution retained; repository-location wording removed | FAQ links here for detail |
| [docs/FAQ.md](FAQ.md) | Project readers | Updated phone/setup wording | Keeps project questions separate from tool steps |
| [docs/GLOSSARY.md](GLOSSARY.md) | Advanced users | Definitions retained; advanced label and input wording | Shared vocabulary |
| [docs/NETWORK.md](NETWORK.md) | Privacy readers | Request audit retained; filenames are technical references | Detailed version of page Network notes |
| [docs/PREPUBLISH.md](PREPUBLISH.md) | Maintainers | Still applies; image approval boundary retained | Release checklist |
| [docs/PROJECT.md](PROJECT.md) | Contributors | Historical evidence dated; unsupported location references removed | Status, not onboarding |
| [docs/RELEASE-BANNERS.md](RELEASE-BANNERS.md) | Maintainers | Historical generator explicitly labelled | Separate asset workflow |
| [docs/VARIANT-AUDIT.md](VARIANT-AUDIT.md) | Advanced users | Dated static-index evidence remains scoped | Complements model limits; no animation claim |
| [docs/VIEWER-CONTROLS.md](VIEWER-CONTROLS.md) | Advanced users | Dated generated-viewer checks remain scoped | Detailed camera reference, not level controls |
| [docs/images/features/README.md](images/features/README.md) | Maintainers | Historic captures retained with approval limits | New guide captures have separate provenance |

## Core documents and in-page help

| Surface | Audience | Current status | Overlap / disposition |
| --- | --- | --- | --- |
| Core README | Pack users/contributors | Replaced obsolete bridge-first setup; browser path first | Separate pack build instructions retained |
| Core docs/FORMAT.md | Pack authors | Current scene/edit formats | Technical reference, no onboarding duplication |
| Core docs/RELEASING.md | Maintainers | Existing release workflow retained | Separate from user guides |
| Core docs/design/MODEL-IMPORT.md | Import developers | Preview package only; no ROM writer | Advanced implementation limits |
| Home FAQ | New users | Links the single Guides entry | Short questions only |
| Guided build step text | New users | Current order and automatic save | Links Getting started |
| Models About & controls, workbench hints | Model users | Current controls; sample wording refreshed | Detailed model reference |
| Levels Info, Selection, Save & project, setup | Level users | Live edits/freecam/source-bound files | Level reference; contextual guide link |
| Dialogue help / text codes | Text users | Added plain steps; byte details marked Advanced | Dialogue guide |
| Textures painting / bridge help | Tile users | Added plain steps; shared-tile limits | Textures guide |
| Play form / Advanced / Network | Players | Current file build and emulator flow | Play guide; network audit |
| ROM-free guide screenshots | All users | Captured current interfaces; no user ROM selected | Supersede historic screenshots in short guides |

Generated outputs and dependency documentation are not user guide sources. Legacy URLs remain usable; the old guided-build page is a short pointer rather than a second set of steps.
