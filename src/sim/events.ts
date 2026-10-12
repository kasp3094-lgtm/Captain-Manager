/**
 * When events happen. An event waits for its time (trigger.day and trigger.after), then the ship
 * calls the captain ("Captain to the bridge.") and the crew it needs head there. It starts when
 * the captain walks into its room; a `#goto` in the script sends the captain somewhere else
 * before it goes on; when the script ends, it's done for good. One event at a time. Between
 * scenes, where things stand can be saved and restored (src/sim/save.ts).
 *
 * Pure: the game reads `active` to show the call, the objective and the dialogue.
 */
import { minutes, type CrewContent } from '../content/crew';
import type { EventData } from '../content/events';
import type { Ship } from '../content/ship';
import {
  METERS,
  parseRequirement,
  tierStart,
  type Change,
  type Command,
  type Target,
} from './command';
import { hash } from './crew';
import { Narrative, type NarrativeHost } from './narrative';

/** An event as the game runs it: its record, its compiled script and the file it came from. */
export interface GameEvent extends EventData {
  /** The compiled Ink, as JSON. */
  readonly story: string;
  readonly file: string;
}

/**
 * - `called`: due; the captain has been called to its room.
 * - `playing`: the captain is there and the script is running.
 * - `away`: the script sent the captain to another room.
 * - `done`: finished; it won't happen again.
 */
export type EventStatus = 'called' | 'playing' | 'away' | 'done';

export interface ActiveEvent {
  readonly event: GameEvent;
  status: EventStatus;
  /** The room the captain must get to, while called or away. */
  room: string;
  /** Set while the script runs. */
  narrative: Narrative | null;
  /** Where the log was when it started, to sum up what it changed. */
  readonly logStart: number;
  /** Crew sent to rooms for it (id → room), to let go when it ends. */
  readonly summoned: Map<string, string>;
}

/** The events as a save file keeps them (src/sim/save.ts). */
export interface EventsSnapshot {
  /** Every event already done, by id. */
  readonly done: readonly string[];
  /** The event under way. Saves are made between its scenes, never in the middle of one. */
  readonly active: {
    readonly id: string;
    readonly status: 'called' | 'away';
    readonly room: string;
    /** Where the script had got to, in Ink's own format; null before its first scene. */
    readonly story: string | null;
    /** A fingerprint of the compiled script, to tell whether it changed since the save. */
    readonly script: string;
    readonly logStart: number;
    /** Crew sent to rooms for it, as [id, room]. */
    readonly summoned: readonly (readonly [string, string])[];
  } | null;
}

/** What the game hears from the director this frame. */
export type EventSignal =
  | { readonly kind: 'call'; readonly event: GameEvent; readonly text: string | null }
  | { readonly kind: 'start'; readonly event: GameEvent }
  | { readonly kind: 'resume'; readonly event: GameEvent };

export class EventDirector {
  active: ActiveEvent | null = null;
  private readonly done = new Set<string>();

  constructor(
    private readonly events: readonly GameEvent[],
    private readonly command: Command,
    /** Builds what a script needs for an event (speakers, summons…). */
    private readonly host: (event: GameEvent) => NarrativeHost,
  ) {}

  /**
   * Moves things on: calls the captain when an event falls due, and starts or resumes it when the
   * captain is in its room. `room` is where the captain is (a room id, or null in a shaft).
   */
  update(day: number, minute: number, room: string | null): EventSignal[] {
    const signals: EventSignal[] = [];
    if (!this.active) {
      const due = this.events.find(
        (event) =>
          !this.done.has(event.id) &&
          (event.trigger.day === undefined || event.trigger.day === day) &&
          minute >= minutes(event.trigger.after),
      );
      if (due) signals.push(this.call(due));
    }
    const active = this.active;
    if (
      active &&
      (active.status === 'called' || active.status === 'away') &&
      room === active.room
    ) {
      const resuming = active.status === 'away';
      active.status = 'playing';
      active.narrative ??= new Narrative(active.event.story, this.hostFor(active));
      signals.push({ kind: resuming ? 'resume' : 'start', event: active.event });
    }
    return signals;
  }

  /** Calls an event now, whatever the time (`?event=`). False if there's no such event. */
  force(id: string): EventSignal | null {
    const event = this.events.find((candidate) => candidate.id === id);
    if (!event || this.active) return null;
    return this.call(event);
  }

  /** The script sent the captain to a room: wait for them there. */
  away(room: string): void {
    if (!this.active) return;
    this.active.status = 'away';
    this.active.room = room;
  }

  /** The script ended: what it changed, for the outcome card. */
  finish(): Change[] {
    const active = this.active;
    if (!active) return [];
    this.done.add(active.event.id);
    this.active = null;
    return this.command.log.slice(active.logStart);
  }

  /** Every event that has happened, for saves and tests. */
  get finished(): ReadonlySet<string> {
    return this.done;
  }

  /** True while a scene is playing: the game can't be saved until it ends or moves on. */
  get inScene(): boolean {
    return this.active?.status === 'playing';
  }

  /** Where things stand, for a save file. Not in the middle of a scene (see `inScene`). */
  snapshot(): EventsSnapshot {
    const active = this.active;
    if (active?.status === 'playing') throw new Error("Can't save in the middle of a scene");
    return {
      done: [...this.done],
      active: active && {
        id: active.event.id,
        status: active.status as 'called' | 'away',
        room: active.room,
        story: active.narrative?.save() ?? null,
        script: fingerprint(active.event.story),
        logStart: active.logStart,
        summoned: [...active.summoned],
      },
    };
  }

