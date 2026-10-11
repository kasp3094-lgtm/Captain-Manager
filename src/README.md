# Source code map

Where each part of the game lives, and what it is for. The design docs in [`docs/`](../docs/) say what the game is; this page says where that is in the code. Every file also starts with a short comment saying what it does.

## How it fits together

```
index.html → main.tsx ─┬─ Game (game.ts) ── every frame: move the captain → find what they can use
                       │      │                → render the 3D scene → tell the interface where they are
                       │      ├─ world/    the 3D view (Babylon.js): the ship built from the deck
                       │      │            plans, the captain, ladders and the lift
                       │      ├─ content/  data from content/*.yaml, checked against schemas
                       │      └─ sim/      pure game rules: random numbers, ship layout queries
                       └─ App (ui/App.tsx) ── the React interface on top: start and pause screens,
                                              HUD with the minimap, the full ship map (M), the lift

content/ship/*.yaml → world/ship/layout.ts + fits.ts (pure: walls, doors, cells, furniture)
                    → world/ship/build.ts + props.ts (Babylon meshes, lights, colliders)
```

- `game.ts` is the only file that touches all of `world/`, `sim/`, `content/` and `ui/`.
- `sim/` never imports `world/`, `ui/`, Babylon.js, React or browser globals, so it runs headless in Node for tests and tools. ESLint enforces this.
- The game writes to two small stores in `ui/state.ts`; React components read from them. Nothing in `ui/` reaches into the 3D scene.
- Numbers a designer might tune, and anything about specific rooms, live in [`content/`](../content/), not in code.
- The ship's layout planner (`world/ship/coords.ts`, `layout.ts`, `fits.ts`) is plain maths without Babylon.js, so `npm run validate` and the unit tests run it in Node.

## Files

| File | What it does |
|---|---|
| `main.tsx` | Entry point: reads URL parameters, starts the Game, mounts the interface |
| `game.ts` | The Game: engine, scene, frame loop, modes (start, playing, paused, map, lift), using things (E), trips between decks, and the test hook for end-to-end tests |
| **content/** | **Content schemas and loading** |
| `content/balance.ts` | Schema for `content/balance.yaml` (movement tuning) |
| `content/ship.ts` | Schema and types for the deck plans in `content/ship/`, including furniture templates (`fit`) and props |
| `content/registry.ts` | Which schema checks which content file, plus checks that span files (the ship layout, and furnishing it) |
| `content/gameContent.ts` | Loads content at build time and checks it at startup |
| **sim/** | **Rules, no 3D** |
| `sim/rng.ts` | Seeded random numbers: same seed, same game |
| `sim/ship.ts` | Ship layout: room at a point, nearest point of interest, and the layout rules (inside the hull, doors lead somewhere, every room reachable, enough racks) |
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
| `world/ship/build.ts` | Turns the plan into meshes per lighting cell, lights, colliders and things to use; one node per deck |
| `world/player/controller.ts` | The captain's body and eyes: walking, collisions, camera |
| `world/player/input.ts` | Keyboard and mouse state |
| `world/player/movement.ts` | Movement maths (pure, unit-tested) |
| `world/player/interaction.ts` | What the captain is looking at and can use (a ray from the eyes) |
| **ui/** | **The interface** |
| `ui/App.tsx` | Picks what to show for the current mode; the fade to black between decks |
| `ui/screens.tsx` | Start, pause and error screens |
| `ui/Hud.tsx` | In-game HUD: minimap, crosshair, what E would do, key hints |
| `ui/LiftPanel.tsx` | The lift's deck buttons |
| `ui/DebugPanel.tsx` | Debug figures, with `?debug` |
| `ui/map/DeckPlan.tsx` | Draws one deck (rooms, doors, ladders, lift, names, points of interest) and the captain's marker |
| `ui/map/MiniMap.tsx` | The always-on minimap: deck, room, nearest point of interest |
| `ui/map/ShipMap.tsx` | The full ship map (M): deck tabs, legend, hover to identify |
| `ui/map/poi.tsx` | Point-of-interest symbols, one shape per kind |
| `ui/map/labels.ts` | Fits room names inside rooms on the map |
| `ui/state.ts` | The state the game shares with the interface |
| `ui/store.ts` | The tiny store behind `state.ts` |
| `ui/styles.css` | All interface styling, in labelled sections |
| **debug/** | |
| `debug/params.ts` | URL parameters: `?debug`, `?seed`, `?cam`, `?autostart`, `?noui` |
| **types/** | |
| `types/yaml.d.ts` | Lets TypeScript import `.yaml` files |

Outside `src/`: [`tests/`](../tests/) holds unit tests (`unit/`), browser tests (`e2e/`, including the walk from the captain's quarters to engineering and back) and screenshot scripts (`shots/`); [`tools/`](../tools/) holds the content validator.
