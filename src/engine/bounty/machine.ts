/**
 * Dynamite & Bounty round lifecycle (ADR-0003). Pure reducer + allow-list; side effects are descriptors.
 *
 *   IDLE ─START→ CONFIGURING ─ROUND_OPENED→ ROUND_ACTIVE ─PICK→ REVEALING_STEP ─STEP_SETTLED→ ROUND_ACTIVE | ROUND_OVER_BUST
 *   ROUND_ACTIVE ─CASH_OUT→ CASHING_OUT ─CASHED→ ROUND_OVER_WIN          any failure → ERROR_RECOVERABLE
 */
import type { MachineSpec, Reduction } from '../../core/machine';
import { ProviderErrorCode, type ProviderError, type ProviderResult } from '../../core/result';
import { isValidIndex } from '../spatial/grid';
import { multiplierAt, nextSafeChance, payout } from './math';
import type { CashOutRequest, CashOutResult, OpenRoundRequest, RevealRequest, RevealResult, RoundOpened } from './ports';
import { validateParams, type RoundParams, type TableRules } from './rules';

// ------------------------------------------------------------------ states & events

export const RoundState = {
  IDLE: 'IDLE',
  CONFIGURING: 'CONFIGURING',
  ROUND_ACTIVE: 'ROUND_ACTIVE',
  REVEALING_STEP: 'REVEALING_STEP',
  CASHING_OUT: 'CASHING_OUT',
  ROUND_OVER_WIN: 'ROUND_OVER_WIN',
  ROUND_OVER_BUST: 'ROUND_OVER_BUST',
  ERROR_RECOVERABLE: 'ERROR_RECOVERABLE',
} as const;
export type RoundState = (typeof RoundState)[keyof typeof RoundState];

export const ROUND_STATE_ORDER: readonly RoundState[] = Object.values(RoundState);

