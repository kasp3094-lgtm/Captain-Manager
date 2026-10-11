import { test } from '@playwright/test';
import { openGame } from '../support';

/**
 * Screenshots for review after visual changes: `npm run shots`, then look at artifacts/shots/.
 * Each shot is a fixed camera bookmark, so images are comparable between runs.
 */
const SHOTS = [
  { name: '01-start-screen', query: '' },
  { name: '02-spawn-hud', query: '?autostart&cam=spawn' },
  { name: '03-racks', query: '?autostart&noui&cam=racks' },
  { name: '04-lockers', query: '?autostart&noui&cam=lockers' },
  { name: '05-table', query: '?autostart&noui&cam=table' },
  { name: '06-hatch', query: '?autostart&noui&cam=hatch' },
  { name: '07-debug-colliders', query: '?autostart&debug=colliders&cam=spawn' },
];

for (const shot of SHOTS) {
  test(shot.name, async ({ page }) => {
    await openGame(page, shot.query);
    await page.screenshot({ path: `artifacts/shots/${shot.name}.png` });
  });
}
