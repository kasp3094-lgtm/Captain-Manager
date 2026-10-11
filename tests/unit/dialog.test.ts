import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { DialogFileSchema, type DialogEntryData } from '../../src/content/dialog';
import { balance, crew, ship } from '../../src/content/gameContent';
import { buildRoster } from '../../src/sim/crew';
import {
  fillIn,
  fitsPlace,
  fitsTime,
  fitsWords,
  neverHappen,
  readDialog,
  spokenShipName,
  type DialogEntry,
} from '../../src/sim/dialog';
import { Chatter, type CaptainView } from '../../src/world/crew/chatter';
import { CrewLife, crewMap } from '../../src/world/crew/life';
import { planShip } from '../../src/world/ship/layout';
import { minutes } from '../../src/content/crew';

const dialogDir = fileURLToPath(new URL('../../content/dialog', import.meta.url));
const realFiles = new Map(
  readdirSync(dialogDir)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => [
      `dialog/${name}`,
      DialogFileSchema.parse(parse(readFileSync(join(dialogDir, name), 'utf8'))),
    ]),
);
const roster = buildRoster(crew, ship);
const member = (id: string) => roster.members.find((m) => m.id === id)!;
const characters = new Map(roster.members.filter((m) => m.named).map((m) => [m.id, m]));
const names = { captain: 'Captain', ship: 'Kestrel', characters };

/** Reads made-up entries, with the fallbacks that every set needs. */
function read(entries: Partial<DialogEntryData>[]) {
  const fallbacks: DialogEntryData[] = [
    { id: 'fallback', to: 'captain', who: 'anyone', lines: '1: Captain.' },
    { id: 'fallback-sleep', to: 'captain', who: 'anyone', doing: 'sleep', lines: '1: Zzz.' },
  ];
  const test = entries.map((entry, i) => ({
    id: `test-${i}`,
    who: 'anyone',
    lines: '1: Hello.',
    ...entry,
  }));
  return readDialog(
    new Map([['dialog/test.yaml', [...fallbacks, ...test] as DialogEntryData[]]]),
    ship,
    crew,
  );
}

describe('dialog files', () => {
  it('read without problems, and every entry can happen in the crew day', () => {
    const { entries, problems } = readDialog(realFiles, ship, crew);
    expect(problems).toEqual([]);
    expect(entries.length).toBeGreaterThan(100);
    expect(neverHappen(entries, roster, crew.routine, ship)).toEqual([]);
  });

  it('turn a script into lines, with indented lines carrying on', () => {
    const { entries, problems } = read([
      {
        who: ['anyone', 'anyone'],
        lines:
          '1: Who made the coffee?\n2: Engineering: through the coolant loop,\n   I think.\n# a note\n1: Tastes like it.',
      },
    ]);
    expect(problems).toEqual([]);
    expect(entries.find((e) => e.id === 'test-0')!.lines).toEqual([
      { speaker: 0, text: 'Who made the coffee?' },
      { speaker: 1, text: 'Engineering: through the coolant loop, I think.' },
      { speaker: 0, text: 'Tastes like it.' },
    ]);
  });

  it('say what is wrong, entry by entry', () => {
    const { problems } = read([
      { who: 'engineers' },
      { where: 'crew-messs' },
      { when: 'teatime' },
      { lines: '1: Fine.\n3: There is no speaker three.' },
      { lines: 'Hello, no number.' },
      { lines: '1: Hello, {admiral}.' },
      { lines: '1: Hello, {2}.' },
      { lines: '1: Hello, {1.middle}.' },
      { lines: `1: ${'very '.repeat(40)}long` },
      { id: 'fallback' },
    ]);
    const say = (fragment: string) =>
      expect(
        problems.some((p) => p.includes(fragment)),
        fragment,
      ).toBe(true);
    say('test-0: who: "engineers"');
    say('test-1: where: "crew-messs"');
    say('test-2: when: "teatime"');
    say('test-3: line "3: There is no speaker three.": there is no speaker 3');
    say('test-4: "Hello, no number." should start with the speaker\'s number');
    say('test-5: {admiral}');
    say('test-6: {2}: there is no speaker 2');
    say('test-7: {1.middle}: use .first, .last or .rank');
    say('test-8: a line is');
    say('fallback: the id is already used');
  });

  it('insist on a fallback for anyone, and one for sleepers', () => {
    const { problems } = readDialog(new Map([['dialog/test.yaml', []]]), ship, crew);
    expect(problems.join('\n')).toMatch(/so anyone can answer the captain/);
    expect(problems.join('\n')).toMatch(/when the captain wakes someone/);
  });

  it('find entries that can never happen', () => {
    const { entries } = read([
      // Only one helmsman is on watch at a time.
      { who: ['helmsman', 'helmsman'], where: 'bridge', lines: '1: Hi.\n2: Hi.' },
      // Cooks never stand on the bridge.
      { who: 'cook', where: 'bridge' },
      { who: ['helmsman', 'quartermaster'], where: 'bridge', lines: '1: Hi.\n2: Hi.' },
    ]);
    const problems = neverHappen(entries, roster, crew.routine, ship);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(
      /test-0: never happens: speaker 1 is there, but never with anyone who fits speaker 2/,
    );
    expect(problems[1]).toMatch(/test-1: never happens: nobody who fits speaker 1 \("cook"\)/);
  });
});

