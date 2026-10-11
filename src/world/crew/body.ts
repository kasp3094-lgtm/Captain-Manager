/**
 * A person as a handful of boxes, posed by simple forward kinematics: hips, torso, head, eyes and
 * hair, two-part arms and legs, boots, and whatever they wear over the uniform. Poses: standing,
 * walking, sitting, working with the hands, lying down, running, talking, eating.
 *
 * Pure maths (no Babylon.js), so it is unit-tested: the renderer (crowd.ts) turns each box into a
 * thin instance. Body frame: x to the person's right, y up, z the way they face; feet at y = 0.
 */
import type { Department, Group } from '../../content/crew';
import type { Look } from '../../sim/crew';

export type Mat3 = [number, number, number, number, number, number, number, number, number];
export type Vec3 = [number, number, number];

/** A rigid transform: rotate by `r`, then move by `t`. */
export interface Frame {
  readonly r: Mat3;
  readonly t: Vec3;
}

/** How a body is set this frame. `walk` and `run` loop with `phase`. */
export type Pose = 'stand' | 'walk' | 'sit' | 'work' | 'lie' | 'run' | 'talk' | 'eat';

/** Colours of one person, as 0–1 RGB. */
export interface Palette {
  readonly skin: Vec3;
  readonly hair: Vec3;
  readonly top: Vec3;
  readonly trousers: Vec3;
  readonly boots: Vec3;
  /** Shoulder boards, beret, cap, headset… */
  readonly accent: Vec3;
  readonly wear: Vec3;
}

/** Receives one box: its size, its frame (centre and turn) and its colour. */
export type Emit = (size: Vec3, frame: Frame, colour: Vec3) => void;

export interface BodyState {
  readonly look: Look;
  readonly group: Group;
  readonly palette: Palette;
  readonly pose: Pose;
  /** Walk cycle, radians; also drives small idle movements. */
  readonly phase: number;
  /** Seconds, for gestures. */
  readonly time: number;
  /** Seat or mattress height for sitting and lying. */
  readonly seat: number;
}

