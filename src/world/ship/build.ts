/**
 * Turns the planned ship (layout.ts) into Babylon.js meshes and lights: walls, decks and
 * overheads, door frames, ceiling lights, pipes, furniture (props.ts), signs, windows, ladders and
 * the lift, plus invisible colliders and the boxes the captain can interact with.
 *
 * Geometry is merged into one mesh per lighting cell, so a deck costs a few dozen draw calls.
 * Each deck hangs off its own node and only the captain's deck is switched on.
 */
import { Rng } from '../../sim/rng';
import {
  Color3,
  CreateBox,
  DynamicTexture,
  HemisphericLight,
  PointLight,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
  type GlowLayer,
  type Mesh,
  type Scene,
} from '../babylon';
import { Batch, Builder, type Vec3 } from '../builder';
import {
  PanelSet,
  paintCompartmentSign,
  paintDangerSign,
  paintDeckPlate,
  paintDeckSign,
  paintLabel,
  paintStarfield,
} from '../painted';
import { ZONES, type ZoneLook } from '../palette';
import {
  DECK_HEIGHT,
  ROOM_HEIGHT,
  centre,
  direction,
  facingYaw,
  opposite,
  type Area,
} from './coords';
import type { Facing } from '../../content/ship';
import type {
  Cell,
  DeckLayout,
  Interactable,
  InteractAction,
  ShaftStop,
  ShipLayout,
  Space,
} from './layout';
import { buildProp } from './props';

/** What a look ray can find on a mesh: something to use, or something in the way. */
export interface MeshTag {
  readonly interactable?: {
    readonly id: string;
    readonly label: string;
    readonly action: InteractAction;
  };
  readonly blocksPicks?: boolean;
}

export interface ShipWorld {
  /** Switches on one deck and off the others. */
  show(deck: number): void;
  /** Height of a deck's floor in the world. */
  floorY(deck: number): number;
}

/** Where the lower band of paint meets the upper on every bulkhead. */
const BAND = 0.9;
/** Fits whose rooms keep a clean overhead, without pipes and cable trays. */
const CLEAN = new Set([
  'bridge',
  'captain',
  'cabin',
  'stateroom',
  'wardroom',
  'briefing',
  'chapel',
  'sickbay',
]);
const LIGHT = { intensity: 0.55, range: 7.5, hang: 0.35 };

interface Materials {
  readonly solid: StandardMaterial;
  readonly glow: StandardMaterial;
  readonly deck: StandardMaterial;
  readonly collider: StandardMaterial | null;
}

/** Builds every deck of the ship. Only `startDeck` is switched on. */
export function buildShip(
  scene: Scene,
  glow: GlowLayer,
  layout: ShipLayout,
  options: { showColliders: boolean },
): ShipWorld {
  // Light from above, and bounced light from the deck so overheads aren't black.
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.45;
  ambient.diffuse = Color3.FromHexString('#c9cfd6');
  ambient.groundColor = Color3.FromHexString('#8a867c');
  ambient.specular = Color3.Black();

  const materials = createMaterials(scene, options.showColliders);
  const roots = new Map<number, TransformNode>();
  const floors = new Map<number, number>();
  for (const deck of layout.decks) {
    roots.set(deck.deck.deck, buildDeck(scene, glow, deck, materials));
    floors.set(deck.deck.deck, deck.floorY);
  }
  return {
    show(deck) {
      for (const [n, root] of roots) root.setEnabled(n === deck);
    },
    floorY: (deck) => floors.get(deck) ?? 0,
  };
}

function createMaterials(scene: Scene, showColliders: boolean): Materials {
  const solid = new StandardMaterial('mat-solid', scene);
  solid.diffuseColor = Color3.White();
  solid.specularColor = new Color3(0.05, 0.05, 0.05);
  solid.maxSimultaneousLights = 6;

  // Unlit: with no lights the shader shows emissive × vertex colour, so emissive is white.
  const glow = new StandardMaterial('mat-glow', scene);
  glow.disableLighting = true;
  glow.emissiveColor = Color3.White();

  const plates = new DynamicTexture('deck-plates', { width: 512, height: 512 }, scene, true);
  paintDeckPlate(plates.getContext(), 512, 512);
  plates.update();
  plates.wrapU = Texture.WRAP_ADDRESSMODE;
  plates.wrapV = Texture.WRAP_ADDRESSMODE;
  plates.anisotropicFilteringLevel = 8;
  const deck = new StandardMaterial('mat-deck', scene);
  deck.diffuseTexture = plates;
  deck.specularColor = new Color3(0.06, 0.06, 0.06);
  deck.maxSimultaneousLights = 6;

  let collider: StandardMaterial | null = null;
  if (showColliders) {
    collider = new StandardMaterial('mat-collider', scene);
    collider.emissiveColor = new Color3(0.2, 1, 0.5);
    collider.disableLighting = true;
    collider.wireframe = true;
  }
  return { solid, glow, deck, collider };
}

