import { describe, expect, it } from 'vitest';
import { createManualClock } from '../core/clock';
import { BountyController } from '../engine/bounty/controller';
import { RoundState } from '../engine/bounty/machine';
import { DEFAULT_RULES } from '../engine/bounty/rules';
import { verifyRound } from './fairness';
import { ForcedStep, MockProvider } from './mock-provider';

const params = { rows: 5, cols: 5, hazards: 3, bet: 100, clientSeed: 'lucky-spur' };
let seedN = 0;
const seedSource = () => `server-seed-${++seedN}`;

/** Let promises (incl. WebCrypto) settle. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

function setup() {
  const provider = new MockProvider({ rules: DEFAULT_RULES, balance: 10_000, delay: () => Promise.resolve(), seedSource });
  const clock = createManualClock();
  const controller = new BountyController({ provider, clock, params, balance: 10_000, isoNow: () => 'T' });
  return { provider, controller, clock };
}

async function open(controller: BountyController) {
  controller.start();
  await settle();
  expect(controller.getSnapshot().state).toBe(RoundState.ROUND_ACTIVE);
}

describe('controller × MockProvider', () => {
  it('plays a full winning round and the round verifies as provably fair', async () => {
    const { provider, controller } = setup();
    await open(controller);
    const roundId = controller.getSnapshot().round?.roundId ?? '';
    const hazards = new Set(provider.peek(roundId));
    const safeCells = [...Array(25).keys()].filter((i) => !hazards.has(i)).slice(0, 3);
    for (const c of safeCells) {
      controller.pick(c);
      await settle();
    }
    controller.cashOut();
    await settle();
    const s = controller.getSnapshot();
    expect(s.state).toBe(RoundState.ROUND_OVER_WIN);
    expect(s.balance).toBe(provider.getWallet());
    const d = s.round?.disclosure;
    const v = await verifyRound({
      serverSeed: d?.serverSeed ?? '',
      serverSeedHash: s.round?.serverSeedHash ?? '',
      clientSeed: params.clientSeed,
      nonce: s.round?.nonce ?? 0,
      cells: 25,
      hazards: d?.hazards ?? [],
    });
    expect(v).toMatchObject({ commitmentOk: true, layoutOk: true });
  });

  it('rapid double-click sends exactly one reveal', async () => {
    const { provider, controller } = setup();
    await open(controller);
    const roundId = controller.getSnapshot().round?.roundId ?? '';
    const safe = [...Array(25).keys()].find((i) => !provider.peek(roundId)?.includes(i)) ?? 0;
    controller.pick(safe);
    controller.pick(safe);
    controller.pick(safe + 1);
    const rejected = controller.getHistory().filter((r) => !r.accepted && r.event === 'PICK');
    expect(rejected).toHaveLength(2);
    await settle();
    expect(controller.getSnapshot().round?.picks).toHaveLength(1);
  });

  it('lost response → retry with the same requestId → result recovered, not re-applied', async () => {
    const { provider, controller } = setup();
    await open(controller);
    const roundId = controller.getSnapshot().round?.roundId ?? '';
    const safe = [...Array(25).keys()].find((i) => !provider.peek(roundId)?.includes(i)) ?? 0;
    provider.updateSettings({ forced: ForcedStep.LOST_RESPONSE });
    controller.pick(safe);
    await settle();
    expect(controller.getSnapshot().state).toBe(RoundState.ERROR_RECOVERABLE);
    controller.retry();
    await settle();
    const s = controller.getSnapshot();
    expect(s.state).toBe(RoundState.ROUND_ACTIVE);
    expect(s.round?.picks.map((p) => p.cell)).toEqual([safe]);
  });

  it('timeout → TIMEOUT error; the late answer is ignored', async () => {
    const provider = new MockProvider({ rules: DEFAULT_RULES, balance: 10_000, seedSource, delay: (ms) => (ms >= 30_000 ? new Promise(() => undefined) : Promise.resolve()) });
    const clock = createManualClock();
    const controller = new BountyController({ provider, clock, params, balance: 10_000, requestTimeoutMs: 5000 });
    await open(controller);
    provider.updateSettings({ forced: ForcedStep.TIMEOUT });
    controller.pick(0);
    await settle();
    clock.advance(5000);
    const s = controller.getSnapshot();
    expect(s.state).toBe(RoundState.ERROR_RECOVERABLE);
    expect(s.error?.code).toBe('TIMEOUT');
  });

  it('QA-forced outcomes are detected by verification', async () => {
    const { provider, controller } = setup();
    await open(controller);
    const roundId = controller.getSnapshot().round?.roundId ?? '';
    const safe = [...Array(25).keys()].find((i) => !provider.peek(roundId)?.includes(i)) ?? 0;
    provider.updateSettings({ forced: ForcedStep.HAZARD });
    controller.pick(safe);
    await settle();
    const s = controller.getSnapshot();
    expect(s.state).toBe(RoundState.ROUND_OVER_BUST);
    const v = await verifyRound({
      serverSeed: s.round?.disclosure?.serverSeed ?? '',
      serverSeedHash: s.round?.serverSeedHash ?? '',
      clientSeed: params.clientSeed,
      nonce: s.round?.nonce ?? 0,
      cells: 25,
      hazards: s.round?.disclosure?.hazards ?? [],
    });
    expect(v.commitmentOk).toBe(true);
    expect(v.layoutOk).toBe(false);
  });

  it('a throwing board never wedges the round', async () => {
    const { controller } = setup();
    controller.attachBoard({
      playReveal: () => {
        throw new Error('boom');
      },
      playSweep: () => {
        throw new Error('boom');
      },
    });
    await open(controller);
    controller.pick(0);
    await settle();
    const s = controller.getSnapshot().state;
    expect([RoundState.ROUND_ACTIVE, RoundState.ROUND_OVER_BUST]).toContain(s);
  });
});
