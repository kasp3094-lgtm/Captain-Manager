/**
 * Saving and loading in the browser: a save in the middle of the first mission survives a reload
 * and picks up where it left off (Continue on the start screen), and loading from the pause screen
 * puts the captain and ship's time back as they were saved.
 */
import { expect, test, type Page } from '@playwright/test';
import { openGame, pose, untilChoices } from '../support';

/** Everything the test hook says about the game's state. */
function state(page: Page) {
  return page.evaluate(() => {
    const captain = window.__captain!;
    return {
      command: captain.command(),
      event: captain.event(),
      done: captain.eventsDone(),
      pose: captain.pose(),
      time: captain.time(),
    };
  });
}

/** Minutes between two ship's times, "HH:MM". */
function minutesApart(a: string, b: string): number {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return Math.abs(minutes(a) - minutes(b));
}

test('a save half way through the mission survives a reload, and the story goes on', async ({
  page,
}) => {
  test.setTimeout(4 * 60_000);
  const first = await openGame(page, '?autostart&seed=3&time=0808&cam=captains-quarters');

  // Called to the bridge; the first scene, up to the walk to the hangar.
  await expect(page.getByTestId('objective')).toContainText('Go to the Bridge', {
    timeout: 60_000,
  });
  await page.evaluate(() => window.__captain!.goTo('bridge'));
  await expect(page.getByTestId('event')).toContainText('Captain on the bridge!');
  await untilChoices(page);
  await page.keyboard.press('Digit1');
  await untilChoices(page);
  await page.keyboard.press('Digit2');
  await expect.poll(async () => (await untilChoices(page)).length).toBe(0);
  await expect(page.getByTestId('objective')).toContainText('Go to the Hangar (deck 3)');

  // Pause (ship's time stops) and save in slot 1.
  await page.keyboard.press('Escape');
  const saved = await state(page);
  expect(saved.event).toMatchObject({ status: 'away', room: 'hangar' });
  await page.getByRole('button', { name: 'Save game' }).click();
  await page.getByRole('button', { name: /Slot 1/ }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Saved in slot 1.');
  await expect(page.getByRole('button', { name: /Slot 1/ })).toContainText(
    `Day 1, ${saved.time.replace(':', '')} · Bridge, deck 1`,
  );
  expect(first.errors).toEqual([]);

  // A new visit: the start screen offers to continue.
  const second = await openGame(page, '?debug&seed=3');
  const resume = page.getByRole('button', { name: /Continue/ });
  await expect(resume).toContainText('Bridge, deck 1');
  await resume.click();
  await expect.poll(() => page.evaluate(() => window.__captain!.mode())).toBe('playing');

  const loaded = await state(page);
  expect(loaded.command).toEqual(saved.command);
  expect(loaded.event).toEqual(saved.event);
  expect(loaded.done).toEqual([]);
  expect(loaded.pose.deck).toBe(saved.pose.deck);
  expect(loaded.pose.x).toBeCloseTo(saved.pose.x, 1);
  expect(loaded.pose.y).toBeCloseTo(saved.pose.y, 1);
  expect(minutesApart(loaded.time, saved.time)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId('objective')).toContainText('Go to the Hangar (deck 3)');

  // In the hangar the scene goes on from where it was.
  await page.evaluate(() => window.__captain!.goTo('hangar'));
  await expect(page.getByTestId('event')).toContainText('Six marines');
  expect(second.errors).toEqual([]);
});

test('loading from the pause screen puts the captain and the clock back', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart&seed=3&cam=crew-mess');
  await page.keyboard.press('Escape');
  const saved = await state(page);
  await page.getByRole('button', { name: 'Save game' }).click();
  // The autosave isn't offered for saving over.
  await expect(page.getByRole('button', { name: /Autosave/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Slot 2/ }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Saved in slot 2.');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();

  // Off somewhere else, then back to the save.
  await page.evaluate(() => window.__captain!.goTo('reactor'));
  await expect(page.locator('.minimap')).toContainText('Reactor');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Load game' }).click();
  // Pausing just autosaved; an empty slot can't be loaded.
  await expect(page.getByRole('button', { name: /Autosave/ })).toContainText('Reactor');
  await expect(page.getByRole('button', { name: /Slot 3/ })).toBeDisabled();
  await page.getByRole('button', { name: /Slot 2/ }).click();
  await expect.poll(() => page.evaluate(() => window.__captain!.mode())).toBe('playing');

  const here = await pose(page);
  expect(here.deck).toBe(saved.pose.deck);
  expect(here.x).toBeCloseTo(saved.pose.x, 1);
  expect(here.y).toBeCloseTo(saved.pose.y, 1);
  await expect(page.locator('.minimap')).toContainText('Crew Mess');
  expect(
    minutesApart(await page.evaluate(() => window.__captain!.time()), saved.time),
  ).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