interface CellParts {
  readonly cell: Cell;
  readonly look: ZoneLook;
  readonly solid: Batch;
  readonly floor: Batch;
  readonly colliders: Batch;
  /** Colliders that don't stop a look ray (ladders you can still reach for). */
  readonly soft: Batch;
}

function buildDeck(
  scene: Scene,
  glow: GlowLayer,
  layout: DeckLayout,
  materials: Materials,
): TransformNode {
  const n = layout.deck.deck;
  const root = new TransformNode(`deck-${n}`, scene);
  const y = layout.floorY;
  const spaces = new Map(layout.spaces.map((space) => [space.id, space]));
  const glowBatch = new Batch();
  const panels = new PanelSet();
  const screens = new PanelSet();
  const parts = new Map<string, CellParts>();
  for (const cell of layout.cells) {
    parts.set(cell.id, {
      cell,
      look: ZONES[spaces.get(cell.space)!.zone],
      solid: new Batch(),
      floor: new Batch(1.25),
      colliders: new Batch(),
      soft: new Batch(),
    });
  }
  const builder = new Builder({ solid: new Batch(), glow: glowBatch });
  /** Points the builder at a cell, with the deck's own frame: x = plan x, z = -plan y. */
  const inCell = (id: string): CellParts => {
    const part = parts.get(id)!;
    builder.target = { solid: part.solid, glow: glowBatch };
    builder.place([0, y, 0], 0);
    return part;
  };

  for (const slab of layout.floors) {
    const part = inCell(slab.cell);
    builder.flat(
      part.floor,
      part.look.deck,
      at(slab.area, 0, 'min'),
      at(slab.area, 0, 'max'),
      true,
    );
  }
  for (const slab of layout.ceilings) {
    const part = inCell(slab.cell);
    builder.flat(
      part.solid,
      part.look.overhead,
      at(slab.area, ROOM_HEIGHT, 'min'),
      at(slab.area, ROOM_HEIGHT, 'max'),
      false,
    );
  }
  for (const wall of layout.walls) {
    const part = inCell(wall.cell);
    wallSlab(builder, part.look, wall.area, wall.side, wall.bottom, wall.top);
  }
  for (const part of parts.values()) {
    inCell(part.cell.id);
    fixtures(builder, part.cell);
    const space = spaces.get(part.cell.space)!;
    if (space.kind === 'room' && !CLEAN.has(space.room?.fit ?? ''))
      overhead(builder, layout, space, part.cell);
  }
  for (const doorway of layout.doorways) {
    for (const side of doorway.sides) {
      inCell(side.cell);
      builder.within([doorway.at[0], 0, -doorway.at[1]], radians(facingYaw(side.into)), () =>
        doorFrame(builder, doorway.width, doorway.height, doorway.kind === 'door'),
      );
    }
  }
  for (const window of layout.windows) {
    inCell(window.cell);
    const space = spaces.get(window.space)!;
    const { opening } = window;
    const point = openingPointOf(space, opening.side, opening.at);
    builder.within([point[0], 0, -point[1]], radians(facingYaw(opposite(opening.side))), () =>
      windowFrame(builder, screens, opening.width, opening.bottom, opening.top, n),
    );
  }
  for (const item of layout.items) {
    inCell(item.cell);
    const [cx, cy] = centre(item.area);
    builder.place([cx, y, -cy], radians(facingYaw(item.facing)));
    buildProp(builder, { item, panels, screens, random: Rng.fromSeed(item.seed) });
  }
  for (const stop of layout.shafts) {
    const space = spaces.get(stop.space)!;
    const cell = layout.cells.find((candidate) => candidate.space === stop.space)!;
    inCell(cell.id);
    shaftFittings(builder, panels, space, stop);
  }
  for (const sign of layout.signs) {
    builder.place([sign.at[0], y, -sign.at[1]], radians(facingYaw(sign.facing)));
    const [title, subtitle = ''] = sign.lines;
    const paint =
      sign.style === 'compartment'
        ? paintCompartmentSign(title!, subtitle)
        : sign.style === 'deck'
          ? paintDeckSign(title!, subtitle)
          : paintDangerSign(subtitle);
    const [w, h] = [sign.width, sign.tall];
    panels.add({
      width: w,
      height: h,
      paint,
      corners: [
        builder.toWorld([w / 2, sign.height - h / 2, 0.012]),
        builder.toWorld([-w / 2, sign.height - h / 2, 0.012]),
        builder.toWorld([-w / 2, sign.height + h / 2, 0.012]),
        builder.toWorld([w / 2, sign.height + h / 2, 0.012]),
      ],
      normal: builder.directionToWorld([0, 0, 1]),
    });
  }
  for (const blocker of layout.blockers) {
    const part = inCell(blocker.cell);
    const batch = blocker.soft ? part.soft : part.colliders;
    builder.target = { solid: batch, glow: batch };
    builder.tinted(
      '#33ff88',
      at(blocker.area, blocker.bottom, 'min'),
      at(blocker.area, blocker.top, 'max'),
    );
  }

  // Meshes: per cell the solid parts, the deck and the colliders; per deck what glows and the panels.
  const cellMeshes = new Map<string, Mesh[]>();
  for (const part of parts.values()) {
    const { id } = part.cell;
    const meshes = [
      part.solid.toMesh(`${id}-solid`, scene, materials.solid, root),
      part.floor.toMesh(`${id}-deck`, scene, materials.deck, root),
    ].filter((mesh): mesh is Mesh => mesh !== null);
    cellMeshes.set(id, meshes);
    for (const [batch, blocksPicks] of [
      [part.colliders, true],
      [part.soft, false],
    ] as const) {
      const colliders = batch.toMesh(
        `${id}-colliders${blocksPicks ? '' : '-soft'}`,
        scene,
        materials.collider,
        root,
      );
      if (!colliders) continue;
      colliders.checkCollisions = true;
      colliders.isVisible = materials.collider !== null;
      colliders.metadata = { blocksPicks } satisfies MeshTag;
    }
  }
  // The glow layer draws every mesh: solid ones black, so walls hide what glows behind them.
  const glowMesh = glowBatch.toMesh(`deck-${n}-glow`, scene, materials.glow, root);
  if (glowMesh) glow.referenceMeshToUseItsOwnMaterial(glowMesh);
  const panelMesh = panels.build(`deck-${n}-panels`, scene, root, false);
  if (panelMesh) glow.addExcludedMesh(panelMesh);
  const screenMesh = screens.build(`deck-${n}-screens`, scene, root, true);
  if (screenMesh) glow.referenceMeshToUseItsOwnMaterial(screenMesh);
  for (const thing of layout.interactables) interactionBox(scene, root, y, thing);
  cellLights(scene, root, layout, spaces, cellMeshes);
  return root;
}

