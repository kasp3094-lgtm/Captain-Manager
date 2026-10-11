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
