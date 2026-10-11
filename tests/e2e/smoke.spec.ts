/** End-to-end tests of the running game in headless Chromium: start, walk, collide, pause. */
import { expect, test } from '@playwright/test';
import { openGame, pose } from '../support';

// Software rendering on CI machines can be slow, and the game slows down rather than skip
// frames, so movement tests wait for a distance instead of holding keys for a fixed time.
const MOVE_TIMEOUT = 20_000;

test('boots to the start screen without errors', async ({ page }) => {
  const { errors } = await openGame(page);
  await expect(page.getByRole('heading', { name: 'Captain Manager' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take command' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('Take command hands over control in the captain’s quarters', async ({ page }) => {
  const { errors } = await openGame(page, '?debug');
  await page.getByRole('button', { name: 'Take command' }).click();
  await expect(page.locator('.minimap')).toContainText('1-30-1-L');
  expect(await page.evaluate(() => window.__captain?.mode())).toBe('playing');
  expect(errors).toEqual([]);
});

test('W walks the captain the way they face', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart');
  // In the main passageway on deck 1, looking aft along it.
  await page.evaluate(() => window.__captain!.place(1, 36, 8, 90));
  const start = await pose(page);
  await page.keyboard.down('KeyW');
  await expect
    .poll(async () => (await pose(page)).x - start.x, { timeout: MOVE_TIMEOUT })
    .toBeGreaterThan(1);
  await page.keyboard.up('KeyW');
  expect(Math.abs((await pose(page)).y - start.y)).toBeLessThan(0.3);
  expect(errors).toEqual([]);
});

test('bulkheads stop the captain', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart');
  // 1.4 m from the aft end of the deck 1 passageway (its wall face is at x = 59.9), facing it.
  await page.evaluate(() => window.__captain!.place(1, 58.5, 8, 90));
  await page.keyboard.down('KeyW');
  await expect
    .poll(async () => (await pose(page)).x, { timeout: MOVE_TIMEOUT })
    .toBeGreaterThan(59.4);
  // Keep pushing against the bulkhead: the captain must get no further.
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  expect((await pose(page)).x).toBeLessThan(59.9 - 0.3 + 0.02);
  expect(errors).toEqual([]);
});

test('Esc pauses and Resume hands control back', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart');
  await page.keyboard.press('Escape');
  const resume = page.getByRole('button', { name: 'Resume' });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.locator('.minimap')).toBeVisible();
  expect(errors).toEqual([]);
});
