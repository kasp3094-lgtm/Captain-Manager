/**
 * The crew of 100: builds the roster from content/crew/. The named characters take their
 * billets first; every other billet gets a generated crew member, drawn from the fixed seed in
 * billets.yaml so the crew is the same in every game. Everyone gets a watch section and a rack:
 * junior enlisted share racks in pairs from different sections ("hot-racking", design doc §8).
 *
 * Pure functions on content data, no 3D, so the game, the validator and the tests share them.
 */
import type {
  Billet,
  CrewContent,
  Department,
  Group,
  HairColour,
  HairStyle,
  Wear,
} from '../content/crew';
import { minutes } from '../content/crew';
import type { Room, Ship } from '../content/ship';
import { Rng } from './rng';

export type Section = 'A' | 'B' | 'C';
export type Watch = Section | 'day';

export const SECTIONS: readonly Section[] = ['A', 'B', 'C'];

/** How someone looks: picked once, never changes. */
export interface Look {
  /** 0 (lightest) to 5 (darkest). */
  readonly skin: number;
  readonly hair: HairColour;
  readonly style: HairStyle;
  readonly height: number;
  readonly build: number;
  readonly beard: boolean;
  readonly wear: Wear | null;
}

/** A rack: the room and which rack in it (0-based, in the order the 3D ship builds them). */
export interface Berth {
  readonly room: string;
  readonly rack: number;
}

export interface CrewMember {
  readonly id: string;
  readonly given: string;
  readonly family: string;
  readonly rank: string;
  readonly group: Group;
  readonly department: Department;
  readonly billet: string;
  /** The job, e.g. Helmsman. */
  readonly title: string;
  readonly watch: Watch;
  /** The room they work in. */
  readonly station: string;
  /** What they use there, e.g. helm; null for any free work spot. */
  readonly post: string | null;
  /** Rooms they make rounds of on duty; empty if they stay at their station. */
  readonly patrol: readonly string[];
  /** Day workers' working hours, minutes after midnight. Null for watch-standers. */
  readonly hours: readonly (readonly [number, number])[] | null;
  readonly berth: Berth | null;
  /** Who they share their rack with, if they hot-rack. */
  readonly rackMate: string | null;
  /** A character from characters.yaml rather than generated. */
  readonly named: boolean;
  readonly look: Look;
}

export interface Roster {
  readonly members: readonly CrewMember[];
  /** Everything that didn't add up, as sentences a designer can act on. */
  readonly problems: readonly string[];
}

/** "PO2 Barros", "Master Chief Delgado": how the crew is addressed. */
export function callSign(member: CrewMember): string {
  return `${member.rank} ${member.family}`;
}

export function fullName(member: CrewMember): string {
  return `${member.rank} ${member.given} ${member.family}`;
}

/** Builds the whole crew. Deterministic: the same content always gives the same crew. */
export function buildRoster(content: CrewContent, ship: Ship): Roster {
  const problems: string[] = [];
  const rooms = new Map(ship.decks.flatMap((deck) => deck.rooms.map((room) => [room.id, room])));
  const { billets, characters, names } = content;
  const rng = Rng.fromSeed(billets.seed);

  // One slot per post to fill: rotating billets spread A, B, C in turn.
  const slots = billets.billets.flatMap((billet) => {
    if (billet.watch === 'rotating' && billet.count % 3 !== 0) {
      problems.push(`billet ${billet.id}: a rotating billet needs a count that is a multiple of 3`);
    }
    return Array.from({ length: billet.count }, (_, i) => ({
      billet,
      watch: (billet.watch === 'rotating' ? SECTIONS[i % 3]! : billet.watch) as Watch,
      character: null as (typeof characters.characters)[number] | null,
    }));
  });

  const seenIds = new Set<string>();
  for (const character of characters.characters) {
    if (seenIds.has(character.id)) problems.push(`character ${character.id} is listed twice`);
    seenIds.add(character.id);
    const slot = slots.find(
      (candidate) =>
        !candidate.character &&
        candidate.billet.id === character.billet &&
        (!character.section || candidate.watch === character.section),
    );
    if (slot) slot.character = character;
    else if (!billets.billets.some((billet) => billet.id === character.billet)) {
      problems.push(`character ${character.id}: there is no billet "${character.billet}"`);
    } else {
      problems.push(
        `character ${character.id}: no free ${character.billet} post` +
          (character.section ? ` in section ${character.section}` : '') +
          '; raise its count in billets.yaml',
      );
    }
  }

  const familyNames = new Set(
    characters.characters.map((character) => familyOf(character.name).toLowerCase()),
  );
  const families = rng
    .shuffled(names.family)
    .filter((name) => !familyNames.has(name.toLowerCase()));
  let generated = 0;

  const members: MutableMember[] = slots.map((slot) => {
    const { billet, character } = slot;
    if (character) {
      const [given, family] = splitName(character.name);
      const base = randomLook(Rng.fromSeed(hash(character.id)), billet);
      return memberFor(billet, slot.watch, {
        id: character.id,
        given,
        family,
        rank: character.rank,
        named: true,
        look: { ...base, ...character.look, wear: character.look?.wear ?? base.wear },
        pinned: character.berth ?? null,
      });
    }
    generated++;
    const family = families.shift();
    if (!family)
      problems.push('names.yaml: not enough family names for every generated crew member');
    return memberFor(billet, slot.watch, {
      id: `crew-${String(generated).padStart(2, '0')}`,
      given: rng.pick(names.given),
      family: family ?? `Crew${generated}`,
      rank: rng.pick(billet.ranks),
      named: false,
      look: randomLook(rng, billet),
      pinned: null,
    });
  });

  problems.push(...checkPlaces(content, rooms));
  assignBerths(members, content, rooms, problems);
  return { members, problems };
}

