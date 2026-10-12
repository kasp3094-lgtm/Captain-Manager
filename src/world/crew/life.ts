/**
 * The crew going about their day: who is where, walking where, doing what. Everyone follows
 * their plan of the day (src/sim/schedule.ts) by the ship's clock. They set off early enough to
 * arrive on time, walk the deck on the walk grid, take the ladder or the lift that suits their
 * trip (out of sight while they climb), and take a free spot when they get there: their post at
 * a console, a seat at a mess table, their own rack. Patrols and people at leisure move about a
 * room now and then, and everyone stops for the captain.
 *
 * Pure maths (no Babylon.js): the renderer (crowd.ts) draws what this says, and the unit tests
 * run whole days of it in Node.
 */
import type { Point } from '../../content/ship';
import { hash, type CrewMember } from '../../sim/crew';
import type { Routine } from '../../content/crew';
import { Rng } from '../../sim/rng';
import { DAY, blockAt, dayPlan, type Activity, type Block } from '../../sim/schedule';
import { centre } from '../ship/coords';
import type { DeckLayout, ShaftStop, ShipLayout } from '../ship/layout';
import { deckSpots, type Spot, type SpotUse } from '../ship/spots';
import { findPath, isFree, nearestFree, walkGrid, type WalkGrid } from '../ship/walkgrid';
import type { Pose } from './body';

/** Half a person's width, for the walk grid: they keep this far from walls and furniture. */
export const CREW_RADIUS = 0.25;

/** How the crew walk (balance.yaml `crew`) and how fast ship's time runs at normal speed. */
export interface LifeTuning {
  /** Metres per second. */
  readonly walkSpeed: number;
  /** Seconds to climb one deck. */
  readonly climbSeconds: number;
  /** Ship minutes per second at normal speed (balance.yaml `time.minutesPerSecond`). */
  readonly minutesPerSecond: number;
}

/** One deck as the crew get about it. */
export interface DeckPlace {
  readonly layout: DeckLayout;
  readonly grid: WalkGrid;
  readonly spots: readonly Spot[];
  /** Which space each walk-grid square is in (index into layout.spaces, -1 for none). */
  readonly spaceIndex: Int16Array;
}

/** The ship as the crew see it, worked out once from the layout. */
export interface CrewMap {
  readonly decks: ReadonlyMap<number, DeckPlace>;
  readonly spotsByRoom: ReadonlyMap<string, readonly Spot[]>;
  readonly deckOfSpace: ReadonlyMap<string, number>;
  /** Free floor near the middle of each space, for anyone without a spot. */
  readonly middle: ReadonlyMap<string, Point>;
  /** Every ladderwell and the lift, with its stop on each deck it serves. */
  readonly shafts: readonly {
    readonly id: string;
    readonly lift: boolean;
    readonly stops: ReadonlyMap<number, ShaftStop>;
  }[];
}

/** Works out walk grids, spots and shaft stops for the whole ship. */
export function crewMap(layout: ShipLayout): CrewMap {
  const decks = new Map<number, DeckPlace>();
  const spotsByRoom = new Map<string, Spot[]>();
  const deckOfSpace = new Map<string, number>();
  const middle = new Map<string, Point>();
  const shafts = new Map<string, { id: string; lift: boolean; stops: Map<number, ShaftStop> }>();
  for (const deck of layout.decks) {
    const n = deck.deck.deck;
    const grid = walkGrid(deck, CREW_RADIUS);
    const spots = deckSpots(deck, grid);
    decks.set(n, { layout: deck, grid, spots, spaceIndex: spaceIndex(deck, grid) });
    for (const spot of spots)
      spotsByRoom.set(spot.space, [...(spotsByRoom.get(spot.space) ?? []), spot]);
    for (const space of deck.spaces) {
      deckOfSpace.set(space.id, n);
      const [mx, my] = centre(space.inner);
      const point = nearestFree(grid, mx, my, 4);
      if (point) middle.set(space.id, point);
    }
    for (const stop of deck.shafts) {
      const shaft = shafts.get(stop.shaft.id) ?? {
        id: stop.shaft.id,
        lift: stop.shaft.type === 'lift',
        stops: new Map<number, ShaftStop>(),
      };
      shaft.stops.set(n, stop);
      shafts.set(stop.shaft.id, shaft);
    }
  }
  return { decks, spotsByRoom, deckOfSpace, middle, shafts: [...shafts.values()] };
}

