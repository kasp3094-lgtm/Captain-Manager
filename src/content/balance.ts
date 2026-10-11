/** Schema for content/balance.yaml: every tunable number. For now, how the captain moves. */
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

/** Every tunable number in the game (content/balance.yaml). */
export const BalanceSchema = z.strictObject({
  player: PlayerTuningSchema,
});

export type Balance = z.infer<typeof BalanceSchema>;
