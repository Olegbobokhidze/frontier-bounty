/**
 * Stage arrangement (ADR-0007): how the character slot and the board share the stage rectangle.
 * The board is square-celled, so a stage that is not the board's aspect leaves slack on one axis. This picks
 * the arrangement that keeps the cells large (never below 40px when avoidable) and gives the marshal the
 * slack: beside the board (full body), above it (a waist-up strip), or not at all. Pure; unit-tested.
 */
import type { GridSize } from '../engine/spatial/grid';
import { frameCharacter, type Rect } from './scene/framing';

export const StageMode = { SIDE: 'side', STACK: 'stack', BOARD: 'board' } as const;
export type StageMode = (typeof StageMode)[keyof typeof StageMode];

export type StageArrangement = {
  readonly mode: StageMode;
  /** Board host rectangle (the grid is fitted and centred inside it). */
  readonly board: Rect;
  /** Character slot, or null when the board takes the whole stage. */
  readonly slot: Rect | null;
  /** Expected cell size in px, for diagnostics and tests. */
  readonly cell: number;
};

export const STAGE = {
  gap: 8,
  /** Narrowest side column worth giving the marshal. */
  minSlotW: 112,
  /** Shortest strip above the board worth giving him (waist-up framing). */
  minStripH: 64,
  /** The strip never takes more than this share of the stage height. */
  maxStripFrac: 0.42,
  /** The side column never gets wider than this × the board height. */
  maxSlotAspect: 0.78,
  /** A character arrangement may cost the board at most this share of its best cell size… */
  maxCellLoss: 0.14,
  /** …and never push cells under this (unless the board alone could not do better). */
  minCell: 44,
  /** Score cost per unit of relative cell loss (see arrangeStage). */
  cellCost: 2.5,
  /** Grid gap ratio; must match fitLayout's default. */
  gapRatio: 0.08,
} as const;

function fit(g: GridSize, w: number, h: number): { w: number; h: number; cell: number } {
  const uw = g.cols + (g.cols - 1) * STAGE.gapRatio;
  const uh = g.rows + (g.rows - 1) * STAGE.gapRatio;
  const cell = Math.max(0, Math.min(w / uw, h / uh));
  return { w: cell * uw, h: cell * uh, cell };
}

/** How big the marshal renders in a slot (0 = hidden). Full-body framing is worth a little more: the legs act too. */
export function characterScore(slot: Rect | null): number {
  const f = frameCharacter(slot);
  if (f.mode === 'hidden') return 0;
  return f.scale * (f.mode === 'full' ? 1.25 : 1);
}

/** Sweep steps between the largest board and the cell-loss budget. */
const SWEEP = 12;

export function arrangeStage(g: GridSize, stage: { readonly width: number; readonly height: number }): StageArrangement {
  const W = Math.max(0, stage.width);
  const H = Math.max(0, stage.height);
  const uw = g.cols + (g.cols - 1) * STAGE.gapRatio;
  const uh = g.rows + (g.rows - 1) * STAGE.gapRatio;
  const full: StageArrangement = { mode: 'board', board: { x: 0, y: 0, w: W, h: H }, slot: null, cell: fit(g, W, H).cell };
  const floor = Math.max(full.cell * (1 - STAGE.maxCellLoss), Math.min(full.cell, STAGE.minCell));

  const candidates: StageArrangement[] = [];
  // Beside: board on the right at full height, the marshal takes the width to its left.
  const sideMax = Math.min(H / uh, (W - STAGE.gap - STAGE.minSlotW) / uw);
  // Above: a strip across the top for a waist-up marshal, the board below it.
  const stackMax = Math.min(W / uw, (H - STAGE.gap - STAGE.minStripH) / uh);
  for (let i = 0; i <= SWEEP; i++) {
    const side = sideMax - ((sideMax - floor) * i) / SWEEP;
    if (side >= floor && side > 0) {
      const bw = side * uw;
      const bh = side * uh;
      const slotW = Math.min(W - STAGE.gap - bw, Math.max(STAGE.minSlotW, bh * STAGE.maxSlotAspect));
      const x0 = Math.max(0, (W - (slotW + STAGE.gap + bw)) / 2);
      if (slotW >= STAGE.minSlotW) candidates.push({ mode: 'side', slot: { x: x0, y: 0, w: slotW, h: H }, board: { x: x0 + slotW + STAGE.gap, y: 0, w: bw, h: H }, cell: side });
    }
    const stack = stackMax - ((stackMax - floor) * i) / SWEEP;
    if (stack >= floor && stack > 0) {
      const bh = stack * uh;
      const stripH = Math.min(H - STAGE.gap - bh, H * STAGE.maxStripFrac);
      const y0 = Math.max(0, (H - (stripH + STAGE.gap + bh)) / 2);
      if (stripH >= STAGE.minStripH) candidates.push({ mode: 'stack', slot: { x: 0, y: y0, w: W, h: stripH }, board: { x: 0, y: y0 + stripH + STAGE.gap, w: W, h: bh }, cell: stack });
    }
  }

  // Diminishing returns on character size, linear cost on cell size: a big gain for the marshal is worth a few
  // percent of cell, but a marshal who is already large does not eat into the board.
  let best: StageArrangement = full;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const s = characterScore(c.slot);
    if (s <= 0) continue;
    const score = Math.log(s) - STAGE.cellCost * (1 - c.cell / full.cell);
    if (score > bestScore + 1e-9) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