describe('fitting an entry to people and moments', () => {
  it('matches every word of a speaker to the person', () => {
    const cook = member('barros');
    expect(fitsWords(['anyone'], cook)).toBe(true);
    expect(fitsWords(['petty-officer', 'supply'], cook)).toBe(true);
    expect(fitsWords(['cook'], cook)).toBe(true);
    expect(fitsWords(['barros'], cook)).toBe(true);
    expect(fitsWords(['named'], cook)).toBe(true);
    expect(fitsWords(['junior'], cook)).toBe(false);
    expect(fitsWords(['petty-officer', 'engineering'], cook)).toBe(false);
  });

  it('matches times of day, also across midnight', () => {
    const { entries } = read([{ when: 'night' }, { when: '11:30-13:00' }]);
    const [night, lunch] = [
      entries.find((e) => e.id === 'test-0')!,
      entries.find((e) => e.id === 'test-1')!,
    ];
    expect(fitsTime(night, minutes('23:30'))).toBe(true);
    expect(fitsTime(night, minutes('05:59'))).toBe(true);
    expect(fitsTime(night, minutes('12:00'))).toBe(false);
    expect(fitsTime(lunch, minutes('12:00'))).toBe(true);
    expect(fitsTime(lunch, minutes('13:00'))).toBe(false);
  });

  it('matches rooms, room types and decks', () => {
    const { entries } = read([{ where: 'crew-mess' }, { where: 'berthing' }, { where: 'deck 4' }]);
    const type = (id: string) =>
      ship.decks.flatMap((d) => d.rooms).find((r) => r.id === id)?.type ?? null;
    const [room, kind, deck] = ['test-0', 'test-1', 'test-2'].map((id) =>
      entries.find((e) => e.id === id)!,
    );
    expect(fitsPlace(room!, 'crew-mess', 2, type)).toBe(true);
    expect(fitsPlace(room!, 'galley', 2, type)).toBe(false);
    expect(fitsPlace(kind!, 'junior-berthing-b', 3, type)).toBe(true);
    expect(fitsPlace(kind!, 'galley', 2, type)).toBe(false);
    expect(fitsPlace(deck!, 'reactor', 4, type)).toBe(true);
    expect(fitsPlace(deck!, 'bridge', 1, type)).toBe(false);
  });

  it('fills in names', () => {
    const speakers = [member('barros'), member('kowalski')];
    expect(fillIn('{captain}, the {ship}.', speakers, names)).toBe('Captain, the Kestrel.');
    expect(fillIn('{2.last}, pass the salt. Signed, {1}.', speakers, names)).toBe(
      `${member('kowalski').family}, pass the salt. Signed, ${member('barros').rank} ${member('barros').family}.`,
    );
    expect(fillIn('Ask {delgado.first}, or {delgado}.', speakers, names)).toMatch(
      /^Ask \w+, or Master Chief \w+\.$/,
    );
    expect(spokenShipName('CNS Kestrel')).toBe('Kestrel');
  });
});

