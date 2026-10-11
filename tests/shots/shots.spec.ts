/**
 * Screenshots for review after visual changes: `npm run shots`, then look at artifacts/shots/.
 * Each shot is a fixed camera bookmark (and, for the map, a fixed deck), so images are
 * comparable between runs.
 */
import { expect, test, type Page } from '@playwright/test';
import { openGame } from '../support';

interface Shot {
  readonly name: string;
  readonly query: string;
  /** Extra steps after the game is ready, before the screenshot. */
  readonly then?: (page: Page) => Promise<void>;
}

function mapOfDeck(deck: number) {
  return async (page: Page) => {
    await page.keyboard.press('KeyM');
    await page.getByRole('tab', { name: new RegExp(`Deck ${deck}`) }).click();
    await expect(page.getByRole('dialog', { name: 'Ship map' })).toBeVisible();
  };
}

const SHOTS: readonly Shot[] = [
  { name: '01-start-screen', query: '' },
  { name: '02-spawn-hud', query: '?autostart&cam=spawn' },
  { name: '03-racks', query: '?autostart&noui&cam=racks' },
  { name: '04-lockers', query: '?autostart&noui&cam=lockers' },
  { name: '05-table', query: '?autostart&noui&cam=table' },
  { name: '06-hatch', query: '?autostart&noui&cam=hatch' },
  { name: '07-debug-colliders', query: '?autostart&debug=colliders&cam=spawn' },
  { name: '08-map-deck-2', query: '?autostart&cam=spawn', then: mapOfDeck(2) },
  { name: '09-map-deck-1', query: '?autostart&cam=spawn', then: mapOfDeck(1) },
  { name: '10-map-deck-3', query: '?autostart&cam=spawn', then: mapOfDeck(3) },
  { name: '11-map-deck-4', query: '?autostart&cam=spawn', then: mapOfDeck(4) },
];

for (const shot of SHOTS) {
  test(shot.name, async ({ page }) => {
    await openGame(page, shot.query);
    await shot.then?.(page);
    await page.screenshot({ path: `artifacts/shots/${shot.name}.png` });
  });
}
