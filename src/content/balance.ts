/** Schema for content/balance.yaml: every tunable number. For now, movement and ship's time. */
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

/** Every tunable number in the game (content/balance.yaml). */
export const BalanceSchema = z.strictObject({
  player: PlayerTuningSchema,
  time: TimeSchema,
  crew: CrewTuningSchema,
});

export type Balance = z.infer<typeof BalanceSchema>;
