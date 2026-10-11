# Source code map

Where each part of the game lives, and what it is for. The design docs in [`docs/`](../docs/) say what the game is; this page says where that is in the code. Every file also starts with a short comment saying what it does.

## How it fits together

```
index.html → main.tsx ─┬─ Game (game.ts) ── every frame: move the captain → render the 3D scene
                       │      │                          → tell the interface where the captain is
                       │      ├─ world/    the 3D view (Babylon.js): scene, test compartment, captain
                       │      ├─ content/  data from content/*.yaml, checked against schemas
                       │      └─ sim/      pure game rules: random numbers, ship layout queries
                       └─ App (ui/App.tsx) ── the React interface on top: start and pause screens,
                                              HUD with the minimap, the full ship map (M)
```

- `game.ts` is the only file that touches all of `world/`, `sim/`, `content/` and `ui/`.
- `sim/` never imports `world/`, `ui/`, Babylon.js, React or browser globals, so it runs headless in Node for tests and tools. ESLint enforces this.
- The game writes to two small stores in `ui/state.ts`; React components read from them. Nothing in `ui/` reaches into the 3D scene.
- Numbers a designer might tune, and anything about specific rooms, live in [`content/`](../content/), not in code.

## Files

| File | What it does |
|---|---|
| `main.tsx` | Entry point: reads URL parameters, starts the Game, mounts the interface |
| `game.ts` | The Game: engine, scene, frame loop, modes (start, playing, paused, map), and the link between the 3D room and the deck plan |
| **content/** | **Content schemas and loading** |
| `content/balance.ts` | Schema for `content/balance.yaml` (movement tuning) |
| `content/ship.ts` | Schema and types for the deck plans in `content/ship/` |
| `content/registry.ts` | Which schema checks which content file, plus checks that span files |
| `content/gameContent.ts` | Loads content at build time and checks it at startup |
| **sim/** | **Rules, no 3D** |
| `sim/rng.ts` | Seeded random numbers: same seed, same game |
| `sim/ship.ts` | Ship layout: room at a point, nearest point of interest, and the layout rules (inside the hull, doors lead somewhere, every room reachable, enough racks) |
| **world/** | **The 3D view** |
| `world/babylon.ts` | The only door to Babylon.js, imported module by module |
| `world/scene.ts` | Scene-wide look: background, contrast, vignette, glow |
| `world/palette.ts` | Colour palette and shared materials |
| `world/builder.ts` | Builds rooms from boxes and cylinders, merges them per colour, adds collision boxes |
| `world/painted.ts` | Painted panels: signs, noticeboard, clock, deck plating |
| `world/testRoom.ts` | The test compartment, standing in for Junior Enlisted Berthing A until M1 |
| `world/player/controller.ts` | The captain's body and eyes: walking, collisions, camera |
| `world/player/input.ts` | Keyboard and mouse state |
| `world/player/movement.ts` | Movement maths (pure, unit-tested) |
| **ui/** | **The interface** |
| `ui/App.tsx` | Picks what to show for the current mode |
| `ui/screens.tsx` | Start, pause and error screens |
| `ui/Hud.tsx` | In-game HUD: minimap, crosshair, key hints |
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

Outside `src/`: [`tests/`](../tests/) holds unit tests (`unit/`), browser tests (`e2e/`) and screenshot scripts (`shots/`); [`tools/`](../tools/) holds the content validator.
