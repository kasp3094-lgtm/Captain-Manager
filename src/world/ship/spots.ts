/**
 * Spots: every place aboard where a person can be. A seat at a console, a bench at a mess
 * table, a rack to sleep in, a post at a machine, the coffee machine, or open floor. Derived from
 * the furniture that fits.ts places, plus open floor from the walk grid, so the crew always has
 * somewhere real to stand. Pure; the crew system (src/world/crew/) uses it to place people.
 */
import type { Point } from '../../content/ship';
import { areaContains, centre, direction, facingYaw, grow, type Area } from './coords';
import { DOOR_ZONE, type ItemKind, type PlacedItem } from './fits';
import type { DeckLayout } from './layout';
import { isFree, nearestFree, reachableFrom, type WalkGrid } from './walkgrid';

/** How the body is set: standing, sitting, lying down, working with the hands, running. */
export type SpotPose = 'stand' | 'sit' | 'lie' | 'work' | 'run' | 'hidden';
/** What a spot is good for. */
export type SpotUse = 'duty' | 'rest' | 'eat' | 'leisure' | 'wash' | 'patrol';

export interface Spot {
  readonly id: string;
  readonly deck: number;
  readonly space: string;
  /** Where the body is on the plan: between the feet, the middle of a seat or a mattress. */
  readonly x: number;
  readonly y: number;
  /** Degrees; which way the body faces (lying down: which way the head points). */
  readonly yaw: number;
  readonly pose: SpotPose;
  /** Height of the seat or mattress above the deck; 0 standing. */
  readonly seat: number;
  readonly uses: readonly SpotUse[];
  /** What it belongs to, or `floor`. */
  readonly kind: ItemKind | 'floor';
  /** For a bunk: which rack of its room (the order the sim numbers them in). */
  readonly rack: number | null;
  /** Where to walk to before taking the spot: free floor in front of it. */
  readonly approach: Point;
}

/** A spot in an item's own frame: x across its front, z towards its front; yaw 0 faces +z. */
interface LocalSpot {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly pose: SpotPose;
  readonly seat?: number;
  readonly uses: readonly SpotUse[];
  /** How far in front of the item to walk to first; default just past its front. */
  readonly approach?: number;
  readonly rack?: boolean;
}

const DUTY: readonly SpotUse[] = ['duty'];
const LEISURE: readonly SpotUse[] = ['leisure'];
const SEAT = 0.49;

/** Stand facing the item's front, `out` metres in front of it. */
function front(depth: number, x = 0, out = 0.45, uses = DUTY, pose: SpotPose = 'work'): LocalSpot {
  return { x, z: depth / 2 + out, yaw: 180, pose, uses };
}

