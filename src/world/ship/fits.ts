/**
 * Furnishes rooms. Every point of interest with a `prop` gets that object where the deck plan
 * puts it; then the room's fit (a template per kind of room) fills in racks, lockers, consoles,
 * tables and machinery around the doors and those props. Pure maths on the plan, unit-tested;
 * props.ts builds each item in 3D.
 *
 * Items stand with their back to a wall, or free. An item's front faces `facing`; its width runs
 * across the front, its depth from front to back. Doors keep a clear zone in front of them.
 */
import type { Facing, Fit, Point, Poi, Prop, Room } from '../../content/ship';
import {
  ROOM_HEIGHT,
  areaInside,
  areasOverlap,
  centre,
  grow,
  intersect,
  isLengthwise,
  opposite,
  type Area,
} from './coords';
import type { Opening, Space } from './layout';

interface ItemSpec {
  /** Across the front, and front to back, in metres. For a row, the width of one unit. */
  readonly width: number;
  readonly depth: number;
  /** Above the deck. Things hung on a wall start higher up. */
  readonly bottom?: number;
  readonly top: number;
  /** A row of identical units (lockers, stalls): `count` sets how many. */
  readonly row?: boolean;
  /** Bunks per item, or per level for a rack stack. */
  readonly racks?: number;
  /** Lies flat on the deck; other things may stand on it. */
  readonly decor?: boolean;
  /** Floor kept free in front of it, to reach it or open it. */
  readonly access?: number;
  /** Floor kept free all round it instead (free-standing things you walk around). */
  readonly around?: number;
}

