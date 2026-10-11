/**
 * Walk-by dialog: turns the entries in content/dialog/*.yaml into scripts, checks them (every
 * word, room, time and placeholder must mean something), and answers the questions the game asks
 * while it runs: does this person fit speaker 2 of this entry, does this entry fit here and now,
 * and what does a line say once the names are filled in. Pure, so `npm run validate` and the unit
 * tests use it too; the game's runner is src/world/crew/chatter.ts.
 */
import { TIMES_OF_DAY, type DialogEntryData } from '../content/dialog';
import { DEPARTMENTS, GROUPS, minutes, type CrewContent } from '../content/crew';
import type { Ship } from '../content/ship';
import { callSign, type CrewMember, type Roster } from './crew';
import { blockAt, dayPlan, type Activity, type Block } from './schedule';
import { findRoom } from './ship';

export interface Line {
  /** 0 for speaker 1. */
  readonly speaker: number;
  readonly text: string;
}

/** Where an entry can happen: a room, any room of a type, or anywhere on a deck. */
export type Place =
  | { readonly kind: 'room'; readonly id: string }
  | { readonly kind: 'type'; readonly type: string }
  | { readonly kind: 'deck'; readonly deck: number };

export interface DialogEntry {
  readonly id: string;
  /** The file it came from, relative to content/. */
  readonly file: string;
  /** Per speaker: the words they must all fit. */
  readonly who: readonly (readonly string[])[];
  readonly where: readonly Place[] | null;
  /** Spans of the day in minutes after midnight, [from, to); from > to wraps past midnight. */
  readonly when: readonly (readonly [number, number])[] | null;
  /** What speaker 1 must be doing; null for anything but sleep. Everyone else is awake. */
  readonly doing: readonly Activity[] | null;
  readonly toCaptain: boolean;
  readonly weight: number;
  /** Lines written for a person or a place come up more often than lines for anyone. */
  readonly specificity: number;
  readonly once: boolean;
  readonly lines: readonly Line[];
}

/** Names that lines can mention through placeholders. */
export interface DialogNames {
  /** How the crew address the captain. */
  readonly captain: string;
  /** The ship's name as the crew say it. */
  readonly ship: string;
  /** Named characters by id, for {delgado} and the like. */
  readonly characters: ReadonlyMap<string, CrewMember>;
}

/** Longest line that still reads well in a speech bubble. */
export const MAX_LINE = 160;

const PLACEHOLDER = /\{([a-z0-9-]+)(?:\.([a-z]+))?\}/g;
const PARTS = ['first', 'last', 'rank'] as const;
const SPAN = /^(\d\d:\d\d)-(\d\d:\d\d)$/;
const DECK = /^deck (\d+)$/;
const SPEAKER_LINE = /^(\d+)\s*:\s*(.*)$/;

