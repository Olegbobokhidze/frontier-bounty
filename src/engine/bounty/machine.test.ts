import { describe, expect, it } from 'vitest';
import type { MachineSpec } from '../../core/machine';
import { ALLOWED_EVENTS, createBountySpec, createInitialContext, EventType as E, RoundState, type BountyContext, type BountyEffect, type BountyEvent } from './machine';
import { multiplierAt } from './math';
import { DEFAULT_RULES } from './rules';

const spec: MachineSpec<RoundState, BountyEvent, BountyContext, BountyEffect> = createBountySpec(DEFAULT_RULES);
const params = { rows: 5, cols: 5, hazards: 3, bet: 100, clientSeed: 'test' };
const M = DEFAULT_RULES.multiplier;

function step(ctx: BountyContext, ev: BountyEvent) {
  if (!spec.allowed[ctx.state].includes(ev.type)) return { accepted: false as const, reason: 'NOT_ALLOWED_IN_STATE', ctx };
  const r = spec.reduce(ctx, ev);
  return r.accepted ? { ...r, ctx: r.ctx } : { ...r, ctx };
}
function run(ctx: BountyContext, ...evs: BountyEvent[]) {
  let c = ctx;
  const effects: string[] = [];
  for (const ev of evs) {
    const r = step(c, ev);
    if (!r.accepted) throw new Error(`rejected ${ev.type} in ${c.state}: ${r.reason}`);
    c = r.ctx;
    effects.push(...r.effects.map((e) => e.type));
  }
  return { ctx: c, effects };
}
const opened = (requestId: number): BountyEvent => ({
  type: E.ROUND_OPENED,
  result: { ok: true, requestId, value: { roundId: 'R1', serverSeedHash: 'h', nonce: 1, balanceAfter: 9_900 } },
});
const safe = (requestId: number, cell: number, k: number): BountyEvent => ({
  type: E.REVEAL_RESPONSE,
  result: { ok: true, requestId, value: { outcome: 'safe', cell, safePicks: k, multiplier: multiplierAt(M, 25, 3, k) } },
});
const boom = (requestId: number, cell: number): BountyEvent => ({
  type: E.REVEAL_RESPONSE,
  result: { ok: true, requestId, value: { outcome: 'hazard', cell, hazards: [cell, 7, 9], serverSeed: 's' } },
});

const active = () => run(createInitialContext(params, 10_000), { type: E.START }, opened(1)).ctx;