/** Emits every box of a body, in the body's own frame placed by `root`. */
export function emitBody(state: BodyState, root: Frame, emit: Emit): void {
  const { look, palette, pose, phase, time } = state;
  const h = look.height;
  const w = look.build;
  const legLength = 0.44 * h;
  const hipHeight = legLength * 2 + 0.06 * h;
  const torsoLength = 0.5 * h;
  const sway = Math.sin(time * 1.3 + phase) * 0.03;

  // Joint angles (radians). Pitch swings a hanging limb forward.
  let thigh = [0, 0];
  let shin = [0, 0];
  let upperArm = [0.05, 0.05];
  let forearm = [0.15, 0.15];
  let armOut = 0.08;
  let lean = 0;
  let nod = 0;
  let turn = sway;
  let lift = 0;
  let base: Frame = root;

  switch (pose) {
    case 'walk':
    case 'run': {
      const s = Math.sin(phase);
      const amount = pose === 'run' ? 0.75 : 0.45;
      thigh = [s * amount, -s * amount];
      shin = [-Math.max(0, -s) * amount * 1.4, -Math.max(0, s) * amount * 1.4];
      upperArm = [-s * amount * 0.8, s * amount * 0.8];
      forearm = pose === 'run' ? [1.3, 1.3] : [0.35, 0.35];
      lift = Math.abs(Math.cos(phase)) * (pose === 'run' ? 0.05 : 0.025);
      lean = pose === 'run' ? -0.12 : -0.03;
      turn = 0;
      break;
    }
    case 'sit':
    case 'eat': {
      thigh = [1.5, 1.5];
      shin = [-1.45, -1.45];
      upperArm = [0.45, 0.45];
      lean = -0.08;
      if (pose === 'eat') {
        // Fork to mouth every few seconds.
        const bite = Math.max(0, Math.sin(time * 1.6 + phase * 3));
        upperArm = [0.45 + bite * 0.35, 0.45];
        forearm = [1.1 + bite * 1.0, 1.1];
      } else {
        // Hands on a console: a little typing.
        forearm = [
          1.1 + Math.sin(time * 7 + phase) * 0.05,
          1.1 + Math.cos(time * 6.3 + phase) * 0.05,
        ];
      }
      break;
    }
    case 'work': {
      upperArm = [
        0.7 + Math.sin(time * 2.2 + phase) * 0.12,
        0.6 + Math.cos(time * 1.9 + phase) * 0.12,
      ];
      forearm = [0.9, 1.0];
      lean = -0.12;
      nod = 0.25;
      break;
    }
    case 'talk': {
      const gesture = Math.max(0, Math.sin(time * 2.6 + phase));
      upperArm = [0.25 + gesture * 0.5, 0.05];
      forearm = [0.6 + gesture * 0.8, 0.2];
      armOut = 0.12;
      nod = Math.sin(time * 4.1 + phase) * 0.08;
      break;
    }
    case 'lie': {
      thigh = [0.04, 0.04];
      armOut = 0.05;
      turn = 0.35;
      // On the back, head pointing the way the body faces, resting on the mattress.
      base = compose(
        root,
        compose(
          rotY(Math.PI),
          compose(translate(0, 0.11 * w, hipHeight * 0.95), rotX(Math.PI / 2)),
        ),
      );
      break;
    }
    default:
      break;
  }

  const sitting = pose === 'sit' || pose === 'eat';
  // The pelvis: above the feet standing, above the back of the seat sitting.
  const pelvis = compose(
    base,
    compose(
      translate(0, sitting ? state.seat + 0.06 : hipHeight + lift, sitting ? -0.16 : 0),
      rotX(0),
    ),
  );
  const { top, trousers, boots, skin, hair, accent } = palette;

  emit([0.34 * w, 0.17 * h, 0.21 * w], compose(pelvis, translate(0, 0.03, 0)), trousers);
  for (const side of [-1, 1] as const) {
    const i = side < 0 ? 0 : 1;
    const hip = compose(pelvis, compose(translate(side * 0.095 * w, 0, 0), rotX(thigh[i]!)));
    emit([0.14 * w, legLength, 0.15 * w], compose(hip, translate(0, -legLength / 2, 0)), trousers);
    const knee = compose(hip, compose(translate(0, -legLength, 0), rotX(shin[i]!)));
    emit([0.12 * w, legLength, 0.13 * w], compose(knee, translate(0, -legLength / 2, 0)), trousers);
    emit([0.12 * w, 0.08, 0.24], compose(knee, translate(0, -legLength - 0.02, 0.05)), boots);
  }

  const torso = compose(pelvis, compose(translate(0, 0.1, 0), rotX(lean)));
  emit([0.38 * w, torsoLength, 0.22 * w], compose(torso, translate(0, torsoLength / 2, 0)), top);
  // A belt between top and trousers.
  emit([0.385 * w, 0.05, 0.225 * w], compose(torso, translate(0, 0.01, 0)), boots);

  const shoulderY = torsoLength - 0.06 * h;
  for (const side of [-1, 1] as const) {
    const i = side < 0 ? 0 : 1;
    const shoulder = compose(
      torso,
      compose(
        translate(side * 0.235 * w, shoulderY, 0),
        compose(rotZ(side * armOut), rotX(upperArm[i]!)),
      ),
    );
    emit([0.1 * w, 0.3 * h, 0.11 * w], compose(shoulder, translate(0, -0.14 * h, 0)), top);
    const elbow = compose(shoulder, compose(translate(0, -0.29 * h, 0), rotX(forearm[i]!)));
    emit([0.085 * w, 0.22 * h, 0.09 * w], compose(elbow, translate(0, -0.11 * h, 0)), top);
    emit([0.08, 0.09, 0.09], compose(elbow, translate(0, -0.25 * h, 0)), skin);
    if (state.group === 'officer' || state.group === 'chief') {
      emit(
        [0.11, 0.02, 0.12],
        compose(torso, translate(side * 0.13 * w, torsoLength + 0.005, 0)),
        accent,
      );
    }
  }

  const neck = compose(
    torso,
    compose(translate(0, torsoLength + 0.02, 0), compose(rotY(turn), rotX(-nod))),
  );
  emit([0.08, 0.07, 0.08], compose(neck, translate(0, 0.02, 0)), skin);
  const head = compose(neck, translate(0, 0.16 * h, 0.01));
  emit([0.19, 0.23 * h, 0.21], head, skin);
  // Eyes, so you can tell which way someone looks.
  for (const side of [-1, 1]) {
    emit([0.032, 0.022, 0.012], compose(head, translate(side * 0.046, 0.018 * h, 0.107)), EYES);
  }
  emitHair(look, head, h, hair, emit);
  emitWear(state, torso, pelvis, head, torsoLength, h, w, emit);
}

