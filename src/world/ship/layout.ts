/**
 * Plans every deck of the ship from the deck plans: the walls with their door openings, the
 * lighting cells and their ceiling lights, signs, ladders and the lift, what blocks walking, and
 * a viewpoint for every room. Furniture comes from fits.ts.
 *
 * Pure maths on plan coordinates (metres, x from the bow, y from starboard), with no Babylon.js,
 * so the unit tests check the whole ship without rendering it. build.ts turns a plan into meshes.
 */
import type { Deck, Facing, Point, Room, Shaft, Ship } from '../../content/ship';
import { shaftsOnDeck } from '../../sim/ship';
import {
  DOOR_HEIGHT,
  DOOR_WIDTH,
  ROOM_HEIGHT,
  SHAFT_OPENING_WIDTH,
  WALL,
  areaContains,
  centre,
  direction,
  facingYaw,
  floorHeight,
  inset,
  intersect,
  opposite,
  sideOf,
  toArea,
  yawTowards,
  type Area,
} from './coords';
import { furnish, type PlacedItem } from './fits';

/** What colours a space: its room type, or the shafts' own. */
export type Zone = Room['type'] | 'shaft';

/** A gap in a wall: a door, the way into a shaft, or a window. */
export interface Opening {
  /** The wall it is in, named by the side of the space (the stbd wall is the one at min y). */
  readonly side: Facing;
  /** Centre along the wall: x on stbd and port walls, y on fwd and aft walls. */
  readonly at: number;
  readonly width: number;
  /** Height of the sill and of the head above the deck. */
  readonly bottom: number;
  readonly top: number;
  readonly kind: 'door' | 'shaft' | 'window';
  /** The space on the other side; null for windows. */
  readonly to: string | null;
}

/** A room you can walk into, or a ladderwell or the lift. */
export interface Space {
  readonly id: string;
  readonly name: string;
  readonly kind: 'room' | 'ladder' | 'lift';
  readonly zone: Zone;
  /** The rectangle on the plan, and the floor inside its walls. */
  readonly rect: Area;
  readonly inner: Area;
  readonly openings: readonly Opening[];
  readonly room: Room | null;
  readonly shaft: Shaft | null;
}

/**
 * Part of a space lit by its own ceiling lights. Long rooms are split into cells so that no
 * surface needs more lights than a material can take; lights never reach into other spaces, so
 * none shines through a wall.
 */
export interface Cell {
  readonly id: string;
  readonly space: string;
  readonly area: Area;
  /** Ceiling lights, at most MAX_FIXTURES. */
  readonly fixtures: readonly Point[];
  /** The fittings run along x or along y. */
  readonly along: 'x' | 'y';
  /** Cells of the same space that border this one. */
  readonly neighbours: readonly string[];
}

/** A slab of wall (or deck, or overhead) in one cell. */
export interface Slab {
  readonly cell: string;
  readonly area: Area;
  readonly bottom: number;
  readonly top: number;
  /** A blocker the captain can still reach into, e.g. a ladder to climb: it doesn't stop a look. */
  readonly soft?: boolean;
}

export interface WallPiece extends Slab {
  readonly space: string;
  /** Which wall of the space it belongs to. */
  readonly side: Facing;
}

/** A door or shaft opening between two spaces; build.ts frames it from both sides. */
export interface Doorway {
  readonly kind: 'door' | 'shaft';
  readonly at: Point;
  /** The boundary runs along x (a stbd or port wall) or along y. */
  readonly along: 'x' | 'y';
  readonly width: number;
  readonly height: number;
  /** The space whose door it is (or the shaft), then the space beyond. */
  readonly sides: readonly [DoorSide, DoorSide];
}

export interface DoorSide {
  readonly space: string;
  readonly cell: string;
  /** From the boundary into this side's space. */
  readonly into: Facing;
}

/** A sign on a wall: compartment number and name over a door, or a deck plate. */
export interface Sign {
  readonly cell: string;
  /** Centre of the sign, on the wall's face. */
  readonly at: Point;
  readonly height: number;
  /** The way the sign faces: towards whoever reads it. */
  readonly facing: Facing;
  readonly width: number;
  readonly tall: number;
  readonly style: 'compartment' | 'deck' | 'danger';
  readonly lines: readonly string[];
}