interface MutableMember extends CrewMember {
  berth: Berth | null;
  rackMate: string | null;
  /** A room they must sleep in (characters.yaml `berth`). */
  pinned: string | null;
}

function memberFor(
  billet: Billet,
  watch: Watch,
  who: {
    id: string;
    given: string;
    family: string;
    rank: string;
    named: boolean;
    look: Look;
    pinned: string | null;
  },
): MutableMember {
  return {
    ...who,
    group: billet.group,
    department: billet.department,
    billet: billet.id,
    title: billet.title,
    watch,
    station: billet.station,
    post: billet.post ?? null,
    patrol: billet.patrol ?? [],
    hours:
      watch === 'day' && billet.hours
        ? billet.hours.map(([a, b]) => [minutes(a), minutes(b)] as const)
        : null,
    berth: null,
    rackMate: null,
  };
}

/**
 * Shares out each group's berthing, room by room in the order routine.yaml lists them. In a
 * hot-racked room every rack takes two people from different watch sections, so their sleep
 * never overlaps.
 */
function assignBerths(
  members: MutableMember[],
  content: CrewContent,
  rooms: ReadonlyMap<string, Room>,
  problems: string[],
): void {
  const queue = (room: string) =>
    members.filter((member) => member.pinned === room && !member.berth);
  const claimed = new Set<string>();

  const fill = (roomId: string, people: MutableMember[]) => {
    const room = rooms.get(roomId);
    const racks = room?.racks;
    if (!racks) {
      problems.push(`berthing ${roomId}: not a room with racks`);
      return people;
    }
    claimed.add(roomId);
    const left = [...people];
    if (!room.hotRacked) {
      for (let rack = 0; rack < racks && left.length > 0; rack++) {
        const person = left.shift()!;
        person.berth = { room: roomId, rack };
      }
      return left;
    }
    // Take as many as the room holds, then pair them across sections.
    const taken = left.splice(0, racks * 2);
    const pairs = pairAcrossSections(taken);
    if (!pairs) {
      problems.push(
        `berthing ${roomId}: can't pair its ${taken.length} sleepers so that rack-mates are in ` +
          'different watch sections',
      );
      taken.forEach((person, i) => (person.berth = { room: roomId, rack: i % racks }));
      return left;
    }
    pairs.forEach(([a, b], rack) => {
      a.berth = { room: roomId, rack };
      b.berth = { room: roomId, rack };
      a.rackMate = b.id;
      b.rackMate = a.id;
    });
    return left;
  };

  // Pinned berths first (e.g. the XO's cabin), with anyone else of their group after them.
  for (const roomId of new Set(
    members.flatMap((member) => (member.pinned ? [member.pinned] : [])),
  )) {
    const group = members.find((member) => member.pinned === roomId)!.group;
    const inGroupList = content.routine.berthing[group].includes(roomId);
    const others = inGroupList
      ? members.filter((m) => m.group === group && !m.pinned && !m.berth)
      : [];
    const rest = fill(roomId, [...queue(roomId), ...others]);
    for (const person of rest)
      if (person.pinned === roomId) problems.push(`${person.id}: ${roomId} is full`);
  }
  for (const group of Object.keys(content.routine.berthing) as Group[]) {
    let waiting = members.filter(
      (member) => member.group === group && !member.berth && !member.pinned,
    );
    for (const roomId of content.routine.berthing[group]) {
      if (claimed.has(roomId)) continue;
      waiting = fill(roomId, waiting);
    }
    if (waiting.length > 0) {
      problems.push(`${group}: ${waiting.length} crew have no rack; add racks or berthing rooms`);
    }
  }
}