function emitHair(look: Look, head: Frame, h: number, colour: Vec3, emit: Emit): void {
  const top = 0.115 * h;
  switch (look.style) {
    case 'bald':
      break;
    case 'buzz':
      emit([0.2, 0.03, 0.22], compose(head, translate(0, top, -0.005)), colour);
      break;
    case 'curly':
      emit([0.23, 0.09, 0.24], compose(head, translate(0, top + 0.01, -0.01)), colour);
      emit([0.22, 0.12, 0.06], compose(head, translate(0, 0.02, -0.11)), colour);
      break;
    case 'long':
      emit([0.21, 0.06, 0.23], compose(head, translate(0, top, -0.005)), colour);
      emit([0.21, 0.3 * h, 0.06], compose(head, translate(0, -0.06, -0.11)), colour);
      break;
    case 'bun':
      emit([0.2, 0.05, 0.22], compose(head, translate(0, top, -0.005)), colour);
      emit([0.1, 0.09, 0.09], compose(head, translate(0, 0.07, -0.14)), colour);
      break;
    case 'ponytail':
      emit([0.2, 0.05, 0.22], compose(head, translate(0, top, -0.005)), colour);
      emit([0.06, 0.22, 0.06], compose(head, translate(0, -0.03, -0.13)), colour);
      break;
    default:
      emit([0.205, 0.06, 0.225], compose(head, translate(0, top, -0.005)), colour);
      emit([0.2, 0.08, 0.04], compose(head, translate(0, 0.06, -0.1)), colour);
  }
  if (look.beard) emit([0.17, 0.08, 0.04], compose(head, translate(0, -0.08 * h, 0.1)), colour);
}

function emitWear(
  state: BodyState,
  torso: Frame,
  pelvis: Frame,
  head: Frame,
  torsoLength: number,
  h: number,
  w: number,
  emit: Emit,
): void {
  const { palette } = state;
  switch (state.look.wear) {
    case 'apron':
      emit(
        [0.32 * w, torsoLength * 0.8, 0.02],
        compose(torso, translate(0, torsoLength * 0.4, 0.115 * w)),
        palette.wear,
      );
      emit([0.32 * w, 0.32, 0.02], compose(pelvis, translate(0, -0.12, 0.11 * w)), palette.wear);
      break;
    case 'coat':
      emit(
        [0.4 * w, torsoLength + 0.02, 0.235 * w],
        compose(torso, translate(0, torsoLength / 2, 0)),
        palette.wear,
      );
      emit([0.36 * w, 0.42, 0.23 * w], compose(pelvis, translate(0, -0.16, 0)), palette.wear);
      break;
    case 'beret':
      emit(
        [0.22, 0.05, 0.23],
        compose(head, compose(translate(0.02, 0.13 * h, 0), rotZ(-0.18))),
        palette.accent,
      );
      break;
    case 'cap':
      emit([0.21, 0.06, 0.22], compose(head, translate(0, 0.14 * h, 0)), palette.accent);
      emit([0.18, 0.015, 0.08], compose(head, translate(0, 0.115 * h, 0.13)), palette.accent);
      break;
    case 'headset':
      emit([0.215, 0.02, 0.05], compose(head, translate(0, 0.125 * h, 0)), palette.accent);
      emit([0.03, 0.07, 0.07], compose(head, translate(0.105, 0, 0)), palette.accent);
      break;
    case 'glasses':
      emit([0.17, 0.035, 0.01], compose(head, translate(0, 0.02, 0.107)), palette.accent);
      break;
    default:
      break;
  }
}

