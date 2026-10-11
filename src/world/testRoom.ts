import {
  Color3,
  DynamicTexture,
  HemisphericLight,
  PointLight,
  StandardMaterial,
  Texture,
  Vector3,
  type GlowLayer,
  type Scene,
  CreateGround,
} from './babylon';
import { Builder } from './builder';
import { createPanel, paintClock, paintDeckPlate, paintNoticeboard, paintSign } from './painted';
import { Materials } from './palette';

/**
 * The M0 test compartment: a slice of junior enlisted berthing, built in code to try out the
 * art direction and the first-person controller. From M1 rooms are generated from deck plans
 * in content/ship/, and this file goes away.
 */

/** Where to stand and look. Angles in degrees; positive pitch looks down. */
export interface CameraBookmark {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
}

export interface Room {
  /** Naval compartment number: deck–frame–position–use. */
  readonly code: string;
  readonly name: string;
  readonly deckY: number;
  readonly bounds: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
  };
  readonly bookmarks: Readonly<Record<string, CameraBookmark>>;
}

const ROOM = { minX: -5, maxX: 5, minZ: -3.5, maxZ: 3.5, height: 2.6 } as const;
const WALL = 0.2;

export const TEST_ROOM_BOOKMARKS = {
  spawn: { x: -4.0, z: 0.9, yaw: 95, pitch: 4 },
  racks: { x: -1.9, z: 0.4, yaw: 35, pitch: -2 },
  lockers: { x: 0.4, z: 0.2, yaw: 150, pitch: 6 },
  table: { x: 1.6, z: 1.0, yaw: 117, pitch: 22 },
  hatch: { x: -1.4, z: -0.3, yaw: -90, pitch: 2 },
  'facing-wall': { x: -3.5, z: 0.9, yaw: -90, pitch: 0 },
} as const satisfies Record<string, CameraBookmark>;

export function buildTestRoom(
  scene: Scene,
  glow: GlowLayer,
  options: { showColliders: boolean },
): Room {
  const builder = new Builder(scene, new Materials(scene));
  buildShell(builder, scene);
  buildLighting(builder, scene);
  buildOverhead(builder);
  buildRacks(builder);
  buildLockers(builder);
  buildTable(builder);
  buildHatchWall(builder, scene);
  buildFarWall(builder, scene);
  builder.finish(glow, options);

  return {
    code: '2-40-1-L',
    name: 'Junior Enlisted Berthing A (test)',
    deckY: 0,
    bounds: { minX: ROOM.minX, maxX: ROOM.maxX, minZ: ROOM.minZ, maxZ: ROOM.maxZ },
    bookmarks: TEST_ROOM_BOOKMARKS,
  };
}

function buildShell(b: Builder, scene: Scene): void {
  const { minX, maxX, minZ, maxZ, height } = ROOM;

  // Deck plating, one plate per 1.25 m.
  const deck = CreateGround('deck', { width: maxX - minX, height: maxZ - minZ }, scene);
  const plates = new DynamicTexture('deck-plates', { width: 512, height: 512 }, scene, true);
  paintDeckPlate(plates.getContext(), 512, 512);
  plates.update();
  plates.wrapU = Texture.WRAP_ADDRESSMODE;
  plates.wrapV = Texture.WRAP_ADDRESSMODE;
  plates.uScale = (maxX - minX) / 1.25;
  plates.vScale = (maxZ - minZ) / 1.25;
  plates.anisotropicFilteringLevel = 8;
  const deckMaterial = new StandardMaterial('mat-deck', scene);
  deckMaterial.diffuseTexture = plates;
  deckMaterial.specularColor = new Color3(0.06, 0.06, 0.06);
  deckMaterial.maxSimultaneousLights = 6;
  deck.material = deckMaterial;
  deck.isPickable = false;
  deck.freezeWorldMatrix();

  b.slab(
    'overhead',
    { x: minX - WALL, y: height, z: minZ - WALL },
    { x: maxX + WALL, y: height + 0.1, z: maxZ + WALL },
  );

  // Bulkheads: a darker lower band, a trim strip, and a light upper section.
  const band = 0.9;
  const walls = [
    [
      { x: minX - WALL, z: maxZ },
      { x: maxX + WALL, z: maxZ + WALL },
    ],
    [
      { x: minX - WALL, z: minZ - WALL },
      { x: maxX + WALL, z: minZ },
    ],
    [
      { x: minX - WALL, z: minZ },
      { x: minX, z: maxZ },
    ],
    [
      { x: maxX, z: minZ },
      { x: maxX + WALL, z: maxZ },
    ],
  ] as const;
  for (const [lo, hi] of walls) {
    b.slab('bulkheadLower', { x: lo.x, y: 0, z: lo.z }, { x: hi.x, y: band, z: hi.z });
    b.slab('bulkhead', { x: lo.x, y: band, z: lo.z }, { x: hi.x, y: height, z: hi.z });
  }
  const trim = { lo: band - 0.03, hi: band + 0.01, depth: 0.015 };
  b.slab(
    'bulkheadTrim',
    { x: minX, y: trim.lo, z: maxZ - trim.depth },
    { x: maxX, y: trim.hi, z: maxZ },
  );
  b.slab(
    'bulkheadTrim',
    { x: minX, y: trim.lo, z: minZ },
    { x: maxX, y: trim.hi, z: minZ + trim.depth },
  );
  b.slab(
    'bulkheadTrim',
    { x: minX, y: trim.lo, z: minZ },
    { x: minX + trim.depth, y: trim.hi, z: maxZ },
  );
  b.slab(
    'bulkheadTrim',
    { x: maxX - trim.depth, y: trim.lo, z: minZ },
    { x: maxX, y: trim.hi, z: maxZ },
  );

  // Wall colliders are thick, so nothing can slip through them.
  const thick = 0.5;
  b.collider({ x: minX - thick, y: 0, z: maxZ }, { x: maxX + thick, y: height, z: maxZ + thick });
  b.collider({ x: minX - thick, y: 0, z: minZ - thick }, { x: maxX + thick, y: height, z: minZ });
  b.collider({ x: minX - thick, y: 0, z: minZ }, { x: minX, y: height, z: maxZ });
  b.collider({ x: maxX, y: 0, z: minZ }, { x: maxX + thick, y: height, z: maxZ });
}

