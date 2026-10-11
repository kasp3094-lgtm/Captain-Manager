/**
 * Builds static geometry out of boxes, prisms and rings, straight into a few big vertex-coloured
 * meshes ("batches"): one per lighting cell for solid things, one per deck for everything that
 * glows. A whole deck costs a few dozen draw calls however many parts it has.
 *
 * Shapes are given in a local frame set with `place` (an item's own coordinates: x across its
 * front, z from its back to its front, y up), so props can be written once and stood anywhere.
 */
import { Mesh, VertexData, type Material, type Scene, type TransformNode } from './babylon';
import { isGlowing, rgb, swatchRgb, type Swatch } from './palette';

export type Vec3 = readonly [number, number, number];
type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Vertices for one mesh. */
export class Batch {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly colors: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  constructor(
    /** Planar texture coordinates from world x and z, one texture repeat per `uvScale` metres. */
    readonly uvScale: number | null = null,
  ) {}

  get empty(): boolean {
    return this.indices.length === 0;
  }

  /** Adds a triangle, wound so that its front faces along `normal` (Babylon's convention). */
  triangle(a: Vec3, b: Vec3, c: Vec3, normal: Vec3, colour: Vec3): void {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
    const facing = cross[0]! * normal[0] + cross[1]! * normal[1] + cross[2]! * normal[2];
    const start = this.positions.length / 3;
    for (const p of facing > 0 ? [a, c, b] : [a, b, c]) this.vertex(p, normal, colour);
    this.indices.push(start, start + 1, start + 2);
  }

  /** Adds a flat quad (corners in order around it), front along `normal`. */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, normal: Vec3, colour: Vec3): void {
    this.triangle(a, b, c, normal, colour);
    this.triangle(a, c, d, normal, colour);
  }

  private vertex(p: Vec3, n: Vec3, colour: Vec3): void {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.colors.push(colour[0], colour[1], colour[2], 1);
    if (this.uvScale) this.uvs.push(p[0] / this.uvScale, p[2] / this.uvScale);
  }

  /** The finished mesh, or null if nothing was added. */
  toMesh(
    name: string,
    scene: Scene,
    material: Material | null,
    parent: TransformNode,
  ): Mesh | null {
    if (this.empty) return null;
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = this.positions;
    data.normals = this.normals;
    data.colors = this.colors;
    if (this.uvScale) data.uvs = this.uvs;
    data.indices = this.indices;
    data.applyToMesh(mesh, false);
    mesh.material = material;
    mesh.parent = parent;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
  }
}

/** Where shapes go: the current cell's solid batch, and the deck's glowing and collision batches. */
export interface BatchTarget {
  readonly solid: Batch;
  readonly glow: Batch;
}

export interface ShapeOptions {
  /** Turns, in radians: yaw about y, pitch tilts +z up, roll tilts +x up. */
  readonly yaw?: number;
  readonly pitch?: number;
  readonly roll?: number;
}

export interface PrismOptions extends ShapeOptions {
  readonly diameter: number;
  readonly length: number;
  /** The prism's axis in local space. Default y (upright). */
  readonly axis?: 'x' | 'y' | 'z';
  readonly sides?: number;
  /** A tapering prism: diameter at the +axis end. */
  readonly topDiameter?: number;
  /** Leave the end caps open. */
  readonly open?: boolean;
}

/**
 * Turns simple shapes into triangles in the current batches. Every shape goes through the local
 * frame set by `place` (origin and yaw), then into the world.
 */
export class Builder {
  target: BatchTarget;
  private origin: Vec3 = [0, 0, 0];
  private yaw = 0;
  private frame: Mat3 = IDENTITY;

  constructor(target: BatchTarget) {
    this.target = target;
  }

  /** Sets the local frame: origin in world space, turned `yaw` radians about the vertical. */
  place(origin: Vec3, yaw = 0): void {
    this.origin = origin;
    this.yaw = yaw;
    this.frame = rotation(yaw, 0, 0);
  }

