/**
 * Where a person can stand on a deck, as a grid of small squares, and how to walk from one point
 * to another: A* over the grid, then straightened into a few waypoints. Built from the layout's
 * blockers (walls, furniture, ladder wells) grown by a body's radius, so doorways stay open and
 * nobody walks through a table. Pure maths; the crew walk with it and the tests check with it.
 */
import type { Point } from '../../content/ship';
import type { Area } from './coords';
import type { DeckLayout } from './layout';

export interface WalkGrid {
  readonly deck: number;
  /** The grid's corner on the plan and the size of a square, in metres. */
  readonly x0: number;
  readonly y0: number;
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  /** 1 where a body of the grid's radius can stand. */
  readonly free: Uint8Array;
}

/** Blockers lower than this don't stop a body (a raised sill, a rug). */
const BODY_HEIGHT = 1.7;

/** The walkable squares of a deck for a body of `radius` metres. */
export function walkGrid(layout: DeckLayout, radius: number, cell = 0.2): WalkGrid {
  const xs = layout.spaces.flatMap((space) => [space.rect.x0, space.rect.x1]);
  const ys = layout.spaces.flatMap((space) => [space.rect.y0, space.rect.y1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const columns = Math.ceil((Math.max(...xs) - x0) / cell);
  const rows = Math.ceil((Math.max(...ys) - y0) / cell);
  const free = new Uint8Array(columns * rows);
  const grid = { deck: layout.deck.deck, x0, y0, cell, columns, rows, free };

  // Inside some space, then minus every blocker grown by the radius.
  for (const space of layout.spaces) paint(grid, space.rect, 1);
  for (const blocker of layout.blockers) {
    if (blocker.bottom >= BODY_HEIGHT) continue;
    const { area } = blocker;
    paint(
      grid,
      { x0: area.x0 - radius, y0: area.y0 - radius, x1: area.x1 + radius, y1: area.y1 + radius },
      0,
    );
  }
  return grid;
}

/** Sets every square whose centre lies inside `area`. */
function paint(grid: WalkGrid, area: Area, value: 0 | 1): void {
  const { x0, y0, cell, columns, rows } = grid;
  const c0 = Math.max(0, Math.ceil((area.x0 - x0) / cell - 0.5));
  const c1 = Math.min(columns - 1, Math.floor((area.x1 - x0) / cell - 0.5));
  const r0 = Math.max(0, Math.ceil((area.y0 - y0) / cell - 0.5));
  const r1 = Math.min(rows - 1, Math.floor((area.y1 - y0) / cell - 0.5));
  for (let r = r0; r <= r1; r++) grid.free.fill(value, r * columns + c0, r * columns + c1 + 1);
}

function indexOf(grid: WalkGrid, x: number, y: number): number {
  const c = Math.floor((x - grid.x0) / grid.cell);
  const r = Math.floor((y - grid.y0) / grid.cell);
  return c < 0 || r < 0 || c >= grid.columns || r >= grid.rows ? -1 : r * grid.columns + c;
}

function centreOf(grid: WalkGrid, index: number): Point {
  const c = index % grid.columns;
  const r = Math.floor(index / grid.columns);
  return [grid.x0 + (c + 0.5) * grid.cell, grid.y0 + (r + 0.5) * grid.cell];
}

export function isFree(grid: WalkGrid, x: number, y: number): boolean {
  const index = indexOf(grid, x, y);
  return index >= 0 && grid.free[index] === 1;
}

/** The free square nearest to a point, within `reach` metres; null if there is none. */
export function nearestFree(grid: WalkGrid, x: number, y: number, reach = 1.5): Point | null {
  if (isFree(grid, x, y)) return [x, y];
  const steps = Math.ceil(reach / grid.cell);
  let best: Point | null = null;
  let bestDistance = Infinity;
  for (let dr = -steps; dr <= steps; dr++) {
    for (let dc = -steps; dc <= steps; dc++) {
      const px = x + dc * grid.cell;
      const py = y + dr * grid.cell;
      const index = indexOf(grid, px, py);
      if (index < 0 || grid.free[index] !== 1) continue;
      const [cx, cy] = centreOf(grid, index);
      const distance = Math.hypot(cx - x, cy - y);
      if (distance < bestDistance && distance <= reach) {
        best = [cx, cy];
        bestDistance = distance;
      }
    }
  }
  return best;
}

/**
 * A walk from `from` to `to`: A* over free squares (diagonals only where both sides are open),
 * then pulled straight wherever the way is clear. Starts and ends at the given points, which
 * should be free (see nearestFree). Null if there is no way.
 */
export function findPath(grid: WalkGrid, from: Point, to: Point): Point[] | null {
  const start = indexOf(grid, from[0], from[1]);
  const goal = indexOf(grid, to[0], to[1]);
  if (start < 0 || goal < 0 || grid.free[start] !== 1 || grid.free[goal] !== 1) return null;
  if (start === goal) return [from, to];

  const { columns, free } = grid;
  const size = free.length;
  const cost = new Float64Array(size).fill(Infinity);
  const came = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const heap = new MinHeap();
  const [gc, gr] = [goal % columns, Math.floor(goal / columns)];
  const guess = (index: number) => {
    const dx = Math.abs((index % columns) - gc);
    const dy = Math.abs(Math.floor(index / columns) - gr);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  cost[start] = 0;
  heap.push(start, guess(start));
  while (heap.size > 0) {
    const current = heap.pop();
    if (current === goal) break;
    if (closed[current]) continue;
    closed[current] = 1;
    const c = current % columns;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nc = c + dc;
        const next = current + dr * columns + dc;
        if (nc < 0 || nc >= columns || next < 0 || next >= size || free[next] !== 1) continue;
        // No cutting corners: a diagonal needs both of its side squares open.
        if (
          dr !== 0 &&
          dc !== 0 &&
          (free[current + dc] !== 1 || free[current + dr * columns] !== 1)
        ) {
          continue;
        }
        const step = dr !== 0 && dc !== 0 ? Math.SQRT2 : 1;
        const total = cost[current]! + step;
        if (total < cost[next]!) {
          cost[next] = total;
          came[next] = current;
          heap.push(next, total + guess(next));
        }
      }
    }
  }
  if (came[goal] === -1) return null;

  const cells: number[] = [];
  for (let at = goal; at !== -1; at = came[at]!) cells.push(at);
  cells.reverse();
  const points: Point[] = [from, ...cells.slice(1, -1).map((index) => centreOf(grid, index)), to];
  return straighten(grid, points);
}

/** Drops waypoints wherever the straight line between the ones either side is all free. */
function straighten(grid: WalkGrid, points: Point[]): Point[] {
  const out: Point[] = [points[0]!];
  let anchor = 0;
  for (let i = 2; i < points.length; i++) {
    if (!clearLine(grid, points[anchor]!, points[i]!)) {
      out.push(points[i - 1]!);
      anchor = i - 1;
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** True when every square the line from a to b passes through is free (exact grid walk). */
export function clearLine(grid: WalkGrid, [ax, ay]: Point, [bx, by]: Point): boolean {
  const { x0, y0, cell } = grid;
  // Amanatides–Woo traversal: step from square to square along the line.
  let c = Math.floor((ax - x0) / cell);
  let r = Math.floor((ay - y0) / cell);
  const endC = Math.floor((bx - x0) / cell);
  const endR = Math.floor((by - y0) / cell);
  const dx = bx - ax;
  const dy = by - ay;
  const stepC = Math.sign(dx);
  const stepR = Math.sign(dy);
  const deltaX = stepC !== 0 ? cell / Math.abs(dx) : Infinity;
  const deltaY = stepR !== 0 ? cell / Math.abs(dy) : Infinity;
  let maxX =
    stepC > 0 ? (x0 + (c + 1) * cell - ax) / dx : stepC < 0 ? (x0 + c * cell - ax) / dx : Infinity;
  let maxY =
    stepR > 0 ? (y0 + (r + 1) * cell - ay) / dy : stepR < 0 ? (y0 + r * cell - ay) / dy : Infinity;
  const free = (col: number, row: number) =>
    col >= 0 &&
    row >= 0 &&
    col < grid.columns &&
    row < grid.rows &&
    grid.free[row * grid.columns + col] === 1;
  for (let guard = 0; guard < grid.columns + grid.rows + 4; guard++) {
    if (!free(c, r)) return false;
    if (c === endC && r === endR) return true;
    if (Math.abs(maxX - maxY) < 1e-12) {
      // Through a corner: both squares beside it must be open too.
      if (!free(c + stepC, r) || !free(c, r + stepR)) return false;
      c += stepC;
      r += stepR;
      maxX += deltaX;
      maxY += deltaY;
    } else if (maxX < maxY) {
      c += stepC;
      maxX += deltaX;
    } else {
      r += stepR;
      maxY += deltaY;
    }
  }
  return false;
}

/** Every square you can walk to from `from`, as a test on points. */
export function reachableFrom(grid: WalkGrid, from: Point): (x: number, y: number) => boolean {
  const { columns, free } = grid;
  const seen = new Uint8Array(free.length);
  const first = indexOf(grid, from[0], from[1]);
  const queue = first >= 0 && free[first] === 1 ? [first] : [];
  for (const index of queue) seen[index] = 1;
  while (queue.length > 0) {
    const at = queue.pop()!;
    const c = at % columns;
    for (const [next, ok] of [
      [at - 1, c > 0],
      [at + 1, c < columns - 1],
      [at - columns, true],
      [at + columns, true],
    ] as const) {
      if (!ok || next < 0 || next >= free.length || seen[next] || free[next] !== 1) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return (x, y) => {
    const index = indexOf(grid, x, y);
    return index >= 0 && seen[index] === 1;
  };
}

/** A binary min-heap of grid indices by priority, for A*. */
class MinHeap {
  private readonly items: number[] = [];
  private readonly keys: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, key: number): void {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      items[i] = items[parent]!;
      keys[i] = keys[parent]!;
      i = parent;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): number {
    const { items, keys } = this;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length > 0) {
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        let smallestKey = lastKey;
        if (left < items.length && keys[left]! < smallestKey) {
          smallest = left;
          smallestKey = keys[left]!;
        }
        if (right < items.length && keys[right]! < smallestKey) smallest = right;
        if (smallest === i) break;
        items[i] = items[smallest]!;
        keys[i] = keys[smallest]!;
        i = smallest;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}
