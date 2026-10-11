/**
 * Draws the crew. Every person is a couple of dozen boxes (body.ts), posed afresh each frame and
 * drawn as thin instances of the box mesh of the lighting cell they stand in, so the cell's
 * ceiling lights light them like everything else in the room (build.ts makes those meshes).
 *
 * Sleepers in racks are behind drawn curtains, so only the curtain is drawn. The people nearest
 * the captain also get an invisible box: the captain bumps into those who stand or sit still
 * instead of walking through them, and a look at anyone offers "Talk to …".
 */
import { CreateBox, type Mesh, type Scene } from '../babylon';
import { swatchRgb } from '../palette';
import type { MeshTag, PeopleMesh, ShipWorld } from '../ship/build';
import { areaContains, distanceTo } from '../ship/coords';
import {
  compose,
  emitBody,
  paletteFor,
  rotY,
  translate,
  type Frame,
  type Palette,
  type Vec3,
} from './body';
import { callSign } from '../../sim/crew';
import type { CrewView } from './life';

/** Instances a cell's buffers start with; they double when a crowd outgrows them. */
const FIRST_CAPACITY = 256;
/** People within this distance of the captain (metres) can be bumped into and talked to. */
const TOUCH_RANGE = 12;
/** Invisible boxes for the nearest people. */
const TOUCH_BOXES = 24;
/**
 * A rack's privacy curtain, drawn shut while someone sleeps (rack-stack in props.ts): how far
 * out from the mattress's middle it hangs, how long and how high, and the top rail's height.
 */
const RACK_CURTAIN = { out: 0.45, length: 1.88, height: 0.41, top: 2.1 };
const CURTAIN: Vec3 = [...swatchRgb('curtain')];

interface Slot {
  readonly people: PeopleMesh;
  matrices: Float32Array;
  colours: Float32Array;
  capacity: number;
  count: number;
}

export class Crowd {
  private readonly slots = new Map<number, Slot[]>();
  private readonly palettes = new Map<string, Palette>();
  private readonly boxes: Mesh[] = [];
  private shownDeck: number | null = null;

  constructor(
    scene: Scene,
    private readonly world: ShipWorld,
    private readonly people: readonly CrewView[],
    /** Passageways and shafts: too narrow to block, so people there let the captain through. */
    private readonly narrow: ReadonlySet<string>,
  ) {
    for (const [deck, meshes] of world.peopleMeshes) {
      this.slots.set(
        deck,
        meshes.map((people) => ({
          people,
          matrices: new Float32Array(0),
          colours: new Float32Array(0),
          capacity: 0,
          count: 0,
        })),
      );
    }
    for (const person of people) {
      const { member } = person;
      this.palettes.set(member.id, paletteFor(member.look, member.group, member.department));
    }
    for (let i = 0; i < TOUCH_BOXES; i++) {
      const box = CreateBox(`crew-touch-${i}`, { size: 1 }, scene);
      box.isVisible = false;
      box.setEnabled(false);
      this.boxes.push(box);
    }
  }

  /**
   * Poses and draws everyone on `deck`; `time` drives gestures. `captain` is the captain's spot
   * on the plan, for the touch boxes.
   */
  update(deck: number, time: number, captain: { x: number; y: number }): void {
    if (this.shownDeck !== null && this.shownDeck !== deck) {
      for (const slot of this.slots.get(this.shownDeck) ?? []) this.clear(slot);
    }
    this.shownDeck = deck;
    const slots = this.slots.get(deck) ?? [];
    for (const slot of slots) slot.count = 0;
    const floorY = this.world.floorY(deck);
    const near: { person: CrewView; distance: number }[] = [];

    for (const person of this.people) {
      if (person.deck !== deck || !person.visible) continue;
      const slot = slotAt(slots, person.x, person.y);
      if (!slot) continue;
      const palette = this.palettes.get(person.member.id)!;
      const root = compose(translate(person.x, floorY + person.lift, -person.y), rotY(person.yaw));
      if (person.curtained) {
        // Asleep behind the rack's curtain, drawn along its open side (the sleeper's left).
        const height = Math.min(RACK_CURTAIN.height, RACK_CURTAIN.top - person.lift);
        this.add(
          slot,
          [0.02, height, RACK_CURTAIN.length],
          compose(root, translate(-RACK_CURTAIN.out, 0.01 + height / 2, 0)),
          CURTAIN,
        );
      } else
        emitBody(
          {
            look: person.member.look,
            group: person.member.group,
            palette,
            pose: person.pose,
            phase: person.phase,
            time,
            seat: person.seat,
          },
          root,
          (size, frame, colour) => this.add(slot, size, frame, colour),
        );
      const distance = Math.hypot(person.x - captain.x, person.y - captain.y);
      if (distance < TOUCH_RANGE) near.push({ person, distance });
    }

    for (const slot of slots) {
      const { mesh } = slot.people;
      if (slot.count === 0) {
        this.clear(slot);
        continue;
      }
      mesh.thinInstanceCount = slot.count;
      mesh.thinInstanceBufferUpdated('matrix');
      mesh.thinInstanceBufferUpdated('color');
      mesh.isVisible = true;
    }

    near.sort((a, b) => a.distance - b.distance);
    this.boxes.forEach((box, i) => {
      const entry = near[i];
      if (!entry) {
        box.setEnabled(false);
        return;
      }
      touchBox(box, entry.person, floorY, !this.narrow.has(entry.person.space ?? ''));
    });
  }

