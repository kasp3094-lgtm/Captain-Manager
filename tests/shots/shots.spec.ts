/**
 * Screenshots for review after visual changes: `npm run shots`, then look at artifacts/shots/.
 * The interface in a few states, the ship map of each deck, and every room and shaft from its
 * viewpoint (artifacts/shots/rooms/<deck>-<room>.png). Viewpoints are fixed, so images are
 * comparable between runs.
 */
import { expect, test, type Page } from '@playwright/test';
import { openGame, pose, waitFrames } from '../support';

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

/** Looks down the ladderwell's hole, so the prompt shows. */
async function lookDownTheLadder(page: Page) {
  await page.evaluate(() => {
    const captain = window.__captain!;
    const hole = captain.interactables().find((thing) => thing.label.startsWith('Climb down'))!;
    captain.face(hole.x, hole.y, 30);
  });
  await expect.poll(() => page.evaluate(() => window.__captain!.prompt())).toMatch(/Climb down/);
}

const SHOTS: readonly Shot[] = [
  { name: '01-start-screen', query: '' },
  { name: '02-spawn-hud', query: '?autostart&cam=spawn' },
  { name: '03-ladder-prompt', query: '?autostart&cam=ladder-fwd-deck2', then: lookDownTheLadder },
  {
    name: '04-lift-panel',
    query: '?autostart&cam=lift-deck2',
    then: async (page) => {
      await page.keyboard.press('KeyE');
      await expect(page.getByRole('dialog', { name: 'Which deck?' })).toBeVisible();
    },
  },
  { name: '05-debug-colliders', query: '?autostart&debug=colliders&cam=junior-berthing-a' },
  { name: '06-map-deck-1', query: '?autostart', then: mapOfDeck(1) },
  { name: '07-map-deck-2', query: '?autostart', then: mapOfDeck(2) },
  { name: '08-map-deck-3', query: '?autostart', then: mapOfDeck(3) },
  { name: '09-map-deck-4', query: '?autostart', then: mapOfDeck(4) },
];

for (const shot of SHOTS) {
  test(shot.name, async ({ page }) => {
    await openGame(page, shot.query);
    await shot.then?.(page);
    await page.screenshot({ path: `artifacts/shots/${shot.name}.png` });
  });
}

test('every room', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await openGame(page, '?autostart&noui');
  const names = await page.evaluate(() => window.__captain!.bookmarks());
  for (const name of names.filter((candidate) => candidate !== 'spawn')) {
    await page.evaluate((bookmark) => window.__captain!.goTo(bookmark), name);
    await expect
      .poll(() => page.evaluate(() => window.__captain!.ready()), { timeout: 30_000 })
      .toBe(true);
    await waitFrames(page, 3);
    const { deck } = await pose(page);
    await page.screenshot({ path: `artifacts/shots/rooms/${deck}-${name}.png` });
  }
});
