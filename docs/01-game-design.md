# Game Design

> Draft v0.1 · October 2026 · Covers the whole game; Act 1 is the first deliverable.
> **Must** marks a requirement. *(placeholder)* marks a name we can change freely.

## 1. Pitch

You are the newly appointed captain of an ageing military patrol vessel: about a hundred people in a hull the size of a frigate, sent to patrol a frontier where smugglers, pirates, miners and a rival power rub against each other.

You don't aim the guns. You decide who sleeps where, whether the crew gets shore leave or another drill, what goes into your report to High Command, and whom you trust. Then, rarely, a battle comes, and everything you did before it decides how well your crew fights.

You play in first person, inside a fully walkable ship rendered in simple, readable 3D.

## 2. Design pillars

1. **Command is people.** The ship is a community of about 100 individuals. Every decision lands on someone you can walk up to and talk to.
2. **A ship you can live in.** Every rack, hatch, coffee machine and gun has a reason to be there. Shifts change, junior crew share racks, and the watch bill on the noticeboard is the real one from the simulation.
3. **Choices with weight and memory.** Few, meaningful decisions that trade off the five command meters. The game remembers them in dialogue, in how people behave, in how the ship looks, and in which options exist later.
4. **Battles are rare and decisive.** Combat is the exam; ship life is the preparation. Readiness, morale and officer relations decide how well your orders are carried out.
5. **Simple, readable 3D.** Low-poly, flat-shaded, strong lighting and colour-coding. Style over fidelity.

### Non-goals (protecting the scope)

- No shooting or hand-to-hand combat. The captain commands; the crew fights.
- No open galaxy, ship-building sandbox or multiplayer.
- No voice acting in Act 1 (text, plus short audio barks at most).
- No real-time pressure while you walk around: the clock only moves when you act.

## 3. Tone

*"Everyone on this ship looks at you."*

Grounded military drama with warmth and gallows humour. Touchstones: *Master and Commander*, *Das Boot*, *The Expanse*, *Battlestar Galactica* (2004), *Honor Harrington*; in games, *FTL*, *Frostpunk*, *Sunless Sea*, *Papers, Please* and the crew conversations in *Mass Effect*.

Writing rules:

- No obviously right answer. Choices are conflicts between values (duty or loyalty, crew or mission, honesty or career), not good against evil.
- Characters have their own agendas and act on them: they report you, cover for you, request a transfer, or refuse an order.
- Naval texture everywhere: watch bills, ship-wide announcements ("Now hear this…"), captain's mast, compartment numbers, the bosun's call. Explain jargon through context, never through a pop-up glossary.

## 4. Structure

| Unit | What it is |
|---|---|
| **Act** | One command. Act 1 is the patrol vessel. It ends with an evaluation whose results carry into Act 2. |
| **Patrol leg** | 4–6 played days: orders from High Command, a route on the sector map, and arrival at a station (debrief, resupply, shore leave). |
| **Day** | Morning report, three slots of command time, the evening log, sleep. Uneventful transit days are skipped with a summary. |
| **Command-time slot** | Forenoon, Afternoon, Evening. Each major action uses one slot. |

### 4.1 The day loop

1. **Wake** in the captain's quarters. The datapad's daily report shows what changed overnight, new requests, incidents and orders.
2. **Roam the ship.** Walking and small talk are free. People with something to say are marked; some events start when you enter a room.
3. **Spend command time.** Major actions use one slot: inspect a department, run a drill, hold a meeting, hold captain's mast (a disciplinary hearing), have a private talk with an officer, board a ship, visit a station. Using a slot moves the clock forward.
4. **Incidents interrupt.** "Captain to the bridge." Scripted and systemic events can cut in at any time; they don't use command time unless stated.
5. **Evening.** Write the captain's log: the tone of your official report (candid or flattering) feeds High Command standing. Set standing orders for the night (drill intensity, rationing, lights-out discipline).
6. **Sleep.** The night passes, delayed consequences fire, the watch rotation moves on.

Command time turns "where do I spend my attention?" into the core strategic choice without adding real-time pressure.

### 4.2 The patrol loop

Receive orders → plan the route on the sector map → patrol days with encounters at each node → reach a station → debrief, resupply, refit, shore leave → next leg.