/** Every kind of item, with its size. props.ts builds each one. */
export const ITEMS = {
  // Sleeping
  'rack-stack': { width: 2.0, depth: 0.85, top: 2.2, racks: 1, access: 0.7 },
  bunk: { width: 2.0, depth: 0.95, top: 0.95, racks: 1, access: 0.5 },
  'bunk-double': { width: 2.0, depth: 0.9, top: 1.8, racks: 2, access: 0.6 },
  lockers: { width: 0.6, depth: 0.55, top: 1.95, row: true, access: 0.6 },
  wardrobe: { width: 1.0, depth: 0.6, top: 2.0, access: 0.6 },
  'head-cubicle': { width: 1.5, depth: 1.7, top: ROOM_HEIGHT, access: 0.6 },
  // Seats and tables
  chair: { width: 0.55, depth: 0.55, top: 0.95 },
  'card-table': { width: 1.5, depth: 2.0, top: 0.8, around: 0.3 },
  'mess-table': { width: 1.8, depth: 2.0, top: 0.8, around: 0.3 },
  'dining-table': { width: 5.0, depth: 2.3, top: 1.0, around: 0.3 },
  'coffee-table': { width: 0.9, depth: 0.5, top: 0.45 },
  sofa: { width: 2.0, depth: 0.85, top: 0.85, access: 0.4 },
  bench: { width: 1.8, depth: 0.45, top: 0.5 },
  desk: { width: 1.4, depth: 1.3, top: 1.2, access: 0.5 },
  sideboard: { width: 1.6, depth: 0.5, top: 0.9, access: 0.4 },
  bookshelf: { width: 1.2, depth: 0.35, top: 1.9, access: 0.5 },
  rug: { width: 2.4, depth: 1.6, top: 0.01, decor: true },
  picture: { width: 0.9, depth: 0.04, bottom: 1.3, top: 1.95 },
  lectern: { width: 0.6, depth: 0.5, top: 1.15 },
  // Stations
  console: { width: 1.2, depth: 0.8, top: 1.25, access: 0.6 },
  'console-seat': { width: 1.2, depth: 1.45, top: 1.25, access: 0.4 },
  'console-pair': { width: 2.8, depth: 1.45, top: 1.25, access: 0.4 },
  'console-bank': { width: 4.4, depth: 1.5, top: 1.25, access: 0.4 },
  helm: { width: 2.6, depth: 1.5, top: 1.15, around: 0.6 },
  'command-chair': { width: 1.1, depth: 1.1, top: 1.3, around: 0.4 },
  holotable: { width: 1.8, depth: 1.8, top: 1.1, around: 0.7 },
  'plot-table': { width: 2.0, depth: 1.2, top: 1.0, around: 0.6 },
  'wall-screen': { width: 1.8, depth: 0.08, bottom: 1.35, top: 2.15 },
  'damage-board': { width: 3.6, depth: 0.1, bottom: 0.9, top: 2.2 },
  'equipment-racks': { width: 0.6, depth: 0.7, top: 2.0, row: true, access: 0.6 },
  // Stores and work
  shelving: { width: 2.0, depth: 0.6, top: 2.2, access: 0.8 },
  crates: { width: 1.2, depth: 1.2, top: 1.5 },
  'filing-cabinets': { width: 0.5, depth: 0.6, top: 1.3, row: true, access: 0.6 },
  'mail-rack': { width: 1.2, depth: 0.35, bottom: 0.9, top: 1.9 },
  'tool-cabinet': { width: 1.0, depth: 0.5, top: 1.9, access: 0.5 },
  workbench: { width: 2.0, depth: 0.8, top: 1.9, access: 0.7 },
  lathe: { width: 2.2, depth: 1.0, top: 1.4, around: 0.6 },
  'drill-press': { width: 0.7, depth: 0.7, top: 1.8 },
  'tool-cart': { width: 0.9, depth: 0.6, top: 1.0 },
  // Washing
  'toilet-stalls': { width: 1.0, depth: 1.4, top: 2.0, row: true, access: 0.6 },
  showers: { width: 1.0, depth: 1.0, top: 2.1, row: true, access: 0.6 },
  sinks: { width: 0.75, depth: 0.55, top: 1.8, row: true, access: 0.6 },
  washers: { width: 0.7, depth: 0.75, top: 1.75, row: true, access: 0.7 },
  'folding-table': { width: 1.6, depth: 0.8, top: 0.9, around: 0.6 },
  // Galley
  counter: { width: 2.0, depth: 0.7, top: 0.95, access: 0.7 },
  range: { width: 1.8, depth: 0.9, top: 2.3, access: 0.8 },
  fridge: { width: 0.9, depth: 0.8, top: 2.0, access: 0.7 },
  'prep-island': { width: 1.8, depth: 0.9, top: 0.95, around: 0.8 },
  'coffee-machine': { width: 0.9, depth: 0.55, top: 1.5, access: 0.6 },
  // Medical
  'medical-beds': { width: 4.6, depth: 2.1, top: 1.6, access: 0.6 },
  'operating-table': { width: 2.2, depth: 1.0, top: ROOM_HEIGHT, around: 0.7 },
  'medical-cabinet': { width: 1.2, depth: 0.45, top: 2.0, access: 0.5 },
  // Off duty
  'gym-machines': { width: 3.6, depth: 1.9, top: 1.5, around: 0.5 },
  'punch-bag': { width: 0.6, depth: 0.6, top: ROOM_HEIGHT },
  mats: { width: 2.0, depth: 1.2, top: 0.04, decor: true },
  memorial: { width: 2.4, depth: 0.25, bottom: 0.3, top: 2.2 },
  // Safety
  noticeboard: { width: 1.3, depth: 0.05, bottom: 1.0, top: 1.85 },
  extinguisher: { width: 0.3, depth: 0.2, bottom: 0.35, top: 1.05 },
  'dc-locker': { width: 0.8, depth: 0.25, bottom: 0.95, top: 1.75 },
  clock: { width: 0.34, depth: 0.05, bottom: 1.85, top: 2.2 },
  // Weapons
  railgun: { width: 2.2, depth: 9.0, top: 1.9 },
  'capacitor-bank': { width: 4.2, depth: 0.9, top: 2.3, access: 0.6 },
  'projectile-rack': { width: 3.0, depth: 0.8, top: 1.4, access: 0.6 },
  'launch-cells': { width: 4.8, depth: 1.8, top: ROOM_HEIGHT },
  'missile-rack': { width: 2.8, depth: 0.9, top: 1.5, access: 0.6 },
  'weapon-racks': { width: 3.0, depth: 0.5, top: 2.0, access: 0.6 },
  'armor-stands': { width: 0.7, depth: 0.6, top: 1.9, row: true, access: 0.5 },
  'brig-cell': { width: 2.6, depth: 2.4, top: ROOM_HEIGHT, access: 0.6 },
  // Hangar
  cutter: { width: 9.0, depth: 3.8, top: 2.5, around: 0.6 },
  airlock: { width: 2.2, depth: 0.7, top: 2.4, access: 1.0 },
  'suit-lockers': { width: 0.8, depth: 0.6, top: 2.1, row: true, access: 0.6 },
  // Machinery
  machine: { width: 2.4, depth: 1.4, top: 1.9, access: 0.6 },
  'life-support': { width: 3.2, depth: 1.6, top: 2.2, access: 0.6 },
  'water-reclaimer': { width: 2.4, depth: 1.4, top: 2.0, access: 0.6 },
  pumps: { width: 4.2, depth: 1.4, top: 1.5, around: 0.6 },
  tank: { width: 1.2, depth: 1.2, top: 2.3, access: 0.4 },
  switchboards: { width: 4.8, depth: 0.7, top: 2.0, access: 0.8 },
  transformer: { width: 1.6, depth: 1.0, top: 1.6, access: 0.5 },
  reactor: { width: 3.8, depth: 3.8, top: 2.5, around: 0.6 },
  'jump-core': { width: 2.4, depth: 2.4, top: 2.5, around: 0.6 },
  'main-drive': { width: 7.0, depth: 6.0, top: 2.4, around: 0.8 },
  thruster: { width: 2.0, depth: 1.6, top: 2.0, access: 0.5 },
  conduit: { width: 2.0, depth: 0.6, top: 1.0, row: true },
} as const satisfies Record<string, ItemSpec>;

