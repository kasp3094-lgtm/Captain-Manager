# Act 1: First Command *(working title)*

> Draft v0.1 · October 2026. Every name in this document is a *(placeholder)*.

## 1. At a glance

| | |
|---|---|
| **Ship** | CNS *Kestrel*, a Sentinel-class patrol vessel of the Commonwealth Navy: ~110 m long, 38 years in service |
| **Crew** | 100 aboard (108 authorised, so short-handed from the start) |
| **Setting** | The Marrow Reach: a frontier of mining colonies on the border with a rival power, the Hegemony |
| **Play time** | 3–4 hours: a prologue, three patrol legs, ~14 played days |
| **Content** | ~55 events, 3 battles (one avoidable), 5 endings |
| **Words** | ~60–75k words of branching text, including barks and datapad text |

## 2. Premise

You arrive at Fort Marrow station to take command of the *Kestrel*. Her previous captain, Commander Elias Vance, was relieved three weeks ago "for cause", and nobody will say what the cause was. The ship is old, short-handed and underfunded, the crew is unsettled, and your executive officer wanted this command herself.

High Command's orders are simple: show the flag, inspect traffic, keep the miners quiet, don't provoke the Hegemony. Over three patrol legs you discover that military-grade components are being smuggled across the border, that Vance found out, and that someone above you would prefer it stayed buried.

Act 1 ends at the border, with an order to stand down and a decision only you can make.

## 3. The ship: CNS *Kestrel*

### 3.1 Requirements

- **Must** have four decks, all walkable, connected by two ladderwells (forward and aft) and one lift. Every deck has two independent routes out.
- **Must** have at least **50 racks**. This design has **76 racks**, plus 4 sickbay beds and 2 brig bunks. Junior enlisted hot-rack: 48 people in 24 racks.
- Every room below **must** exist, be signed (name plus compartment number) and be reachable on foot from the captain's quarters.
- Every room **must** have a gameplay purpose: events, interactions, or a crew-schedule location (duty station, seat, rack).
- Each deck is about 70 × 14 m inside (the command deck is shorter), compressed from real proportions so walking stays pleasant. About 50 rooms in total, plus passages, tanks and voids.
- The exact layout lives in the deck plans, `content/ship/deck1.yaml` … `deck4.yaml`. The in-game ship map (M) and the 3D ship are both generated from them.
- The weapons spaces are walkable: the railgun room, the missile magazine and point-defence control.

### 3.2 Layout

Rooms from bow to stern, as in the deck plans. A main passageway, 3 m wide, runs along the centreline of every deck; ladders sit at frames 22 (decks 1–4) and 66 (decks 2–4), the lift at frame 46 (decks 1–4).

| Deck | Starboard side | Port side |
|---|---|---|
| 1 Command | Bridge (full width, in the bow) · CIC · Captain's quarters · XO's cabin · Wardroom · Officers' head | Ready room · Comms room · Staterooms 1–4 · Officers' stores |
| 2 Habitation | Sickbay · Ship's office · Crew mess · Galley · PO berthing A and B · Chiefs' quarters · void | Quiet room · Laundry · Heads · Berthing passage · Junior berthing A · Heads · Food stores · Gym · fresh water tank |
| 3 Weapons & operations | Railgun room · Junior berthing B · PD control · Missile magazine · Armory · Marine berthing · Brig · DC central | Forward stores · Hangar and boarding airlock · Stores · fuel tank |
| 4 Engineering | Aux machinery · Workshop · Engineering stores · Main engineering · Reactor · Jump drive; Drive room across the stern | Ballast tank · Shaft alley · Electrical room · Coolant pump room |

The plans add a few support spaces not listed below: officers' stores, a berthing passage, forward stores, engineering stores, an electrical room, a coolant pump room, and tanks and voids.

### 3.3 Rooms by deck

**Deck 1: Command**

| Room | Gameplay |
|---|---|
| Bridge | Helm, navigation, sensors, comms, captain's chair, forward viewport. Battles are fought from here. |
| Combat information centre (CIC) | Tactical holotable; sensor events; alternative battle station. |
| Captain's quarters | Sleeping cabin, day cabin with desk (datapad, logbook, High Command terminal), private head. Every day starts and ends here. Vance's hidden log is somewhere in it. |
| XO's cabin | Private. |
| Officers' staterooms ×4 | Two racks each. |
| Wardroom | Officers' mess and meeting room: dinners, officer arcs, the finale council. |
| Ready room | Briefings and captain's mast. |
| Comms equipment room | Signals and message traffic; the intercepted transmission in Leg 2. |
| Officers' head and showers | — |

**Deck 2: Habitation**