describe('walk-by dialog in the game', () => {
  const layout = planShip(ship);
  const map = crewMap(layout);
  const tuning = { ...balance.crew, minutesPerSecond: balance.time.minutesPerSecond };
  const roomType = (id: string) =>
    ship.decks.flatMap((d) => d.rooms).find((r) => r.id === id)?.type ?? null;
  const { entries } = readDialog(realFiles, ship, crew);

  /** The captain standing among the crew in the mess at lunch. */
  function lunch(force: string | null = null) {
    const now = minutes('12:10');
    const life = new CrewLife(map, roster.members, crew.routine, tuning, now, 5);
    const chatter = new Chatter(entries, life, names, roomType, 9, force);
    const diner = life.people.find((p) => p.space === 'crew-mess' && p.activity === 'eat')!;
    const captain: CaptainView = {
      deck: diner.deck,
      x: diner.x + 1.2,
      y: diner.y,
      yaw: -Math.PI / 2,
    };
    return { life, chatter, captain, now };
  }

  /** Runs the dialog (and the crew, frozen in time) for `seconds`; returns every line said. */
  function listen(setup: ReturnType<typeof lunch>, seconds: number) {
    const said: { name: string; text: string; toCaptain: boolean; speaker: string }[] = [];
    let last = 0;
    for (let t = 0; t < seconds; t += 0.1) {
      setup.life.update(0.1, setup.now, setup.captain);
      setup.chatter.update(0.1, setup.captain, setup.now % 1440);
      const line = setup.chatter.current;
      if (line && line.key !== last) {
        last = line.key;
        said.push({
          name: line.name,
          text: line.text,
          toCaptain: line.toCaptain,
          speaker: line.speaker.member.id,
        });
      }
    }
    return said;
  }

  it('lets the captain overhear conversations, with names filled in', () => {
    const said = listen(lunch(), 120);
    expect(said.length).toBeGreaterThan(3);
    for (const line of said) expect(line.text).not.toMatch(/[{}]/);
  });

  it('plays a forced entry with whoever fits (?dialog=)', () => {
    const said = listen(lunch('mess-coffee'), 12);
    expect(said.map((line) => line.text)).toEqual([
      'Who made the coffee?',
      'Engineering. They ran it through the coolant loop.',
      'Tastes like it.',
    ]);
    // Two different people, facing each other.
    const speakers = new Set(said.map((line) => line.speaker));
    expect(speakers.size).toBe(2);
  });

  it('answers when the captain talks to someone, and they turn to face the captain', () => {
    const setup = lunch();
    const person =
      setup.life.people.find((p) => p.space === 'crew-mess' && p.pose === 'stand') ??
      setup.life.people.find((p) => p.visible && p.activity !== 'sleep')!;
    expect(setup.chatter.talkTo(person.member.id, setup.captain, setup.now % 1440)).toBe(true);
    expect(setup.chatter.current?.speaker).toBe(person);
    expect(setup.chatter.current?.toCaptain).toBe(true);
  });

  it('wakes a sleeper with a sleepy answer', () => {
    const now = minutes('03:00');
    const life = new CrewLife(map, roster.members, crew.routine, tuning, now, 5);
    const chatter = new Chatter(entries, life, names, roomType, 9);
    const sleeper = life.people.find((p) => p.activity === 'sleep' && p.visible)!;
    const captain: CaptainView = { deck: sleeper.deck, x: sleeper.x, y: sleeper.y + 1, yaw: 0 };
    expect(chatter.talkTo(sleeper.member.id, captain, now)).toBe(true);
    const sleepy = entries
      .filter((e: DialogEntry) => e.doing?.includes('sleep'))
      .flatMap((e) => e.lines.map((l) => l.text));
    expect(sleepy.map((text) => fillIn(text, [sleeper.member], names))).toContain(
      chatter.current!.text,
    );
  });
});