/**
 * A light under each ceiling fixture. Each lights only its own cell, plus the cells next door in
 * the same space where it is their nearest borrowed light, so no light shines through a wall.
 */
function cellLights(
  scene: Scene,
  root: TransformNode,
  layout: DeckLayout,
  spaces: ReadonlyMap<string, Space>,
  meshes: ReadonlyMap<string, Mesh[]>,
): void {
  const cells = new Map(layout.cells.map((cell) => [cell.id, cell]));
  for (const cell of layout.cells) {
    const colour = Color3.FromHexString(ZONES[spaces.get(cell.space)!.zone].light);
    const lights = cell.fixtures.map(([fx, fy], i) => {
      const light = new PointLight(
        `${cell.id}-light-${i}`,
        new Vector3(fx, layout.floorY + ROOM_HEIGHT - LIGHT.hang, -fy),
        scene,
      );
      light.diffuse = colour;
      light.specular = colour.scale(0.25);
      light.intensity = LIGHT.intensity;
      light.range = LIGHT.range;
      light.parent = root;
      return { light, at: [fx, fy] as const, lit: [...(meshes.get(cell.id) ?? [])] };
    });
    // Lend the light nearest each neighbouring cell to it, so the seam between cells is smooth.
    for (const neighbourId of cell.neighbours) {
      const neighbour = cells.get(neighbourId)!;
      const [nx, ny] = centre(neighbour.area);
      let best = lights[0];
      for (const candidate of lights) {
        const distance = Math.hypot(candidate.at[0] - nx, candidate.at[1] - ny);
        if (best && distance < Math.hypot(best.at[0] - nx, best.at[1] - ny)) best = candidate;
      }
      best?.lit.push(...(meshes.get(neighbourId) ?? []));
    }
    for (const { light, lit } of lights) light.includedOnlyMeshes = lit;
  }
}

