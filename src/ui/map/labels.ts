/**
 * Places a room's name inside its rectangle on the map without covering the room's symbols.
 * Pure maths, so it is unit-tested. Sizes are in map units (metres on the deck plan); the SVG
 * scales them to pixels.
 */
import type { Point, Rect } from '../../content/ship';

/** Average glyph width as a fraction of the font size (system sans-serif, semibold). */
const CHAR_WIDTH = 0.56;
/** Line spacing as a multiple of the font size. */
export const LINE_HEIGHT = 1.15;
const MAX_LINES = 3;
const MAX_SIZE = 0.95;
const MIN_SIZE = 0.45;
const SIZE_STEP = 0.05;
/** Space kept clear between the text and the room's walls. */
const PADDING = 0.3;
/** Space kept clear between the text and the centre of a symbol (about one symbol's radius). */
const SYMBOL_CLEARANCE = 0.55;
/** Where to try the label, as a fraction of the room's depth: middle, then upper, then lower. */
const SLOTS = [0.5, 0.27, 0.73];

export interface PlacedLabel {
  readonly lines: readonly string[];
  /** Font size in metres. */
  readonly size: number;
  /** Centre of the text block. */
  readonly x: number;
  readonly y: number;
}

/**
 * The largest label that fits in `rect` and stays clear of every point in `avoid`, wrapped over
 * up to three lines. If nothing fits clear of the symbols, the largest label centred in the room;
 * null when nothing legible fits at all.
 */
export function placeLabel(
  text: string,
  rect: Rect,
  avoid: readonly Point[] = [],
): PlacedLabel | null {
  const [x, y, width, depth] = rect;
  const centreX = x + width / 2;
  const words = text.split(/\s+/).filter(Boolean);
  let fallback: PlacedLabel | null = null;

  for (let size = MAX_SIZE; size >= MIN_SIZE - 1e-9; size -= SIZE_STEP) {
    const lines = wrap(words, Math.floor((width - PADDING * 2) / (size * CHAR_WIDTH)));
    const blockHeight = (lines?.length ?? 0) * size * LINE_HEIGHT;
    if (!lines || blockHeight > depth - PADDING * 2) continue;
    const rounded = Math.round(size * 100) / 100;
    fallback ??= { lines, size: rounded, x: centreX, y: y + depth / 2 };

    const halfWidth = (Math.max(...lines.map((line) => line.length)) * size * CHAR_WIDTH) / 2;
    for (const slot of SLOTS) {
      const centreY = y + depth * slot;
      const fitsInside =
        centreY - blockHeight / 2 >= y + PADDING - 1e-9 &&
        centreY + blockHeight / 2 <= y + depth - PADDING + 1e-9;
      const clear = avoid.every(
        ([px, py]) =>
          Math.abs(px - centreX) > halfWidth + SYMBOL_CLEARANCE ||
          Math.abs(py - centreY) > blockHeight / 2 + SYMBOL_CLEARANCE,
      );
      if (fitsInside && clear) return { lines, size: rounded, x: centreX, y: centreY };
    }
  }
  return fallback;
}

/** Greedy word wrap to `perLine` characters; null if a word is too long or it needs too many lines. */
function wrap(words: readonly string[], perLine: number): string[] | null {
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > perLine) return null;
    if (!line) line = word;
    else if (line.length + 1 + word.length <= perLine) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length <= MAX_LINES ? lines : null;
}
