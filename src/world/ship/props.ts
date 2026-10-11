/**
 * What every item from fits.ts looks like: racks, lockers, consoles, tables, machinery and the
 * rest, built from boxes, prisms and rings. Each prop is drawn in its own frame: x across its
 * front (seen from the front, +x is on your left), z from its back (-depth/2, usually against a
 * wall) to its front (+depth/2), y up from the deck. build.ts stands it in the room.
 */
import { Rng } from '../../sim/rng';
import type { Builder, Vec3 } from '../builder';
import {
  paintClock,
  paintDamageBoard,
  paintLabel,
  paintMemorial,
  paintNoticeboard,
  paintPicture,
  paintScreen,
  type Painter,
  type PanelSet,
  type ScreenKind,
} from '../painted';
import type { Swatch } from '../palette';
import { ROOM_HEIGHT } from './coords';
import type { ItemKind, PlacedItem } from './fits';

/** What a prop builder gets besides the builder: its item, the deck's painted panels, dice. */
export interface PropContext {
  readonly item: PlacedItem;
  /** Lit panels (labels, noticeboards) and glowing ones (screens). */
  readonly panels: PanelSet;
  readonly screens: PanelSet;
  readonly random: Rng;
}

type PropBuilder = (b: Builder, ctx: PropContext) => void;

/** Builds one item, standing at its place in the room. */
export function buildProp(b: Builder, ctx: PropContext): void {
  PROPS[ctx.item.kind](b, ctx);
}

// ---- Small parts shared by several props ------------------------------------------------------

/** A flat painted panel facing +z, centred at `centre`. */
function panel(
  b: Builder,
  set: PanelSet,
  paint: Painter,
  centre: Vec3,
  width: number,
  height: number,
): void {
  const [x, y, z] = centre;
  set.add({
    width,
    height,
    paint,
    corners: [
      b.toWorld([x + width / 2, y - height / 2, z]),
      b.toWorld([x - width / 2, y - height / 2, z]),
      b.toWorld([x - width / 2, y + height / 2, z]),
      b.toWorld([x + width / 2, y + height / 2, z]),
    ],
    normal: b.directionToWorld([0, 0, 1]),
  });
}

/** A swivel chair at the origin; whoever sits in it looks along +z. */
function chair(b: Builder, seat: Swatch = 'seat'): void {
  b.prism('metalDark', [0, 0.02, 0], { diameter: 0.5, length: 0.04, sides: 5 });
  b.prism('metal', [0, 0.25, 0], { diameter: 0.05, length: 0.42, sides: 6 });
  b.box(seat, [0, 0.49, 0.02], [0.46, 0.08, 0.44]);
  b.box(seat, [0, 0.82, -0.2], [0.44, 0.5, 0.06], { pitch: -0.12 });
}

/** A stool at the origin. */
function stool(b: Builder): void {
  b.prism('metalDark', [0, 0.01, 0], { diameter: 0.32, length: 0.02 });
  b.prism('metal', [0, 0.23, 0], { diameter: 0.06, length: 0.42, sides: 6 });
  b.prism('seat', [0, 0.47, 0], { diameter: 0.38, length: 0.07, sides: 12 });
}

/** Four legs under a rectangle `w` × `d`, `h` tall. */
function legs(b: Builder, swatch: Swatch, w: number, d: number, h: number, size = 0.05): void {
  for (const x of [-w / 2 + size, w / 2 - size]) {
    for (const z of [-d / 2 + size, d / 2 - size]) b.box(swatch, [x, h / 2, z], [size, h, size]);
  }
}

/** A screen in a dark bezel, facing +z, `w` × `h`, centred at `centre`. */
function screen(
  b: Builder,
  ctx: PropContext,
  centre: Vec3,
  w: number,
  h: number,
  kind?: ScreenKind,
): void {
  const [x, y, z] = centre;
  b.box('consoleTop', [x, y, z - 0.02], [w + 0.08, h + 0.08, 0.04]);
  if (kind) panel(b, ctx.screens, paintScreen(kind, ctx.item.seed), [x, y, z + 0.002], w, h);
  else b.box(pick(ctx, ['screen', 'screenBlue', 'screen']), [x, y, z + 0.002], [w, h, 0.004]);
}

/** A sloped desk console, operator side +z, centred at x. */
function console(b: Builder, ctx: PropContext, x: number, z: number, width = 1.15): void {
  b.box('console', [x, 0.36, z - 0.05], [width, 0.72, 0.5]);
  b.box('consoleTop', [x, 0.74, z + 0.05], [width + 0.04, 0.04, 0.7]);
  b.box('console', [x, 1.0, z - 0.22], [width, 0.5, 0.14], { pitch: 0.25 });
  b.box(
    pick(ctx, ['screen', 'screenBlue', 'screenAmber']),
    [x, 1.0, z - 0.145],
    [width - 0.12, 0.38, 0.01],
    {
      pitch: 0.25,
    },
  );
  b.box('consoleTop', [x, 0.765, z + 0.2], [width * 0.6, 0.012, 0.18]);
  for (let i = 0; i < 4; i++) {
    b.box(
      i % 3 === 0 ? 'ledRed' : 'ledGreen',
      [x - width / 2 + 0.12 + i * 0.08, 0.77, z + 0.33],
      [0.03, 0.01, 0.03],
    );
  }
}

/** Rows of boxes on a shelf between x0 and x1, at height y, up to `depth` deep. */
function boxesOnShelf(
  b: Builder,
  ctx: PropContext,
  x0: number,
  x1: number,
  y: number,
  z: number,
  depth: number,
  maxHeight: number,
): void {
  let x = x0 + 0.03;
  while (x < x1 - 0.1) {
    const w = 0.18 + ctx.random.next() * 0.35;
    if (x + w > x1 - 0.03) break;
    if (ctx.random.chance(0.85)) {
      const h = 0.15 + ctx.random.next() * (maxHeight - 0.15);
      const d = depth * (0.6 + ctx.random.next() * 0.35);
      b.box(
        pick(ctx, ['boxBlue', 'boxTan', 'boxGreen', 'boxGrey', 'crate']),
        [x + w / 2, y + h / 2, z - (depth - d) / 2],
        [w, h, d],
      );
    }
    x += w + 0.03;
  }
}

function pick<T>(ctx: PropContext, options: readonly T[]): T {
  return options[ctx.random.int(0, options.length - 1)]!;
}

/** Units in a row along x, centred, each `unit` wide: calls build(centreX, index). */
function row(ctx: PropContext, unit: number, build: (x: number, index: number) => void): void {
  const count = ctx.item.count;
  for (let i = 0; i < count; i++) build((i - (count - 1) / 2) * unit, i);
}

// ---- Every prop ------------------------------------------------------------------------------