/** An invisible box a look ray can hit, tagged with what using it does. */
function interactionBox(
  scene: Scene,
  root: TransformNode,
  floorY: number,
  thing: Interactable,
): void {
  const { area } = thing;
  const box = CreateBox(
    `use-${thing.id}`,
    { width: area.x1 - area.x0, height: thing.top - thing.bottom, depth: area.y1 - area.y0 },
    scene,
  );
  const [x, y] = centre(area);
  box.position.set(x, floorY + (thing.bottom + thing.top) / 2, -y);
  box.isVisible = false;
  box.parent = root;
  box.metadata = {
    interactable: { id: thing.id, label: thing.label, action: thing.action },
  } satisfies MeshTag;
  box.freezeWorldMatrix();
}

// ---- Rooms --------------------------------------------------------------------------------------

/** A corner of a plan area at height `h`, in the deck's frame (x, h, -y). */
function at(area: Area, h: number, corner: 'min' | 'max'): Vec3 {
  return corner === 'min' ? [area.x0, h, -area.y1] : [area.x1, h, -area.y0];
}

/** A slab of bulkhead: the lower band darker, the upper lighter, a trim strip between. */
function wallSlab(
  b: Builder,
  look: ZoneLook,
  area: Area,
  side: Facing,
  bottom: number,
  top: number,
): void {
  if (bottom < BAND)
    b.tinted(look.lower, at(area, bottom, 'min'), at(area, Math.min(top, BAND), 'max'));
  if (top > BAND)
    b.tinted(look.upper, at(area, Math.max(bottom, BAND), 'min'), at(area, top, 'max'));
  if (bottom < BAND - 0.03 && top > BAND + 0.01) {
    const [dx, dy] = direction(opposite(side));
    const face: Area =
      dx > 0
        ? { ...area, x0: area.x1, x1: area.x1 + 0.015 }
        : dx < 0
          ? { ...area, x0: area.x0 - 0.015, x1: area.x0 }
          : dy > 0
            ? { ...area, y0: area.y1, y1: area.y1 + 0.015 }
            : { ...area, y0: area.y0 - 0.015, y1: area.y0 };
    b.tinted(look.trim, at(face, BAND - 0.03, 'min'), at(face, BAND + 0.01, 'max'));
  }
}

/** Light fittings on the overhead, along the cell. */
function fixtures(b: Builder, cell: Cell): void {
  for (const [fx, fy] of cell.fixtures) {
    const [lx, lz] = cell.along === 'x' ? [1.36, 0.44] : [0.44, 1.36];
    b.box('fixtureFrame', [fx, ROOM_HEIGHT - 0.02, -fy], [lx, 0.04, lz]);
    b.box('lightPanel', [fx, ROOM_HEIGHT - 0.045, -fy], [lx - 0.16, 0.01, lz - 0.14]);
  }
}