export const EventType = {
  SET_PARAMS: 'SET_PARAMS',
  SET_TURBO: 'SET_TURBO',
  START: 'START',
  ROUND_OPENED: 'ROUND_OPENED',
  PICK: 'PICK',
  REVEAL_RESPONSE: 'REVEAL_RESPONSE',
  STEP_SETTLED: 'STEP_SETTLED',
  CASH_OUT: 'CASH_OUT',
  CASHED: 'CASHED',
  RETRY: 'RETRY',
  DISMISS_ERROR: 'DISMISS_ERROR',
  BALANCE_SYNCED: 'BALANCE_SYNCED',
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export type BountyEvent =
  | { readonly type: typeof EventType.SET_PARAMS; readonly patch: Partial<RoundParams> }
  | { readonly type: typeof EventType.SET_TURBO; readonly enabled: boolean }
  | { readonly type: typeof EventType.START }
  | { readonly type: typeof EventType.ROUND_OPENED; readonly result: ProviderResult<RoundOpened> }
  | { readonly type: typeof EventType.PICK; readonly cell: number }
  | { readonly type: typeof EventType.REVEAL_RESPONSE; readonly result: ProviderResult<RevealResult> }
  | { readonly type: typeof EventType.STEP_SETTLED; readonly requestId: number }
  | { readonly type: typeof EventType.CASH_OUT }
  | { readonly type: typeof EventType.CASHED; readonly result: ProviderResult<CashOutResult> }
  | { readonly type: typeof EventType.RETRY }
  | { readonly type: typeof EventType.DISMISS_ERROR }
  | { readonly type: typeof EventType.BALANCE_SYNCED; readonly balance: number };

const E = EventType;
const ALWAYS = [E.SET_TURBO] as const;
const BETWEEN_ROUNDS = [E.SET_PARAMS, E.START, E.BALANCE_SYNCED, ...ALWAYS] as const;

export const ALLOWED_EVENTS: Readonly<Record<RoundState, readonly EventType[]>> = {
  IDLE: BETWEEN_ROUNDS,
  CONFIGURING: [E.ROUND_OPENED, ...ALWAYS],
  ROUND_ACTIVE: [E.PICK, E.CASH_OUT, ...ALWAYS],
  REVEALING_STEP: [E.REVEAL_RESPONSE, E.STEP_SETTLED, ...ALWAYS],
  CASHING_OUT: [E.CASHED, ...ALWAYS],
  ROUND_OVER_WIN: BETWEEN_ROUNDS,
  ROUND_OVER_BUST: BETWEEN_ROUNDS,
  ERROR_RECOVERABLE: [E.RETRY, E.DISMISS_ERROR, E.BALANCE_SYNCED, ...ALWAYS],
};

// ------------------------------------------------------------------ context

export type Pick = { readonly cell: number; readonly multiplier: number };

export type ActiveRound = {
  readonly roundId: string;
  readonly params: RoundParams;
  readonly serverSeedHash: string;
  readonly nonce: number;
  /** Safe picks in order. */
  readonly picks: readonly Pick[];
  readonly multiplier: number;
  /** Cell currently being revealed (pending wobble → flip). */
  readonly pendingCell: number | null;
  /** Server answer for the pending cell, held until the animation settles. */
  readonly pendingResult: RevealResult | null;
  /** Filled at round end. */
  readonly disclosure: { readonly hazards: readonly number[]; readonly serverSeed: string; readonly hitCell: number | null } | null;
  readonly payout: number;
};

export type InFlight =
  | { readonly kind: 'open'; readonly request: OpenRoundRequest }
  | { readonly kind: 'reveal'; readonly request: RevealRequest }
  | { readonly kind: 'cashout'; readonly request: CashOutRequest };

export type BountyContext = {
  readonly state: RoundState;
  readonly balance: number;
  readonly params: RoundParams;
  readonly turbo: boolean;
  readonly round: ActiveRound | null;
  /** Monotonic; every provider request gets a fresh id (retries reuse theirs). */
  readonly requestSeq: number;
  readonly inFlight: InFlight | null;
  readonly error: (ProviderError & { readonly phase: InFlight['kind'] | 'precheck' }) | null;
  readonly roundsPlayed: number;
  readonly lastOutcome: { readonly kind: 'win' | 'bust'; readonly amount: number; readonly multiplier: number } | null;
};

export function createInitialContext(params: RoundParams, balance: number): BountyContext {
  return {
    state: RoundState.IDLE,
    balance,
    params,
    turbo: false,
    round: null,
    requestSeq: 0,
    inFlight: null,
    error: null,
    roundsPlayed: 0,
    lastOutcome: null,
  };
}

// ------------------------------------------------------------------ effects

export type BountyEffect =
  | { readonly type: 'OPEN_ROUND'; readonly request: OpenRoundRequest }
  | { readonly type: 'REQUEST_REVEAL'; readonly request: RevealRequest }
  | { readonly type: 'REQUEST_CASHOUT'; readonly request: CashOutRequest }
  | { readonly type: 'PLAY_REVEAL'; readonly requestId: number; readonly cell: number; readonly outcome: 'safe' | 'hazard'; readonly turbo: boolean }
  | { readonly type: 'PLAY_SWEEP'; readonly outcome: 'win' | 'bust'; readonly turbo: boolean }
  | { readonly type: 'SYNC_BALANCE' };

export const BountyRejectReason = {
  INVALID_PARAMS: 'INVALID_PARAMS',
  STALE_REQUEST: 'STALE_REQUEST',
  OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
  ALREADY_REVEALED: 'ALREADY_REVEALED',
  NO_SAFE_PICKS: 'NO_SAFE_PICKS',
  NOTHING_TO_RETRY: 'NOTHING_TO_RETRY',
  RESPONSE_NOT_READY: 'RESPONSE_NOT_READY',
  DUPLICATE_RESPONSE: 'DUPLICATE_RESPONSE',
} as const;

// ------------------------------------------------------------------ reducer

type R = Reduction<BountyContext, BountyEffect>;
const ok = (ctx: BountyContext, effects: BountyEffect[] = [], note?: string): R => (note ? { accepted: true, ctx, effects, note } : { accepted: true, ctx, effects });
const no = (reason: string): R => ({ accepted: false, reason });

export function createBountySpec(rules: TableRules): MachineSpec<RoundState, BountyEvent, BountyContext, BountyEffect> {
  const cellsOf = (p: RoundParams) => p.rows * p.cols;

  const toError = (ctx: BountyContext, error: ProviderError, phase: InFlight['kind'] | 'precheck', refund: number): R =>
    ok({ ...ctx, state: RoundState.ERROR_RECOVERABLE, error: { ...error, phase }, balance: ctx.balance + refund }, [], `${error.code} during ${phase}`);

  const sendOpen = (ctx: BountyContext): R => {
    const requestId = ctx.requestSeq + 1;
    const request: OpenRoundRequest = { ...ctx.params, requestId };
    return ok(
      {
        ...ctx,
        state: RoundState.CONFIGURING,
        requestSeq: requestId,
        inFlight: { kind: 'open', request },
        balance: ctx.balance - ctx.params.bet, // optimistic debit
        round: null,
        error: null,
        lastOutcome: null,
      },
      [{ type: 'OPEN_ROUND', request }],
    );
  };

  const reduce = (ctx: BountyContext, ev: BountyEvent): R => {
    switch (ev.type) {
      case E.SET_TURBO:
        return ok({ ...ctx, turbo: ev.enabled });

      case E.SET_PARAMS: {
        const params = { ...ctx.params, ...ev.patch };
        // Keep hazards valid when the grid shrinks.
        const cells = cellsOf(params);
        const clamped = { ...params, hazards: Math.min(params.hazards, cells - 1) };
        const v = validateParams(rules, clamped);
        if (!v.ok) return no(`${BountyRejectReason.INVALID_PARAMS}: ${v.errors.join('; ')}`);
        return ok({ ...ctx, params: clamped, state: RoundState.IDLE, round: null });
      }

      case E.BALANCE_SYNCED:
        return ok({ ...ctx, balance: ev.balance });

      case E.START: {
        const v = validateParams(rules, ctx.params);
        if (!v.ok) return no(`${BountyRejectReason.INVALID_PARAMS}: ${v.errors.join('; ')}`);
        if (ctx.balance < ctx.params.bet) {
          return toError(ctx, { code: ProviderErrorCode.INSUFFICIENT_FUNDS, message: 'Not enough in the purse for this stake.', recoverable: true }, 'precheck', 0);
        }
        return sendOpen(ctx);
      }

      case E.ROUND_OPENED: {
        const f = ctx.inFlight;
        if (!f || f.kind !== 'open' || ev.result.requestId !== f.request.requestId) return no(BountyRejectReason.STALE_REQUEST);
        if (!ev.result.ok) return toError({ ...ctx, inFlight: null }, ev.result.error, 'open', f.request.bet);
        const r = ev.result.value;
        return ok({
          ...ctx,
          state: RoundState.ROUND_ACTIVE,
          inFlight: null,
          balance: r.balanceAfter,
          round: {
            roundId: r.roundId,
            params: f.request,
            serverSeedHash: r.serverSeedHash,
            nonce: r.nonce,
            picks: [],
            multiplier: 1,
            pendingCell: null,
            pendingResult: null,
            disclosure: null,
            payout: 0,
          },
        });
      }

      case E.PICK: {
        const round = ctx.round;
        if (!round) return no(BountyRejectReason.STALE_REQUEST);
        const g = round.params;
        if (!isValidIndex(g, ev.cell)) return no(BountyRejectReason.OUT_OF_BOUNDS);
        if (round.picks.some((p) => p.cell === ev.cell)) return no(BountyRejectReason.ALREADY_REVEALED);
        const requestId = ctx.requestSeq + 1;
        const request: RevealRequest = { requestId, roundId: round.roundId, cell: ev.cell };
        return ok(
          {
            ...ctx,
            state: RoundState.REVEALING_STEP,
            requestSeq: requestId,
            inFlight: { kind: 'reveal', request },
            round: { ...round, pendingCell: ev.cell, pendingResult: null },
          },
          [{ type: 'REQUEST_REVEAL', request }],
        );
      }

      case E.REVEAL_RESPONSE: {
        const f = ctx.inFlight;
        const round = ctx.round;
        if (!f || f.kind !== 'reveal' || !round || ev.result.requestId !== f.request.requestId) return no(BountyRejectReason.STALE_REQUEST);
        // A retry and a late original can both answer the same requestId: apply only the first.
        if (round.pendingResult) return no(BountyRejectReason.DUPLICATE_RESPONSE);
        if (!ev.result.ok) return toError({ ...ctx, round: { ...round, pendingResult: null } }, ev.result.error, 'reveal', 0);
        const result = ev.result.value;
        if (result.cell !== f.request.cell) {
          return toError(ctx, { code: ProviderErrorCode.VALIDATION, message: `Server revealed ${result.cell}, expected ${f.request.cell}.`, recoverable: true }, 'reveal', 0);
        }
        if (result.outcome === 'safe') {
          // Client cross-check of the authoritative multiplier.
          const local = multiplierAt(rules.multiplier, cellsOf(round.params), round.params.hazards, round.picks.length + 1);
          if (Math.abs(local - result.multiplier) > 1e-9) {
            return toError(ctx, { code: ProviderErrorCode.VALIDATION, message: `Server multiplier ×${result.multiplier} ≠ client ×${local}.`, recoverable: true }, 'reveal', 0);
          }
        }
        return ok({ ...ctx, round: { ...round, pendingResult: result } }, [
          { type: 'PLAY_REVEAL', requestId: f.request.requestId, cell: result.cell, outcome: result.outcome, turbo: ctx.turbo },
        ]);
      }

      case E.STEP_SETTLED: {
        const f = ctx.inFlight;
        const round = ctx.round;
        if (!f || f.kind !== 'reveal' || !round || ev.requestId !== f.request.requestId) return no(BountyRejectReason.STALE_REQUEST);
        const result = round.pendingResult;
        if (!result) return no(BountyRejectReason.RESPONSE_NOT_READY);

        if (result.outcome === 'hazard') {
          return ok(
            {
              ...ctx,
              state: RoundState.ROUND_OVER_BUST,
              inFlight: null,
              roundsPlayed: ctx.roundsPlayed + 1,
              lastOutcome: { kind: 'bust', amount: 0, multiplier: 0 },
              round: {
                ...round,
                pendingCell: null,
                pendingResult: null,
                disclosure: { hazards: result.hazards, serverSeed: result.serverSeed, hitCell: result.cell },
              },
            },
            [{ type: 'PLAY_SWEEP', outcome: 'bust', turbo: ctx.turbo }],
            `dynamite at cell ${result.cell}`,
          );
        }

        const picks = [...round.picks, { cell: result.cell, multiplier: result.multiplier }];
        const next: ActiveRound = { ...round, picks, multiplier: result.multiplier, pendingCell: null, pendingResult: null };
        const allFound = picks.length >= cellsOf(round.params) - round.params.hazards;
        if (allFound) {
          // Board cleared: cash out automatically.
          const requestId = ctx.requestSeq + 1;
          const request: CashOutRequest = { requestId, roundId: round.roundId };
          return ok(
            { ...ctx, state: RoundState.CASHING_OUT, requestSeq: requestId, inFlight: { kind: 'cashout', request }, round: next },
            [{ type: 'REQUEST_CASHOUT', request }],
            'all bounty found: auto cash-out',
          );
        }
        return ok({ ...ctx, state: RoundState.ROUND_ACTIVE, inFlight: null, round: next });
      }

      case E.CASH_OUT: {
        const round = ctx.round;
        if (!round || round.picks.length === 0) return no(BountyRejectReason.NO_SAFE_PICKS);
        const requestId = ctx.requestSeq + 1;
        const request: CashOutRequest = { requestId, roundId: round.roundId };
        return ok({ ...ctx, state: RoundState.CASHING_OUT, requestSeq: requestId, inFlight: { kind: 'cashout', request } }, [{ type: 'REQUEST_CASHOUT', request }]);
      }

      case E.CASHED: {
        const f = ctx.inFlight;
        const round = ctx.round;
        if (!f || f.kind !== 'cashout' || !round || ev.result.requestId !== f.request.requestId) return no(BountyRejectReason.STALE_REQUEST);
        if (!ev.result.ok) return toError(ctx, ev.result.error, 'cashout', 0);
        const r = ev.result.value;
        const expected = payout(round.params.bet, round.multiplier, rules.maxPayoutX);
        if (r.payout !== expected) {
          return toError(ctx, { code: ProviderErrorCode.VALIDATION, message: `Server payout ${r.payout} ≠ client ${expected}.`, recoverable: true }, 'cashout', 0);
        }
        return ok(
          {
            ...ctx,
            state: RoundState.ROUND_OVER_WIN,
            inFlight: null,
            balance: r.balanceAfter,
            roundsPlayed: ctx.roundsPlayed + 1,
            lastOutcome: { kind: 'win', amount: r.payout, multiplier: r.multiplier },
            round: { ...round, payout: r.payout, disclosure: { hazards: r.hazards, serverSeed: r.serverSeed, hitCell: null } },
          },
          [{ type: 'PLAY_SWEEP', outcome: 'win', turbo: ctx.turbo }],
        );
      }

      case E.RETRY: {
        const err = ctx.error;
        if (!err || (err.phase !== 'reveal' && err.phase !== 'cashout')) return no(BountyRejectReason.NOTHING_TO_RETRY);
        const f = ctx.inFlight;
        if (!f) return no(BountyRejectReason.NOTHING_TO_RETRY);
        // Same requestId: the provider is idempotent, so a lost response is recovered, never double-applied.
        if (f.kind === 'reveal') return ok({ ...ctx, state: RoundState.REVEALING_STEP, error: null }, [{ type: 'REQUEST_REVEAL', request: f.request }], `retry #${f.request.requestId}`);
        if (f.kind === 'cashout') return ok({ ...ctx, state: RoundState.CASHING_OUT, error: null }, [{ type: 'REQUEST_CASHOUT', request: f.request }], `retry #${f.request.requestId}`);
        return no(BountyRejectReason.NOTHING_TO_RETRY);
      }

      case E.DISMISS_ERROR: {
        const err = ctx.error;
        if (err && (err.phase === 'reveal' || err.phase === 'cashout')) {
          // Mid-round errors must be retried: the server may already have applied the request.
          return no('MID_ROUND_ERROR_REQUIRES_RETRY');
        }
        return ok({ ...ctx, state: RoundState.IDLE, error: null, inFlight: null, round: null }, [{ type: 'SYNC_BALANCE' }]);
      }
    }
  };

  return { allowed: ALLOWED_EVENTS, reduce };
}

/** Convenience for UI: chance that the next pick is safe in the current round. */
export function currentSafeChance(ctx: BountyContext): number {
  const p = ctx.round?.params ?? ctx.params;
  return nextSafeChance(p.rows * p.cols, p.hazards, ctx.round?.picks.length ?? 0);
}
