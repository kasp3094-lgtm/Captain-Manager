import { describe, expect, it } from 'vitest';
import { balance, ship } from '../../src/content/gameContent';
import { assembleShip, type Deck, type Ship } from '../../src/content/ship';
import { rackCount } from '../../src/sim/ship';
import { areasOverlap, distanceTo, grow, type Area } from '../../src/world/ship/coords';
import { DOOR_ZONE, doorZone } from '../../src/world/ship/fits';
import { MAX_FIXTURES, planShip, type DeckLayout } from '../../src/world/ship/layout';

const layout = planShip(ship);
const RADIUS = balance.player.radius;

describe('planShip on the real ship', () => {
  it('fits everything the deck plans ask for', () => {
    expect(layout.problems).toEqual([]);
  });

  it('builds every rack in the plans, room by room', () => {
    const built = new Map<string, number>();
    for (const deck of layout.decks) {
      for (const item of deck.items)
        built.set(item.space, (built.get(item.space) ?? 0) + item.racks);
    }
    for (const deck of ship.decks) {
      for (const room of deck.rooms) expect(built.get(room.id) ?? 0, room.id).toBe(room.racks ?? 0);
    }
    expect([...built.values()].reduce((a, b) => a + b, 0)).toBe(rackCount(ship));
  });

  it('never needs more than six lights on one surface', () => {
    for (const deck of layout.decks) {
      for (const cell of deck.cells) {
        expect(cell.fixtures.length, cell.id).toBeGreaterThanOrEqual(1);
        expect(cell.fixtures.length, cell.id).toBeLessThanOrEqual(MAX_FIXTURES);
        // Its own lights, the nearest light of each neighbour, and the ambient light.
        expect(cell.fixtures.length + cell.neighbours.length + 1, cell.id).toBeLessThanOrEqual(6);
      }
    }
  });

  it('keeps furniture inside its room, out of doorways and out of other furniture', () => {
    for (const deck of layout.decks) {
      for (const space of deck.spaces) {
        const items = deck.items.filter((item) => item.space === space.id);
        const zones = space.openings
          .filter((opening) => opening.kind !== 'window')
          .map((opening) => doorZone(space, opening));
        for (const item of items) {
          const where = `${space.id} / ${item.kind}`;
          expect(within(item.area, space.inner), where).toBe(true);
          if (!item.blocks) continue;
          expect(
            zones.some((zone) => areasOverlap(zone, item.area)),
            where,
          ).toBe(false);
          for (const other of items) {
            if (other === item || !other.blocks) continue;
            expect(areasOverlap(other.area, item.area), `${where} overlaps ${other.kind}`).toBe(
              false,
            );
          }
        }
      }
    }
  });

  it('builds something at every point of interest', () => {
    for (const deck of layout.decks) {
      for (const space of deck.spaces) {
        for (const poi of space.room?.pois ?? []) {
          const items = deck.items.filter((item) => item.space === space.id);
          const nearest = Math.min(...items.map((item) => distanceTo(item.area, ...poi.at)));
          expect(nearest, `${space.id} / ${poi.name}`).toBeLessThanOrEqual(1);
          if (poi.prop) {
            expect(items.find((item) => item.poi === poi.name)?.kind, poi.name).toBe(poi.prop);
          }
        }
      }
    }
  });

  it('signs every room with a door, with its compartment number', () => {
    for (const deck of layout.decks) {
      const signed = new Set(deck.signs.flatMap((sign) => sign.lines));
      for (const room of deck.deck.rooms) {
        if (room.doors.length > 0) expect(signed.has(room.code), room.id).toBe(true);
      }
    }
  });

  it('leaves a gap in the walls on both sides of every door', () => {
    for (const deck of layout.decks) {
      for (const doorway of deck.doorways) {
        const [x, y] = doorway.at;
        const half = doorway.width / 2 - 0.01;
        const gap: Area =
          doorway.along === 'x'
            ? { x0: x - half, x1: x + half, y0: y - 0.1, y1: y + 0.1 }
            : { x0: x - 0.1, x1: x + 0.1, y0: y - half, y1: y + half };
        const blocking = deck.walls.filter(
          (wall) => wall.bottom < 1 && areasOverlap(wall.area, gap),
        );
        expect(blocking, `door at [${doorway.at}]`).toEqual([]);
      }
    }
  });

  it('gives every room a viewpoint, and spawns in the start room', () => {
    for (const deck of ship.decks) {
      for (const room of deck.rooms) {
        if (room.type !== 'tank') expect(layout.bookmarks.has(room.id), room.id).toBe(true);
      }
    }
    const spawn = layout.bookmarks.get('spawn');
    expect(spawn).toEqual(layout.bookmarks.get(ship.startRoom));
  });

  it('lets the captain walk to every viewpoint and every ladder on each deck', () => {
    for (const deck of layout.decks) {
      const grid = walkable(deck);
      const passage = deck.spaces.find((space) => space.zone === 'passage')!;
      const reached = flood(grid, layout.bookmarks.get(passage.id)!);
      const targets: [string, number, number][] = [
        ...[...layout.bookmarks]
          .filter(([name, mark]) => mark.deck === deck.deck.deck && name !== 'spawn')
          .map(([name, mark]): [string, number, number] => [name, mark.x, mark.y]),
        ...deck.shafts.map((stop): [string, number, number] => [stop.shaft.id, ...stop.landing]),
      ];
      for (const [name, x, y] of targets) {
        expect(
          reached(x, y),
          `deck ${deck.deck.deck}: ${name} at [${x.toFixed(1)}, ${y.toFixed(1)}]`,
        ).toBe(true);
      }
    }
  });

  it('puts ladders up and down only where the shaft goes on', () => {
    for (const deck of layout.decks) {
      for (const stop of deck.shafts) {
        const decks = stop.shaft.decks;
        const n = deck.deck.deck;
        expect(stop.up, stop.shaft.id).toBe(n === Math.min(...decks) ? null : n - 1);
        expect(stop.down, stop.shaft.id).toBe(n === Math.max(...decks) ? null : n + 1);
        const labels = deck.interactables.map((thing) => thing.label);
        if (stop.shaft.type === 'ladder') {
          if (stop.up !== null) expect(labels).toContain(`Climb up to Deck ${stop.up}`);
          if (stop.down !== null) expect(labels).toContain(`Climb down to Deck ${stop.down}`);
        }
      }
    }
  });
});