/**
 * Pairs people so each pair's sections differ: with nA, nB, nC people per section, A+B pairs
 * number (nA + nB - nC) / 2 and so on. Null if that doesn't work out (or someone is a day worker).
 */
function pairAcrossSections(people: MutableMember[]): [MutableMember, MutableMember][] | null {
  if (people.length % 2 !== 0 || people.some((person) => person.watch === 'day')) return null;
  const by = (section: Section) => people.filter((person) => person.watch === section);
  const [a, b, c] = [by('A'), by('B'), by('C')];
  const ab = (a.length + b.length - c.length) / 2;
  const bc = (b.length + c.length - a.length) / 2;
  const ca = (c.length + a.length - b.length) / 2;
  if ([ab, bc, ca].some((n) => n < 0 || !Number.isInteger(n))) return null;
  const pairs: [MutableMember, MutableMember][] = [];
  for (let i = 0; i < ab; i++) pairs.push([a.shift()!, b.shift()!]);
  for (let i = 0; i < bc; i++) pairs.push([b.shift()!, c.shift()!]);
  for (let i = 0; i < ca; i++) pairs.push([c.shift()!, a.shift()!]);
  return pairs;
}

/** Every room a billet or the routine names must be a room you can walk into. */
function checkPlaces(content: CrewContent, rooms: ReadonlyMap<string, Room>): string[] {
  const problems: string[] = [];
  const check = (where: string, id: string) => {
    const room = rooms.get(id);
    if (!room) problems.push(`${where}: there is no room "${id}"`);
    else if (room.type === 'tank') problems.push(`${where}: ${id} is a tank`);
  };
  for (const billet of content.billets.billets) {
    check(`billet ${billet.id} station`, billet.station);
    for (const room of billet.patrol ?? []) check(`billet ${billet.id} patrol`, room);
  }
  const { routine } = content;
  for (const [group, list] of Object.entries(routine.berthing)) {
    for (const room of list) check(`routine berthing.${group}`, room);
  }
  for (const [group, room] of Object.entries(routine.mess)) check(`routine mess.${group}`, room);
  for (const [group, room] of Object.entries(routine.heads)) check(`routine heads.${group}`, room);
  for (const [group, weights] of Object.entries(routine.leisure)) {
    for (const room of Object.keys(weights)) {
      if (room !== 'berthing') check(`routine leisure.${group}`, room);
    }
  }
  for (const character of content.characters.characters) {
    if (character.berth) check(`character ${character.id} berth`, character.berth);
  }
  return problems;
}

const HAIR: readonly [HairColour, number][] = [
  ['black', 0.3],
  ['dark-brown', 0.28],
  ['brown', 0.16],
  ['auburn', 0.06],
  ['blonde', 0.13],
  ['grey', 0.07],
];
const STYLES: readonly [HairStyle, number][] = [
  ['short', 0.3],
  ['buzz', 0.18],
  ['bun', 0.13],
  ['ponytail', 0.1],
  ['long', 0.07],
  ['curly', 0.13],
  ['bald', 0.09],
];

function randomLook(rng: Rng, billet: Billet): Look {
  const style = weighted(rng, STYLES);
  return {
    skin: rng.int(0, 5),
    hair: weighted(rng, HAIR),
    style,
    height: 0.92 + rng.next() * 0.16,
    build: 0.9 + rng.next() * 0.25,
    beard: (style === 'short' || style === 'buzz' || style === 'bald') && rng.chance(0.22),
    wear: billet.wear ?? null,
  };
}

function weighted<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [option, weight] of options) {
    roll -= weight;
    if (roll < 0) return option;
  }
  return options[options.length - 1]![0];
}

function splitName(name: string): [string, string] {
  const parts = name.trim().split(/\s+/);
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]!];
}

function familyOf(name: string): string {
  return splitName(name)[1];
}

/** A small, stable hash of a string (FNV-1a), for per-character seeds. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
