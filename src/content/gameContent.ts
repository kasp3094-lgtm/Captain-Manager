/**
 * The game's content as the running game sees it. Files in content/ become plain data at build
 * time (the YAML plugin in vite.config.ts) and are checked against their schemas at startup:
 * balance, the ship, the crew and the walk-by dialog.
 */
import balanceData from '../../content/balance.yaml';
import billetsData from '../../content/crew/billets.yaml';
import charactersData from '../../content/crew/characters.yaml';
import namesData from '../../content/crew/names.yaml';
import routineData from '../../content/crew/routine.yaml';
import shipData from '../../content/ship/ship.yaml';
import { readDialog, type DialogEntry } from '../sim/dialog';
import { BalanceSchema, type Balance } from './balance';
import {
  BilletsSchema,
  CharactersSchema,
  NamesSchema,
  RoutineSchema,
  type CrewContent,
} from './crew';
import { DialogFileSchema } from './dialog';
import { DeckSchema, ShipInfoSchema, assembleShip, type Ship } from './ship';

const deckData = import.meta.glob<unknown>('../../content/ship/deck*.yaml', {
  eager: true,
  import: 'default',
});
const dialogData = import.meta.glob<unknown>('../../content/dialog/*.yaml', {
  eager: true,
  import: 'default',
});

/** Every tunable number (content/balance.yaml). */
export const balance: Balance = BalanceSchema.parse(balanceData);

/** The ship's layout: ship.yaml plus every deck plan (content/ship/). */
export const ship: Ship = assembleShip(
  ShipInfoSchema.parse(shipData),
  Object.values(deckData).map((deck) => DeckSchema.parse(deck)),
);

/** Who is aboard and how their day runs (content/crew/). */
export const crew: CrewContent = {
  billets: BilletsSchema.parse(billetsData),
  characters: CharactersSchema.parse(charactersData),
  names: NamesSchema.parse(namesData),
  routine: RoutineSchema.parse(routineData),
};

/**
 * Walk-by dialog (content/dialog/). Entries with problems are left out and reported here;
 * `npm run validate` reports them too.
 */
export const dialog: readonly DialogEntry[] = (() => {
  const files = new Map(
    Object.entries(dialogData).map(([path, data]) => [
      path.replace('../../content/', ''),
      DialogFileSchema.parse(data),
    ]),
  );
  const { entries, problems } = readDialog(files, ship, crew);
  for (const problem of problems) console.warn(`Dialog: ${problem}`);
  return entries;
})();
