/**
 * Saved games: what a save file holds, how one is made from the game's state and put back, and
 * how a save file read back is checked and brought up to date. A save holds ship's time, where
 * the captain stands, the command state (meters, relations, flags and the change log) and the
 * events (those done, and the one under way with where its script had got to). The crew aren't
 * in it: where everyone is follows from ship's time and their plan of the day, plus whoever an
 * event has sent somewhere.
 *
 * Saves are made between an event's scenes, never in the middle of one. Pure: the browser's
 * storage is in src/saveSlots.ts, and the unit tests save and load headless.
 *
 * To change what a save holds: raise SAVE_VERSION, and add a migration from the old version to
 * MIGRATIONS so that older saves still load.
 */
import { z } from 'zod';
import type { ShipClock } from './clock';
import type { Command, CommandSnapshot, Target } from './command';
import type { EventDirector, EventsSnapshot } from './events';
import { DAY } from './schedule';

export const SAVE_VERSION = 1;

/** Where the captain stands on the plan (metres) and which way they look (degrees). */
export interface CaptainPose {
  readonly deck: number;
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly pitch: number;
}

export interface SaveFile {
  readonly version: number;
  /** When it was saved, ISO 8601. */
  readonly savedAt: string;
  /** Where the captain was, as the list of saves shows it: "Bridge". */
  readonly place: string;
  /** The run's random seed. */
  readonly seed: number;
  readonly clock: { readonly day: number; readonly minute: number };
  readonly captain: CaptainPose;
  readonly command: CommandSnapshot;
  readonly events: EventsSnapshot;
}

const SaveSchema: z.ZodType<SaveFile> = z.strictObject({
  version: z.literal(SAVE_VERSION),
  savedAt: z.iso.datetime(),
  place: z.string(),
  seed: z.number().int(),
  clock: z.strictObject({
    day: z.number().int().min(0),
    minute: z.number().min(0).lt(DAY),
  }),
  captain: z.strictObject({
    deck: z.number().int(),
    x: z.number(),
    y: z.number(),
    yaw: z.number(),
    pitch: z.number(),
  }),
  command: z.strictObject({
    values: z.record(z.string(), z.number()),
    flags: z.array(z.string()),
    log: z.array(
      z.strictObject({
        target: z.custom<Target>((value) => typeof value === 'string' && value.length > 0),
        amount: z.number(),
        before: z.number(),
        after: z.number(),
        cause: z.string(),
      }),
    ),
  }),
  events: z.strictObject({
    done: z.array(z.string()),
    active: z
      .strictObject({
        id: z.string(),
        status: z.enum(['called', 'away']),
        room: z.string(),
        story: z.string().nullable(),
        script: z.string(),
        logStart: z.number().int().min(0),
        summoned: z.array(z.tuple([z.string(), z.string()])),
      })
      .nullable(),
  }),
});

/** Turns a save of one version into a save of the next. */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[n] brings a version n save up to version n + 1. None yet: version 1 is the first. */
const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export type ReadResult = { readonly save: SaveFile } | { readonly error: string };

/** Reads a save file as stored (JSON text). */
export function parseSave(text: string): ReadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'not a save file' };
  }
  return readSave(raw);
}

/** Checks a save file, bringing an older one up to date first. */
export function readSave(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): ReadResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { error: 'not a save file' };
  }
  let data = raw as Record<string, unknown>;
  let version = data['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { error: 'not a save file' };
  }
  if (version > SAVE_VERSION) return { error: 'made by a newer version of the game' };
  while (version < SAVE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) return { error: `version ${version} saves can no longer be loaded` };
    version += 1;
    data = { ...migrate(data), version };
  }
  const parsed = SaveSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: `damaged (${issue ? `${issue.path.join('.')}: ${issue.message}` : 'unknown'})`,
    };
  }
  return { save: parsed.data };
}

/** The parts of the game's state a save comes from and goes back into. */
export interface SaveParts {
  readonly clock: ShipClock;
  readonly command: Command;
  readonly events: EventDirector;
}

/** Makes a save of the game as it stands. Not in the middle of a scene (`events.inScene`). */
export function takeSave(
  parts: SaveParts,
  about: {
    readonly savedAt: Date;
    readonly place: string;
    readonly seed: number;
    readonly captain: CaptainPose;
  },
): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: about.savedAt.toISOString(),
    place: about.place,
    seed: about.seed,
    clock: { day: parts.clock.day, minute: parts.clock.minute },
    captain: { ...about.captain },
    command: parts.command.snapshot(),
    events: parts.events.snapshot(),
  };
}

/**
 * Puts a save back: ship's time, the command state and the events. The game puts the captain
 * where the save says and the crew where ship's time does.
 */
export function applySave(save: SaveFile, parts: SaveParts): void {
  parts.clock.day = save.clock.day;
  parts.clock.minute = save.clock.minute;
  parts.command.restore(save.command);
  parts.events.restore(save.events);
}
