import type { MultiplierModel } from './rules';

/** P(first k picks are all safe) with `hazards` hidden among `cells`, picks without replacement. */
export function survivalProbability(cells: number, hazards: number, k: number): number {
  if (k <= 0) return 1;
  if (k > cells - hazards) return 0;
  let p = 1;
  for (let i = 0; i < k; i++) p *= (cells - hazards - i) / (cells - i);
  return p;
}

/** Chance that the *next* pick is safe after `k` safe picks. */
export function nextSafeChance(cells: number, hazards: number, k: number): number {
  const remaining = cells - k;
  return remaining <= 0 ? 0 : (remaining - hazards) / remaining;
}

/** Floor to 2 decimals so displayed multipliers never exceed the model (RTP stays ≤ target). */
const floor2 = (x: number) => Math.floor(x * 100 + 1e-9) / 100;

/** Multiplier after `k` safe picks (k = 0 → 1). */
export function multiplierAt(model: MultiplierModel, cells: number, hazards: number, k: number): number {
  if (k <= 0) return 1;
  if (model.kind === 'table') return model.steps[Math.min(k, model.steps.length) - 1] ?? 1;
  const p = survivalProbability(cells, hazards, k);
  return p <= 0 ? 0 : floor2((1 - model.houseEdge) / p);
}

/** Full ladder for k = 1..(cells - hazards). */
export function multiplierLadder(model: MultiplierModel, cells: number, hazards: number): number[] {
  return Array.from({ length: cells - hazards }, (_, i) => multiplierAt(model, cells, hazards, i + 1));
}

/** Payout in minor units, capped. */
export function payout(bet: number, multiplier: number, maxPayoutX = Infinity): number {
  return Math.floor(bet * Math.min(multiplier, maxPayoutX));
}

/** Exact RTP of the "pick k then cash out" strategy: P(survive k) × multiplier(k). */
export function strategyRtp(model: MultiplierModel, cells: number, hazards: number, k: number): number {
  return survivalProbability(cells, hazards, k) * multiplierAt(model, cells, hazards, k);
}