function buildLighting(b: Builder, scene: Scene): void {
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.5;
  ambient.diffuse = Color3.FromHexString('#c9cfd6');
  ambient.groundColor = Color3.FromHexString('#5a5750');
  ambient.specular = Color3.Black();

  for (const x of [-3.2, 0, 3.2]) {
    b.slab(
      'fixtureFrame',
      { x: x - 0.68, y: ROOM.height - 0.04, z: -0.22 },
      { x: x + 0.68, y: ROOM.height, z: 0.22 },
    );
    b.slab(
      'lightPanel',
      { x: x - 0.6, y: ROOM.height - 0.05, z: -0.15 },
      { x: x + 0.6, y: ROOM.height - 0.04, z: 0.15 },
    );
    const lamp = new PointLight(`lamp-${x}`, new Vector3(x, ROOM.height - 0.35, 0), scene);
    lamp.diffuse = Color3.FromHexString('#ffe7c4');
    lamp.specular = new Color3(0.15, 0.14, 0.12);
    lamp.intensity = 0.55;
    lamp.range = 8;
  }
}

function buildOverhead(b: Builder): void {
  const { minX, maxX, height } = ROOM;
  const pipes = [
    { swatch: 'pipeBlue', z: 1.05, y: 2.36, diameter: 0.1 },
    { swatch: 'pipeRed', z: 1.32, y: 2.33, diameter: 0.14 },
    { swatch: 'pipeGrey', z: -1.75, y: 2.35, diameter: 0.16 },
  ] as const;
  for (const pipe of pipes) {
    b.cylinder(
      pipe.swatch,
      { x: 0, y: pipe.y, z: pipe.z },
      { diameter: pipe.diameter, height: maxX - minX, axis: 'x' },
    );
    for (let x = minX + 1; x < maxX; x += 2) {
      b.slab(
        'pipeHanger',
        { x: x - 0.02, y: pipe.y, z: pipe.z - 0.015 },
        { x: x + 0.02, y: height, z: pipe.z + 0.015 },
      );
    }
  }

  // Cable tray with a bundle of cables.
  b.slab('cableTray', { x: minX, y: 2.44, z: -1.2 }, { x: maxX, y: 2.46, z: -0.85 });
  b.slab('cables', { x: minX, y: 2.46, z: -1.15 }, { x: maxX, y: 2.51, z: -0.92 });
  for (let x = minX + 1.5; x < maxX; x += 3) {
    for (const z of [-1.215, -0.835]) {
      b.slab(
        'pipeHanger',
        { x: x - 0.02, y: 2.44, z: z - 0.01 },
        { x: x + 0.02, y: height, z: z + 0.01 },
      );
    }
  }

  // Ventilation duct over the racks, with registers.
  b.slab('duct', { x: minX, y: 2.32, z: 2.8 }, { x: maxX, y: height, z: 3.45 });
  for (const x of [-3, 0, 3]) {
    b.slab('ductVent', { x: x - 0.3, y: 2.31, z: 2.95 }, { x: x + 0.3, y: 2.32, z: 3.3 });
  }
}

