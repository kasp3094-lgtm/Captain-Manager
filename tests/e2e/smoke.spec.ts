/** End-to-end tests of the running game in headless Chromium: start, walk, collide, pause. */
import { expect, test, type Page } from '@playwright/test';
import { openGame } from '../support';

function feet(page: Page) {
  return page.evaluate(() => window.__captain!.feet());
}

// Software rendering on CI machines can be slow, and the game slows down rather than skip
// frames, so movement tests wait for a distance instead of holding keys for a fixed time.
const MOVE_TIMEOUT = 20_000;

test('boots to the start screen without errors', async ({ page }) => {
  const { errors } = await openGame(page);
  await expect(page.getByRole('heading', { name: 'Captain Manager' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take command' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('Take command hands over control and shows the room', async ({ page }) => {
  const { errors } = await openGame(page, '?debug');
  await page.getByRole('button', { name: 'Take command' }).click();
  await expect(page.locator('.minimap')).toContainText('2-30-2-L');
  expect(await page.evaluate(() => window.__captain?.mode())).toBe('playing');
  expect(errors).toEqual([]);
});

test('W walks the captain forward', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart&cam=spawn');
  const start = await feet(page);
  await page.keyboard.down('KeyW');
  // The spawn bookmark faces along the room, towards +x.
  await expect
    .poll(async () => (await feet(page)).x - start.x, { timeout: MOVE_TIMEOUT })
    .toBeGreaterThan(1);
  await page.keyboard.up('KeyW');
  expect(Math.abs((await feet(page)).z - start.z)).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('bulkheads stop the captain', async ({ page }) => {
  // 1.5 m from the hatch bulkhead (x = -5), facing it. The captain's radius is 0.3 m.
  const { errors } = await openGame(page, '?autostart&cam=facing-wall');
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await feet(page)).x, { timeout: MOVE_TIMEOUT }).toBeLessThan(-4.6);
  // Keep pushing against the bulkhead: the captain must get no further.
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyW');
  expect((await feet(page)).x).toBeGreaterThan(-5 + 0.3 - 0.02);
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
