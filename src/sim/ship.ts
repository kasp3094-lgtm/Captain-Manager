/**
 * The ship's layout as the game uses it: which room is at a point, the nearest point of interest,
 * and the rules every deck plan must follow (checked by `npm run validate` and the unit tests).
 *
 * Pure functions on the data from content/ship/ (types in src/content/ship.ts). No 3D and no
 * browser code, so the game, the map, the tests and the content validator all share it.
 */
import type { Deck, Poi, Point, Rect, Room, Shaft, Ship } from '../content/ship';

/** The design calls for at least this many racks aboard (Act 1 spec §3.1). */
export const MIN_RACKS = 50;

const EPSILON = 1e-6;
/** How far past a door to look for the room on the other side, in metres. */
const STEP_THROUGH = 0.1;
/** Doors and shaft openings must sit at least this far from a corner, in metres. */
const CORNER_CLEARANCE = 0.5;

/** Rooms you can walk into. Tanks and voids are drawn on the map but never entered. */
function isWalkable(room: Room): boolean {
  return room.type !== 'tank';
}

/** The room on this deck at (x, y). On a doorway's threshold the room wins over the passage. */
export function roomAt(deck: Deck, x: number, y: number): Room | null {
  let passage: Room | null = null;
  for (const room of deck.rooms) {
    if (!isWalkable(room) || !rectContains(room.rect, x, y)) continue;
    if (room.type !== 'passage') return room;
    passage ??= room;
  }
  return passage;
}

/** Finds a room anywhere aboard by id. */
export function findRoom(ship: Ship, id: string): { deck: Deck; room: Room } | null {
  for (const deck of ship.decks) {
    const room = deck.rooms.find((candidate) => candidate.id === id);
    if (room) return { deck, room };
  }
  return null;
}

/** Ladders and lifts that stop at this deck. */
export function shaftsOnDeck(ship: Ship, deck: number): Shaft[] {
  return ship.shafts.filter((shaft) => shaft.decks.includes(deck));
}

export interface PoiHit {
  readonly poi: Poi;
  readonly room: Room;
  /** Metres from the query point. */
  readonly distance: number;
}

/** The closest point of interest on this deck within `maxDistance` metres, if any. */
export function nearestPoi(deck: Deck, x: number, y: number, maxDistance: number): PoiHit | null {
  let best: PoiHit | null = null;
  for (const room of deck.rooms) {
    for (const poi of room.pois) {
      const distance = Math.hypot(poi.at[0] - x, poi.at[1] - y);
      if (distance <= maxDistance && (!best || distance < best.distance)) {
        best = { poi, room, distance };
      }
    }
  }
  return best;
}

/** Bunks aboard, across every deck. */
export function rackCount(ship: Ship): number {
  return ship.decks.reduce(
    (sum, deck) => sum + deck.rooms.reduce((deckSum, room) => deckSum + (room.racks ?? 0), 0),
    0,
  );
}

/**
 * Every problem with the layout, as sentences a designer can act on. Empty when the ship is
 * sound: unique ids, rooms inside the hull and not overlapping, doors and shaft openings that
 * lead into a room, points of interest inside their room, enough racks, and every room
 * reachable on foot from the start room.
 */
export function checkShip(ship: Ship): string[] {
  const problems: string[] = [];

  const deckNumbers = new Set<number>();
  for (const deck of ship.decks) {
    if (deckNumbers.has(deck.deck)) problems.push(`deck ${deck.deck} is defined twice`);
    deckNumbers.add(deck.deck);
  }

  const usedIds = new Map<string, string>();
  const claimId = (id: string, where: string): void => {
    const first = usedIds.get(id);
    if (first) problems.push(`${where}: id "${id}" is already used by ${first}`);
    else usedIds.set(id, where);
  };

  for (const shaft of ship.shafts) {
    claimId(shaft.id, `shaft ${shaft.id}`);
    for (const deck of shaft.decks) {
      if (!deckNumbers.has(deck)) problems.push(`shaft ${shaft.id}: deck ${deck} does not exist`);
    }
    if (!outwardNormal(shaft.rect, shaft.opening)) {
      problems.push(`shaft ${shaft.id}: opening at [${shaft.opening}] is not on its edge`);
    }
  }

  for (const deck of ship.decks) {
    const shafts = shaftsOnDeck(ship, deck.deck);
    deck.rooms.forEach((room, index) => {
      const where = `deck ${deck.deck} / ${room.id}`;
      claimId(room.id, where);

      const outside = corners(room.rect).find((corner) => !polygonContains(deck.hull, corner));
      if (outside) problems.push(`${where}: sticks out of the hull at [${outside}]`);

      for (const other of deck.rooms.slice(index + 1)) {
        if (rectsOverlap(room.rect, other.rect)) problems.push(`${where}: overlaps ${other.id}`);
      }
      for (const shaft of shafts) {
        if (rectsOverlap(room.rect, shaft.rect)) problems.push(`${where}: overlaps ${shaft.id}`);
      }

      if (!isWalkable(room) && (room.doors.length > 0 || room.racks || room.pois.length > 0)) {
        problems.push(`${where}: tanks and voids can't have doors, racks or points of interest`);
      }
      if (room.hotRacked && !room.racks) problems.push(`${where}: hotRacked needs racks`);

      for (const door of room.doors) {
        const beyond = roomBeyond(deck, room.rect, door, room);
        if (beyond === undefined) {
          problems.push(
            `${where}: door at [${door}] is not on the room's edge, or too near a corner`,
          );
        } else if (beyond === null) {
          problems.push(`${where}: door at [${door}] leads nowhere`);
        }
      }

      for (const poi of room.pois) {
        if (!rectContains(room.rect, poi.at[0], poi.at[1])) {
          problems.push(`${where}: "${poi.name}" at [${poi.at}] is outside the room`);
        }
      }
    });

    for (const shaft of shafts) {
      const where = `deck ${deck.deck} / ${shaft.id}`;
      const outside = corners(shaft.rect).find((corner) => !polygonContains(deck.hull, corner));
      if (outside) problems.push(`${where}: sticks out of the hull at [${outside}]`);
      if (roomBeyond(deck, shaft.rect, shaft.opening) === null) {
        problems.push(`${where}: opening at [${shaft.opening}] leads nowhere`);
      }
    }
  }

  const racks = rackCount(ship);
  if (racks < MIN_RACKS) {
    problems.push(`only ${racks} racks aboard; the design needs at least ${MIN_RACKS}`);
  }

  problems.push(...unreachableRooms(ship));
  return problems;
}

