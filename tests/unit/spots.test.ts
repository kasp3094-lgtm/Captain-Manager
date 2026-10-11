import { describe, expect, it } from 'vitest';
import { crew, ship } from '../../src/content/gameContent';
import { buildRoster } from '../../src/sim/crew';
import { blockAt, dayPlan } from '../../src/sim/schedule';
import { direction } from '../../src/world/ship/coords';
import { planShip } from '../../src/world/ship/layout';
import { deckSpots, type Spot } from '../../src/world/ship/spots';
import {
  findPath,
  isFree,
  nearestFree,
  reachableFrom,
  walkGrid,
} from '../../src/world/ship/walkgrid';

const layout = planShip(ship);
const roster = buildRoster(crew, ship);
const CREW_RADIUS = 0.25;
const decks = layout.decks.map((deck) => {
  const grid = walkGrid(deck, CREW_RADIUS);
  return { deck, grid, spots: deckSpots(deck, grid) };
});
const allSpots: Spot[] = decks.flatMap((d) => d.spots);

describe('spots', () => {
  it('has a bunk for every rack, numbered as the roster numbers them', () => {
    for (const deck of ship.decks) {
      for (const room of deck.rooms) {
        if (!room.racks) continue;
        const racks = allSpots
          .filter((spot) => spot.space === room.id && spot.rack !== null)
          .map((spot) => spot.rack);
        expect(
          racks.sort((a, b) => a! - b!),
          room.id,
        ).toEqual(Array.from({ length: room.racks }, (_, i) => i));
      }
    }
  });

  it('has enough work spots for everyone on duty in a room at once', () => {
    const plans = roster.members.map((member) => dayPlan(member, crew.routine, 0));
    const peak = new Map<string, number>();
    for (let t = 0; t < 1440; t += 10) {
      const here = new Map<string, number>();
      for (const plan of plans) {
        const block = blockAt(plan, t);
        if (block.activity !== 'duty' && block.activity !== 'patrol') continue;
        here.set(block.room, (here.get(block.room) ?? 0) + 1);
      }
      for (const [room, count] of here) peak.set(room, Math.max(peak.get(room) ?? 0, count));
    }
    for (const [room, count] of peak) {
      const spots = allSpots.filter(
        (spot) =>
          spot.space === room && (spot.uses.includes('duty') || spot.uses.includes('patrol')),
      );
      expect(spots.length, `${room} needs ${count}`).toBeGreaterThanOrEqual(count);
    }
  });

  it('has somewhere to eat and to wash in every mess and head', () => {
    for (const room of Object.values(crew.routine.mess)) {
      expect(
        allSpots.some((s) => s.space === room && s.uses.includes('eat')),
        room,
      ).toBe(true);
    }
    for (const room of Object.values(crew.routine.heads)) {
      expect(
        allSpots.some((s) => s.space === room && s.uses.includes('wash')),
        room,
      ).toBe(true);
    }
  });

  it('can be walked to: every spot is reached from the passageway', () => {
    for (const { deck, grid, spots } of decks) {
      const passage = deck.spaces.find((space) => space.zone === 'passage')!;
      const start = nearestFree(
        grid,
        (passage.inner.x0 + passage.inner.x1) / 2,
        (passage.inner.y0 + passage.inner.y1) / 2,
      )!;
      const reached = reachableFrom(grid, start);
      for (const spot of spots) {
        expect(reached(...spot.approach), `deck ${deck.deck.deck}: ${spot.id} (${spot.kind})`).toBe(
          true,
        );
        if (spot.pose === 'stand' || spot.pose === 'work')
          expect(isFree(grid, spot.x, spot.y)).toBe(true);
      }
    }
  });
});

describe('doorways', () => {
  it('stay clear: nobody stands in front of a door', () => {
    for (const { deck, spots } of decks) {
      for (const doorway of deck.doorways) {
        for (const side of doorway.sides) {
          // A step into the space, in the middle of the doorway.
          const [dx, dy] = direction(side.into);
          const [x, y] = [doorway.at[0] + dx * 0.6, doorway.at[1] + dy * 0.6];
          const blocking = spots.filter(
            (spot) =>
              (spot.pose === 'stand' || spot.pose === 'work') &&
              Math.abs(spot.x - x) < 0.5 &&
              Math.abs(spot.y - y) < 0.5,
          );
          expect(
            blocking.map((spot) => spot.id),
            `${side.space} door at ${doorway.at}`,
          ).toEqual([]);
        }
      }
    }
  });
});

describe('walking', () => {
  it('finds a way between any two rooms of a deck, without going through walls', () => {
    for (const { deck, grid } of decks) {
      const rooms = deck.spaces.filter((space) => space.kind === 'room');
      const points = rooms.map((room) =>
        nearestFree(
          grid,
          (room.inner.x0 + room.inner.x1) / 2,
          (room.inner.y0 + room.inner.y1) / 2,
          3,
        ),
      );
      for (let i = 0; i < rooms.length; i += 3) {
        for (let j = 1; j < rooms.length; j += 4) {
          const [a, b] = [points[i], points[j]];
          if (!a || !b) continue;
          const path = findPath(grid, a, b);
          expect(path, `${rooms[i]!.id} → ${rooms[j]!.id}`).not.toBeNull();
          // Every leg of the straightened path stays on free floor.
          for (let k = 1; k < path!.length; k++) {
            const [[ax, ay], [bx, by]] = [path![k - 1]!, path![k]!];
            for (let t = 0; t <= 1; t += 0.05) {
              expect(isFree(grid, ax + (bx - ax) * t, ay + (by - ay) * t)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('goes round furniture rather than through it', () => {
    const deck2 = decks.find((d) => d.deck.deck.deck === 2)!;
    // Across the crew mess, past the tables.
    const path = findPath(
      deck2.grid,
      nearestFree(deck2.grid, 30, 5)!,
      nearestFree(deck2.grid, 42, 5)!,
    )!;
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(findPath(deck2.grid, [35, 0.5], [36, 5])).toBeNull();
  });
});
