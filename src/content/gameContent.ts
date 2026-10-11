/**
 * The game's content as the running game sees it. Files in content/ become plain data at build
 * time (the YAML plugin in vite.config.ts) and are checked against their schemas at startup.
 */
import balanceData from '../../content/balance.yaml';
import shipData from '../../content/ship/ship.yaml';
import { BalanceSchema, type Balance } from './balance';
import { DeckSchema, ShipInfoSchema, assembleShip, type Ship } from './ship';

const deckData = import.meta.glob<unknown>('../../content/ship/deck*.yaml', {
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
