/**
 * How the deck plans map onto the 3D world, the ship's standard heights, and rectangle maths on
 * the plan. Pure numbers, shared by the layout planner, its tests and the 3D builder.
 *
 * Plan: metres from above, x from the bow towards the stern, y from starboard to port.
 * World (Babylon.js, left-handed): x = plan x, z = -plan y, y up. Yaw 0 looks along +z, which is
 * the plan's -y (to starboard, the top of the map); yaw 90° looks aft. On the map the captain's
 * arrow turns by the same angle, clockwise.
 */
import type { Facing, Point, Rect } from '../../content/ship';

/** Floor to floor, in metres. */
export const DECK_HEIGHT = 3.2;
/** Floor to overhead inside rooms. */
export const ROOM_HEIGHT = 2.6;
/** Each room's walls stand this far inside its rectangle, so neighbours share a 0.2 m bulkhead. */
export const WALL = 0.1;
/** Doors and hatches: clear width and height. */
export const DOOR_WIDTH = 1.0;
export const DOOR_HEIGHT = 2.0;
/** The opening into a ladderwell or the lift. */
export const SHAFT_OPENING_WIDTH = 1.2;

const EPSILON = 1e-6;

/** Height of a deck's floor above the lowest deck's. Deck 1 is the top deck. */
export function floorHeight(deck: number, lowestDeck: number): number {
  return (lowestDeck - deck) * DECK_HEIGHT;
}

/**
 * Unit step on the plan towards a side: fwd is -x, aft +x, stbd -y, port +y. Also the way out
 * of a space through its wall on that side.
 */
export function direction(facing: Facing): Point {
  switch (facing) {
    case 'fwd':
      return [-1, 0];
    case 'aft':
      return [1, 0];
    case 'stbd':
      return [0, -1];
    case 'port':
      return [0, 1];
  }
}

export function opposite(facing: Facing): Facing {
  switch (facing) {
    case 'fwd':
      return 'aft';
    case 'aft':
      return 'fwd';
    case 'stbd':
      return 'port';
    case 'port':
      return 'stbd';
  }
}

/** Yaw in degrees for looking along a plan direction (dx, dy). */
export function yawTowards(dx: number, dy: number): number {
  return (Math.atan2(dx, -dy) * 180) / Math.PI;
}

/** Yaw in degrees for a facing: stbd 0, aft 90, port 180, fwd -90. */
export function facingYaw(facing: Facing): number {
  const [dx, dy] = direction(facing);
  return yawTowards(dx, dy);
}

/** True for fwd and aft: something facing along the ship spreads its width across it (along y). */
export function isLengthwise(facing: Facing): boolean {
  return facing === 'fwd' || facing === 'aft';
}

// ---- Rectangles on the plan -------------------------------------------------------------------

/** An axis-aligned box on the plan, by its min and max corners. */
export interface Area {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function toArea([x, y, width, depth]: Rect): Area {
  return { x0: x, y0: y, x1: x + width, y1: y + depth };
}

export function inset(area: Area, by: number): Area {
  return { x0: area.x0 + by, y0: area.y0 + by, x1: area.x1 - by, y1: area.y1 - by };
}

export function centre(area: Area): Point {
  return [(area.x0 + area.x1) / 2, (area.y0 + area.y1) / 2];
}

export function areaContains(area: Area, x: number, y: number): boolean {
  return (
    x >= area.x0 - EPSILON &&
    x <= area.x1 + EPSILON &&
    y >= area.y0 - EPSILON &&
    y <= area.y1 + EPSILON
  );
}

/** True when `inner` lies inside `outer`. */
export function areaInside(inner: Area, outer: Area): boolean {
  return (
    inner.x0 >= outer.x0 - EPSILON &&
    inner.y0 >= outer.y0 - EPSILON &&
    inner.x1 <= outer.x1 + EPSILON &&
    inner.y1 <= outer.y1 + EPSILON
  );
}

/** True when two areas share more than an edge (more than `margin` both ways). */
export function areasOverlap(a: Area, b: Area, margin = 0): boolean {
  return (
    Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > margin + EPSILON &&
    Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > margin + EPSILON
  );
}

export function intersect(a: Area, b: Area): Area | null {
  const area = {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
  return area.x1 - area.x0 > EPSILON && area.y1 - area.y0 > EPSILON ? area : null;
}

/** Grows (or with a negative amount, shrinks) an area on every side. */
export function grow(area: Area, by: number): Area {
  return inset(area, -by);
}

/** Distance from a point to an area; 0 inside it. */
export function distanceTo(area: Area, x: number, y: number): number {
  const dx = Math.max(area.x0 - x, 0, x - area.x1);
  const dy = Math.max(area.y0 - y, 0, y - area.y1);
  return Math.hypot(dx, dy);
}

/** Which edge of `area` the point is on, named by the side it faces; null if on none. */
export function sideOf(area: Area, [x, y]: Point): Facing | null {
  if (Math.abs(y - area.y0) < EPSILON && x > area.x0 && x < area.x1) return 'stbd';
  if (Math.abs(y - area.y1) < EPSILON && x > area.x0 && x < area.x1) return 'port';
  if (Math.abs(x - area.x0) < EPSILON && y > area.y0 && y < area.y1) return 'fwd';
  if (Math.abs(x - area.x1) < EPSILON && y > area.y0 && y < area.y1) return 'aft';
  return null;
}