## 5. The five command meters

These come straight from the core idea and drive every system. They change only through **effects** (§7), and the datapad always shows why a meter moved.

| Meter | Display | Raised by | Lowered by | What it affects |
|---|---|---|---|---|
| **Discretionary budget** (₡) | Exact credits | Monthly allotment (scales with High Command standing), prize money, fines collected, cutting corners | Crew welfare, extra drills (ammunition), spare parts, bribes, refits, rewards | Which paid options you can afford; refits; informants; audits if misused |
| **Combat readiness** | 0–100 %, with breakdown | Drills, maintenance, spare parts, rest, full manning | Fatigue, damage, skipped maintenance, ammunition spent, casualties | Battle performance (reaction time, accuracy, reload, damage control); some mission options |
| **Officer relations** | One per key character (each officer, plus the Master Chief), −100…+100, shown as tiers | Acting on their values, backing them, trusting them with responsibility | Overruling or humiliating them, acting against their values | Their personal arcs; initiative and cooperation in battle; whether they cover for you or report you |
| **High Command standing** | −100…+100, shown as tiers | Following orders, mission success, good reports | Disobedience, losses, complaints, embarrassments | Allotment size, resupply, approvals (replacements, refits), how much disobedience is tolerated, the Act 1 ending |
| **Crew relations** (enlisted morale) | 0–100, tiers plus a mood line | Good food, rest, fairness, shore leave, recognition, victories | Overwork, unfair discipline, crowded berthing, casualties, broken promises | How fast readiness improves, discipline incidents, volunteers, damage control and boarding in battle; mutiny risk at the extreme |

Tiers:

| Meter | Tiers (low → high) | Thresholds |
|---|---|---|
| Officer relations | Hostile · Strained · Neutral · Trusted · Loyal | ≤ −60 · −59…−20 · −19…+19 · +20…+59 · ≥ +60 |
| High Command | Disgraced · Doubted · Unremarkable · Respected · Favoured | same as above |
| Crew relations | Mutinous · Sullen · Steady · Good · Devoted | 0–19 · 20–39 · 40–59 · 60–79 · 80–100 |

### 5.1 Secondary state

- **Fatigue** (crew-wide, 0–100): raised by drills, alerts and short manning; lowered by rest. Feeds readiness and morale.
- **Supplies**: fuel, food, spare parts and munitions, in abstract units.
- **Ship condition**: the hull plus each system (weapons, sensors, drive, reactor, life support).
- **Crew groups**: Operations, Engineering and Marines each carry a modifier on top of overall morale, voiced by their chief.
- **Captain's reputation**: four sliders built from your choices: *Strict ↔ Lenient*, *By-the-book ↔ Pragmatic*, *Candid ↔ Political*, *Bold ↔ Cautious*. They unlock dialogue options and colour how people react.
- **Flags and memories**: story flags (`seized_taurus_cargo`) and per-character memories ("you backed me at mast").

### 5.2 What the player sees

- Exact numbers for budget, readiness and supplies.
- Tiers and trend arrows for relations. After a choice, a short notice says who noticed ("Master Chief Delgado will remember that."), never the number.
- The datapad keeps a log of every change and its cause.

## 6. Choices and gating

- Every major choice trades off **at least two** meters. No free wins.
- A choice can require budget, a meter threshold, a relation tier with a named character, a flag, a reputation lean, or a crew member with a skill.
- **Locked choices stay visible**, greyed out with the reason ("Requires: Chief Engineer — Trusted"), so players see what earlier decisions opened or closed. A few secret options stay hidden until unlocked.
- About a third of significant choices have **delayed consequences** that come back days later.
- Effect sizes: small ±1–5; major ±10–20; defining ±25 or more, plus flags.
- **Fail forward.** Only extreme states end the act early (relieved of command, mutiny), and those are complete, written endings.

**Example: "The drill" (Leg 1, Day 2).** Readiness is low and the XO wants a 24-hour general-quarters drill.

