/**
 * The Game: owns the 3D engine and scene, runs the frame loop and switches between modes (start
 * screen, playing, paused, ship map). Each frame it moves the captain, renders the scene, and
 * tells the interface where the captain is on the deck plan.
 *
 * This is the one place where the 3D world (src/world), the content and rules (src/content,
 * src/sim) and the interface (src/ui) meet.
 */
import type { Balance } from './content/balance';
import type { Deck, Ship } from './content/ship';
import type { LaunchParams } from './debug/params';
import { Rng } from './sim/rng';
import { findRoom, nearestPoi, roomAt } from './sim/ship';
import { gameUi, playerPose, type GameControls, type GameMode } from './ui/state';
import { Engine, SceneInstrumentation, type Scene } from './world/babylon';
import { PlayerController } from './world/player/controller';
import { PlayerInput } from './world/player/input';
import { degrees, radians } from './world/player/movement';
import { createScene } from './world/scene';
import { TEST_ROOM_ID, buildTestRoom, type TestRoom } from './world/testRoom';

/** Read-only handle for end-to-end tests; exposed with `?debug` or `?autostart`. */
interface TestHook {
  /** The captain's feet in the test compartment's own coordinates. */
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

/** How often the debug panel's figures refresh. */
const DEBUG_REFRESH_MS = 250;
/** A point of interest this close (metres) shows on the minimap as nearby. */
const NEARBY_POI_RANGE = 3;
/** Frames to render after the scene reports ready, so screenshots never catch a half-built frame. */
const SETTLE_FRAMES = 3;

export class Game implements GameControls {
  /** This run's random numbers. Nothing draws on them yet; events (M2) and the crew (M3) will. */
  readonly rng: Rng;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly input: PlayerInput;
  private readonly player: PlayerController;
  /** The only room built in 3D so far, and the deck it is on. */
  private readonly testRoom: TestRoom;
  private readonly deck: Deck;
  private readonly instrumentation: SceneInstrumentation | null;
  private frames = 0;
  private sceneReadyAtFrame: number | null = null;
  private ready = false;
  private lastDebugRefresh = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly params: LaunchParams,
    balance: Balance,
    ship: Ship,
  ) {
    this.engine = new Engine(canvas, true, { stencil: true }, false);
    // Cap the resolution on high-DPI screens: sharper isn't worth the frame rate.
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

    const { scene, glow } = createScene(this.engine);
    this.scene = scene;

    const plan = findRoom(ship, TEST_ROOM_ID);
    if (!plan)
      throw new Error(`The deck plans have no room "${TEST_ROOM_ID}" for the test compartment`);
    this.deck = plan.deck;
    this.testRoom = buildTestRoom(scene, glow, plan.room, {
      showColliders: params.debugFlags.has('colliders'),
    });
    this.instrumentation = params.debug ? new SceneInstrumentation(scene) : null;

    this.input = new PlayerInput(canvas);
    this.player = new PlayerController(scene, balance.player, this.input);
    const bookmarks = this.testRoom.bookmarks;
    const bookmark = bookmarks[params.cam ?? 'spawn'] ?? bookmarks['spawn'];
    if (bookmark) {
      this.player.placeAt(
        bookmark.x,
        0,
        bookmark.z,
        radians(bookmark.yaw),
        radians(bookmark.pitch),
      );
    }

    const seed = params.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rng = Rng.fromSeed(seed);
    gameUi.set({ seed, builtRooms: [TEST_ROOM_ID] });
    this.reportWhereabouts();

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

  readonly toggleMap = (): void => {
    const mode = gameUi.get().mode;
    if (mode === 'map') {
      this.requestPlay();
    } else if (mode === 'playing') {
      // Set the mode first, so leaving pointer lock doesn't count as pausing.
      this.setMode('map');
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
  };

  private readonly frame = (): void => {
    // Clamped, so a stalled frame slows the game down instead of teleporting the captain.
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    if (gameUi.get().mode === 'playing') {
      this.player.update(dt);
      this.reportWhereabouts();
    }
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
    if (this.params.debug && now - this.lastDebugRefresh > DEBUG_REFRESH_MS) {
      this.lastDebugRefresh = now;
      gameUi.set({
        fps: Math.round(this.engine.getFps()),
        drawCalls: this.instrumentation?.drawCallsCounter.current ?? 0,
      });
    }
  };

  /** Tells the interface where the captain is on the plan, which room that is, and what's near. */
  private reportWhereabouts(): void {
    const feet = this.player.feet;
    const { x, y } = this.testRoom.toPlan(feet.x, feet.z);
    const yawDegrees = degrees(this.player.facing.yaw);
    const pose = playerPose.get();
    if (
      pose.x !== x ||
      pose.y !== y ||
      pose.yawDegrees !== yawDegrees ||
      pose.deck !== this.deck.deck
    ) {
      playerPose.set({ deck: this.deck.deck, x, y, yawDegrees });
    }

    const ui = gameUi.get();
    const room = roomAt(this.deck, x, y);
    if (room?.id !== ui.room?.id) {
      gameUi.set({
        room: room && { id: room.id, code: room.code, name: room.name, deck: this.deck.deck },
      });
    }

    const hit = nearestPoi(this.deck, x, y, NEARBY_POI_RANGE);
    const nearby = hit && {
      name: hit.poi.name,
      kind: hit.poi.kind,
      distance: Math.round(hit.distance * 10) / 10,
    };
    if (nearby?.name !== ui.nearbyPoi?.name || nearby?.distance !== ui.nearbyPoi?.distance) {
      gameUi.set({ nearbyPoi: nearby });
    }
  }

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
    const mode = gameUi.get().mode;
    if (event.code === 'KeyM' && !event.repeat && (mode === 'playing' || mode === 'map')) {
      this.toggleMap();
      return;
    }
    if (event.code !== 'Escape' && event.code !== 'KeyP') return;
    if (mode === 'map') {
      this.setMode('paused');
    } else if (mode === 'playing') {
      // While the pointer is locked the browser handles Esc itself and we get pointerlockchange.
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
      else this.setMode('paused');
    }
  };

  private readonly onCanvasClick = (): void => {
    if (gameUi.get().mode === 'playing') this.lockPointer();
  };

  private readonly onResize = (): void => {
    this.engine.resize();
  };
}
