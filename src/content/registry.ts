/**
 * Which schema checks which file in content/, plus the checks that need several files at once.
 * Used by `npm run validate` (tools/validate-content.ts) and the unit tests.
 */
import type { ZodType } from 'zod';
import { checkShip } from '../sim/ship';
import { planShip } from '../world/ship/layout';
import { BalanceSchema } from './balance';
import { DeckSchema, ShipInfoSchema, assembleShip, type Deck, type ShipInfo } from './ship';

/** A kind of file in content/ and the schema every file of that kind must match. */
export interface ContentKind {
  readonly name: string;
  /** Matched against the path relative to content/, with forward slashes. */
  readonly pattern: RegExp;
  readonly schema: ZodType;
}

const DECK_FILE = /^ship\/deck\d+\.yaml$/;

/** Every file in content/ must match one of these (README.md files excepted). */
export const CONTENT_KINDS: readonly ContentKind[] = [
  { name: 'balance', pattern: /^balance\.yaml$/, schema: BalanceSchema },
  { name: 'ship', pattern: /^ship\/ship\.yaml$/, schema: ShipInfoSchema },
  { name: 'deck plan', pattern: DECK_FILE, schema: DeckSchema },
];

/** A rule that spans several files. Runs only once every file has passed its own schema. */
export interface ContentCheck {
  readonly name: string;
  /** The files it looks at, for error messages. */
  readonly files: string;
  /** Gets every file's checked data, keyed by path relative to content/. Returns problems. */
  run(data: ReadonlyMap<string, unknown>): string[];
}

export const CONTENT_CHECKS: readonly ContentCheck[] = [
  {
    name: 'ship layout',
    files: 'ship/*.yaml',
    run(data) {
      // Each value has already passed the schema for its path (see CONTENT_KINDS).
      const info = data.get('ship/ship.yaml') as ShipInfo | undefined;
      if (!info) return ['ship/ship.yaml is missing'];
      const decks = [...data]
        .filter(([path]) => DECK_FILE.test(path))
        .map(([, deck]) => deck as Deck);
      const ship = assembleShip(info, decks);
      // Furnish the ship in 3D (pure planning, no rendering) once the plan itself is sound.
      const problems = checkShip(ship);
      return problems.length > 0 ? problems : [...planShip(ship).problems];
    },
  },
];