function spaceIndex(layout: DeckLayout, grid: WalkGrid): Int16Array {
  const index = new Int16Array(grid.columns * grid.rows).fill(-1);
  layout.spaces.forEach((space, i) => {
    const { rect } = space;
    for (let r = 0; r < grid.rows; r++) {
      const y = grid.y0 + (r + 0.5) * grid.cell;
      if (y < rect.y0 || y > rect.y1) continue;
      for (let c = 0; c < grid.columns; c++) {
        const x = grid.x0 + (c + 0.5) * grid.cell;
        if (x >= rect.x0 && x <= rect.x1) index[r * grid.columns + c] = i;
      }
    }
  });
  return index;
}

/** What the renderer and the dialog need to know about one crew member, this frame. */
export interface CrewView {
  readonly member: CrewMember;
  readonly deck: number;
  /** On the plan, metres. */
  readonly x: number;
  readonly y: number;
  /** Height of the body's root above the deck: a mattress, a treadmill, a ladder. */
  readonly lift: number;
  /** Radians, as the camera's: 0 faces starboard (+z in the world), positive turns aft. */
  readonly yaw: number;
  readonly pose: Pose;
  /** Walk cycle and idle movements, radians. */
  readonly phase: number;
  /** Seat or mattress height for sitting and lying. */
  readonly seat: number;
  readonly visible: boolean;
  /** What they're doing, or on their way to do. */
  readonly activity: Activity;
  /** The space they're in now. */
  readonly space: string | null;
  /** At their spot rather than on the way to it. */
  readonly settled: boolean;
  /** Asleep in a rack with its curtain drawn: the renderer draws the curtain, not the body. */
  readonly curtained: boolean;
}

/** A stretch of a walk: along points on one deck, or out of sight while climbing between decks. */
type Leg =
  | {
      readonly kind: 'walk';
      readonly points: readonly Point[];
      /** Height above the deck at the start and end of the leg (stepping onto a ladder). */
      readonly lift: readonly [number, number];
      index: number;
      /** Length of the whole leg and how far along it they are, for `lift`. */
      readonly length: number;
      done: number;
    }
  | {
      readonly kind: 'climb';
      readonly toDeck: number;
      /** Where they reappear on the new deck, and at what height. */
      readonly at: Point;
      readonly lift: number;
      remaining: number;
    };

/** Which spot use each activity looks for. */
const USE: Record<Activity, SpotUse> = {
  duty: 'duty',
  patrol: 'patrol',
  sleep: 'rest',
  wash: 'wash',
  eat: 'eat',
  leisure: 'leisure',
};
/** Straight-line distance times this is about what a walk on the grid comes to. */
const DETOUR = 1.35;
/** A stride (two steps) is about this long, in metres. */
const STRIDE = 1.4;
/** Turning speed, radians per second. */
const TURN_RATE = 6;
/** How long someone waits for the captain to move out of their way before walking on. */
const YIELD_SECONDS = 2.5;
/** How far off the deck someone is when they vanish down a ladder or reappear up it. */
const CLIMB_DEPTH = 1.1;
/** At most this many people set off or move per update; the rest wait a frame. */
const PLANS_PER_UPDATE = 6;
/** People standing about at leisure chat with someone this close (metres). */
const BUDDY_RANGE = 2.8;

class Walker implements CrewView {
  deck = 0;
  x = 0;
  y = 0;
  lift = 0;
  yaw = 0;
  pose: Pose = 'stand';
  phase: number;
  seat = 0;
  visible = true;
  activity: Activity = 'duty';
  space: string | null = null;
  settled = false;
  curtained = false;

  /** The block they're in or heading to, and the spot they hold. */
  block: Block | null = null;
  spot: Spot | null = null;
  route: Leg[] = [];
  /** Ship minutes before the next block at which they set off. */
  lead = 0;
  /** Ship time (total minutes) at which they next look for a better spot. */
  nextLook = 0;
  /** Ship time at which they may next move about the room. */
  settledUntil = 0;
  /** Seconds spent waiting for the captain to get out of the way. */
  waited = 0;
  /** Someone to face and until when (seconds of crew time); `speaking` gestures. */
  attention: { point: Point; until: number } | null = null;
  speaking = false;
  /** Where an event needs them, whatever their plan says; null to follow the plan. */
  override: Block | null = null;
  /** Someone standing about nearby to chat with (without words) while at leisure. */
  buddy: Walker | null = null;
  /** Of a pair of buddies, the one whose turn to gesture comes first. */
  leads = false;
  private readonly plans = new Map<number, Block[]>();