export type ItemKind = keyof typeof ITEMS;

// Every prop a point of interest can name must be an item kind.
const PROP_ITEMS: Record<Prop, ItemSpec> = ITEMS;

/** A piece of furniture or equipment, placed in a room. */
export interface PlacedItem {
  readonly kind: ItemKind;
  readonly space: string;
  /** Footprint on the plan. */
  readonly area: Area;
  readonly facing: Facing;
  readonly width: number;
  readonly depth: number;
  readonly bottom: number;
  readonly top: number;
  /** The captain can't walk through it. */
  readonly blocks: boolean;
  readonly decor: boolean;
  /** Units in a row, or levels in a rack stack. */
  readonly count: number;
  readonly racks: number;
  /** Fixed per item, for small variations (curtains, boxes) that never change between runs. */
  readonly seed: number;
  /** The point of interest it stands for. */
  readonly poi: string | null;
  /** Floor kept free in front of it. */
  readonly access: Area | null;
}

export interface Furnishing {
  readonly items: readonly PlacedItem[];
  /** Windows the fit cuts into the room's walls. */
  readonly windows: readonly Opening[];
  /** Warning for a sign beside the door, e.g. EXPLOSIVES. */
  readonly danger: string | null;
  readonly problems: readonly string[];
}

/** The clear zone kept in front of every door: this wide, and this deep into the room. */
export const DOOR_ZONE = { width: 1.4, depth: 1.3 };
/** A point of interest this close to a wall (beyond half its prop's depth) is set against it. */
const SNAP = 0.5;
/** Most units in a row built for a point of interest. */
const MAX_ROW = 8;
const STEP = 0.05;
const EPSILON = 1e-6;

const DEFAULT_FITS: Partial<Record<Room['type'], Fit>> = {
  passage: 'passage',
  berthing: 'berthing',
};

/** Furniture and equipment for one room, plus anything that didn't fit. */
export function furnish(space: Space, room: Room): Furnishing {
  const fitter = new Fitter(space, room);
  for (const poi of room.pois) {
    if (poi.prop) placePoi(fitter, poi, poi.prop);
  }
  const fit = room.fit ?? DEFAULT_FITS[room.type] ?? 'empty';
  FITS[fit](fitter);
  fitter.checkRacks();
  return {
    items: fitter.items,
    windows: fitter.windows,
    danger: fitter.danger,
    problems: fitter.problems,
  };
}

/** A prop where the deck plan puts its point of interest: against a wall if close to one. */
function placePoi(f: Fitter, poi: Poi, prop: Prop): void {
  const spec = PROP_ITEMS[prop];
  const [x, y] = poi.at;
  const inner = f.space.inner;
  const walls = (
    [
      ['stbd', y - inner.y0],
      ['port', inner.y1 - y],
      ['fwd', x - inner.x0],
      ['aft', inner.x1 - x],
    ] as [Facing, number][]
  ).sort((a, b) => a[1] - b[1]);
  const [nearest, distance] = walls[0]!;
  const snap =
    distance <= spec.depth / 2 + SNAP && (!poi.facing || poi.facing === opposite(nearest));
  if (!snap && !poi.facing) {
    f.problems.push(`${f.room.id}: "${poi.name}" stands away from the walls; give it a facing`);
    return;
  }

  // A row (lockers, racks of equipment) takes as many units as fit, centred on the point.
  let placed: PlacedItem | null = null;
  for (let count = spec.row ? MAX_ROW : 1; count >= 1 && !placed; count--) {
    const options = { poi: poi.name, count };
    if (snap) {
      const along = nearest === 'stbd' || nearest === 'port' ? x : y;
      placed = f.wall(prop, nearest, along, options);
    } else {
      placed = f.at(prop, poi.at, poi.facing!, options);
    }
  }
  if (!placed) {
    f.problems.push(
      `${f.room.id}: "${poi.name}" (${prop}) doesn't fit at [${poi.at}]: it would block a door ` +
        `or overlap something else`,
    );
  }
}

interface PlaceOptions {
  /** Units in a row, or levels in a rack stack. */
  readonly count?: number;
  readonly poi?: string;
}

/** Places items in one room, refusing any that stick out, block a door or overlap another. */
class Fitter {
  readonly items: PlacedItem[] = [];
  readonly windows: Opening[] = [];
  readonly problems: string[] = [];
  danger: string | null = null;
  /** Clear zones in front of doors. */
  readonly zones: Area[];
  private readonly seed: number;

