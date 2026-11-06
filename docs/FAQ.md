# Questions about the project

## Is this a decompilation / recompilation?

No.

A **decompilation** project works backwards from a compiled game to recreate source
code.

A **recompilation** takes code for one system and builds it to run on another,
such as turning an N64 game into a native PC application.

This project makes **ROM patches**.
It edits the original N64 ROM. It does not recreate
the whole game's source code or turn the game into a native PC port.

LLMs help investigate how the game stores and uses its data, and write the tools
for editing it. Ghidra is used to inspect the compiled game; an MCP connection
lets the coding tools work with that analysis. Findings are checked against ROM
data and emulator behaviour. An AI explanation alone is not proof.

The research lives in a separate private repository. This public repository holds
the modding tools, example edits, and instructions, without the ROM or extracted
game files.

The animal-table generator works from your ROM alone
(`python src/animal_table.py --from-rom`). See [Getting started](guides/GETTING-STARTED.md).

## Was this made using AI?

Yes.

Most of the code is AI-written or generated, with only minor tweaks such as
renaming file paths done by the developer.

Claude and OpenAI coding tools have been used throughout development.

## What did the AI work on vs. what did the mod developer work on?

The AI tools handled most of the code, reverse-engineering work, debugging,
tests, and first drafts of the documentation.

The developer chooses what to build, sets the direction, tries the results in
the viewer and game, and gives feedback on what needs to change. The developer
also makes small manual edits and decides what goes into the public repository.
See [AI development details](DEVELOPMENT-NOTES.md).

## Can I play it on my device or phone?

Local build tools run on a computer with Python. The browser site also offers
Build & Play using Pyodide, alongside [Model Editor](https://sssv-modkit-dev.github.io/sssv-modkit/model-editor.html),
the [Level Editor](https://sssv-modkit-dev.github.io/sssv-modkit/level-editor.html) and
[browser play](https://sssv-modkit-dev.github.io/sssv-modkit/play.html).
The viewer needs WebGL. You can try the online demos in your phone's browser,
but mobile controls and compatibility still need testing.

Playing a patched ROM depends on your N64 emulator and device. There is no
standalone phone app or native PC version. Original hardware and every emulator
have not been tested, so support is not guaranteed.

[Back to the project](../README.md)