/** Four stacks of three racks: 12 racks, as in Junior Berthing A (Act 1 spec §3.3). */
const RACK_STACKS = [-2.85, -0.8, 1.25, 3.3] as const;
const RACK_LEVELS = [0.36, 1.0, 1.64] as const;
const RACK_TOP = 2.2;
const RACK_FRONT = 2.65;
type Curtain = 'open' | 'half' | 'closed';
const CURTAINS: readonly (readonly Curtain[])[] = [
  ['open', 'closed', 'half'],
  ['closed', 'open', 'open'],
  ['half', 'closed', 'closed'],
  ['open', 'open', 'closed'],
];

function buildRacks(b: Builder): void {
  const back = ROOM.maxZ;
  const front = RACK_FRONT;
  RACK_STACKS.forEach((cx, stack) => {
    const x0 = cx - 1;
    const x1 = cx + 1;

    // Stowage drawers under the bottom rack, end frames and a top.
    b.slab('rackBase', { x: x0, y: 0, z: front }, { x: x1, y: 0.32, z: back });
    b.slab(
      'rackDrawer',
      { x: x0 + 0.06, y: 0.05, z: front - 0.01 },
      { x: cx - 0.03, y: 0.27, z: front },
    );
    b.slab(
      'rackDrawer',
      { x: cx + 0.03, y: 0.05, z: front - 0.01 },
      { x: x1 - 0.06, y: 0.27, z: front },
    );
    b.slab('rackFrame', { x: x0, y: 0, z: front }, { x: x0 + 0.05, y: RACK_TOP, z: back });
    b.slab('rackFrame', { x: x1 - 0.05, y: 0, z: front }, { x: x1, y: RACK_TOP, z: back });
    b.slab('rackFrame', { x: x0, y: RACK_TOP - 0.04, z: front }, { x: x1, y: RACK_TOP, z: back });

    RACK_LEVELS.forEach((h, level) => {
      const ceiling = RACK_LEVELS[level + 1] ?? RACK_TOP - 0.04;
      b.slab('rackFrame', { x: x0 + 0.05, y: h, z: front }, { x: x1 - 0.05, y: h + 0.04, z: back });
      b.slab(
        'mattress',
        { x: x0 + 0.07, y: h + 0.04, z: front + 0.05 },
        { x: x1 - 0.07, y: h + 0.16, z: back - 0.04 },
      );
      b.slab(
        'pillow',
        { x: x0 + 0.08, y: h + 0.16, z: front + 0.14 },
        { x: x0 + 0.5, y: h + 0.24, z: back - 0.12 },
      );
      if ((stack + level) % 2 === 0) {
        b.slab(
          'blanket',
          { x: x0 + 0.55, y: h + 0.16, z: front + 0.04 },
          { x: x1 - 0.07, y: h + 0.19, z: back - 0.03 },
        );
      } else {
        b.slab(
          'blanket',
          { x: x1 - 0.5, y: h + 0.16, z: front + 0.15 },
          { x: x1 - 0.1, y: h + 0.27, z: back - 0.15 },
        );
      }
      b.box(
        'readingLight',
        { x: x0 + 0.2, y: h + 0.42, z: back - 0.03 },
        { x: 0.16, y: 0.05, z: 0.04 },
      );

      // Curtain rail and privacy curtain: closed means someone is asleep.
      const railY = ceiling - 0.04;
      b.slab(
        'rackFrame',
        { x: x0 + 0.05, y: railY - 0.02, z: front - 0.03 },
        { x: x1 - 0.05, y: railY, z: front - 0.01 },
      );
      const curtain = CURTAINS[stack]?.[level] ?? 'open';
      const [left, right] =
        curtain === 'closed'
          ? [x0 + 0.06, x1 - 0.06]
          : curtain === 'half'
            ? [cx + 0.05, x1 - 0.06]
            : [x1 - 0.24, x1 - 0.06];
      b.slab(
        'curtain',
        { x: left, y: h + 0.17, z: front - 0.035 },
        { x: right, y: railY - 0.02, z: front - 0.015 },
      );
    });
  });
  b.collider(
    { x: RACK_STACKS[0] - 1, y: 0, z: front - 0.05 },
    { x: RACK_STACKS[RACK_STACKS.length - 1]! + 1, y: RACK_TOP, z: back },
  );
}

