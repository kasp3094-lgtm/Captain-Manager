import { describe, expect, it } from 'vitest';
import { crew, ship } from '../../src/content/gameContent';
import type { CrewContent } from '../../src/content/crew';
import { buildRoster, callSign, type CrewMember } from '../../src/sim/crew';
import { DAY, blockAt, checkSchedules, clock, dayPlan } from '../../src/sim/schedule';

const roster = buildRoster(crew, ship);
const at = (member: CrewMember, time: string, day = 0) => {
  const [h, m] = time.split(':').map(Number);
  return blockAt(dayPlan(member, crew.routine, day), h! * 60 + m!);
};

describe('the roster', () => {
  it('builds a crew of 99 plus the captain, as the Act 1 spec counts them', () => {
    expect(roster.problems).toEqual([]);
    expect(roster.members).toHaveLength(99);
    const count = (group: string) => roster.members.filter((m) => m.group === group).length;
    expect(count('officer')).toBe(9);
    expect(count('chief')).toBe(6);
    expect(count('petty-officer')).toBe(24);
    expect(count('junior')).toBe(48);
    expect(count('marine')).toBe(12);
  });

  it('keeps the named characters as written and generates the rest', () => {
    const delgado = roster.members.find((m) => m.id === 'delgado')!;
    expect(callSign(delgado)).toBe('Master Chief Delgado');
    expect(delgado.billet).toBe('master-chief');
    expect(roster.members.filter((m) => m.named)).toHaveLength(crew.characters.characters.length);
    const kowalski = roster.members.find((m) => m.id === 'kowalski')!;
    expect(kowalski.watch).toBe('B');
    expect(kowalski.berth?.room).toBe('junior-berthing-a');
  });

  it('gives everyone a unique id and family name, the same in every game', () => {
    const ids = roster.members.map((m) => m.id);
    const families = roster.members.map((m) => m.family);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(families).size).toBe(families.length);
    expect(buildRoster(crew, ship).members.map(callSign)).toEqual(roster.members.map(callSign));
  });

  it('spreads every rotating billet evenly over the three watch sections', () => {
    for (const section of ['A', 'B', 'C']) {
      expect(
        roster.members.filter((m) => m.group === 'junior' && m.watch === section),
      ).toHaveLength(16);
    }
  });

  it('gives everyone a rack, and hot-rackers a rack-mate from another section', () => {
    const rooms = new Map(ship.decks.flatMap((d) => d.rooms.map((r) => [r.id, r])));
    const byRack = new Map<string, CrewMember[]>();
    for (const member of roster.members) {
      expect(member.berth, member.id).not.toBeNull();
      const key = `${member.berth!.room}#${member.berth!.rack}`;
      byRack.set(key, [...(byRack.get(key) ?? []), member]);
      const room = rooms.get(member.berth!.room)!;
      expect(member.berth!.rack).toBeLessThan(room.racks!);
    }
    for (const [rack, sleepers] of byRack) {
      const room = rooms.get(rack.split('#')[0]!)!;
      expect(sleepers.length, rack).toBe(room.hotRacked ? 2 : 1);
      if (sleepers.length === 2) {
        const [a, b] = sleepers as [CrewMember, CrewMember];
        expect(a.watch).not.toBe(b.watch);
        expect(a.rackMate).toBe(b.id);
        expect(b.rackMate).toBe(a.id);
      }
    }
  });

  it('reports content that does not add up', () => {
    const broken: CrewContent = {
      ...crew,
      characters: {
        characters: [
          ...crew.characters.characters,
          { id: 'nobody', name: 'No Body', rank: 'Spacer', billet: 'juggler' },
        ],
      },
      billets: {
        ...crew.billets,
        billets: crew.billets.billets.map((b) => (b.id === 'helmsman' ? { ...b, count: 4 } : b)),
      },
    };
    const { problems } = buildRoster(broken, ship);
    expect(problems).toContain('character nobody: there is no billet "juggler"');
    expect(problems).toContain(
      'billet helmsman: a rotating billet needs a count that is a multiple of 3',
    );
    expect(problems.some((p) => p.startsWith('junior:') && p.includes('no rack'))).toBe(true);
  });
});

describe('the day', () => {
  it('puts everyone in exactly one place all day, and no two people in a rack at once', () => {
    expect(checkSchedules(roster, crew.routine, 3)).toEqual([]);
  });

  it('follows the watch bill: one section on duty, one off, one asleep', () => {
    const one = (section: string) =>
      roster.members.find((m) => m.watch === section && m.patrol.length === 0)!;
    const [a, b, c] = [one('A'), one('B'), one('C')];
    expect(at(a, '04:00').activity).toBe('duty');
    expect(at(b, '04:00').activity).toBe('sleep');
    expect(['eat', 'leisure']).toContain(at(c, '04:00').activity);
    expect(at(a, '12:00').activity).toBe('sleep');
    expect(at(c, '12:00').activity).toBe('duty');
    expect(at(b, '20:00').activity).toBe('duty');
    expect(at(c, '20:00').activity).toBe('sleep');
  });

  it('keeps day workers at work by day and asleep at night', () => {
    const holm = roster.members.find((m) => m.id === 'holm')!;
    expect(at(holm, '10:00')).toMatchObject({ activity: 'duty', room: 'main-engineering' });
    expect(at(holm, '03:00')).toMatchObject({ activity: 'sleep', room: holm.berth!.room });
    expect(at(holm, '12:00')).toMatchObject({ activity: 'eat', room: 'wardroom' });
  });

  it('sends patrols round their rooms', () => {
    const patrol = roster.members.find((m) => m.billet === 'security-patrol' && m.watch === 'A')!;
    const rooms = new Set(
      dayPlan(patrol, crew.routine, 0)
        .filter((block) => block.activity === 'patrol')
        .map((block) => block.room),
    );
    expect(rooms.size).toBeGreaterThan(3);
  });

  it('feeds everyone, and washes them before they turn in', () => {
    for (const member of roster.members) {
      const plan = dayPlan(member, crew.routine, 0);
      expect(
        plan.some((block) => block.activity === 'eat'),
        member.id,
      ).toBe(true);
      expect(
        plan.some((block) => block.activity === 'wash'),
        member.id,
      ).toBe(true);
    }
  });

  it('visibly changes shift at 1600', () => {
    const standers = roster.members.filter((m) => m.watch !== 'day');
    const moved = standers.filter((m) => at(m, '15:50').room !== at(m, '16:10').room);
    expect(moved.length / standers.length).toBeGreaterThan(0.6);
  });

  it('only sends people to rooms you can walk into', () => {
    const walkable = new Set(
      ship.decks.flatMap((d) => d.rooms.filter((r) => r.type !== 'tank').map((r) => r.id)),
    );
    for (const member of roster.members) {
      for (const block of dayPlan(member, crew.routine, 1)) {
        expect(
          walkable.has(block.room),
          `${member.id} at ${clock(block.from)}: ${block.room}`,
        ).toBe(true);
      }
    }
  });

  it('plans differ from day to day but are the same for the same day', () => {
    const someone = roster.members.find((m) => m.group === 'junior')!;
    expect(dayPlan(someone, crew.routine, 4)).toEqual(dayPlan(someone, crew.routine, 4));
    const days = [0, 1, 2, 3].map((d) => JSON.stringify(dayPlan(someone, crew.routine, d)));
    expect(new Set(days).size).toBeGreaterThan(1);
    expect(DAY).toBe(1440);
  });
});
