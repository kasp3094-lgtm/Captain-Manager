# Tech & Build Plan

> Draft v0.1 · October 2026. These are the build instructions: follow the milestones in order (§7).

## 1. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | One language for the game, tools and tests |
| 3D engine | Babylon.js | First-person collisions, an official navigation-mesh/crowd plugin, glTF loading, audio and an inspector built in; stable API |
| Story | Ink + inkjs | Built for branching narrative with state; the free Inky editor lets a writer work without code |
| UI | React overlay (HTML/CSS) | Dialogue, datapad, menus and HUD are easier in HTML than in 3D |
| Build / dev server | Vite | Fast and standard |
| Tests | Vitest (unit, content, headless runs) and Playwright (end-to-end, screenshots) | Everything runs in CI and in Claude's cloud sandbox |
| CI / hosting | GitHub Actions + GitHub Pages | Free for this public repo; every green push to the default branch becomes a playable link |
| Desktop release | Electron wrapper + Steamworks bindings (e.g. steamworks.js) | The same build, shipped on Steam |
| Content tools | Inky (story), Blender (optional, models), any text editor (data) | All free |

**Why browser-first.** Claude can build, run, test and screenshot the whole game inside its cloud sandbox (Node and headless Chromium are already there), which makes AI-assisted development fast and checkable. Every build is a link: you and your playtesters play it with nothing to install. The low-poly style doesn't need a heavyweight engine.

**Alternative: Godot 4.** Choose it if you want a desktop-first game and a visual editor to place things by hand. The trade-off: Claude's test loop in the cloud is weaker (rendering screenshots there is fiddly), and you'd need Godot installed to try each build. Decide before M0; switching later means a rewrite.

## 2. Architecture

```
            ┌────────────── content/  (data + Ink) ───────────────┐
            ▼                                                     ▼
   ┌─────────────────────┐   actions   ┌──────────────────────────────────┐
   │ Presentation        │ ──────────► │ Simulation  (src/sim)            │
   │  src/world   (3D)   │             │  pure TypeScript, no DOM, no 3D  │
   │  src/ui      (React)│ ◄────────── │  state · effects · events        │
   └─────────────────────┘ state+events│  crew · battle · campaign        │
                                       └──────────────────────────────────┘
                                         also runs headless in Node:
                                         tests · playthrough bots · balancing
```

Rules:

1. **The simulation owns all game state** and changes it only through actions and effects. It never imports Babylon.js, React or the DOM, so tests and bots can play the whole game without rendering anything.
2. **Deterministic.** All randomness comes from a seeded generator stored in the save. Same seed + same choices = same game.
3. **Content is data.** Systems read `content/`; nothing about a specific room, character or event is hard-coded.
4. **The ship is generated from deck plans.** One data source drives the 3D geometry, the deck map, crew locations, the navigation mesh and validation (rack count, reachability).

### 2.1 Modules

| Module | Responsibility |
|---|---|
| `src/sim/state` | Game state: meters, relations, flags, reputation, supplies, time, crew records, RNG |
| `src/sim/effects` | Applying and clamping changes; tiers; the change log; requirement checks for gated choices |
| `src/sim/events` | Event registry, trigger evaluation, scheduling of delayed consequences |
| `src/sim/narrative` | Ink runtime binding: external functions (`fx`, `req`, `flag`, `rel`) and tags (speaker, portrait, cost, requirement) |
| `src/sim/crew` | Roster generation, watch rotation, rack assignment, where everyone is in each watch |
| `src/sim/battle` | Fixed-step deterministic battle simulation: orders, AI, damage, casualties |
| `src/sim/campaign` | Days, command time, patrol legs, sector map, stations, budget cycle, endings |
| `src/sim/save` | Versioned save files and migrations |
| `src/sim/ship` | Ship layout queries (room at a point, nearest point of interest) and the deck-plan rules checked by `npm run validate` |
| `src/world/babylon.ts` | The only place that imports Babylon.js, module by module, to keep the bundle small |
| `src/world/ship` | Deck plan → meshes, props, lights, signs, doors, ladders, lift, navigation mesh |
| `src/world/player` | First-person controller, interaction ray, ladder and lift transitions |
| `src/world/npcs` | Crew placement from the schedule, animations, ambient walkers, general quarters |
| `src/world/tactical` | Tactical plot and external battle camera |
| `src/ui` | Dialogue, datapad, HUD, menus, settings, debug panel |
| `src/ui/map` | The minimap and the full ship map (M), drawn from the deck plans |
| `tools/` | Content validator, deck-map renderer, playthrough bots, screenshot script |