/** Walks the ship from the start room through doors, ladders and the lift. */
function unreachableRooms(ship: Ship): string[] {
  const start = findRoom(ship, ship.startRoom);
  if (!start) return [`startRoom "${ship.startRoom}" is not a room on any deck`];

  const links = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    if (!links.has(a)) links.set(a, new Set());
    if (!links.has(b)) links.set(b, new Set());
    links.get(a)!.add(b);
    links.get(b)!.add(a);
  };
  // A shaft is one node per deck it serves, linked to the room at its opening.
  const stop = (shaft: Shaft, deck: number): string => `${shaft.id}@${deck}`;

  for (const deck of ship.decks) {
    for (const room of deck.rooms) {
      for (const door of room.doors) {
        const beyond = roomBeyond(deck, room.rect, door, room);
        if (beyond) link(room.id, beyond.id);
      }
    }
    for (const shaft of shaftsOnDeck(ship, deck.deck)) {
      const beyond = roomBeyond(deck, shaft.rect, shaft.opening);
      if (beyond) link(stop(shaft, deck.deck), beyond.id);
    }
  }
  for (const shaft of ship.shafts) {
    shaft.decks
      .slice(1)
      .forEach((deck, i) => link(stop(shaft, shaft.decks[i]!), stop(shaft, deck)));
  }

  const reached = new Set([start.room.id]);
  const queue = [start.room.id];
  for (let node = queue.shift(); node !== undefined; node = queue.shift()) {
    for (const next of links.get(node) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }

  return ship.decks.flatMap((deck) =>
    deck.rooms
      .filter((room) => isWalkable(room) && !reached.has(room.id))
      .map(
        (room) => `deck ${deck.deck} / ${room.id}: can't be reached on foot from ${ship.startRoom}`,
      ),
  );
}

/**
 * The walkable room just past a door or opening at `point` on the edge of `rect`.
 * `undefined` when the point isn't on the edge (or is too near a corner), `null` when nothing is
 * on the other side.
 */
function roomBeyond(deck: Deck, rect: Rect, point: Point, self?: Room): Room | null | undefined {
  const normal = outwardNormal(rect, point);
  if (!normal) return undefined;
  const x = point[0] + normal[0] * STEP_THROUGH;
  const y = point[1] + normal[1] * STEP_THROUGH;
  return (
    deck.rooms.find((room) => room !== self && isWalkable(room) && rectContains(room.rect, x, y)) ??
    null
  );
}

/** The way out of a rectangle through a point on its edge, or null if the point isn't on an edge. */
function outwardNormal([x, y, width, depth]: Rect, [px, py]: Point): Point | null {
  const alongTop =
    px >= x + CORNER_CLEARANCE - EPSILON && px <= x + width - CORNER_CLEARANCE + EPSILON;
  const alongSide =
    py >= y + CORNER_CLEARANCE - EPSILON && py <= y + depth - CORNER_CLEARANCE + EPSILON;
  if (Math.abs(px - x) < EPSILON && alongSide) return [-1, 0];
  if (Math.abs(px - (x + width)) < EPSILON && alongSide) return [1, 0];
  if (Math.abs(py - y) < EPSILON && alongTop) return [0, -1];
  if (Math.abs(py - (y + depth)) < EPSILON && alongTop) return [0, 1];
  return null;
}

function rectContains([x, y, width, depth]: Rect, px: number, py: number): boolean {
  return (
    px >= x - EPSILON && px <= x + width + EPSILON && py >= y - EPSILON && py <= y + depth + EPSILON
  );
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  const width = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
  const depth = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
  return width > EPSILON && depth > EPSILON;
}

function corners([x, y, width, depth]: Rect): Point[] {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + depth],
    [x, y + depth],
  ];
}

/** Inside the polygon or on its outline. */
function polygonContains(polygon: readonly Point[], [px, py]: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    if (distanceToSegment(px, py, xi, yi, xj, yj) < 1e-4) return true;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