  constructor(
    readonly member: CrewMember,
    readonly speed: number,
    readonly rng: Rng,
    private readonly routine: Routine,
  ) {
    this.phase = rng.next() * Math.PI * 2;
  }

  /** Nowhere yet, doing nothing: as before the start of the game. */
  reset(): void {
    this.deck = 0;
    this.x = 0;
    this.y = 0;
    this.lift = 0;
    this.yaw = 0;
    this.pose = 'stand';
    this.seat = 0;
    this.visible = true;
    this.activity = 'duty';
    this.space = null;
    this.settled = false;
    this.curtained = false;
    this.block = null;
    this.spot = null;
    this.route = [];
    this.lead = 0;
    this.nextLook = 0;
    this.settledUntil = 0;
    this.waited = 0;
    this.attention = null;
    this.speaking = false;
    this.override = null;
    this.buddy = null;
    this.leads = false;
  }

  /** The block at a ship time (total minutes since day 0). */
  blockAt(total: number): Block {
    const day = Math.floor(total / DAY);
    return blockAt(this.plan(day), total - day * DAY);
  }

  /** The next block that is somewhere else or something else, after the one at `total`. */
  upcoming(total: number): { block: Block; starts: number } {
    const current = this.blockAt(total);
    let day = Math.floor(total / DAY);
    let end = day * DAY + current.to;
    for (let i = 0; i < 6; i++) {
      day = Math.floor(end / DAY);
      const block = blockAt(this.plan(day), end - day * DAY);
      if (!sameStint(block, current)) return { block, starts: end };
      end = day * DAY + block.to;
    }
    return { block: current, starts: end };
  }

  private plan(day: number): Block[] {
    let plan = this.plans.get(day);
    if (!plan) {
      plan = dayPlan(this.member, this.routine, day);
      this.plans.set(day, plan);
      // Keep yesterday, today and tomorrow.
      for (const key of this.plans.keys())
        if (key < day - 1 || key > day + 1) this.plans.delete(key);
    }
    return plan;
  }
}

/** Waiting in a room for an event, whatever the plan of the day says. */
function waiting(room: string): Block {
  return { from: 0, to: DAY, activity: 'duty', room };
}

/** Same activity in the same place: no need to move. */
function sameStint(a: Block | null, b: Block | null): boolean {
  return a !== null && b !== null && a.activity === b.activity && a.room === b.room;
}

/** The captain, whom the crew make way for and face when spoken to. */
export interface CaptainAt {
  readonly deck: number;
  readonly x: number;
  readonly y: number;
}

/** The whole crew, moving about the ship. */
export class CrewLife {
  readonly people: readonly CrewView[];
  /** Seconds of crew time so far: drives gestures and attention. */
  seconds = 0;
  private readonly walkers: Walker[];
  private readonly byId: Map<string, Walker>;
  private readonly claims = new Map<string, Walker>();
  /** Walks still to plan this update: path finding is spread over frames at a shift change. */
  private budget = 0;
  /** Ship time at the last update, total minutes. */
  private now: number;

  constructor(
    private readonly map: CrewMap,
    members: readonly CrewMember[],
    routine: Routine,
    private readonly tuning: LifeTuning,
    /** Ship time to start at, total minutes since day 0. */
    now: number,
    seed: number,
  ) {
    this.walkers = members.map((member) => {
      const rng = Rng.fromSeed((hash(member.id) ^ seed) | 0);
      const speed = tuning.walkSpeed * (0.85 + rng.next() * 0.3);
      return new Walker(member, speed, rng, routine);
    });
    this.byId = new Map(this.walkers.map((walker) => [walker.member.id, walker]));
    this.people = this.walkers;
    this.now = now;
    this.restart(now);
  }

  /**
   * Everyone where their plan of the day puts them at `now`, already settled in: the start of
   * the game, or a saved game loaded. `summoned` (crew id → room) are waiting where an event
   * needs them instead, until dismissed.
   */
  restart(now: number, summoned: ReadonlyMap<string, string> = new Map()): void {
    this.now = now;
    this.claims.clear();
    for (const walker of this.walkers) walker.reset();
    // The summoned first, so they get the posts in the room they're waiting in.
    for (const [id, room] of summoned) {
      const walker = this.byId.get(id);
      if (!walker || !this.map.deckOfSpace.has(room)) continue;
      walker.override = waiting(room);
      this.placeAt(walker, walker.override, now);
    }
    for (const walker of this.walkers) {
      if (!walker.override) this.placeAt(walker, walker.blockAt(now), now);
    }
  }

