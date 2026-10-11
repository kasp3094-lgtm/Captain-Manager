/**
 * Seeded random number generator (sfc32, seeded through splitmix32).
 *
 * All randomness in the simulation comes from an Rng, and its state is saved with the game,
 * so the same seed and the same choices always produce the same game.
 */

export interface RngState {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

const UINT32_RANGE = 0x1_0000_0000;

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(state: RngState) {
    this.a = state.a | 0;
    this.b = state.b | 0;
    this.c = state.c | 0;
    this.d = state.d | 0;
  }

  static fromSeed(seed: number): Rng {
    if (!Number.isInteger(seed)) throw new RangeError(`Seed must be an integer, got ${seed}`);
    const mix = splitmix32(seed);
    const rng = new Rng({ a: mix(), b: mix(), c: mix(), d: mix() });
    // Discard the first outputs so similar seeds diverge quickly.
    for (let i = 0; i < 12; i++) rng.nextUint32();
    return rng;
  }

  static fromState(state: RngState): Rng {
    return new Rng(state);
  }

  /** A snapshot of the generator, for save files. */
  state(): RngState {
    return { a: this.a, b: this.b, c: this.c, d: this.d };
  }

  /** Uniform integer in [0, 2^32). */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`Invalid integer range [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (0–1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** A shuffled copy (Fisher–Yates); the input is left untouched. */
  shuffled<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}
