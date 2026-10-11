import { describe, expect, it } from 'vitest';
import {
  MAX_PITCH,
  ZERO,
  approach,
  clampPitch,
  wishDirection,
  wrapAngle,
  type MoveKeys,
} from '../../src/world/player/movement';

const none: MoveKeys = { forward: false, back: false, left: false, right: false, run: false };

describe('wishDirection', () => {
  it('is zero with no keys, or with opposing keys', () => {
    expect(wishDirection(none, 1)).toEqual(ZERO);
    expect(wishDirection({ ...none, forward: true, back: true }, 1)).toEqual(ZERO);
  });

  it('walks forward along +z at yaw 0, and along +x at yaw 90°', () => {
    const ahead = wishDirection({ ...none, forward: true }, 0);
    expect(ahead.x).toBeCloseTo(0);
    expect(ahead.z).toBeCloseTo(1);
    const turned = wishDirection({ ...none, forward: true }, Math.PI / 2);
    expect(turned.x).toBeCloseTo(1);
    expect(turned.z).toBeCloseTo(0);
  });

  it('strafes right towards +x at yaw 0', () => {
    const right = wishDirection({ ...none, right: true }, 0);
    expect(right.x).toBeCloseTo(1);
    expect(right.z).toBeCloseTo(0);
  });

  it('is never faster diagonally', () => {
    const diagonal = wishDirection({ ...none, forward: true, left: true }, 0.7);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
  });
});

describe('approach', () => {
  it('reaches the same point at 30 and 120 frames per second', () => {
    const target = { x: 3, z: 0 };
    let slow = ZERO;
    let fast = ZERO;
    for (let i = 0; i < 15; i++) slow = approach(slow, target, 10, 1 / 30);
    for (let i = 0; i < 60; i++) fast = approach(fast, target, 10, 1 / 120);
    expect(slow.x).toBeCloseTo(fast.x, 6);
  });

  it('comes to a complete stop', () => {
    let velocity = { x: 3, z: 0 };
    for (let i = 0; i < 120; i++) velocity = approach(velocity, ZERO, 10, 1 / 60);
    expect(velocity).toBe(ZERO);
  });
});

describe('angles', () => {
  it('clamps pitch short of straight up and down', () => {
    expect(clampPitch(10)).toBe(MAX_PITCH);
    expect(clampPitch(-10)).toBe(-MAX_PITCH);
    expect(clampPitch(0.3)).toBe(0.3);
  });

  it('wraps yaw into (-π, π]', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBe(Math.PI);
    expect(wrapAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5);
  });
});