### 2.2 Repository layout

```
content/
  ship/ship.yaml                    the ship as a whole: ladders, lift, start room
  ship/deck1.yaml … deck4.yaml      deck plans
  ship/templates.yaml               furniture templates per room type (berthing, mess, …)
  crew/characters.yaml              named characters
  crew/names/                       name lists for generated crew
  events/<leg>/<event>.yaml + .ink  event data and scripts
  battles/*.yaml                    battle scenarios; ship and weapon stats
  sector/map.yaml                   sector map and High Command orders
  balance.yaml                      every tunable number
src/        sim/  world/  ui/       (see §2.1)
tools/      validate · deckmap · bots · shots
tests/      unit/  content/  e2e/
assets/     models/  textures/  audio/  portraits/
docs/
CREDITS.md                          every third-party asset and its licence
```

## 3. Data formats (sketches)

The deck-plan format is fixed (schema in `src/content/ship.ts`); the others show intent and are fixed in M2 and M3. All are validated in CI.

**Deck plan** (`content/ship/deck2.yaml`, abridged). Metres on a top-down plan: x from the bow, y from starboard.

```yaml
deck: 2
name: Habitation
hull: [[0, 8], [10, 1], [80, 1], [80, 15], [10, 15]]   # outline for the map
rooms:
  - id: junior-berthing-a
    name: Junior Enlisted Berthing A
    short: Junior berthing A          # label on the map
    code: 2-30-2-L                    # deck-frame-position-use
    type: berthing                    # sets the map colour
    rect: [30, 9, 10, 6]              # x, y, width, depth
    doors: [[30, 12]]                 # door centres, on the room's edge
    racks: 12
    hotRacked: true
    pois:
      - { name: Watch bill, kind: info, at: [30.4, 10] }
```

Ladders and the lift are defined once in `content/ship/ship.yaml`, with the decks they serve.

**Crew member**

```yaml
id: c042
name: Kit Kowalski
rank: SA                          # spacer apprentice
dept: operations
watch: B
station: bridge/helm_2
rack: berthing_junior_a/r07       # shared with c071 (watch C)
traits: [homesick, quick_learner]
skill: 2
```

**Event**

```yaml
id: leg1_drill
type: story
trigger: { leg: 1, day: 2, slot: forenoon, room: bridge }
cost: { commandTime: 0 }
participants: [xo, master_chief, tactical]
script: events/leg1/drill.ink
```

```ink
=== drill ===
Readiness is at {readiness()} percent, Captain. I want a full twenty-four-hour GQ drill. #speaker:xo #portrait:stern
+ [Do it.]
    ~ fx("readiness", 8)
    ~ fx("fatigue", 15)
    ~ fx("crew", -6)
    ~ fx("rel.xo", 5)
+ [Live fire. Make it real. #cost:budget:1500]
    ~ fx("budget", -1500)
    ~ fx("readiness", 12)
    ~ fx("crew", 3)
    ~ fx("rel.tactical", 8)
+ [Let the Master Chief run it her way. #req:rel.master_chief>=trusted]
    ~ fx("readiness", 7)
    ~ fx("crew", 2)
    ~ fx("fatigue", 8)
    ~ fx("rel.xo", -3)
- -> END
```

Convention: the game checks `#req` and `#cost` tags. Unmet choices are shown greyed out with the reason and can't be picked.

## 4. Verification: how we know it works

| Check | Command | What it proves |
|---|---|---|
| Unit tests | `npm test` | Rules: effects, tiers, gating, schedules, battle maths, saves |
| Content validation | `npm run validate` | Every file matches its schema; every Ink script compiles; every referenced room, character, meter and flag exists; ≥ 50 racks; every room reachable; no rack double-booked in any watch |
| Playthrough bots | `npm run sim` | 1,000 headless runs with random and greedy choices: no crashes or dead ends; every event and ending reachable; meters stay in their designed ranges |
| End-to-end | `npm run e2e` | The real game in headless Chromium: boot, walk, open the datapad, play an event, save and load |
| Screenshots | `npm run shots` | Fixed camera bookmarks for every room and UI state, saved for review |
| Performance | `npm run perf` | Frame times on a scripted walk through every deck |

