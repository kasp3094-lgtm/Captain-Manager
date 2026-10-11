# Source code map

Where each part of the game lives, and what it is for. The design docs in [`docs/`](../docs/) say what the game is; this page says where that is in the code. Every file also starts with a short comment saying what it does.

## How it fits together

```
index.html → main.tsx ─┬─ Game (game.ts) ── every frame: move the captain → run ship's time and the
                       │      │                crew's day → play walk-by dialog → find what the captain
                       │      │                can use → render → tell the interface what's going on
                       │      ├─ world/    the 3D view (Babylon.js): the ship built from the deck
                       │      │            plans, the captain, ladders and the lift, the crew
                       │      ├─ content/  data from content/*.yaml, checked against schemas
                       │      └─ sim/      pure game rules: random numbers, ship layout queries, the
                       │                   crew roster and their day, dialog matching
                       └─ App (ui/App.tsx) ── the React interface on top: start and pause screens,
                                              HUD with the minimap and speech, the ship map (M), the lift

content/ship/*.yaml → world/ship/layout.ts + fits.ts (pure: walls, doors, cells, furniture)
                    → world/ship/build.ts + props.ts (Babylon meshes, lights, colliders)
content/crew/*.yaml → sim/crew.ts (the roster) + sim/schedule.ts (everyone's day)
                    → world/crew/life.ts (pure: who walks where, on walkgrid.ts and spots.ts)
                    → world/crew/crowd.ts + body.ts (people drawn as posed boxes, lit per cell)
content/dialog/*.yaml → sim/dialog.ts (pure: read, check, match) → world/crew/chatter.ts (who
                    says what, when) → ui/Speech.tsx (speech bubbles)
```

- `game.ts` is the only file that touches all of `world/`, `sim/`, `content/` and `ui/`.
- `sim/` never imports `world/`, `ui/`, Babylon.js, React or browser globals, so it runs headless in Node for tests and tools. ESLint enforces this.
- The game writes to three small stores in `ui/state.ts`; React components read from them. Nothing in `ui/` reaches into the 3D scene.
- Numbers a designer might tune, and anything about specific rooms, live in [`content/`](../content/), not in code.
- The ship's layout planner (`world/ship/coords.ts`, `layout.ts`, `fits.ts`, `walkgrid.ts`, `spots.ts`) and the crew's movement, bodies and dialog (`world/crew/life.ts`, `body.ts`, `chatter.ts`) are plain maths without Babylon.js, so `npm run validate` and the unit tests run them in Node. ESLint enforces it. Only `world/crew/crowd.ts` draws people.

## Files