function buildLockers(b: Builder): void {
  const count = 8;
  const width = 0.6;
  const x0 = -0.6;
  const x1 = x0 + count * width;
  const back = ROOM.minZ;
  const front = back + 0.55;

  b.slab('lockerBase', { x: x0, y: 0, z: back }, { x: x1, y: 0.08, z: front + 0.01 });
  b.slab('lockerBody', { x: x0, y: 0.08, z: back }, { x: x1, y: 1.95, z: front });
  for (let i = 0; i < count; i++) {
    const x = x0 + i * width;
    b.slab(
      'lockerDoor',
      { x: x + 0.025, y: 0.12, z: front },
      { x: x + width - 0.025, y: 1.91, z: front + 0.012 },
    );
    b.slab(
      'metal',
      { x: x + width - 0.1, y: 0.95, z: front + 0.012 },
      { x: x + width - 0.075, y: 1.1, z: front + 0.035 },
    );
    for (let k = 0; k < 3; k++) {
      b.slab(
        'lockerVent',
        { x: x + 0.15, y: 1.68 + k * 0.05, z: front + 0.012 },
        { x: x + width - 0.15, y: 1.7 + k * 0.05, z: front + 0.016 },
      );
    }
    b.slab(
      'nameCard',
      { x: x + 0.2, y: 1.5, z: front + 0.012 },
      { x: x + 0.4, y: 1.56, z: front + 0.016 },
    );
  }
  b.collider({ x: x0, y: 0, z: back }, { x: x1, y: 1.95, z: front + 0.04 });
}

function buildTable(b: Builder): void {
  const cx = 3.4;
  const cz = -0.2;
  b.cylinder('metalDark', { x: cx, y: 0.015, z: cz }, { diameter: 0.5, height: 0.03 });
  b.cylinder('metal', { x: cx, y: 0.375, z: cz }, { diameter: 0.1, height: 0.69 });
  b.slab(
    'tableEdge',
    { x: cx - 0.71, y: 0.715, z: cz - 0.41 },
    { x: cx + 0.71, y: 0.73, z: cz + 0.41 },
  );
  b.slab('tableTop', { x: cx - 0.7, y: 0.73, z: cz - 0.4 }, { x: cx + 0.7, y: 0.76, z: cz + 0.4 });
  for (const z of [cz - 0.8, cz + 0.8]) {
    b.cylinder('metalDark', { x: cx, y: 0.01, z }, { diameter: 0.32, height: 0.02 });
    b.cylinder('metal', { x: cx, y: 0.23, z }, { diameter: 0.06, height: 0.42 });
    b.cylinder(
      'stoolSeat',
      { x: cx, y: 0.47, z },
      { diameter: 0.38, height: 0.07, tessellation: 12 },
    );
  }

  // What the off-duty watch left behind: coffee, a hand of cards, a datapad.
  b.cylinder('mug', { x: cx - 0.4, y: 0.81, z: cz - 0.15 }, { diameter: 0.085, height: 0.1 });
  b.cylinder('coffee', { x: cx - 0.4, y: 0.858, z: cz - 0.15 }, { diameter: 0.07, height: 0.005 });
  b.box('cards', { x: cx + 0.05, y: 0.775, z: cz + 0.05 }, { x: 0.065, y: 0.03, z: 0.09 }, 0.2);
  b.box('cards', { x: cx - 0.1, y: 0.762, z: cz + 0.12 }, { x: 0.065, y: 0.004, z: 0.09 }, -0.4);
  b.box('cards', { x: cx + 0.2, y: 0.762, z: cz + 0.18 }, { x: 0.065, y: 0.004, z: 0.09 }, 0.7);
  b.box('datapad', { x: cx + 0.35, y: 0.766, z: cz - 0.15 }, { x: 0.26, y: 0.012, z: 0.18 }, 0.35);
  b.box('screen', { x: cx + 0.35, y: 0.773, z: cz - 0.15 }, { x: 0.22, y: 0.002, z: 0.14 }, 0.35);

  b.collider({ x: cx - 0.75, y: 0, z: cz - 1.0 }, { x: cx + 0.75, y: 0.8, z: cz + 1.0 });
}