All of these run in GitHub Actions on every push. The default branch must always be green and deployable.

Debug tools (behind `?debug` in the URL): set any meter, jump to any day or event, teleport to any room, show the navigation mesh, frame stats, free camera.

## 5. Performance budget

- 60 fps at 1080p in Chrome on a mid-range laptop with integrated graphics (e.g. Apple M1, Intel Iris Xe).
- Only the current deck is rendered and fully simulated; ladderwells show a glimpse of the next one.
- Under ~300 draw calls per view: props are instanced, static geometry merged per room.
- Up to ~40 animated people visible at once; sleepers are behind drawn curtains, with nothing to animate.
- Initial download under ~60 MB; first load under 10 seconds on broadband.

## 6. Art pipeline

- Default to CC0 kits (Kenney, Quaternius, KayKit) plus simple props built from primitives in code or by Blender scripts. This suits the style and means Claude can build most props itself.
- One shared palette and one flat-shading material make assets from different sources look like one game.
- Models as glTF/GLB; small palette-atlas textures; audio as OGG with an MP3 fallback.
- **The repo is public**, so paid assets whose licence forbids redistribution are never committed. They live in private storage and are pulled in at build time.
- Every third-party asset is listed in `CREDITS.md` with its licence.

## 7. Milestones: the build instructions

