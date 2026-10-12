/** Shared helpers for the Playwright tests in tests/e2e and tests/shots. */
import { expect, type Page } from '@playwright/test';

/** Opens the game with URL parameters and waits until the first frames have rendered. */
export async function openGame(page: Page, query = ''): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`/${query}`);
  await expect(page.locator('body[data-ready="true"]')).toBeAttached({ timeout: 60_000 });
  return { errors };
}

/** Where the captain stands on the plan (metres) and looks (degrees). */
export function pose(page: Page) {
  return page.evaluate(() => window.__captain!.pose());
}

/** Waits until the game has drawn `count` more frames. */
export async function waitFrames(page: Page, count: number): Promise<void> {
  const start = await page.evaluate(() => window.__captain!.frames());
  await expect
    .poll(() => page.evaluate(() => window.__captain!.frames()), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(start + count);
}

/** In an event's scene: presses Space until choices show (or the panel closes); their texts. */
export async function untilChoices(page: Page): Promise<string[]> {
  const choices = page.locator('.event-choices button');
  for (let i = 0; i < 40 && (await choices.count()) === 0; i++) {
    if ((await page.getByTestId('event').count()) === 0) break;
    await page.keyboard.press('Space');
  }
  return choices.allInnerTexts();
}