/** Pipes and a cable tray along the overhead of a cell, on a side with nothing tall under it. */
function overhead(b: Builder, layout: DeckLayout, space: Space, cell: Cell): void {
  const inner = intersectArea(cell.area, space.inner);
  if (!inner) return;
  const along = cell.along;
  const sides: [number, number][] =
    along === 'x'
      ? [
          [inner.y0, 1],
          [inner.y1, -1],
        ]
      : [
          [inner.x0, 1],
          [inner.x1, -1],
        ];
  const tall = layout.items.filter((item) => item.space === space.id && item.top > 2.2);
  const clear = ([edge, inward]: [number, number]) => {
    const strip: Area =
      along === 'x'
        ? {
            x0: inner.x0,
            x1: inner.x1,
            y0: Math.min(edge, edge + inward * 0.9),
            y1: Math.max(edge, edge + inward * 0.9),
          }
        : {
            y0: inner.y0,
            y1: inner.y1,
            x0: Math.min(edge, edge + inward * 0.9),
            x1: Math.max(edge, edge + inward * 0.9),
          };
    return !tall.some((item) => overlaps(item.area, strip));
  };
  const free = sides.filter(clear);
  const [from, to] = along === 'x' ? [inner.x0, inner.x1] : [inner.y0, inner.y1];
  const length = to - from;
  const mid = (from + to) / 2;
  const run = (
    edge: number,
    inward: number,
    offset: number,
    height: number,
    diameter: number,
    swatch: 'pipeBlue' | 'pipeRed' | 'pipeGrey' | 'pipeGreen',
  ) => {
    const across = edge + inward * offset;
    const point: Vec3 = along === 'x' ? [mid, height, -across] : [across, height, -mid];
    b.prism(swatch, point, { diameter, length, axis: along === 'x' ? 'x' : 'z', sides: 8 });
    for (let t = from + 1; t < to - 0.3; t += 2) {
      const hanger: Vec3 =
        along === 'x'
          ? [t, (height + ROOM_HEIGHT) / 2, -across]
          : [across, (height + ROOM_HEIGHT) / 2, -t];
      b.box('pipeHanger', hanger, [0.03, ROOM_HEIGHT - height, 0.03]);
    }
  };
  const tray = (edge: number, inward: number) => {
    const a = edge + inward * 0.62;
    const c = edge + inward * 0.95;
    const [lo, hi] = [Math.min(a, c), Math.max(a, c)];
    const slab = (bottom: number, top: number, swatch: 'cableTray' | 'cables', inset: number) =>
      along === 'x'
        ? b.slab(swatch, [from, bottom, -(hi - inset)], [to, top, -(lo + inset)])
        : b.slab(swatch, [lo + inset, bottom, -to], [hi - inset, top, -from]);
    slab(2.44, 2.46, 'cableTray', 0);
    slab(2.46, 2.51, 'cables', 0.04);
  };
  const seed = hashText(space.id);
  if (free[0]) {
    const [edge, inward] = free[0];
    run(edge, inward, 0.18, 2.36, 0.1, seed % 2 ? 'pipeBlue' : 'pipeGreen');
    run(edge, inward, 0.36, 2.33, 0.14, seed % 3 ? 'pipeRed' : 'pipeGrey');
    tray(edge, inward);
  }
  if (free[1] && space.zone !== 'shaft') {
    const [edge, inward] = free[1];
    run(edge, inward, 0.22, 2.35, 0.16, 'pipeGrey');
  }
}

/** One side of a door frame: posts and head proud of the bulkhead, a raised sill for hatches. */
function doorFrame(b: Builder, width: number, height: number, sill: boolean): void {
  const half = width / 2;
  const depth = 0.13;
  b.slab('hatchFrame', [-half - 0.08, 0, 0], [-half, height + 0.06, depth]);
  b.slab('hatchFrame', [half, 0, 0], [half + 0.08, height + 0.06, depth]);
  b.slab('hatchFrame', [-half - 0.08, height, 0], [half + 0.08, height + 0.08, depth]);
  if (sill) b.slab('hazard', [-half, 0, 0], [half, 0.1, depth - 0.01]);
  else
    b.slab(
      'hazard',
      [-half - 0.08, height + 0.08, depth - 0.02],
      [half + 0.08, height + 0.11, depth],
    );
}

/** A window: frame and mullions on the inside, and space beyond it. */
function windowFrame(
  b: Builder,
  screens: PanelSet,
  width: number,
  sill: number,
  head: number,
  seed: number,
): void {
  const half = width / 2;
  const w = width + 0.8;
  const h = head - sill + 0.8;
  const cy = (sill + head) / 2;
  screens.add({
    width: w,
    height: h,
    paint: paintStarfield(seed * 97 + Math.round(width * 10)),
    corners: [
      b.toWorld([w / 2, cy - h / 2, -0.45]),
      b.toWorld([-w / 2, cy - h / 2, -0.45]),
      b.toWorld([-w / 2, cy + h / 2, -0.45]),
      b.toWorld([w / 2, cy + h / 2, -0.45]),
    ],
    normal: b.directionToWorld([0, 0, 1]),
  });
  b.slab('hatchFrame', [-half - 0.06, sill - 0.08, -0.1], [half + 0.06, sill, 0.2]);
  b.slab('hatchFrame', [-half - 0.06, head, -0.1], [half + 0.06, head + 0.08, 0.12]);
  const panes = Math.max(1, Math.round(width / 1.7));
  for (let i = 0; i <= panes; i++) {
    const x = -half + (i * width) / panes;
    b.slab('hatchFrame', [x - 0.04, sill, -0.1], [x + 0.04, head, 0.1]);
  }
}