/** Spots for each kind of item; missing kinds have none. */
const LOCAL: Partial<Record<ItemKind, (item: PlacedItem) => readonly LocalSpot[]>> = {
  // Sleeping: racks are numbered bottom to top, item by item.
  'rack-stack': (item) =>
    [0.36, 1.0, 1.64].slice(0, item.count).map((h) => ({
      x: 0,
      z: 0,
      yaw: 90,
      pose: 'lie',
      seat: h + 0.16,
      uses: ['rest'],
      rack: true,
    })),
  bunk: () => [{ x: 0, z: 0, yaw: 90, pose: 'lie', seat: 0.6, uses: ['rest'], rack: true }],
  'bunk-double': () =>
    [0.3, 1.1].map((h) => ({
      x: 0,
      z: 0,
      yaw: 90,
      pose: 'lie',
      seat: h + 0.18,
      uses: ['rest'],
      rack: true,
    })),
  lockers: (item) => alongRow(item, 0.6, 2).map((x) => front(item.depth, x, 0.4, LEISURE, 'stand')),
  wardrobe: (item) => [front(item.depth, 0, 0.4, LEISURE, 'stand')],

  // Seats and tables
  chair: () => [{ x: 0, z: 0.02, yaw: 0, pose: 'sit', seat: SEAT, uses: LEISURE }],
  'card-table': () => [
    { x: 0, z: -0.8, yaw: 0, pose: 'sit', seat: 0.5, uses: ['leisure', 'eat'] },
    { x: 0, z: 0.8, yaw: 180, pose: 'sit', seat: 0.5, uses: ['leisure', 'eat'] },
  ],
  'mess-table': () =>
    [-0.6, 0, 0.6].flatMap((z) => [
      { x: 0.72, z, yaw: -90, pose: 'sit' as const, seat: 0.47, uses: ['eat', 'leisure'] as const },
      { x: -0.72, z, yaw: 90, pose: 'sit' as const, seat: 0.47, uses: ['eat', 'leisure'] as const },
    ]),
  'dining-table': () => [
    ...[-1.5, -0.5, 0.5, 1.5].flatMap((x) => [
      { x, z: -0.85, yaw: 0, pose: 'sit' as const, seat: SEAT, uses: ['eat', 'leisure'] as const },
      { x, z: 0.85, yaw: 180, pose: 'sit' as const, seat: SEAT, uses: ['eat', 'leisure'] as const },
    ]),
    { x: 2.25, z: 0, yaw: -90, pose: 'sit', seat: SEAT, uses: ['eat', 'leisure'] },
    { x: -2.25, z: 0, yaw: 90, pose: 'sit', seat: SEAT, uses: ['eat', 'leisure'] },
  ],
  sofa: () =>
    [-0.45, 0.45].map((x) => ({ x, z: 0.05, yaw: 0, pose: 'sit', seat: 0.5, uses: LEISURE })),
  bench: () =>
    [-0.5, 0.5].map((x) => ({ x, z: 0, yaw: 0, pose: 'sit', seat: 0.48, uses: LEISURE })),
  desk: () => [{ x: 0, z: 0.4, yaw: 180, pose: 'sit', seat: SEAT, uses: ['duty', 'leisure'] }],
  sideboard: (item) => [front(item.depth, 0, 0.4, LEISURE, 'stand')],
  noticeboard: () => [{ x: 0, z: 0.65, yaw: 180, pose: 'stand', uses: LEISURE }],
  memorial: () => [{ x: 0, z: 0.85, yaw: 180, pose: 'stand', uses: LEISURE }],
  'mail-rack': () => [{ x: 0, z: 0.65, yaw: 180, pose: 'stand', uses: LEISURE }],
  'coffee-machine': (item) => [front(item.depth, 0, 0.4, LEISURE, 'stand')],

  // Stations
  console: (item) => [front(item.depth, 0, 0.35)],
  'console-seat': () => [{ x: 0, z: 0.42, yaw: 180, pose: 'sit', seat: SEAT, uses: DUTY }],
  'console-pair': () =>
    [-0.7, 0.7].map((x) => ({ x, z: 0.42, yaw: 180, pose: 'sit', seat: SEAT, uses: DUTY })),
  'console-bank': () =>
    [-1.45, 0, 1.45].map((x) => ({ x, z: 0.45, yaw: 180, pose: 'sit', seat: SEAT, uses: DUTY })),
  helm: () =>
    [-0.65, 0.65].map((x) => ({ x, z: 0.3, yaw: 180, pose: 'sit', seat: SEAT, uses: DUTY })),
  holotable: () => [
    { x: 0, z: 1.3, yaw: 180, pose: 'work', uses: DUTY },
    { x: 1.3, z: 0, yaw: -90, pose: 'work', uses: DUTY },
    { x: -1.3, z: 0, yaw: 90, pose: 'work', uses: DUTY },
  ],
  'plot-table': (item) => [
    front(item.depth, 0, 0.35),
    { x: 0, z: -item.depth / 2 - 0.35, yaw: 0, pose: 'work', uses: DUTY },
  ],
  'damage-board': () => [-0.8, 0.8].map((x) => ({ x, z: 1.0, yaw: 180, pose: 'work', uses: DUTY })),
  'wall-screen': () => [{ x: 0, z: 1.1, yaw: 180, pose: 'stand', uses: DUTY }],
  'equipment-racks': (item) => alongRow(item, 0.6, 3).map((x) => front(item.depth, x, 0.4)),

  // Stores and work
  shelving: (item) => [front(item.depth, 0, 0.4)],
  crates: (item) => [front(item.depth, 0, 0.4)],
  'filing-cabinets': (item) => [front(item.depth, 0, 0.4)],
  'tool-cabinet': (item) => [front(item.depth, 0, 0.4)],
  workbench: (item) => [front(item.depth, 0, 0.35)],
  lathe: (item) => [front(item.depth, -0.4, 0.4)],
  'drill-press': (item) => [front(item.depth, 0, 0.35)],

  // Washing
  sinks: (item) =>
    alongRow(item, 0.75, 1).map((x) => front(item.depth, x, 0.35, ['wash'], 'stand')),
  showers: (item) =>
    alongRow(item, 1.0, 1).map((x) => ({
      x,
      z: 0,
      yaw: 180,
      pose: 'hidden',
      uses: ['wash'],
      approach: 0.4,
    })),
  'toilet-stalls': (item) =>
    alongRow(item, 1.0, 1).map((x) => ({
      x,
      z: 0,
      yaw: 180,
      pose: 'hidden',
      uses: ['wash'],
      approach: 0.4,
    })),
  washers: (item) =>
    alongRow(item, 0.7, 2).map((x) => front(item.depth, x, 0.4, ['duty', 'leisure'])),
  'folding-table': (item) => [
    front(item.depth, 0, 0.35, ['duty', 'leisure']),
    { x: 0, z: -item.depth / 2 - 0.35, yaw: 0, pose: 'work', uses: ['duty', 'leisure'] },
  ],

  // Galley and sickbay
  counter: (item) => [front(item.depth, 0, 0.35)],
  range: (item) => [front(item.depth, 0, 0.35)],
  'prep-island': (item) => [
    front(item.depth, 0, 0.35),
    { x: 0, z: -item.depth / 2 - 0.35, yaw: 0, pose: 'work', uses: DUTY },
  ],
  'medical-beds': (item) => [-1.2, 1.2].map((x) => front(item.depth, x, 0.45)),
  'operating-table': (item) => [front(item.depth, 0, 0.4)],
  'medical-cabinet': (item) => [front(item.depth, 0, 0.4)],

  // Off duty
  'gym-machines': () => [
    { x: -1.25, z: 0, yaw: 180, pose: 'run', seat: 0.2, uses: LEISURE, approach: 1.3 },
    { x: -0.3, z: 0, yaw: 180, pose: 'run', seat: 0.2, uses: LEISURE, approach: 1.3 },
    { x: 1.05, z: -0.1, yaw: 180, pose: 'lie', seat: 0.52, uses: LEISURE, approach: 1.3 },
  ],
  'punch-bag': () => [{ x: 0, z: 0.6, yaw: 180, pose: 'work', uses: LEISURE }],
  mats: () => [-0.5, 0.5].map((x) => ({ x, z: 0, yaw: 0, pose: 'stand', uses: LEISURE })),

  // Weapons and the hangar
  railgun: (item) => [
    front(item.depth, 0.5, 0.6),
    { x: 1.6, z: 2.5, yaw: -90, pose: 'work', uses: DUTY },
  ],
  'capacitor-bank': (item) => [-1.2, 1.2].map((x) => front(item.depth, x, 0.45)),
  'projectile-rack': (item) => [front(item.depth, 0, 0.45)],
  'launch-cells': (item) => [-1.5, 1.5].map((x) => front(item.depth, x, 0.45)),
  'missile-rack': (item) => [front(item.depth, 0, 0.45)],
  'weapon-racks': (item) => [front(item.depth, 0.6, 0.45)],
  'armor-stands': (item) =>
    alongRow(item, 0.7, 2).map((x) => front(item.depth, x, 0.45, ['duty', 'leisure'], 'stand')),
  cutter: (item) => [-2.5, 1.5].map((x) => front(item.depth, x, 0.6)),
  airlock: (item) => [front(item.depth, 0, 0.5)],
  'suit-lockers': (item) => alongRow(item, 0.8, 2).map((x) => front(item.depth, x, 0.45)),

  // Machinery
  machine: (item) => [front(item.depth, -0.6, 0.45)],
  'life-support': (item) => [front(item.depth, 1.0, 0.45)],
  'water-reclaimer': (item) => [front(item.depth, 0.8, 0.45)],
  pumps: (item) => [front(item.depth, 0, 0.45)],
  switchboards: (item) => [-1.2, 1.2].map((x) => front(item.depth, x, 0.45)),
  transformer: (item) => [front(item.depth, 0, 0.45)],
  reactor: () => [
    { x: 0, z: 2.4, yaw: 180, pose: 'work', uses: DUTY },
    { x: 2.4, z: 0.6, yaw: -90, pose: 'work', uses: DUTY },
    { x: -2.4, z: 0.6, yaw: 90, pose: 'work', uses: DUTY },
  ],
  'jump-core': () => [
    { x: 0, z: 1.65, yaw: 180, pose: 'work', uses: DUTY },
    { x: 1.65, z: 0, yaw: -90, pose: 'work', uses: DUTY },
  ],
  'main-drive': (item) => [-2.4, 2.4].map((x) => front(item.depth, x, 0.5)),
  thruster: (item) => [front(item.depth, -0.6, 0.45)],
  conduit: (item) => alongRow(item, 2.0, 2).map((x) => front(item.depth, x, 0.45)),
};

