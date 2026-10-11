/**
 * Which schema checks which file in content/, plus the checks that need several files at once.
 * Used by `npm run validate` (tools/validate-content.ts) and the unit tests.
 */
import { z, type ZodType } from 'zod';
import { buildRoster } from '../sim/crew';
import { neverHappen, readDialog } from '../sim/dialog';
import { checkEventScript } from '../sim/events';
import { checkSchedules } from '../sim/schedule';
import { checkShip } from '../sim/ship';
import { planShip } from '../world/ship/layout';
import { BalanceSchema } from './balance';
import {
  BilletsSchema,
  CharactersSchema,
  NamesSchema,
  RoutineSchema,
  type CrewContent,
} from './crew';
import { DialogFileSchema, type DialogFile } from './dialog';
import { EventSchema, type EventData } from './events';
import { compileInk } from './ink';
import {
  DeckSchema,
  ShipInfoSchema,
  assembleShip,
  type Deck,
  type Ship,
  type ShipInfo,
} from './ship';

/** A kind of file in content/ and the schema every file of that kind must match. */
export interface ContentKind {
  readonly name: string;
  /** Matched against the path relative to content/, with forward slashes. */
  readonly pattern: RegExp;
  readonly schema: ZodType;
  /** Read as plain text rather than YAML (Ink scripts). */
  readonly text?: boolean;
}

const DECK_FILE = /^ship\/deck\d+\.yaml$/;
const DIALOG_FILE = /^dialog\/[a-z0-9-]+\.yaml$/;
const EVENT_FILE = /^events\/[a-z0-9-]+\/[a-z0-9-]+\.yaml$/;
const SCRIPT_FILE = /^events\/[a-z0-9-]+\/[a-z0-9-]+\.ink$/;

/** Every file in content/ must match one of these (README.md files excepted). */
export const CONTENT_KINDS: readonly ContentKind[] = [
  { name: 'balance', pattern: /^balance\.yaml$/, schema: BalanceSchema },
  { name: 'ship', pattern: /^ship\/ship\.yaml$/, schema: ShipInfoSchema },
  { name: 'deck plan', pattern: DECK_FILE, schema: DeckSchema },
  { name: 'billets', pattern: /^crew\/billets\.yaml$/, schema: BilletsSchema },
  { name: 'characters', pattern: /^crew\/characters\.yaml$/, schema: CharactersSchema },
  { name: 'names', pattern: /^crew\/names\.yaml$/, schema: NamesSchema },
  { name: 'routine', pattern: /^crew\/routine\.yaml$/, schema: RoutineSchema },
  { name: 'dialog', pattern: DIALOG_FILE, schema: DialogFileSchema },
  { name: 'event', pattern: EVENT_FILE, schema: EventSchema },
  { name: 'event script', pattern: SCRIPT_FILE, schema: z.string(), text: true },
];

/** A rule that spans several files. Runs only once every file has passed its own schema. */
export interface ContentCheck {
  readonly name: string;
  /** The files it looks at, for error messages. */
  readonly files: string;
  /** Gets every file's checked data, keyed by path relative to content/. Returns problems. */
  run(data: ReadonlyMap<string, unknown>): string[];
}

/** The ship from checked content data, or null if ship.yaml is missing. */
function shipFrom(data: ReadonlyMap<string, unknown>): Ship | null {
  // Each value has already passed the schema for its path (see CONTENT_KINDS).
  const info = data.get('ship/ship.yaml') as ShipInfo | undefined;
  if (!info) return null;
  const decks = [...data].filter(([path]) => DECK_FILE.test(path)).map(([, deck]) => deck as Deck);
  return assembleShip(info, decks);
}

/** content/crew/ from checked content data, or null if a file is missing. */
export function crewFrom(data: ReadonlyMap<string, unknown>): CrewContent | null {
  const billets = data.get('crew/billets.yaml');
  const characters = data.get('crew/characters.yaml');
  const names = data.get('crew/names.yaml');
  const routine = data.get('crew/routine.yaml');
  if (!billets || !characters || !names || !routine) return null;
  return { billets, characters, names, routine } as CrewContent;
}