  person(id: string): CrewView | undefined {
    return this.byId.get(id);
  }

  /**
   * Moves everyone on by `seconds` of crew time (real seconds times the time scale), with the
   * ship's clock at `now` (total minutes since day 0).
   */
  update(seconds: number, now: number, captain: CaptainAt | null): void {
    this.seconds += seconds;
    this.now = now;
    this.budget = PLANS_PER_UPDATE;
    for (const walker of this.walkers) {
      if (walker.route.length > 0) this.walk(walker, seconds, now, captain);
      else this.stay(walker, now);
      this.animate(walker, seconds);
    }
  }

  /**
   * Has someone stop and face a point (whoever they're talking to) for a while; `speaking`
   * adds gestures. Walkers pause on the spot.
   */
  attend(id: string, point: Point, seconds: number, speaking: boolean): void {
    const walker = this.byId.get(id);
    if (!walker) return;
    walker.attention = { point, until: this.seconds + seconds };
    walker.speaking = speaking;
  }

  /**
   * Sends someone to a room to wait there (an event needs them) until released, whatever their
   * plan says. They set off at once, even from the middle of another walk.
   */
  summon(id: string, room: string): void {
    const walker = this.byId.get(id);
    if (!walker || !this.map.deckOfSpace.has(room)) return;
    walker.override = waiting(room);
    if (walker.block?.room !== room || walker.block.activity !== 'duty') {
      this.setOff(walker, walker.override, this.now);
    }
  }

  /** Lets someone summoned go back to their day. */
  dismiss(id: string): void {
    const walker = this.byId.get(id);
    if (walker) walker.override = null;
  }

  /** The space at a point on a deck, or null outside every space. */
  spaceAt(deck: number, x: number, y: number): string | null {
    const place = this.map.decks.get(deck);
    if (!place) return null;
    const { grid, layout, spaceIndex } = place;
    const c = Math.floor((x - grid.x0) / grid.cell);
    const r = Math.floor((y - grid.y0) / grid.cell);
    if (c < 0 || r < 0 || c >= grid.columns || r >= grid.rows) return null;
    const i = spaceIndex[r * grid.columns + c]!;
    return i >= 0 ? layout.spaces[i]!.id : null;
  }

  // ---- Staying put --------------------------------------------------------------------------

  private stay(walker: Walker, now: number): void {
    const wanted = walker.override ?? walker.blockAt(now + walker.lead);
    if (!sameStint(wanted, walker.block)) {
      // Setting off plans a walk: when this update's budget is spent, they go next update.
      if (this.budget > 0) {
        this.budget--;
        this.setOff(walker, wanted, now);
      }
      return;
    }
    if (now < walker.nextLook || !walker.block || this.budget <= 0) return;
    walker.nextLook = now + 2 + walker.rng.next() * 3;
    // A better spot now free (their own rack, their post), or time to move about the room.
    const block = walker.block;
    if (block.activity === 'sleep' || block.activity === 'duty') {
      const best = this.bestSpot(walker, block);
      if (best && this.rank(walker, block, best) > this.rank(walker, block, walker.spot)) {
        this.moveTo(walker, best, now);
        return;
      }
    }
    if (now >= walker.settledUntil) {
      walker.settledUntil = now + this.fidgetMinutes(walker, block);
      const restless =
        block.activity === 'patrol' ||
        (block.activity === 'leisure' && walker.spot?.pose === 'stand' && walker.rng.chance(0.5)) ||
        (block.activity === 'duty' && walker.spot?.kind === 'floor' && walker.rng.chance(0.35));
      if (!restless) return;
      const others = this.freeSpots(walker, block).filter((spot) => spot !== walker.spot);
      if (others.length > 0) this.moveTo(walker, walker.rng.pick(others), now);
    }
  }

  /** How long someone stays at a spot before moving about the room, in ship minutes. */
  private fidgetMinutes(walker: Walker, block: Block): number {
    return block.activity === 'patrol' ? 4 + walker.rng.next() * 6 : 8 + walker.rng.next() * 14;
  }

  // ---- Setting off --------------------------------------------------------------------------

  /** Leaves for the next block: picks a spot there and plans the walk. */
  private setOff(walker: Walker, block: Block, now: number): void {
    this.release(walker);
    walker.block = block;
    walker.activity = block.activity;
    const spot = this.bestSpot(walker, block) ?? this.extraSpot(walker, block.room);
    this.go(walker, spot, now);
  }

