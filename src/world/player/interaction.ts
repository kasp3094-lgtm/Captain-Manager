/**
 * What the captain can use: casts a ray from the eyes along the view, up to REACH metres, and
 * returns the first interactable it meets, unless something solid is in the way first.
 * Interactables and colliders are tagged by build.ts (MeshTag).
 */
import { Ray, Vector3, type AbstractMesh, type Scene } from '../babylon';
import type { MeshTag } from '../ship/build';
import type { InteractAction } from '../ship/layout';

/** How far the captain can reach, in metres. */
export const REACH = 2.5;

export interface InteractTarget {
  readonly id: string;
  readonly label: string;
  readonly action: InteractAction;
}

export class Interaction {
  private readonly ray = new Ray(Vector3.Zero(), new Vector3(0, 0, 1), REACH);

  constructor(private readonly scene: Scene) {}

  /** The interactable straight ahead of the eyes at `eye`, looking along yaw and pitch (radians). */
  look(
    eye: { x: number; y: number; z: number },
    yaw: number,
    pitch: number,
  ): InteractTarget | null {
    this.ray.origin.set(eye.x, eye.y, eye.z);
    // Positive pitch looks down (see movement.ts).
    this.ray.direction.set(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
    this.ray.length = REACH;
    const hit = this.scene.pickWithRay(this.ray, isTagged);
    const tag = hit?.pickedMesh?.metadata as MeshTag | undefined;
    return tag?.interactable ?? null;
  }
}

function isTagged(mesh: AbstractMesh): boolean {
  const tag = mesh.metadata as MeshTag | null;
  return mesh.isEnabled() && Boolean(tag && (tag.interactable || tag.blocksPicks));
}
