/**
 * The Game: owns the 3D engine and scene, runs the frame loop and switches between modes (start
 * screen, playing, paused, ship map, lift). Each frame it moves the captain, runs ship's time and
 * the crew's day, finds what the captain can use, plays the crew's walk-by dialog, renders the
 * scene, and tells the interface where the captain is and what's being said.
 * Ladders and the lift move the captain between decks behind a short fade to black.
 * It saves the game into the browser's save slots and loads it back in place: every morning, after
 * each event, on pausing and on leaving the page (the autosave), and when the player asks.
 *
 * This is the one place where the 3D world (src/world), the content and rules (src/content,
 * src/sim) and the interface (src/ui) meet.
 */
import type { Balance } from './content/balance';
import { minutes, type CrewContent } from './content/crew';
import { EventPlayer } from './eventPlayer';
import type { Deck, Ship } from './content/ship';
import type { LaunchParams } from './debug/params';
import { listSlots, readSlot, slotName, writeSlot, type SlotId } from './saveSlots';
import { ShipClock } from './sim/clock';
import { Command } from './sim/command';
import { buildRoster, type CrewMember } from './sim/crew';
import { spokenShipName, type DialogEntry } from './sim/dialog';
import type { GameEvent } from './sim/events';
import { Rng } from './sim/rng';
import { applySave, takeSave, type SaveFile, type SaveParts } from './sim/save';
import { DAY, clock } from './sim/schedule';
import { findRoom, nearestPoi, roomAt, shaftsOnDeck } from './sim/ship';
import {
  eventUi,
  gameUi,
  playerPose,
  savesUi,
  speech,
  type GameControls,
  type GameMode,
} from './ui/state';
import {
  Engine,
  Matrix,
  Ray,
  SceneInstrumentation,
  Vector3,
  type AbstractMesh,
  type Scene,
} from './world/babylon';
import { Chatter, type CaptainView } from './world/crew/chatter';
import { Crowd } from './world/crew/crowd';
import { CrewLife, crewMap, type CrewView } from './world/crew/life';
import { PlayerController } from './world/player/controller';
import { PlayerInput } from './world/player/input';
import { Interaction, type InteractTarget } from './world/player/interaction';
import { degrees, radians } from './world/player/movement';
import { createScene } from './world/scene';
import { buildShip, type MeshTag, type ShipWorld } from './world/ship/build';
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
  /** Ship's time, "HH:MM". */
  time(): string;
  /** Every crew member: where they are and what they're doing. */
  crew(): {
    id: string;
    name: string;
    deck: number;
    x: number;
    y: number;
    /** Degrees, as pose()'s. */
    yaw: number;
    pose: string;
    activity: string;
    space: string | null;
    settled: boolean;
    visible: boolean;
  }[];
  /** The line being said, if any. */
  speech(): { name: string; text: string; onScreen: boolean } | null;
  /** The command meters, relations by character id, and story flags. */
  command(): {
    budget: number;
    readiness: number;
    crew: number;
    highCommand: number;
    fatigue: number;
    relations: Record<string, number>;
    flags: string[];
  };
  /** The event under way, if any, and every event already done. */
  event(): { id: string; status: string; room: string } | null;
  eventsDone(): string[];
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
/** Speech bubbles sit this far above the speaker's feet (metres): 2 standing, less otherwise. */
const BUBBLE_HEIGHT: Record<string, number> = { sit: 1.55, eat: 1.55, lie: 0.6 };
/** A bubble is fully opaque up to `near` metres away, and half faded by `far`. */
const BUBBLE_FADE = { near: 5, far: 15 };

/** Everything the game is made from (src/content/gameContent.ts). */
export interface GameContent {
  readonly balance: Balance;
  readonly ship: Ship;
  readonly crew: CrewContent;
  readonly dialog: readonly DialogEntry[];
  readonly events: readonly GameEvent[];
}

interface Trip {
  /** When the screen is black and the captain can be moved. */
  readonly until: number;
  readonly arrive: () => void;
}

