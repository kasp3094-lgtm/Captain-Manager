/**
 * Schema for content/balance.yaml: every tunable number. Movement, ship's time, the crew's
 * walking, and where the captain's command meters start.
 */
import { z } from 'zod';

/** How the captain moves and looks around. Units are metres, seconds, radians and degrees. */
const PlayerTuningSchema = z
  .strictObject({
    walkSpeed: z.number().positive().max(10),
    runMultiplier: z.number().min(1).max(3),
    acceleration: z.number().positive(),
    eyeHeight: z.number().min(1).max(2.2),
    bodyHeight: z.number().min(1).max(2.2),
    radius: z.number().min(0.1).max(0.6),
    mouseSensitivity: z.number().positive().max(0.02),
    fieldOfView: z.number().min(50).max(110),
  })
  .refine((player) => player.eyeHeight <= player.bodyHeight, {
    message: 'eyeHeight must not exceed bodyHeight',
    path: ['eyeHeight'],
  });

export type PlayerTuning = z.infer<typeof PlayerTuningSchema>;

/** How ship's time runs while you walk the ship. */
const TimeSchema = z.strictObject({
  /** The time the game starts at, 24-hour clock. */
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like "07:50"'),
  /** Ship minutes per real second. */
  minutesPerSecond: z.number().min(0).max(60),
});

/** How the crew walk. */
const CrewTuningSchema = z.strictObject({
  /** Metres per second; each person walks a little faster or slower. */
  walkSpeed: z.number().positive().max(4),
  /** Seconds to climb one deck by ladder (out of sight). */
  climbSeconds: z.number().min(0).max(30),
});

/** Where the command meters start (design doc §5). */
const CommandStartSchema = z.strictObject({
  budget: z.number().int().min(0),
  readiness: z.number().min(0).max(100),
  crew: z.number().min(0).max(100),
  highCommand: z.number().min(-100).max(100),
  fatigue: z.number().min(0).max(100),
  /** By character id (content/crew/characters.yaml); everyone else starts at 0. */
  relations: z.record(z.string(), z.number().min(-100).max(100)).default({}),
});

/** Every tunable number in the game (content/balance.yaml). */
export const BalanceSchema = z.strictObject({
  player: PlayerTuningSchema,
  time: TimeSchema,
  crew: CrewTuningSchema,
  command: CommandStartSchema,
});

export type Balance = z.infer<typeof BalanceSchema>;
