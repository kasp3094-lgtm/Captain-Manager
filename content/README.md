# content/

Game content as data: ship layout, crew, events, battles and balance numbers. Systems read these files; nothing about a specific room, character or event is hard-coded.

Every file here must match a schema registered in `src/content/registry.ts` (README files excepted). `npm run validate` checks them all and runs in CI.

| Path | What it holds | Since |
|---|---|---|
| `balance.yaml` | Every tunable number | M0 |
| `ship/` | Deck plans and room templates | M1 |
| `crew/` | Named characters and name lists | M3 |
| `events/` | Event data (`.yaml`) and story scripts (`.ink`) | M2 |
| `battles/` | Battle scenarios, ship and weapon stats | M5 |
| `sector/` | Sector map and High Command orders | M6 |
