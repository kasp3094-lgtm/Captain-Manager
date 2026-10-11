# Events

Missions, incidents, requests and story beats: anything where the captain decides something.
Each event is two files side by side in a folder per patrol leg:

- `<event>.yaml`: what it is, when and where it starts, and who takes part.
- `<event>.ink`: the scene itself, written in [Ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md):
  who says what, the choices, and what each choice changes.

`npm run validate` compiles every script and checks every name, room, meter and requirement in
it. The unit tests play every branch of every event to the end. The first event,
`leg1/stranded-trader`, is a worked example of everything below.

## The record

```yaml
id: stranded-trader              # unique; tests and ?event= use it
title: Mayday from the Sable Wren
type: patrol-encounter           # story, officer-arc, request, mast, incident, patrol-encounter, high-command
script: stranded-trader.ink
trigger:
  day: 0                         # optional: which day aboard (0 is the first)
  after: '08:10'                 # it becomes due at this ship's time
  room: bridge                   # it starts when the captain walks in here
  call: Captain to the bridge.   # optional: the ship-wide call when it becomes due
summon: [okafor, ashford, sethi] # named crew who go to that room and wait there
cast:                            # voices from off the ship
  varga: { name: Captain Ilse Varga, role: Master of the Sable Wren }
```

When the event falls due, the ship makes the call, an objective tells the captain where to go,
and the summoned crew walk there. The scene opens when the captain arrives. One event runs at a
time, and each happens once.

## The script

The captain never speaks: the choices are their words. A line with no `#speaker` is narration.

```ink
-> mayday

=== mayday ===
Captain on the bridge! #speaker:quartermaster
They report a dead drive coupling and a coolant leak. #speaker:ashford
"Our drive's dead and we're bleeding coolant." #speaker:varga

* [Best speed. We answer the call.]
    ~ fx("crew", 2)
    ~ fx("highCommand", -1)
    -> contact
* [Send the parts over. #cost:budget:300]
    ~ fx("budget", -300)
    -> helped
* [Have the Chief Engineer talk them through it. #req:rel.holm>=trusted]
    -> holm_asks
```

### Tags

| Tag | Where | What it does |
|---|---|---|
| `#speaker:<id>` | a line | Who says it: a named character (`okafor`), a job (`quartermaster`: whoever holds it, on duty if possible), or one of the event's `cast` |
| `#goto:<room>` | a line | After this line the panel closes and the captain must walk to the room (an objective says where); the scene goes on there |
| `#req:<requirement>` | a choice | The choice is locked, and shown greyed out with the reason, unless the requirement is met |
| `#cost:budget:<credits>` | a choice | Shows the cost and locks the choice if the budget can't pay it. Take the money with `fx("budget", -…)` in the choice |

Requirements: `budget>=300`, `readiness>=60`, `crew>=good`, `highCommand>=respected`,
`rel.delgado>=trusted`, `flag:wren_seized` or `!flag:wren_seized`. A choice that needs a flag
stays hidden until the flag is set: a secret that earlier decisions open up.

### Functions

| Function | What it does |
|---|---|
| `~ fx("crew", 2)` | Changes a meter: `budget` (credits), `readiness` (%), `crew`, `highCommand`, `fatigue`, or `rel.<character id>`. The player sees who noticed, not the number (except budget and readiness) |
| `~ flag("wren_seized")` | Remembers something for later events |
| `{has("wren_seized")}` | True if a flag is set |
| `{meter("readiness")}`, `{tier("rel.holm")}` | A meter's value, or its tier (`trusted`, `steady`…) |
| `~ summon("mensah", "hangar")` | Sends a named crew member to a room to wait for the captain |
| `{name("okafor")}`, `{last("okafor")}` | A person's rank and name, or surname: names are placeholders, so use these |
| `{ship()}` | The ship's name as the crew say it |

### Writing rules

From the design doc: every major choice trades off at least two meters, with no free wins.
Effects are small (±1–5), major (±10–20) or defining (±25 or more, plus flags). Each officer
reacts in their own voice (Act 1 spec §4).

## Trying an event out

Open the game with `?event=<id>`: the event is called at once, whatever the time. Add
`&cam=bridge` to start where it happens. In the scene, Space or Enter goes on and 1–9 pick a
choice.
