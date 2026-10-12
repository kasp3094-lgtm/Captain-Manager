import { describe, expect, it } from 'vitest';
import { minutes } from '../../src/content/crew';
import { balance, crew, ship } from '../../src/content/gameContent';
import { buildRoster } from '../../src/sim/crew';
import { DAY, blockAt, dayPlan } from '../../src/sim/schedule';
import { CrewLife, crewMap, type CaptainAt, type CrewView } from '../../src/world/crew/life';
import { planShip } from '../../src/world/ship/layout';
import { isFree, nearestFree } from '../../src/world/ship/walkgrid';

const layout = planShip(ship);
const map = crewMap(layout);
const roster = buildRoster(crew, ship);
const tuning = { ...balance.crew, minutesPerSecond: balance.time.minutesPerSecond };
const RATE = balance.time.minutesPerSecond;

function startAt(time: string, seed = 7): { life: CrewLife; now: number } {
  const now = minutes(time);
  return { life: new CrewLife(map, roster.members, crew.routine, tuning, now, seed), now };
}

/** Steps of crew time, in seconds: a few frames' worth. */
const STEP = 0.25;

/** Runs the crew for `span` ship minutes; calls `each` after every step. */
function run(
  life: CrewLife,
  from: number,
  span: number,
  each?: (now: number) => void,
  captain: CaptainAt | null = null,
): number {
  let now = from;
  for (let t = 0; t < span / (RATE * STEP) - 1e-9; t++) {
    now += RATE * STEP;
    life.update(STEP, now, captain);
    each?.(now);
  }
  return now;
}

function blockOf(person: CrewView, now: number) {
  const day = Math.floor(now / DAY);
  return blockAt(dayPlan(person.member, crew.routine, day), now - day * DAY);
}

describe('crew life', () => {
  it('starts everyone in the room their plan of the day says, at a spot of their own', () => {
    const { life, now } = startAt('07:50');
    for (const person of life.people) {
      expect(person.settled, person.member.id).toBe(true);
      expect(person.space, person.member.id).toBe(blockOf(person, now).room);
    }
    // Nobody stands, sits or lies where someone else is.
    const placed = life.people.filter((person) => person.visible);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const [a, b] = [placed[i]!, placed[j]!];
        if (a.deck !== b.deck) continue;
        const gap = Math.hypot(a.x - b.x, a.y - b.y, a.lift - b.lift);
        expect(gap, `${a.member.id} and ${b.member.id}`).toBeGreaterThan(0.25);
      }
    }
  });

  it('starts the day over for a loaded game, with whoever an event needs where it needs them', () => {
    const { life, now } = startAt('07:50');
    run(life, now, 20);
    const loaded = minutes('13:20');
    life.restart(loaded, new Map([['sethi', 'hangar']]));
    for (const person of life.people) {
      expect(person.settled, person.member.id).toBe(true);
      const room = person.member.id === 'sethi' ? 'hangar' : blockOf(person, loaded).room;
      expect(person.space, person.member.id).toBe(room);
    }
    // Waiting there until let go.
    run(life, loaded, 15);
    expect(life.person('sethi')!.space).toBe('hangar');
    life.dismiss('sethi');
    const later = run(life, loaded + 15, 15);
    expect(life.person('sethi')!.space).not.toBe('hangar');
    expect(blockOf(life.person('sethi')!, later).room).not.toBe('hangar');
  });

  it('changes the watch at 0800: the new watch takes over the bridge', () => {
    const { life, now } = startAt('07:50');
    const onBridge = () =>
      life.people.filter(
        (person) => person.settled && person.space === 'bridge' && person.activity === 'duty',
      );
    expect(onBridge().some((person) => person.member.watch === 'A')).toBe(true);
    const later = run(life, now, 70);
    const watch = onBridge();
    expect(watch.length).toBeGreaterThan(2);
    for (const person of watch)
      expect(['C', 'day'], person.member.id).toContain(person.member.watch);
    // By 0900 almost everyone is where their plan says.
    const there = life.people.filter(
      (person) => person.settled && person.space === blockOf(person, later).room,
    );
    expect(there.length / life.people.length).toBeGreaterThan(0.85);
  });

  it('reshuffles the crew at the 1600 change of watch, by ladder and lift', () => {
    const { life, now } = startAt('15:40');
    const before = new Map(
      life.people.map((person) => [person.member.id, `${person.deck}:${person.space}`]),
    );
    let climbing = 0;
    run(life, now, 60, () => {
      climbing = Math.max(
        climbing,
        life.people.filter((person) => !person.visible && !person.settled).length,
      );
    });
    const moved = life.people.filter(
      (person) => before.get(person.member.id) !== `${person.deck}:${person.space}`,
    );
    expect(moved.length / life.people.length).toBeGreaterThan(0.5);
    const changedDeck = life.people.filter(
      (person) => Number(before.get(person.member.id)!.split(':')[0]) !== person.deck,
    );
    expect(changedDeck.length).toBeGreaterThan(10);
    expect(climbing).toBeGreaterThan(0);
  });

  it('walks on clear floor', () => {
    const { life, now } = startAt('07:50');
    let samples = 0;
    let clear = 0;
    run(life, now, 40, () => {
      for (const person of life.people) {
        if (person.settled || !person.visible || person.lift !== 0) continue;
        const grid = map.decks.get(person.deck)!.grid;
        samples++;
        if (isFree(grid, person.x, person.y)) clear++;
        // Never far from open floor, even stepping into a seat.
        expect(nearestFree(grid, person.x, person.y, 1.2), person.member.id).not.toBeNull();
      }
    });
    expect(samples).toBeGreaterThan(500);
    expect(clear / samples).toBeGreaterThan(0.95);
  });

  it('makes way for the captain, then walks on', () => {
    const { life, now } = startAt('07:50');
    let at = run(life, now, 3);
    const walker = life.people.find(
      (person) => !person.settled && person.visible && person.pose === 'walk',
    )!;
    expect(walker).toBeDefined();
    const ahead: CaptainAt = {
      deck: walker.deck,
      x: walker.x + Math.sin(walker.yaw) * 0.6,
      y: walker.y - Math.cos(walker.yaw) * 0.6,
    };
    const [x, y] = [walker.x, walker.y];
    at = run(life, at, 0.5, undefined, ahead);
    expect(Math.hypot(walker.x - x, walker.y - y)).toBeLessThan(0.05);
    run(life, at, 2.5, undefined, ahead);
    expect(Math.hypot(walker.x - x, walker.y - y)).toBeGreaterThan(0.3);
  });

  it('turns to whoever they talk to', () => {
    const { life, now } = startAt('09:30');
    // Someone standing who stays put for the next while.
    const person = life.people.find(
      (p) => p.pose === 'stand' && p.visible && blockOf(p, now).to > (now % DAY) + 30,
    )!;
    const point: [number, number] = [person.x - 2, person.y];
    life.attend(person.member.id, point, 5, true);
    run(life, now, 1);
    expect(person.pose).toBe('talk');
    // Facing fore (towards smaller x): yaw -90 degrees.
    expect(Math.abs(person.yaw + Math.PI / 2)).toBeLessThan(0.2);
    run(life, now + 1, 4);
    expect(person.pose).toBe('stand');
  });

  it('is the same every time for the same seed', () => {
    const a = startAt('11:20', 3);
    const b = startAt('11:20', 3);
    run(a.life, a.now, 20);
    run(b.life, b.now, 20);
    expect(a.life.people.map((p) => [p.deck, p.x, p.y])).toEqual(
      b.life.people.map((p) => [p.deck, p.x, p.y]),
    );
  });
});
