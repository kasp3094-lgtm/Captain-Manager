/** Keyboard and mouse input for the captain, read by the PlayerController each frame. */
import type { MoveKeys } from './movement';

const MOVE_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);

/** Largest mouse movement accepted from a single event; filters pointer-lock spikes. */
const MAX_MOUSE_STEP = 250;

/**
 * Keyboard and mouse state for the captain. Keys are read by physical position (KeyboardEvent.code),
 * so WASD works on any keyboard layout. Mouse look only counts while the pointer is locked.
 */
export class PlayerInput {
  private readonly held = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private enabled = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('mousemove', this.onMouseMove);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  moveKeys(): MoveKeys {
    const held = this.held;
    return {
      forward: held.has('KeyW') || held.has('ArrowUp'),
      back: held.has('KeyS') || held.has('ArrowDown'),
      left: held.has('KeyA') || held.has('ArrowLeft'),
      right: held.has('KeyD') || held.has('ArrowRight'),
      run: held.has('ShiftLeft') || held.has('ShiftRight'),
    };
  }

  /** Mouse movement since the last call, in pixels. */
  takeMouseDelta(): { dx: number; dy: number } {
    const delta = { dx: this.mouseX, dy: this.mouseY };
    this.mouseX = 0;
    this.mouseY = 0;
    return delta;
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || !MOVE_CODES.has(event.code)) return;
    this.held.add(event.code);
    event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.enabled || document.pointerLockElement !== this.canvas) return;
    this.mouseX += Math.max(-MAX_MOUSE_STEP, Math.min(MAX_MOUSE_STEP, event.movementX));
    this.mouseY += Math.max(-MAX_MOUSE_STEP, Math.min(MAX_MOUSE_STEP, event.movementY));
  };

  private readonly clear = (): void => {
    this.held.clear();
    this.mouseX = 0;
    this.mouseY = 0;
  };
}
