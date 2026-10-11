/**
 * The Game: owns the 3D engine and scene, runs the frame loop and switches between modes (start
 * screen, playing, paused, ship map, lift). Each frame it moves the captain, finds what they can
 * use, renders the scene, and tells the interface where the captain is on the deck plan.
 * Ladders and the lift move the captain between decks behind a short fade to black.
 *
 * This is the one place where the 3D world (src/world), the content and rules (src/content,
 * src/sim) and the interface (src/ui) meet.
 */
import type { Balance } from './content/balance';
import type { Deck, Ship } from './content/ship';
import type { LaunchParams } from './debug/params';
import { Rng } from './sim/rng';
import { nearestPoi, roomAt, shaftsOnDeck } from './sim/ship';
import { gameUi, playerPose, type GameControls, type GameMode } from './ui/state';
import { Engine, SceneInstrumentation, type Scene } from './world/babylon';
import { PlayerController } from './world/player/controller';
import { PlayerInput } from './world/player/input';
import { Interaction, type InteractTarget } from './world/player/interaction';
import { degrees, radians } from './world/player/movement';
import { createScene } from './world/scene';
import { buildShip, type ShipWorld } from './world/ship/build';
import { facingYaw, yawTowards } from './world/ship/coords';
import { planShip, type Bookmark, type ShipLayout } from './world/ship/layout';

