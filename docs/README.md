# Documentation

Start with the guide for what you want to do. The [main README](../README.md) is the project overview; this page is the detailed documentation index.

## Use the modkit

| Goal | Start here |
| --- | --- |
| Build an animal ROM patch | [Getting started](guides/GETTING-STARTED.md) · [ROM setup](../rom/README.md) |
| Understand or combine edit configs | [Config guide](guides/CONFIGS.md) · [Example configs](../configs/) |
| Try the public Model Editor | [Model Editor guide](guides/MODEL-EDITOR.md) · [Open the editor](https://sssv-modkit-dev.github.io/sssv-modkit/model-editor.html) |
| Build a private viewer from your own files | [Viewer guide](guides/VIEWER.md) |
| Edit stages and build level patches | [Level Editor guide](guides/LEVEL-EDITOR.md) · [Open the editor](https://sssv-modkit-dev.github.io/sssv-modkit/level-editor.html) |
| Learn about deformation behavior and limits | [Deform preview](DEFORM-TRYOUT.md) · [Glossary](GLOSSARY.md) |
| Understand project scope and device support | [FAQ](FAQ.md) · [Project status](PROJECT.md) |

## Develop and maintain the tools

- [Development guide](DEVELOPMENT.md): setup, checks, focused tests, and validation limits.
- [Architecture](ARCHITECTURE.md): data flow, active source files, and extension boundaries.
- [Viewer controls and browser validation](VIEWER-CONTROLS.md): controls, browser evidence, and ROM-free fixtures.
- [Network audit](NETWORK.md): public-page requests, content security policy, and third-party runtime loading.
- [Release checks](PREPUBLISH.md): staged-file review and publication safeguards.
- [Release banners](RELEASE-BANNERS.md): banner generator and browser composer.
- [Contributing](../CONTRIBUTING.md) · [Code of Conduct](CODE_OF_CONDUCT.md) · [Agent guidance](../AGENTS.md).

## Project and third-party notes

- [Project status](PROJECT.md): current capabilities, evidence, limitations, and next tasks.
- [AI development details](DEVELOPMENT-NOTES.md): how coding tools assisted the project.
- [Feature image notes](images/features/README.md): image provenance, approvals, and limitations.
- [Notice and license information](../NOTICE.md): game/demo assets, third-party software, and CC0 scope.

Emulator input recipes and capture automation are maintained in [sssv-modkit-automated-testing](https://github.com/sssv-modkit-dev/sssv-modkit-automated-testing). ROM-derived tables, generated viewers, and other private inputs should stay local; see [ROM setup](../rom/README.md) and [release checks](PREPUBLISH.md).
