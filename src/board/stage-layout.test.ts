import { describe, expect, it } from 'vitest';
import { fitLayout } from '../engine/spatial/grid';
import type { Rect } from './scene/framing';
import { arrangeStage, STAGE } from './stage-layout';

const g5 = { rows: 5, cols: 5 };
const g8 = { rows: 8, cols: 8 };

const inside = (r: Rect, w: number, h: number) => r.x >= -0.01 && r.y >= -0.01 && r.x + r.w <= w + 0.01 && r.y + r.h <= h + 0.01;
const overlap = (a: Rect, b: Rect) => !(a.x + a.w <= b.x + 0.01 || b.x + b.w <= a.x + 0.01 || a.y + a.h <= b.y + 0.01 || b.y + b.h <= a.y + 0.01);

describe('arrangeStage', () => {
  it('wide desktop stage: the marshal stands beside the board, full body', () => {
    const a = arrangeStage(g5, { width: 960, height: 640 });
    expect(a.mode).toBe('side');
    if (!a.slot) throw new Error('expected a slot');
    expect(a.slot.x + a.slot.w).toBeLessThanOrEqual(a.board.x);
    expect(a.slot.h).toBe(640);
    // the board keeps its full height: no cell was given up for the marshal
    expect(a.cell).toBeCloseTo(640 / (5 + 4 * STAGE.gapRatio), 3);
  });

  it('tall column (inspector open, portrait tablet): a waist-up strip above the board', () => {
    const a = arrangeStage(g5, { width: 535, height: 660 });
    expect(a.mode).toBe('stack');
    if (!a.slot) throw new Error('expected a slot');
    expect(a.slot.y + a.slot.h).toBeLessThanOrEqual(a.board.y);
    expect(a.slot.h).toBeGreaterThanOrEqual(STAGE.minStripH);
  });

  it('cramped phone stage: the board takes everything', () => {
    const a = arrangeStage(g5, { width: 290, height: 250 });
    expect(a.mode).toBe('board');
    expect(a.slot).toBeNull();
  });

  it('the board host always fits the grid that fitLayout will place in it', () => {
    const a = arrangeStage(g8, { width: 700, height: 520 });
    const l = fitLayout(g8, { width: a.board.w, height: a.board.h });
    expect(Math.abs(l.cell - a.cell)).toBeLessThan(1.01);
  });

  it('for any stage: rects inside, never overlapping, cells never sacrificed beyond the budget', () => {
    for (const g of [g5, g8, { rows: 4, cols: 4 }]) {
      for (let w = 180; w <= 1500; w += 37) {
        for (let h = 160; h <= 1100; h += 41) {
          const a = arrangeStage(g, { width: w, height: h });
          const best = arrangeStage(g, { width: w, height: h });
          expect(best).toEqual(a); // deterministic
          expect(inside(a.board, w, h)).toBe(true);
          const boardOnly = Math.min(w / (g.cols + (g.cols - 1) * STAGE.gapRatio), h / (g.rows + (g.rows - 1) * STAGE.gapRatio));
          expect(a.cell).toBeGreaterThanOrEqual(Math.max(boardOnly * (1 - STAGE.maxCellLoss), Math.min(boardOnly, STAGE.minCell)) - 0.01);
          if (a.slot) {
            expect(inside(a.slot, w, h)).toBe(true);
            expect(overlap(a.slot, a.board)).toBe(false);
          }
        }
      }
    }
  });
});
