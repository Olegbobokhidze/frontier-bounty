/** Pure derivation of what each cell shows, from engine state. No DOM; unit-tested. */
import type { BountyContext } from '../engine/bounty/machine';
import { cellCount } from '../engine/spatial/grid';

export const CellView = {
  HIDDEN: 'hidden',
  PENDING: 'pending',
  REVEAL_SAFE: 'reveal-safe',
  SAFE: 'safe',
  REVEAL_HAZARD: 'reveal-hazard',
  HAZARD_HIT: 'hazard-hit',
  HAZARD: 'hazard',
  MISSED: 'missed',
} as const;
export type CellView = (typeof CellView)[keyof typeof CellView];

export const isFaceUp = (v: CellView) => v !== CellView.HIDDEN && v !== CellView.PENDING;

export function boardSize(ctx: BountyContext): { rows: number; cols: number } {
  const p = ctx.round?.params ?? ctx.params;
  return { rows: p.rows, cols: p.cols };
}

export function cellViews(ctx: BountyContext): CellView[] {
  const size = boardSize(ctx);
  const views: CellView[] = new Array<CellView>(cellCount(size)).fill(CellView.HIDDEN);
  const round = ctx.round;
  if (!round) return views;

  for (const p of round.picks) views[p.cell] = CellView.SAFE;

  if (round.pendingCell !== null) {
    const r = round.pendingResult;
    views[round.pendingCell] = !r ? CellView.PENDING : r.outcome === 'safe' ? CellView.REVEAL_SAFE : CellView.REVEAL_HAZARD;
  }

  const d = round.disclosure;
  if (d) {
    const hazards = new Set(d.hazards);
    for (let i = 0; i < views.length; i++) {
      if (i === d.hitCell) views[i] = CellView.HAZARD_HIT;
      else if (hazards.has(i)) views[i] = CellView.HAZARD;
      else if (views[i] === CellView.HIDDEN) views[i] = CellView.MISSED;
    }
  }
  return views;
}

/** Multiplier earned at each picked cell (for the small badge on revealed claims). */
export function pickMultipliers(ctx: BountyContext): ReadonlyMap<number, number> {
  return new Map((ctx.round?.picks ?? []).map((p) => [p.cell, p.multiplier]));
}
