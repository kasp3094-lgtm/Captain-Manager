import { FreeCamera, Mesh, Vector3, type Scene } from '../babylon';
import type { PlayerTuning } from '../../content/balance';
import type { PlayerInput } from './input';
import {
  ZERO,
  approach,
  clampPitch,
  radians,
  wishDirection,
  wrapAngle,
  type Vec2,
} from './movement';

/** Gap between the collision body and the deck, so small details on the deck never snag. */
const DECK_CLEARANCE = 0.05;

/**
 * The captain's body and eyes. Walks on the deck plane (decks are flat; ladders and lifts move
 * the captain between decks), slides along walls, and looks around with the mouse.
 */
export class PlayerController {
  readonly camera: FreeCamera;
  private readonly body: Mesh;
  private readonly step = new Vector3();
  private velocity: Vec2 = ZERO;
  private yaw = 0;
  private pitch = 0;
  private deckY = 0;

  constructor(
    scene: Scene,
    private readonly tuning: PlayerTuning,
    private readonly input: PlayerInput,
  ) {
    this.body = new Mesh('captain-body', scene);
    this.body.isPickable = false;
    this.body.ellipsoid = new Vector3(tuning.radius, tuning.bodyHeight / 2, tuning.radius);

    this.camera = new FreeCamera('captain-eyes', Vector3.Zero(), scene);
    this.camera.inputs.clear();
    this.camera.minZ = 0.05;
    this.camera.maxZ = 150;
    this.camera.fov = radians(tuning.fieldOfView);
    scene.activeCamera = this.camera;
  }

  /** Stands the captain at (x, z) on the deck at height deckY, facing yaw/pitch (radians). */
  placeAt(x: number, deckY: number, z: number, yaw: number, pitch: number): void {
    this.deckY = deckY;
    this.body.position.set(x, this.bodyCentreY(), z);
    this.yaw = wrapAngle(yaw);
    this.pitch = clampPitch(pitch);
    this.velocity = ZERO;
    this.syncCamera();
  }

  update(dt: number): void {
    const look = this.input.takeMouseDelta();
    this.yaw = wrapAngle(this.yaw + look.dx * this.tuning.mouseSensitivity);
    this.pitch = clampPitch(this.pitch + look.dy * this.tuning.mouseSensitivity);

    const keys = this.input.moveKeys();
    const direction = wishDirection(keys, this.yaw);
    const speed = this.tuning.walkSpeed * (keys.run ? this.tuning.runMultiplier : 1);
    const target = { x: direction.x * speed, z: direction.z * speed };
    this.velocity = approach(this.velocity, target, this.tuning.acceleration, dt);

    if (this.velocity !== ZERO) {
      this.step.set(this.velocity.x * dt, 0, this.velocity.z * dt);
      this.body.moveWithCollisions(this.step);
      // Collisions may nudge the body up or down; decks are flat, so pin it to the deck.
      this.body.position.y = this.bodyCentreY();
    }
    this.syncCamera();
  }

  /** Where the captain's feet are. */
  get feet(): { x: number; y: number; z: number } {
    return { x: this.body.position.x, y: this.deckY, z: this.body.position.z };
  }

  /** Facing in radians. */
  get facing(): { yaw: number; pitch: number } {
    return { yaw: this.yaw, pitch: this.pitch };
  }

  private bodyCentreY(): number {
    return this.deckY + this.tuning.bodyHeight / 2 + DECK_CLEARANCE;
  }

  private syncCamera(): void {
    const position = this.body.position;
    this.camera.position.set(position.x, this.deckY + this.tuning.eyeHeight, position.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
