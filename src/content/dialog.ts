/**
 * Schema for the walk-by dialog in content/dialog/*.yaml: short conversations the crew have
 * among themselves, and things they say to the captain. Each file is a list of entries; the
 * format is explained for writers in content/dialog/README.md. src/sim/dialog.ts reads the
 * scripts and decides which entries fit the people and the moment.
 */
import { z } from 'zod';

/** What someone can be doing (src/sim/schedule.ts), for `doing:`. */
export const ACTIVITIES = ['duty', 'patrol', 'sleep', 'wash', 'eat', 'leisure'] as const;

/** Times of day for `when:`, besides spans such as 22:00-02:00. */
export const TIMES_OF_DAY = {
  morning: ['06:00', '12:00'],
  afternoon: ['12:00', '18:00'],
  evening: ['18:00', '22:00'],
  night: ['22:00', '06:00'],
} as const;

/** One value or a list of them: `where: crew-mess` or `where: [crew-mess, galley]`. */
function oneOrMore<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.array(schema).min(1)]);
}

const Word = z.string().trim().min(1);

export const DialogEntrySchema = z.strictObject({
  /** Unique across every dialog file; lower-case words joined by dashes. */
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lower-case words joined by dashes'),
  /**
   * Who speaks, in order: speaker 1, speaker 2… Each is one or more words that must all fit the
   * person: `anyone`, a group, a department, a job (billet id) or a named character's id.
   */
  who: oneOrMore(Word),
  /** Where: room ids, room types (berthing, engineering…) or `deck 2`. Anywhere if left out. */
  where: oneOrMore(Word).optional(),
  /** When: morning, afternoon, evening, night, or a span like 22:00-02:00. Any time if left out. */
  when: oneOrMore(Word).optional(),
  /** What the speakers are doing (all of them). Anything but sleep if left out. */
  doing: oneOrMore(z.enum(ACTIVITIES)).optional(),
  /** `captain`: said to the captain, as they pass close by or talk to the speaker (E). */
  to: z.literal('captain').optional(),
  /** How often it comes up, against the other entries that fit at the time (default 1). */
  weight: z.number().positive().max(100).optional(),
  /** True: said at most once a game. */
  once: z.boolean().optional(),
  /** The script: one spoken line per line, each starting with the speaker's number ("1: Hi."). */
  lines: z.string().trim().min(1),
});

export const DialogFileSchema = z.array(DialogEntrySchema);

export type DialogEntryData = z.infer<typeof DialogEntrySchema>;
export type DialogFile = z.infer<typeof DialogFileSchema>;