| File | What it does |
|---|---|
| `main.tsx` | Entry point: reads URL parameters, starts the Game, mounts the interface |
| `game.ts` | The Game: engine, scene, frame loop, modes (start, playing, paused, map, lift), ship's time, the crew and their dialog, using things (E), trips between decks, speech bubbles on screen, and the test hook for end-to-end tests |
| **content/** | **Content schemas and loading** |
| `content/balance.ts` | Schema for `content/balance.yaml` (movement, ship's time and crew tuning) |
| `content/crew.ts` | Schemas for `content/crew/`: billets (every job aboard), the named characters, name lists, the daily routine |
| `content/dialog.ts` | Schema for the walk-by dialog files in `content/dialog/` |
| `content/ship.ts` | Schema and types for the deck plans in `content/ship/`, including furniture templates (`fit`) and props |
| `content/registry.ts` | Which schema checks which content file, plus checks that span files (the ship layout and furnishing it, the crew and their schedules, the dialog) |
| `content/gameContent.ts` | Loads content at build time and checks it at startup |
| **sim/** | **Rules, no 3D** |
| `sim/rng.ts` | Seeded random numbers: same seed, same game |
| `sim/ship.ts` | Ship layout: room at a point, nearest point of interest, and the layout rules (inside the hull, doors lead somewhere, every room reachable, enough racks) |
| `sim/crew.ts` | The roster of 99 (plus the captain): named characters and seeded generated crew, watch sections, racks and rack-mates |
| `sim/schedule.ts` | Everyone's day from the watch bill and the routine: duty, patrols, meals, leisure, washing, sleep; the schedule rules |
| `sim/clock.ts` | Ship's time: day and minute, running at the rate in `balance.yaml` |
| `sim/dialog.ts` | Walk-by dialog: reads and checks the scripts, finds entries that can never happen, matches entries to people, places and times, fills in names |
| **world/** | **The 3D view** |
| `world/babylon.ts` | The only door to Babylon.js, imported module by module |
| `world/scene.ts` | Scene-wide look: background, contrast, vignette, glow |
| `world/palette.ts` | Colour palette: swatches for props, wall and light colours for each kind of room |
| `world/builder.ts` | Builds geometry from boxes, prisms and rings straight into big vertex-coloured meshes |
| `world/painted.ts` | Painted panels (signs, noticeboards, clocks, screens, stars) packed into one texture per deck; deck plating |
| `world/ship/coords.ts` | Plan ↔ world coordinates, the ship's standard heights, rectangle maths |
| `world/ship/layout.ts` | Plans each deck from the deck plans: walls and doorways, lighting cells, signs, ladders and the lift, blockers, viewpoints (pure, unit-tested) |
| `world/ship/fits.ts` | Furnishes rooms: a template per kind of room, plus each point of interest's prop (pure, unit-tested) |
| `world/ship/props.ts` | What every piece of furniture and equipment looks like |
| `world/ship/build.ts` | Turns the plan into meshes per lighting cell, lights, colliders and things to use, plus an empty mesh per cell to draw its people in; one node per deck |
| `world/ship/walkgrid.ts` | Where a person can stand, as a grid, and paths across a deck (A*, straightened) (pure, unit-tested) |
| `world/ship/spots.ts` | Every place a person can be: seats, racks, consoles, machines, open floor (pure, unit-tested) |
| `world/crew/life.ts` | The crew going about their day: setting off on time, walking, ladders and the lift, taking spots, making way for the captain (pure, unit-tested) |
| `world/crew/body.ts` | A person as posed boxes: standing, walking, sitting, working, lying, running, talking, eating; uniform colours (pure, unit-tested) |
| `world/crew/crowd.ts` | Draws everyone on the captain's deck as thin instances per lighting cell, and the invisible boxes to bump into and talk to |
| `world/crew/chatter.ts` | Plays walk-by dialog: overheard conversations, remarks to the captain, answers when spoken to (pure, unit-tested) |
| `world/player/controller.ts` | The captain's body and eyes: walking, collisions, camera |
| `world/player/input.ts` | Keyboard and mouse state |
| `world/player/movement.ts` | Movement maths (pure, unit-tested) |
| `world/player/interaction.ts` | What the captain is looking at and can use (a ray from the eyes) |
| **ui/** | **The interface** |
| `ui/App.tsx` | Picks what to show for the current mode; the fade to black between decks |
| `ui/screens.tsx` | Start, pause and error screens |
| `ui/Hud.tsx` | In-game HUD: minimap, crosshair, what E would do, speech, key hints |
| `ui/Speech.tsx` | What the crew are saying: a bubble over the speaker, or a subtitle when they're out of view |
| `ui/LiftPanel.tsx` | The lift's deck buttons |
| `ui/DebugPanel.tsx` | Debug figures, with `?debug` |
| `ui/map/DeckPlan.tsx` | Draws one deck (rooms, doors, ladders, lift, names, points of interest) and the captain's marker |
| `ui/map/MiniMap.tsx` | The always-on minimap: deck, room, ship's time, nearest point of interest |
| `ui/map/ShipMap.tsx` | The full ship map (M): deck tabs, legend, hover to identify |
| `ui/map/poi.tsx` | Point-of-interest symbols, one shape per kind |
| `ui/map/labels.ts` | Fits room names inside rooms on the map |
| `ui/state.ts` | The state the game shares with the interface, and the speech store |
| `ui/store.ts` | The tiny store behind `state.ts` |
| `ui/styles.css` | All interface styling, in labelled sections |
| **debug/** | |
| `debug/params.ts` | URL parameters: `?debug`, `?seed`, `?cam`, `?autostart`, `?noui`, `?time`, `?timescale`, `?dialog` |
| **types/** | |
| `types/yaml.d.ts` | Lets TypeScript import `.yaml` files |

Outside `src/`: [`tests/`](../tests/) holds unit tests (`unit/`), browser tests (`e2e/`, including the walk from the captain's quarters to engineering and back, and the crew's change of watch and dialog) and screenshot scripts (`shots/`); [`tools/`](../tools/) holds the content validator.