| Option | Requires / costs | Effects |
|---|---|---|
| "Do it." | — | Readiness +8, Fatigue +15, Crew −6, XO +5 |
| "Short drills every watch for three days." | 1 command-time slot per day | Readiness +6 over 3 days, Fatigue +5, Crew −1 |
| "Live fire. Make it real." | ₡1,500 of ammunition | Readiness +12, Crew +3, Tactical Officer +8 |
| "Let the Master Chief run it her way." | Master Chief: Trusted | Readiness +7, Crew +2, Fatigue +8, XO −3 |

## 7. Events: the content model

All narrative content is made of **events**: a small data record plus an Ink script.

- **Data**: id, type, trigger (when: act, leg, day, slot; where: room; who must be present; conditions on meters and flags; weight; cooldown; repeatable), cost (command time, budget), participants.
- **Script**: an Ink knot with the dialogue and choices. It reads and changes game state through a small set of functions (`fx`, `req`, `flag`).

| Type | What it is |
|---|---|
| Story beat | Mandatory chapter events |
| Officer arc | 3–4 linked events per key character, unlocked by relation tier and story progress |
| Crew request / complaint | Systemic pool: food, messages home, racks, promotions, disputes |
| Captain's mast | Disciplinary hearings; the whole crew hears your verdict |
| Incident | Accidents, failures, medical emergencies, fires |
| Patrol encounter | Inspections, distress calls, smugglers, pirates, colonies |
| High Command | Orders, audits, political pressure |
| Ambient bark | One-liners reflecting the current state and recent decisions |

