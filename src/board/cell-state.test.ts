import { describe, expect, it } from 'vitest';
import { createInitialContext, RoundState, type ActiveRound, type BountyContext } from '../engine/bounty/machine';
import { CellView, cellViews } from './cell-state';

const params = { rows: 3, cols: 3, hazards: 2, bet: 100, clientSeed: 'x' };
const base = createInitialContext(params, 1000);
const round = (patch: Partial<ActiveRound>): BountyContext => ({
  ...base,
  state: RoundState.ROUND_ACTIVE,
  round: {
    roundId: 'R',
    params,
    serverSeedHash: 'h',
    nonce: 1,
    picks: [],
    multiplier: 1,
    pendingCell: null,
    pendingResult: null,
    disclosure: null,
    payout: 0,
    ...patch,
  },
});

describe('cellViews', () => {
  it('all hidden before a round', () => {
    expect(cellViews(base)).toEqual(new Array(9).fill(CellView.HIDDEN));
  });

  it('pending → reveal → settled', () => {
    expect(cellViews(round({ pendingCell: 4 }))[4]).toBe(CellView.PENDING);
    expect(cellViews(round({ pendingCell: 4, pendingResult: { outcome: 'safe', cell: 4, safePicks: 1, multiplier: 1.3 } }))[4]).toBe(CellView.REVEAL_SAFE);
    expect(cellViews(round({ picks: [{ cell: 4, multiplier: 1.3 }] }))[4]).toBe(CellView.SAFE);
  });

  it('round end sweep: hit, other hazards, missed bounty', () => {
    const v = cellViews(round({ picks: [{ cell: 0, multiplier: 1.3 }], disclosure: { hazards: [4, 8], serverSeed: 's', hitCell: 4 } }));
    expect(v[0]).toBe(CellView.SAFE);
    expect(v[4]).toBe(CellView.HAZARD_HIT);
    expect(v[8]).toBe(CellView.HAZARD);
    expect(v[1]).toBe(CellView.MISSED);
  });
});