  /** Moves to another spot without changing what they're doing. */
  private moveTo(walker: Walker, spot: Spot, now: number): void {
    this.budget--;
    this.release(walker);
    this.go(walker, spot, now);
  }

  private go(walker: Walker, spot: Spot | null, now: number): void {
    // Where they are sitting or lying now, to get up from it.
    const previous = walker.settled ? walker.spot : null;
    if (spot) this.claims.set(spot.id, walker);
    walker.spot = spot;
    walker.settled = false;
    walker.curtained = false;
    const route = spot ? this.routeTo(walker, previous, spot) : null;
    if (!route) {
      // Nowhere to go or no way there (shouldn't happen: the tests walk every spot).
      if (spot) this.settle(walker, now);
      return;
    }
    walker.route = route;
    walker.waited = 0;
    if (route.length === 0) this.settle(walker, now);
  }

  /** The legs from where someone is to a spot: off their seat, along the deck, up or down. */
  private routeTo(walker: Walker, previous: Spot | null, spot: Spot): Leg[] | null {
    const from = this.map.decks.get(walker.deck);
    const to = this.map.decks.get(spot.deck);
    if (!from || !to) return null;
    const legs: Leg[] = [];
    let at: Point = [walker.x, walker.y];
    // Off a seat or out of a rack: step out the way they got in, onto clear floor.
    const seated = previous && previous.pose !== 'stand' && previous.pose !== 'work';
    if (seated || !isFree(from.grid, at[0], at[1])) {
      const clear = seated ? previous.approach : nearestFree(from.grid, at[0], at[1], 0.8);
      if (!clear) return null;
      legs.push(walkLeg([at, clear], [walker.lift, 0]));
      at = clear;
    }
    if (spot.deck === walker.deck) {
      const path = findPath(from.grid, at, spot.approach);
      if (!path) return null;
      legs.push(walkLeg(path));
    } else {
      const trip = this.bestShaft(walker.deck, at, spot.deck, spot.approach);
      if (!trip) return null;
      const { leave, arrive, decks } = trip;
      const out = findPath(from.grid, at, leave.landing);
      const onward = findPath(to.grid, arrive.landing, spot.approach);
      if (!out || !onward) return null;
      legs.push(walkLeg(out));
      const down = spot.deck > walker.deck;
      if (leave.shaft.type === 'lift') {
        legs.push({
          kind: 'climb',
          toDeck: spot.deck,
          at: arrive.landing,
          lift: 0,
          remaining: this.climb(decks),
        });
        legs.push(walkLeg(onward));
      } else {
        // Onto the ladder (down through the hole, or up the ladder), then off it on the new deck.
        const hole = centre((down ? leave.ladderDown : leave.ladderUp) ?? toAreaAt(leave.landing));
        const foot = centre(
          (down ? arrive.ladderUp : arrive.ladderDown) ?? toAreaAt(arrive.landing),
        );
        const depth = down ? -CLIMB_DEPTH : CLIMB_DEPTH;
        legs.push(walkLeg([leave.landing, hole], [0, depth]));
        legs.push({
          kind: 'climb',
          toDeck: spot.deck,
          at: foot,
          lift: -depth,
          remaining: this.climb(decks),
        });
        legs.push(walkLeg([foot, arrive.landing], [-depth, 0]));
        legs.push(walkLeg(onward));
      }
    }
    // Into the seat or the rack, climbing up to it.
    if (spot.pose !== 'stand' && spot.pose !== 'work') {
      const up = spot.pose === 'lie' || spot.pose === 'run' ? spot.seat : 0;
      legs.push(walkLeg([spot.approach, [spot.x, spot.y]], [0, up]));
    }
    return legs.filter((leg) => leg.kind === 'climb' || leg.length > 0.01);
  }

  private climb(decks: number): number {
    return this.tuning.climbSeconds * decks;
  }

  /** The ladder or lift with the shortest trip from one deck to another. */
  private bestShaft(
    fromDeck: number,
    from: Point,
    toDeck: number,
    to: Point,
  ): { leave: ShaftStop; arrive: ShaftStop; decks: number; metres: number } | null {
    let best: { leave: ShaftStop; arrive: ShaftStop; decks: number; metres: number } | null = null;
    const decks = Math.abs(toDeck - fromDeck);
    for (const shaft of this.map.shafts) {
      const leave = shaft.stops.get(fromDeck);
      const arrive = shaft.stops.get(toDeck);
      if (!leave || !arrive) continue;
      // Every deck in between must be served too.
      let through = true;
      for (let d = Math.min(fromDeck, toDeck) + 1; d < Math.max(fromDeck, toDeck); d++) {
        if (!shaft.stops.has(d)) through = false;
      }
      if (!through) continue;
      const metres =
        distance(from, leave.landing) +
        distance(arrive.landing, to) +
        // The lift is slower to use for one deck than a ladder, and quicker for several.
        (shaft.lift ? 4 + decks * 2 : decks * 4);
      if (!best || metres < best.metres) best = { leave, arrive, decks, metres };
    }
    return best;
  }