// ---- Transform maths ------------------------------------------------------------------------

export const IDENTITY: Frame = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

export function translate(x: number, y: number, z: number): Frame {
  return { r: IDENTITY.r, t: [x, y, z] };
}

/** About the vertical axis; yaw 0 faces +z, as the camera does. */
export function rotY(a: number): Frame {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return { r: [c, 0, s, 0, 1, 0, -s, 0, c], t: [0, 0, 0] };
}

/** About x: a limb hanging down (-y) swings forward (+z) for positive angles. */
export function rotX(a: number): Frame {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return { r: [1, 0, 0, 0, c, s, 0, -s, c], t: [0, 0, 0] };
}

/** About z: positive tips +x up. */
export function rotZ(a: number): Frame {
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return { r: [c, -s, 0, s, c, 0, 0, 0, 1], t: [0, 0, 0] };
}

/** `outer` after `inner`: a point goes through `inner` first. */
export function compose(outer: Frame, inner: Frame): Frame {
  const a = outer.r;
  const b = inner.r;
  const r = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Mat3;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      r[row * 3 + col] =
        a[row * 3]! * b[col]! + a[row * 3 + 1]! * b[3 + col]! + a[row * 3 + 2]! * b[6 + col]!;
    }
  }
  return { r, t: apply(outer, inner.t) };
}

/** A point through a frame. */
export function apply(frame: Frame, [x, y, z]: Vec3): Vec3 {
  const { r, t } = frame;
  return [
    r[0] * x + r[1] * y + r[2] * z + t[0],
    r[3] * x + r[4] * y + r[5] * z + t[1],
    r[6] * x + r[7] * y + r[8] * z + t[2],
  ];
}

// ---- Colours ----------------------------------------------------------------------------------

const EYES: Vec3 = [0.07, 0.06, 0.06];
const SKIN = ['#f1d3b8', '#dfb08b', '#c38b61', '#9a6844', '#6e4a31', '#4a3123'];
const HAIR: Record<Look['hair'], string> = {
  black: '#1c1917',
  'dark-brown': '#3a2a1f',
  brown: '#694a2e',
  auburn: '#8a3f22',
  blonde: '#c8a46a',
  grey: '#9b9893',
};
/** Uniform colours by department (design doc §11: uniform colour by department). */
const UNIFORM: Record<Department, string> = {
  command: '#2a3a58',
  operations: '#2d5d88',
  weapons: '#7c2e2a',
  engineering: '#ad6a2b',
  supply: '#6a6a4c',
  medical: '#c9d3d1',
  marines: '#4b5936',
};

/** The colours a crew member wears, from their look, group and department. */
export function paletteFor(look: Look, group: Group, department: Department): Palette {
  const marine = department === 'marines';
  return {
    skin: rgb(SKIN[look.skin] ?? SKIN[2]!),
    hair: rgb(HAIR[look.hair]),
    top: rgb(UNIFORM[department]),
    trousers: rgb(marine ? '#3e4a2c' : '#222838'),
    boots: rgb('#151617'),
    accent: rgb(
      look.wear === 'beret'
        ? '#5a1d2a'
        : look.wear === 'headset' || look.wear === 'glasses'
          ? '#1e2124'
          : group === 'officer'
            ? '#c9a227'
            : group === 'chief'
              ? '#c3c7cb'
              : '#1f2a3d',
    ),
    wear: rgb(look.wear === 'coat' ? '#eef1f0' : '#e8e5dd'),
  };
}

function rgb(hex: string): Vec3 {
  const value = Number.parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
