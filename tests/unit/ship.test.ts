import { describe, expect, it } from 'vitest';
import { ship } from '../../src/content/gameContent';
import { assembleShip, type Deck, type Ship } from '../../src/content/ship';
import { MIN_RACKS, checkShip, findRoom, nearestPoi, rackCount, roomAt } from '../../src/sim/ship';

/** Two decks of one cabin and a passage each, joined by a ladder. Sound as built. */
function tinyShip(): Ship {
  const deck = (n: number): Deck => ({
    deck: n,
    name: `Deck ${n}`,
    hull: [
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ],
    rooms: [
      {
        id: `passage-${n}`,
        name: 'Passage',
        code: `${n}-0-0-L`,
        type: 'passage',
        rect: [0, 4, 20, 2],
        doors: [],
        pois: [],
      },
      {
        id: `cabin-${n}`,
        name: 'Cabin',
        code: `${n}-2-1-L`,
        type: 'berthing',
        rect: [2, 0, 6, 4],
        doors: [[5, 4]],
        racks: 30,
        pois: [{ name: 'Bunk', kind: 'rest', at: [3, 1] }],
      },
    ],
  });
  return assembleShip(
    {
      name: 'Test',
      class: 'Test',
      startRoom: 'cabin-1',
      shafts: [
        {
          id: 'ladder',
          name: 'Ladder',
          type: 'ladder',
          rect: [10, 6, 2, 2],
          opening: [11, 6],
          decks: [1, 2],
        },
      ],
    },
    [deck(1), deck(2)],
  );
}

/** A copy of the tiny ship with one change, for testing a single rule. */
function brokenShip(
  change: (ship: { decks: Deck[]; startRoom: string; shafts: Ship['shafts'] }) => void,
): Ship {
  const copy = structuredClone(tinyShip()) as unknown as {
    decks: Deck[];
    startRoom: string;
    shafts: Ship['shafts'];
  };
  change(copy);
  return copy as unknown as Ship;
}

function cabin(copy: { decks: Deck[] }, deck: number) {
  return copy.decks[deck - 1]!.rooms[1]!;
}

describe('the real ship', () => {
  it('passes every layout rule', () => {
    expect(checkShip(ship)).toEqual([]);
  });

  it('has 76 racks, more than the 50 the design needs', () => {
    expect(rackCount(ship)).toBe(76);
    expect(rackCount(ship)).toBeGreaterThanOrEqual(MIN_RACKS);
  });

  it('has four decks, top to bottom', () => {
    expect(ship.decks.map((deck) => deck.deck)).toEqual([1, 2, 3, 4]);
  });
});

describe('layout queries', () => {
  const deck2 = findRoom(ship, 'junior-berthing-a')!.deck;

  it('finds the room at a point', () => {
    expect(roomAt(deck2, 35, 12)?.id).toBe('junior-berthing-a');
    expect(roomAt(deck2, 35, 8)?.id).toBe('passage-2');
    expect(roomAt(deck2, 70, 12)).toBeNull(); // the fresh water tank: not walkable
  });

  it('puts a doorway threshold in the room, not the passage outside', () => {
    expect(roomAt(deck2, 30, 12)?.id).toBe('junior-berthing-a');
  });

  it('finds the nearest point of interest within range', () => {
    expect(nearestPoi(deck2, 30.8, 13.2, 3)?.poi.name).toBe('Fire extinguisher');
    expect(nearestPoi(deck2, 35, 8, 0.5)).toBeNull();
  });
});

describe('checkShip catches', () => {
  it('nothing on a sound ship', () => {
    expect(checkShip(tinyShip())).toEqual([]);
  });

  it('overlapping rooms', () => {
    const problems = checkShip(brokenShip((s) => (cabin(s, 1).rect = [2, 0, 6, 5])));
    expect(problems.join('\n')).toMatch(/passage-1: overlaps cabin-1/);
  });

  it('rooms sticking out of the hull', () => {
    const problems = checkShip(brokenShip((s) => (cabin(s, 1).rect = [-1, 0, 6, 4])));
    expect(problems.join('\n')).toMatch(/cabin-1: sticks out of the hull/);
  });

  it('doors that lead nowhere', () => {
    const problems = checkShip(brokenShip((s) => (cabin(s, 1).doors = [[5, 0]])));
    expect(problems.join('\n')).toMatch(/cabin-1: door at \[5,0\] leads nowhere/);
  });

  it('doors that are not on the edge', () => {
    const problems = checkShip(brokenShip((s) => (cabin(s, 1).doors = [[5, 2]])));
    expect(problems.join('\n')).toMatch(/not on the room's edge/);
  });

  it('rooms that cannot be reached', () => {
    const problems = checkShip(brokenShip((s) => (cabin(s, 2).doors = [])));
    expect(problems).toContain("deck 2 / cabin-2: can't be reached on foot from cabin-1");
  });

  it('ladder openings that lead nowhere', () => {
    const problems = checkShip(brokenShip((s) => (s.shafts[0]!.opening = [11, 8])));
    expect(problems.join('\n')).toMatch(/ladder: opening at \[11,8\] leads nowhere/);
  });

  it('too few racks', () => {
    const problems = checkShip(
      brokenShip((s) => {
        cabin(s, 1).racks = 10;
        cabin(s, 2).racks = 10;
      }),
    );
    expect(problems).toContain(`only 20 racks aboard; the design needs at least ${MIN_RACKS}`);
  });

  it('ids used twice', () => {
    const problems = checkShip(brokenShip((s) => (cabin(s, 2).id = 'cabin-1')));
    expect(problems.join('\n')).toMatch(/id "cabin-1" is already used/);
  });

  it('points of interest outside their room', () => {
    const problems = checkShip(brokenShip((s) => (cabin(s, 1).pois[0]!.at = [15, 1])));
    expect(problems.join('\n')).toMatch(/"Bunk" at \[15,1\] is outside the room/);
  });

  it('a start room that does not exist', () => {
    const problems = checkShip(brokenShip((s) => (s.startRoom = 'galley')));
    expect(problems).toContain('startRoom "galley" is not a room on any deck');
  });
});
