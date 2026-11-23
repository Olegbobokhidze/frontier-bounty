import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { multiplierAt, multiplierLadder, nextSafeChance, payout, strategyRtp, survivalProbability } from './math';
import { placeHazards } from './placement';

const FAIR = { kind: 'fair', houseEdge: 0.03 } as const;

describe('multiplier maths', () => {
  it('survival probability matches the closed form', () => {
    // 25 cells, 3 hazards, 1 pick: 22/25
    expect(survivalProbability(25, 3, 1)).toBeCloseTo(22 / 25);
    expect(survivalProbability(25, 3, 2)).toBeCloseTo((22 / 25) * (21 / 24));
    expect(survivalProbability(25, 3, 23)).toBe(0);
  });

  it('fair multipliers apply the house edge and are floored to 2 decimals', () => {
    expect(multiplierAt(FAIR, 25, 3, 0)).toBe(1);
    expect(multiplierAt(FAIR, 25, 3, 1)).toBe(1.1); // 0.97 / 0.88 = 1.1022…
    expect(multiplierAt(FAIR, 25, 24, 1)).toBe(24.25); // 0.97 × 25
  });

  it('every cash-out strategy returns at most (1 - edge) and close to it', () => {
    for (const [cells, hazards] of [
      [25, 1],
      [25, 3],
      [25, 10],
      [36, 8],
      [9, 2],
    ] as const) {
      for (let k = 1; k <= cells - hazards; k++) {
        const rtp = strategyRtp(FAIR, cells, hazards, k);
        expect(rtp).toBeLessThanOrEqual(0.97 + 1e-9);
        // Flooring costs at most 0.01 of the multiplier.
        expect(rtp).toBeGreaterThan(0.97 - 0.01 * survivalProbability(cells, hazards, k) - 1e-9);
      }
    }
  });

  it('ladder is strictly increasing', () => {
    const ladder = multiplierLadder(FAIR, 25, 5);
    expect(ladder).toHaveLength(20);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeGreaterThan(ladder[i - 1] ?? 0);
  });

  it('table model uses explicit steps', () => {
    const t = { kind: 'table', steps: [1.2, 1.5, 2] } as const;
    expect(multiplierAt(t, 25, 3, 2)).toBe(1.5);
    expect(multiplierAt(t, 25, 3, 9)).toBe(2);
  });

  it('next-safe chance and payout', () => {
    expect(nextSafeChance(25, 3, 0)).toBeCloseTo(22 / 25);
    expect(payout(100, 1.1)).toBe(110);
    expect(payout(100, 50_000, 10_000)).toBe(1_000_000);
  });

  it('Monte-Carlo RTP of "pick 3 then cash out" ≈ 97%', () => {
    const rng = createRng(42);
    const trials = 60_000;
    let returned = 0;
    for (let t = 0; t < trials; t++) {
      const hazards = new Set(placeHazards(rng.next() * 2 ** 32, 25, 3));
      // Player picks cells 0,1,2 (any fixed choice is equivalent under a uniform layout).
      if (![0, 1, 2].some((c) => hazards.has(c))) returned += multiplierAt(FAIR, 25, 3, 3);
    }
    expect(returned / trials).toBeGreaterThan(0.94);
    expect(returned / trials).toBeLessThan(1.0);
  });
});

describe('placement', () => {
  it('is deterministic, distinct, sorted and in range', () => {
    const a = placeHazards(123, 25, 5);
    expect(a).toEqual(placeHazards(123, 25, 5));
    expect(new Set(a).size).toBe(5);
    expect([...a].sort((x, y) => x - y)).toEqual(a);
    for (const i of a) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(25);
    }
  });

  it('is roughly uniform across cells', () => {
    const counts = new Array<number>(25).fill(0);
    for (let s = 0; s < 20_000; s++) for (const i of placeHazards(s * 2654435761, 25, 3)) counts[i] = (counts[i] ?? 0) + 1;
    const expected = (20_000 * 3) / 25;
    for (const c of counts) expect(Math.abs(c - expected) / expected).toBeLessThan(0.08);
  });

  it('rejects impossible layouts', () => {
    expect(() => placeHazards(1, 25, 25)).toThrow();
    expect(() => placeHazards(1, 25, 0)).toThrow();
  });
});