function buildHatchWall(b: Builder, scene: Scene): void {
  const x = ROOM.minX;

  // Watertight door: frame, raised sill, door leaf and dogs.
  b.slab('hatchFrame', { x, y: 0, z: -0.56 }, { x: x + 0.07, y: 2.06, z: -0.45 });
  b.slab('hatchFrame', { x, y: 0, z: 0.45 }, { x: x + 0.07, y: 2.06, z: 0.56 });
  b.slab('hatchFrame', { x, y: 1.96, z: -0.56 }, { x: x + 0.07, y: 2.06, z: 0.56 });
  b.slab('hazard', { x, y: 0, z: -0.45 }, { x: x + 0.07, y: 0.26, z: 0.45 });
  b.slab('hatchDoor', { x, y: 0.26, z: -0.45 }, { x: x + 0.045, y: 1.96, z: 0.45 });
  for (const y of [0.5, 1.1, 1.7]) {
    for (const z of [-0.38, 0.38])
      b.box('metal', { x: x + 0.07, y, z }, { x: 0.05, y: 0.05, z: 0.13 });
  }
  createPanel(scene, 'sign-compartment', {
    width: 1.1,
    height: 0.36,
    position: { x: x + 0.012, y: 2.32, z: 0 },
    facing: '+x',
    paint: paintSign(
      '#1d2a33',
      [
        { text: '2-40-1-L', size: 0.4, color: '#ffbe55' },
        { text: 'JR. BERTHING A · TEST', size: 0.2, color: '#e8e2d4' },
      ],
      '#5f7480',
    ),
  });

  // Fire extinguisher.
  b.slab('metalDark', { x, y: 0.42, z: -1.12 }, { x: x + 0.03, y: 0.9, z: -0.88 });
  b.cylinder(
    'fireRed',
    { x: x + 0.12, y: 0.66, z: -1.0 },
    { diameter: 0.17, height: 0.48, tessellation: 12 },
  );
  b.box('metalDark', { x: x + 0.12, y: 0.94, z: -1.0 }, { x: 0.06, y: 0.08, z: 0.1 });
  createPanel(scene, 'sign-fire', {
    width: 0.34,
    height: 0.12,
    position: { x: x + 0.012, y: 1.12, z: -1.0 },
    facing: '+x',
    paint: paintSign('#b8261d', [{ text: 'FIRE EXT.', size: 0.5, color: '#ffffff' }]),
  });

  // Damage-control locker.
  b.slab('dcYellow', { x, y: 0.95, z: -2.6 }, { x: x + 0.24, y: 1.75, z: -1.8 });
  createPanel(scene, 'sign-dc', {
    width: 0.66,
    height: 0.16,
    position: { x: x + 0.245, y: 1.55, z: -2.2 },
    facing: '+x',
    paint: paintSign('#d4a514', [{ text: 'DAMAGE CONTROL', size: 0.46, color: '#1a1a1a' }]),
  });
  b.collider({ x, y: 0, z: -2.65 }, { x: x + 0.28, y: 1.8, z: -0.85 });

  // Noticeboard with the watch bill, and a battle lantern.
  createPanel(scene, 'noticeboard', {
    width: 1.3,
    height: 0.85,
    position: { x: x + 0.012, y: 1.45, z: 2.0 },
    facing: '+x',
    paint: paintNoticeboard,
  });
  b.box('lanternBody', { x: x + 0.07, y: 2.1, z: 2.95 }, { x: 0.14, y: 0.18, z: 0.22 });
  b.box('lanternLens', { x: x + 0.145, y: 2.1, z: 2.95 }, { x: 0.01, y: 0.12, z: 0.15 });
}

function buildFarWall(b: Builder, scene: Scene): void {
  const x = ROOM.maxX;
  createPanel(scene, 'clock', {
    width: 0.34,
    height: 0.34,
    position: { x: x - 0.012, y: 2.0, z: -0.2 },
    facing: '-x',
    paint: paintClock(8, 15),
  });
  createPanel(scene, 'sign-no-smoking', {
    width: 0.9,
    height: 0.2,
    position: { x: x - 0.012, y: 1.5, z: -0.2 },
    facing: '-x',
    paint: paintSign(
      '#efeadf',
      [{ text: 'NO SMOKING IN BERTHING', size: 0.42, color: '#b8261d' }],
      '#b8261d',
    ),
  });
  b.slab('ventGrille', { x: x - 0.02, y: 0.25, z: 1.4 }, { x, y: 0.6, z: 2.1 });
  b.box('lanternBody', { x: x - 0.07, y: 2.1, z: -2.6 }, { x: 0.14, y: 0.18, z: 0.22 });
  b.box('lanternLens', { x: x - 0.145, y: 2.1, z: -2.6 }, { x: 0.01, y: 0.12, z: 0.15 });
}
