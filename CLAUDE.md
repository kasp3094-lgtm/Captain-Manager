# CLAUDE.md

Working rules for Claude Code, and anyone else, building this game.

## Project

*Captain Manager* (working title) is a first-person, story-driven ship-command game. The design docs in `docs/` are the source of truth:

- `docs/01-game-design.md`: what the game is. Read it before making design decisions.
- `docs/02-act1-content.md`: the Act 1 ship, cast, story, events and battles.
- `docs/03-tech-and-build-plan.md`: stack, architecture and milestones. Read it before writing code.
- `docs/04-getting-started-and-budget.md`: open decisions, timeline and budget.
- `src/README.md`: the code map, i.e. what every source file is for.

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

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm test` | Unit tests (Vitest, `tests/unit/`) |
| `npm run validate` | Checks every file in `content/` against its schema (`src/content/registry.ts`) |
| `npm run e2e` | End-to-end tests in headless Chromium against a production build (`PW_SKIP_BUILD=1` reuses `dist/`) |
| `npm run shots` | Screenshots of the interface and of every room from its viewpoint into `artifacts/shots/`; look at them after visual changes |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck`, `npm run lint`, `npm run format` | Static checks and formatting |
| `npm run check` | Typecheck, lint, format check, unit tests and content validation in one go |

`npm run sim` (headless playthrough bots) arrives in M2.

Keys in the game: WASD walk, mouse look, Shift walk faster, E use (climb a ladder, take the lift), M ship map, Esc pause. In the lift, 1–4 pick a deck.

URL parameters: `?debug` shows the debug panel, `?debug=colliders` also shows collision boxes, `?seed=42` fixes the random seed, `?cam=<viewpoint>` starts at a viewpoint (any room id such as `junior-berthing-a`, a shaft stop such as `ladder-fwd-deck2` or `lift-deck3`, or `spawn`), `?autostart` skips the start screen, `?noui` hides the interface.

## Conventions

- The deck plans in `content/ship/` are the one source for the ship's layout: the map and the 3D ship are both generated from them. A room's `fit` picks its furniture template (`src/world/ship/fits.ts`); a point of interest's `prop` builds that object where the point is. `npm run validate` checks the layout rules in `src/sim/ship.ts` (rooms inside the hull, doors that lead somewhere, every room reachable, enough racks), then furnishes the whole ship and reports anything that doesn't fit.
- The layout planner (`src/world/ship/coords.ts`, `layout.ts`, `fits.ts`) is plain maths with no Babylon.js, so the validator and unit tests run it in Node. ESLint enforces it.
- Every source file starts with a comment saying what it does. When you add a file, add it to the table in `src/README.md`.
- Import Babylon.js only through `src/world/babylon.ts`. Module-by-module imports keep the bundle small, and ESLint enforces it.
- `@playwright/test` is pinned to the version whose Chromium is preinstalled in Claude's cloud sandbox (1.56.1). Upgrade the two together.
- CI (`.github/workflows/ci.yml`) runs on every push. `deploy.yml` publishes the default branch to GitHub Pages after CI passes.
