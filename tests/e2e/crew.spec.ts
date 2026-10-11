/**
 * The crew aboard (M3): everyone where their day says, the 1600 change of watch, dialog the
 * captain overhears, and talking to someone with E. Seeds are fixed so the crew's choices are
 * the same every run.
 */
import { expect, test } from '@playwright/test';
import { openGame, waitFrames } from '../support';

test('the crew is aboard, the watch at its posts', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart&seed=3&time=1000&timescale=0&cam=bridge');
  const crew = await page.evaluate(() => window.__captain!.crew());
  expect(crew).toHaveLength(99);
  const bridge = crew.filter((person) => person.space === 'bridge' && person.settled);
  expect(bridge.length).toBeGreaterThanOrEqual(4);
  expect(bridge.every((person) => person.activity === 'duty')).toBe(true);
  expect(errors).toEqual([]);
});

test('the 1600 change of watch reshuffles the crew', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart&seed=3&time=1550&timescale=30&cam=passage-2');
  // Ship's time shows on the minimap.
  await expect(page.getByTestId('ship-time')).toHaveText(/^1[56]\d\d$/);
  const before = await page.evaluate(() =>
    Object.fromEntries(window.__captain!.crew().map((person) => [person.id, person.space])),
  );
  await expect
    .poll(() => page.evaluate(() => window.__captain!.time()), { timeout: 60_000 })
    .toMatch(/^16:(2|3|4|5)\d$/);
  const after = await page.evaluate(() => window.__captain!.crew());
  const moved = after.filter((person) => person.space !== before[person.id]);
  expect(moved.length).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});

test('the captain overhears the crew talking', async ({ page }) => {
  const { errors } = await openGame(
    page,
    '?autostart&seed=3&time=1210&cam=crew-mess&dialog=mess-coffee',
  );
  const speech = page.getByTestId('speech');
  await expect(speech).toContainText('Who made the coffee?', { timeout: 30_000 });
  await expect(speech).toContainText('Engineering', { timeout: 30_000 });
  expect(errors).toEqual([]);
});

test('E talks to whoever the captain looks at', async ({ page }) => {
  const { errors } = await openGame(page, '?autostart&seed=3&time=1210&timescale=0&cam=galley');
  // Stand a step behind the nearest person at work (they stand on open floor), facing them.
  const target = await page.evaluate(() => {
    const captain = window.__captain!;
    const here = captain.pose();
    const away = (person: { x: number; y: number }) =>
      Math.hypot(person.x - here.x, person.y - here.y);
    const worker = captain
      .crew()
      .filter((person) => person.deck === here.deck && person.settled && person.pose === 'work')
      .sort((a, b) => away(a) - away(b))[0]!;
    // Yaw 0 faces starboard (towards smaller y); behind is the other way.
    const yaw = (worker.yaw * Math.PI) / 180;
    captain.place(
      worker.deck,
      worker.x - Math.sin(yaw) * 1.2,
      worker.y + Math.cos(yaw) * 1.2,
      worker.yaw,
    );
    return worker;
  });
  await waitFrames(page, 3);
  await page.evaluate(({ x, y }) => window.__captain!.face(x, y, 15), target);
  await expect
    .poll(() => page.evaluate(() => window.__captain!.prompt()))
    .toBe(`Talk to ${target.name}`);
  await page.keyboard.press('KeyE');
  await expect
    .poll(() => page.evaluate(() => window.__captain!.speech()?.name ?? null))
    .toBe(target.name);
  await expect(page.getByTestId('speech')).toBeVisible();
  expect(errors).toEqual([]);
});
