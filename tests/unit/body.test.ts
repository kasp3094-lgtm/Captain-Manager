import { describe, expect, it } from 'vitest';
import type { Look } from '../../src/sim/crew';
import {
  IDENTITY,
  apply,
  compose,
  emitBody,
  paletteFor,
  rotY,
  translate,
  type BodyState,
  type Pose,
  type Vec3,
} from '../../src/world/crew/body';

const LOOK: Look = {
  skin: 2,
  hair: 'brown',
  style: 'short',
  height: 1,
  build: 1,
  beard: false,
  wear: null,
};

function state(pose: Pose, overrides: Partial<BodyState> = {}): BodyState {
  return {
    look: LOOK,
    group: 'junior',
    palette: paletteFor(LOOK, 'junior', 'operations'),
    pose,
    phase: 0,
    time: 0,
    seat: 0,
    ...overrides,
  };
}

/** Every box's corners, in the frame the body was placed by. */
function corners(body: BodyState, root = IDENTITY): Vec3[] {
  const points: Vec3[] = [];
  emitBody(body, root, ([sx, sy, sz], frame) => {
    for (const x of [-sx / 2, sx / 2]) {
      for (const y of [-sy / 2, sy / 2]) {
        for (const z of [-sz / 2, sz / 2]) points.push(apply(frame, [x, y, z]));
      }
    }
  });
  return points;
}

const lowest = (points: Vec3[]) => Math.min(...points.map((p) => p[1]));
const highest = (points: Vec3[]) => Math.max(...points.map((p) => p[1]));

describe('crew bodies', () => {
  it('stand on the deck, about 1.8 m tall', () => {
    const points = corners(state('stand'));
    expect(lowest(points)).toBeGreaterThan(-0.03);
    expect(lowest(points)).toBeLessThan(0.03);
    expect(highest(points)).toBeGreaterThan(1.7);
    expect(highest(points)).toBeLessThan(1.9);
  });

  it('scale with their height', () => {
    const tall = corners(state('stand', { look: { ...LOOK, height: 1.1 } }));
    expect(highest(tall)).toBeGreaterThan(highest(corners(state('stand'))) + 0.12);
  });

  it('sit on the seat with their feet on the deck', () => {
    const points = corners(state('sit', { seat: 0.49 }));
    expect(lowest(points)).toBeGreaterThan(-0.05);
    expect(lowest(points)).toBeLessThan(0.08);
    // About a hip height lower than standing.
    expect(highest(points)).toBeLessThan(1.55);
    expect(highest(points)).toBeGreaterThan(1.3);
  });

  it('lie flat on their mattress, head the way they face', () => {
    const points = corners(state('lie'));
    expect(lowest(points)).toBeGreaterThan(-0.06);
    expect(highest(points)).toBeLessThan(0.36);
    const zs = points.map((p) => p[2]);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(1.6);
    // The head (the top of the body) is at the +z end.
    const head: Vec3[] = [];
    const body = state('lie');
    emitBody(body, IDENTITY, (size, frame, colour) => {
      if (colour === body.palette.skin && size[0] > 0.15) head.push(frame.t);
    });
    expect(head[0]![2]).toBeGreaterThan(0.6);
  });

  it('swing their legs as they walk', () => {
    const feet = (phase: number) => {
      const boots: Vec3[] = [];
      const body = state('walk', { phase });
      emitBody(body, IDENTITY, (_size, frame, colour) => {
        if (colour === body.palette.boots && frame.t[1] < 0.3) boots.push(frame.t);
      });
      return boots;
    };
    const [left, right] = feet(Math.PI / 2);
    expect(Math.abs(left![2] - right![2])).toBeGreaterThan(0.3);
    const [left2, right2] = feet(-Math.PI / 2);
    expect(Math.sign(left2![2] - right2![2])).toBe(-Math.sign(left![2] - right![2]));
  });

  it('are placed and turned by the root frame', () => {
    const root = compose(translate(10, 2, -3), rotY(Math.PI / 2));
    const points = corners(state('stand'), root);
    const xs = points.map((p) => p[0]);
    expect(Math.min(...xs)).toBeGreaterThan(9.5);
    expect(Math.max(...xs)).toBeLessThan(10.5);
    expect(lowest(points)).toBeCloseTo(2, 1);
  });

  it('wear their department colour', () => {
    const marine = paletteFor(LOOK, 'marine', 'marines');
    const engineer = paletteFor(LOOK, 'junior', 'engineering');
    expect(marine.top).not.toEqual(engineer.top);
  });
});