/** Reads and checks every dialog file. Entries with problems are left out. */
export function readDialog(
  files: ReadonlyMap<string, readonly DialogEntryData[]>,
  ship: Ship,
  crew: CrewContent,
): { entries: DialogEntry[]; problems: string[] } {
  const problems: string[] = [];
  const entries: DialogEntry[] = [];
  const seen = new Map<string, string>();
  const words = vocabulary(crew);
  const characters = new Set(crew.characters.characters.map((character) => character.id));
  const billets = new Set(crew.billets.billets.map((billet) => billet.id));
  const rooms = new Map(ship.decks.flatMap((deck) => deck.rooms.map((room) => [room.id, room])));
  const types = new Set([...rooms.values()].map((room) => room.type));
  const decks = new Set(ship.decks.map((deck) => deck.deck));

  for (const [file, data] of files) {
    for (const raw of data) {
      const here: string[] = [];
      const problem = (message: string) => here.push(`${file}: ${raw.id}: ${message}`);
      const earlier = seen.get(raw.id);
      if (earlier) problem(`the id is already used in ${earlier}`);
      seen.set(raw.id, file);

      const who = list(raw.who).map((selector) => selector.toLowerCase().split(/\s+/));
      for (const word of who.flat()) {
        if (!words.has(word))
          problem(`who: "${word}" is not a group, department, job or character`);
      }

      const where = list(raw.where).map((value): Place | null => {
        const deck = DECK.exec(value);
        if (deck) {
          if (!decks.has(Number(deck[1]))) problem(`where: there is no ${value}`);
          return { kind: 'deck', deck: Number(deck[1]) };
        }
        if (rooms.has(value)) return { kind: 'room', id: value };
        if (types.has(value as never)) return { kind: 'type', type: value };
        problem(`where: "${value}" is not a room id, a room type or "deck N"`);
        return null;
      });

      const when = list(raw.when).map((value): [number, number] | null => {
        if (value in TIMES_OF_DAY) {
          const [from, to] = TIMES_OF_DAY[value as keyof typeof TIMES_OF_DAY];
          return [minutes(from), minutes(to)];
        }
        const span = SPAN.exec(value);
        if (span && validTime(span[1]!) && validTime(span[2]!))
          return [minutes(span[1]!), minutes(span[2]!)];
        problem(
          `when: "${value}" is not ${Object.keys(TIMES_OF_DAY).join(', ')} or a span like 22:00-02:00`,
        );
        return null;
      });

      const lines = scriptLines(raw.lines, who.length, problem);
      for (const line of lines) {
        if (line.text.length > MAX_LINE) {
          problem(
            `a line is ${line.text.length} characters; keep lines under ${MAX_LINE} (split it in two)`,
          );
        }
        for (const [, name, part] of line.text.matchAll(PLACEHOLDER)) {
          if (part && !PARTS.includes(part as (typeof PARTS)[number])) {
            problem(`{${name}.${part}}: use .first, .last or .rank`);
          }
          if (name === 'captain' || name === 'ship') continue;
          if (/^\d+$/.test(name!)) {
            if (Number(name) < 1 || Number(name) > who.length)
              problem(`{${name}}: there is no speaker ${name}`);
          } else if (!characters.has(name!)) {
            problem(
              `{${name}}: not a placeholder ({captain}, {ship}, {1}, {2}…) or a character id`,
            );
          }
        }
      }

      if (here.length > 0) {
        problems.push(...here);
        continue;
      }
      let specificity = 1;
      for (const selector of who) {
        if (selector.some((word) => characters.has(word))) specificity *= 4;
        else if (selector.some((word) => billets.has(word))) specificity *= 2.5;
        else if (!selector.every((word) => word === 'anyone')) specificity *= 1.5;
      }
      if (raw.where !== undefined) specificity *= 1.5;
      if (raw.when !== undefined) specificity *= 1.2;
      entries.push({
        id: raw.id,
        file,
        who,
        where: raw.where === undefined ? null : (where as Place[]),
        when: raw.when === undefined ? null : (when as [number, number][]),
        doing: raw.doing === undefined ? null : list(raw.doing),
        toCaptain: raw.to === 'captain',
        weight: raw.weight ?? 1,
        specificity,
        once: raw.once ?? false,
        lines,
      });
    }
  }

  // Talking to anyone must always get an answer, awake or asleep.
  const answers = (doing: Activity | null) =>
    entries.some(
      (entry) =>
        entry.toCaptain &&
        entry.who.length === 1 &&
        entry.who[0]!.every((word) => word === 'anyone') &&
        entry.where === null &&
        entry.when === null &&
        (doing === null ? entry.doing === null : (entry.doing?.includes(doing) ?? false)),
    );
  if (!answers(null)) {
    problems.push(
      'dialog: add a `to: captain` entry with `who: anyone` and no where, when or doing, so anyone can answer the captain',
    );
  }
  if (!answers('sleep')) {
    problems.push(
      'dialog: add a `to: captain` entry with `who: anyone` and `doing: sleep`, for when the captain wakes someone',
    );
  }
  return { entries, problems };
}

/** Every word `who:` understands: anyone, named, groups, departments, jobs and characters. */
function vocabulary(crew: CrewContent): Set<string> {
  return new Set([
    'anyone',
    'named',
    ...GROUPS,
    ...DEPARTMENTS,
    ...crew.billets.billets.map((billet) => billet.id),
    ...crew.characters.characters.map((character) => character.id),
  ]);
}

/** The spoken lines of a script; problems for lines that don't say who speaks. */
function scriptLines(script: string, speakers: number, problem: (message: string) => void): Line[] {
  const lines: { speaker: number; text: string }[] = [];
  for (const raw of script.split('\n')) {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const last = lines[lines.length - 1];
    // An indented line carries on the line before it.
    if (/^\s/.test(raw) && last) {
      last.text = `${last.text} ${trimmed}`;
      continue;
    }
    const match = SPEAKER_LINE.exec(trimmed);
    if (!match) {
      problem(
        `"${trimmed.slice(0, 40)}" should start with the speaker's number, like "1: Morning."`,
      );
      continue;
    }
    const speaker = Number(match[1]);
    if (speaker < 1 || speaker > speakers) {
      problem(`line "${trimmed.slice(0, 40)}": there is no speaker ${speaker} in who`);
      continue;
    }
    if (match[2]!.trim() === '') {
      problem(`speaker ${speaker} has an empty line`);
      continue;
    }
    lines.push({ speaker: speaker - 1, text: match[2]!.trim() });
  }
  if (lines.length === 0) problem('lines: nobody says anything');
  return lines;
}

// ---- Matching ------------------------------------------------------------------------------

/** True when a crew member fits every word of a speaker's selector. */
export function fitsWords(words: readonly string[], member: CrewMember): boolean {
  return words.every(
    (word) =>
      word === 'anyone' ||
      (word === 'named' && member.named) ||
      word === member.group ||
      word === member.department ||
      word === member.billet ||
      word === member.id,
  );
}

/** True when someone doing `activity` can be speaker 1 of the entry. */
export function fitsDoing(entry: DialogEntry, activity: Activity): boolean {
  return entry.doing ? entry.doing.includes(activity) : activity !== 'sleep';
}