  /**
   * Puts saved events back; restore the command state first. An event the game no longer has
   * is dropped. If the event's script has changed since the save (a newer version of the game),
   * or its saved place in the script can't be read, the event starts over from its call.
   */
  restore(saved: EventsSnapshot): void {
    this.done.clear();
    for (const id of saved.done) this.done.add(id);
    this.active = null;
    const at = saved.active;
    const event = at && this.events.find((candidate) => candidate.id === at.id);
    if (!at || !event) return;
    const active: ActiveEvent = {
      event,
      status: at.status,
      room: at.room,
      narrative: null,
      logStart: Math.min(at.logStart, this.command.log.length),
      summoned: new Map(at.summoned),
    };
    this.active = active;
    if (at.story === null) return;
    if (at.script === fingerprint(event.story)) {
      const narrative = new Narrative(event.story, this.hostFor(active));
      try {
        narrative.load(at.story);
        active.narrative = narrative;
        return;
      } catch {
        // Unreadable: start over, below.
      }
    }
    active.status = 'called';
    active.room = event.trigger.room;
    active.summoned.clear();
    for (const who of event.summon) active.summoned.set(who, event.trigger.room);
  }

  private call(event: GameEvent): EventSignal {
    this.active = {
      event,
      status: 'called',
      room: event.trigger.room,
      narrative: null,
      logStart: this.command.log.length,
      summoned: new Map(event.summon.map((who) => [who, event.trigger.room])),
    };
    return { kind: 'call', event, text: event.trigger.call ?? null };
  }

  /** What the script needs, noting whoever it summons so they can be let go at the end. */
  private hostFor(active: ActiveEvent): NarrativeHost {
    const host = this.host(active.event);
    return {
      ...host,
      summon: (who, room) => {
        active.summoned.set(who, room);
        host.summon(who, room);
      },
    };
  }
}

/** A short fingerprint of a compiled script. */
function fingerprint(story: string): string {
  return hash(story).toString(16);
}

/**
 * Checks an event's script against the rest of the content, as sentences: every speaker,
 * room, meter, requirement and summoned crew member must exist. The script must also compile
 * (src/content/ink.ts); the unit tests play every branch.
 */
export function checkEventScript(
  event: EventData,
  file: string,
  source: string,
  ship: Ship,
  crew: CrewContent,
): string[] {
  const problems: string[] = [];
  const say = (message: string) => problems.push(`${file}: ${message}`);
  const characters = new Set(crew.characters.characters.map((character) => character.id));
  const billets = new Set(crew.billets.billets.map((billet) => billet.id));
  const rooms = new Set(ship.decks.flatMap((deck) => deck.rooms.map((room) => room.id)));
  const speakers = new Set([...characters, ...billets, ...Object.keys(event.cast)]);
  const targets = new Set<string>([...METERS, ...[...characters].map((id) => `rel.${id}`)]);

  if (!rooms.has(event.trigger.room)) say(`trigger.room: there is no room "${event.trigger.room}"`);
  for (const who of event.summon) {
    if (!characters.has(who)) say(`summon: "${who}" is not a named character`);
  }
  for (const id of Object.keys(event.cast)) {
    if (characters.has(id) || billets.has(id)) say(`cast: "${id}" is already a character or a job`);
  }

  source.split('\n').forEach((line, i) => {
    const at = (message: string) => say(`line ${i + 1}: ${message}`);
    for (const [, name, value] of line.matchAll(/#\s*(speaker|goto|req|cost)\s*:\s*([^#\]]+)/g)) {
      const tag = value!.trim();
      if (name === 'speaker' && !speakers.has(tag)) {
        at(`#speaker:${tag}: not a character id, a job (billet id) or one of the event's cast`);
      } else if (name === 'goto' && !rooms.has(tag)) {
        at(`#goto:${tag}: there is no room "${tag}"`);
      } else if (name === 'cost' && !/^budget:\d+$/.test(tag)) {
        at(`#cost:${tag}: write it as #cost:budget:<credits>`);
      } else if (name === 'req') {
        const requirement = parseRequirement(tag);
        if (!requirement)
          at(`#req:${tag}: write it like rel.holm>=trusted, budget>=300 or flag:boarded`);
        else if (requirement.kind === 'meter') {
          if (!targets.has(requirement.target))
            at(`#req:${tag}: no meter or relation "${requirement.target}"`);
          else if (
            typeof requirement.value === 'string' &&
            tierStart(requirement.target as Target, requirement.value) === null
          ) {
            at(`#req:${tag}: "${requirement.value}" is not a tier of ${requirement.target}`);
          }
        }
      }
    }
    for (const [, target] of line.matchAll(/\bfx\(\s*"([^"]*)"/g)) {
      if (!targets.has(target!))
        at(`fx("${target}"): use ${METERS.join(', ')} or rel.<character id>`);
    }
    for (const [, who, room] of line.matchAll(/\bsummon\(\s*"([^"]*)"\s*,\s*"([^"]*)"/g)) {
      if (!characters.has(who!)) at(`summon("${who}"): not a named character`);
      if (!rooms.has(room!)) at(`summon(…, "${room}"): there is no room "${room}"`);
    }
    for (const [, who] of line.matchAll(/\b(?:name|last)\(\s*"([^"]*)"/g)) {
      if (!speakers.has(who!)) at(`name("${who}"): not a character id, a job or one of the cast`);
    }
  });
  return problems;
}
