/**
 * Builds static room geometry out of boxes and cylinders, then merges it per colour so a room
 * costs a couple of dozen draw calls. Used by testRoom.ts now, by the ship generator from M1.
 */
import {
  Color3,
  Mesh,
  StandardMaterial,
  type GlowLayer,
  type Scene,
  CreateBox,
  CreateCylinder,
} from './babylon';
import { isGlowing, type Materials, type Swatch } from './palette';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Builds static geometry from simple shapes. Parts are merged per colour when the room is
 * finished, so a room costs a couple of dozen draw calls however many parts it has.
 * Collision uses separate invisible boxes, so the captain never snags on small details.
 */
export class Builder {
  private readonly parts = new Map<Swatch, Mesh[]>();
  private readonly colliders: Mesh[] = [];
  private count = 0;

  constructor(
    readonly scene: Scene,
    private readonly materials: Materials,
  ) {}

  /** A box spanning two opposite corners. */
  slab(swatch: Swatch, min: Vec3, max: Vec3): Mesh {
    const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
    const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
    return this.box(swatch, center, size);
  }

  /** A box by centre and size, optionally turned about the vertical axis (radians). */
  box(swatch: Swatch, center: Vec3, size: Vec3, yaw = 0): Mesh {
    const mesh = CreateBox(
      `${swatch}-${this.count++}`,
      { width: size.x, height: size.y, depth: size.z },
      this.scene,
    );
    mesh.position.set(center.x, center.y, center.z);
    mesh.rotation.y = yaw;
    return this.add(swatch, mesh);
  }

  /** A faceted cylinder, standing upright or lying along x (pipes). */
  cylinder(
    swatch: Swatch,
    center: Vec3,
    options: { diameter: number; height: number; axis?: 'x' | 'y'; tessellation?: number },
  ): Mesh {
    const mesh = CreateCylinder(
      `${swatch}-${this.count++}`,
      {
        diameter: options.diameter,
        height: options.height,
        tessellation: options.tessellation ?? 10,
      },
      this.scene,
    );
    mesh.position.set(center.x, center.y, center.z);
    if (options.axis === 'x') mesh.rotation.z = Math.PI / 2;
    mesh.convertToFlatShadedMesh();
    return this.add(swatch, mesh);
  }

  /** An invisible box the captain can't walk through. */
  collider(min: Vec3, max: Vec3): Mesh {
    const mesh = CreateBox(
      `collider-${this.colliders.length}`,
      { width: max.x - min.x, height: max.y - min.y, depth: max.z - min.z },
      this.scene,
    );
    mesh.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    mesh.checkCollisions = true;
    mesh.isVisible = false;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    this.colliders.push(mesh);
    return mesh;
  }

  /** Merges parts per colour, registers light sources with the glow layer. Returns draw-call meshes. */
  finish(glow: GlowLayer, options: { showColliders: boolean }): Mesh[] {
    const merged: Mesh[] = [];
    for (const [swatch, meshes] of this.parts) {
      const mesh = meshes.length === 1 ? meshes[0] : Mesh.MergeMeshes(meshes, true, true);
      if (!mesh) throw new Error(`Could not merge the ${swatch} parts`);
      mesh.name = `room-${swatch}`;
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      if (isGlowing(swatch)) glow.addIncludedOnlyMesh(mesh);
      merged.push(mesh);
    }
    this.parts.clear();

    if (options.showColliders) {
      const debugMaterial = new StandardMaterial('mat-debug-collider', this.scene);
      debugMaterial.emissiveColor = new Color3(0.2, 1, 0.5);
      debugMaterial.disableLighting = true;
      debugMaterial.wireframe = true;
      for (const collider of this.colliders) {
        collider.isVisible = true;
        collider.material = debugMaterial;
      }
    }
    return merged;
  }

  private add(swatch: Swatch, mesh: Mesh): Mesh {
    mesh.material = this.materials.get(swatch);
    const list = this.parts.get(swatch);
    if (list) list.push(mesh);
    else this.parts.set(swatch, [mesh]);
    return mesh;
  }
}