// ---- Ladders and the lift --------------------------------------------------------------------

function shaftFittings(b: Builder, panels: PanelSet, space: Space, stop: ShaftStop): void {
  const opening = space.openings.find((candidate) => candidate.kind === 'shaft');
  if (!opening) return;
  const into = opposite(opening.side);
  if (stop.shaft.type === 'lift') {
    liftCar(b, panels, space, into);
    return;
  }
  if (stop.ladderUp) {
    withAreaFrame(b, stop.ladderUp, into, (length, width) => {
      ladder(b, length, width, 0);
      shaftWalls(b, length, width, ROOM_HEIGHT, DECK_HEIGHT + ROOM_HEIGHT);
      b.slab(
        'darkness',
        [-width / 2, DECK_HEIGHT + ROOM_HEIGHT, 0],
        [width / 2, DECK_HEIGHT + ROOM_HEIGHT + 0.05, length],
      );
    });
  }
  if (stop.ladderDown) {
    const holeSide = sideToward(stop.ladderDown, stop.ladderUp ?? space.inner, into);
    withAreaFrame(b, stop.ladderDown, into, (length, width) => {
      ladder(b, length, width, -DECK_HEIGHT);
      shaftWalls(b, length, width, -DECK_HEIGHT, 0);
      b.slab('darkness', [-width / 2, -DECK_HEIGHT - 0.05, 0], [width / 2, -DECK_HEIGHT, length]);
      railing(b, [-width / 2, 0], [width / 2, 0]);
      const x = holeSide * (width / 2);
      railing(b, [x, 0], [x, length]);
    });
  }
}

/**
 * Builds in a frame on a shaft area: origin at the middle of its edge nearest the landing, +z
 * running into the shaft. Passes the area's length (along +z) and width.
 */
function withAreaFrame(
  b: Builder,
  area: Area,
  into: Facing,
  build: (length: number, width: number) => void,
): void {
  const [dx, dy] = direction(into);
  const [cx, cy] = centre(area);
  const length = dx !== 0 ? area.x1 - area.x0 : area.y1 - area.y0;
  const width = dx !== 0 ? area.y1 - area.y0 : area.x1 - area.x0;
  const start: [number, number] = [cx - (dx * length) / 2, cy - (dy * length) / 2];
  b.within([start[0], 0, -start[1]], radians(facingYaw(into)), () => build(length, width));
}

/** +1 or -1: which way along a shaft frame's x axis (see withAreaFrame) `other` lies from `hole`. */
function sideToward(hole: Area, other: Area, into: Facing): number {
  // The frame's +x, back on the plan: (cos yaw, sin yaw).
  const yaw = radians(facingYaw(into));
  const [hx, hy] = centre(hole);
  const [ox, oy] = centre(other);
  return (ox - hx) * Math.cos(yaw) + (oy - hy) * Math.sin(yaw) >= 0 ? 1 : -1;
}

/** A steep ship's ladder from the near end (floor `base`) to the far end, one deck up. */
function ladder(b: Builder, length: number, width: number, base: number): void {
  const z0 = 0.15;
  const z1 = length - 0.15;
  const run = z1 - z0;
  const rise = DECK_HEIGHT;
  const slope = Math.atan2(rise, run);
  const span = Math.hypot(run, rise);
  const midZ = (z0 + z1) / 2;
  const midY = base + rise / 2;
  const halfWidth = Math.min(0.4, width / 2 - 0.08);
  for (const x of [-halfWidth, halfWidth]) {
    b.box('metalDark', [x, midY, midZ], [0.05, 0.22, span], { pitch: slope });
    b.prism('pipeYellow', [x * 1.08, midY + 0.9, midZ], {
      diameter: 0.05,
      length: span,
      axis: 'z',
      sides: 6,
      pitch: slope,
    });
  }
  for (let h = 0.25; h < rise - 0.1; h += 0.27) {
    const z = z0 + (h / rise) * run;
    b.box('metal', [0, base + h, z], [halfWidth * 2 - 0.04, 0.035, 0.18]);
  }
}