describe('round state machine', () => {
  it('table covers all 8 states', () => {
    expect(Object.keys(ALLOWED_EVENTS)).toHaveLength(8);
  });

  it('START debits optimistically and goes to CONFIGURING → ROUND_ACTIVE', () => {
    const { ctx, effects } = run(createInitialContext(params, 10_000), { type: E.START });
    expect(ctx.state).toBe(RoundState.CONFIGURING);
    expect(ctx.balance).toBe(9_900);
    expect(effects).toEqual(['OPEN_ROUND']);
    expect(run(ctx, opened(1)).ctx.state).toBe(RoundState.ROUND_ACTIVE);
  });

  it('only one reveal can be in flight (double-click is rejected)', () => {
    const c = run(active(), { type: E.PICK, cell: 4 }).ctx;
    expect(c.state).toBe(RoundState.REVEALING_STEP);
    const r = step(c, { type: E.PICK, cell: 5 });
    expect(r.accepted).toBe(false);
    const r2 = step(c, { type: E.CASH_OUT });
    expect(r2.accepted).toBe(false);
  });

  it('waits for BOTH response and animation before accepting the next pick', () => {
    let c = run(active(), { type: E.PICK, cell: 4 }, safe(2, 4, 1)).ctx;
    expect(c.state).toBe(RoundState.REVEALING_STEP); // response in, animation not settled
    expect(step(c, { type: E.PICK, cell: 5 }).accepted).toBe(false);
    c = run(c, { type: E.STEP_SETTLED, requestId: 2 }).ctx;
    expect(c.state).toBe(RoundState.ROUND_ACTIVE);
    expect(c.round?.picks).toEqual([{ cell: 4, multiplier: 1.1 }]);
  });

  it('rejects re-picking a revealed cell, out-of-bounds cells and stale responses', () => {
    const c = run(active(), { type: E.PICK, cell: 4 }, safe(2, 4, 1), { type: E.STEP_SETTLED, requestId: 2 }).ctx;
    expect(step(c, { type: E.PICK, cell: 4 }).accepted).toBe(false);
    expect(step(c, { type: E.PICK, cell: 25 }).accepted).toBe(false);
    const p = run(c, { type: E.PICK, cell: 6 }).ctx;
    expect(step(p, safe(99, 6, 2)).accepted).toBe(false);
  });

  it('dynamite ends the round with disclosure', () => {
    const { ctx, effects } = run(active(), { type: E.PICK, cell: 7 }, boom(2, 7), { type: E.STEP_SETTLED, requestId: 2 });
    expect(ctx.state).toBe(RoundState.ROUND_OVER_BUST);
    expect(ctx.round?.disclosure).toMatchObject({ hitCell: 7, serverSeed: 's' });
    expect(effects).toContain('PLAY_SWEEP');
    expect(ctx.balance).toBe(9_900);
  });

  it('cash-out requires at least one safe pick and settles the payout', () => {
    expect(step(active(), { type: E.CASH_OUT }).accepted).toBe(false);
    let c = run(active(), { type: E.PICK, cell: 4 }, safe(2, 4, 1), { type: E.STEP_SETTLED, requestId: 2 }, { type: E.CASH_OUT }).ctx;
    expect(c.state).toBe(RoundState.CASHING_OUT);
    c = run(c, { type: E.CASHED, result: { ok: true, requestId: 3, value: { payout: 110, multiplier: 1.1, balanceAfter: 10_010, hazards: [1, 2, 3], serverSeed: 's' } } }).ctx;
    expect(c.state).toBe(RoundState.ROUND_OVER_WIN);
    expect(c.balance).toBe(10_010);
    expect(c.lastOutcome).toEqual({ kind: 'win', amount: 110, multiplier: 1.1 });
  });

  it('a payout that disagrees with the client is a VALIDATION error', () => {
    const c = run(active(), { type: E.PICK, cell: 4 }, safe(2, 4, 1), { type: E.STEP_SETTLED, requestId: 2 }, { type: E.CASH_OUT }).ctx;
    const r = run(c, { type: E.CASHED, result: { ok: true, requestId: 3, value: { payout: 999, multiplier: 1.1, balanceAfter: 1, hazards: [], serverSeed: 's' } } }).ctx;
    expect(r.error?.code).toBe('VALIDATION');
  });

  it('a failed open refunds and DISMISS returns to IDLE', () => {
    const c = run(createInitialContext(params, 10_000), { type: E.START }, {
      type: E.ROUND_OPENED,
      result: { ok: false, requestId: 1, error: { code: 'NETWORK', message: 'x', recoverable: true } },
    }).ctx;
    expect(c.state).toBe(RoundState.ERROR_RECOVERABLE);
    expect(c.balance).toBe(10_000);
    expect(run(c, { type: E.DISMISS_ERROR }).ctx.state).toBe(RoundState.IDLE);
  });

  it('a failed reveal must be RETRIED with the same requestId (no dismiss mid-round)', () => {
    const c = run(active(), { type: E.PICK, cell: 4 }, {
      type: E.REVEAL_RESPONSE,
      result: { ok: false, requestId: 2, error: { code: 'NETWORK', message: 'x', recoverable: true } },
    }).ctx;
    expect(c.state).toBe(RoundState.ERROR_RECOVERABLE);
    expect(step(c, { type: E.DISMISS_ERROR }).accepted).toBe(false);
    const r = step(c, { type: E.RETRY });
    expect(r.accepted && r.effects[0]).toMatchObject({ type: 'REQUEST_REVEAL', request: { requestId: 2, cell: 4 } });
  });

  it('a duplicate answer for the same request is applied once', () => {
    const c = run(active(), { type: E.PICK, cell: 4 }, safe(2, 4, 1)).ctx;
    expect(step(c, safe(2, 4, 1)).accepted).toBe(false);
  });

  it('a wrong server multiplier is caught by the client cross-check', () => {
    const c = run(active(), { type: E.PICK, cell: 4 }, {
      type: E.REVEAL_RESPONSE,
      result: { ok: true, requestId: 2, value: { outcome: 'safe', cell: 4, safePicks: 1, multiplier: 5 } },
    }).ctx;
    expect(c.error?.code).toBe('VALIDATION');
  });

  it('clearing every safe cell auto-cashes out', () => {
    const small = { rows: 3, cols: 3, hazards: 7, bet: 100, clientSeed: 't' };
    let c = run(createInitialContext(small, 10_000), { type: E.START }, opened(1)).ctx;
    const m = (k: number) => multiplierAt(M, 9, 7, k);
    c = run(c, { type: E.PICK, cell: 0 }, { type: E.REVEAL_RESPONSE, result: { ok: true, requestId: 2, value: { outcome: 'safe', cell: 0, safePicks: 1, multiplier: m(1) } } }, { type: E.STEP_SETTLED, requestId: 2 }).ctx;
    const r = run(c, { type: E.PICK, cell: 1 }, { type: E.REVEAL_RESPONSE, result: { ok: true, requestId: 3, value: { outcome: 'safe', cell: 1, safePicks: 2, multiplier: m(2) } } }, { type: E.STEP_SETTLED, requestId: 3 });
    expect(r.ctx.state).toBe(RoundState.CASHING_OUT);
    expect(r.effects).toContain('REQUEST_CASHOUT');
  });

  it('insufficient funds is caught before any request', () => {
    const r = run(createInitialContext(params, 50), { type: E.START });
    expect(r.ctx.state).toBe(RoundState.ERROR_RECOVERABLE);
    expect(r.ctx.error?.code).toBe('INSUFFICIENT_FUNDS');
    expect(r.effects).toEqual([]);
  });

  it('SET_PARAMS validates and clamps hazards when the grid shrinks', () => {
    const c = run(createInitialContext({ ...params, hazards: 20 }, 10_000), { type: E.SET_PARAMS, patch: { rows: 3, cols: 3 } }).ctx;
    expect(c.params.hazards).toBe(8);
    expect(step(c, { type: E.SET_PARAMS, patch: { rows: 12 } }).accepted).toBe(false);
    expect(step(active(), { type: E.SET_PARAMS, patch: { hazards: 5 } }).accepted).toBe(false);
  });
});