/** A ladderwell or the lift as it stands on this deck. */
export interface ShaftStop {
  readonly shaft: Shaft;
  readonly space: string;
  /** The next deck it serves above and below, if any. */
  readonly up: number | null;
  readonly down: number | null;
  /** Where you stand after arriving, just inside the opening. */
  readonly landing: Point;
  /** Ladderwells: the half with the ladder up, and the half open to the deck below. */
  readonly ladderUp: Area | null;
  readonly ladderDown: Area | null;
}

export type InteractAction =
  | { readonly kind: 'ladder'; readonly shaft: string; readonly toDeck: number }
  | { readonly kind: 'lift'; readonly shaft: string }
  /** A crew member (src/world/crew/crowd.ts tags them; the layout itself has none). */
  | { readonly kind: 'talk'; readonly crew: string };

/** Something the captain can use with E: an invisible box that a look ray can hit. */
export interface Interactable {
  readonly id: string;
  readonly label: string;
  readonly action: InteractAction;
  readonly cell: string;
  readonly area: Area;
  readonly bottom: number;
  readonly top: number;
}

/** Where to stand and look. Angles in degrees; positive pitch looks down. */
export interface Bookmark {
  readonly deck: number;
  readonly x: number;
  readonly y: number;
  readonly yaw: number;
  readonly pitch: number;
}

export interface DeckLayout {
  readonly deck: Deck;
  /** Height of this deck's floor in the world. */
  readonly floorY: number;
  readonly spaces: readonly Space[];
  readonly cells: readonly Cell[];
  readonly floors: readonly Slab[];
  readonly ceilings: readonly Slab[];
  readonly walls: readonly WallPiece[];
  readonly windows: readonly {
    readonly cell: string;
    readonly space: string;
    readonly opening: Opening;
  }[];
  readonly doorways: readonly Doorway[];
  readonly signs: readonly Sign[];
  readonly items: readonly (PlacedItem & { readonly cell: string })[];
  readonly shafts: readonly ShaftStop[];
  readonly interactables: readonly Interactable[];
  /** Everything the captain can't walk through, for colliders and the reachability test. */
  readonly blockers: readonly Slab[];
}

export interface ShipLayout {
  readonly decks: readonly DeckLayout[];
  /** Viewpoints by name: every room's id, `<shaft>-deck<N>`, and `spawn` (the start room). */
  readonly bookmarks: ReadonlyMap<string, Bookmark>;
  /** Furniture that didn't fit, as sentences a designer can act on. Checked by `npm run validate`. */
  readonly problems: readonly string[];
}

/** No cell is longer than this, in metres. */
const MAX_CELL = 10;
/** Ceiling lights per cell; with two borrowed from neighbours and the ambient light, six. */
export const MAX_FIXTURES = 3;
/** Ceiling lights are about this far apart. */
const FIXTURE_SPACING = 3.4;
/** Ladderwells: the landing is this deep, measured from the wall with the opening. */
const LANDING_DEPTH = 2.0;
/** Viewpoints stand this far inside a room's first door, looking slightly down. */
const VIEW_DEPTH = 1.0;
const VIEW_PITCH = 6;
const EPSILON = 1e-6;

export function planShip(ship: Ship): ShipLayout {
  const lowest = Math.max(...ship.decks.map((deck) => deck.deck));
  const problems: string[] = [];
  const decks = ship.decks.map((deck) => planDeck(ship, deck, lowest, problems));
  const bookmarks = new Map<string, Bookmark>();
  for (const layout of decks) {
    for (const [name, bookmark] of deckBookmarks(layout)) bookmarks.set(name, bookmark);
  }
  const start = bookmarks.get(ship.startRoom);
  if (start) bookmarks.set('spawn', start);
  return { decks, bookmarks, problems };
}

