/**
 * The first mission, played in the browser: the call to the bridge, the distress call, a
 * locked choice, the walk to the hangar to see the boarding party off, the verdict, and the
 * outcome card, with the command meters changed. (Screenshots of it: tests/shots.)
 */
import { expect, test, type Page } from '@playwright/test';
import { openGame, waitFrames } from '../support';

/** Presses Space until choices show, and returns their texts. */
async function untilChoices(page: Page): Promise<string[]> {
  const choices = page.locator('.event-choices button');
  for (let i = 0; i < 40 && (await choices.count()) === 0; i++) {
    if ((await page.getByTestId('event').count()) === 0) break;
    await page.keyboard.press('Space');
  }
  return choices.allInnerTexts();
}

test('the stranded trader: called to the bridge, then down to the hangar', async ({ page }) => {
  test.setTimeout(4 * 60_000);
  const { errors } = await openGame(page, '?autostart&seed=3&time=0808&cam=captains-quarters');
  const before = await page.evaluate(() => window.__captain!.command());

  // At 0810 the ship calls the captain to the bridge.
  await expect(page.locator('.ship-call')).toContainText('Captain to the bridge', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('objective')).toContainText('Go to the Bridge (deck 1)');

  // On the bridge the scene starts.
  await page.evaluate(() => window.__captain!.goTo('bridge'));
  const panel = page.getByTestId('event');
  await expect(panel).toContainText('Mayday from the Sable Wren');
  await expect(panel).toContainText('Captain on the bridge!');

  const approach = await untilChoices(page);
  expect(approach).toHaveLength(4);

  // Best speed: the Wren answers, and engineering has doubts. One choice is locked.
  await page.keyboard.press('Digit1');
  await untilChoices(page);
  const locked = page.locator('.event-choices button:disabled');
  await expect(locked).toHaveCount(1);
  await expect(locked).toContainText(/Requires: Lt\. \w+ — Trusted/);

  // Bring the parts with a marine escort: the panel closes and the captain is wanted in the hangar.
  await page.keyboard.press('Digit2');
  await expect.poll(async () => (await untilChoices(page)).length).toBe(0);
  await expect(page.getByTestId('objective')).toContainText('Go to the Hangar (deck 3)');
  await expect(page.locator('.ship-call')).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => window.__captain!.event())).toMatchObject({
    status: 'away',
    room: 'hangar',
  });

  // In the hangar it goes on: rules of engagement, the report, the verdict.
  await page.evaluate(() => window.__captain!.goTo('hangar'));
  await expect(panel).toContainText('Six marines');
  await untilChoices(page);
  await page.keyboard.press('Digit1');
  await untilChoices(page);
  // Seize the cargo and report it.
  const verdict = await page.locator('.event-choices button').allInnerTexts();
  const seize = verdict.findIndex((text) => text.includes('report it all'));
  await page.keyboard.press(`Digit${seize + 1}`);
  for (let i = 0; i < 20 && (await page.getByTestId('event-outcome').count()) === 0; i++) {
    await page.keyboard.press('Space');
  }
  await expect(page.getByTestId('event-outcome')).toContainText('High Command ▲');

  await page.keyboard.press('Enter');
  await expect(panel).toHaveCount(0);
  await waitFrames(page, 2);
  expect(await page.evaluate(() => window.__captain!.mode())).toBe('playing');
  const after = await page.evaluate(() => window.__captain!.command());
  expect(after.highCommand).toBeGreaterThan(before.highCommand);
  expect(after.flags).toContain('wren_seized');
  expect(await page.evaluate(() => window.__captain!.eventsDone())).toEqual(['stranded-trader']);
  expect(errors).toEqual([]);
});

test('?event= calls the mission at once, and the crew it needs head for the bridge', async ({
  page,
}) => {
  // Time runs six times faster: software rendering is slow, and the game slows down with it.
  const { errors } = await openGame(
    page,
    '?autostart&seed=3&timescale=6&event=stranded-trader&cam=crew-mess',
  );
  await expect(page.getByTestId('objective')).toContainText('Go to the Bridge');
  // The tactical officer leaves CIC for the bridge.
  await expect
    .poll(
      () =>
        page.evaluate(
          () => window.__captain!.crew().find((person) => person.id === 'sethi')?.space,
        ),
      {
        timeout: 90_000,
      },
    )
    .toBe('bridge');
  expect(errors).toEqual([]);
});