describe('furnishing a room', () => {
  /** One deck: a 6 × 4 m cabin over a passage, door in the middle of the cabin's port wall. */
  function cabinShip(pois: Deck['rooms'][number]['pois'], fit?: 'stores'): Ship {
    return assembleShip({ name: 'T', class: 'T', startRoom: 'cabin', shafts: [] }, [
      {
        deck: 1,
        name: 'Deck',
        hull: [
          [0, 0],
          [10, 0],
          [10, 8],
          [0, 8],
        ],
        rooms: [
          {
            id: 'cabin',
            name: 'Cabin',
            code: '1-2-1-L',
            type: 'habitation',
            fit,
            rect: [2, 0, 6, 4],
            doors: [[5, 4]],
            pois,
          },
          {
            id: 'passage',
            name: 'P',
            code: '1-0-0-L',
            type: 'passage',
            rect: [0, 4, 10, 2],
            doors: [],
            pois: [],
          },
        ],
      },
    ]);
  }

  it('stands a prop near a wall with its back to that wall', () => {
    const { decks } = planShip(
      cabinShip([{ name: 'Racks', kind: 'machinery', at: [3.5, 0.6], prop: 'equipment-racks' }]),
    );
    const item = decks[0]!.items.find((candidate) => candidate.poi === 'Racks')!;
    expect(item.facing).toBe('port');
    expect(item.area.y0).toBeCloseTo(0.1);
  });

  it('reports a prop that would block the door', () => {
    const { problems } = planShip(
      cabinShip([
        { name: 'Lathe', kind: 'machinery', at: [5, 3.2], prop: 'lathe', facing: 'port' },
      ]),
    );
    expect(problems).toEqual([expect.stringMatching(/cabin: "Lathe" \(lathe\) doesn't fit/)]);
  });

  it('asks for a facing when a prop stands away from the walls', () => {
    const { problems } = planShip(
      cabinShip([{ name: 'Table', kind: 'social', at: [5, 2], prop: 'holotable' }]),
    );
    expect(problems).toEqual([expect.stringMatching(/give it a facing/)]);
  });

  it('keeps the doorway clear when filling a room', () => {
    const { decks } = planShip(cabinShip([], 'stores'));
    const deck = decks[0]!;
    const cabin = deck.spaces.find((space) => space.id === 'cabin')!;
    const zone = doorZone(cabin, cabin.openings[0]!);
    expect(zone.x1 - zone.x0).toBeCloseTo(DOOR_ZONE.width);
    expect(deck.items.length).toBeGreaterThan(2);
    for (const item of deck.items) expect(areasOverlap(item.area, zone), item.kind).toBe(false);
  });
});

// ---- Walking on a grid ----------------------------------------------------------------------

const CELL = 0.1;

/** Which 10 cm squares of a deck the captain's body can stand on. */
function walkable(deck: DeckLayout) {
  const xs = deck.spaces.flatMap((space) => [space.rect.x0, space.rect.x1]);
  const ys = deck.spaces.flatMap((space) => [space.rect.y0, space.rect.y1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const columns = Math.ceil((Math.max(...xs) - x0) / CELL);
  const rows = Math.ceil((Math.max(...ys) - y0) / CELL);
  const free = new Uint8Array(columns * rows);
  const blockers = deck.blockers
    .filter((slab) => slab.bottom < 1.7)
    .map((slab) => grow(slab.area, RADIUS));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = x0 + (column + 0.5) * CELL;
      const y = y0 + (row + 0.5) * CELL;
      const inside = deck.spaces.some((space) => within1(space.rect, x, y));
      const blocked = blockers.some((area) => within1(area, x, y));
      free[row * columns + column] = inside && !blocked ? 1 : 0;
    }
  }
  return { x0, y0, columns, rows, free };
}

/** Every square reachable from `start`; returns a test for a point. */
function flood(grid: ReturnType<typeof walkable>, start: { x: number; y: number }) {
  const { x0, y0, columns, rows, free } = grid;
  const index = (x: number, y: number) => {
    const column = Math.floor((x - x0) / CELL);
    const row = Math.floor((y - y0) / CELL);
    return column < 0 || row < 0 || column >= columns || row >= rows ? -1 : row * columns + column;
  };
  const seen = new Uint8Array(free.length);
  const first = index(start.x, start.y);
  const queue = free[first] ? [first] : [];
  if (free[first]) seen[first] = 1;
  while (queue.length > 0) {
    const at = queue.pop()!;
    const column = at % columns;
    for (const next of [at - 1, at + 1, at - columns, at + columns]) {
      if (next < 0 || next >= free.length || seen[next] || !free[next]) continue;
      if ((next === at - 1 && column === 0) || (next === at + 1 && column === columns - 1))
        continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return (x: number, y: number) => {
    const at = index(x, y);
    return at >= 0 && seen[at] === 1;
  };
}

function within(inner: Area, outer: Area): boolean {
  const e = 1e-6;
  return (
    inner.x0 >= outer.x0 - e &&
    inner.y0 >= outer.y0 - e &&
    inner.x1 <= outer.x1 + e &&
    inner.y1 <= outer.y1 + e
  );
}

function within1(area: Area, x: number, y: number): boolean {
  return x > area.x0 && x < area.x1 && y > area.y0 && y < area.y1;
}