function planDeck(ship: Ship, deck: Deck, lowestDeck: number, problems: string[]): DeckLayout {
  // Furniture first: a fit may cut windows into its room's walls.
  const furnished = deckSpaces(ship, deck).map((space) => {
    if (!space.room) return { space, items: [] as PlacedItem[], danger: null };
    const furnishing = furnish(space, space.room);
    problems.push(...furnishing.problems.map((problem) => `deck ${deck.deck} / ${problem}`));
    return {
      space: { ...space, openings: [...space.openings, ...furnishing.windows] },
      items: furnishing.items,
      danger: furnishing.danger,
    };
  });
  const spaces = furnished.map((entry) => entry.space);
  const byId = new Map(spaces.map((space) => [space.id, space]));

  const cells = spaces.flatMap(spaceCells);
  const cellsBySpace = groupBy(cells, (cell) => cell.space);
  const cellAt = (spaceId: string, [x, y]: Point): string => {
    const own = cellsBySpace.get(spaceId) ?? [];
    const hit = own.find((cell) => areaContains(cell.area, x, y)) ?? nearestCell(own, x, y);
    if (!hit) throw new Error(`No cell in ${spaceId}`);
    return hit.id;
  };

  const shafts = shaftsOnDeck(ship, deck.deck).map((shaft) => shaftStop(shaft, deck.deck));
  const floors: Slab[] = [];
  const ceilings: Slab[] = [];
  for (const cell of cells) {
    const stop = shafts.find((candidate) => candidate.space === cell.space);
    for (const area of subtract(cell.area, [stop?.ladderDown])) {
      floors.push({ cell: cell.id, area, bottom: -0.05, top: 0 });
    }
    for (const area of subtract(cell.area, [stop?.ladderUp])) {
      ceilings.push({ cell: cell.id, area, bottom: ROOM_HEIGHT, top: ROOM_HEIGHT + 0.06 });
    }
  }

  const walls = spaces.flatMap((space) => spaceWalls(space, cellsBySpace.get(space.id) ?? []));
  const windows = spaces.flatMap((space) =>
    space.openings
      .filter((opening) => opening.kind === 'window')
      .map((opening) => ({
        space: space.id,
        opening,
        cell: cellAt(space.id, openingPoint(space.rect, opening)),
      })),
  );
  const dangers = new Map(furnished.map((entry) => [entry.space.id, entry.danger]));
  const items = furnished.flatMap(({ space, items: placed }) =>
    placed.map((item) => ({ ...item, cell: cellAt(space.id, centre(item.area)) })),
  );

  const blockers: Slab[] = [
    ...walls.filter((wall) => wall.bottom < 1),
    ...items
      .filter((item) => item.blocks)
      .map((item) => ({ cell: item.cell, area: item.area, bottom: item.bottom, top: item.top })),
    ...shafts.flatMap((stop) =>
      [stop.ladderUp, stop.ladderDown]
        .filter((area): area is Area => area !== null)
        .map((area) => ({
          cell: cellAt(stop.space, centre(area)),
          area,
          bottom: 0,
          top: ROOM_HEIGHT,
          soft: true,
        })),
    ),
  ];

  return {
    deck,
    floorY: floorHeight(deck.deck, lowestDeck),
    spaces,
    cells,
    floors,
    ceilings,
    walls,
    windows,
    doorways: deckDoorways(spaces, cellAt),
    signs: deckSigns(deck, spaces, byId, dangers, cellAt),
    items,
    shafts,
    interactables: shafts.flatMap((stop) => shaftInteractables(stop, cellAt)),
    blockers,
  };
}

/** The walkable rooms and the shafts on a deck, each with the openings in its walls. */
function deckSpaces(ship: Ship, deck: Deck): Space[] {
  const rooms = deck.rooms.filter((room) => room.type !== 'tank');
  const shafts = shaftsOnDeck(ship, deck.deck);
  const base = [
    ...rooms.map((room) => ({
      id: room.id,
      name: room.name,
      kind: 'room' as const,
      zone: room.type as Zone,
      rect: toArea(room.rect),
      room,
      shaft: null,
    })),
    ...shafts.map((shaft) => ({
      id: shaft.id,
      name: shaft.name,
      kind: shaft.type,
      zone: 'shaft' as const,
      rect: toArea(shaft.rect),
      room: null,
      shaft,
    })),
  ];

  const openings = new Map<string, Opening[]>(base.map((space) => [space.id, []]));
  const spaceBeyond = (point: Point, self: string, side: Facing) => {
    const [dx, dy] = direction(side);
    const x = point[0] + dx * 0.1;
    const y = point[1] + dy * 0.1;
    return base.find((space) => space.id !== self && areaContains(space.rect, x, y)) ?? null;
  };
  const addPair = (owner: (typeof base)[number], point: Point, kind: 'door' | 'shaft') => {
    const side = sideOf(owner.rect, point);
    if (!side) throw new Error(`${owner.id}: opening at [${point}] is not on its edge`);
    const other = spaceBeyond(point, owner.id, side);
    if (!other) throw new Error(`${owner.id}: opening at [${point}] leads nowhere`);
    const width = kind === 'door' ? DOOR_WIDTH : SHAFT_OPENING_WIDTH;
    const height = DOOR_HEIGHT + (kind === 'shaft' ? 0.1 : 0);
    const otherSide = opposite(side);
    const along = side === 'stbd' || side === 'port' ? point[0] : point[1];
    openings
      .get(owner.id)!
      .push({ side, at: along, width, bottom: 0, top: height, kind, to: other.id });
    openings.get(other.id)!.push({
      side: otherSide,
      at: along,
      width,
      bottom: 0,
      top: height,
      kind,
      to: owner.id,
    });
  };
  for (const space of base) {
    if (space.room) for (const door of space.room.doors) addPair(space, door, 'door');
    if (space.shaft) addPair(space, space.shaft.opening, 'shaft');
  }

  return base.map((space) => ({
    ...space,
    inner: inset(space.rect, WALL),
    openings: openings.get(space.id)!,
  }));
}