/** Centres of every `every`-th unit of a row item, `unit` metres wide. */
function alongRow(item: PlacedItem, unit: number, every: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < item.count; i += every) {
    const first = i;
    const last = Math.min(item.count - 1, i + every - 1);
    out.push(((first + last) / 2 - (item.count - 1) / 2) * unit);
  }
  return out;
}

/** A point in an item's frame on the plan (see props.ts for the frame). */
export function itemPoint(item: PlacedItem, x: number, z: number): Point {
  const [cx, cy] = centre(item.area);
  const yaw = (facingYaw(item.facing) * Math.PI) / 180;
  const wx = x * Math.cos(yaw) + z * Math.sin(yaw);
  const wz = -x * Math.sin(yaw) + z * Math.cos(yaw);
  return [cx + wx, cy - wz];
}

/** Every spot on a deck: furniture first, then open floor in every room. */
export function deckSpots(layout: DeckLayout, grid: WalkGrid): Spot[] {
  const spots: Spot[] = [];
  const reached = reachability(layout, grid);
  const spaces = new Map(layout.spaces.map((space) => [space.id, space]));
  // Nobody stands about in a doorway.
  const doors = doorZones(layout);
  const inDoorway = (x: number, y: number) => doors.some((zone) => areaContains(zone, x, y));
  const racks = new Map<string, number>();
  const counter = new Map<string, number>();
  const nextId = (space: string) => {
    const n = counter.get(space) ?? 0;
    counter.set(space, n + 1);
    return `${space}/${n}`;
  };

  for (const item of layout.items) {
    const local = LOCAL[item.kind]?.(item) ?? [];
    const itemYaw = facingYaw(item.facing);
    for (const spot of local) {
      const [x, y] = itemPoint(item, spot.x, spot.z);
      const [ax, ay] = itemPoint(item, spot.x, item.depth / 2 + (spot.approach ?? 0.45));
      // Racks are numbered first, so the numbers always match the roster's (one per rack).
      let rack: number | null = null;
      if (spot.rack) {
        rack = racks.get(item.space) ?? 0;
        racks.set(item.space, rack + 1);
      }
      const standing = spot.pose === 'stand' || spot.pose === 'work';
      // Somewhere to stand must be clear floor that can be walked to. Seats and bunks are got
      // into from the nearest such floor in their room: beside the seat, or in front of the item.
      if (standing && !(isFree(grid, x, y) && reached(x, y) && !inDoorway(x, y))) continue;
      const room = grow(spaces.get(item.space)!.inner, 0.05);
      const usable = (point: Point | null): point is Point =>
        point !== null && reached(point[0], point[1]) && areaContains(room, point[0], point[1]);
      const approach = standing
        ? ([x, y] as Point)
        : [
            nearestFree(grid, x, y, 1.0),
            nearestFree(grid, ax, ay, 1.2),
            rack !== null ? nearestFree(grid, ax, ay, 3) : null,
          ].find(usable);
      if (!approach) continue;
      spots.push({
        id: nextId(item.space),
        deck: layout.deck.deck,
        space: item.space,
        x,
        y,
        yaw: normalise(itemYaw + spot.yaw),
        pose: spot.pose,
        seat: spot.seat ?? 0,
        uses: spot.uses,
        kind: item.kind,
        rack,
        approach,
      });
    }
  }

  // Open floor: standing room for patrols, for anyone without a seat, and for conversations.
  for (const space of layout.spaces) {
    if (space.kind !== 'room') continue;
    const passage = space.zone === 'passage';
    const taken = spots.filter((spot) => spot.space === space.id);
    for (const [x, y] of floorPoints(space.inner, grid, passage ? 4 : 1.5)) {
      if (taken.some((spot) => Math.hypot(spot.x - x, spot.y - y) < 0.9)) continue;
      if (inDoorway(x, y)) continue;
      const [mx, my] = centre(space.inner);
      const yaw = passage
        ? (space.inner.x1 - space.inner.x0 > space.inner.y1 - space.inner.y0 ? 90 : 180) *
          (x < mx ? 1 : -1)
        : (Math.atan2(mx - x, -(my - y)) * 180) / Math.PI;
      spots.push({
        id: nextId(space.id),
        deck: layout.deck.deck,
        space: space.id,
        x,
        y,
        yaw: normalise(yaw),
        pose: 'stand',
        seat: 0,
        uses: passage ? ['patrol', 'leisure'] : ['duty', 'leisure', 'patrol'],
        kind: 'floor',
        rack: null,
        approach: [x, y],
      });
    }
  }
  return spots;
}

