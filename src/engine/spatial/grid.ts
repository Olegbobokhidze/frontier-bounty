/**
 * Spatial maths shared by every spatial mode (ADR-0002). Pure; no DOM.
 * Cells are addressed as {row, col} or a flat index = row * cols + col.
 */

export type GridSize = { readonly rows: number; readonly cols: number };
export type Cell = { readonly row: number; readonly col: number };
export type Vec2 = { readonly x: number; readonly y: number };
export type AABB = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export const cellCount = (g: GridSize): number => g.rows * g.cols;

export function toIndex(g: GridSize, c: Cell): number {
  return c.row * g.cols + c.col;
}

export function toCell(g: GridSize, index: number): Cell {
  return { row: Math.floor(index / g.cols), col: index % g.cols };
}

export function inBounds(g: GridSize, c: Cell): boolean {
  return c.row >= 0 && c.col >= 0 && c.row < g.rows && c.col < g.cols;
}

export function isValidIndex(g: GridSize, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < cellCount(g);
}

/** Spreadsheet-style label: column letter + 1-based row, e.g. {row:2,col:2} → "C3". */
export function cellLabel(g: GridSize, indexOrCell: number | Cell): string {
  const c = typeof indexOrCell === 'number' ? toCell(g, indexOrCell) : indexOrCell;
  return `${String.fromCharCode(65 + c.col)}${c.row + 1}`;
}

const DIRS_4: readonly Cell[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];
const DIRS_8: readonly Cell[] = [...DIRS_4, { row: -1, col: -1 }, { row: -1, col: 1 }, { row: 1, col: -1 }, { row: 1, col: 1 }];

export function neighbours(g: GridSize, index: number, diagonal = false): number[] {
  const c = toCell(g, index);
  return (diagonal ? DIRS_8 : DIRS_4)
    .map((d) => ({ row: c.row + d.row, col: c.col + d.col }))
    .filter((n) => inBounds(g, n))
    .map((n) => toIndex(g, n));
}

export const Direction = { UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right' } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** Keyboard navigation: move one cell, clamped to the edges (no wrap). */
export function move(g: GridSize, index: number, dir: Direction): number {
  const c = toCell(g, index);
  const next: Cell =
    dir === 'up'
      ? { row: Math.max(0, c.row - 1), col: c.col }
      : dir === 'down'
        ? { row: Math.min(g.rows - 1, c.row + 1), col: c.col }
        : dir === 'left'
          ? { row: c.row, col: Math.max(0, c.col - 1) }
          : { row: c.row, col: Math.min(g.cols - 1, c.col + 1) };
  return toIndex(g, next);
}

// ------------------------------------------------------------------ layout & hit-testing

/** Pixel layout of a grid: square cells of `cell` px separated by `gap` px, starting at `origin`. */
export type GridLayout = GridSize & { readonly origin: Vec2; readonly cell: number; readonly gap: number };

/** Fit a grid into a box: largest integer cell size; the remainder is centred. */
export function fitLayout(g: GridSize, box: { readonly width: number; readonly height: number }, gapRatio = 0.08): GridLayout {
  const unitsW = g.cols + (g.cols - 1) * gapRatio;
  const unitsH = g.rows + (g.rows - 1) * gapRatio;
  const cell = Math.max(1, Math.floor(Math.min(box.width / unitsW, box.height / unitsH)));
  const gap = Math.max(2, Math.round(cell * gapRatio));
  const w = cell * g.cols + gap * (g.cols - 1);
  const h = cell * g.rows + gap * (g.rows - 1);
  return { ...g, cell, gap, origin: { x: Math.floor((box.width - w) / 2), y: Math.floor((box.height - h) / 2) } };
}

export function cellRect(l: GridLayout, index: number): AABB {
  const c = toCell(l, index);
  return { x: l.origin.x + c.col * (l.cell + l.gap), y: l.origin.y + c.row * (l.cell + l.gap), w: l.cell, h: l.cell };
}

export function cellCenter(l: GridLayout, index: number): Vec2 {
  const r = cellRect(l, index);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Point → cell index, or null when the point is outside the grid or inside a gap. */
export function hitTest(l: GridLayout, p: Vec2): number | null {
  const step = l.cell + l.gap;
  const lx = p.x - l.origin.x;
  const ly = p.y - l.origin.y;
  if (lx < 0 || ly < 0) return null;
  const col = Math.floor(lx / step);
  const row = Math.floor(ly / step);
  if (col >= l.cols || row >= l.rows) return null;
  if (lx - col * step >= l.cell || ly - row * step >= l.cell) return null; // in the gap
  return toIndex(l, { row, col });
}

export function aabbContains(b: AABB, p: Vec2): boolean {
  return p.x >= b.x && p.y >= b.y && p.x < b.x + b.w && p.y < b.y + b.h;
}

/** Circle/AABB overlap, the primitive a peg-board (Plinko) mode needs for peg collision. */
export function circleIntersectsAabb(center: Vec2, radius: number, b: AABB): boolean {
  const cx = Math.max(b.x, Math.min(center.x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(center.y, b.y + b.h));
  const dx = center.x - cx;
  const dy = center.y - cy;
  return dx * dx + dy * dy <= radius * radius;
}