/** Splits a space along its longer side into cells no longer than MAX_CELL, with their lights. */
function spaceCells(space: Space): Cell[] {
  const { rect } = space;
  const width = rect.x1 - rect.x0;
  const depth = rect.y1 - rect.y0;
  const split: 'x' | 'y' = width >= depth ? 'x' : 'y';
  const length = split === 'x' ? width : depth;
  const count = Math.max(1, Math.ceil(length / MAX_CELL - EPSILON));
  const step = length / count;
  const ids = Array.from({ length: count }, (_, i) => `${space.id}#${i}`);

  return ids.map((id, i) => {
    const area =
      split === 'x'
        ? { ...rect, x0: rect.x0 + i * step, x1: rect.x0 + (i + 1) * step }
        : { ...rect, y0: rect.y0 + i * step, y1: rect.y0 + (i + 1) * step };
    const along: 'x' | 'y' = area.x1 - area.x0 >= area.y1 - area.y0 ? 'x' : 'y';
    return {
      id,
      space: space.id,
      area,
      fixtures: fixturesFor(space, area, along),
      along,
      neighbours: [ids[i - 1], ids[i + 1]].filter((n): n is string => n !== undefined),
    };
  });
}

/** Ceiling lights in a row down the middle of a cell. */
function fixturesFor(space: Space, area: Area, along: 'x' | 'y'): Point[] {
  const inner = intersect(area, space.inner) ?? area;
  const length = along === 'x' ? inner.x1 - inner.x0 : inner.y1 - inner.y0;
  const count = Math.min(MAX_FIXTURES, Math.max(1, Math.round(length / FIXTURE_SPACING)));
  const mid = along === 'x' ? (inner.y0 + inner.y1) / 2 : (inner.x0 + inner.x1) / 2;
  const start = along === 'x' ? inner.x0 : inner.y0;
  return Array.from({ length: count }, (_, i) => {
    const t = start + ((i + 0.5) * length) / count;
    return along === 'x' ? [t, mid] : [mid, t];
  });
}