  /** Builds part of something in a frame inside the current one, e.g. each chair round a table. */
  within(origin: Vec3, yaw: number, build: () => void): void {
    const saved = { origin: this.origin, yaw: this.yaw };
    this.place(this.toWorld(origin), this.yaw + yaw);
    build();
    this.place(saved.origin, saved.yaw);
  }

  /** A local point in world space. */
  toWorld(p: Vec3): Vec3 {
    const q = apply(this.frame, p);
    return [q[0] + this.origin[0], q[1] + this.origin[1], q[2] + this.origin[2]];
  }

  /** A local direction in world space. */
  directionToWorld(d: Vec3): Vec3 {
    return apply(this.frame, d);
  }

  /** A box between two opposite corners. */
  slab(swatch: Swatch, min: Vec3, max: Vec3): void {
    this.box(
      swatch,
      [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
      [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    );
  }

  /** A box by centre and size, optionally turned. */
  box(swatch: Swatch, centre: Vec3, size: Vec3, options: ShapeOptions = {}): void {
    const turn = rotation(options.yaw ?? 0, options.pitch ?? 0, options.roll ?? 0);
    this.emitBox(this.batchFor(swatch), swatchRgb(swatch), centre, size, turn);
  }

  /** A box in any colour (zone colours aren't swatches), into the solid batch. */
  tinted(colour: string, min: Vec3, max: Vec3): void {
    const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    this.emitBox(this.target.solid, rgb(colour), centre, size, IDENTITY);
  }

  /** A level rectangle facing up or down (decks, overheads), into `batch`. */
  flat(batch: Batch, colour: string, min: Vec3, max: Vec3, up: boolean): void {
    const y = up ? max[1] : min[1];
    const corners: [Vec3, Vec3, Vec3, Vec3] = [
      this.toWorld([min[0], y, min[2]]),
      this.toWorld([max[0], y, min[2]]),
      this.toWorld([max[0], y, max[2]]),
      this.toWorld([min[0], y, max[2]]),
    ];
    batch.quad(...corners, this.directionToWorld([0, up ? 1 : -1, 0]), rgb(colour));
  }

  private emitBox(batch: Batch, colour: Vec3, centre: Vec3, size: Vec3, turn: Mat3): void {
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const corner = (sx: number, sy: number, sz: number): Vec3 =>
      this.local(centre, turn, [sx * hx, sy * hy, sz * hz]);
    const faces: [Vec3, [Vec3, Vec3, Vec3, Vec3]][] = [
      [
        [1, 0, 0],
        [corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1)],
      ],
      [
        [-1, 0, 0],
        [corner(-1, -1, -1), corner(-1, -1, 1), corner(-1, 1, 1), corner(-1, 1, -1)],
      ],
      [
        [0, 1, 0],
        [corner(-1, 1, -1), corner(-1, 1, 1), corner(1, 1, 1), corner(1, 1, -1)],
      ],
      [
        [0, -1, 0],
        [corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1)],
      ],
      [
        [0, 0, 1],
        [corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1)],
      ],
      [
        [0, 0, -1],
        [corner(-1, -1, -1), corner(-1, 1, -1), corner(1, 1, -1), corner(1, -1, -1)],
      ],
    ];
    for (const [normal, [a, b, c, d]] of faces) {
      batch.quad(a, b, c, d, this.normal(turn, normal), colour);
    }
  }

  /** A faceted cylinder (or tapering prism), flat-shaded. */
  prism(swatch: Swatch, centre: Vec3, options: PrismOptions): void {
    const sides = options.sides ?? 10;
    const r0 = options.diameter / 2;
    const r1 = (options.topDiameter ?? options.diameter) / 2;
    const half = options.length / 2;
    // Build upright (along y), then turn onto the requested axis.
    const axisTurn =
      options.axis === 'x'
        ? rotation(0, 0, -Math.PI / 2)
        : options.axis === 'z'
          ? rotation(0, -Math.PI / 2, 0)
          : IDENTITY;
    const turn = multiply(
      rotation(options.yaw ?? 0, options.pitch ?? 0, options.roll ?? 0),
      axisTurn,
    );
    const batch = this.batchFor(swatch);
    const colour = swatchRgb(swatch);
    const at = (r: number, angle: number, y: number): Vec3 =>
      this.local(centre, turn, [Math.cos(angle) * r, y, Math.sin(angle) * r]);
    const slope = (r0 - r1) / options.length;

    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      const length = Math.hypot(1, slope);
      const normal = this.normal(turn, [
        Math.cos(mid) / length,
        slope / length,
        Math.sin(mid) / length,
      ]);
      batch.quad(
        at(r0, a0, -half),
        at(r0, a1, -half),
        at(r1, a1, half),
        at(r1, a0, half),
        normal,
        colour,
      );
      if (!options.open) {
        if (r1 > 0)
          batch.triangle(
            this.local(centre, turn, [0, half, 0]),
            at(r1, a0, half),
            at(r1, a1, half),
            this.normal(turn, [0, 1, 0]),
            colour,
          );
        if (r0 > 0)
          batch.triangle(
            this.local(centre, turn, [0, -half, 0]),
            at(r0, a1, -half),
            at(r0, a0, -half),
            this.normal(turn, [0, -1, 0]),
            colour,
          );
      }
    }
  }

  /** A ring lying flat (around the local y axis): `diameter` across, `thickness` the tube. */
  ring(
    swatch: Swatch,
    centre: Vec3,
    diameter: number,
    thickness: number,
    segments = 24,
    tube = 6,
  ): void {
    const batch = this.batchFor(swatch);
    const colour = swatchRgb(swatch);
    const R = diameter / 2;
    const r = thickness / 2;
    const point = (i: number, j: number): Vec3 => {
      const u = (i / segments) * Math.PI * 2;
      const v = (j / tube) * Math.PI * 2;
      const k = R + r * Math.cos(v);
      return this.local(centre, IDENTITY, [Math.cos(u) * k, r * Math.sin(v), Math.sin(u) * k]);
    };
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < tube; j++) {
        const u = ((i + 0.5) / segments) * Math.PI * 2;
        const v = ((j + 0.5) / tube) * Math.PI * 2;
        const normal = this.normal(IDENTITY, [
          Math.cos(u) * Math.cos(v),
          Math.sin(v),
          Math.sin(u) * Math.cos(v),
        ]);
        batch.quad(
          point(i, j),
          point(i + 1, j),
          point(i + 1, j + 1),
          point(i, j + 1),
          normal,
          colour,
        );
      }
    }
  }

  private batchFor(swatch: Swatch): Batch {
    return isGlowing(swatch) ? this.target.glow : this.target.solid;
  }

  /** A point in the shape's own frame → world. */
  private local(centre: Vec3, turn: Mat3, p: Vec3): Vec3 {
    const q = apply(turn, p);
    return this.toWorld([q[0] + centre[0], q[1] + centre[1], q[2] + centre[2]]);
  }

  private normal(turn: Mat3, n: Vec3): Vec3 {
    return apply(this.frame, apply(turn, n));
  }
}

/** Yaw about y, then pitch about x (+z tilts up), then roll about z (+x tilts up); applied roll first. */
function rotation(yaw: number, pitch: number, roll: number): Mat3 {
  const [cy, sy] = [Math.cos(yaw), Math.sin(yaw)];
  const [cp, sp] = [Math.cos(pitch), Math.sin(pitch)];
  const [cr, sr] = [Math.cos(roll), Math.sin(roll)];
  const ry: Mat3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rx: Mat3 = [1, 0, 0, 0, cp, sp, 0, -sp, cp];
  const rz: Mat3 = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  return multiply(ry, multiply(rx, rz));
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      out.push(
        a[row * 3]! * b[column]! +
          a[row * 3 + 1]! * b[3 + column]! +
          a[row * 3 + 2]! * b[6 + column]!,
      );
    }
  }
  return out as unknown as Mat3;
}

function apply(m: Mat3, [x, y, z]: Vec3): Vec3 {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}