/** Read-only handle (plus a few moves) for end-to-end tests; exposed with `?debug` or `?autostart`. */
interface TestHook {
  /** Where the captain stands on the plan, and which way they look (degrees). */
  pose(): { deck: number; x: number; y: number; yaw: number; pitch: number };
  /** Turns to look at a point on the plan of the current deck; pitch in degrees, down positive. */
  face(x: number, y: number, pitch?: number): void;
  /** Jumps to a viewpoint: a room id, `<shaft>-deck<N>` or `spawn`. False if there is none. */
  goTo(bookmark: string): boolean;
  /** Stands the captain at a point on the plan of a deck, looking along `yaw` (degrees). */
  place(deck: number, x: number, y: number, yaw: number): void;
  /** Every viewpoint's name. */
  bookmarks(): string[];
  /** What pressing E would do now, if anything. */
  prompt(): string | null;
  /** The things to use on the current deck, with their centres on the plan. */
  interactables(): { label: string; x: number; y: number; height: number }[];
  /** True once everything on screen has its shaders and textures (after a deck change, too). */
  ready(): boolean;
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
/** The fade to black before changing decks; the view then fades back in while you walk on. */
const FADE_MS = 250;

interface Trip {
  /** When the screen is black and the captain can be moved. */
  readonly until: number;
  readonly arrive: () => void;
}

export class Game implements GameControls {
  /** This run's random numbers. Nothing draws on them yet; events (M2) and the crew (M3) will. */
  readonly rng: Rng;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly input: PlayerInput;
  private readonly player: PlayerController;
  private readonly interaction: Interaction;
  private readonly layout: ShipLayout;
  private readonly world: ShipWorld;
  private readonly instrumentation: SceneInstrumentation | null;
  /** The deck the captain is on. */
  private deck: Deck;
  private target: InteractTarget | null = null;
  private trip: Trip | null = null;
  private frames = 0;
  private sceneReadyAtFrame: number | null = null;
  private ready = false;
  private lastDebugRefresh = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly params: LaunchParams,
    balance: Balance,
    private readonly ship: Ship,
  ) {
    this.engine = new Engine(canvas, true, { stencil: true }, false);
    // Cap the resolution on high-DPI screens: sharper isn't worth the frame rate.
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 1.5));

    const { scene, glow } = createScene(this.engine);
    this.scene = scene;
    this.layout = planShip(ship);
    for (const problem of this.layout.problems) console.warn(`Ship layout: ${problem}`);
    this.world = buildShip(scene, glow, this.layout, {
      showColliders: params.debugFlags.has('colliders'),
    });
    this.instrumentation = params.debug ? new SceneInstrumentation(scene) : null;

    this.input = new PlayerInput(canvas);
    this.player = new PlayerController(scene, balance.player, this.input);
    this.interaction = new Interaction(scene);
    const start =
      this.layout.bookmarks.get(params.cam ?? 'spawn') ?? this.layout.bookmarks.get('spawn');
    if (!start) throw new Error(`The ship has no viewpoint for its start room "${ship.startRoom}"`);
    this.deck = this.deckPlan(start.deck);
    this.standAt(start);

    const seed = params.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.rng = Rng.fromSeed(seed);
    gameUi.set({ seed });
    this.reportWhereabouts();

    scene.executeWhenReady(() => {
      this.sceneReadyAtFrame = this.frames;
    });
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('click', this.onCanvasClick);

    if (params.debug || params.autostart) window.__captain = this.testHook();
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

  readonly chooseDeck = (deck: number | null): void => {
    if (gameUi.get().mode !== 'lift') return;
    this.requestPlay();
    const lift = this.ship.shafts.find(
      (shaft) => shaft.type === 'lift' && shaft.decks.includes(this.deck.deck),
    );
    if (deck === null || deck === this.deck.deck || !lift?.decks.includes(deck)) return;
    this.travel(() => this.arriveBy(lift.id, deck));
  };

  private readonly frame = (): void => {
    // Clamped, so a stalled frame slows the game down instead of teleporting the captain.
    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);
    const now = performance.now();
    this.advanceTrip(now);
    if (gameUi.get().mode === 'playing' && !this.trip) {
      this.player.update(dt);
      this.reportWhereabouts();
      this.findTarget();
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

    if (this.params.debug && now - this.lastDebugRefresh > DEBUG_REFRESH_MS) {
      this.lastDebugRefresh = now;
      gameUi.set({
        fps: Math.round(this.engine.getFps()),
        drawCalls: this.instrumentation?.drawCallsCounter.current ?? 0,
      });
    }
  };

  // ---- Getting around -------------------------------------------------------------------

  private deckPlan(deck: number): Deck {
    const plan = this.ship.decks.find((candidate) => candidate.deck === deck);
    if (!plan) throw new Error(`The ship has no deck ${deck}`);
    return plan;
  }

  /** Puts the captain at a viewpoint, switching decks if need be. */
  private standAt(mark: Bookmark): void {
    this.deck = this.deckPlan(mark.deck);
    this.world.show(mark.deck);
    this.player.placeAt(
      mark.x,
      this.world.floorY(mark.deck),
      -mark.y,
      radians(mark.yaw),
      radians(mark.pitch),
    );
    this.target = null;
    gameUi.set({ prompt: null });
  }

  /** Arrives on `deck` by ladder or lift: just inside the shaft, facing the way out. */
  private arriveBy(shaftId: string, deck: number): void {
    const layout = this.layout.decks.find((candidate) => candidate.deck.deck === deck);
    const stop = layout?.shafts.find((candidate) => candidate.shaft.id === shaftId);
    const space = layout?.spaces.find((candidate) => candidate.id === shaftId);
    const opening = space?.openings.find((candidate) => candidate.kind === 'shaft');
    if (!stop || !opening) return;
    const [x, y] = stop.landing;
    this.standAt({ deck, x, y, yaw: facingYaw(opening.side), pitch: 0 });
    this.reportWhereabouts();
  }

  /** Fades to black, then runs `arrive` and fades back in. Movement is frozen until then. */
  private travel(arrive: () => void): void {
    if (this.trip) return;
    this.trip = { until: performance.now() + FADE_MS, arrive };
    gameUi.set({ fading: true, prompt: null });
    this.input.setEnabled(false);
  }

  private advanceTrip(now: number): void {
    const trip = this.trip;
    if (!trip || now < trip.until) return;
    trip.arrive();
    this.trip = null;
    gameUi.set({ fading: false });
    this.input.setEnabled(gameUi.get().mode === 'playing');
  }

  /** Uses whatever the captain is looking at. */
  private use(target: InteractTarget): void {
    const action = target.action;
    if (action.kind === 'ladder') {
      this.travel(() => this.arriveBy(action.shaft, action.toDeck));
    } else {
      this.setMode('lift');
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }
  }

  private findTarget(): void {
    const { yaw, pitch } = this.player.facing;
    const target = this.interaction.look(this.player.eye, yaw, pitch);
    if (target?.id !== this.target?.id) {
      this.target = target;
      gameUi.set({ prompt: target?.label ?? null });
    }
  }

  /** Tells the interface where the captain is on the plan, which room that is, and what's near. */
  private reportWhereabouts(): void {
    const feet = this.player.feet;
    const x = feet.x;
    const y = -feet.z;
    const yawDegrees = degrees(this.player.facing.yaw);
    const deck = this.deck.deck;
    const pose = playerPose.get();
    if (pose.x !== x || pose.y !== y || pose.yawDegrees !== yawDegrees || pose.deck !== deck) {
      playerPose.set({ deck, x, y, yawDegrees });
    }

    const ui = gameUi.get();
    const room = roomAt(this.deck, x, y);
    const shaft = room
      ? null
      : shaftsOnDeck(this.ship, deck).find(
          ({ rect: [sx, sy, w, d] }) => x >= sx && x <= sx + w && y >= sy && y <= sy + d,
        );
    const here = room
      ? { id: room.id, code: room.code, name: room.name, deck }
      : shaft
        ? { id: shaft.id, code: '', name: shaft.name, deck }
        : null;
    if (here?.id !== ui.room?.id || here?.deck !== ui.room?.deck) gameUi.set({ room: here });

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

  // ---- Modes and input ------------------------------------------------------------------

  private markReady(): void {
    this.ready = true;
    document.body.dataset['ready'] = 'true';
    this.setMode(this.params.autostart ? 'playing' : 'start');
  }

  private setMode(mode: GameMode): void {
    gameUi.set({ mode });
    this.input.setEnabled(mode === 'playing' && !this.trip);
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
    if (mode === 'lift') {
      const digit = /^Digit(\d)$/.exec(event.code);
      if (digit) this.chooseDeck(Number(digit[1]));
      else if (event.code === 'Escape') this.chooseDeck(null);
      return;
    }
    if (event.code === 'KeyE' && !event.repeat && mode === 'playing' && this.target && !this.trip) {
      this.use(this.target);
      return;
    }
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

  private testHook(): TestHook {
    return {
      pose: () => {
        const { x, z } = this.player.feet;
        const { yaw, pitch } = this.player.facing;
        return { deck: this.deck.deck, x, y: -z, yaw: degrees(yaw), pitch: degrees(pitch) };
      },
      face: (x, y, pitch = 0) => {
        const feet = this.player.feet;
        this.player.face(radians(yawTowards(x - feet.x, y + feet.z)), radians(pitch));
        this.findTarget();
      },
      goTo: (name) => {
        const mark = this.layout.bookmarks.get(name);
        if (!mark) return false;
        this.standAt(mark);
        this.reportWhereabouts();
        return true;
      },
      place: (deck, x, y, yaw) => {
        this.standAt({ deck, x, y, yaw, pitch: 0 });
        this.reportWhereabouts();
      },
      bookmarks: () => [...this.layout.bookmarks.keys()],
      prompt: () => gameUi.get().prompt,
      interactables: () => {
        const layout = this.layout.decks.find(
          (candidate) => candidate.deck.deck === this.deck.deck,
        );
        return (layout?.interactables ?? []).map((thing) => ({
          label: thing.label,
          x: (thing.area.x0 + thing.area.x1) / 2,
          y: (thing.area.y0 + thing.area.y1) / 2,
          height: (thing.bottom + thing.top) / 2,
        }));
      },
      ready: () => this.scene.isReady(),
      frames: () => this.frames,
      mode: () => gameUi.get().mode,
    };
  }
}