export class Game implements GameControls {
  /** This run's random numbers: the crew's choices and the dialog draw on them; events (M2) will. */
  readonly rng: Rng;
  private readonly seed: number;
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly input: PlayerInput;
  private readonly player: PlayerController;
  private readonly interaction: Interaction;
  private readonly layout: ShipLayout;
  private readonly world: ShipWorld;
  private readonly instrumentation: SceneInstrumentation | null;
  private readonly clock: ShipClock;
  private readonly life: CrewLife;
  private readonly crowd: Crowd;
  private readonly chatter: Chatter;
  private readonly command: Command;
  private readonly events: EventPlayer;
  private readonly timeScale: number;
  private readonly sightLine = new Ray(Vector3.Zero(), new Vector3(0, 0, 1), 1);
  /** The deck the captain is on. */
  private deck: Deck;
  private target: InteractTarget | null = null;
  private trip: Trip | null = null;
  private frames = 0;
  private sceneReadyAtFrame: number | null = null;
  private ready = false;
  private lastDebugRefresh = 0;
  private shownMinute = -1;
  private readonly ship: Ship;
  /** The room the captain is in (a room id from the deck plans), or null in a shaft. */
  private roomId: string | null = null;
  /** The player has taken command (or loaded a game): from now on there is a game to save. */
  private started = false;
  /** The morning autosave: its time of day (minutes), the mornings so far, and one waiting. */
  private readonly autosaveAt: number;
  private mornings: number;
  private autosaveDue = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly params: LaunchParams,
    content: GameContent,
  ) {
    const { balance, ship, crew } = content;
    this.ship = ship;
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
    this.seed = seed;
    this.rng = Rng.fromSeed(seed);
    gameUi.set({ seed });

    // Ship's time and the crew, going about their day from the moment the game starts.
    this.timeScale = params.timeScale;
    this.clock = new ShipClock(
      { day: 0, minute: params.time ?? minutes(balance.time.start) },
      balance.time.minutesPerSecond * this.timeScale,
    );
    const roster = buildRoster(crew, ship);
    for (const problem of roster.problems) console.warn(`Crew: ${problem}`);
    this.life = new CrewLife(
      crewMap(this.layout),
      roster.members,
      crew.routine,
      { ...balance.crew, minutesPerSecond: balance.time.minutesPerSecond },
      this.clock.total,
      this.rng.nextUint32() | 0,
    );
    const narrow = new Set(
      [...ship.decks.flatMap((deck) => deck.rooms.filter((room) => room.type === 'passage'))]
        .map((room) => room.id)
        .concat(ship.shafts.map((shaft) => shaft.id)),
    );
    this.crowd = new Crowd(scene, this.world, this.life.people, narrow);
    const characters = new Map<string, CrewMember>(
      roster.members.filter((member) => member.named).map((member) => [member.id, member]),
    );
    this.chatter = new Chatter(
      content.dialog,
      this.life,
      { captain: 'Captain', ship: spokenShipName(ship.name), characters },
      (id) => findRoom(ship, id)?.room.type ?? null,
      this.rng.nextUint32() | 0,
      params.dialog,
    );
    // The captain's standing, and the events that put it to the test.
    this.command = new Command(
      balance.command,
      crew.characters.characters.map((character) => character.id),
    );
    this.events = new EventPlayer(
      content.events,
      this.command,
      this.life,
      ship,
      roster.members,
      spokenShipName(ship.name),
      {
        setMode: (mode) => (mode === 'event' ? this.enterEvent() : this.requestPlay()),
        finished: () => this.autosave(),
      },
    );
    this.autosaveAt = minutes(balance.time.autosave);
    this.mornings = this.morningsBy(this.clock.total);
    this.refreshSlots();
    this.reportWhereabouts();
    this.reportTime();

    scene.executeWhenReady(() => {
      this.sceneReadyAtFrame = this.frames;
    });
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('pagehide', this.onPageHide);
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
    const playing = gameUi.get().mode === 'playing';
    if (playing && !this.trip) {
      this.player.update(dt);
      this.reportWhereabouts();
    }
    // Ship's time runs while you play, through trips between decks too.
    if (playing && this.timeScale > 0) {
      this.clock.advance(dt);
      this.life.update(dt * this.timeScale, this.clock.total, this.captainView());
      this.reportTime();
      const mornings = this.morningsBy(this.clock.total);
      if (mornings !== this.mornings) {
        this.mornings = mornings;
        this.autosaveDue = true;
      }
    }
    if (playing) this.chatter.update(dt, this.captainView(), this.clock.minute);
    if (playing && !this.trip) this.events.update(this.clock.day, this.clock.minute, this.roomId);
    if (playing && this.autosaveDue && this.canSave()) {
      this.autosaveDue = false;
      this.autosave();
    }
    this.crowd.update(this.deck.deck, this.life.seconds, this.captainView());
    if (playing && !this.trip) this.findTarget();
    this.placeSpeech();
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

  readonly continueEvent = (): void => {
    if (gameUi.get().mode === 'event') this.events.continue();
  };

  readonly chooseOption = (index: number): void => {
    if (gameUi.get().mode === 'event') this.events.choose(index);
  };

  readonly closeOutcome = (): void => {
    if (gameUi.get().mode === 'event') this.events.closeOutcome();
  };

  // ---- Saving and loading ---------------------------------------------------------------

  readonly saveGame = (slot: SlotId): string => {
    if (!this.canSave()) return "Can't save in the middle of a scene.";
    return this.writeSave(slot)
      ? `Saved in ${slotName(slot).toLowerCase()}.`
      : "Couldn't save: this browser isn't keeping anything for this site.";
  };

  readonly loadGame = (slot: SlotId): string | null => {
    if (!this.ready) return 'The ship is still loading.';
    const { save, problem } = readSlot(slot);
    if (!save) {
      return `${slotName(slot)} ${problem ? `can't be loaded: ${problem}` : 'is empty'}.`;
    }
    this.restore(save);
    this.requestPlay();
    return null;
  };

  /** There's a game to save, and not in the middle of a scene. */
  private canSave(): boolean {
    return this.started && gameUi.get().mode !== 'event' && !this.events.director.inScene;
  }

  private autosave(): void {
    if (this.canSave()) this.writeSave('auto');
  }

  /** Writes the game as it stands into a slot; false if the browser won't keep it. */
  private writeSave(slot: SlotId): boolean {
    const { x, z } = this.player.feet;
    const { yaw, pitch } = this.player.facing;
    const room = gameUi.get().room;
    const save = takeSave(this.saveParts(), {
      savedAt: new Date(),
      place: room ? `${room.name}, deck ${room.deck}` : `Deck ${this.deck.deck}`,
      seed: this.seed,
      captain: { deck: this.deck.deck, x, y: -z, yaw: degrees(yaw), pitch: degrees(pitch) },
    });
    const saved = writeSlot(slot, save);
    this.refreshSlots();
    return saved;
  }

  /**
   * Puts a saved game back in place: ship's time, the command state and the events; the crew
   * where their day has them then (and whoever an event is keeping somewhere); the captain where
   * they stood, or at the start if the ship has changed so that's no longer on board.
   */
  private restore(save: SaveFile): void {
    applySave(save, this.saveParts());
    this.life.restart(this.clock.total, this.events.director.active?.summoned);
    this.chatter.hush();
    this.events.restored();
    this.trip = null;
    gameUi.set({ fading: false });
    const { deck, x, y } = save.captain;
    const plan = this.ship.decks.find((candidate) => candidate.deck === deck);
    const aboard = plan && (roomAt(plan, x, y) !== null || this.shaftAt(deck, x, y) !== undefined);
    this.standAt(aboard ? save.captain : this.layout.bookmarks.get('spawn')!);
    this.reportWhereabouts();
    this.shownMinute = -1;
    this.reportTime();
    this.mornings = this.morningsBy(this.clock.total);
    this.autosaveDue = false;
  }

  private saveParts(): SaveParts {
    return { clock: this.clock, command: this.command, events: this.events.director };
  }

  private refreshSlots(): void {
    savesUi.set({ slots: listSlots() });
  }

  /** Counts the autosave mornings up to a ship time (total minutes): goes up by one each morning. */
  private morningsBy(total: number): number {
    return Math.floor((total - this.autosaveAt) / DAY);
  }

  /** Opens the dialogue panel: the pointer is let go so choices can be clicked. */
  private enterEvent(): void {
    this.setMode('event');
    gameUi.set({ prompt: null });
    this.target = null;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

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
    switch (action.kind) {
      case 'ladder':
        this.travel(() => this.arriveBy(action.shaft, action.toDeck));
        break;
      case 'lift':
        this.setMode('lift');
        if (document.pointerLockElement === this.canvas) document.exitPointerLock();
        break;
      case 'talk':
        this.chatter.talkTo(action.crew, this.captainView(), this.clock.minute);
        break;
    }
  }

  /** Where the captain stands on the plan and which way they look, for the crew. */
  private captainView(): CaptainView {
    const feet = this.player.feet;
    return { deck: this.deck.deck, x: feet.x, y: -feet.z, yaw: this.player.facing.yaw };
  }

  /** Ship's time for the interface, when the minute changes. */
  private reportTime(): void {
    const minute = Math.floor(this.clock.minute);
    if (minute === this.shownMinute) return;
    this.shownMinute = minute;
    gameUi.set({ time: clock(minute).replace(':', ''), day: this.clock.day });
  }

  /**
   * Puts what's being said over the speaker's head on screen, or makes it a subtitle when the
   * speaker is out of view or behind a wall.
   */
  private placeSpeech(): void {
    const line = this.chatter.current;
    if (!line) {
      if (speech.get().bubble) speech.set({ bubble: null });
      return;
    }
    const person = line.speaker;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const head = new Vector3(
      person.x,
      this.world.floorY(person.deck) + person.lift + (BUBBLE_HEIGHT[person.pose] ?? 2.0),
      -person.y,
    );
    const camera = this.player.camera;
    const at = Vector3.Project(
      head,
      Matrix.IdentityReadOnly,
      this.scene.getTransformMatrix(),
      camera.viewport.toGlobal(width, height),
    );
    const eye = this.player.eye;
    const distance = Math.hypot(head.x - eye.x, head.z - eye.z);
    const onScreen =
      person.deck === this.deck.deck &&
      at.z > 0 &&
      at.z < 1 &&
      at.x > 0 &&
      at.x < width &&
      at.y > 0 &&
      at.y < height &&
      this.inSight(eye, head);
    const fade = Math.min(
      1,
      Math.max(0, (distance - BUBBLE_FADE.near) / (BUBBLE_FADE.far - BUBBLE_FADE.near)),
    );
    const margin = Math.min(170, width / 2);
    speech.set({
      bubble: {
        key: line.key,
        name: line.name,
        text: line.text,
        toCaptain: line.toCaptain,
        x: onScreen ? Math.min(width - margin, Math.max(margin, at.x)) : null,
        y: onScreen ? Math.max(70, at.y) : null,
        opacity: 1 - fade * 0.5,
      },
    });
  }

  /** True when nothing solid stands between the captain's eyes and a point. */
  private inSight(eye: { x: number; y: number; z: number }, point: Vector3): boolean {
    const ray = this.sightLine;
    ray.origin.set(eye.x, eye.y, eye.z);
    point.subtractToRef(ray.origin, ray.direction);
    ray.length = ray.direction.length() - 0.3;
    ray.direction.normalize();
    const hit = this.scene.pickWithRay(ray, isSolid);
    return !hit?.hit;
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
    const shaft = room ? null : this.shaftAt(deck, x, y);
    const here = room
      ? { id: room.id, code: room.code, name: room.name, deck }
      : shaft
        ? { id: shaft.id, code: '', name: shaft.name, deck }
        : null;
    if (here?.id !== ui.room?.id || here?.deck !== ui.room?.deck) gameUi.set({ room: here });
    this.roomId = room?.id ?? null;

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

  /** The ladderwell or lift at a point on a deck, if any. */
  private shaftAt(deck: number, x: number, y: number) {
    return shaftsOnDeck(this.ship, deck).find(
      ({ rect: [sx, sy, w, d] }) => x >= sx && x <= sx + w && y >= sy && y <= sy + d,
    );
  }

  // ---- Modes and input ------------------------------------------------------------------

  private markReady(): void {
    this.ready = true;
    document.body.dataset['ready'] = 'true';
    this.setMode(this.params.autostart ? 'playing' : 'start');
    if (this.params.event && !this.events.force(this.params.event)) {
      console.warn(`?event=${this.params.event}: there is no such event`);
    }
  }

  private setMode(mode: GameMode): void {
    gameUi.set({ mode });
    this.input.setEnabled(mode === 'playing' && !this.trip);
    if (mode === 'playing') this.started = true;
    if (mode === 'paused') this.autosave();
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
    if (mode === 'event') {
      // Space or Enter goes on; a number picks that choice (as numbered in the panel).
      if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        if (!event.repeat) this.events.continue();
        return;
      }
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
      const choice = digit ? eventUi.get().choices?.[Number(digit[1]) - 1] : undefined;
      if (choice && !event.repeat) this.events.choose(choice.index);
      return;
    }
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

  /** Leaving the page (closing the tab, switching away): autosave, so nothing is lost. */
  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.autosave();
  };

  private readonly onPageHide = (): void => {
    this.autosave();
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
      time: () => this.clock.time,
      crew: () =>
        this.life.people.map((person: CrewView) => ({
          id: person.member.id,
          name: `${person.member.rank} ${person.member.family}`,
          deck: person.deck,
          x: person.x,
          y: person.y,
          yaw: degrees(person.yaw),
          pose: person.pose,
          activity: person.activity,
          space: person.space,
          settled: person.settled,
          visible: person.visible,
        })),
      speech: () => {
        const bubble = speech.get().bubble;
        return bubble && { name: bubble.name, text: bubble.text, onScreen: bubble.x !== null };
      },
      command: () => {
        const relations: Record<string, number> = {};
        for (const id of this.command.characters) relations[id] = this.command.value(`rel.${id}`);
        return {
          budget: this.command.value('budget'),
          readiness: this.command.value('readiness'),
          crew: this.command.value('crew'),
          highCommand: this.command.value('highCommand'),
          fatigue: this.command.value('fatigue'),
          relations,
          flags: [...this.command.flags],
        };
      },
      event: () => {
        const active = this.events.director.active;
        return active && { id: active.event.id, status: active.status, room: active.room };
      },
      eventsDone: () => [...this.events.director.finished],
    };
  }
}

/** Walls and furniture: what hides a speaker from view. */
function isSolid(mesh: AbstractMesh): boolean {
  const tag = mesh.metadata as MeshTag | null;
  return mesh.isEnabled() && Boolean(tag?.blocksPicks);
}