/** Wall slabs along each edge of a space, with gaps for its openings, split at cell boundaries. */
function spaceWalls(space: Space, cells: readonly Cell[]): WallPiece[] {
  const { rect } = space;
  const pieces: WallPiece[] = [];
  const sides: readonly Facing[] = ['stbd', 'port', 'fwd', 'aft'];

  for (const side of sides) {
    const runsAlongX = side === 'stbd' || side === 'port';
    // Stbd and port walls take the corners.
    const from = runsAlongX ? rect.x0 : rect.y0 + WALL;
    const to = runsAlongX ? rect.x1 : rect.y1 - WALL;
    const band =
      side === 'stbd'
        ? { y0: rect.y0, y1: rect.y0 + WALL }
        : side === 'port'
          ? { y0: rect.y1 - WALL, y1: rect.y1 }
          : side === 'fwd'
            ? { x0: rect.x0, x1: rect.x0 + WALL }
            : { x0: rect.x1 - WALL, x1: rect.x1 };
    const gaps = space.openings.filter((opening) => opening.side === side);

    // Cut the wall where an opening's bottom or top changes, then fill each stretch up to
    // the deck head except where an opening is.
    const cuts = new Set<number>([from, to]);
    for (const gap of gaps) {
      cuts.add(clamp(gap.at - gap.width / 2, from, to));
      cuts.add(clamp(gap.at + gap.width / 2, from, to));
    }
    for (const cell of cells) {
      if (runsAlongX) {
        cuts.add(clamp(cell.area.x0, from, to));
        cuts.add(clamp(cell.area.x1, from, to));
      } else {
        cuts.add(clamp(cell.area.y0, from, to));
        cuts.add(clamp(cell.area.y1, from, to));
      }
    }
    const stops = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i]!;
      const b = stops[i + 1]!;
      if (b - a < EPSILON) continue;
      const mid = (a + b) / 2;
      const gap = gaps.find((g) => Math.abs(g.at - mid) < g.width / 2);
      const spans: [number, number][] = gap
        ? (
            [
              [0, gap.bottom],
              [gap.top, ROOM_HEIGHT],
            ] as [number, number][]
          ).filter(([lo, hi]) => hi - lo > EPSILON)
        : [[0, ROOM_HEIGHT]];
      const area: Area = runsAlongX
        ? { x0: a, x1: b, y0: band.y0!, y1: band.y1! }
        : { x0: band.x0!, x1: band.x1!, y0: a, y1: b };
      const point: Point = [(area.x0 + area.x1) / 2, (area.y0 + area.y1) / 2];
      const cell = (cells.find((c) => areaContains(c.area, point[0], point[1])) ??
        nearestCell(cells, point[0], point[1]))!;
      for (const [bottom, top] of spans) {
        pieces.push({ cell: cell.id, space: space.id, side, area, bottom, top });
      }
    }
  }
  return pieces;
}