export const CONTENT_CHECKS: readonly ContentCheck[] = [
  {
    name: 'ship layout',
    files: 'ship/*.yaml',
    run(data) {
      const ship = shipFrom(data);
      if (!ship) return ['ship/ship.yaml is missing'];
      // Furnish the ship in 3D (pure planning, no rendering) once the plan itself is sound.
      const problems = checkShip(ship);
      return problems.length > 0 ? problems : [...planShip(ship).problems];
    },
  },
  {
    name: 'crew',
    files: 'crew/*.yaml',
    run(data) {
      const ship = shipFrom(data);
      const crew = crewFrom(data);
      if (!ship) return ['ship/ship.yaml is missing'];
      if (!crew)
        return ['crew/billets.yaml, characters.yaml, names.yaml and routine.yaml are all needed'];
      const roster = buildRoster(crew, ship);
      if (roster.problems.length > 0) return [...roster.problems];
      return checkSchedules(roster, crew.routine);
    },
  },
  {
    name: 'dialog',
    files: 'dialog/*.yaml',
    run(data) {
      const ship = shipFrom(data);
      const crew = crewFrom(data);
      if (!ship || !crew) return ['the ship and crew files are needed to check the dialog'];
      const files = new Map(
        [...data]
          .filter(([path]) => DIALOG_FILE.test(path))
          .map(([path, file]) => [path, file as DialogFile]),
      );
      const { entries, problems } = readDialog(files, ship, crew);
      if (problems.length > 0) return problems;
      // Every entry must be able to happen, given who is where in the crew's day.
      const roster = buildRoster(crew, ship);
      return roster.problems.length > 0 ? [] : neverHappen(entries, roster, crew.routine, ship);
    },
  },
  {
    name: 'events',
    files: 'events/**',
    run(data) {
      const ship = shipFrom(data);
      const crew = crewFrom(data);
      if (!ship || !crew) return ['the ship and crew files are needed to check the events'];
      const problems: string[] = [];
      const ids = new Map<string, string>();
      for (const [path, value] of data) {
        if (!EVENT_FILE.test(path)) continue;
        const event = value as EventData;
        const earlier = ids.get(event.id);
        if (earlier) problems.push(`${path}: id "${event.id}" is also used by ${earlier}`);
        ids.set(event.id, path);
        const scriptPath = path.replace(/[^/]+$/, event.script);
        const source = data.get(scriptPath) as string | undefined;
        if (source === undefined) {
          problems.push(`${path}: script ${event.script} is missing (looked for ${scriptPath})`);
          continue;
        }
        const { errors } = compileInk(source, scriptPath);
        problems.push(...errors);
        problems.push(...checkEventScript(event, scriptPath, source, ship, crew));
      }
      // Every script belongs to an event.
      for (const path of data.keys()) {
        if (!SCRIPT_FILE.test(path)) continue;
        const owned = [...data].some(
          ([eventPath, value]) =>
            EVENT_FILE.test(eventPath) &&
            eventPath.replace(/[^/]+$/, (value as EventData).script) === path,
        );
        if (!owned) problems.push(`${path}: no event in its folder names it as its script`);
      }
      return problems;
    },
  },
  {
    name: 'command',
    files: 'balance.yaml',
    run(data) {
      const crew = crewFrom(data);
      const balance = data.get('balance.yaml') as
        { command?: { relations?: Record<string, number> } } | undefined;
      if (!crew || !balance?.command) return [];
      const characters = new Set(crew.characters.characters.map((character) => character.id));
      return Object.keys(balance.command.relations ?? {})
        .filter((id) => !characters.has(id))
        .map(
          (id) =>
            `command.relations: "${id}" is not a named character (content/crew/characters.yaml)`,
        );
    },
  },
];
