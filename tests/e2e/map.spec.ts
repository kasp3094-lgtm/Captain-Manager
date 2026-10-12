/** End-to-end tests of the minimap and the full ship map. */
import { expect, test, type Page } from '@playwright/test';
import { openGame } from '../support';

const mapDialog = (page: Page) => page.getByRole('dialog', { name: 'Ship map' });

test('the minimap shows the deck, the room and the nearest point of interest', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart&cam=junior-berthing-a');
  const minimap = page.locator('.minimap');
  await expect(minimap).toContainText('Deck 2 · Habitation');
  await expect(minimap).toContainText('2-30-2-L');
  await expect(minimap).toContainText('Junior Enlisted Berthing A');
  // The viewpoint is just inside the hatch, by the watch bill.
  await expect(minimap).toContainText('Watch bill');
  await expect(minimap.locator('.map-player')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('M opens the ship map on the current deck, and M closes it', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart');
  await page.keyboard.press('KeyM');
  await expect(mapDialog(page)).toBeVisible();
  await expect(page.getByRole('tab', { name: /Deck 1/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.map-info')).toContainText('You are here: 1-30-1-L');
  expect(await page.evaluate(() => window.__captain?.mode())).toBe('map');

  await page.keyboard.press('KeyM');
  await expect(mapDialog(page)).toBeHidden();
  await expect(page.locator('.minimap')).toBeVisible();
  expect(errors).toEqual([]);
});

test('deck tabs switch the plan, and pointing at a room names it', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart');
  await page.keyboard.press('KeyM');
  await page.getByRole('tab', { name: /Deck 1/ }).click();
  await expect(mapDialog(page).locator('.map-label', { hasText: 'Bridge' })).toBeVisible();
  // The bridge is the first room on deck 1.
  await mapDialog(page).locator('.map-room').first().hover();
  await expect(page.locator('.map-info')).toHaveText('1-10-0-C · Bridge');
  expect(errors).toEqual([]);
});

test('Esc on the map pauses the game', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart');
  await page.keyboard.press('KeyM');
  await expect(mapDialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  expect(errors).toEqual([]);
});