  // ---- Spots --------------------------------------------------------------------------------

  private freeSpots(walker: Walker, block: Block): Spot[] {
    const use = USE[block.activity];
    return (this.map.spotsByRoom.get(block.room) ?? []).filter((spot) => {
      const holder = this.claims.get(spot.id);
      if (holder && holder !== walker) return false;
      if (!spot.uses.includes(use)) {
        // At leisure in their own quarters, people read in their rack.
        return block.activity === 'leisure' && this.isOwnRack(walker, spot);
      }
      // Racks are for their own sleepers.
      return spot.rack === null || this.isOwnRack(walker, spot);
    });
  }

  private isOwnRack(walker: Walker, spot: Spot): boolean {
    const berth = walker.member.berth;
    return berth !== null && spot.space === berth.room && spot.rack === berth.rack;
  }

  /** How much someone wants a spot for a block: their own rack, their post, furniture, floor. */
  private rank(walker: Walker, block: Block, spot: Spot | null): number {
    if (!spot) return -1;
    if (block.activity === 'sleep') return this.isOwnRack(walker, spot) ? 3 : 0;
    if (block.activity === 'duty' && walker.member.post) {
      if (spot.kind === walker.member.post) return 3;
    }
    return spot.kind === 'floor' ? 1 : 2;
  }

  /** The free spot someone would choose for a block, or null if every spot is taken. */
  private bestSpot(walker: Walker, block: Block): Spot | null {
    const free = this.freeSpots(walker, block);
    if (free.length === 0) return null;
    const top = Math.max(...free.map((spot) => this.rank(walker, block, spot)));
    const best = free.filter((spot) => this.rank(walker, block, spot) === top);
    // At leisure in their quarters, about half read in their rack and half sit or stand about.
    if (block.activity === 'leisure') {
      const rack = free.find((spot) => this.isOwnRack(walker, spot));
      if (rack && walker.rng.chance(0.45)) return rack;
      const others = free.filter((spot) => spot !== rack);
      if (others.length > 0) return walker.rng.pick(others);
    }
    return walker.rng.pick(best);
  }

