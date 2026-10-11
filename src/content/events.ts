/**
 * Schema for the events in content/events/: each is a small YAML record (what it is, when and
 * where it starts, who takes part) next to an Ink script with the story and the choices (tech plan
 * §3). How to write them: content/events/README.md. src/sim/narrative.ts plays the scripts and
 * src/sim/events.ts decides when each event starts.
 */
import { z } from 'zod';

const Id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lower-case words joined by dashes');
/** A time of day, 24-hour clock. */
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like "08:10"');

/** Kinds of event (design doc §7). */
export const EVENT_TYPES = [
  'story',
  'officer-arc',
  'request',
  'mast',
  'incident',
  'patrol-encounter',
  'high-command',
] as const;

export const EventSchema = z.strictObject({
  /** Unique; how saves, tests and `?event=` refer to it. */
  id: Id,
  /** As the log and the outcome card show it. */
  title: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  /** The Ink script, next to this file. */
  script: z.string().regex(/^[a-z0-9-]+\.ink$/, 'a file name like stranded-trader.ink'),
  /** When and where it starts. */
  trigger: z.strictObject({
    /** The day aboard (0 is the first); any day if left out. */
    day: z.number().int().min(0).optional(),
    /** It becomes due at this ship's time. */
    after: Time,
    /** Where it plays: it starts when the captain walks in. */
    room: Id,
    /** The ship-wide call when it becomes due, e.g. "Captain to the bridge." */
    call: z.string().min(1).optional(),
  }),
  /** Crew (character ids) who go to the room when the call goes out, and wait there. */
  summon: z.array(Id).default([]),
  /** Voices from off the ship, by the id `#speaker:` uses. */
  cast: z
    .record(Id, z.strictObject({ name: z.string().min(1), role: z.string().min(1) }))
    .default({}),
});

export type EventData = z.infer<typeof EventSchema>;
