# AI development details

This project was created and is maintained by `sssv-modkit dev` (the Developer)
with assistance from Claude and OpenAI coding tools. It is an LLM-assisted
development project; it is not presented as wholly hand-written code.

## What the AI tools did

LLMs have assisted with research, implementation, debugging, tests, and first
drafts of the documentation. Most of the code is AI-written or generated, with
only minor tweaks such as renaming file paths done by the Developer.

LLMs help investigate how the game stores and uses its data, and write the tools
for editing it. Ghidra is used to inspect the compiled game; an MCP connection
lets the coding tools work with that analysis. Findings are checked against ROM
data and emulator behaviour. An AI explanation alone is not proof.

The research lives in a separate private repository. This public repository holds
the modding tools, example edits, and instructions, without the ROM or extracted
game files.

The animal-table generator works from your ROM alone
(`python src/animal_table.py --from-rom`).

## What the Developer did

The Developer chooses what to build, sets the direction, tries the results in the
viewer and game, and gives feedback on what needs to change. The Developer also
makes small manual edits and decides what goes into the public repository. This
is a project the Developer directs with AI tools.
