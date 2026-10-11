# CLAUDE.md

Working rules for Claude Code, and anyone else, building this game.

## Project

*Captain Manager* (working title) is a first-person, story-driven ship-command game. The design docs in `docs/` are the source of truth:

- `docs/01-game-design.md`: what the game is. Read it before making design decisions.
- `docs/02-act1-content.md`: the Act 1 ship, cast, story, events and battles.
- `docs/03-tech-and-build-plan.md`: stack, architecture and milestones. Read it before writing code.
- `docs/04-getting-started-and-budget.md`: open decisions, timeline and budget.

## How we work

- Build milestone by milestone (tech plan §7). A milestone is done when every acceptance criterion passes. Don't start the next one without the user's go-ahead.
- Keep the simulation (rules and state, `src/sim/`) free of rendering and DOM code so it runs headless in Node. Every rule gets a unit test.
- Content is data: ship layout, crew, events, battles and balance numbers live in `content/`, not in code.
- Story text is written in Ink (`content/events/**/*.ink`), in each character's voice as described in the Act 1 spec.
- After any visual change, run the screenshot script and look at the images before saying it works.
- If the implementation has to diverge from a doc, update the doc in the same commit and say why in the commit message.
- Names marked *(placeholder)* can change. No code may depend on a specific character or ship name.
- The repo is public: only commit assets whose licence allows redistribution (CC0, CC-BY, or our own), and record every third-party asset in `CREDITS.md`.

## Commands

To be filled in at milestone M0 (`dev`, `test`, `validate`, `sim`, `e2e`, `shots`, `build`).