Each milestone ends with a playable build at the hosted link and a short report (what changed, screenshots, what's next). Don't start the next milestone until every acceptance criterion passes and the user has had a look.

Durations assume daily Claude Code sessions plus 10–15 hours a week of your time for direction, review and playtesting.

### M0 — Foundations (2–4 days)

Build:

- Vite + TypeScript (strict) + Babylon.js + React overlay; ESLint and Prettier.
- Vitest and Playwright; GitHub Actions running typecheck, lint, tests and build; deploy to GitHub Pages from the default branch once CI passes.
- Debug-flag system, seeded RNG, empty `content/` with schemas wired into `npm run validate`.
- The commands section of `CLAUDE.md`.

Done when:

- [x] CI is green, and the Pages link shows a lit test room you can walk around (WASD + mouse, pointer lock).
- [x] `npm test`, `npm run validate`, `npm run e2e` and `npm run shots` all run locally and in CI.

### M1 — Walkable greybox ship (1–2 weeks)

Build:

- The deck-plan format and schema; a generator for floors, walls, ceilings, doors and hatches, signs with compartment numbers, and lights.
- Room templates that place furniture by room type (rack stacks with lockers, mess tables, consoles…).
- First-person controller: walk, look, interact; ladder and lift transitions between decks; collisions.
- All four decks of the *Kestrel* greyboxed per the [Act 1 spec](02-act1-content.md#3-the-ship-cns-kestrel).
- A 2D deck-map renderer (SVG) from the same data; a room-name HUD when entering a room. *(Done early, with the ship map: deck plans for all four decks, the minimap and the full map.)*

Done when:

- [ ] Every room in the Act 1 spec exists, is signed, and is reachable from the captain's quarters (validator). *(On the plan: done. In 3D: M1.)*
- [x] The validator counts 76 racks (and fails if it ever drops below 50).
- [ ] An end-to-end test walks captain's quarters → bridge → engineering by ladder, and back by lift.
- [ ] A screenshot of every room is produced.
- [ ] 60 fps on the reference laptop while walking all four decks.

### M2 — Command core (1–2 weeks)

Build:

- Simulation state: meters, per-character relations, tiers, flags, reputation, supplies, time, RNG.
- Effects engine with a change log; requirement checks; event triggers; scheduling of delayed consequences.
- Ink integration with external functions; dialogue UI with portraits, greyed-out locked choices with their reasons, and "X will remember that" notices.
- Datapad: daily report, crew, officers, ship status, budget, log, deck map.
- The day loop with command time; the evening captain's log; sleep; autosave and manual saves.
- The headless runner (`npm run sim`).

Done when:

- [ ] Three sample events, including *The drill*, play end to end in the browser.
- [ ] 1,000 headless runs of three days finish without errors.
- [ ] Save → load reproduces an identical state; older saves load through migrations.
- [ ] Unit-test coverage of `src/sim` is at least 80 %.

### M3 — Living crew (1–2 weeks)

Build:

- The roster: 100 crew from `characters.yaml` plus seeded generation.
- The watch rotation ([design doc §8](01-game-design.md#8-the-crew)) and hot-rack assignment.
- People at duty stations, seats and racks for each watch; idle, sit, sleep, work and walk animations; a few ambient walkers on the navigation mesh.
- Talk to anyone: state-driven barks; named characters have their own positions and greetings.
- General quarters: alarm, red lighting, crew moves to battle stations.
- Noticeboards show the live watch bill.

Done when:

- [ ] Validator: no rack has two sleepers in the same watch, and everyone has exactly one location per watch.
- [ ] The 1600 shift change visibly reshuffles the crew.
- [ ] 60 fps with all 100 crew aboard.

### M4 — Vertical slice: "First Watch" (2–3 weeks) ★ prototype checkpoint

Build:

- The prologue and Leg 1 Days 1–3 (through the *Taurus* inspection), fully written and playable.
- A first art pass on four rooms (bridge, captain's quarters, crew mess, junior berthing) and the start of the modular kit.
- Placeholder portraits for the five main characters; ship ambience; one music track; a title screen.

Done when:

- [ ] A 30–45-minute build is on the hosted link.
- [ ] 3–5 playtesters have finished it and answered a short survey.
- [ ] Go / no-go review with you: what's fun, what to cut, whether the budget and timeline still hold.

### M5 — Tactical battles (2–4 weeks)

Build:

- A deterministic battle simulation (fixed step, seeded) with ship, weapon, sensor and damage data.
- Orders through officer panels; enemy behaviours; the tactical plot and external camera; pause and speed control.
- Modifiers from readiness, fatigue, officer relations and morale.
- Compartment damage → named casualties → the aftermath aboard (visible damage, sickbay, memorial).
- Battle 1 (*Cutter*), including its tutorial.

Done when:

- [ ] Battle 1 plays start to finish and its result flows back into the story.
- [ ] Same seed + same orders = same result (unit test).
- [ ] Balancing harness: at 80 % readiness the player wins at least 25 percentage points more often than at 30 %.

### M6 — Strategic layer and economy (1–2 weeks)

Build:

- Sector map, routes, travel time and fuel; High Command orders per leg.
- Station visits: debrief, resupply, refits, shore leave, personnel; the monthly allotment; audits.

Done when:

- [ ] Leg 1 → station → Leg 2 plays through.
- [ ] Across 1,000 bot runs the budget stays within its designed band and never blocks progress.

### M7 — Act 1 content production (8–12 weeks, the long pole)

Build:

- All ~55 events, officer arcs, barks and datapad text; Battles 2 and 3; all five endings.
- Final art for every room; character variants; final portraits; ship exteriors; full audio (ambience per area, effects, 6–8 music cues).
- Workflow: you approve each chapter's outline → Claude drafts it in Ink → you edit → bots check reachability.

Done when:

- [ ] Every event and every ending is reached in bot runs.
- [ ] Placeholder counters (`TODO_ART`, `TODO_TEXT`) are zero.
- [ ] A full playthrough takes 3–4 hours.

### M8 — Beta, polish and release (4–6 weeks)

Build:

- Two playtest rounds (10–20 players), balancing, bug fixing.
- UX and accessibility pass (settings, rebinding, text size), performance pass, save compatibility.
- If shipping on Steam: the Electron build, Steamworks (achievements, cloud saves), store page, trailer and screenshots.

Done when:

- [ ] No known crashes or progression blockers; at least 99 % of beta sessions crash-free.
- [ ] The release checklist for the chosen store (itch.io and/or Steam) is complete.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Scope creep | Milestone gates, the cut list below, the M4 go / no-go review |
| Writing volume and quality (~70k words) | Claude drafts, you edit; a voice sheet per character; budget for a human editor |
| Art from mixed sources looks inconsistent | One palette, one flat-shading material, one main kit family |
| Walking becomes tedious | Compact layout, fast travel to visited rooms, events that pull you around the ship |
| Space battles are hard to read | 2D plane, naval symbols, pause, officers who call out what matters |
| 100 animated people hurt performance | Simulate the current deck only; instancing; curtains on sleepers |
| An AI can't feel whether it's fun | Human playtests at M4, during M7 and at M8; screenshots on every visual change |
| Asset licences | CC0 by default; licence register in `CREDITS.md`; no restricted assets in the public repo |

**Cut list**, in this order if time or money runs short: Battle 2 → the free-form sector map (becomes fixed legs) → ambient walkers → controller support → the desktop/Steam build (itch.io only).
