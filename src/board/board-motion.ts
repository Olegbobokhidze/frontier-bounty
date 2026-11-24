/**
 * Pure helpers for board-level motion (ADR-0007): the end-of-round sweep ripples out from the cell that decided
 * the round, and a blast jolts nearby lids away from it. Both feed CSS custom properties that drive
 * transform-only animations. No DOM; unit-tested.
 */
import { toCell, type GridSize } from '../engine/spatial/grid';

/** Distance (in cells) from `origin` to every cell; the sweep delay is proportional to it. */
export function rippleDistances(g: GridSize, origin: number | null): number[] {
  const n = g.rows * g.cols;
  if (origin === null || origin < 0 || origin >= n) {
    // No origin: a gentle diagonal wave from the top-left corner.
    return Array.from({ length: n }, (_, i) => {
      const c = toCell(g, i);
      return (c.row + c.col) * 0.5;
    });
  }
  const o = toCell(g, origin);
  return Array.from({ length: n }, (_, i) => {
    const c = toCell(g, i);
    return Math.round(Math.hypot(c.row - o.row, c.col - o.col) * 10) / 10;
  });
}

export type Jolt = { readonly x: number; readonly y: number; readonly strength: number };

/**
 * Lids within `radius` cells of a blast are kicked away from it: unit direction × falloff (1 at the nearest
 * ring, fading to 0 at the radius). The blast cell itself is excluded (it gets its own punch).
 */
export function blastJolts(g: GridSize, cell: number, radius = 2.4): ReadonlyMap<number, Jolt> {
  const out = new Map<number, Jolt>();
  const n = g.rows * g.cols;
  if (cell < 0 || cell >= n) return out;
  const o = toCell(g, cell);
  for (let i = 0; i < n; i++) {
    if (i === cell) continue;
    const c = toCell(g, i);
    const dx = c.col - o.col;
    const dy = c.row - o.row;
    const d = Math.hypot(dx, dy);
    if (d > radius) continue;
    const strength = Math.max(0, Math.min(1, (radius - d) / (radius - 1)));
    if (strength <= 0) continue;
    out.set(i, { x: dx / d, y: dy / d, strength: Math.round(strength * 100) / 100 });
  }
  return out;
}