  constructor(
    readonly space: Space,
    readonly room: Room,
  ) {
    this.zones = space.openings
      .filter((opening) => opening.kind !== 'window')
      .map((opening) => doorZone(space, opening));
    this.seed = hash(room.id);
  }

  get inner(): Area {
    return this.space.inner;
  }

  /** The walls, those without doors first, longest first. */
  get walls(): Facing[] {
    const sides: Facing[] = ['stbd', 'port', 'fwd', 'aft'];
    const doors = (side: Facing) =>
      this.space.openings.filter((o) => o.side === side && o.kind !== 'window').length;
    return sides.sort((a, b) => doors(a) - doors(b) || this.wallLength(b) - this.wallLength(a));
  }

  /** The wall with the room's first door. */
  get doorWall(): Facing {
    return this.space.openings.find((opening) => opening.kind !== 'window')?.side ?? this.walls[0]!;
  }

  wallLength(side: Facing): number {
    const { x0, x1, y0, y1 } = this.inner;
    return side === 'stbd' || side === 'port' ? x1 - x0 : y1 - y0;
  }

  has(kind: ItemKind): boolean {
    return this.items.some((item) => item.kind === kind);
  }

  /** An item centred at `at` (not yet placed). */
  make(kind: ItemKind, at: Point, facing: Facing, options: PlaceOptions = {}): PlacedItem {
    const spec: ItemSpec = ITEMS[kind];
    const count = options.count ?? 1;
    const width = spec.width * (spec.row ? count : 1);
    const depth = spec.depth;
    const [halfX, halfY] = isLengthwise(facing) ? [depth / 2, width / 2] : [width / 2, depth / 2];
    const bottom = spec.bottom ?? 0;
    const decor = spec.decor ?? false;
    const area = { x0: at[0] - halfX, y0: at[1] - halfY, x1: at[0] + halfX, y1: at[1] + halfY };
    return {
      kind,
      space: this.space.id,
      area,
      facing,
      width,
      depth,
      bottom,
      top: spec.top,
      // Thin things on a wall never get in the way.
      blocks: !decor && bottom < 0.5 && depth > 0.3,
      decor,
      count,
      racks: (spec.racks ?? 0) * count,
      seed: (this.seed + this.items.length * 7919) >>> 0,
      poi: options.poi ?? null,
      access: keptFree(area, facing, spec, this.inner),
    };
  }

  /**
   * True when the item fits: inside the room, clear of doors, windows, other items and the floor
   * kept free in front of them, with its own front free too. `clearance` keeps that much more
   * floor free all round it (free-standing things, so there is room to walk past).
   */
  fits(item: PlacedItem, clearance = 0): boolean {
    const room = this.inner;
    if (!areaInside(item.area, room)) return false;
    const around = grow(item.area, clearance);
    if (clearance > 0 && !areaInside(around, room)) return false;
    if (item.blocks && this.zones.some((zone) => areasOverlap(zone, around))) return false;
    for (const opening of [...this.space.openings, ...this.windows]) {
      if (!touchesWall(item.area, room, opening.side)) continue;
      const [from, to] = alongSpan(item.area, opening.side);
      const inTheWay = item.top > opening.bottom + EPSILON && item.bottom < opening.top - EPSILON;
      const half = opening.width / 2 + 0.1;
      if (inTheWay && to > opening.at - half && from < opening.at + half) return false;
    }
    if (item.decor) return true;
    return !this.items.some((other) => {
      if (other.decor) return false;
      const stacked = other.bottom < item.top - EPSILON && item.bottom < other.top - EPSILON;
      if (stacked && areasOverlap(other.area, other.blocks && item.blocks ? around : item.area)) {
        return true;
      }
      if (!item.blocks || !other.blocks) return false;
      return (
        (other.access !== null && areasOverlap(other.access, item.area)) ||
        (item.access !== null && areasOverlap(item.access, other.area))
      );
    });
  }

  add(item: PlacedItem, clearance = 0): PlacedItem | null {
    if (!this.fits(item, clearance)) return null;
    this.items.push(item);
    return item;
  }

  /** Free-standing, centred at `at`. */
  at(kind: ItemKind, at: Point, facing: Facing, options: PlaceOptions = {}): PlacedItem | null {
    return this.add(this.make(kind, at, facing, options));
  }

  /** Back against the wall on `side`, centred at `along` (x on stbd/port walls, y on fwd/aft). */
  wall(kind: ItemKind, side: Facing, along: number, options: PlaceOptions = {}): PlacedItem | null {
    return this.add(this.make(kind, this.wallPoint(kind, side, along), opposite(side), options));
  }