  private clear(slot: Slot): void {
    slot.count = 0;
    slot.people.mesh.isVisible = false;
  }

  /** Adds one box to a cell's instances, growing its buffers if need be. */
  private add(slot: Slot, [sx, sy, sz]: Vec3, { r, t }: Frame, [red, green, blue]: Vec3): void {
    if (slot.count >= slot.capacity) this.grow(slot);
    const m = slot.matrices;
    const o = slot.count * 16;
    // Babylon's layout: each row is where a unit axis goes (scaled), then the position.
    m[o] = r[0] * sx;
    m[o + 1] = r[3] * sx;
    m[o + 2] = r[6] * sx;
    m[o + 3] = 0;
    m[o + 4] = r[1] * sy;
    m[o + 5] = r[4] * sy;
    m[o + 6] = r[7] * sy;
    m[o + 7] = 0;
    m[o + 8] = r[2] * sz;
    m[o + 9] = r[5] * sz;
    m[o + 10] = r[8] * sz;
    m[o + 11] = 0;
    m[o + 12] = t[0];
    m[o + 13] = t[1];
    m[o + 14] = t[2];
    m[o + 15] = 1;
    const c = slot.colours;
    const k = slot.count * 4;
    c[k] = red;
    c[k + 1] = green;
    c[k + 2] = blue;
    c[k + 3] = 1;
    slot.count++;
  }

  private grow(slot: Slot): void {
    const capacity = Math.max(FIRST_CAPACITY, slot.capacity * 2);
    const matrices = new Float32Array(capacity * 16);
    const colours = new Float32Array(capacity * 4);
    matrices.set(slot.matrices);
    colours.set(slot.colours);
    slot.matrices = matrices;
    slot.colours = colours;
    slot.capacity = capacity;
    const { mesh } = slot.people;
    mesh.thinInstanceSetBuffer('matrix', matrices, 16, false);
    mesh.thinInstanceSetBuffer('color', colours, 4, false);
  }
}

/** The cell a point is in; one nearby if it falls on a seam or in a doorway. */
function slotAt(slots: readonly Slot[], x: number, y: number): Slot | null {
  let best: Slot | null = null;
  let bestDistance = Infinity;
  for (const slot of slots) {
    const { area } = slot.people.cell;
    if (areaContains(area, x, y)) return slot;
    const distance = distanceTo(area, x, y);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best;
}

/** Fits an invisible box round a person and tags it so a look finds them. */
function touchBox(box: Mesh, person: CrewView, floorY: number, solid: boolean): void {
  const { pose } = person;
  const lying = pose === 'lie';
  const sitting = pose === 'sit' || pose === 'eat';
  const height = lying ? 0.4 : sitting ? 1.3 : 1.75;
  const width = lying ? 0.7 : 0.5;
  box.setEnabled(true);
  box.position.set(person.x, floorY + person.lift + height / 2, -person.y);
  box.scaling.set(width, height, width);
  box.rotation.y = person.yaw;
  // Settled people stand their ground; walkers make way for the captain instead (life.ts),
  // sleepers are already behind their rack's collider, and nobody blocks a passageway.
  box.checkCollisions = solid && person.settled && !lying;
  box.computeWorldMatrix(true);
  const id = person.member.id;
  const current = box.metadata as MeshTag | null;
  if (current?.interactable?.id !== `crew:${id}`) {
    box.metadata = {
      interactable: {
        id: `crew:${id}`,
        label: `Talk to ${callSign(person.member)}`,
        action: { kind: 'talk', crew: id },
      },
    } satisfies MeshTag;
  }
}