/** The walls of a shaft between two heights, around an area in the shaft's frame. */
function shaftWalls(b: Builder, length: number, width: number, bottom: number, top: number): void {
  const t = 0.04;
  b.slab('shaftWall', [-width / 2 - t, bottom, 0], [-width / 2, top, length]);
  b.slab('shaftWall', [width / 2, bottom, 0], [width / 2 + t, top, length]);
  b.slab('shaftWall', [-width / 2, bottom, length], [width / 2, top, length + t]);
  b.slab('shaftWall', [-width / 2, bottom, -t], [width / 2, top, 0]);
}

/** A safety rail with posts from `a` to `b` (x, z in the current frame). */
function railing(b: Builder, [ax, az]: [number, number], [bx, bz]: [number, number]): void {
  const length = Math.hypot(bx - ax, bz - az);
  const posts = Math.max(2, Math.ceil(length / 0.9) + 1);
  for (let i = 0; i < posts; i++) {
    const t = i / (posts - 1);
    b.box('hazard', [ax + (bx - ax) * t, 0.5, az + (bz - az) * t], [0.05, 1.0, 0.05]);
  }
  const yaw = Math.atan2(bx - ax, bz - az);
  for (const h of [1.0, 0.55]) {
    b.box('hazard', [(ax + bx) / 2, h, (az + bz) / 2], [0.04, 0.04, length], { yaw });
  }
}

/** Inside the lift car: steel panels, handrails, a checker-plate floor and the deck buttons. */
function liftCar(b: Builder, panels: PanelSet, space: Space, into: Facing): void {
  withAreaFrame(b, space.inner, into, (length, width) => {
    const half = width / 2;
    b.slab('metalDark', [-half, 0, 0.05], [half, 0.012, length]);
    // Steel cladding on the side and back walls, in panels.
    for (const side of [-1, 1]) {
      for (let z = 0.1; z < length - 0.1; z += 0.55) {
        const x = side * (half - 0.01);
        b.slab(
          'steel',
          [Math.min(x, x - side * 0.015), 0.1, z],
          [Math.max(x, x - side * 0.015), 2.45, z + 0.5],
        );
      }
      b.prism('metalLight', [side * (half - 0.07), 0.95, length / 2], {
        diameter: 0.04,
        length: length - 0.3,
        axis: 'z',
        sides: 6,
      });
    }
    for (let x = -half + 0.05; x < half - 0.1; x += 0.6) {
      b.slab('steel', [x, 0.1, length - 0.025], [x + 0.55, 2.45, length - 0.01]);
    }
    b.prism('metalLight', [0, 0.95, length - 0.08], {
      diameter: 0.04,
      length: width - 0.3,
      axis: 'x',
      sides: 6,
    });
    // The deck buttons, halfway along the right-hand wall as you walk in.
    const x = half - 0.03;
    const z = length / 2;
    b.slab('console', [x - 0.05, 1.0, z - 0.18], [x + 0.03, 1.55, z + 0.18]);
    for (let i = 0; i < 4; i++)
      b.box('screenAmber', [x - 0.055, 1.1 + i * 0.11, z], [0.01, 0.07, 0.09]);
    b.within([x - 0.06, 0, z], -Math.PI / 2, () => {
      panels.add({
        width: 0.3,
        height: 0.09,
        paint: paintLabel('LIFT', '#1d2a33', '#ffbe55'),
        corners: [
          b.toWorld([0.15, 1.6, 0]),
          b.toWorld([-0.15, 1.6, 0]),
          b.toWorld([-0.15, 1.69, 0]),
          b.toWorld([0.15, 1.69, 0]),
        ],
        normal: b.directionToWorld([0, 0, 1]),
      });
    });
  });
}

// ---- Helpers --------------------------------------------------------------------------------

function openingPointOf(space: Space, side: Facing, along: number): [number, number] {
  const { rect } = space;
  switch (side) {
    case 'stbd':
      return [along, rect.y0];
    case 'port':
      return [along, rect.y1];
    case 'fwd':
      return [rect.x0, along];
    case 'aft':
      return [rect.x1, along];
  }
}

function intersectArea(a: Area, b: Area): Area | null {
  const area = {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
  return area.x1 > area.x0 && area.y1 > area.y0 ? area : null;
}

function overlaps(a: Area, b: Area): boolean {
  return Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function hashText(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}