  /**
   * As many as fit along the wall on `side`, packed from one end. For a row, `units` gives the
   * most and fewest units per row; each spot takes the longest row that fits.
   */
  run(
    kind: ItemKind,
    side: Facing,
    options: {
      from?: 'start' | 'end';
      max?: number;
      gap?: number;
      count?: number;
      units?: readonly [number, number];
    } = {},
  ): PlacedItem[] {
    const { from = 'start', max = Infinity, gap = 0 } = options;
    const spec: ItemSpec = ITEMS[kind];
    const [lo, hi] = this.alongRange(side);
    const [most, fewest] = options.units ?? [options.count ?? 1, options.count ?? 1];
    const placed: PlacedItem[] = [];
    let edge = from === 'start' ? lo : hi;
    while (placed.length < max && (from === 'start' ? edge < hi : edge > lo)) {
      let item: PlacedItem | null = null;
      for (let count = most; count >= fewest && !item; count--) {
        const width = spec.width * (spec.row ? count : 1);
        const along = from === 'start' ? edge + width / 2 : edge - width / 2;
        if (along - width / 2 < lo - EPSILON || along + width / 2 > hi + EPSILON) continue;
        item = this.wall(kind, side, along, { count });
      }
      if (item) {
        placed.push(item);
        const [a, b] = alongSpan(item.area, side);
        edge = from === 'start' ? b + gap : a - gap;
      } else {
        edge += from === 'start' ? STEP : -STEP;
      }
    }
    return placed;
  }

  /**
   * Free-standing, as near `near` (default: the middle of the room) as it fits with `clearance`
   * metres kept clear around it, so there is room to walk past.
   */
  open(
    kind: ItemKind,
    facing: Facing,
    options: { near?: Point; clearance?: number; count?: number } = {},
  ): PlacedItem | null {
    const { clearance = 0.8 } = options;
    const [nx, ny] = options.near ?? centre(this.inner);
    const room = this.inner;
    let best: PlacedItem | null = null;
    let bestDistance = Infinity;
    for (let x = room.x0; x <= room.x1; x += 0.1) {
      for (let y = room.y0; y <= room.y1; y += 0.1) {
        const distance = Math.hypot(x - nx, y - ny);
        if (distance >= bestDistance) continue;
        const item = this.make(kind, [x, y], facing, options);
        if (this.fits(item, clearance)) {
          best = item;
          bestDistance = distance;
        }
      }
    }
    if (best) this.items.push(best);
    return best;
  }

  /** A window in the wall on `side`, between `from` and `to` along it. */
  window(side: Facing, from: number, to: number, sill: number, head: number): void {
    this.windows.push({
      side,
      at: (from + to) / 2,
      width: to - from,
      bottom: sill,
      top: head,
      kind: 'window',
      to: null,
    });
  }

  /** Where along the wall on `side` items can go: [min, max]. */
  alongRange(side: Facing): [number, number] {
    const { x0, x1, y0, y1 } = this.inner;
    return side === 'stbd' || side === 'port' ? [x0, x1] : [y0, y1];
  }

  /** The centre of an item standing with its back to the wall on `side`. */
  wallPoint(kind: ItemKind, side: Facing, along: number): Point {
    const depth = ITEMS[kind].depth;
    const { x0, x1, y0, y1 } = this.inner;
    switch (side) {
      case 'stbd':
        return [along, y0 + depth / 2];
      case 'port':
        return [along, y1 - depth / 2];
      case 'fwd':
        return [x0 + depth / 2, along];
      case 'aft':
        return [x1 - depth / 2, along];
    }
  }

  /** Reports a room whose racks didn't all fit. */
  checkRacks(): void {
    const want = this.room.racks ?? 0;
    const have = this.items.reduce((sum, item) => sum + item.racks, 0);
    if (have !== want) {
      this.problems.push(`${this.room.id}: the plan has ${want} racks but ${have} fit in 3D`);
    }
  }
}

/** The clear zone inside a space in front of an opening. */
export function doorZone(space: Space, opening: Opening): Area {
  const { inner } = space;
  const half = DOOR_ZONE.width / 2;
  const deep = DOOR_ZONE.depth;
  switch (opening.side) {
    case 'stbd':
      return { x0: opening.at - half, x1: opening.at + half, y0: inner.y0, y1: inner.y0 + deep };
    case 'port':
      return { x0: opening.at - half, x1: opening.at + half, y0: inner.y1 - deep, y1: inner.y1 };
    case 'fwd':
      return { x0: inner.x0, x1: inner.x0 + deep, y0: opening.at - half, y1: opening.at + half };
    case 'aft':
      return { x0: inner.x1 - deep, x1: inner.x1, y0: opening.at - half, y1: opening.at + half };
  }
}

