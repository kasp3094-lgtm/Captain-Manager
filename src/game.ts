import { Engine, SceneInstrumentation, type Scene } from './world/babylon';
import type { Balance } from './content/balance';
import type { LaunchParams } from './debug/params';
import { Rng } from './sim/rng';
import { gameUi, type GameControls, type GameMode } from './ui/state';
import { PlayerController } from './world/player/controller';
import { PlayerInput } from './world/player/input';
import { degrees, radians } from './world/player/movement';
import { createScene } from './world/scene';
import { buildTestRoom, type Room } from './world/testRoom';

/** Read-only handle for end-to-end tests; exposed with `?debug` or `?autostart`. */
export interface TestHook {
  feet(): { x: number; y: number; z: number };
  /** Radians. */
  facing(): { yaw: number; pitch: number };
  frames(): number;
  mode(): GameMode;
}

declare global {
  interface Window {
    __captain?: TestHook;
  }
}

const UI_REFRESH_MS = 250;
/** Frames to render after the scene reports ready, so screenshots never catch a half-built frame. */
const SETTLE_FRAMES = 3;

/** Owns the engine, the scene and the captain, and runs the frame loop. */
export class Game implements GameControls {
  readonly rng: Rng;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly input: PlayerInput;
  private readonly player: PlayerController;
  private readonly room: Room;
  private readonly instrumentation: SceneInstrumentation | null;
  private frames = 0;
  private sceneReadyAtFrame: number | null = null;
  private ready = false;
  private lastUiRefresh = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly params: LaunchParams,
    balance: Balance,
  ) {
    this.engine = new Engine(canvas, true, { stencil: true }, false);
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

    const { scene, glow } = createScene(this.engine);
    this.scene = scene;
    this.room = buildTestRoom(scene, glow, { showColliders: params.debugFlags.has('colliders') });
    this.instrumentation = params.debug ? new SceneInstrumentation(scene) : null;

    this.input = new PlayerInput(canvas);
    this.player = new PlayerController(scene, balance.player, this.input);
    const bookmark = this.room.bookmarks[params.cam ?? 'spawn'] ?? this.room.bookmarks['spawn'];
    if (bookmark) {
      this.player.placeAt(
        bookmark.x,
        this.room.deckY,
        bookmark.z,
        radians(bookmark.yaw),
        radians(bookmark.pitch),
      );
    }

    const seed = params.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rng = Rng.fromSeed(seed);
    gameUi.set({ room: { code: this.room.code, name: this.room.name }, seed });

    scene.executeWhenReady(() => {
      this.sceneReadyAtFrame = this.frames;
    });
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('click', this.onCanvasClick);

    if (params.debug || params.autostart) {
      window.__captain = {
        feet: () => this.player.feet,
        facing: () => this.player.facing,
        frames: () => this.frames,
        mode: () => gameUi.get().mode,
      };
    }
  }

  start(): void {
    this.engine.runRenderLoop(this.frame);
  }

  readonly requestPlay = (): void => {
    if (!this.ready) return;
    this.setMode('playing');
    this.lockPointer();
    this.canvas.focus();
  };

  private readonly frame = (): void => {
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    if (gameUi.get().mode === 'playing') this.player.update(dt);
    this.scene.render();
    this.frames++;

    if (
      !this.ready &&
      this.sceneReadyAtFrame !== null &&
      this.frames - this.sceneReadyAtFrame >= SETTLE_FRAMES
    ) {
      this.markReady();
    }

    const now = performance.now();
    if (now - this.lastUiRefresh > UI_REFRESH_MS) {
      this.lastUiRefresh = now;
      gameUi.set({
        fps: Math.round(this.engine.getFps()),
        feet: this.player.feet,
        yawDegrees: degrees(this.player.facing.yaw),
        drawCalls: this.instrumentation?.drawCallsCounter.current ?? 0,
      });
    }
  };

  private markReady(): void {
    this.ready = true;
    document.body.dataset['ready'] = 'true';
    this.setMode(this.params.autostart ? 'playing' : 'start');
  }

  private setMode(mode: GameMode): void {
    gameUi.set({ mode });
    this.input.setEnabled(mode === 'playing');
  }

  private lockPointer(): void {
    if (document.pointerLockElement === this.canvas) return;
    try {
      // Can be refused (e.g. just after leaving pointer lock); the keyboard still works and a
      // click on the view tries again.
      Promise.resolve(this.canvas.requestPointerLock()).catch(() => undefined);
    } catch {
      // Older browsers throw instead of rejecting; same fallback.
    }
  }

  private readonly onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    gameUi.set({ pointerLocked: locked });
    if (locked) this.setMode('playing');
    else if (gameUi.get().mode === 'playing') this.setMode('paused');
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape' && event.code !== 'KeyP') return;
    if (gameUi.get().mode !== 'playing') return;
    // While the pointer is locked the browser handles Esc itself and we get pointerlockchange.
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    else this.setMode('paused');
  };

  private readonly onCanvasClick = (): void => {
    if (gameUi.get().mode === 'playing') this.lockPointer();
  };

  private readonly onResize = (): void => {
    this.engine.resize();
  };
}
