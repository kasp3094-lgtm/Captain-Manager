# Captain Manager *(working title)*

A story-driven, first-person command game. You are the new captain of a military patrol vessel with about a hundred people aboard, sent to a lawless frontier. Walk every deck of your ship, live with your crew, and make decisions that trade off your **discretionary budget**, **combat readiness**, and your standing with **your officers**, **your enlisted crew** and **High Command**. Battles are rare, and when one comes, everything you did before it decides how well your crew fights.

**Status:** milestone M0 (foundations): a walkable test compartment. Act 1 is the first target.

**Play:** https://kasp3094-lgtm.github.io/Captain-Manager/ (live once GitHub Pages is switched on: Settings → Pages → Source: GitHub Actions). Add `?debug` to the address for the debug panel.

## Run it locally

Needs Node.js 22 or later.

```sh
npm ci
npm run dev        # http://localhost:5173
npm run check      # typecheck, lint, unit tests, content validation
```

Other commands are listed in [CLAUDE.md](CLAUDE.md#commands).

## Documents

| Document | What's in it |
|---|---|
| [Game design](docs/01-game-design.md) | Vision, pillars, the day loop, the five command meters, choice rules, crew simulation, battles, art and audio direction |
| [Act 1 spec](docs/02-act1-content.md) | The ship deck by deck (76 racks for 100 crew), the cast, story outline, events, battles, endings |
| [Tech & build plan](docs/03-tech-and-build-plan.md) | Recommended stack, architecture, data formats, and milestone-by-milestone build instructions with acceptance criteria |
| [Getting started & budget](docs/04-getting-started-and-budget.md) | What we need before day one, the timeline, and the cost of a finished Act 1 |
| [References](docs/references/) | Mood board for the art style |
| [CLAUDE.md](CLAUDE.md) | Working rules for AI-assisted development in this repo |