| Room | Gameplay |
|---|---|
| Crew mess and galley | Seats 36, one watch section at a time. The heart of crew morale: barks, food events, gatherings. Cold and dry stores attached. |
| Petty officers' berthing A and B | 12 racks each. |
| Junior enlisted berthing A | 12 racks, hot-racked. |
| Chiefs' quarters and mess | 6 racks; the Master Chief's territory. |
| Crew heads and showers ×2 | — |
| Sickbay | 4 beds, surgery, the surgeon's office. Casualties and medical events. |
| Ship's office | The yeoman's domain: requests, paperwork, mail, gossip. |
| Gym and recreation | Off-duty crew; morale events. |
| Laundry | The Leg 2 fire; quiet conversations. |
| Quiet room | Multi-faith chapel; memorials. |

**Deck 3: Weapons and operations**

| Room | Gameplay |
|---|---|
| Railgun room | Breech, projectile feed and capacitor bank of the keel-mounted railgun. Walkable, loud, restricted. |
| Junior enlisted berthing B | 12 racks, hot-racked, right next to the railgun capacitors: a complaint waiting to happen. |
| Point-defence control | Two turret control stations and the gunnery workshop. |
| Missile magazine | Eight launch cells, loading rails, blast doors. Munitions stock is visible on the racks. |
| Armory | Small arms for boarding parties. |
| Marine berthing and ready room | 12 racks. |
| Brig | Two cells with a bunk each. Detainees, discipline. |
| Damage-control central | Repair parties and the damage board. |
| Hangar and boarding airlock | One boarding cutter. Inspections and boardings start here; so does the change-of-command ceremony. |
| Stores | Spare parts, food, munitions overflow. Supply levels are visible on the shelves. |

**Deck 4: Engineering**

| Room | Gameplay |
|---|---|
| Main engineering | Reactor and drive control room; the Chief Engineer's domain. |
| Reactor compartment | Fusion reactor; radiation-controlled access. |
| Jump drive room | — |
| Drive room | Main drive machinery and manoeuvring thrusters. |
| Auxiliary machinery | Life support, atmosphere and water reclamation. |
| Workshop | Machine shop; improvised fixes. |
| Shaft alley | Cramped maintenance crawlway: hidden things, secret conversations. |

### 3.4 Berthing plan

| Berthing | Deck | Racks | Occupants | Rule |
|---|---|---:|---|---|
| Captain's quarters | 1 | 1 | Captain | private |
| XO's cabin | 1 | 1 | XO | private |
| Officers' staterooms ×4 | 1 | 8 | 8 officers | 2 per room |
| Chiefs' quarters | 2 | 6 | 6 chiefs | own rack |
| PO berthing A + B | 2 | 24 | 24 petty officers | own rack |
| Junior berthing A + B | 2, 3 | 24 | 48 junior enlisted | hot-racked, 2 per rack |
| Marine berthing | 3 | 12 | 12 marines | own rack |
| **Total** | | **76** | **100** | plus 4 sickbay beds and 2 brig bunks |

Hot-rack pairs always come from different watch sections (A+B, B+C, A+C; 8 racks each), so no two people ever need the same rack at the same time.

### 3.5 Exterior and weapons

- One keel-mounted railgun (long range, slow reload, heavy damage).
- Eight missile cells (limited reloads, so munitions are a resource).
- Two point-defence turrets.
- Sensor mast, comms array, drive section, the boarding cutter in its bay.
- Light armour. No energy shields: the setting stays grounded.

### 3.6 Realism checklist

- Racks three high, each with a stowage locker, reading light and privacy curtain.
- One head per ~10 crew; the mess seats one watch section at a time.
- A damage-control locker every ~20 m along the passageways.
- Naval-style compartment numbers, deck–frame–position–use: `2-30-2-L` (Junior Berthing A) is deck 2, frame 30, first compartment to port (odd numbers are starboard, even are port), living space.
- Pipes, cable trays and labels overhead; hatches with raised sills; warning signs at the magazine and reactor.
- The watch bill on each berthing noticeboard is generated from the live crew schedule.

## 4. The crew of 100

| Group | Count | Notes |
|---|---:|---|
| Captain | 1 | The player (rank: Commander) |
| Officers | 9 | XO, Tactical, Chief Engineer, Navigation, Operations, Supply, Surgeon, Ensign, Marine Lieutenant |
| Chiefs | 6 | The Master Chief plus five department chiefs |
| Petty officers | 24 | — |
| Junior enlisted | 48 | Mostly 18–24 years old |
| Marines | 12 | Boarding and security detachment |
| **Total** | **100** | Authorised: 108 |

### 4.1 Key characters

