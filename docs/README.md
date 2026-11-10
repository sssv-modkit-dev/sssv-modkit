# Documentation

This is the documentation index for the project. Use it to move from the high-level project overview in the [main README](../README.md) into the parts that match your goal.

## For users

If you want to try the browser tools, build a local patch, or understand what the project currently supports:

- [Getting started](guides/GETTING-STARTED.md) — supply a ROM, generate the animal table, and build your first patch.
- [Config guide](guides/CONFIGS.md) — how animal edit configs work and how to combine them.
- [Model Editor guide](guides/MODEL-EDITOR.md) — use the browser model editor and understand its limits.
- [Level Editor guide](guides/LEVEL-EDITOR.md) — stages, project files, and local ROM patching.
- [Viewer guide](guides/VIEWER.md) — build and use the local part viewer.
- [Deform preview](DEFORM-TRYOUT.md) — compare preview behavior with the builder and expected results.
- [FAQ](FAQ.md) — common questions, decompilation myths, device support, and project scope.
- [Project status](PROJECT.md) — what is implemented, what is experimental, and what still needs validation.
- [ROM notes](../rom/README.md) — where to place your legal local ROM copy.

## For contributors

If you want to work on the code, tests, or documentation:

- [Development guide](DEVELOPMENT.md) — commands, checks, validation workflow, and safety rules.
- [Architecture](ARCHITECTURE.md) — project structure, source responsibilities, and extension boundaries.
- [Viewer controls and browser validation](VIEWER-CONTROLS.md) — browser behaviors and ROM-free test procedures.
- [Release checks](PREPUBLISH.md) — review staged changes before publishing or releasing.
- [Release banners](RELEASE-BANNERS.md) — how banner assets are generated and composed.
- [Contributing](../CONTRIBUTING.md) — contribution workflow and branch expectations.
- [Agent guidance](../AGENTS.md) — working rules and project context for automated or assisted development.
- [Code of conduct](CODE_OF_CONDUCT.md) — community expectations.

## For maintainers and project context

If you need deeper background, provenance, or legal/project notes:

- [Glossary](GLOSSARY.md) — common terms and naming conventions used across the project.
- [AI development details](DEVELOPMENT-NOTES.md) — what AI-assisted work and human-direction work looked like.
- [Network audit](NETWORK.md) — what the browser pages request, and how the project limits network behavior.
- [Notice and licensing](../NOTICE.md) — third-party assets, public/runtime dependencies, and CC0 scope.
- [Feature image notes](images/features/README.md) — which screenshots are approved for public docs and what they show.
- [Project status](PROJECT.md) — current capabilities, evidence and limits, and next task list.

## Quick paths

- New to the repo? Start with [main README](../README.md), [Getting started](guides/GETTING-STARTED.md), and [FAQ](FAQ.md).
- Want to edit a config? Go to [Config guide](guides/CONFIGS.md).
- Want to build a ROM patch? Go to [Getting started](guides/GETTING-STARTED.md) and [Development guide](DEVELOPMENT.md).
- Want to understand current limits? Read [Project status](PROJECT.md) and [Deform preview](DEFORM-TRYOUT.md).
- Want to work on documentation or release quality? Start with [Development guide](DEVELOPMENT.md), [Release checks](PREPUBLISH.md), and [Agent guidance](../AGENTS.md).

## External references

- [Model Editor](https://sssv-modkit-dev.github.io/sssv-modkit/model-editor.html)
- [Level Editor](https://sssv-modkit-dev.github.io/sssv-modkit/level-editor.html)
- [Browser Play](https://sssv-modkit-dev.github.io/sssv-modkit/play.html)
- [sssv-modkit-automated-testing](https://github.com/sssv-modkit-dev/sssv-modkit-automated-testing)

Emulator automation, ROM-derived tables, generated viewers, and other local/private inputs are not part of the public repository. Keep them local and follow [ROM notes](../rom/README.md) and [release checks](PREPUBLISH.md) when preparing a release.