const PROPS: Record<ItemKind, PropBuilder> = {
  // ---- Sleeping
  'rack-stack'(b, ctx) {
    // Three racks high, each with a mattress, reading light and privacy curtain (Act 1 §3.6).
    const back = -0.425;
    const front = 0.425;
    const top = 2.2;
    const levels = [0.36, 1.0, 1.64];
    b.slab('rackBase', [-1, 0, back], [1, 0.32, front]);
    b.slab('rackDrawer', [-0.94, 0.05, front], [-0.03, 0.27, front + 0.01]);
    b.slab('rackDrawer', [0.03, 0.05, front], [0.94, 0.27, front + 0.01]);
    b.slab('rackFrame', [-1, 0, back], [-0.95, top, front]);
    b.slab('rackFrame', [0.95, 0, back], [1, top, front]);
    b.slab('rackFrame', [-1, top - 0.04, back], [1, top, front]);
    levels.forEach((h, level) => {
      const ceiling = levels[level + 1] ?? top - 0.04;
      b.slab('rackFrame', [-0.95, h, back], [0.95, h + 0.04, front]);
      const railY = ceiling - 0.04;
      b.slab('rackFrame', [-0.95, railY - 0.02, front + 0.01], [0.95, railY, front + 0.03]);
      if (level >= ctx.item.count) return;
      b.slab('mattress', [-0.93, h + 0.04, back + 0.04], [0.93, h + 0.16, front - 0.05]);
      b.slab('pillow', [0.5, h + 0.16, back + 0.12], [0.92, h + 0.24, front - 0.14]);
      if (ctx.random.chance(0.5)) {
        b.slab('blanket', [-0.93, h + 0.16, back + 0.03], [0.45, h + 0.19, front - 0.04]);
      } else {
        b.slab('blanket', [-0.9, h + 0.16, back + 0.15], [-0.5, h + 0.27, front - 0.15]);
      }
      b.box('readingLight', [0.8, h + 0.42, back + 0.03], [0.16, 0.05, 0.04]);
      // Closed means someone is asleep.
      const curtain = ctx.random.int(0, 2);
      const [left, right] =
        curtain === 0 ? [-0.94, 0.94] : curtain === 1 ? [-0.94, -0.05] : [-0.94, -0.76];
      b.slab('curtain', [left, h + 0.17, front + 0.015], [right, railY - 0.02, front + 0.035]);
    });
  },

  bunk(b) {
    // An officer's bunk: drawers under, a headboard, a reading light.
    const [d, w] = [0.95, 2.0];
    b.slab('woodDark', [-w / 2, 0, -d / 2], [w / 2, 0.42, d / 2]);
    for (const x of [-0.5, 0.5])
      b.slab('wood', [x - 0.42, 0.06, d / 2], [x + 0.42, 0.36, d / 2 + 0.01]);
    b.slab('mattress', [-w / 2 + 0.03, 0.42, -d / 2 + 0.03], [w / 2 - 0.08, 0.6, d / 2 - 0.03]);
    b.slab('pillow', [w / 2 - 0.5, 0.6, -d / 2 + 0.1], [w / 2 - 0.12, 0.7, d / 2 - 0.1]);
    b.slab('blanket', [-w / 2 + 0.05, 0.6, -d / 2 + 0.02], [0.35, 0.65, d / 2 - 0.02]);
    b.slab('woodDark', [w / 2 - 0.08, 0, -d / 2], [w / 2, 0.95, d / 2]);
    b.box('readingLight', [w / 2 - 0.3, 1.25, -d / 2 + 0.03], [0.16, 0.06, 0.05]);
  },

  'bunk-double'(b) {
    const [w, d] = [2.0, 0.9];
    b.slab('rackFrame', [-w / 2, 0, -d / 2], [-w / 2 + 0.05, 1.8, d / 2]);
    b.slab('rackFrame', [w / 2 - 0.05, 0, -d / 2], [w / 2, 1.8, d / 2]);
    b.slab('rackBase', [-w / 2, 0, -d / 2], [w / 2, 0.3, d / 2]);
    for (const h of [0.3, 1.1]) {
      b.slab('rackFrame', [-w / 2, h, -d / 2], [w / 2, h + 0.05, d / 2]);
      b.slab(
        'mattress',
        [-w / 2 + 0.06, h + 0.05, -d / 2 + 0.03],
        [w / 2 - 0.06, h + 0.18, d / 2 - 0.03],
      );
      b.slab(
        'pillow',
        [w / 2 - 0.45, h + 0.18, -d / 2 + 0.1],
        [w / 2 - 0.08, h + 0.26, d / 2 - 0.1],
      );
      b.slab('blanket', [-w / 2 + 0.08, h + 0.18, -d / 2 + 0.02], [0.3, h + 0.21, d / 2 - 0.02]);
      b.box('readingLight', [w / 2 - 0.25, h + 0.45, -d / 2 + 0.03], [0.14, 0.05, 0.04]);
    }
    // Ladder to the top bunk.
    for (let y = 0.45; y < 1.1; y += 0.25)
      b.slab('metal', [-w / 2 + 0.06, y, d / 2 - 0.04], [-w / 2 + 0.4, y + 0.03, d / 2]);
    b.slab('curtain', [-w / 2 + 0.06, 1.3, d / 2 - 0.02], [-0.2, 1.75, d / 2]);
  },

  lockers(b, ctx) {
    const depth = 0.55;
    const front = depth / 2;
    const width = ctx.item.width;
    b.slab('lockerBase', [-width / 2, 0, -front], [width / 2, 0.08, front + 0.01]);
    b.slab('lockerBody', [-width / 2, 0.08, -front], [width / 2, 1.95, front]);
    row(ctx, 0.6, (x) => {
      b.slab('lockerDoor', [x - 0.275, 0.12, front], [x + 0.275, 1.91, front + 0.012]);
      b.slab('metal', [x - 0.25, 0.95, front + 0.012], [x - 0.225, 1.1, front + 0.035]);
      for (let k = 0; k < 3; k++) {
        b.slab(
          'lockerVent',
          [x - 0.15, 1.68 + k * 0.05, front + 0.012],
          [x + 0.15, 1.7 + k * 0.05, front + 0.016],
        );
      }
      b.slab('nameCard', [x - 0.1, 1.5, front + 0.012], [x + 0.1, 1.56, front + 0.016]);
    });
  },

  wardrobe(b) {
    b.slab('woodDark', [-0.5, 0, -0.3], [0.5, 2.0, 0.3]);
    b.slab('wood', [-0.48, 0.05, 0.3], [-0.01, 1.95, 0.31]);
    b.slab('wood', [0.01, 0.05, 0.3], [0.48, 1.95, 0.31]);
    b.slab('metal', [-0.06, 0.95, 0.31], [-0.04, 1.15, 0.33]);
    b.slab('metal', [0.04, 0.95, 0.31], [0.06, 1.15, 0.33]);
  },

  'head-cubicle'(b) {
    // A private head walled off in a corner, door shut.
    const [w, d, h] = [1.5, 1.7, ROOM_HEIGHT];
    b.slab('tile', [-w / 2, 0, -d / 2], [-w / 2 + 0.06, h, d / 2]);
    b.slab('tile', [w / 2 - 0.06, 0, -d / 2], [w / 2, h, d / 2]);
    b.slab('tile', [-w / 2, 0, d / 2 - 0.06], [-0.35, h, d / 2]);
    b.slab('tile', [0.45, 0, d / 2 - 0.06], [w / 2, h, d / 2]);
    b.slab('tile', [-0.35, 2.05, d / 2 - 0.06], [0.45, h, d / 2]);
    b.slab('hatchFrame', [-0.35, 0, d / 2 - 0.04], [0.45, 2.05, d / 2 - 0.02]);
    b.slab('metal', [-0.3, 1.0, d / 2 - 0.02], [-0.26, 1.08, d / 2 + 0.01]);
  },

  // ---- Seats and tables
  chair(b) {
    chair(b);
  },

  'card-table'(b) {
    // The off-duty watch's table: coffee, a hand of cards, a datapad.
    b.prism('metalDark', [0, 0.015, 0], { diameter: 0.5, length: 0.03 });
    b.prism('metal', [0, 0.375, 0], { diameter: 0.1, length: 0.69 });
    b.slab('tableEdge', [-0.71, 0.715, -0.41], [0.71, 0.73, 0.41]);
    b.slab('tableTop', [-0.7, 0.73, -0.4], [0.7, 0.76, 0.4]);
    for (const z of [-0.8, 0.8]) b.within([0, 0, z], 0, () => stool(b));
    b.prism('mug', [-0.4, 0.81, -0.15], { diameter: 0.085, length: 0.1 });
    b.prism('coffee', [-0.4, 0.858, -0.15], { diameter: 0.07, length: 0.005 });
    b.box('cards', [0.05, 0.775, 0.05], [0.065, 0.03, 0.09], { yaw: 0.2 });
    b.box('cards', [-0.1, 0.762, 0.12], [0.065, 0.004, 0.09], { yaw: -0.4 });
    b.box('cards', [0.2, 0.762, 0.18], [0.065, 0.004, 0.09], { yaw: 0.7 });
    b.box('datapad', [0.35, 0.766, -0.15], [0.26, 0.012, 0.18], { yaw: 0.35 });
    b.box('screen', [0.35, 0.773, -0.15], [0.22, 0.002, 0.14], { yaw: 0.35 });
  },

  'mess-table'(b, ctx) {
    // End-on to the wall, benches either side: six to a table.
    b.slab('tableEdge', [-0.41, 0.715, -0.98], [0.41, 0.73, 0.98]);
    b.slab('tableTop', [-0.4, 0.73, -0.97], [0.4, 0.76, 0.97]);
    for (const z of [-0.6, 0.6]) b.slab('metal', [-0.05, 0, z - 0.05], [0.05, 0.72, z + 0.05]);
    for (const x of [-0.72, 0.72]) {
      b.slab('seat', [x - 0.17, 0.42, -0.85], [x + 0.17, 0.47, 0.85]);
      for (const z of [-0.6, 0.6])
        b.slab('metal', [x - 0.03, 0, z - 0.03], [x + 0.03, 0.42, z + 0.03]);
    }
    for (let i = 0; i < 3; i++) {
      if (!ctx.random.chance(0.6)) continue;
      const z = -0.6 + i * 0.6;
      const x = ctx.random.chance(0.5) ? -0.22 : 0.22;
      b.slab('metalLight', [x - 0.15, 0.76, z - 0.2], [x + 0.15, 0.775, z + 0.2]);
      b.prism('mug', [x * 0.4, 0.81, z + 0.1], { diameter: 0.08, length: 0.1 });
    }
  },

  'dining-table'(b) {
    // The wardroom table: eight along the sides, one at each end.
    const [w, d] = [4.0, 1.1];
    b.slab('woodDark', [-w / 2, 0.72, -d / 2], [w / 2, 0.77, d / 2]);
    b.slab('paper', [-w / 2 + 0.3, 0.77, -0.12], [w / 2 - 0.3, 0.772, 0.12]);
    legs(b, 'woodDark', w - 0.2, d - 0.2, 0.72, 0.08);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const x = -1.5 + i;
        b.within([x, 0, side * 0.85], side > 0 ? Math.PI : 0, () => chair(b, 'leather'));
        b.prism('white', [x, 0.78, side * 0.32], { diameter: 0.24, length: 0.015, sides: 12 });
        b.prism('glass', [x + 0.2, 0.84, side * 0.3], { diameter: 0.06, length: 0.13, sides: 8 });
      }
    }
    b.within([2.25, 0, 0], -Math.PI / 2, () => chair(b, 'leather'));
    b.within([-2.25, 0, 0], Math.PI / 2, () => chair(b, 'leather'));
  },

  'coffee-table'(b) {
    b.slab('wood', [-0.45, 0.4, -0.25], [0.45, 0.45, 0.25]);
    legs(b, 'woodDark', 0.85, 0.45, 0.4, 0.04);
    b.box('datapad', [0.1, 0.46, 0], [0.24, 0.012, 0.17], { yaw: 0.3 });
  },

  sofa(b) {
    b.slab('fabric', [-1, 0.1, -0.42], [1, 0.42, 0.42]);
    b.slab('fabric', [-1, 0.42, -0.42], [1, 0.85, -0.22]);
    b.slab('fabric', [-1, 0.42, -0.42], [-0.85, 0.62, 0.42]);
    b.slab('fabric', [0.85, 0.42, -0.42], [1, 0.62, 0.42]);
    for (const x of [-0.42, 0.42]) b.slab('seat', [x - 0.4, 0.42, -0.2], [x + 0.4, 0.5, 0.4]);
    b.slab('metalDark', [-0.98, 0, -0.4], [0.98, 0.1, 0.4]);
  },

  bench(b) {
    b.slab('wood', [-0.9, 0.42, -0.2], [0.9, 0.48, 0.2]);
    for (const x of [-0.7, 0.7]) b.slab('metalDark', [x - 0.03, 0, -0.15], [x + 0.03, 0.42, 0.15]);
  },

  desk(b) {
    // Desk at the back, the chair at the front facing it, a terminal and a logbook.
    b.slab('woodDark', [-0.7, 0.72, -0.65], [0.7, 0.77, 0.05]);
    b.slab('wood', [-0.7, 0, -0.65], [-0.3, 0.72, 0.0]);
    b.slab('wood', [0.6, 0, -0.65], [0.7, 0.72, 0.0]);
    b.within([0, 0, 0.4], Math.PI, () => chair(b, 'leather'));
    b.within([0.15, 0, -0.45], Math.PI, () => {
      b.box('consoleTop', [0, 0.8, 0], [0.18, 0.06, 0.12]);
      b.box('consoleTop', [0, 0.98, 0.02], [0.03, 0.3, 0.03]);
      b.box('consoleTop', [0, 1.1, -0.01], [0.56, 0.34, 0.03]);
      b.box('screenBlue', [0, 1.1, -0.03], [0.5, 0.29, 0.005]);
    });
    b.slab('consoleTop', [-0.05, 0.77, -0.25], [0.4, 0.785, -0.1]);
    b.box('woodDark', [-0.45, 0.8, -0.2], [0.28, 0.05, 0.2], { yaw: 0.2 });
    b.box('paper', [-0.45, 0.83, -0.2], [0.26, 0.01, 0.18], { yaw: 0.2 });
    b.prism('mug', [-0.55, 0.82, -0.5], { diameter: 0.08, length: 0.1 });
  },

  sideboard(b, ctx) {
    b.slab('woodDark', [-0.8, 0, -0.25], [0.8, 0.88, 0.25]);
    for (const x of [-0.4, 0.4]) b.slab('wood', [x - 0.38, 0.08, 0.25], [x + 0.38, 0.8, 0.26]);
    b.slab('wood', [-0.82, 0.88, -0.27], [0.82, 0.92, 0.27]);
    for (let i = 0; i < 4; i++) {
      const x = -0.6 + i * 0.25;
      b.prism(pick(ctx, ['glass', 'boxGreen', 'missileTip']), [x, 1.05, -0.05], {
        diameter: 0.08,
        length: 0.26,
        sides: 8,
      });
    }
    b.prism('steel', [0.5, 1.07, 0], { diameter: 0.24, length: 0.3, sides: 10 });
  },

  bookshelf(b, ctx) {
    b.slab('woodDark', [-0.6, 0, -0.175], [-0.57, 1.9, 0.175]);
    b.slab('woodDark', [0.57, 0, -0.175], [0.6, 1.9, 0.175]);
    b.slab('woodDark', [-0.6, 0, -0.175], [0.6, 1.9, -0.15]);
    for (const y of [0.05, 0.5, 0.95, 1.4, 1.87])
      b.slab('wood', [-0.57, y, -0.15], [0.57, y + 0.03, 0.175]);
    for (const y of [0.08, 0.53, 0.98, 1.43]) {
      let x = -0.55;
      while (x < 0.5) {
        const w = 0.03 + ctx.random.next() * 0.04;
        const h = 0.22 + ctx.random.next() * 0.15;
        b.slab(
          pick(ctx, ['seatRed', 'seat', 'boxGreen', 'leather', 'paper']),
          [x, y, -0.13],
          [x + w, y + h, 0.12],
        );
        x += w + 0.005;
      }
    }
  },

  rug(b) {
    b.slab('rugBorder', [-1.2, 0, -0.8], [1.2, 0.008, 0.8]);
    b.slab('rug', [-1.08, 0, -0.68], [1.08, 0.011, 0.68]);
  },

  picture(b, ctx) {
    panel(b, ctx.panels, paintPicture(ctx.item.seed), [0, 1.625, 0.03], 0.9, 0.65);
    b.slab('woodDark', [-0.47, 1.28, -0.02], [0.47, 1.97, 0.025]);
  },

  lectern(b) {
    b.slab('woodDark', [-0.25, 0, -0.15], [0.25, 0.06, 0.15]);
    b.slab('wood', [-0.1, 0.06, -0.08], [0.1, 1.0, 0.08]);
    b.box('woodDark', [0, 1.06, 0.02], [0.6, 0.05, 0.42], { pitch: 0.3 });
  },

  // ---- Stations
  console(b, ctx) {
    console(b, ctx, 0, 0, 1.15);
  },

  'console-seat'(b, ctx) {
    console(b, ctx, 0, -0.325);
    b.within([0, 0, 0.42], Math.PI, () => chair(b));
  },

  'console-pair'(b, ctx) {
    for (const x of [-0.7, 0.7]) {
      console(b, ctx, x, -0.325, 1.3);
      b.within([x, 0, 0.42], Math.PI, () => chair(b));
    }
  },

  'console-bank'(b, ctx) {
    for (const x of [-1.45, 0, 1.45]) {
      console(b, ctx, x, -0.35, 1.4);
      b.within([x, 0, 0.45], Math.PI, () => chair(b));
    }
    screen(b, ctx, [0, 1.75, -0.7], 2.4, 0.55, 'schematic');
  },

  helm(b) {
    // Helm and navigation: two low stations, so the captain sees the viewport over them.
    for (const x of [-0.65, 0.65]) {
      b.slab('console', [x - 0.6, 0, -0.75], [x + 0.6, 0.68, -0.2]);
      b.box('console', [x, 0.78, -0.48], [1.2, 0.12, 0.55], { pitch: 0.2 });
      b.box(x < 0 ? 'screen' : 'screenBlue', [x, 0.845, -0.48], [1.0, 0.005, 0.42], { pitch: 0.2 });
      b.within([x, 0, 0.3], Math.PI, () => chair(b));
    }
    b.slab('consoleTop', [-1.3, 0, -0.75], [1.3, 0.05, -0.2]);
  },

  'command-chair'(b) {
    // The captain's chair: raised, with consoles in the armrests.
    b.slab('metalDark', [-0.55, 0, -0.55], [0.55, 0.12, 0.55]);
    b.prism('metal', [0, 0.3, 0], { diameter: 0.16, length: 0.36, sides: 8 });
    b.slab('seatRed', [-0.3, 0.48, -0.25], [0.3, 0.6, 0.3]);
    b.box('seatRed', [0, 0.98, -0.3], [0.56, 0.8, 0.1], { pitch: -0.1 });
    for (const x of [-0.38, 0.38]) {
      b.slab('console', [x - 0.08, 0.5, -0.25], [x + 0.08, 0.75, 0.32]);
      b.box(x < 0 ? 'screenAmber' : 'screen', [x, 0.755, 0.1], [0.12, 0.005, 0.16]);
    }
  },

  holotable(b) {
    b.prism('console', [0, 0.45, 0], { diameter: 0.7, length: 0.9, sides: 12 });
    b.prism('consoleTop', [0, 0.95, 0], { diameter: 1.8, length: 0.1, sides: 24 });
    b.prism('holoDim', [0, 1.005, 0], { diameter: 1.5, length: 0.01, sides: 24 });
    b.ring('holo', [0, 1.25, 0], 1.0, 0.012, 32, 4);
    b.ring('holo', [0, 1.45, 0], 0.6, 0.012, 24, 4);
    b.box('holo', [0.15, 1.35, -0.1], [0.12, 0.04, 0.3], { yaw: 0.6 });
    b.box('screenAmber', [-0.35, 1.3, 0.25], [0.06, 0.06, 0.06]);
  },

  'plot-table'(b) {
    b.slab('console', [-0.95, 0, -0.55], [0.95, 0.85, 0.55]);
    b.slab('consoleTop', [-1, 0.85, -0.6], [1, 0.92, 0.6]);
    b.slab('screen', [-0.9, 0.92, -0.5], [0.9, 0.925, 0.5]);
  },

  'wall-screen'(b, ctx) {
    screen(
      b,
      ctx,
      [0, 1.75, 0],
      1.7,
      0.72,
      pick(ctx, ['plot', 'status', 'schematic', 'chart'] as const),
    );
  },

  'damage-board'(b, ctx) {
    b.slab('consoleTop', [-1.8, 0.9, -0.05], [1.8, 2.2, 0.03]);
    panel(b, ctx.screens, paintDamageBoard, [0, 1.55, 0.035], 3.5, 1.2);
  },

  'equipment-racks'(b, ctx) {
    row(ctx, 0.6, (x) => {
      b.slab('equipment', [x - 0.29, 0, -0.35], [x + 0.29, 2.0, 0.33]);
      b.slab('metalDark', [x - 0.26, 0.1, 0.33], [x + 0.26, 1.9, 0.34]);
      for (let y = 0.3; y < 1.8; y += 0.22) {
        b.slab('equipment', [x - 0.24, y, 0.34], [x + 0.24, y + 0.16, 0.36]);
        for (let i = 0; i < 4; i++) {
          if (ctx.random.chance(0.6)) {
            b.box(
              pick(ctx, ['ledGreen', 'ledGreen', 'screenAmber', 'ledRed']),
              [x - 0.18 + i * 0.05, y + 0.12, 0.365],
              [0.02, 0.02, 0.01],
            );
          }
        }
      }
    });
  },

  // ---- Stores and work
  shelving(b, ctx) {
    const [w, d] = [2.0, 0.6];
    for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
      for (const z of [-d / 2 + 0.03, d / 2 - 0.03])
        b.slab('metalDark', [x - 0.03, 0, z - 0.03], [x + 0.03, 2.2, z + 0.03]);
    }
    for (const y of [0.08, 0.6, 1.12, 1.64, 2.14]) {
      b.slab('metal', [-w / 2, y, -d / 2], [w / 2, y + 0.03, d / 2]);
      if (y < 2) boxesOnShelf(b, ctx, -w / 2, w / 2, y + 0.03, d / 2 - 0.02, d - 0.06, 0.45);
    }
  },

  crates(b, ctx) {
    let y = 0;
    const layers = ctx.random.int(1, 3);
    for (let i = 0; i < layers; i++) {
      const size = i === 0 ? 1.1 : 0.9 - i * 0.1;
      const h = 0.45 + ctx.random.next() * 0.2;
      b.box(i % 2 ? 'crateDark' : 'crate', [0, y + h / 2, 0], [size, h, size], {
        yaw: (ctx.random.next() - 0.5) * 0.3,
      });
      b.box('metalDark', [0, y + h / 2, 0], [size + 0.01, 0.05, size + 0.01], { yaw: 0 });
      y += h;
    }
  },

  'filing-cabinets'(b, ctx) {
    row(ctx, 0.5, (x) => {
      b.slab('equipment', [x - 0.24, 0, -0.3], [x + 0.24, 1.3, 0.3]);
      for (let k = 0; k < 4; k++) {
        const y = 0.06 + k * 0.31;
        b.slab('lockerDoor', [x - 0.22, y, 0.3], [x + 0.22, y + 0.28, 0.31]);
        b.slab('metal', [x - 0.07, y + 0.2, 0.31], [x + 0.07, y + 0.22, 0.33]);
      }
    });
  },

  'mail-rack'(b, ctx) {
    b.slab('woodDark', [-0.6, 0.9, -0.17], [0.6, 1.9, 0.17]);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 5; j++) {
        const x = -0.48 + j * 0.24;
        const y = 1.0 + i * 0.23;
        b.slab('consoleTop', [x - 0.1, y, 0.1], [x + 0.1, y + 0.19, 0.171]);
        if (ctx.random.chance(0.55))
          b.slab('paper', [x - 0.08, y, 0.12], [x + 0.08, y + 0.12, 0.175]);
      }
    }
  },

  'tool-cabinet'(b, ctx) {
    b.slab('fireRed', [-0.5, 0, -0.25], [0.5, 1.0, 0.25]);
    for (let k = 0; k < 5; k++)
      b.slab('metal', [-0.45, 0.1 + k * 0.18, 0.25], [0.45, 0.12 + k * 0.18, 0.27]);
    b.slab('equipment', [-0.5, 1.05, -0.25], [0.5, 1.9, -0.21]);
    for (let i = 0; i < 6; i++) {
      b.box(
        pick(ctx, ['metal', 'pipeYellow', 'metalDark']),
        [-0.38 + i * 0.15, 1.45, -0.19],
        [0.04, 0.3 + ctx.random.next() * 0.2, 0.03],
      );
    }
  },

  workbench(b, ctx) {
    b.slab('woodDark', [-1, 0.86, -0.4], [1, 0.92, 0.4]);
    legs(b, 'metalDark', 2.0, 0.8, 0.86, 0.06);
    b.slab('metalDark', [-0.95, 0.15, -0.35], [0.95, 0.18, 0.35]);
    b.slab('equipment', [-1, 0.92, -0.4], [1, 1.9, -0.36]);
    for (let i = 0; i < 9; i++) {
      b.box(
        pick(ctx, ['metal', 'pipeYellow', 'fireRed', 'metalDark']),
        [-0.85 + i * 0.21, 1.35 + ctx.random.next() * 0.2, -0.34],
        [0.04, 0.25 + ctx.random.next() * 0.2, 0.03],
      );
    }
    b.slab('metalDark', [0.6, 0.92, 0.1], [0.8, 1.05, 0.3]);
    b.slab('boxGrey', [-0.5, 0.92, 0], [-0.1, 1.0, 0.25]);
  },

  lathe(b) {
    b.slab('equipment', [-1.1, 0, -0.4], [1.1, 0.8, 0.4]);
    b.slab('metal', [-1.0, 0.8, -0.2], [1.0, 0.9, 0.2]);
    b.slab('boxGreen', [-1.05, 0.9, -0.35], [-0.5, 1.4, 0.35]);
    b.prism('steel', [-0.38, 1.15, 0], { diameter: 0.28, length: 0.24, axis: 'x', sides: 10 });
    b.prism('metal', [0.05, 1.15, 0], { diameter: 0.08, length: 0.6, axis: 'x', sides: 8 });
    b.slab('boxGreen', [0.55, 0.9, -0.2], [0.85, 1.25, 0.2]);
    b.slab('consoleTop', [-0.95, 1.0, 0.35], [-0.6, 1.3, 0.37]);
    b.box('ledGreen', [-0.7, 1.25, 0.375], [0.03, 0.03, 0.01]);
  },

  'drill-press'(b) {
    b.slab('metalDark', [-0.3, 0, -0.3], [0.3, 0.08, 0.3]);
    b.prism('metal', [0, 0.9, -0.15], { diameter: 0.09, length: 1.7, sides: 8 });
    b.slab('boxGreen', [-0.15, 1.45, -0.3], [0.15, 1.8, 0.2]);
    b.slab('metal', [-0.2, 0.75, -0.2], [0.2, 0.8, 0.2]);
    b.prism('steel', [0, 1.35, 0.1], { diameter: 0.04, length: 0.2, sides: 6 });
  },

  'tool-cart'(b, ctx) {
    for (const y of [0.15, 0.55, 0.9]) b.slab('fireRed', [-0.45, y, -0.3], [0.45, y + 0.04, 0.3]);
    legs(b, 'metalDark', 0.9, 0.6, 0.94, 0.03);
    for (const x of [-0.38, 0.38]) {
      for (const z of [-0.23, 0.23])
        b.prism('rubber', [x, 0.06, z], { diameter: 0.12, length: 0.05, axis: 'x' });
    }
    boxesOnShelf(b, ctx, -0.45, 0.45, 0.94, 0.28, 0.5, 0.15);
  },

  // ---- Washing
  'toilet-stalls'(b, ctx) {
    const depth = 1.4;
    const width = ctx.item.width;
    for (let i = 0; i <= ctx.item.count; i++) {
      const x = -width / 2 + i;
      b.slab('tile', [x - 0.015, 0.15, -depth / 2], [x + 0.015, 2.0, depth / 2]);
    }
    row(ctx, 1.0, (x, i) => {
      b.prism('white', [x, 0.22, -0.35], { diameter: 0.38, length: 0.44, sides: 10 });
      b.slab('white', [x - 0.2, 0.2, -0.7], [x + 0.2, 0.75, -0.55]);
      // Doors: most shut, some ajar.
      const open = (ctx.item.seed + i) % 3 === 0;
      if (open)
        b.box('lockerDoor', [x - 0.48 + 0.33, 1.05, depth / 2 - 0.3], [0.025, 1.7, 0.66], {
          yaw: 0.9,
        });
      else b.slab('lockerDoor', [x - 0.47, 0.2, depth / 2 - 0.03], [x + 0.47, 1.9, depth / 2]);
    });
  },

  showers(b, ctx) {
    const depth = 1.0;
    const width = ctx.item.width;
    for (let i = 0; i <= ctx.item.count; i++) {
      const x = -width / 2 + i;
      b.slab('tile', [x - 0.02, 0, -depth / 2], [x + 0.02, 2.1, depth / 2]);
    }
    row(ctx, 1.0, (x, i) => {
      b.slab('white', [x - 0.48, 0, -depth / 2], [x + 0.48, 0.06, depth / 2]);
      b.slab('metal', [x - 0.05, 1.95, -depth / 2], [x + 0.05, 2.0, -depth / 2 + 0.3]);
      b.prism('metal', [x, 1.9, -depth / 2 + 0.3], { diameter: 0.14, length: 0.04, sides: 10 });
      const drawn = (ctx.item.seed + i) % 2 === 0;
      b.slab(
        'curtain',
        [drawn ? x - 0.47 : x + 0.25, 0.25, depth / 2 - 0.03],
        [x + 0.47, 2.0, depth / 2 - 0.01],
      );
    });
  },

  sinks(b, ctx) {
    const width = ctx.item.width;
    b.slab('white', [-width / 2, 0.8, -0.275], [width / 2, 0.88, 0.275]);
    b.slab('equipment', [-width / 2, 0, -0.275], [width / 2, 0.8, 0.2]);
    row(ctx, 0.75, (x) => {
      b.slab('metalDark', [x - 0.2, 0.83, -0.15], [x + 0.2, 0.885, 0.12]);
      b.box('metal', [x, 0.98, -0.22], [0.03, 0.2, 0.03]);
      b.box('metal', [x, 1.07, -0.16], [0.03, 0.03, 0.12]);
      b.slab('glass', [x - 0.3, 1.15, -0.275], [x + 0.3, 1.75, -0.26]);
    });
  },

  washers(b, ctx) {
    row(ctx, 0.7, (x) => {
      for (const y of [0, 0.88]) {
        b.slab('white', [x - 0.33, y, -0.37], [x + 0.33, y + 0.85, 0.37]);
        b.within([x, y + 0.42, 0.375], 0, () => {
          b.prism('metalDark', [0, 0, 0], { diameter: 0.46, length: 0.03, axis: 'z', sides: 16 });
          b.prism('glass', [0, 0, 0.012], { diameter: 0.36, length: 0.02, axis: 'z', sides: 16 });
        });
        b.box('ledGreen', [x - 0.24, y + 0.78, 0.375], [0.03, 0.02, 0.01]);
      }
    });
  },

  'folding-table'(b, ctx) {
    b.slab('tableTop', [-0.8, 0.86, -0.4], [0.8, 0.9, 0.4]);
    legs(b, 'metalDark', 1.6, 0.8, 0.86, 0.05);
    for (let i = 0; i < 4; i++) {
      b.slab(
        pick(ctx, ['blanket', 'pillow', 'mattress', 'olive']),
        [-0.6 + i * 0.32, 0.9, -0.2],
        [-0.35 + i * 0.32, 0.9 + 0.04 + ctx.random.next() * 0.1, 0.15],
      );
    }
  },

  // ---- Galley
  counter(b, ctx) {
    b.slab('steel', [-1, 0, -0.35], [1, 0.88, 0.32]);
    for (const x of [-0.5, 0.5])
      b.slab('metalLight', [x - 0.47, 0.08, 0.32], [x + 0.47, 0.8, 0.33]);
    b.slab('metalLight', [-1, 0.88, -0.35], [1, 0.92, 0.35]);
    for (let i = 0; i < 3; i++) {
      if (!ctx.random.chance(0.6)) continue;
      const x = -0.7 + i * 0.7;
      b.prism(pick(ctx, ['steel', 'metal', 'white']), [x, 0.99, -0.05], {
        diameter: 0.22 + ctx.random.next() * 0.1,
        length: 0.14,
        sides: 10,
      });
    }
  },

  range(b) {
    b.slab('steel', [-0.9, 0, -0.45], [0.9, 0.88, 0.45]);
    b.slab('metalDark', [-0.85, 0.15, 0.45], [0.85, 0.7, 0.46]);
    b.slab('metalDark', [-0.9, 0.88, -0.45], [0.9, 0.9, 0.45]);
    for (const x of [-0.5, 0, 0.5]) {
      for (const z of [-0.18, 0.18]) b.ring('gunMetal', [x, 0.91, z], 0.22, 0.03, 12, 4);
    }
    b.prism('steel', [-0.5, 1.0, -0.18], { diameter: 0.3, length: 0.18, sides: 12 });
    b.prism('steel', [0, 0.96, 0.18], { diameter: 0.34, length: 0.08, sides: 12 });
    b.slab('steel', [-0.95, 1.85, -0.45], [0.95, 2.3, 0.15]);
    b.slab('ductVent', [-0.9, 1.84, -0.4], [0.9, 1.85, 0.1]);
  },

  fridge(b) {
    b.slab('steel', [-0.45, 0, -0.4], [0.45, 2.0, 0.4]);
    b.slab('metalLight', [-0.43, 0.05, 0.4], [-0.01, 1.95, 0.41]);
    b.slab('metalLight', [0.01, 0.05, 0.4], [0.43, 1.95, 0.41]);
    for (const x of [-0.06, 0.06]) b.slab('metal', [x - 0.015, 0.8, 0.41], [x + 0.015, 1.4, 0.44]);
  },

  'prep-island'(b) {
    b.slab('steel', [-0.9, 0, -0.45], [0.9, 0.88, 0.45]);
    b.slab('metalLight', [-0.9, 0.88, -0.45], [0.9, 0.92, 0.45]);
    b.slab('wood', [-0.6, 0.92, -0.2], [-0.1, 0.95, 0.2]);
    b.prism('steel', [0.4, 0.99, 0], { diameter: 0.3, length: 0.14, sides: 12 });
  },

  'coffee-machine'(b) {
    b.slab('steel', [-0.45, 0, -0.275], [0.45, 0.88, 0.275]);
    b.slab('metalLight', [-0.45, 0.88, -0.275], [0.45, 0.92, 0.275]);
    b.slab('gunMetal', [-0.3, 0.92, -0.25], [0.15, 1.5, 0.1]);
    b.slab('metalDark', [-0.25, 1.0, 0.1], [0.1, 1.08, 0.18]);
    b.box('screenAmber', [-0.08, 1.35, 0.105], [0.18, 0.08, 0.01]);
    for (let i = 0; i < 3; i++)
      b.prism('mug', [0.27, 0.97 + i * 0.1, 0], { diameter: 0.09, length: 0.1 });
  },

  // ---- Medical
  'medical-beds'(b) {
    for (const x of [-1.8, -0.6, 0.6, 1.8]) {
      b.slab('metal', [x - 0.45, 0.4, -1.0], [x + 0.45, 0.5, 1.0]);
      b.within([x, 0, 0], 0, () => legs(b, 'metalDark', 0.9, 2.0, 0.4, 0.04));
      b.slab('white', [x - 0.42, 0.5, -0.98], [x + 0.42, 0.65, 0.98]);
      b.slab('pillow', [x - 0.3, 0.65, -0.95], [x + 0.3, 0.75, -0.6]);
      b.slab('medicalGreen', [x - 0.43, 0.62, -0.3], [x + 0.43, 0.68, 0.98]);
      b.slab('metalDark', [x - 0.42, 0.5, -1.05], [x + 0.42, 1.0, -1.0]);
      b.slab('consoleTop', [x + 0.2, 1.25, -1.05], [x + 0.5, 1.5, -1.0]);
      b.box('screen', [x + 0.35, 1.375, -0.995], [0.26, 0.2, 0.005]);
    }
  },

  'operating-table'(b) {
    // Long axis across: the table runs along x.
    b.slab('metalDark', [-0.3, 0, -0.25], [0.3, 0.08, 0.25]);
    b.prism('metal', [0, 0.45, 0], { diameter: 0.18, length: 0.75, sides: 8 });
    b.slab('metal', [-1.0, 0.82, -0.3], [1.0, 0.9, 0.3]);
    b.slab('medicalGreen', [-0.97, 0.9, -0.28], [0.97, 0.96, 0.28]);
    // Surgical lamp from the overhead.
    b.prism('metal', [0, 2.35, 0], { diameter: 0.05, length: 0.5, sides: 6 });
    b.prism('metalLight', [0, 2.07, 0], {
      diameter: 0.7,
      topDiameter: 0.3,
      length: 0.12,
      sides: 16,
    });
    b.prism('lightPanel', [0, 2.005, 0], { diameter: 0.6, length: 0.01, sides: 16 });
    b.slab('equipment', [0.75, 0, 0.35], [1.05, 1.2, 0.5]);
    b.box('screen', [0.9, 1.05, 0.505], [0.24, 0.16, 0.005]);
  },

  'medical-cabinet'(b, ctx) {
    b.slab('white', [-0.6, 0, -0.225], [0.6, 2.0, 0.225]);
    b.slab('glass', [-0.57, 0.95, 0.225], [0.57, 1.95, 0.232]);
    b.slab('medical', [-0.57, 0.05, 0.225], [0.57, 0.9, 0.232]);
    for (const y of [1.25, 1.6]) boxesOnShelf(b, ctx, -0.55, 0.55, y, 0.2, 0.35, 0.25);
  },

  // ---- Off duty
  'gym-machines'(b) {
    // Two treadmills and a weight bench.
    for (const x of [-1.25, -0.3]) {
      b.slab('rubber', [x - 0.38, 0, -0.9], [x + 0.38, 0.18, 0.9]);
      b.slab('gunMetal', [x - 0.3, 0.18, -0.85], [x + 0.3, 0.2, 0.75]);
      for (const side of [-0.36, 0.36])
        b.box('metal', [x + side, 0.7, -0.7], [0.04, 1.1, 0.04], { pitch: 0.15 });
      b.slab('console', [x - 0.35, 1.2, -0.85], [x + 0.35, 1.3, -0.6]);
      b.box('screen', [x, 1.305, -0.72], [0.3, 0.005, 0.15]);
    }
    b.slab('seat', [0.9, 0.45, -0.7], [1.2, 0.52, 0.5]);
    b.slab('metalDark', [1.0, 0, -0.6], [1.1, 0.45, 0.4]);
    for (const x of [0.75, 1.35]) b.slab('metal', [x - 0.03, 0, -0.75], [x + 0.03, 1.3, -0.69]);
    b.prism('steel', [1.05, 1.2, -0.72], { diameter: 0.03, length: 1.4, axis: 'x', sides: 6 });
    for (const x of [0.45, 1.65])
      b.prism('gunMetal', [x, 1.2, -0.72], { diameter: 0.4, length: 0.06, axis: 'x', sides: 12 });
  },

  'punch-bag'(b) {
    b.prism('metalDark', [0, 2.2, 0], { diameter: 0.02, length: 0.8, sides: 4 });
    b.prism('seatRed', [0, 1.3, 0], { diameter: 0.38, length: 1.0, sides: 12 });
  },

  mats(b) {
    b.slab('matBlue', [-1, 0, -0.6], [1, 0.035, 0.6]);
  },

  memorial(b, ctx) {
    panel(b, ctx.panels, paintMemorial, [0, 1.55, 0.03], 2.2, 1.0);
    b.slab('woodDark', [-1.2, 0.98, -0.12], [1.2, 2.12, 0.025]);
    b.slab('woodDark', [-1.0, 0.82, -0.12], [1.0, 0.86, 0.12]);
    for (const x of [-0.8, -0.45, -0.1, 0.3, 0.7]) {
      b.prism('white', [x, 0.92, 0.04], { diameter: 0.05, length: 0.12, sides: 6 });
      b.box('candle', [x, 1.0, 0.04], [0.02, 0.04, 0.02]);
    }
  },

  // ---- Safety
  noticeboard(b, ctx) {
    panel(b, ctx.panels, paintNoticeboard, [0, 1.425, 0.03], 1.3, 0.85);
  },

  extinguisher(b, ctx) {
    b.slab('metalDark', [-0.12, 0.4, -0.1], [0.12, 0.88, -0.07]);
    b.prism('fireRed', [0, 0.62, 0], { diameter: 0.17, length: 0.48, sides: 12 });
    b.box('metalDark', [0, 0.9, 0], [0.06, 0.08, 0.1]);
    panel(b, ctx.panels, paintLabel('FIRE EXT.', '#b8261d', '#ffffff'), [0, 1.0, -0.065], 0.3, 0.1);
  },

  'dc-locker'(b, ctx) {
    b.slab('dcYellow', [-0.4, 0.95, -0.125], [0.4, 1.75, 0.115]);
    b.slab('metalDark', [-0.02, 1.0, 0.115], [0.02, 1.7, 0.125]);
    panel(
      b,
      ctx.panels,
      paintLabel('DAMAGE CONTROL', '#d4a514', '#1a1a1a'),
      [0, 1.6, 0.127],
      0.66,
      0.12,
    );
  },

  clock(b, ctx) {
    panel(
      b,
      ctx.panels,
      paintClock(8 + (ctx.item.seed % 8), (ctx.item.seed >> 3) % 60),
      [0, 2.025, 0.02],
      0.34,
      0.34,
    );
  },

  // ---- Weapons
  railgun(b) {
    // The keel railgun's breech end: the barrel runs forward through the bulkhead (-z).
    const half = 4.5;
    b.slab('metalDark', [-0.9, 0, -half], [0.9, 0.25, half - 0.2]);
    for (let z = -half + 0.6; z < half - 1.8; z += 1.1) {
      b.slab('gunMetal', [-0.75, 0.25, z - 0.2], [0.75, 0.75, z + 0.2]);
    }
    b.slab('gunMetal', [-0.5, 0.7, -half], [-0.2, 1.4, half - 1.6]);
    b.slab('gunMetal', [0.2, 0.7, -half], [0.5, 1.4, half - 1.6]);
    b.slab('metal', [-0.2, 0.75, -half], [0.2, 1.35, half - 1.6]);
    for (let z = -half + 0.4; z < half - 1.8; z += 0.55) {
      b.slab('pipeYellow', [-0.58, 0.65, z - 0.06], [0.58, 1.45, z + 0.06]);
    }
    b.slab('gunMetal', [-0.95, 0.25, half - 1.7], [0.95, 1.85, half]);
    b.slab('hazard', [-0.96, 1.4, half - 1.6], [0.96, 1.5, half - 0.1]);
    b.prism('metalDark', [0, 1.05, half - 0.05], {
      diameter: 0.7,
      length: 0.12,
      axis: 'z',
      sides: 12,
    });
    b.box('screenAmber', [0.6, 1.2, half + 0.005], [0.3, 0.2, 0.01]);
    for (let z = -half + 0.3; z < half; z += 0.9)
      b.slab('cables', [0.92, 0.2, z], [1.05, 0.3, z + 0.6]);
  },

  'capacitor-bank'(b, ctx) {
    for (let i = 0; i < 6; i++) {
      const x = -1.75 + i * 0.7;
      b.slab('equipment', [x - 0.33, 0, -0.45], [x + 0.33, 2.25, 0.4]);
      b.slab('metalDark', [x - 0.3, 0.1, 0.4], [x + 0.3, 2.15, 0.41]);
      b.box('screenBlue', [x, 1.2, 0.415], [0.08, 1.6, 0.01]);
      b.box(
        ctx.random.chance(0.2) ? 'ledRed' : 'ledGreen',
        [x + 0.18, 2.0, 0.415],
        [0.04, 0.04, 0.01],
      );
      b.prism('cables', [x, 2.42, 0], { diameter: 0.12, length: 0.36, sides: 6 });
    }
    panel(
      b,
      ctx.panels,
      paintLabel('HIGH VOLTAGE', '#d9a90f', '#15181a'),
      [0, 2.32, 0.42],
      0.9,
      0.14,
    );
  },

  'projectile-rack'(b) {
    b.slab('metalDark', [-1.5, 0, -0.4], [1.5, 0.08, 0.4]);
    for (const x of [-1.45, 1.45]) b.slab('metalDark', [x - 0.04, 0, -0.4], [x + 0.04, 1.4, 0.4]);
    for (const y of [0.25, 0.7, 1.15]) {
      b.slab('metal', [-1.45, y - 0.05, -0.35], [1.45, y - 0.02, 0.35]);
      for (const z of [-0.2, 0.05, 0.3])
        b.prism('steel', [0, y + 0.1, z], { diameter: 0.18, length: 2.6, axis: 'x', sides: 8 });
    }
  },

  'launch-cells'(b) {
    // Eight vertical launch cells in two rows, with a loading rail overhead.
    b.slab('metalDark', [-2.4, 0, -0.9], [2.4, 0.2, 0.9]);
    for (const z of [-0.42, 0.42]) {
      for (let i = 0; i < 4; i++) {
        const x = -1.8 + i * 1.2;
        b.prism('gunMetal', [x, 1.3, z], { diameter: 0.62, length: 2.2, sides: 12 });
        b.prism('missile', [x, 2.42, z], { diameter: 0.5, length: 0.04, sides: 12 });
        b.prism('hazard', [x, 0.5, z], { diameter: 0.64, length: 0.1, sides: 12 });
      }
    }
    b.slab('pipeYellow', [-2.4, 2.48, 0.75], [2.4, 2.56, 0.85]);
    b.box('ledRed', [2.2, 1.6, 0.905], [0.06, 0.06, 0.01]);
  },

  'missile-rack'(b, ctx) {
    b.slab('metalDark', [-1.4, 0, -0.45], [1.4, 0.1, 0.45]);
    for (const x of [-1.2, 0, 1.2]) b.slab('metal', [x - 0.05, 0, -0.4], [x + 0.05, 1.5, 0.4]);
    for (const y of [0.45, 1.15]) {
      for (const z of [-0.2, 0.2]) {
        if (!ctx.random.chance(0.8)) continue;
        b.prism('missile', [-0.15, y, z], { diameter: 0.3, length: 2.2, axis: 'x', sides: 10 });
        b.prism('missileTip', [1.1, y, z], {
          diameter: 0.3,
          topDiameter: 0.02,
          length: 0.4,
          axis: 'x',
          sides: 10,
        });
        for (const fin of [0, Math.PI / 2])
          b.box('metalDark', [-1.2, y, z], [0.3, 0.36, 0.02], { roll: fin });
      }
    }
  },

  'weapon-racks'(b, ctx) {
    b.slab('metalDark', [-1.5, 0, -0.25], [1.5, 2.0, -0.2]);
    b.slab('olive', [-1.5, 0, -0.25], [1.5, 0.4, 0.25]);
    b.slab('olive', [-1.5, 1.95, -0.25], [1.5, 2.0, 0.25]);
    for (const x of [-1.5, 1.5]) b.slab('olive', [x - 0.03, 0, -0.25], [x + 0.03, 2.0, 0.25]);
    for (let i = 0; i < 12; i++) {
      if (!ctx.random.chance(0.85)) continue;
      const x = -1.35 + i * 0.245;
      b.box('gunMetal', [x, 1.1, -0.1], [0.06, 1.0, 0.14], { roll: 0.06 });
      b.box('gunMetal', [x, 0.75, -0.02], [0.05, 0.2, 0.1]);
    }
    panel(
      b,
      ctx.panels,
      paintLabel('ARMORY · SIGN OUT ALL WEAPONS', '#1d2a33', '#ffbe55'),
      [0, 1.8, -0.19],
      1.6,
      0.12,
    );
  },

  'armor-stands'(b, ctx) {
    row(ctx, 0.7, (x) => {
      b.slab('metalDark', [x - 0.25, 0, -0.2], [x + 0.25, 0.06, 0.2]);
      b.box('metal', [x, 0.7, -0.1], [0.04, 1.3, 0.04]);
      b.slab('olive', [x - 0.22, 0.95, -0.15], [x + 0.22, 1.5, 0.12]);
      b.slab('olive', [x - 0.12, 0.6, -0.1], [x + 0.12, 0.95, 0.08]);
      b.prism('olive', [x, 1.66, 0], { diameter: 0.26, length: 0.28, sides: 10 });
      b.box('glass', [x, 1.68, 0.125], [0.18, 0.08, 0.02]);
      for (const side of [-0.28, 0.28]) b.box('olive', [x + side, 1.2, 0], [0.1, 0.5, 0.1]);
    });
  },

  'brig-cell'(b) {
    // A cell: walls each side, bars across the front, a bunk and a toilet inside.
    const [w, d, h] = [2.6, 2.4, ROOM_HEIGHT];
    b.slab('bulkheadLower', [-w / 2, 0, -d / 2], [-w / 2 + 0.06, h, d / 2]);
    b.slab('bulkheadLower', [w / 2 - 0.06, 0, -d / 2], [w / 2, h, d / 2]);
    for (let x = -w / 2 + 0.15; x < w / 2 - 0.1; x += 0.13) {
      b.prism('metal', [x, h / 2, d / 2 - 0.05], { diameter: 0.035, length: h, sides: 6 });
    }
    for (const y of [0.05, 1.0, 2.0])
      b.slab('metalDark', [-w / 2, y, d / 2 - 0.09], [w / 2, y + 0.06, d / 2 - 0.01]);
    b.slab('rackBase', [-w / 2 + 0.06, 0, -d / 2], [-w / 2 + 0.86, 0.45, d / 2 - 0.5]);
    b.slab('mattress', [-w / 2 + 0.08, 0.45, -d / 2 + 0.05], [-w / 2 + 0.84, 0.55, d / 2 - 0.55]);
    b.prism('steel', [w / 2 - 0.4, 0.22, -d / 2 + 0.35], {
      diameter: 0.36,
      length: 0.44,
      sides: 10,
    });
  },

  // ---- Hangar
  cutter(b) {
    // The boarding cutter, nose towards +x, on skids.
    for (const z of [-1.1, 1.1]) {
      b.slab('metalDark', [-3.2, 0, z - 0.08], [2.8, 0.12, z + 0.08]);
      for (const x of [-2.2, 1.6])
        b.slab('metalDark', [x - 0.06, 0.12, z - 0.05], [x + 0.06, 0.55, z + 0.05]);
    }
    b.slab('hullPaint', [-3.4, 0.55, -1.3], [2.4, 2.25, 1.3]);
    b.box('hullPaint', [3.05, 1.25, 0], [1.4, 1.1, 2.2], { roll: -0.2 });
    b.box('glass', [2.95, 1.75, 0], [1.0, 0.35, 1.9], { roll: -0.45 });
    b.slab('stripe', [-3.41, 1.5, -1.31], [2.41, 1.65, 1.31]);
    b.slab('metalDark', [-1.0, 0.65, 1.3], [0.2, 2.05, 1.32]);
    for (const z of [-0.85, 0.85]) {
      b.prism('gunMetal', [-3.9, 1.4, z], { diameter: 0.8, length: 1.2, axis: 'x', sides: 12 });
      b.prism('screenBlue', [-4.5, 1.4, z], { diameter: 0.55, length: 0.02, axis: 'x', sides: 12 });
    }
    b.box('ledRed', [2.3, 2.27, 1.0], [0.08, 0.04, 0.08]);
    b.box('ledGreen', [2.3, 2.27, -1.0], [0.08, 0.04, 0.08]);
  },

  airlock(b) {
    // The boarding airlock's inner door, in a heavy striped frame.
    b.slab('hazard', [-1.1, 0, -0.35], [1.1, 2.4, -0.1]);
    b.slab('gunMetal', [-0.75, 0.1, -0.12], [0.75, 2.15, 0.05]);
    b.slab('metal', [-0.65, 0.2, 0.05], [0.65, 2.05, 0.12]);
    b.slab('glass', [-0.2, 1.45, 0.12], [0.2, 1.8, 0.13]);
    // The door wheel.
    b.prism('metalDark', [0, 1.1, 0.14], { diameter: 0.45, length: 0.04, axis: 'z', sides: 16 });
    b.prism('gunMetal', [0, 1.1, 0.165], { diameter: 0.12, length: 0.03, axis: 'z', sides: 8 });
    b.slab('console', [0.8, 1.1, -0.1], [1.05, 1.5, 0.05]);
    b.box('screenAmber', [0.925, 1.35, 0.055], [0.18, 0.12, 0.005]);
    b.box('ledRed', [0, 2.3, -0.08], [0.2, 0.06, 0.06]);
  },

  'suit-lockers'(b, ctx) {
    row(ctx, 0.8, (x) => {
      b.slab('lockerBody', [x - 0.39, 0, -0.3], [x + 0.39, 2.1, -0.25]);
      b.slab('lockerBody', [x - 0.4, 0, -0.3], [x - 0.37, 2.1, 0.3]);
      b.slab('lockerBody', [x + 0.37, 0, -0.3], [x + 0.4, 2.1, 0.3]);
      b.slab('lockerBody', [x - 0.4, 0, -0.3], [x + 0.4, 0.1, 0.3]);
      if (!ctx.random.chance(0.8)) return;
      b.slab('white', [x - 0.22, 0.9, -0.2], [x + 0.22, 1.55, 0.1]);
      b.slab('pipeYellow', [x - 0.22, 1.2, 0.1], [x + 0.22, 1.25, 0.11]);
      b.slab('white', [x - 0.18, 0.2, -0.15], [x - 0.03, 0.9, 0.05]);
      b.slab('white', [x + 0.03, 0.2, -0.15], [x + 0.18, 0.9, 0.05]);
      b.prism('white', [x, 1.75, -0.05], { diameter: 0.34, length: 0.32, sides: 12 });
      b.box('glass', [x, 1.77, 0.12], [0.22, 0.14, 0.02]);
    });
  },

  // ---- Machinery
  machine(b, ctx) {
    const body = pick(ctx, ['equipment', 'olive', 'pipeGrey'] as const);
    b.slab('metalDark', [-1.2, 0, -0.7], [1.2, 0.12, 0.7]);
    b.slab(body, [-1.1, 0.12, -0.6], [0.4, 1.6, 0.5]);
    b.prism(pick(ctx, ['pipeBlue', 'boxGreen', 'pipeGrey'] as const), [0.8, 0.55, 0], {
      diameter: 0.6,
      length: 0.7,
      axis: 'x',
      sides: 12,
    });
    b.prism('metalDark', [0.8, 0.55, 0], { diameter: 0.66, length: 0.08, axis: 'x', sides: 12 });
    for (const x of [-0.7, 0.0])
      b.prism(pick(ctx, ['pipeRed', 'pipeBlue', 'pipeGreen'] as const), [x, 2.1, -0.3], {
        diameter: 0.14,
        length: 1.0,
        sides: 8,
      });
    b.slab('consoleTop', [-0.9, 0.9, 0.5], [-0.4, 1.4, 0.52]);
    b.box('ledGreen', [-0.8, 1.3, 0.525], [0.03, 0.03, 0.01]);
    b.box(
      ctx.random.chance(0.3) ? 'ledRed' : 'screenAmber',
      [-0.7, 1.3, 0.525],
      [0.03, 0.03, 0.01],
    );
    b.within([-0.15, 1.2, 0.5], 0, () =>
      b.prism('white', [0, 0, 0.02], { diameter: 0.18, length: 0.03, axis: 'z', sides: 12 }),
    );
  },

  'life-support'(b) {
    // Air handling: a big unit with fans, filters and ducts up into the overhead.
    b.slab('metalDark', [-1.6, 0, -0.8], [1.6, 0.12, 0.8]);
    b.slab('equipment', [-1.5, 0.12, -0.75], [1.5, 1.9, 0.6]);
    for (const x of [-0.8, 0.8]) {
      b.within([x, 1.05, 0.6], 0, () => {
        b.prism('metalDark', [0, 0, 0.02], { diameter: 0.9, length: 0.04, axis: 'z', sides: 16 });
        b.prism('ductVent', [0, 0, 0.045], { diameter: 0.8, length: 0.01, axis: 'z', sides: 16 });
      });
    }
    b.slab('duct', [-1.2, 1.9, -0.6], [-0.4, ROOM_HEIGHT, 0.1]);
    b.slab('duct', [0.4, 1.9, -0.6], [1.2, ROOM_HEIGHT, 0.1]);
    b.slab('consoleTop', [1.0, 1.4, 0.6], [1.4, 1.8, 0.62]);
    b.box('screen', [1.2, 1.6, 0.625], [0.32, 0.3, 0.005]);
  },

  'water-reclaimer'(b) {
    b.slab('metalDark', [-1.2, 0, -0.7], [1.2, 0.1, 0.7]);
    for (const x of [-0.75, 0, 0.75]) {
      b.prism('steel', [x, 0.95, -0.1], { diameter: 0.6, length: 1.7, sides: 12 });
      b.prism('steel', [x, 1.85, -0.1], {
        diameter: 0.6,
        topDiameter: 0.25,
        length: 0.15,
        sides: 12,
      });
    }
    b.prism('pipeBlue', [0, 0.5, 0.35], { diameter: 0.1, length: 2.2, axis: 'x', sides: 8 });
    b.prism('pipeGreen', [0, 1.6, 0.35], { diameter: 0.1, length: 2.2, axis: 'x', sides: 8 });
    b.slab('consoleTop', [0.7, 0.9, 0.55], [1.1, 1.3, 0.6]);
    b.box('screen', [0.9, 1.1, 0.605], [0.32, 0.3, 0.005]);
  },

  pumps(b, ctx) {
    b.slab('metalDark', [-2.1, 0, -0.7], [2.1, 0.12, 0.7]);
    for (const x of [-1.4, 0, 1.4]) {
      b.prism('pipeBlue', [x - 0.25, 0.55, 0], {
        diameter: 0.55,
        length: 0.7,
        axis: 'x',
        sides: 12,
      });
      b.prism('metalDark', [x + 0.35, 0.6, 0], { diameter: 0.6, length: 0.5, sides: 12 });
      b.prism('pipeGrey', [x + 0.35, 1.1, 0], { diameter: 0.18, length: 0.6, sides: 8 });
      b.box(
        ctx.random.chance(0.2) ? 'ledRed' : 'ledGreen',
        [x - 0.25, 0.9, 0.3],
        [0.04, 0.04, 0.04],
      );
    }
    b.prism('pipeGrey', [0, 1.4, 0], { diameter: 0.18, length: 4.0, axis: 'x', sides: 8 });
  },

  tank(b, ctx) {
    b.prism(pick(ctx, ['steel', 'pipeGrey', 'equipment'] as const), [0, 1.05, 0], {
      diameter: 1.05,
      length: 1.9,
      sides: 14,
    });
    b.prism('steel', [0, 2.1, 0], { diameter: 1.05, topDiameter: 0.4, length: 0.2, sides: 14 });
    b.prism('pipeGrey', [0, 2.35, 0], { diameter: 0.14, length: 0.3, sides: 8 });
    for (let i = 0; i < 3; i++)
      b.box(
        'metalDark',
        [0.45 * Math.cos(i * 2.1), 0.05, 0.45 * Math.sin(i * 2.1)],
        [0.1, 0.1, 0.1],
      );
    b.within([0, 1.4, 0.53], 0, () =>
      b.prism('white', [0, 0, 0], { diameter: 0.15, length: 0.03, axis: 'z', sides: 12 }),
    );
  },

  switchboards(b, ctx) {
    for (let i = 0; i < 6; i++) {
      const x = -2.0 + i * 0.8;
      b.slab('equipment', [x - 0.39, 0, -0.35], [x + 0.39, 2.0, 0.3]);
      for (let k = 0; k < 5; k++) {
        const y = 0.35 + k * 0.3;
        b.slab('consoleTop', [x - 0.3, y, 0.3], [x + 0.3, y + 0.2, 0.31]);
        for (let j = 0; j < 4; j++)
          b.box('metal', [x - 0.21 + j * 0.14, y + 0.1, 0.32], [0.04, 0.08, 0.02]);
      }
      b.box(
        ctx.random.chance(0.15) ? 'ledRed' : 'ledGreen',
        [x + 0.28, 1.9, 0.31],
        [0.04, 0.04, 0.01],
      );
    }
    panel(
      b,
      ctx.panels,
      paintLabel('440 V · ISOLATE BEFORE SERVICING', '#d9a90f', '#15181a'),
      [0, 1.93, 0.312],
      2.4,
      0.1,
    );
  },

  transformer(b) {
    b.slab('equipment', [-0.8, 0, -0.5], [0.8, 1.5, 0.5]);
    for (let x = -0.7; x <= 0.7; x += 0.1)
      b.slab('ductVent', [x - 0.02, 0.2, 0.5], [x + 0.02, 1.3, 0.51]);
  },

  reactor(b) {
    // The fusion reactor: a ring of field coils round a glowing core, behind a rail.
    b.prism('metalDark', [0, 0.15, 0], { diameter: 3.0, length: 0.3, sides: 16 });
    b.ring('pipeGrey', [0, 1.2, 0], 2.4, 0.8, 24, 8);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      b.box('pipeYellow', [Math.cos(angle) * 1.2, 1.2, Math.sin(angle) * 1.2], [0.25, 1.0, 0.95], {
        yaw: -angle,
      });
    }
    b.prism('reactorGlow', [0, 1.2, 0], { diameter: 0.7, length: 1.6, sides: 12 });
    b.prism('metalDark', [0, 2.15, 0], { diameter: 0.9, length: 0.3, sides: 12 });
    b.prism('pipeGrey', [0, 2.45, 0], { diameter: 0.4, length: 0.3, sides: 8 });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      b.prism('pipeYellow', [Math.cos(angle) * 1.85, 0.5, Math.sin(angle) * 1.85], {
        diameter: 0.05,
        length: 1.0,
        sides: 6,
      });
    }
    b.ring('pipeYellow', [0, 1.0, 0], 3.7, 0.05, 32, 4);
    b.ring('pipeYellow', [0, 0.55, 0], 3.7, 0.05, 32, 4);
  },

  'jump-core'(b) {
    b.prism('metalDark', [0, 0.1, 0], { diameter: 2.2, length: 0.2, sides: 12 });
    b.prism('jumpGlow', [0, 1.25, 0], { diameter: 0.7, length: 2.1, sides: 12 });
    for (const y of [0.6, 1.25, 1.9]) b.ring('gunMetal', [0, y, 0], 1.2, 0.14, 20, 6);
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + (i / 4) * Math.PI * 2;
      b.prism('metalDark', [Math.cos(angle) * 1.0, 1.25, Math.sin(angle) * 1.0], {
        diameter: 0.1,
        length: 2.5,
        sides: 6,
      });
    }
    b.prism('metalDark', [0, 2.42, 0], { diameter: 2.0, length: 0.15, sides: 12 });
  },

  'main-drive'(b) {
    // The main drive: a great casing running aft (-z) into the stern, with feed lines.
    b.slab('metalDark', [-3.2, 0, -2.9], [3.2, 0.2, 2.9]);
    b.prism('gunMetal', [0, 1.25, -0.3], { diameter: 2.1, length: 5.0, axis: 'z', sides: 16 });
    for (let z = -2.4; z <= 1.8; z += 0.7) {
      b.within([0, 1.25, z], 0, () =>
        b.prism('metal', [0, 0, 0], { diameter: 2.3, length: 0.14, axis: 'z', sides: 16 }),
      );
    }
    b.prism('metalDark', [0, 1.25, 2.25], { diameter: 1.7, length: 0.12, axis: 'z', sides: 16 });
    b.prism('reactorGlow', [0, 1.25, 2.32], { diameter: 0.35, length: 0.02, axis: 'z', sides: 12 });
    for (const x of [-2.4, 2.4]) {
      b.slab('equipment', [x - 0.5, 0.2, -1.5], [x + 0.5, 1.8, 1.0]);
      b.box('screen', [x, 1.4, 1.005], [0.5, 0.35, 0.01]);
      b.prism('pipeRed', [x * 0.6, 2.2, 0], { diameter: 0.2, length: 4.0, axis: 'z', sides: 8 });
    }
  },

  thruster(b) {
    b.slab('metalDark', [-1, 0, -0.8], [1, 0.12, 0.8]);
    b.slab('equipment', [-0.8, 0.12, -0.2], [0.8, 1.7, 0.7]);
    b.prism('gunMetal', [0, 1.0, -0.5], {
      diameter: 0.9,
      topDiameter: 0.5,
      length: 0.6,
      axis: 'z',
      sides: 12,
    });
    b.prism('pipeRed', [0.6, 1.85, 0.2], { diameter: 0.12, length: 0.4, sides: 8 });
    b.box('ledGreen', [-0.6, 1.5, 0.705], [0.04, 0.04, 0.01]);
  },

  conduit(b, ctx) {
    // The drive shaft's conduit: a heavy pipe in flanged sections on cradles.
    const width = ctx.item.width;
    b.prism('gunMetal', [0, 0.5, 0], { diameter: 0.5, length: width, axis: 'x', sides: 12 });
    row(ctx, 2.0, (x) => {
      b.prism('metal', [x - 0.95, 0.5, 0], { diameter: 0.62, length: 0.08, axis: 'x', sides: 12 });
      b.slab('metalDark', [x - 0.1, 0, -0.28], [x + 0.1, 0.3, 0.28]);
    });
  },
};
