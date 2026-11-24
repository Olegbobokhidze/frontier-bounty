import { describe, expect, it } from 'vitest';
import { blastJolts, rippleDistances } from './board-motion';

const g = { rows: 5, cols: 5 };

describe('rippleDistances', () => {
  it('starts at the deciding cell and grows outward', () => {
    const d = rippleDistances(g, 12); // C3, the centre
    expect(d[12]).toBe(0);
    expect(d[13]).toBe(1);
    expect(d[18]).toBeCloseTo(Math.SQRT2, 1);
    expect(d[0]).toBeGreaterThan(d[6] ?? 0);
    expect(Math.max(...d)).toBeCloseTo(Math.hypot(2, 2), 1);
  });
  it('without an origin it falls back to a diagonal wave from the top-left', () => {
    const d = rippleDistances(g, null);
    expect(d[0]).toBe(0);
    expect(d[24]).toBe(4);
    expect(d[4]).toBe(d[20]);
  });
});

describe('blastJolts', () => {
  it('kicks the nearest ring away from the blast at full strength and excludes the blast cell', () => {
    const j = blastJolts(g, 12);
    expect(j.has(12)).toBe(false);
    expect(j.get(13)).toEqual({ x: 1, y: 0, strength: 1 });
    expect(j.get(7)).toEqual({ x: 0, y: -1, strength: 1 });
    const diag = j.get(18);
    expect(diag?.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(diag?.strength).toBeLessThan(1);
    expect(diag?.strength).toBeGreaterThan(0);
  });
  it('fades with distance and stops at the radius', () => {
    const j = blastJolts(g, 0, 2.4);
    expect((j.get(2)?.strength ?? 0) < (j.get(1)?.strength ?? 0)).toBe(true);
    expect(j.has(18)).toBe(false); // (3,3) from (0,0) is 4.2 cells away
  });
  it('ignores an out-of-range cell', () => {
    expect(blastJolts(g, 99).size).toBe(0);
  });
});
