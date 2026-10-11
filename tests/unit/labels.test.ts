import { describe, expect, it } from 'vitest';
import { placeLabel } from '../../src/ui/map/labels';

describe('placeLabel', () => {
  it('centres a short name on one line at full size in a big room', () => {
    expect(placeLabel('Bridge', [0, 0, 12, 12])).toEqual({
      lines: ['Bridge'],
      size: 0.95,
      x: 6,
      y: 6,
    });
  });

  it('wraps a long name in a narrow room, keeping every word', () => {
    const label = placeLabel('Junior berthing A', [0, 0, 4, 6])!;
    expect(label.lines.length).toBeGreaterThan(1);
    expect(label.lines.join(' ')).toBe('Junior berthing A');
  });

  it('moves the name off a symbol in the middle of the room', () => {
    const symbol: [number, number] = [5, 3];
    const label = placeLabel('Wardroom', [0, 0, 10, 6], [symbol])!;
    const halfHeight = (label.lines.length * label.size * 1.15) / 2;
    expect(Math.abs(label.y - symbol[1])).toBeGreaterThan(halfHeight);
  });

  it('falls back to the centre when no spot is clear', () => {
    const everywhere: [number, number][] = [
      [5, 1],
      [5, 3],
      [5, 5],
    ];
    const label = placeLabel('Wardroom', [0, 0, 10, 6], everywhere)!;
    expect(label.y).toBe(3);
  });

  it('gives up when nothing legible fits', () => {
    expect(placeLabel('Forward ladderwell', [0, 0, 1, 1])).toBeNull();
  });

  it('never runs a line wider than the room', () => {
    for (const width of [2, 4, 6]) {
      const label = placeLabel('Crew Heads & Showers (forward)', [0, 0, width, 6]);
      for (const line of label?.lines ?? []) {
        expect(line.length * label!.size * 0.56).toBeLessThanOrEqual(width - 0.6 + 1e-9);
      }
    }
  });
});
