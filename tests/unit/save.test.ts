import { describe, expect, it } from 'vitest';
import { minutes } from '../../src/content/crew';
import { balance, crew, events, ship } from '../../src/content/gameContent';
import { ShipClock } from '../../src/sim/clock';
import { Command } from '../../src/sim/command';
import { buildRoster, callSign } from '../../src/sim/crew';
import { EventDirector, type GameEvent } from '../../src/sim/events';
import type { NarrativeHost, Speaker } from '../../src/sim/narrative';
import {
  SAVE_VERSION,
  applySave,
  parseSave,
  readSave,
  takeSave,
  type SaveFile,
} from '../../src/sim/save';

const roster = buildRoster(crew, ship);
const characters = crew.characters.characters.map((character) => character.id);
const mission = events.find((event) => event.id === 'stranded-trader')!;
const captain = { deck: 1, x: 17, y: 8, yaw: -90, pitch: 4 };

/** Ship's time, the command state and the events: what a save holds. */
function newGame(scripts: readonly GameEvent[] = [mission]) {
  const clock = new ShipClock({ day: 0, minute: minutes('08:00') }, 1);
  const command = new Command(balance.command, characters);
  const summons: string[] = [];
  const director = new EventDirector(scripts, command, (event) => host(command, event, summons));
  return { clock, command, events: director, summons };
}
type Game = ReturnType<typeof newGame>;

function host(command: Command, event: GameEvent, summons: string[]): NarrativeHost {
  return {
    command,
    cause: event.title,
    ship: 'Kestrel',
    speaker(id): Speaker | null {
      const member =
        roster.members.find((m) => m.id === id) ?? roster.members.find((m) => m.billet === id);
      if (member) return { id, name: callSign(member), role: member.title };
      const guest = event.cast[id];
      return guest ? { id, name: guest.name, role: guest.role } : null;
    },
    summon: (who, room) => summons.push(`${who}@${room}`),
  };
}

/**
 * Plays the scene under way to its end or a goto, picking choices by their text in order.
 * Returns what was said and chosen.
 */
function playScene(game: Game, picks: string[]): string[] {
  const narrative = game.events.active!.narrative!;
  const said: string[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const beat = narrative.next();
    if (beat.kind === 'line') said.push(beat.text);
    else if (beat.kind === 'goto') {
      game.events.away(beat.room);
      return said;
    } else if (beat.kind === 'end') {
      game.events.finish();
      return said;
    } else {
      const want = picks.shift();
      const choice = beat.choices.find((offered) => want && offered.text.includes(want));
      if (!choice) throw new Error(`No choice "${want}" in ${beat.choices.map((c) => c.text)}`);
      narrative.choose(choice.index);
      said.push(`> ${choice.text}`);
    }
  }
  throw new Error('The scene never ended');
}

/** Called to the bridge, then the first scene up to the walk to the hangar. */
function toTheHangar(): Game {
  const game = newGame();
  game.events.update(0, minutes('08:10'), 'captains-quarters');
  game.events.update(0, minutes('08:12'), 'bridge');
  playScene(game, ['Best speed', 'marine escort']);
  game.clock.advance(5);
  return game;
}

function save(game: Game, place = 'Bridge, deck 1'): SaveFile {
  return takeSave(game, { savedAt: new Date('2026-10-11T09:00:00Z'), place, seed: 42, captain });
}

/** Saved, written out as the browser stores it, read back, and loaded into a fresh game. */
function reload(file: SaveFile): Game {
  const read = parseSave(JSON.stringify(file));
  if (!('save' in read)) throw new Error(read.error);
  const game = newGame();
  applySave(read.save, game);
  return game;
}

