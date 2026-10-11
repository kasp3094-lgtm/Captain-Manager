import { expect, test } from '@playwright/test';
import { openGame } from '../support';

test('boots to the start screen without errors', async ({ page }) => {
  const { errors } = await openGame(page);
  await expect(page.getByRole('heading', { name: 'Captain Manager' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Take command' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('Take command hands over control and shows the room', async ({ page }) => {
  const { errors } = await openGame(page, '?debug');
  await page.getByRole('button', { name: 'Take command' }).click();
  await expect(page.locator('.hud-room')).toContainText('2-40-1-L');
  expect(await page.evaluate(() => window.__captain?.mode())).toBe('playing');
  expect(errors).toEqual([]);
});

test('W walks the captain forward', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart&cam=spawn');
  const start = await page.evaluate(() => window.__captain!.feet());
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyW');
  const end = await page.evaluate(() => window.__captain!.feet());
  // The spawn bookmark faces along the room, towards +x.
  expect(end.x - start.x).toBeGreaterThan(1);
  expect(Math.abs(end.z - start.z)).toBeLessThan(0.5);
  expect(errors).toEqual([]);
});

test('bulkheads stop the captain', async ({ page }) => {
  // 1.5 m from the hatch bulkhead (x = -5), facing it.
  const { errors } = await openGame(page, '?autostart&cam=facing-wall');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const feet = await page.evaluate(() => window.__captain!.feet());
  const radius = 0.3;
  expect(feet.x).toBeGreaterThan(-5 + radius - 0.02);
  expect(feet.x).toBeLessThan(-4.5);
  expect(errors).toEqual([]);
});

test('Esc pauses and Resume hands control back', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart');
  await page.keyboard.press('Escape');
  const resume = page.getByRole('button', { name: 'Resume' });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.locator('.hud-room')).toBeVisible();
  expect(errors).toEqual([]);
});