/** True when the area is up against the wall on `side`. */
function touchesWall(area: Area, room: Area, side: Facing): boolean {
  switch (side) {
    case 'stbd':
      return area.y0 <= room.y0 + 0.05;
    case 'port':
      return area.y1 >= room.y1 - 0.05;
    case 'fwd':
      return area.x0 <= room.x0 + 0.05;
    case 'aft':
      return area.x1 >= room.x1 - 0.05;
  }
}

/** The area's extent along the wall on `side`. */
function alongSpan(area: Area, side: Facing): [number, number] {
  return side === 'stbd' || side === 'port' ? [area.x0, area.x1] : [area.y0, area.y1];
}

/** The floor an item keeps free: all round it, or in front of it; within the room. */
function keptFree(area: Area, facing: Facing, spec: ItemSpec, room: Area): Area | null {
  if (spec.around) return intersect(grow(area, spec.around), room);
  if (spec.access) return intersect(inFront(area, facing, spec.access), room);
  return null;
}

/** The strip of floor `depth` deep in front of an area facing `facing`. */
function inFront(area: Area, facing: Facing, depth: number): Area {
  switch (facing) {
    case 'stbd':
      return { ...area, y0: area.y0 - depth, y1: area.y0 };
    case 'port':
      return { ...area, y0: area.y1, y1: area.y1 + depth };
    case 'fwd':
      return { ...area, x0: area.x0 - depth, x1: area.x0 };
    case 'aft':
      return { ...area, x0: area.x1, x1: area.x1 + depth };
  }
}

/** A small, stable hash of a string (FNV-1a). */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---- Fits: one template per kind of room ------------------------------------------------------

type FitFunction = (f: Fitter) => void;

/** A noticeboard beside the first door, inside. */
function noticeboard(f: Fitter): void {
  if (f.has('noticeboard')) return;
  const side = f.doorWall;
  const door = f.space.openings.find((o) => o.side === side && o.kind !== 'window');
  if (!door) return;
  for (const offset of [1.45, -1.45, 2.2, -2.2]) {
    if (f.wall('noticeboard', side, door.at + offset)) return;
  }
}

/** A bulkhead clock over the first door's wall. */
function clock(f: Fitter): void {
  const side = f.doorWall;
  const [lo, hi] = f.alongRange(side);
  for (const along of [lo + 1.2, hi - 1.2, (lo + hi) / 2]) if (f.wall('clock', side, along)) return;
}

/** The middle of an area along the wall on `side`. */
function centreAlong(area: Area, side: Facing): number {
  return side === 'stbd' || side === 'port' ? (area.x0 + area.x1) / 2 : (area.y0 + area.y1) / 2;
}

/** A row of chairs facing `facing`, centred on `along` across the room, skipping blocked spots. */
function chairRow(f: Fitter, at: Point, facing: Facing, seats: number, aisle: number): void {
  const across = isLengthwise(facing) ? 1 : 0;
  for (let i = 0; i < seats; i++) {
    const offset = (i - (seats - 1) / 2) * 0.7 + Math.sign(i - (seats - 1) / 2) * (aisle / 2);
    const point: Point = across ? [at[0], at[1] + offset] : [at[0] + offset, at[1]];
    f.at('chair', point, facing);
  }
}