| Character | Role | Values | Arc in Act 1 |
|---|---|---|---|
| Lt. Cmdr. **Mara Okafor** | Executive officer | Order, competence, her career | Passed over for this command, and quietly asked by High Command to report on you. Ends as your strongest ally, or as the officer who relieves you. |
| Master Chief **Rosa Delgado** | Senior enlisted; voice of the crew | Fairness, the crew, tradition | Knows more about Vance than she says. Her trust is the key to the crew. |
| Lt. **Dagny Holm** | Chief Engineer | Honesty, competence, her engineers | Has been falsifying maintenance logs to keep the old ship from being scrapped. Truth or loyalty? |
| Lt. **Arjun Sethi** | Tactical officer | Glory, boldness, promotion | Wants a fight. Might start one. |
| Lt. (jg) **Pieter Haas** | Supply officer | Order, caution | Gambling debts make him the smugglers' man aboard. Redeemable, or not. |
| Lt. **Lena Moreau** | Surgeon | Compassion, honesty | The ship's conscience; argues for detainees and the exhausted. |
| Lt. **Kofi Mensah** | Marine lieutenant | Loyalty, duty, his marines | Leads the boardings; tested by an order he doesn't like. |
| Lt. (jg) **Yuki Tanaka** | Navigator | Precision, truth | Finds Vance's deleted jump records. |
| Ensign **Julian Ashford** | Junior officer | Approval | Green and likeable, and the son of Vice Admiral Ashford. How you treat him reaches High Command. |
| Commodore **Alistair Hale** | Your superior (off-ship) | Stability, his own position | Gives orders over comms. Ally or obstacle, depending on what you find. |

The operations officer, Lt. (jg) Owen Brandt, is a minor character.

### 4.2 Named enlisted