/** The clear floor kept in front of every doorway, on both sides (fits.ts keeps furniture out). */
function doorZones(layout: DeckLayout): Area[] {
  const half = DOOR_ZONE.width / 2;
  const deep = DOOR_ZONE.depth;
  return layout.doorways.flatMap((doorway) =>
    doorway.sides.map((side): Area => {
      const [dx, dy] = direction(side.into);
      const [x, y] = doorway.at;
      return dx !== 0
        ? {
            x0: Math.min(x, x + dx * deep),
            x1: Math.max(x, x + dx * deep),
            y0: y - half,
            y1: y + half,
          }
        : {
            x0: x - half,
            x1: x + half,
            y0: Math.min(y, y + dy * deep),
            y1: Math.max(y, y + dy * deep),
          };
    }),
  );
}

/** Which floor can be walked to from the passageways. */
function reachability(layout: DeckLayout, grid: WalkGrid): (x: number, y: number) => boolean {
  const tests = layout.spaces
    .filter((space) => space.zone === 'passage')
    .map((space) => {
      const [mx, my] = centre(space.inner);
      const start = nearestFree(grid, mx, my, 3);
      return start ? reachableFrom(grid, start) : () => false;
    });
  return (x, y) => tests.some((test) => test(x, y));
}

/** Points on a regular lattice inside `area` with clear floor around them (no hugging walls). */
function floorPoints(area: Area, grid: WalkGrid, spacing: number): Point[] {
  const points: Point[] = [];
  const margin = 0.55;
  const width = area.x1 - area.x0 - margin * 2;
  const depth = area.y1 - area.y0 - margin * 2;
  if (width < 0 || depth < 0) return points;
  const columns = Math.max(1, Math.floor(width / spacing) + 1);
  const rows = Math.max(1, Math.floor(depth / spacing) + 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x = area.x0 + margin + (columns === 1 ? width / 2 : (c * width) / (columns - 1));
      const y = area.y0 + margin + (rows === 1 ? depth / 2 : (r * depth) / (rows - 1));
      // Clear on every side by a body's width, so two people can stand and talk.
      const clear = [
        [0, 0],
        [0.35, 0],
        [-0.35, 0],
        [0, 0.35],
        [0, -0.35],
      ].every(([dx, dy]) => isFree(grid, x + dx!, y + dy!));
      if (clear) points.push([x, y]);
    }
  }
  return points;
}

function normalise(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