describe('saving and loading', () => {
  it('reproduces an identical state, half way through the mission', () => {
    const game = toTheHangar();
    expect(game.events.active).toMatchObject({ status: 'away', room: 'hangar' });
    const file = save(game);
    const loaded = reload(file);
    expect(save(loaded)).toEqual(file);
    expect(loaded.clock.time).toBe(game.clock.time);
    expect(loaded.command.value('crew')).toBe(game.command.value('crew'));
    expect(loaded.command.log).toEqual(game.command.log);
  });

  it('plays on from a save exactly as the game would have', () => {
    const original = toTheHangar();
    const loaded = reload(save(original));
    const picks = ['By the book', 'Seize the cargo, arrest the crew'];
    const ends = [original, loaded].map((game) => {
      expect(game.events.update(0, minutes('08:40'), 'hangar')).toEqual([
        { kind: 'resume', event: mission },
      ]);
      const said = playScene(game, [...picks]);
      return { said, command: game.command.snapshot(), done: [...game.events.finished] };
    });
    expect(ends[1]).toEqual(ends[0]);
    expect(ends[0]!.said[0]).toMatch(/Six marines/);
    expect(ends[0]!.done).toEqual(['stranded-trader']);
    expect(ends[0]!.command.flags).toContain('wren_seized');
  });

  it('keeps who the event sent where, to send them there again', () => {
    const game = toTheHangar();
    const summoned = save(game).events.active!.summoned;
    expect(summoned).toEqual(
      expect.arrayContaining([
        ['okafor', 'bridge'],
        ['mensah', 'hangar'],
        ['strand', 'hangar'],
      ]),
    );
    expect(reload(save(game)).events.active!.summoned).toEqual(new Map(summoned));
  });

  it('saves a called event before its first scene, and one already done', () => {
    const called = newGame();
    called.events.update(0, minutes('08:10'), 'captains-quarters');
    const file = save(called);
    expect(file.events.active).toMatchObject({ status: 'called', room: 'bridge', story: null });
    const loaded = reload(file);
    expect(loaded.events.update(0, minutes('08:11'), 'bridge')).toEqual([
      { kind: 'start', event: mission },
    ]);

    const done = toTheHangar();
    done.events.update(0, minutes('08:40'), 'hangar');
    playScene(done, ['Weapons out', 'Who were the crates for', 'never saw any crates']);
    const after = reload(save(done));
    expect(after.events.active).toBeNull();
    expect([...after.events.finished]).toEqual(['stranded-trader']);
    // Done is done: it isn't called again.
    expect(after.events.update(1, minutes('09:00'), 'bridge')).toEqual([]);
  });

  it("isn't made in the middle of a scene", () => {
    const game = newGame();
    game.events.update(0, minutes('08:10'), 'bridge');
    expect(game.events.inScene).toBe(true);
    expect(() => save(game)).toThrow(/middle of a scene/);
  });

  it('starts the event over if its script has changed since the save', () => {
    const file = save(toTheHangar());
    const changed = { ...mission, story: mission.story.replace('Six marines', 'Eight marines') };
    const game = newGame([changed]);
    applySave(file, game);
    expect(game.events.active).toMatchObject({ status: 'called', room: 'bridge' });
    expect(game.events.active!.narrative).toBeNull();
    // Only the crew its call summons: the script will summon the rest again.
    expect([...game.events.active!.summoned.keys()]).toEqual(mission.summon);
  });

  it('starts the event over if its place in the script is damaged', () => {
    const file = save(toTheHangar());
    const active = { ...file.events.active!, story: '{"not": "ink"}' };
    const game = newGame();
    applySave({ ...file, events: { ...file.events, active } }, game);
    expect(game.events.active).toMatchObject({ status: 'called', room: 'bridge' });
    expect(game.events.active!.narrative).toBeNull();
  });

  it("drops what the game no longer has, and starts what's new at its start value", () => {
    const file = save(toTheHangar());
    // A save from before Holm came aboard, and after someone and something left the game.
    const values: Record<string, number> = { ...file.command.values, 'rel.nobody': 50 };
    delete values['rel.holm'];
    const edited: SaveFile = {
      ...file,
      command: { ...file.command, values },
      events: { done: ['retired-event'], active: { ...file.events.active!, id: 'retired' } },
    };
    const game = newGame();
    applySave(edited, game);
    expect(game.command.knows('rel.nobody')).toBe(false);
    expect(game.command.value('rel.holm')).toBe(balance.command.relations['holm'] ?? 0);
    expect(game.events.active).toBeNull();
    expect([...game.events.finished]).toEqual(['retired-event']);
  });
});

describe('reading a save file', () => {
  const file = save(toTheHangar());

  it('reads back what was written', () => {
    expect(parseSave(JSON.stringify(file))).toEqual({ save: file });
    expect(file.version).toBe(SAVE_VERSION);
  });

  it('turns away what is not a save, or is damaged', () => {
    expect(parseSave('{not json')).toEqual({ error: 'not a save file' });
    expect(readSave([1, 2])).toEqual({ error: 'not a save file' });
    expect(readSave({ ...file, version: 'one' })).toEqual({ error: 'not a save file' });
    const damaged = readSave({ ...file, clock: { day: 0, minute: -5 } });
    expect('error' in damaged && damaged.error).toMatch(/^damaged \(clock\.minute: /);
    expect(readSave({ ...file, extra: true })).toHaveProperty('error');
  });

  it('turns away saves from a newer version of the game', () => {
    expect(readSave({ ...file, version: SAVE_VERSION + 1 })).toEqual({
      error: 'made by a newer version of the game',
    });
  });

  it('brings older saves up to date through migrations, one version at a time', () => {
    // Pretend version 1 had a "time" string where today's saves have a clock.
    const { clock, ...rest } = file;
    const old = {
      ...rest,
      version: SAVE_VERSION - 1,
      time: `${clock.day}:${clock.minute}`,
    };
    const migrations = {
      [SAVE_VERSION - 1]: ({ time, ...save }: Record<string, unknown>) => {
        const [day, minute] = String(time).split(':').map(Number);
        return { ...save, clock: { day, minute } };
      },
    };
    expect(readSave(old, migrations)).toEqual({ save: file });
    expect(readSave(old)).toEqual({
      error: `version ${SAVE_VERSION - 1} saves can no longer be loaded`,
    });
  });
});