  /** Somewhere to stand in a room when every spot is taken. */
  private extraSpot(walker: Walker, room: string): Spot | null {
    const deck = this.map.deckOfSpace.get(room);
    const place = deck === undefined ? undefined : this.map.decks.get(deck);
    const space = place?.layout.spaces.find((candidate) => candidate.id === room);
    if (!place || !space || deck === undefined) return null;
    const { inner } = space;
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = inner.x0 + 0.5 + walker.rng.next() * Math.max(0, inner.x1 - inner.x0 - 1);
      const y = inner.y0 + 0.5 + walker.rng.next() * Math.max(0, inner.y1 - inner.y0 - 1);
      const point = nearestFree(place.grid, x, y, 1);
      if (!point) continue;
      const crowded = this.walkers.some(
        (other) =>
          other !== walker && other.deck === deck && distance([other.x, other.y], point) < 0.7,
      );
      if (crowded && attempt < 11) continue;
      return {
        id: `${room}/extra-${walker.member.id}`,
        deck,
        space: room,
        x: point[0],
        y: point[1],
        yaw: walker.rng.next() * 360 - 180,
        pose: 'stand',
        seat: 0,
        uses: [],
        kind: 'floor',
        rack: null,
        approach: point,
      };
    }
    const point = this.map.middle.get(room);
    return point
      ? {
          id: `${room}/extra-${walker.member.id}`,
          deck,
          space: room,
          x: point[0],
          y: point[1],
          yaw: 0,
          pose: 'stand',
          seat: 0,
          uses: [],
          kind: 'floor',
          rack: null,
          approach: point,
        }
      : null;
  }

  private release(walker: Walker): void {
    const spot = walker.spot;
    if (spot && this.claims.get(spot.id) === walker) this.claims.delete(spot.id);
  }

  // ---- Arriving ---------------------------------------------------------------------------

  /** Puts someone straight at their spot for a block (the start of the game). */
  private placeAt(walker: Walker, block: Block, now: number): void {
    walker.block = block;
    walker.activity = block.activity;
    const spot = this.bestSpot(walker, block) ?? this.extraSpot(walker, block.room);
    if (!spot) return;
    this.claims.set(spot.id, walker);
    walker.spot = spot;
    walker.deck = spot.deck;
    this.settle(walker, now);
  }

  /** At the spot: takes up its pose and works out when to leave for what comes next. */
  private settle(walker: Walker, now: number): void {
    const spot = walker.spot;
    walker.route = [];
    walker.settled = true;
    walker.curtained = spot?.kind === 'rack-stack' && walker.activity === 'sleep';
    walker.settledUntil = now + this.fidgetMinutes(walker, walker.block!);
    walker.nextLook = now + 1 + walker.rng.next() * 2;
    if (spot) {
      walker.deck = spot.deck;
      walker.x = spot.x;
      walker.y = spot.y;
      walker.yaw = (spot.yaw * Math.PI) / 180;
      walker.pose = poseAt(spot, walker.activity);
      walker.seat = spot.seat;
      walker.lift = walker.pose === 'lie' || walker.pose === 'run' ? spot.seat : 0;
      walker.visible = spot.pose !== 'hidden';
      walker.space = spot.space;
    }
    this.findBuddy(walker);
    // Set off for what comes next early enough to be there on time, give or take; but the watch
    // stays at its post until the hour, so the relief arrives before they leave.
    const { block, starts } = walker.upcoming(now);
    const minutes = this.travelSeconds(walker, block.room) * this.tuning.minutesPerSecond;
    const onWatch = walker.activity === 'duty' || walker.activity === 'patrol';
    walker.lead = onWatch
      ? 0
      : Math.min(minutes + walker.rng.next() * 4, Math.max(0, starts - now));
  }

  /** About how long a walk from where someone is to a room takes, in seconds. */
  private travelSeconds(walker: Walker, room: string): number {
    const deck = this.map.deckOfSpace.get(room);
    const target = this.map.middle.get(room);
    if (deck === undefined || !target) return 0;
    const here: Point = [walker.x, walker.y];
    if (deck === walker.deck) return (distance(here, target) * DETOUR) / walker.speed;
    const trip = this.bestShaft(walker.deck, here, deck, target);
    if (!trip) return 0;
    return (trip.metres * DETOUR) / walker.speed + this.climb(trip.decks);
  }

  // ---- Walking ------------------------------------------------------------------------------

  private walk(walker: Walker, seconds: number, now: number, captain: CaptainAt | null): void {
    const leg = walker.route[0]!;
    if (leg.kind === 'climb') {
      walker.visible = false;
      leg.remaining -= seconds;
      if (leg.remaining <= 0) {
        walker.route.shift();
        walker.deck = leg.toDeck;
        [walker.x, walker.y] = leg.at;
        walker.lift = leg.lift;
        walker.visible = true;
        if (walker.route.length === 0) this.settle(walker, now);
      }
      return;
    }
    // Stop for someone they're talking to, and for the captain in their way, for a while.
    if (walker.attention && walker.attention.until > this.seconds) {
      walker.pose = 'stand';
      return;
    }
    if (captain && this.blockedBy(walker, captain) && walker.waited < YIELD_SECONDS) {
      walker.waited += seconds;
      walker.pose = 'stand';
      return;
    }
    walker.visible = true;
    walker.pose = 'walk';
    let budget = walker.speed * seconds;
    while (budget > 0 && walker.route.length > 0) {
      const current = walker.route[0]!;
      if (current.kind === 'climb') break;
      const target = current.points[current.index]!;
      const dx = target[0] - walker.x;
      const dy = target[1] - walker.y;
      const gap = Math.hypot(dx, dy);
      if (gap > 1e-6)
        walker.yaw = turnTowards(walker.yaw, Math.atan2(dx, -dy), TURN_RATE * seconds);
      const step = Math.min(gap, budget);
      if (gap > 1e-6) {
        walker.x += (dx / gap) * step;
        walker.y += (dy / gap) * step;
      }
      current.done += step;
      budget -= step;
      const t = current.length > 0 ? Math.min(1, current.done / current.length) : 1;
      walker.lift = current.lift[0] + (current.lift[1] - current.lift[0]) * t;
      if (step >= gap) {
        current.index++;
        if (current.index >= current.points.length) walker.route.shift();
      }
    }
    walker.phase += (seconds * walker.speed * Math.PI * 2) / STRIDE;
    walker.space = this.spaceAt(walker.deck, walker.x, walker.y) ?? walker.space;
    if (walker.route.length === 0) this.settle(walker, now);
  }

  /** True when the captain stands just ahead of someone on their way. */
  private blockedBy(walker: Walker, captain: CaptainAt): boolean {
    if (captain.deck !== walker.deck) return false;
    const dx = captain.x - walker.x;
    const dy = captain.y - walker.y;
    const gap = Math.hypot(dx, dy);
    if (gap > 1.0) return false;
    // Ahead: within about 70 degrees of the way they're heading.
    const ahead = (Math.sin(walker.yaw) * dx - Math.cos(walker.yaw) * dy) / Math.max(gap, 1e-6);
    return ahead > 0.35;
  }

  // ---- Animation --------------------------------------------------------------------------

  /** Pairs someone standing about at leisure with another nearby, to chat (see animate). */
  private findBuddy(walker: Walker): void {
    walker.buddy = null;
    if (!this.chatty(walker)) return;
    let best: Walker | null = null;
    let bestGap = BUDDY_RANGE;
    for (const other of this.walkers) {
      if (other === walker || other.buddy || !this.chatty(other) || other.space !== walker.space)
        continue;
      const gap = Math.hypot(other.x - walker.x, other.y - walker.y);
      if (gap < bestGap) {
        best = other;
        bestGap = gap;
      }
    }
    if (!best) return;
    walker.buddy = best;
    best.buddy = walker;
    walker.leads = true;
    best.leads = false;
  }

  /** Standing on open floor at leisure, where a chat looks natural. */
  private chatty(walker: Walker): boolean {
    return (
      walker.settled &&
      walker.activity === 'leisure' &&
      walker.spot?.kind === 'floor' &&
      walker.visible
    );
  }

  private animate(walker: Walker, seconds: number): void {
    if (walker.pose === 'run') walker.phase += seconds * Math.PI * 2 * 1.4;
    const attention = walker.attention;
    const buddy = walker.buddy;
    if (!attention && buddy) {
      if (buddy.buddy !== walker || !this.chatty(walker) || !this.chatty(buddy)) {
        // One of them moved on.
        walker.buddy = null;
        if (walker.settled && walker.spot) walker.pose = poseAt(walker.spot, walker.activity);
        return;
      }
      // Face each other and take turns to talk.
      const target = Math.atan2(buddy.x - walker.x, -(buddy.y - walker.y));
      walker.yaw = turnTowards(walker.yaw, target, TURN_RATE * 0.5 * seconds);
      const lead = walker.leads ? walker : buddy;
      const turn = Math.sin(this.seconds * 0.55 + lead.phase);
      walker.pose = (walker.leads ? turn > 0.2 : turn < -0.2) ? 'talk' : 'stand';
      return;
    }
    if (!attention) return;
    if (attention.until <= this.seconds) {
      walker.attention = null;
      walker.speaking = false;
      if (walker.settled && walker.spot) walker.pose = poseAt(walker.spot, walker.activity);
      return;
    }
    // Standing people turn to whoever they're talking to; sitting and lying people stay put.
    if (walker.pose === 'stand' || walker.pose === 'talk' || walker.pose === 'work') {
      const [px, py] = attention.point;
      const target = Math.atan2(px - walker.x, -(py - walker.y));
      walker.yaw = turnTowards(walker.yaw, target, TURN_RATE * 0.6 * seconds);
      walker.pose = walker.speaking ? 'talk' : 'stand';
    }
  }
}

/** The body's pose at a spot for an activity. */
function poseAt(spot: Spot, activity: Activity): Pose {
  switch (spot.pose) {
    case 'sit':
      return activity === 'eat' ? 'eat' : 'sit';
    case 'lie':
      return 'lie';
    case 'work':
      return 'work';
    case 'run':
      return 'run';
    default:
      return 'stand';
  }
}

function walkLeg(points: readonly Point[], lift: readonly [number, number] = [0, 0]): Leg {
  let length = 0;
  for (let i = 1; i < points.length; i++) length += distance(points[i - 1]!, points[i]!);
  // The first point is where they are now.
  return { kind: 'walk', points, lift, index: Math.min(1, points.length - 1), length, done: 0 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function toAreaAt([x, y]: Point) {
  return { x0: x, y0: y, x1: x, y1: y };
}

/** Turns an angle towards another by at most `step` radians, the short way round. */
function turnTowards(from: number, to: number, step: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  if (Math.abs(delta) <= step) return to;
  return from + Math.sign(delta) * step;
}
