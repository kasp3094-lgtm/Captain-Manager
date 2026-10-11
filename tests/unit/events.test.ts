import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { minutes } from '../../src/content/crew';
import { EventSchema } from '../../src/content/events';
import { balance, crew, ship } from '../../src/content/gameContent';
import { compileInk } from '../../src/content/ink';
import { Command } from '../../src/sim/command';
import { buildRoster, callSign } from '../../src/sim/crew';
import { EventDirector, type GameEvent } from '../../src/sim/events';
import { Narrative, type NarrativeHost, type Speaker } from '../../src/sim/narrative';

const roster = buildRoster(crew, ship);
const folder = new URL('../../content/events/leg1/', import.meta.url);
const data = EventSchema.parse(
  parse(readFileSync(fileURLToPath(new URL('stranded-trader.yaml', folder)), 'utf8')),
);
const source = readFileSync(fileURLToPath(new URL(data.script, folder)), 'utf8');
const compiled = compileInk(source, 'stranded-trader.ink');
const event: GameEvent = {
  ...data,
  story: compiled.json,
  file: 'events/leg1/stranded-trader.yaml',
};
const characters = crew.characters.characters.map((character) => character.id);

/** What a script needs, with speakers looked up in the real roster. */
function host(command: Command, summons: string[] = []): NarrativeHost {
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

interface Played {
  readonly lines: { speaker: string | null; text: string }[];
  readonly gotos: string[];
  readonly command: Command;
  readonly summons: string[];
  readonly notices: string[];
  /** Choices offered at the first decision the path didn't make yet; null if the story ended. */
  readonly next: { index: number; text: string; locked: string | null }[] | null;
}

/** Plays the script making `picks` in order, until it ends or needs another pick. */
function play(picks: readonly number[]): Played {
  const command = new Command(balance.command, characters);
  const summons: string[] = [];
  const narrative = new Narrative(event.story, host(command, summons));
  const lines: Played['lines'] = [];
  const gotos: string[] = [];
  const notices: string[] = [];
  let made = 0;
  for (let guard = 0; guard < 500; guard++) {
    const beat = narrative.next();
    notices.push(...narrative.takeNotices().map((notice) => notice.text));
    if (beat.kind === 'line') lines.push({ speaker: beat.speaker?.name ?? null, text: beat.text });
    else if (beat.kind === 'goto') gotos.push(beat.room);
    else if (beat.kind === 'end') return { lines, gotos, command, summons, notices, next: null };
    else {
      if (made === picks.length)
        return { lines, gotos, command, summons, notices, next: [...beat.choices] };
      narrative.choose(picks[made++]!);
      notices.push(...narrative.takeNotices().map((notice) => notice.text));
    }
  }
  throw new Error(`No end after picks ${picks.join(',')}`);
}

/** Every way through the script, as the picks that make it. */
function everyPath(): number[][] {
  const finished: number[][] = [];
  const open: number[][] = [[]];
  while (open.length > 0) {
    const picks = open.pop()!;
    const played = play(picks);
    if (!played.next) finished.push(picks);
    else for (const choice of played.next) if (!choice.locked) open.push([...picks, choice.index]);
    if (finished.length + open.length > 400) throw new Error('Too many paths');
  }
  return finished;
}

describe('the stranded-trader mission', () => {
  it('compiles cleanly', () => {
    expect(compiled.errors).toEqual([]);
    expect(compiled.warnings).toEqual([]);
  });

  const paths = everyPath();

  it('ends on every path, with everyone who speaks known', () => {
    expect(paths.length).toBeGreaterThan(15);
    for (const picks of paths) {
      const { lines } = play(picks);
      expect(lines.length, picks.join(',')).toBeGreaterThan(8);
      for (const line of lines) expect(line.text).not.toMatch(/[{}]/);
    }
  });

  it('opens with the distress call, and offers four ways to answer it', () => {
    const start = play([]);
    expect(start.lines[0]).toEqual({
      speaker: expect.stringMatching(/ \w+$/),
      text: 'Captain on the bridge!',
    });
    expect(start.lines.some((line) => line.speaker === 'Captain Ilse Varga')).toBe(true);
    expect(start.next).toHaveLength(4);
  });

  it('shows a locked choice greyed with its reason, and keeps it shut', () => {
    const contact = play([0]);
    const locked = contact.next!.find((choice) => choice.locked);
    expect(locked?.locked).toMatch(/^Requires: Lt\. \w+ — Trusted$/);
    expect(() => play([0, locked!.index])).toThrow(/locked/);
  });

  it('sends the captain to the hangar to see the boarding party off', () => {
    const boarding = paths.filter((picks) => play(picks).gotos.includes('hangar'));
    expect(boarding.length).toBeGreaterThan(10);
    const played = play(boarding[0]!);
    expect(played.summons).toEqual(expect.arrayContaining(['mensah@hangar', 'strand@hangar']));
  });

  it('trades meters off on every ending, and says who noticed', () => {
    for (const picks of paths) {
      const { command, notices } = play(picks);
      const moved = new Set(
        command.log.filter((change) => change.amount !== 0).map((change) => change.target),
      );
      expect(moved.size, picks.join(',')).toBeGreaterThanOrEqual(2);
      const ups = command.log.some((change) => change.amount > 0);
      const downs = command.log.some((change) => change.amount < 0);
      expect(ups && downs, `no free wins: ${picks.join(',')}`).toBe(true);
      for (const notice of notices) expect(notice).not.toMatch(/rel\.|undefined/);
    }
  });

  it('remembers what happened, for later events', () => {
    const outcomes = new Set(paths.flatMap((picks) => [...play(picks).command.flags]));
    for (const flag of [
      'wren_seized',
      'wren_let_go',
      'wren_fined_quietly',
      'wren_ignored',
      'wren_helped',
    ]) {
      expect(outcomes, flag).toContain(flag);
    }
  });
});

describe('the event director', () => {
  const setup = () => {
    const command = new Command(balance.command, characters);
    return { command, director: new EventDirector([event], command, () => host(command)) };
  };

  it('calls the captain to the bridge at 0810, starts there, and moves to the hangar', () => {
    const { director } = setup();
    expect(director.update(0, minutes('08:00'), 'bridge')).toEqual([]);
    const call = director.update(0, minutes('08:10'), 'captains-quarters');
    expect(call).toEqual([{ kind: 'call', event, text: 'Captain to the bridge.' }]);
    expect(director.active?.status).toBe('called');
    expect(director.update(0, minutes('08:11'), 'passage-1')).toEqual([]);
    expect(director.update(0, minutes('08:12'), 'bridge')).toEqual([{ kind: 'start', event }]);
    expect(director.active?.narrative).not.toBeNull();
    director.away('hangar');
    expect(director.update(0, minutes('08:20'), 'bridge')).toEqual([]);
    expect(director.update(0, minutes('08:25'), 'hangar')).toEqual([{ kind: 'resume', event }]);
    director.finish();
    expect(director.active).toBeNull();
    expect(director.update(0, minutes('09:00'), 'bridge')).toEqual([]);
    expect(director.finished.has(event.id)).toBe(true);
  });

  it('starts an event on demand (?event=), and not on another day', () => {
    const { director } = setup();
    expect(director.update(1, minutes('09:00'), 'bridge')).toEqual([]);
    expect(director.force('stranded-trader')).toMatchObject({ kind: 'call' });
    expect(director.force('stranded-trader')).toBeNull();
    expect(director.force('no-such-event')).toBeNull();
  });
});
