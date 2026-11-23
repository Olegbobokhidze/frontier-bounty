/** Round parameters, multiplier models and table rules for Dynamite & Bounty. Pure data + validation. */

export type MultiplierModel =
  /** Fair odds minus a house edge: (1 - edge) / P(k safe picks in a row). */
  | { readonly kind: 'fair'; readonly houseEdge: number }
  /** Explicit progression table: steps[k-1] is the multiplier after k safe picks. */
  | { readonly kind: 'table'; readonly steps: readonly number[] };

export type RoundParams = {
  readonly rows: number;
  readonly cols: number;
  readonly hazards: number;
  /** Stake in minor units. */
  readonly bet: number;
  readonly clientSeed: string;
};

export type TableRules = {
  readonly minSize: number;
  readonly maxSize: number;
  readonly betPresets: readonly number[];
  readonly multiplier: MultiplierModel;
  /** Hard cap on a single round's payout, as a multiple of the bet. */
  readonly maxPayoutX: number;
};

export const DEFAULT_RULES: TableRules = {
  minSize: 3,
  maxSize: 8,
  betPresets: [10, 20, 50, 100, 200, 500, 1000, 2500, 5000],
  multiplier: { kind: 'fair', houseEdge: 0.03 },
  maxPayoutX: 10_000,
};

export type ParamsValidation = { readonly ok: true } | { readonly ok: false; readonly errors: readonly string[] };

export function validateParams(rules: TableRules, p: RoundParams): ParamsValidation {
  const errors: string[] = [];
  for (const [k, v] of [
    ['rows', p.rows],
    ['cols', p.cols],
  ] as const) {
    if (!Number.isInteger(v) || v < rules.minSize || v > rules.maxSize) errors.push(`${k} must be ${rules.minSize}–${rules.maxSize}`);
  }
  const cells = p.rows * p.cols;
  if (!Number.isInteger(p.hazards) || p.hazards < 1 || p.hazards >= cells) errors.push(`hazards must be 1–${cells - 1}`);
  if (!Number.isInteger(p.bet) || p.bet <= 0) errors.push('bet must be a positive integer (minor units)');
  if (p.clientSeed.length === 0 || p.clientSeed.length > 64) errors.push('clientSeed must be 1–64 characters');
  return errors.length ? { ok: false, errors } : { ok: true };
}
