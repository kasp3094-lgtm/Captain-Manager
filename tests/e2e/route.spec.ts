/**
 * The M1 acceptance walk: from the captain's quarters to the bridge, down the forward ladders to
 * main engineering, and back up by lift. The captain walks every step with the keyboard; the
 * test only turns them towards each waypoint, as a player would with the mouse.
 */
import { expect, test, type Page } from '@playwright/test';
import { openGame, pose } from '../support';

/** Software rendering is slow, and the game slows down rather than skip frames. */
const LEG_TIMEOUT = 60_000;
const EYE_HEIGHT = 1.65;

/** Walks (Shift held) to a point on the plan, turning towards it as it goes. */
async function walkTo(page: Page, x: number, y: number): Promise<void> {
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  try {
    await expect
      .poll(
        () =>
          page.evaluate(
            ([tx, ty]) => {
              const captain = window.__captain!;
              const here = captain.pose();
              const distance = Math.hypot(tx - here.x, ty - here.y);
              if (distance > 0.05) captain.face(tx, ty);
              return distance;
            },
            [x, y] as const,
          ),
        { timeout: LEG_TIMEOUT, intervals: [100] },
      )
      .toBeLessThan(0.4);
  } finally {
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
  }
}

/** Looks at the thing labelled `label` and checks that E would use it. */
async function lookAt(page: Page, label: string): Promise<void> {
  await page.evaluate(
    ([wanted, eye]) => {
      const captain = window.__captain!;
      const thing = captain.interactables().find((candidate) => candidate.label === wanted);
      if (!thing) throw new Error(`Nothing labelled "${wanted}" on this deck`);
      const here = captain.pose();
      const distance = Math.hypot(thing.x - here.x, thing.y - here.y);
      const pitch = (Math.atan2(eye - thing.height, distance) * 180) / Math.PI;
      captain.face(thing.x, thing.y, pitch);
    },
    [label, EYE_HEIGHT] as const,
  );
  await expect.poll(() => page.evaluate(() => window.__captain!.prompt())).toBe(label);
}

async function expectDeck(page: Page, deck: number): Promise<void> {
  await expect.poll(async () => (await pose(page)).deck, { timeout: 15_000 }).toBe(deck);
  // Back in control once the fade is over.
  await expect(page.locator('.fade[data-on]')).toHaveCount(0);
}

async function expectRoom(page: Page, code: string): Promise<void> {
  await expect(page.locator('.minimap-header')).toContainText(code);
}

test('quarters → bridge → down the ladders to engineering → back up by lift', async ({ page }) => {
  test.setTimeout(8 * 60_000);
  const { errors } = await openGame(page, '?autostart&cam=captains-quarters');
  await expectRoom(page, '1-30-1-L');

  // Out of the quarters, forward along the passageway to the bridge.
  await walkTo(page, 33, 8);
  await walkTo(page, 23.4, 8);
  await walkTo(page, 20.8, 8);
  await expectRoom(page, '1-10-0-C');

  // Back out and into the forward ladderwell, then down three decks.
  await walkTo(page, 23, 8);
  await walkTo(page, 23, 10);
  await lookAt(page, 'Climb down to Deck 2');
  await page.keyboard.press('KeyE');
  await expectDeck(page, 2);
  await lookAt(page, 'Climb down to Deck 3');
  await page.keyboard.press('KeyE');
  await expectDeck(page, 3);
  await lookAt(page, 'Climb down to Deck 4');
  await page.keyboard.press('KeyE');
  await expectDeck(page, 4);
  await expect(page.locator('.minimap')).toContainText('Deck 4 · Engineering');

  // Aft along the engineering passageway into main engineering.
  await walkTo(page, 23, 8);
  await walkTo(page, 43, 8);
  await walkTo(page, 43, 6);
  await expectRoom(page, '4-36-1-C');

  // Into the lift and up to deck 1.
  await walkTo(page, 43, 8);
  await walkTo(page, 47, 8);
  await walkTo(page, 47, 10);
  await page.evaluate(() => window.__captain!.face(47, 11, 0));
  await expect.poll(() => page.evaluate(() => window.__captain!.prompt())).toBe('Take the lift');
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('dialog', { name: 'Which deck?' })).toBeVisible();
  await page.keyboard.press('Digit1');
  await expectDeck(page, 1);

  // Out of the lift and home.
  await walkTo(page, 47, 8);
  await walkTo(page, 33, 8);
  await walkTo(page, 33, 6);
  await expectRoom(page, '1-30-1-L');
  expect(errors).toEqual([]);
});

test('ladders go up as well as down', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart&cam=ladder-fwd-deck3');
  await lookAt(page, 'Climb up to Deck 2');
  await page.keyboard.press('KeyE');
  await expectDeck(page, 2);
  // You arrive at the landing facing the way out.
  const here = await pose(page);
  expect(here.x).toBeCloseTo(23, 1);
  expect(here.y).toBeCloseTo(10, 1);
  expect(here.yaw).toBeCloseTo(0, 0);
  expect(errors).toEqual([]);
});

test('Esc in the lift stays on the deck', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart&cam=lift-deck2');
  await expect.poll(() => page.evaluate(() => window.__captain!.prompt())).toBe('Take the lift');
  await page.keyboard.press('KeyE');
  const dialog = page.getByRole('dialog', { name: 'Which deck?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Deck 2/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect((await pose(page)).deck).toBe(2);
  expect(await page.evaluate(() => window.__captain!.mode())).toBe('playing');
  expect(errors).toEqual([]);
});