| Character | Role | Story hook |
|---|---|---|
| PO2 **Leon Barros** | Cook | Food quality versus the budget; sets the mood in the mess |
| Spacer **Kit Kowalski** | Junior rating, 19 | Homesick; at the centre of the rack dispute |
| PO1 **Hana Sato** | Railgun crew chief | Ambitious; wants live-fire drills |
| Spacer **Tomas Reyes** | Junior rating | Caught running contraband liquor (captain's mast) |
| Corporal **Dex Abara** | Marine | A brawler with a good heart; the fight in the mess |
| PO3 **Mira Lindqvist** | Engineering technician | Discovers the falsified maintenance logs |
| Chief **Benedikt Ost** | Engineering chief | Grumpy veteran; Holm's protector |
| Yeoman **Priya Raman** | Ship's office clerk | Knows every rumour and every form |
| Gunnery Sergeant **Ida Strand** | Marine NCO | Mensah's right hand |
| Spacer **Noor Haddad** | Medical assistant | Witnessed what Vance ordered |

## 5. Story outline

### Prologue: Change of command (Day 0)

- Your shuttle docks at Fort Marrow; the XO meets you at the airlock. First impressions.
- The crew is assembled in the hangar for the change-of-command ceremony. Your first speech (stern, warm, or candid about Vance) sets your starting reputation and the crew's mood.
- The XO shows you the ship (tutorial: walking, interacting, the datapad).
- Night: Vance's quarters were cleaned out, except for one thing, if you look closely.

### Leg 1: Shakedown (Days 1–5)

- **Day 1.** Departure. The first daily report and the first crew requests. A mayday from the *Sable Wren*, an independent hauler "stranded" on the edge of the Belt: the first patrol encounter (`content/events/leg1/stranded-trader`). She is really waiting to take on smuggled military couplings for a Halvard buyer at Fort Marrow. Answer at once, at battle stations or running silent, or ignore it; board her or not; then seize the cargo, let her go, take a quiet fine or look the other way. The smuggling thread starts here, before the *Taurus*.
- **Day 2.** *The drill* (worked example in the [design doc](01-game-design.md#6-choices-and-gating)). The rack dispute in junior berthing: arbitrate, or spend budget converting a storeroom into six extra racks.
- **Day 3.** Inspection of the freighter *Taurus Venture*. Your marines find undeclared cargo with military serial numbers. Seize it and report it, fine them and keep the fine, take the bribe they offer, or put the crew in the brig. The smuggling thread begins.
- **Day 4.** Ensign Ashford's navigation error nearly puts the ship into a debris field. A formal reprimand (his mother will hear) or a quiet cover-up (the XO will know).
- **Day 5.** A pirate cutter attacks a mining tug. **Battle 1** (tutorial). Capture it, destroy it, or let it run.
- **Station visit.** First debrief with Commodore Hale (what do you report about the bribe, or the ensign?), resupply, shore leave or not.

### Leg 2: The Reach (Days 6–10)

- A route choice across 3–4 nodes, with High Command's priorities pulling one way and the *Taurus* lead pulling another.
- **Miners' strike** at Tamsin Colony: the Halvard Consortium wants the Navy to "restore order"; the miners ask for protection.
- **Distress call** from a derelict, possibly a trap. **Battle 2** (a raider ambush) can be avoided with a cautious, passive-sensor approach.
- Officer arcs come to a head: Lindqvist brings you the falsified logs, the supply accounts don't add up, Tanaka finds Vance's deleted jump records.
- Captain's mast: Spacer Reyes and the contraband liquor.
- A fire in the laundry (an incident that tests readiness and damage control).
- High Command orders you to drop the Halvard matter and return to your patrol pattern.

### Leg 3: The Line (Days 11–14)

- The pieces come together (Vance's log, the jump records, the *Taurus* serials, Haas): a Halvard convoy will carry military components across the border under mercenary escort.
- Commodore Hale orders you to stand down.
- The wardroom council: the XO says obey, Sethi says attack, Moreau says go public, and the Master Chief tells you the crew will follow you if you've earned it.
- **Your choice:** stand down, shadow the convoy and gather evidence, intercept it before the border, or broadcast the evidence.
- **Battle 3:** intercepting the convoy and its escorts or, if you stood down, an ambush by smugglers who want the witness gone. The battle's setup reflects everything before it.
- Aftermath: casualties, damage, the final debrief.

## 6. Endings

| Ending | Main conditions | Act 2 hook |
|---|---|---|
| **Commendation** | High Command Respected or better; you obeyed, or brought proof they couldn't ignore | Promoted to a bigger ship. Who comes with you? |
| **The crew's captain** | High Command low, crew Devoted | Reprimanded; you keep the *Kestrel* and are sent somewhere worse. |
| **Scapegoat** | High Command Disgraced | Relieved pending court martial; Act 2 opens with the inquiry. |
| **Mutiny** | Crew Mutinous and key officers Hostile | The XO relieves you mid-crisis. An early, complete ending. |
| **Whistleblower** | You broadcast the evidence | A public scandal: a hero to some, a traitor to High Command. |

Carried into Act 2: every meter, every flag, each officer's fate (alive, dead, transferred; loyal or hostile), your reputation, and the ship's condition.

## 7. Event list targets

| Type | Count | Examples |
|---|---:|---|
| Story beats | 12–14 | Change of command, the *Taurus* inspection, the strike, the stand-down order, the finale |
| Officer arcs | 18–21 | 6–7 characters × 3 events |
| Crew requests and complaints | 6–8 | The rack dispute, food, messages home, a promotion |
| Captain's mast | 3 | Contraband liquor, the mess fight, a sentry asleep on watch |
| Incidents | 4–5 | Coolant leak, laundry fire, medical emergency, sensor failure |
| Patrol encounters | 6–7 | Inspections, the distress call, a debris field, a colony visit |
| High Command | 4 | Orders, an audit, the Vice Admiral's call about her son |
| **Events total** | **~55** | |
| Ambient barks | 300–500 lines | Reactions to meters, recent decisions, rooms, time of day |

## 8. Battles

| # | Name | When | Enemy | Avoidable? | Teaches |
|---|---|---|---|---|---|
| 1 | *Cutter* | Leg 1, Day 5 | One pirate cutter | No (tutorial) | The tactical plot, orders, weapons |
| 2 | *Dead Air* | Leg 2 | Two raiders hiding near a derelict | Yes, with a cautious approach | Sensors, emissions control, damage control |
| 3 | *The Line* | Finale | Convoy escorts, or an ambush (2–3 ships) | Its shape changes; it isn't skipped | Everything; capture versus destroy |

| Ship | Role | Profile |
|---|---|---|
| *Kestrel* (player) | Patrol vessel | Railgun, 8 missile cells, 2 point-defence turrets, good sensors, light armour, agile |
| Pirate cutter | Skirmisher | Small, fast, light guns, fragile |
| Raider | Ambusher | Missiles, low signature, medium hull |
| Mercenary frigate | Escort | Heavier and slower than the *Kestrel*; well crewed |

## 9. Sector map

Eight nodes for Act 1:

| Node | What's there |
|---|---|
| Fort Marrow | Navy station and home port: debriefs, resupply, refits, shore leave |
| Tamsin Colony | Mining colony; the strike |
| Kessler Gate | Jump point; traffic inspections (the *Taurus*) |
| The Shoals | Asteroid field; smugglers' haunt |
| The *Meridian* | Derelict freighter; the Leg 2 distress call |
| Halvard Deep | The Consortium's refinery |
| Outpost Seven | Navy listening post; intercepted transmissions |
| The Line | The border with the Hegemony; the finale |
