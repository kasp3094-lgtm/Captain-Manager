/**
 * Movement maths for the first-person controller. Pure functions, unit-tested in Node.
 * Babylon.js is left-handed: yaw 0 faces +z, +x is to the right, and positive pitch looks down.
 */

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface MoveKeys {
  readonly forward: boolean;
  readonly back: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly run: boolean;
}

export const ZERO: Vec2 = { x: 0, z: 0 };

/** Keep the view just short of straight up or down. */
export const MAX_PITCH = Math.PI / 2 - 0.05;

/** Unit direction on the deck for the held keys, relative to the facing (yaw, radians). */
export function wishDirection(keys: MoveKeys, yaw: number): Vec2 {
  const forward = Number(keys.forward) - Number(keys.back);
  const strafe = Number(keys.right) - Number(keys.left);
  if (forward === 0 && strafe === 0) return ZERO;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const x = forward * sin + strafe * cos;
  const z = forward * cos - strafe * sin;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

/** Moves `current` towards `target` at `rate` per second, independent of frame rate. */
export function approach(current: Vec2, target: Vec2, rate: number, dt: number): Vec2 {
  const t = 1 - Math.exp(-rate * dt);
  const next = {
    x: current.x + (target.x - current.x) * t,
    z: current.z + (target.z - current.z) * t,
  };
  // Settle exactly at rest instead of creeping forever.
  if (target.x === 0 && target.z === 0 && Math.hypot(next.x, next.z) < 0.01) return ZERO;
  return next;
}

export function clampPitch(pitch: number): number {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));
}

/** Wraps an angle into (-π, π] so yaw never grows without bound. */
export function wrapAngle(angle: number): number {
  const wrapped = angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

export function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function radians(degreesValue: number): number {
  return (degreesValue * Math.PI) / 180;
}