/** True when someone doing `activity` can join in as speaker 2 or later: anyone awake. */
export function canJoin(entry: DialogEntry, activity: Activity): boolean {
  return activity !== 'sleep' || (entry.doing?.includes('sleep') ?? false);
}

/**
 * Entries that can never happen: at no time of the crew's day (two days, every ten minutes) are
 * people who fit `who` together where, when and doing what the entry asks. As sentences.
 */
export function neverHappen(
  entries: readonly DialogEntry[],
  roster: Roster,
  routine: CrewContent['routine'],
  ship: Ship,
): string[] {
  const rooms = new Map<string, { type: string; deck: number }>();
  const roomOf = (id: string) => {
    let room = rooms.get(id);
    if (!room) {
      const found = findRoom(ship, id);
      room = { type: found?.room.type ?? '', deck: found?.deck.deck ?? 0 };
      rooms.set(id, room);
    }
    return room;
  };
  const roomType = (id: string) => roomOf(id).type || null;
  // Where everyone is, sample by sample.
  const samples: { minute: number; blocks: { member: CrewMember; block: Block }[] }[] = [];
  const plans = roster.members.map((member) => [0, 1].map((day) => dayPlan(member, routine, day)));
  for (const day of [0, 1]) {
    for (let minute = 0; minute < 24 * 60; minute += 10) {
      samples.push({
        minute,
        blocks: roster.members.map((member, i) => ({
          member,
          block: blockAt(plans[i]![day]!, minute),
        })),
      });
    }
  }

  const problems: string[] = [];
  for (const entry of entries) {
    let firstFound = false;
    let missing = 1;
    const happens = samples.some(({ minute, blocks }) => {
      if (!fitsTime(entry, minute)) return false;
      return blocks.some(({ member, block }) => {
        if (!fitsWords(entry.who[0]!, member) || !fitsDoing(entry, block.activity)) return false;
        const room = roomOf(block.room);
        if (!fitsPlace(entry, block.room, room.deck, roomType)) return false;
        firstFound = true;
        const used = new Set([member.id]);
        for (let k = 1; k < entry.who.length; k++) {
          const other = blocks.find(
            (candidate) =>
              !used.has(candidate.member.id) &&
              candidate.block.room === block.room &&
              canJoin(entry, candidate.block.activity) &&
              fitsWords(entry.who[k]!, candidate.member),
          );
          if (!other) {
            missing = Math.max(missing, k + 1);
            return false;
          }
          used.add(other.member.id);
        }
        return true;
      });
    });
    if (happens) continue;
    const who = (k: number) => `"${entry.who[k - 1]!.join(' ')}"`;
    problems.push(
      firstFound
        ? `${entry.file}: ${entry.id}: never happens: speaker 1 is there, but never with anyone who fits speaker ${missing} (${who(missing)}) in the same room at the same time (see content/crew/billets.yaml and routine.yaml for who is where when)`
        : `${entry.file}: ${entry.id}: never happens: nobody who fits speaker 1 (${who(1)}) is ever there at that time doing that (see content/crew/billets.yaml and routine.yaml for who is where when)`,
    );
  }
  return problems;
}

/** True when the entry can happen in a space (a room id, or a passage or shaft) on a deck. */
export function fitsPlace(
  entry: DialogEntry,
  space: string | null,
  deck: number,
  roomType: (id: string) => string | null,
): boolean {
  if (!entry.where) return true;
  return entry.where.some((place) =>
    place.kind === 'deck'
      ? place.deck === deck
      : place.kind === 'room'
        ? place.id === space
        : space !== null && roomType(space) === place.type,
  );
}

/** True when the entry can happen at a minute of the day. */
export function fitsTime(entry: DialogEntry, minute: number): boolean {
  if (!entry.when) return true;
  return entry.when.some(([from, to]) =>
    from <= to ? minute >= from && minute < to : minute >= from || minute < to,
  );
}

/** Fills in {captain}, {ship}, {1}, {2.first}, {delgado.last}… */
export function fillIn(text: string, speakers: readonly CrewMember[], names: DialogNames): string {
  return text.replace(PLACEHOLDER, (whole, name: string, part?: string) => {
    if (name === 'captain') return names.captain;
    if (name === 'ship') return names.ship;
    const member = /^\d+$/.test(name) ? speakers[Number(name) - 1] : names.characters.get(name);
    if (!member) return whole;
    switch (part) {
      case 'first':
        return member.given;
      case 'last':
        return member.family;
      case 'rank':
        return member.rank;
      default:
        return callSign(member);
    }
  });
}

/** The ship's name as the crew say it: "Kestrel" for "CNS Kestrel". */
export function spokenShipName(name: string): string {
  return name.replace(/^[A-Z]{2,4}\s+/, '');
}

function list<T>(value: T | readonly T[] | undefined): T[] {
  return value === undefined
    ? []
    : Array.isArray(value)
      ? [...(value as readonly T[])]
      : [value as T];
}

function validTime(time: string): boolean {
  const [h, m] = time.split(':').map(Number);
  return h! <= 24 && m! < 60 && (h! < 24 || m === 0);
}