/** Every door and shaft opening once, with the cell on each side. */
function deckDoorways(
  spaces: readonly Space[],
  cellAt: (space: string, point: Point) => string,
): Doorway[] {
  const doorways: Doorway[] = [];
  const seen = new Set<string>();
  for (const space of spaces) {
    for (const opening of space.openings) {
      if (opening.kind === 'window' || !opening.to) continue;
      const at = openingPoint(space.rect, opening);
      const key = `${at[0].toFixed(3)},${at[1].toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const into = opposite(opening.side);
      doorways.push({
        kind: opening.kind,
        at,
        along: opening.side === 'stbd' || opening.side === 'port' ? 'x' : 'y',
        width: opening.width,
        height: opening.top,
        sides: [
          { space: space.id, cell: cellAt(space.id, at), into },
          { space: opening.to, cell: cellAt(opening.to, at), into: opening.side },
        ],
      });
    }
  }
  return doorways;
}

/**
 * A sign over every door on the side you walk up to it from, with the room's compartment number
 * and name, plus a warning beside the doors of dangerous rooms. Shafts get the deck number over
 * their opening outside, and a deck plate inside.
 */
function deckSigns(
  deck: Deck,
  spaces: readonly Space[],
  byId: ReadonlyMap<string, Space>,
  dangers: ReadonlyMap<string, string | null>,
  cellAt: (space: string, point: Point) => string,
): Sign[] {
  const signs: Sign[] = [];
  /** A sign on `space`'s side of `opening`, over it or `offset` metres along the wall. */
  const sign = (
    space: Space,
    opening: Opening,
    style: Sign['style'],
    lines: string[],
    placement = { offset: 0, height: DOOR_HEIGHT + 0.29, width: 1.1, tall: 0.34 },
  ) => {
    const [x, y] = wallFacePoint(space, opening);
    const along = opening.side === 'stbd' || opening.side === 'port';
    const at: Point = along ? [x + placement.offset, y] : [x, y + placement.offset];
    signs.push({
      cell: cellAt(space.id, at),
      at,
      height: placement.height,
      facing: opposite(opening.side),
      width: placement.width,
      tall: placement.tall,
      style,
      lines,
    });
  };
  /** The same opening, seen from the space on its other side. */
  const otherSide = (space: Space, opening: Opening) => {
    const beyond = opening.to ? byId.get(opening.to) : undefined;
    const back = beyond?.openings.find(
      (candidate) => candidate.to === space.id && Math.abs(candidate.at - opening.at) < EPSILON,
    );
    return beyond && back ? { beyond, back } : null;
  };

  for (const space of spaces) {
    const room = space.room;
    if (room) {
      for (const door of room.doors) {
        const opening = space.openings.find(
          (candidate) => candidate.kind === 'door' && onOpening(space.rect, candidate, door),
        );
        const outside = opening && otherSide(space, opening);
        if (!outside) continue;
        sign(outside.beyond, outside.back, 'compartment', [
          room.code,
          (room.short ?? room.name).toUpperCase(),
        ]);
        const danger = dangers.get(space.id);
        if (danger) {
          const offset = sideClear(outside.beyond, outside.back);
          sign(outside.beyond, outside.back, 'danger', ['DANGER', danger], {
            offset,
            height: 1.55,
            width: 0.62,
            tall: 0.44,
          });
        }
      }
    }
    if (space.shaft) {
      const opening = space.openings.find((candidate) => candidate.kind === 'shaft');
      const outside = opening && otherSide(space, opening);
      if (!opening || !outside) continue;
      const decks = space.shaft.decks;
      const what = space.shaft.type === 'lift' ? 'LIFT' : 'LADDER';
      sign(outside.beyond, outside.back, 'deck', [
        `DECK ${deck.deck}`,
        `${what} · DECKS ${decks[0]}–${decks[decks.length - 1]}`,
      ]);
      sign(space, opening, 'deck', [`DECK ${deck.deck}`, deck.name.toUpperCase()]);
    }
  }
  return signs;
}

/** How far along the wall to put a sign beside an opening: the side with more bare wall. */
function sideClear(space: Space, opening: Opening): number {
  const offset = opening.width / 2 + 0.5;
  const clashes = (at: number) =>
    space.openings.some(
      (other) =>
        other !== opening &&
        other.side === opening.side &&
        Math.abs(other.at - at) < other.width / 2 + 0.45,
    );
  return clashes(opening.at + offset) ? -offset : offset;
}

/** Where the ladders and the lift stand on a deck, and which way they go. */
function shaftStop(shaft: Shaft, deck: number): ShaftStop {
  const decks = [...shaft.decks].sort((a, b) => a - b);
  const index = decks.indexOf(deck);
  const up = decks[index - 1] ?? null;
  const down = decks[index + 1] ?? null;
  const rect = toArea(shaft.rect);
  const inner = inset(rect, WALL);
  const side = sideOf(rect, shaft.opening);
  if (!side) throw new Error(`${shaft.id}: opening is not on its edge`);
  const [nx, ny] = direction(side);
  const landing: Point = [
    shaft.opening[0] - nx * (shaft.type === 'lift' ? (rect.y1 - rect.y0) / 2 : 1.0),
    shaft.opening[1] - ny * (shaft.type === 'lift' ? (rect.y1 - rect.y0) / 2 : 1.0),
  ];
  if (shaft.type === 'lift') {
    return { shaft, space: shaft.id, up, down, landing, ladderUp: null, ladderDown: null };
  }

  // Beyond the landing the well splits in two: one half holds the ladder up, the other is open
  // to the deck below. They swap sides on every deck, as the ladders zigzag down the well.
  const back = backArea(inner, side, LANDING_DEPTH - WALL);
  const halves =
    side === 'stbd' || side === 'port'
      ? [
          { ...back, x1: (back.x0 + back.x1) / 2 },
          { ...back, x0: (back.x0 + back.x1) / 2 },
        ]
      : [
          { ...back, y1: (back.y0 + back.y1) / 2 },
          { ...back, y0: (back.y0 + back.y1) / 2 },
        ];
  const [first, second] = deck % 2 === 0 ? [halves[0]!, halves[1]!] : [halves[1]!, halves[0]!];
  return {
    shaft,
    space: shaft.id,
    up,
    down,
    landing,
    ladderUp: up === null ? null : first,
    ladderDown: down === null ? null : second,
  };
}

function shaftInteractables(
  stop: ShaftStop,
  cellAt: (space: string, point: Point) => string,
): Interactable[] {
  const list: Interactable[] = [];
  if (stop.shaft.type === 'lift') {
    // Just inside the walls, so a look at the car's walls finds the lift, not the wall.
    const inner = inset(toArea(stop.shaft.rect), WALL + 0.05);
    list.push({
      id: `${stop.shaft.id}-panel`,
      label: 'Take the lift',
      action: { kind: 'lift', shaft: stop.shaft.id },
      cell: cellAt(stop.space, centre(inner)),
      area: inner,
      bottom: 0,
      top: ROOM_HEIGHT,
    });
    return list;
  }
  if (stop.ladderUp && stop.up !== null) {
    list.push({
      id: `${stop.shaft.id}-up`,
      label: `Climb up to Deck ${stop.up}`,
      action: { kind: 'ladder', shaft: stop.shaft.id, toDeck: stop.up },
      cell: cellAt(stop.space, centre(stop.ladderUp)),
      area: stop.ladderUp,
      bottom: 0,
      top: ROOM_HEIGHT,
    });
  }
  if (stop.ladderDown && stop.down !== null) {
    list.push({
      id: `${stop.shaft.id}-down`,
      label: `Climb down to Deck ${stop.down}`,
      action: { kind: 'ladder', shaft: stop.shaft.id, toDeck: stop.down },
      cell: cellAt(stop.space, centre(stop.ladderDown)),
      area: stop.ladderDown,
      bottom: -0.6,
      top: 1.1,
    });
  }
  return list;
}

/** A viewpoint for every room and every shaft stop on a deck. */
function deckBookmarks(layout: DeckLayout): [string, Bookmark][] {
  const deck = layout.deck.deck;
  const marks: [string, Bookmark][] = [];
  for (const space of layout.spaces) {
    if (space.kind !== 'room') continue;
    const view = roomView(
      space,
      layout.items.filter((item) => item.space === space.id),
    );
    if (view) marks.push([space.id, { deck, ...view }]);
  }
  for (const stop of layout.shafts) {
    const space = layout.spaces.find((candidate) => candidate.id === stop.space)!;
    const opening = space.openings.find((candidate) => candidate.kind === 'shaft')!;
    const into = opposite(opening.side);
    const [dx, dy] = direction(into);
    const x = stop.landing[0] - dx * 0.3;
    const y = stop.landing[1] - dy * 0.3;
    // Ladderwells: look down the well. The lift: look at the deck buttons, which build.ts puts
    // halfway along the wall on the frame's +x side: (cos yaw, sin yaw) on the plan.
    const turn = (facingYaw(into) * Math.PI) / 180;
    const [px, py] = [Math.cos(turn), Math.sin(turn)];
    const yaw =
      stop.shaft.type === 'lift' ? yawTowards(dx * 0.6 + px, dy * 0.6 + py) : yawTowards(dx, dy);
    marks.push([
      `${stop.shaft.id}-deck${deck}`,
      { deck, x, y, yaw, pitch: stop.shaft.type === 'lift' ? 6 : 18 },
    ]);
  }
  return marks;
}

/**
 * Just inside a room's first door, looking across the room the way the view runs furthest
 * before furniture gets in the way. Passages look along their length.
 */
function roomView(space: Space, items: readonly PlacedItem[]): Omit<Bookmark, 'deck'> | null {
  const { inner } = space;
  const mid = centre(inner);
  if (space.zone === 'passage') {
    const lengthwise = inner.x1 - inner.x0 >= inner.y1 - inner.y0;
    const x = lengthwise ? inner.x0 + 0.9 : mid[0];
    const y = lengthwise ? mid[1] : inner.y0 + 0.9;
    return { x, y, yaw: lengthwise ? 90 : 180, pitch: 2 };
  }
  const own = space.room?.doors[0];
  const opening =
    space.openings.find((candidate) => own && onOpening(space.rect, candidate, own)) ??
    space.openings.find((candidate) => candidate.kind !== 'window');
  if (!opening) return null;
  const at = openingPoint(space.rect, opening);
  const [dx, dy] = direction(opposite(opening.side));
  const x = at[0] + dx * VIEW_DEPTH;
  const y = at[1] + dy * VIEW_DEPTH;

  // Candidates: the middle of the room, and each corner pulled a metre in, except the corners
  // along the door's own wall (that view runs along the wall).
  const corners: Point[] = [
    [inner.x0 + 1, inner.y0 + 1],
    [inner.x1 - 1, inner.y0 + 1],
    [inner.x1 - 1, inner.y1 - 1],
    [inner.x0 + 1, inner.y1 - 1],
  ];
  const candidates = [mid, ...corners].filter(([tx, ty]) => {
    const length = Math.hypot(tx - x, ty - y);
    return length > 0.5 && ((tx - x) * dx + (ty - y) * dy) / length > 0.15;
  });
  const tall = items.filter((item) => item.top > 1.2 && !item.decor);
  let best = mid;
  let bestScore = -Infinity;
  for (const target of candidates) {
    const score = clearSight([x, y], target, tall) + (target === mid ? 0.5 : 0);
    if (score > bestScore) {
      best = target;
      bestScore = score;
    }
  }
  return { x, y, yaw: yawTowards(best[0] - x, best[1] - y), pitch: VIEW_PITCH };
}

/** How far you can see from `eye` towards `target` before a tall item is in the way (to 12 m). */
function clearSight(eye: Point, target: Point, items: readonly PlacedItem[]): number {
  const [ex, ey] = eye;
  const length = Math.hypot(target[0] - ex, target[1] - ey);
  const [ux, uy] = [(target[0] - ex) / length, (target[1] - ey) / length];
  let nearest = 12;
  for (const { area } of items) {
    // Slab test of the ray against the item's footprint.
    let near = 0;
    let far = nearest;
    for (const [origin, step, lo, hi] of [
      [ex, ux, area.x0, area.x1],
      [ey, uy, area.y0, area.y1],
    ] as const) {
      if (Math.abs(step) < EPSILON) {
        if (origin < lo || origin > hi) far = -1;
        continue;
      }
      const t0 = (lo - origin) / step;
      const t1 = (hi - origin) / step;
      near = Math.max(near, Math.min(t0, t1));
      far = Math.min(far, Math.max(t0, t1));
    }
    if (far >= near && near < nearest) nearest = near;
  }
  return nearest;
}

// ---- Helpers ---------------------------------------------------------------------------------

/** `area` with holes cut out, as up to four rectangles per hole. */
function subtract(area: Area, holes: readonly (Area | null | undefined)[]): Area[] {
  let pieces = [area];
  for (const hole of holes) {
    if (!hole) continue;
    pieces = pieces.flatMap((piece) => {
      const cut = intersect(piece, hole);
      if (!cut) return [piece];
      return [
        { ...piece, y1: cut.y0 },
        { ...piece, y0: cut.y1 },
        { x0: piece.x0, x1: cut.x0, y0: cut.y0, y1: cut.y1 },
        { x0: cut.x1, x1: piece.x1, y0: cut.y0, y1: cut.y1 },
      ].filter((rest) => rest.x1 - rest.x0 > EPSILON && rest.y1 - rest.y0 > EPSILON);
    });
  }
  return pieces;
}

/** The opening's centre on the space's rectangle edge. */
export function openingPoint(rect: Area, opening: Opening): Point {
  switch (opening.side) {
    case 'stbd':
      return [opening.at, rect.y0];
    case 'port':
      return [opening.at, rect.y1];
    case 'fwd':
      return [rect.x0, opening.at];
    case 'aft':
      return [rect.x1, opening.at];
  }
}

/** The point on the inside face of the wall, above the opening's centre. */
function wallFacePoint(space: Space, opening: Opening): Point {
  const [x, y] = openingPoint(space.rect, opening);
  const [dx, dy] = direction(opening.side);
  return [x - dx * WALL, y - dy * WALL];
}

function onOpening(rect: Area, opening: Opening, point: Point): boolean {
  const [x, y] = openingPoint(rect, opening);
  return Math.abs(x - point[0]) < EPSILON && Math.abs(y - point[1]) < EPSILON;
}

/** The part of `inner` beyond `depth` metres from the wall on `side`. */
function backArea(inner: Area, side: Facing, depth: number): Area {
  switch (side) {
    case 'stbd':
      return { ...inner, y0: inner.y0 + depth };
    case 'port':
      return { ...inner, y1: inner.y1 - depth };
    case 'fwd':
      return { ...inner, x0: inner.x0 + depth };
    case 'aft':
      return { ...inner, x1: inner.x1 - depth };
  }
}

function nearestCell(cells: readonly Cell[], x: number, y: number): Cell | undefined {
  let best: Cell | undefined;
  let bestDistance = Infinity;
  for (const cell of cells) {
    const [cx, cy] = centre(cell.area);
    const distance = Math.hypot(cx - x, cy - y);
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function groupBy<T>(list: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const group = groups.get(k);
    if (group) group.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
