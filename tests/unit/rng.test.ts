import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/sim/rng';

function sequence(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.nextUint32());
}

describe('Rng', () => {
  it('produces the same sequence for the same seed', () => {
    expect(sequence(Rng.fromSeed(42), 100)).toEqual(sequence(Rng.fromSeed(42), 100));
  });

  it('produces different sequences for neighbouring seeds', () => {
    const a = sequence(Rng.fromSeed(1), 20);
    const b = sequence(Rng.fromSeed(2), 20);
    expect(a.filter((value, i) => value === b[i])).toHaveLength(0);
  });

  it('continues identically after a state round trip', () => {
    const original = Rng.fromSeed(7);
    sequence(original, 50);
    const restored = Rng.fromState(JSON.parse(JSON.stringify(original.state())));
    expect(sequence(restored, 100)).toEqual(sequence(original, 100));
  });

  it('keeps floats in [0, 1)', () => {
    const rng = Rng.fromSeed(3);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('keeps integers within inclusive bounds and hits both ends', () => {
    const rng = Rng.fromSeed(4);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) {
      const n = rng.int(-2, 2);
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(2);
      seen.add(n);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2]);
  });

  it('is roughly uniform', () => {
    const rng = Rng.fromSeed(5);
    const buckets = new Array<number>(10).fill(0);
    const samples = 100_000;
    for (let i = 0; i < samples; i++) {
      const bucket = rng.int(0, 9);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) expect(Math.abs(count - samples / 10)).toBeLessThan(samples / 100);
  });

  it('rejects invalid input', () => {
    const rng = Rng.fromSeed(6);
    expect(() => Rng.fromSeed(1.5)).toThrow(RangeError);
    expect(() => rng.int(3, 1)).toThrow(RangeError);
    expect(() => rng.int(0.5, 2)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('shuffles without losing or changing the input', () => {
    const rng = Rng.fromSeed(8);
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const shuffled = rng.shuffled(input);
    expect([...shuffled].sort((x, y) => x - y)).toEqual([...input]);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('picks only from the list', () => {
    const rng = Rng.fromSeed(9);
    const options = ['bridge', 'mess', 'engineering'];
    for (let i = 0; i < 100; i++) expect(options).toContain(rng.pick(options));
  });
});
