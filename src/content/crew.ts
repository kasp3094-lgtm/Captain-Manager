/**
 * Schemas and types for the crew files in content/crew/: billets.yaml (every job aboard and how
 * many people hold it), characters.yaml (the named crew), names.yaml (names for everyone else)
 * and routine.yaml (how the day is spent: watches, meals, where each group sleeps, eats and
 * relaxes). src/sim/crew.ts builds the roster from them and src/sim/schedule.ts the day.
 */
import { z } from 'zod';

/** Who someone is aboard; decides where they sleep, eat and wash. */
export const GROUPS = ['officer', 'chief', 'petty-officer', 'junior', 'marine'] as const;

/** Departments; each wears its own uniform colour. */
export const DEPARTMENTS = [
  'command',
  'operations',
  'weapons',
  'engineering',
  'supply',
  'medical',
  'marines',
] as const;

export const HAIR_COLOURS = ['black', 'dark-brown', 'brown', 'auburn', 'blonde', 'grey'] as const;
export const HAIR_STYLES = ['short', 'buzz', 'long', 'bun', 'ponytail', 'curly', 'bald'] as const;
/** Something worn over the uniform. */
export const WEAR = ['apron', 'coat', 'beret', 'cap', 'headset', 'glasses'] as const;

const Id = z.string().regex(/^[a-z0-9-]+$/, 'use lower-case letters, digits and dashes');
/** A time of day, 24-hour clock. */
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'a time like "08:00"');
const Span = z.tuple([Time, Time]);

const BilletSchema = z.strictObject({
  id: Id,
  /** The job as the crew would say it, e.g. Helmsman. */
  title: z.string().min(1),
  department: z.enum(DEPARTMENTS),
  group: z.enum(GROUPS),
  count: z.number().int().positive(),
  /**
   * `rotating`: spread evenly over watch sections A, B and C (see routine.yaml).
   * `day`: works days, sleeps at night. A, B or C: always that section.
   */
  watch: z.enum(['rotating', 'day', 'A', 'B', 'C']),
  /** Where they work: a room id from the deck plans. */
  station: Id,
  /** What they use there (a furniture kind, e.g. helm or range); any free work spot if absent. */
  post: z.string().min(1).optional(),
  /** Rooms they make rounds of while on duty, instead of staying at their station. */
  patrol: z.array(Id).min(2).optional(),
  /** Working hours for day workers, if not routine.yaml's dayWork. */
  hours: z.array(Span).min(1).optional(),
  /** Ranks a generated holder can have, e.g. [PO3, PO2]. */
  ranks: z.array(z.string().min(1)).min(1),
  /** Something they wear on duty, e.g. apron. */
  wear: z.enum(WEAR).optional(),
});

export const BilletsSchema = z.strictObject({
  /** Everyone who isn't a named character is generated from this seed: same crew every game. */
  seed: z.number().int(),
  billets: z.array(BilletSchema).min(1),
});

const LookSchema = z.strictObject({
  /** 0 (lightest) to 5 (darkest). */
  skin: z.number().int().min(0).max(5).optional(),
  hair: z.enum(HAIR_COLOURS).optional(),
  style: z.enum(HAIR_STYLES).optional(),
  /** 1 is average. */
  height: z.number().min(0.88).max(1.12).optional(),
  build: z.number().min(0.85).max(1.3).optional(),
  beard: z.boolean().optional(),
  wear: z.enum(WEAR).optional(),
});

const CharacterSchema = z.strictObject({
  /** Used in dialog files to make this character speak, e.g. `who: [delgado]`. */
  id: Id,
  /** Given name then family name. */
  name: z.string().regex(/^\S+( \S+)+$/, 'given name then family name'),
  rank: z.string().min(1),
  billet: Id,
  /** Their watch section, if their billet rotates. */
  section: z.enum(['A', 'B', 'C']).optional(),
  /** A room to sleep in, e.g. xo-cabin; otherwise a rack in their group's berthing. */
  berth: Id.optional(),
  look: LookSchema.optional(),
  /** Who they are, for writers. Not shown in the game. */
  note: z.string().optional(),
});

export const CharactersSchema = z.strictObject({
  characters: z.array(CharacterSchema),
});

export const NamesSchema = z.strictObject({
  given: z.array(z.string().min(1)).min(20),
  family: z.array(z.string().min(1)).min(20),
});

const Activity = z.enum(['duty', 'sleep', 'off']);
const GroupRooms = z.strictObject({
  officer: Id,
  chief: Id,
  'petty-officer': Id,
  junior: Id,
  marine: Id,
});
const GroupRoomLists = z.strictObject({
  officer: z.array(Id).min(1),
  chief: z.array(Id).min(1),
  'petty-officer': z.array(Id).min(1),
  junior: z.array(Id).min(1),
  marine: z.array(Id).min(1),
});
/** Room id (or `berthing`, their own) → how likely they go there. */
const Weights = z.record(z.string().regex(/^[a-z0-9-]+$/), z.number().positive());

export const RoutineSchema = z.strictObject({
  /** The watch bill: what each section does in each part of the day. Must cover the day. */
  watches: z
    .array(z.strictObject({ from: Time, to: Time, A: Activity, B: Activity, C: Activity }))
    .min(1),
  /** Day workers' hours, unless their billet says otherwise. */
  dayWork: z.array(Span).min(1),
  /** When day workers sleep. */
  daySleep: Span,
  meals: z.record(z.string(), Span),
  berthing: GroupRoomLists,
  mess: GroupRooms,
  heads: GroupRooms,
  leisure: z.strictObject({
    officer: Weights,
    chief: Weights,
    'petty-officer': Weights,
    junior: Weights,
    marine: Weights,
  }),
});

export type Group = (typeof GROUPS)[number];
export type Department = (typeof DEPARTMENTS)[number];
export type HairColour = (typeof HAIR_COLOURS)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type Wear = (typeof WEAR)[number];
export type Billet = z.infer<typeof BilletSchema>;
export type Billets = z.infer<typeof BilletsSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Characters = z.infer<typeof CharactersSchema>;
export type Names = z.infer<typeof NamesSchema>;
export type Routine = z.infer<typeof RoutineSchema>;

/** Everything in content/crew/. */
export interface CrewContent {
  readonly billets: Billets;
  readonly characters: Characters;
  readonly names: Names;
  readonly routine: Routine;
}

/** "08:30" → minutes after midnight. */
export function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (mins ?? 0);
}
