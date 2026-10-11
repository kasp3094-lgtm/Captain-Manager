# Walk-by dialog

What the crew say as you walk the ship: conversations you overhear, things people mutter on
their way somewhere, and what they say to you as you pass or when you talk to them (E).

Everything here is plain text in YAML files, one file per part of the ship. Add lines, change
them or write new files: the game picks them up when it reloads (`npm run dev` reloads by itself
when you save), and `npm run validate`
checks every one and says exactly what's wrong and where, including entries that can never
happen because the people they need are never together then and there.

| File | What's in it |
|---|---|
| `greetings.yaml` | What people say **to the captain**, by time of day, group, place and character |
| `mess.yaml` | The crew mess and the galley: food, cards, rumours |
| `bridge.yaml` | The bridge, CIC, comms and point-defence control: the watch at work |
| `engineering.yaml` | Deck 4's machinery spaces and damage-control central |
| `quarters.yaml` | Berthing, the chiefs' quarters, heads, laundry, gym and the quiet room |
| `marines.yaml` | The marines' berthing, the armory, the hangar, the brig and security patrols |
| `weapons.yaml` | The railgun room and the missile magazine |
| `officers.yaml` | The wardroom and the staterooms |
| `sickbay-and-office.yaml` | Sickbay, the ship's office and the stores |
| `passageways.yaml` | Anywhere: people on the move, and the talk that follows the crew around |

Any new `*.yaml` file in this folder is read too, so you can split files however suits you.

## An entry

```yaml
- id: mess-coffee            # unique name, lower-case words joined by dashes
  where: crew-mess           # optional: where it can happen
  who: [anyone, anyone]      # who speaks: speaker 1, speaker 2, …
  doing: [eat, leisure]      # optional: what the speakers are doing
  lines: |
    1: Who made the coffee?
    2: Engineering. They ran it through the coolant loop.
    1: Tastes like it.
```

The script under `lines: |` is one spoken line per line, each starting with the number of the
speaker in `who`. Lines show one at a time in a speech bubble over the speaker's head. Keep each
line short (under 160 characters; under 100 reads best). A line indented further than the others
carries on the line before it. Lines starting with `#` are notes to yourself and are skipped.

Quotes, apostrophes and colons need no escaping inside `lines: |`.

## Who speaks: `who`

One entry per speaker, in order. Each is one or more words, and the person must fit **all** of
them: `junior engineering` is a junior rating in engineering.

| Word | Means |
|---|---|
| `anyone` | anyone aboard |
| `officer`, `chief`, `petty-officer`, `junior`, `marine` | a group |
| `command`, `operations`, `weapons`, `engineering`, `supply`, `medical`, `marines` | a department |
| a job, e.g. `cook`, `helmsman`, `reactor-operator` | a billet id from `content/crew/billets.yaml` |
| a character, e.g. `delgado`, `kowalski` | a named character's id from `content/crew/characters.yaml` |
| `named` | any named character |

Speakers 2 and up are found in the same room as speaker 1, within a few metres, so write pairs
who would plausibly be together: a cook and a mess cook in the galley, the helmsman and the
quartermaster on the bridge. Who works where, and when, is in `content/crew/billets.yaml` and
`routine.yaml`: most jobs have one holder per watch, so two helmsmen are never on the bridge
together. If an entry can never happen, `npm run validate` says which speaker is never there.

Lines written for a named character or a job come up more often than lines for `anyone`, so
specific lines win whenever they fit.

## Where, when, doing

All three are optional; leave one out and the entry fits anywhere, any time, or doing anything
but sleeping. Each takes one value or a list: `where: [galley, crew-mess]`.

- **`where`**: a room id from the deck plans (`crew-mess`, `bridge`, `junior-berthing-a`…), a
  room type (`berthing`, `engineering`, `passage`, `command`, `habitation`, `weapons`, `stores`,
  `medical`), or a deck (`deck 4`). It's where speaker 1 is.
- **`when`**: `morning` (06:00–12:00), `afternoon` (12:00–18:00), `evening` (18:00–22:00),
  `night` (22:00–06:00), or a span on the 24-hour clock such as `23:00-00:30`.
- **`doing`**: `duty`, `patrol`, `eat`, `leisure`, `wash` or `sleep`: what speaker 1 is doing.
  Everyone else just has to be awake and in the same room. `sleep` only makes sense with
  `to: captain` (waking someone up).

## Said to the captain: `to: captain`

```yaml
- id: greet-cook
  to: captain
  who: supply
  where: [galley, crew-mess]
  lines: |
    1: You eaten, {captain}? Don't answer that, you look like you haven't.
```

Entries with `to: captain` are said to you: when you walk past someone close by and look their
way (one-speaker entries only), or when you look at someone and press E. Without `to:`, an entry is overheard: two or three
people talking among themselves, or one person muttering (who may be walking past).

`greetings.yaml` must keep a fallback that anyone can say anywhere (`who: anyone` and no where,
when or doing) and one for waking a sleeper (`doing: sleep`), so talking to anyone always gets an
answer. `npm run validate` checks.

## Names: placeholders

Names are placeholders and will change, so don't write them into lines. Write these instead:

| Placeholder | Becomes |
|---|---|
| `{captain}` | how the crew address the captain: "Captain" |
| `{ship}` | the ship's name as the crew say it: "Kestrel" |
| `{1}`, `{2}` | a speaker's rank and surname: "PO2 Barros" |
| `{1.first}`, `{1.last}`, `{1.rank}` | a speaker's first name, surname or rank |
| `{delgado}`, `{holm.last}`, `{ost.first}`… | the same for any named character, by id |

Place and story names from the design docs (Vance, Fort Marrow, the Reach, the Hegemony) are
written out as they are.

## How often

- **`weight: 3`** makes an entry three times as likely as others that fit (default 1).
- **`once: true`** plays it at most once a game: good for hints and revelations.
- Entries don't repeat for about five minutes unless nothing else fits.

## Trying a line out

Open the game with `?dialog=<id>` (for example `http://localhost:5173/?dialog=mess-coffee`):
that entry plays as soon as people who fit `who` are on your deck, ignoring where, when and
doing, and plays again after each pause. Add `&cam=crew-mess` to start in the right room and
`&time=1215` to start at lunchtime.

## Later

Story state (meters, flags, decisions) arrives in M2; entries will then be able to react to what
you've done, through conditions alongside `where` and `when`. Story events themselves are
written in Ink, under `content/events/`.