Act 1 counts per type are in the [Act 1 spec](02-act1-content.md#7-event-list-targets).

### 7.1 Reactivity

Every significant decision must show up in at least one of:

1. **Dialogue**: people refer to what you did.
2. **Behaviour**: who salutes, who avoids you, what's said in the mess.
3. **The ship**: a new coffee machine after a welfare spend; scorched, patched passageways after a battle; an empty rack with a folded flag; an occupied brig cell.
4. **Options**: choices that open or close later.

## 8. The crew

- **About 100 crew records**, each with name, rank, department, watch section, duty station, rack (and rack-mate if they hot-rack), two traits, a skill level (1–5) and a status (fit, injured, in the brig, dead, transferred).
- **About 10 key characters** (the officers and the Master Chief) with portraits, personal arcs and distinct voices, and **about 10 named enlisted** with small stories. Everyone else is generated from a fixed seed (diverse name lists, appearance variants) and can be pulled into a story by an event.
- **Watch rotation.** Three watch sections. At any moment one is on duty, one is off duty and one is asleep:

  | Section | Night 0000–0800 | Day 0800–1600 | Evening 1600–2400 |
  |---|---|---|---|
  | A | on duty | asleep | off duty |
  | B | asleep | off duty | on duty |
  | C | off duty | on duty | asleep |

  Day workers (the XO, department heads, the surgeon, the cooks) work days and sleep at night.
- **Hot-racking.** Junior enlisted share racks in pairs from different sections, so their sleep never overlaps. Petty officers and above have their own rack, which makes a promotion something you can see.
- **What the player sees**: people at consoles on duty; eating, playing cards, working out or fixing things off duty; asleep in racks with curtains drawn; a few people always walking the passageways. At 1600 the ship visibly changes shift.
- **General quarters**: alarm, red lighting, everyone runs to their battle station.
- Crew can be injured or killed in battles and accidents, by name, at their station.

## 9. Tactical battles

Rare: 2–3 per act, and some can be avoided or defused through choices.

In the spirit of naval command games like *Fleet Command*, the captain commands through the tactical display instead of flying the ship.

- **Where.** Go to the bridge or the combat information centre (CIC); the tactical display opens full screen. Switch between the **tactical plot** (top-down, naval symbols, range rings, velocity vectors) and an **external camera** (the ships in 3D).
- **Time.** Real time with pause and 1×/2×/4× speed. Orders can be given while paused.
- **Readability.** Ships manoeuvre on a 2D plane, shown in 3D.
- **Orders go through your officers:**
  - Helm: course, speed, close or open the range, evade, hold.
  - Weapons: targets, railgun or missiles, point-defence mode, fire discipline (hold fire / fire at will), aim at engines or weapons to disable a ship for capture.
  - Sensors: active (see further, be seen) or passive; jamming; decoys.
  - Engineering: power distribution, damage-control priorities.
  - Comms: hail, demand surrender, bluff, call for help.
  - Marines: prepare a boarding party, repel boarders.
- **Everything before the battle counts:**
  - Readiness → reaction delay, accuracy, reload time.
  - Fatigue → chance of mistakes.
  - Officer relations → loyal officers act on their own initiative and suggest moves; strained ones are slow or argue.
  - Crew morale → damage-control speed, boarding success.
  - Budget spent on refits → better equipment.
- **Damage.** Hits land in compartments: systems fail, fires start, compartments breach, named crew are hurt. Afterwards you walk through the damage, visit sickbay, and decide about burials and letters home.
- **Outcomes.** Destroy, disable, capture (prize money, prisoners in the brig), withdraw, protect a convoy. Partial outcomes are normal.
- **Difficulty.** A story setting slows battles and softens enemy accuracy. Losing a battle is an outcome, not a game over (except the worst case of the Act 1 finale, which is a written ending).

## 10. Strategic layer

- **Sector map** of 8–10 nodes (stations, colonies, asteroid fields, jump points). Jumps cost days and fuel.
- **Orders.** High Command sets priorities for each leg. You may deviate to chase a lead or answer a distress call, but it costs standing unless it pays off.
- **Station visits.** Debrief (what you choose to report), resupply (from the allotment or the budget), refits (upgrades bought with the budget), personnel (request replacements, transfer troublemakers), shore leave (morale against discipline risk).

## 11. Art direction

- **Style.** Low-poly, flat or simple shading, few textures, clear silhouettes. Lighting and colour do the work. Reference: *Fleet Command II*; screenshots in [`references/`](references/) will pin down the exact look.
- **Colour-coded zones.** Command: blue-grey. Habitation: warm beige and green. Weapons: grey with red accents. Engineering: yellow and orange hazard markings. Medical: white and teal.
- **Realism through detail, not polygons.** Pipes and cable trays overhead, compartment numbers on every hatch, fire extinguishers and damage-control lockers, handrails, hatches with raised sills, notices on the bulkheads, personal items in racks.
- **Characters.** Stylised low-poly people; uniform colour by department; key characters recognisable by silhouette (hair, build, accessories). Emotion is carried by **2D portraits** in dialogue (3–4 expressions each).
- **UI.** A military datapad: dark background, amber and green, monospace accents. The tactical plot uses real naval symbol conventions (friendly: blue circle; hostile: red diamond; unknown: yellow square).

## 12. Audio direction

- Layered ambience per area (hum, ventilation, machinery), footsteps on deck plates, hatches, ship-wide announcements, the bosun's call, the general-quarters alarm.
- Sparse music: one main theme plus exploration, tension, battle and aftermath cues.
- No voice acting in Act 1; optional short barks.

## 13. UX and accessibility (minimum bar)

- Pause anywhere; autosave every morning plus manual save slots.
- Fast travel from the datapad deck map to rooms you've visited; walking stays the default.
- Mouse and keyboard first, controller later; rebindable keys; FOV and sensitivity sliders; head-bob toggle; text size; colour-blind-safe tactical symbols.

## 14. Open questions

| Question | Proposal |
|---|---|
| Does the player ever leave the ship? | Not in Act 1. Station and colony scenes are text with an illustration. |
| Is the captain customisable? | A name, plus one background choice that unlocks 1–2 options per chapter. |
| How much of the meters to reveal? | As in §5.2; revisit after the first playtest. |
| Can key characters die in Act 1? | Yes, two of them, under specific conditions, so death feels possible but stays rare. |

## 15. Glossary

| Term | Meaning |
|---|---|
| XO | Executive officer: the captain's second-in-command |
| CIC | Combat information centre: where sensor and weapons information comes together |
| Petty officer (PO), Chief | Junior and senior non-commissioned ranks; the Master Chief is the senior enlisted sailor aboard |
| Rack / hot-racking | A bunk / two sailors on different watches sharing one bunk |
| Watch, watch section, watch bill | A duty period / the group that stands it together / the posted schedule |
| General quarters (GQ) | Battle stations |
| Captain's mast | A disciplinary hearing held by the captain |
| Head, ladderwell, hatch | Toilet; steep stairway between decks; door in a bulkhead or deck |
