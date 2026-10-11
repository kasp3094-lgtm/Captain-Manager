# Getting Started & Budget

> Draft v0.1 · Prices checked 11 October 2026, in US dollars, before VAT/sales tax. Freelance and team rates are planning ranges, not quotes: get 2–3 quotes before committing.

## Summary

| Route | Cash to a finished Act 1 | Calendar | Who does the work |
|---|---:|---|---|
| **A. You + Claude Code** (recommended) | **≈ $7,000–14,500** (bare minimum ≈ $1,000) | 6–9 months | Claude builds; you direct, edit and playtest; freelancers for portraits, music and editing |
| B. Hybrid | ≈ $25,000–55,000 | 6–9 months | As A, plus a part-time artist, writer and composer |
| C. Conventional indie team | ≈ $155,000–370,000 | 10–14 months | 5–6 paid contractors, little AI |

**Reaching the playable prototype (M4, weeks 6–8) costs about $200–400**, which is two months of a Claude Max plan. Nothing else needs paying for until then.

## 1. What we need to get started

### Decisions (from you, this week)

1. **Engine and platform.** Recommended: browser-first with TypeScript + Babylon.js, packaged for Steam later. Alternative: Godot 4. Reasons are in the [tech plan](03-tech-and-build-plan.md#1-recommended-stack).
2. **Where Act 1 ships.** Free on itch.io, paid on Steam, or both. This sets the polish bar, and with it most of the budget.
3. **Budget ceiling and your time.** How much per month, and how many hours a week you can give (the plan assumes 10–15).
4. **AI-generated art or audio: yes or no?** Faster and cheaper, but Steam requires you to disclose it and some players avoid it. A safe middle ground is to use it only for concepts and placeholders.
5. **Names and setting.** Everything in the docs is a placeholder. Say what you'd like to change before M4.

### Accounts and tools

- [x] A GitHub repository (this one). It's public, so GitHub Actions and GitHub Pages hosting are free.
- [ ] A Claude plan with enough Claude Code usage: **Max** (from $100/month) for day-to-day building.
- [ ] GitHub Pages switched on (Settings → Pages → Source: GitHub Actions). The deploy workflow comes in M0.
- [ ] On your computer: a current Chrome or Edge to play builds. Optional: [Inky](https://www.inklestudios.com/ink/) to read and edit story scripts, [Blender](https://www.blender.org/) if you want to touch 3D models.
- [ ] Later: an [itch.io](https://itch.io/) account for playtest builds, and [Steam Direct](https://partner.steamgames.com/steamdirect) ($100 per game) only if Act 1 goes to Steam.

### Inputs only you can give

- [ ] 5–10 reference images (*Fleet Command II* and anything else whose look you like). See [`references/`](references/).
- [ ] The moments you already picture: scenes, characters, lines.
- [ ] Your reaction to the cast and story outline in the [Act 1 spec](02-act1-content.md): who's interesting, who's boring, what's missing.
- [ ] 3–5 friends willing to playtest around weeks 6–8.

### The first sprint (once you say go)

- **M0 Foundations** (2–4 days): project skeleton, tests, CI, a playable link that updates itself.
- **M1 Greybox ship** (1–2 weeks): all four decks walkable, 76 racks, signs, deck map.

After about two weeks you can walk around the *Kestrel* in your browser.

## 2. Timeline (AI-assisted, part-time)

| When | Milestones | You get |
|---|---|---|
| Weeks 1–2 | M0–M1 | A walkable greybox ship |
| Weeks 3–5 | M2–M3 | Choices and meters working; a living crew |
| Weeks 6–8 | M4 | **A playable prototype** (30–45 min), a playtest, the go / no-go review |
| Months 3–4 | M5–M6 | Battles and the patrol map |
| Months 4–7 | M7 | All of Act 1's content, art and audio |
| Months 7–9 | M8 | Beta, polish, release |

**Act 1 final: about 6–9 months**, including slack for rework. Writing and editing ~70k words is the long pole, and your editing time sets the pace.

## 3. Cost to a finished Act 1

### Route A: you + Claude Code (recommended)

Claude writes the code, tools, tests and first drafts of the text. You direct, edit and playtest. Money goes to the few things that shape quality most: portraits, music and editing.

| Item | Lean | Recommended | Notes |
|---|---:|---:|---|
| Claude plan | $600 | $1,600 | Lean: Max 5× ($100/month) for 6 months. Recommended: Max 20× ($200/month) for 8 months. Pro ($20/month) will run into its limits with daily build sessions. |
| 3D assets | $0 | $200–400 | CC0 kits and procedural props; a few paid packs to fill gaps |
| Custom 3D models | $0 | $500–1,500 | Ship exteriors and a few hero props from a freelance modeller |
| Character portraits | $0–100 | $1,500–3,000 | ~10 characters × 3–4 expressions; the biggest single quality lever |
| Music (~20 min) | $0–150 | $1,000–3,000 | Stock packs, or a commissioned main theme plus cues |
| Sound effects | $0 | $0–150 | Free CC0 libraries and the free GDC audio bundles cover most of it |
| Editor / proofreader (~70k words) | $0 | $1,000–2,000 | |
| Hosting and playtests | $0 | $100–350 | GitHub Pages and itch.io are free; small thank-yous for testers |
| Release | $0–100 | $100–500 | Steam Direct fee $100; optional code-signing certificate |
| Contingency (15 %) | $90–150 | $900–1,900 | |
| **Total cash** | **≈ $700–1,100** | **≈ $7,000–14,500** | |
| **Your time** | | | **≈ 300–600 hours** over 6–9 months |

- **Lean** gets you placeholder-grade portraits and stock music: fine for a free itch.io release, thin for a paid one.
- **Recommended** gets you an Act 1 polished enough to sell on Steam, or to pitch to a publisher or crowdfund Act 2.

### Route B: hybrid with part-time specialists

| Item | Cost |
|---|---:|
| Claude plan (Max 20×, 9 months) | $1,800 |
| 3D artist, part-time (~3 months of work: modular kit, characters, ships) | $9,000–18,000 |
| 2D illustrator (portraits, key art) | $2,000–4,000 |
| Narrative writer / editor (co-writes and edits ~70k words) | $5,000–12,000 |
| Composer and sound designer (~25 min of music plus effects) | $3,000–8,000 |
| QA and playtest coordination | $500–2,000 |
| Tools, assets, Steam, legal | $500–2,000 |
| Contingency (15 %) | $3,300–7,200 |
| **Total** | **≈ $25,000–55,000** |

It buys noticeably more polished art and writing, and a stronger case for a paid release.

### Route C: a conventional indie team (for comparison)

No heavy AI use; contractors at typical indie rates. Your own time as designer and producer is not included.

| Role | Person-months | Monthly rate | Cost |
|---|---:|---:|---:|
| Programmers (2) | 16–20 | $5,000–9,000 | $80,000–180,000 |
| 3D and 2D artists | 10–14 | $4,000–8,000 | $40,000–112,000 |
| Writer / narrative designer | 5–7 | $4,000–7,000 | $20,000–49,000 |
| Audio (contract) | — | — | $6,000–15,000 |
| QA | 2 | $3,000–5,000 | $6,000–10,000 |
| Tools, licences, misc. | — | — | $3,000–6,000 |
| **Total** (10–14 months) | | | **≈ $155,000–370,000** |

### What moves the price

- **Up:** voice acting (easily $10,000+ for this much text), more battles, a second ship interior, hand-made animation, console ports, marketing.
- **Down:** an itch.io-only release, AI-assisted portraits, stock music, cutting Battle 2 and the free-form sector map.

## 4. Sources

- Claude plans: [claude.com/pricing](https://claude.com/pricing), checked 11 October 2026. Pro $20/month ($17/month billed annually); Max 5× $100/month; Max 20× $200/month. Claude Code is included in Pro and Max.
- Steam Direct: [partner.steamgames.com/steamdirect](https://partner.steamgames.com/steamdirect): $100 per game, paid back once the game has earned $1,000.
- CC0 3D assets: [Kenney](https://kenney.nl/assets), [Quaternius](https://quaternius.com/), [KayKit](https://kaylousberg.itch.io/).
- Free sound effects: [Sonniss GDC game audio bundles](https://sonniss.com/gameaudiogdc).
- Freelance and team rates: planning ranges based on typical indie market rates, not quotes.
