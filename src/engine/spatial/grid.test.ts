import { describe, expect, it } from 'vitest';
import { cellCenter, cellLabel, circleIntersectsAabb, fitLayout, hitTest, move, neighbours, toCell, toIndex } from './grid';

const g = { rows: 5, cols: 5 };

describe('coordinates', () => {
  it('round-trips index ⇄ cell', () => {
    for (let i = 0; i < 25; i++) expect(toIndex(g, toCell(g, i))).toBe(i);
    expect(toCell({ rows: 3, cols: 4 }, 7)).toEqual({ row: 1, col: 3 });
  });

  it('labels cells spreadsheet-style', () => {
    expect(cellLabel(g, 0)).toBe('A1');
    expect(cellLabel(g, 12)).toBe('C3');
    expect(cellLabel(g, 24)).toBe('E5');
  });

  it('neighbours respect edges', () => {
    expect(neighbours(g, 0).sort()).toEqual([1, 5]);
    expect(neighbours(g, 12, true)).toHaveLength(8);
  });

  it('keyboard movement clamps at the edges', () => {
    expect(move(g, 0, 'up')).toBe(0);
    expect(move(g, 0, 'right')).toBe(1);
    expect(move(g, 24, 'down')).toBe(24);
    expect(move(g, 12, 'left')).toBe(11);
  });
});

describe('layout + hit-testing', () => {
  const l = fitLayout(g, { width: 500, height: 400 });

  it('fits the box and centres the remainder', () => {
    const w = l.cell * 5 + l.gap * 4;
    expect(w).toBeLessThanOrEqual(500);
    expect(l.cell * 5 + l.gap * 4).toBeLessThanOrEqual(400);
    expect(l.origin.x).toBe(Math.floor((500 - w) / 2));
  });

  it('every cell centre hits its own cell', () => {
    for (let i = 0; i < 25; i++) expect(hitTest(l, cellCenter(l, i))).toBe(i);
  });

  it('gaps and outside points miss', () => {
    const gapX = l.origin.x + l.cell + Math.floor(l.gap / 2);
    expect(hitTest(l, { x: gapX, y: l.origin.y + 5 })).toBeNull();
    expect(hitTest(l, { x: l.origin.x - 1, y: l.origin.y + 5 })).toBeNull();
    expect(hitTest(l, { x: 9999, y: 9999 })).toBeNull();
  });

  it('circle/AABB overlap (peg collision primitive)', () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    expect(circleIntersectsAabb({ x: 12, y: 5 }, 2, box)).toBe(true);
    expect(circleIntersectsAabb({ x: 13, y: 5 }, 2, box)).toBe(false);
  });
});
