# content/

Game content as data: ship layout, crew, events, battles and balance numbers. Systems read these files; nothing about a specific room, character or event is hard-coded.

Every file here must match a schema registered in `src/content/registry.ts` (README files excepted). `npm run validate` checks them all and runs in CI.

| Path | What it holds | Since |
|---|---|---|
| `balance.yaml` | Every tunable number | M0 |
| `ship/ship.yaml` | The ship as a whole: name, ladders and lift, the start room | M0 (ship map) |
| `ship/deck1.yaml` … `deck4.yaml` | Deck plans: hull outline, rooms, doors, racks, furniture templates (`fit`), points of interest and their props | M0 (ship map), M1 (3D) |
| `crew/billets.yaml` | Every job aboard: how many hold it, department, watch, where they work, what they use there, patrols | M3 |
| `crew/characters.yaml` | The named characters: name, rank, job, watch section, berth, looks | M3 |
| `crew/names.yaml` | Given and family names for the generated crew | M3 |
| `crew/routine.yaml` | How the day runs: the watch bill, day work, mealtimes, where each group sleeps, eats, washes and relaxes | M3 |
| `dialog/*.yaml` | Walk-by dialog: what the crew say among themselves and to the captain. How to write it: [`dialog/README.md`](dialog/README.md) | M3 |
| `events/<leg>/*.yaml` + `.ink` | Events: when and where each starts and who takes part, and its scene in Ink. How to write them: [`events/README.md`](events/README.md) | M2 (the first, early) |
| `battles/` | Battle scenarios, ship and weapon stats | M5 |
| `sector/` | Sector map and High Command orders | M6 |