const FITS: Record<Fit, FitFunction> = {
  empty: () => undefined,

  passage(f) {
    // A fire extinguisher by every door, and a damage-control locker about every 20 m.
    for (const opening of f.space.openings) {
      if (opening.kind !== 'door') continue;
      const offset = opening.width / 2 + 0.3;
      if (!f.wall('extinguisher', opening.side, opening.at + offset)) {
        f.wall('extinguisher', opening.side, opening.at - offset);
      }
    }
    const lengthwise = f.wallLength('stbd') >= f.wallLength('fwd');
    const sides: Facing[] = lengthwise ? ['stbd', 'port'] : ['fwd', 'aft'];
    const length = f.wallLength(sides[0]!);
    const [lo] = f.alongRange(sides[0]!);
    for (let along = lo + 6; along < lo + length - 2; along += 20) {
      let placed = false;
      for (const shift of [0, 1, -1, 2, -2, 3, -3]) {
        for (const side of sides) {
          if (!placed && f.wall('dc-locker', side, along + shift)) placed = true;
        }
      }
    }
  },

  berthing(f) {
    let left = f.room.racks ?? 0;
    for (const side of f.walls) {
      while (left > 0) {
        const levels = Math.min(3, left);
        const [stack] = f.run('rack-stack', side, { from: 'end', max: 1, count: levels });
        if (!stack) break;
        left -= levels;
      }
    }
    for (const side of f.walls) f.run('lockers', side, { from: 'end', units: [6, 2] });
    noticeboard(f);
    if (!f.has('card-table')) f.open('card-table', 'port', { clearance: 0.7 });
  },

  stateroom(f) {
    const far = opposite(f.doorWall);
    f.run('bunk-double', far, { from: 'end', max: 1 });
    for (const side of f.walls) {
      if (f.items.filter((item) => item.kind === 'wardrobe').length >= 2) break;
      f.run('wardrobe', side, { max: 2 });
    }
    for (const side of f.walls) if (f.run('desk', side, { max: 1 }).length) break;
  },

  cabin(f) {
    const far = opposite(f.doorWall);
    f.run('bunk', far, { from: 'end', max: 1 });
    for (const side of f.walls) if (f.run('wardrobe', side, { max: 1 }).length) break;
    for (const side of f.walls) if (f.run('desk', side, { max: 1 }).length) break;
  },

  captain(f) {
    // A private head in a corner, a wardrobe, a sofa with a table, a bookshelf, a screen.
    for (const side of ['port', 'stbd'] as Facing[]) {
      const [lo] = f.alongRange(side);
      if (f.wall('head-cubicle', side, lo + ITEMS['head-cubicle'].width / 2)) break;
    }
    f.run('wardrobe', 'stbd', { max: 1 });
    const [sofa] = f.run('sofa', opposite(f.walls[0]!) === 'stbd' ? 'stbd' : 'port', {
      from: 'end',
      max: 1,
    });
    if (sofa) {
      const [x] = centre(sofa.area);
      const y = sofa.facing === 'stbd' ? sofa.area.y0 - 0.55 : sofa.area.y1 + 0.55;
      f.at('coffee-table', [x, y], sofa.facing);
    }
    f.run('bookshelf', 'aft', { max: 1 });
    f.wall('wall-screen', 'aft', centre(f.inner)[1] + 0.6);
    f.open('rug', 'port', { clearance: 0 });
  },

  bridge(f) {
    const inner = f.inner;
    f.window('fwd', inner.y0 + 0.9, inner.y1 - 0.9, 0.95, 2.15);
    for (const side of ['stbd', 'port'] as Facing[]) {
      f.run('console-seat', side, { from: 'end', max: 1 });
      f.run('console', side, { from: 'start', max: 1 });
    }
  },

  operations(f) {
    // Consoles along the walls without doors, screens above them, a plot table if there's room.
    for (const side of f.walls.filter((wall) => wall !== f.doorWall)) {
      for (const console of f.run('console-seat', side, { max: 2, gap: 0.3 })) {
        f.wall('wall-screen', side, centreAlong(console.area, side));
      }
    }
    if (!f.has('holotable') && !f.has('console-bank')) f.open('plot-table', 'port');
    clock(f);
  },

  wardroom(f) {
    for (const side of ['fwd', 'aft'] as Facing[]) f.run('sideboard', side, { max: 1 });
    const [x] = centre(f.inner);
    f.wall('wall-screen', 'stbd', x);
    for (const offset of [-3.6, 3.6]) f.wall('picture', 'stbd', x + offset);
  },

  briefing(f) {
    // Rows of chairs facing the screen.
    const screen = f.items.find((item) => item.kind === 'wall-screen');
    const facing = screen ? opposite(screen.facing) : opposite(f.doorWall);
    const [cx, cy] = centre(f.inner);
    const [dx, dy] = [
      facing === 'fwd' ? -1 : facing === 'aft' ? 1 : 0,
      facing === 'stbd' ? -1 : facing === 'port' ? 1 : 0,
    ];
    for (const distance of [-0.4, 0.6]) {
      chairRow(f, [cx - dx * distance, cy - dy * distance], facing, 8, 0.9);
    }
    f.open('lectern', opposite(facing), {
      near: screen ? centre(screen.area) : undefined,
      clearance: 0.3,
    });
  },

  equipment(f) {
    for (const side of f.walls) f.run('equipment-racks', side, { units: [8, 2] });
    f.open('console-seat', 'port', { clearance: 0.6 });
  },

  head(f) {
    const far = opposite(f.doorWall);
    f.run('toilet-stalls', far, { units: [4, 1], max: 1 });
    const sides = (['fwd', 'aft', 'stbd', 'port'] as Facing[]).filter(
      (side) => side !== far && side !== f.doorWall,
    );
    if (sides[0]) f.run('sinks', sides[0], { units: [3, 1], max: 1 });
    if (sides[1]) f.run('showers', sides[1], { units: [3, 1], max: 1 });
  },

  stores(f) {
    for (const side of f.walls) f.run('shelving', side, { gap: 0.1 });
    // Free-standing rows down the middle of a big store, with aisles.
    for (let i = 0; i < 4; i++) if (!f.open('shelving', 'port', { clearance: 1.0 })) break;
    for (let i = 0; i < 3; i++) if (!f.open('crates', 'port', { clearance: 0.8 })) break;
  },

  sickbay(f) {
    for (const side of f.walls.slice(0, 2)) f.run('medical-cabinet', side, { max: 1 });
    for (const side of f.walls) if (f.run('desk', side, { max: 1 }).length) break;
  },

  office(f) {
    for (const side of f.walls)
      if (f.run('filing-cabinets', side, { units: [4, 2], max: 1 }).length) break;
    for (const side of f.walls) if (f.run('mail-rack', side, { max: 1 }).length) break;
    for (const side of f.walls) if (f.run('desk', side, { max: 1 }).length) break;
    for (const side of f.walls) if (f.run('bench', side, { max: 1 }).length) break;
  },

  mess(f) {
    // Tables end-on to the far wall, seating six each; a serving counter at one end.
    const far = opposite(f.doorWall);
    f.run('mess-table', far, { gap: 0.6, max: 6 });
    for (const side of ['aft', 'fwd'] as Facing[])
      if (f.run('counter', side, { max: 1 }).length) break;
    f.wall('wall-screen', 'fwd', centre(f.inner)[1]);
    clock(f);
  },

  galley(f) {
    for (const side of f.walls) f.run('counter', side, { max: 3 });
    f.run('fridge', 'aft', { from: 'end', max: 2 });
    f.open('prep-island', 'port', { clearance: 0.9 });
  },

  chapel(f) {
    // A window in the hull, benches facing the memorial.
    const memorial = f.items.find((item) => item.kind === 'memorial');
    const facing = memorial ? opposite(memorial.facing) : 'fwd';
    const port = f.inner;
    f.window('port', port.x0 + 1.2, port.x1 - 1.2, 1.0, 2.0);
    for (let i = 0; i < 3; i++) f.open('bench', facing, { clearance: 0.45 });
  },

  laundry(f) {
    for (const side of f.walls) f.run('shelving', side, { max: 1 });
    f.open('folding-table', 'port', { clearance: 0.8 });
  },

  gym(f) {
    f.open('mats', 'port', { clearance: 0.2 });
    f.open('punch-bag', 'port', { clearance: 0.6 });
    for (const side of f.walls.slice(0, 2)) f.run('bench', side, { max: 1 });
    for (const side of f.walls) f.run('lockers', side, { units: [4, 2], max: 1 });
  },

  railgun(f) {
    f.danger = 'HIGH VOLTAGE';
    for (const side of f.walls) f.run('projectile-rack', side, { max: 1 });
    f.run('tool-cabinet', f.doorWall, { max: 1 });
  },

  magazine(f) {
    f.danger = 'EXPLOSIVES';
    for (const side of f.walls) f.run('missile-rack', side, { gap: 0.3 });
  },

  armory(f) {
    f.danger = 'AUTHORISED PERSONNEL ONLY';
    for (const side of f.walls) f.run('armor-stands', side, { units: [4, 2], max: 1 });
    f.open('workbench', 'port', { clearance: 0.7 });
    f.open('crates', 'port', { clearance: 0.7 });
  },

  brig(f) {
    const far = opposite(f.doorWall);
    f.run('brig-cell', far, { max: 2, gap: 0.1 });
    for (const side of f.walls) if (f.run('desk', side, { max: 1 }).length) break;
  },

  hangar(f) {
    for (const side of f.walls) f.run('suit-lockers', side, { units: [4, 2], max: 1 });
    for (let i = 0; i < 3; i++) f.open('crates', 'port', { clearance: 0.8 });
    for (let i = 0; i < 2; i++) f.open('tool-cart', 'aft', { clearance: 0.7 });
  },

  machinery(f) {
    for (const side of f.walls.slice(0, 3)) f.run('machine', side, { max: 1 });
    for (const side of f.walls.slice(0, 2)) f.run('tank', side, { from: 'end', max: 1 });
  },

  workshop(f) {
    for (const side of f.walls.slice(0, 3)) f.run('workbench', side, { max: 1 });
    f.open('drill-press', 'port', { clearance: 0.6 });
    for (const side of f.walls.slice(0, 2)) f.run('tool-cabinet', side, { from: 'end', max: 1 });
  },

  reactor(f) {
    f.danger = 'RADIATION AREA';
    for (const side of f.walls) f.run('machine', side, { max: 1 });
  },

  drive(f) {
    for (const side of f.walls.slice(0, 2)) f.run('thruster', side, { max: 2, gap: 0.6 });
    for (const side of f.walls.slice(0, 2)) f.run('machine', side, { from: 'end', max: 1 });
  },

  crawlway(f) {
    // The drive shaft's conduit runs the length of the alley.
    const side = opposite(f.doorWall);
    f.run('conduit', side, { from: 'end', units: [12, 1], max: 3 });
  },
};
