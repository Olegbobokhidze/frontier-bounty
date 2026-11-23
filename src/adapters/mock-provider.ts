/**
 * In-browser stand-in for a remote game server (ADR-0005). It owns the wallet, the secret
 * hazard layouts and the seeds. The client only learns hazards when a round ends.
 */
import { ProviderErrorCode, type ProviderError, type ProviderResult } from '../core/result';
import { multiplierAt, payout } from '../engine/bounty/math';
import type {
  CashOutRequest,
  CashOutResult,
  OpenRoundRequest,
  RevealRequest,
  RevealResult,
  RoundOpened,
  RoundProvider,
} from '../engine/bounty/ports';
import { validateParams, type RoundParams, type TableRules } from '../engine/bounty/rules';
import { deriveLayout, randomSeedHex, sha256Hex } from './fairness';

export const ForcedStep = {
  NONE: 'none',
  SAFE: 'safe',
  HAZARD: 'hazard',
  NETWORK_ERROR: 'networkError',
  LOST_RESPONSE: 'lostResponse',
  TIMEOUT: 'timeout',
} as const;
export type ForcedStep = (typeof ForcedStep)[keyof typeof ForcedStep];

export const FORCED_STEP_LABELS: Readonly<Record<ForcedStep, string>> = {
  none: 'None (fair layout)',
  safe: 'Next reveal: safe (breaks fairness)',
  hazard: 'Next reveal: dynamite (breaks fairness)',
  networkError: 'Next request: network error',
  lostResponse: 'Next request: processed, response lost',
  timeout: 'Next request: no answer (timeout)',
};

export type MockSettings = {
  readonly latencyMs: readonly [number, number];
  /** Probability [0..1] of a random NETWORK error before processing. */
  readonly errorRate: number;
  readonly forced: ForcedStep;
};

export const DEFAULT_MOCK_SETTINGS: MockSettings = { latencyMs: [120, 320], errorRate: 0, forced: ForcedStep.NONE };

type ServerRound = {
  readonly id: string;
  readonly params: RoundParams;
  readonly serverSeed: string;
  readonly nonce: number;
  hazards: Set<number>;
  revealed: number[];
  status: 'active' | 'won' | 'lost';
  /** True once QA forced a cell, so verification is expected to fail. */
  tampered: boolean;
};

export type MockProviderOptions = {
  readonly rules: TableRules;
  readonly balance: number;
  readonly settings?: Partial<MockSettings>;
  readonly delay?: (ms: number) => Promise<void>;
  /** Deterministic server seeds for tests. */
  readonly seedSource?: () => string;
};

type WorkResult<T> = { ok: true; value: T } | { ok: false; error: ProviderError };

const defaultDelay = (ms: number) => new Promise<void>((r) => globalThis.setTimeout(r, ms));

export class MockProvider implements RoundProvider {
  readonly id = 'mock';
  private settings: MockSettings;
  private wallet: number;
  private nonce = 0;
  private readonly rounds = new Map<string, ServerRound>();
  /** Idempotency cache: requestId → settled result. */
  private readonly responses = new Map<string, ProviderResult<unknown>>();
  private readonly listeners = new Set<() => void>();
  private readonly rules: TableRules;
  private readonly delay: (ms: number) => Promise<void>;
  private readonly seedSource: () => string;
  private version = 0;

  constructor(o: MockProviderOptions) {
    this.rules = o.rules;
    this.wallet = o.balance;
    this.settings = { ...DEFAULT_MOCK_SETTINGS, ...o.settings };
    this.delay = o.delay ?? defaultDelay;
    this.seedSource = o.seedSource ?? (() => randomSeedHex(16));
  }

  // ------------------------------------------------------------ QA / inspector surface

  getSettings(): MockSettings {
    return this.settings;
  }
  updateSettings(patch: Partial<MockSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.notify();
  }
  getWallet(): number {
    return this.wallet;
  }
  setWallet(v: number): void {
    this.wallet = Math.max(0, Math.round(v));
    this.notify();
  }
  /** QA-only cheat: hazard layout of an active round. A real server never exposes this. */
  peek(roundId: string): readonly number[] | null {
    const r = this.rounds.get(roundId);
    return r ? [...r.hazards].sort((a, b) => a - b) : null;
  }
  wasTampered(roundId: string): boolean {
    return this.rounds.get(roundId)?.tampered ?? false;
  }
  subscribe(l: () => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  /** Changes whenever settings or the wallet change (for useSyncExternalStore). */
  getVersion(): number {
    return this.version;
  }

  // ------------------------------------------------------------ RoundProvider

  getBalance(): Promise<number> {
    return Promise.resolve(this.wallet);
  }

  openRound(req: OpenRoundRequest): Promise<ProviderResult<RoundOpened>> {
    return this.handle<RoundOpened>(`open:${req.requestId}`, req.requestId, async () => {
      const v = validateParams(this.rules, req);
      if (!v.ok) return this.fail(ProviderErrorCode.VALIDATION, v.errors.join('; '));
      if (this.wallet < req.bet) return this.fail(ProviderErrorCode.INSUFFICIENT_FUNDS, 'Insufficient funds on the server wallet.');
      const serverSeed = this.seedSource();
      const nonce = ++this.nonce;
      const cells = req.rows * req.cols;
      const hazards = await deriveLayout(serverSeed, req.clientSeed, nonce, cells, req.hazards);
      const id = `R${String(nonce).padStart(5, '0')}`;
      const { requestId: _r, ...params } = req;
      this.rounds.set(id, { id, params, serverSeed, nonce, hazards: new Set(hazards), revealed: [], status: 'active', tampered: false });
      this.wallet -= req.bet;
      this.notify();
      return { ok: true, value: { roundId: id, serverSeedHash: await sha256Hex(serverSeed), nonce, balanceAfter: this.wallet } };
    });
  }

  reveal(req: RevealRequest): Promise<ProviderResult<RevealResult>> {
    return this.handle<RevealResult>(`reveal:${req.requestId}`, req.requestId, async (forced): Promise<WorkResult<RevealResult>> => {
      const round = this.rounds.get(req.roundId);
      if (!round) return this.fail(ProviderErrorCode.ROUND_NOT_FOUND, `Round ${req.roundId} not found.`, false);
      if (round.status !== 'active') return this.fail(ProviderErrorCode.VALIDATION, 'Round is already settled.');
      const cells = round.params.rows * round.params.cols;
      if (!Number.isInteger(req.cell) || req.cell < 0 || req.cell >= cells) return this.fail(ProviderErrorCode.VALIDATION, 'Cell out of bounds.');
      if (round.revealed.includes(req.cell)) return this.fail(ProviderErrorCode.VALIDATION, 'Cell already revealed.');

      if (forced === ForcedStep.HAZARD && !round.hazards.has(req.cell)) this.moveHazard(round, req.cell, true);
      if (forced === ForcedStep.SAFE && round.hazards.has(req.cell)) this.moveHazard(round, req.cell, false);

      if (round.hazards.has(req.cell)) {
        round.status = 'lost';
        this.notify();
        return { ok: true, value: { outcome: 'hazard', cell: req.cell, hazards: [...round.hazards].sort((a, b) => a - b), serverSeed: round.serverSeed } };
      }
      round.revealed.push(req.cell);
      const multiplier = multiplierAt(this.rules.multiplier, cells, round.params.hazards, round.revealed.length);
      return { ok: true, value: { outcome: 'safe', cell: req.cell, safePicks: round.revealed.length, multiplier } };
    });
  }

  cashOut(req: CashOutRequest): Promise<ProviderResult<CashOutResult>> {
    return this.handle<CashOutResult>(`cash:${req.requestId}`, req.requestId, async () => {
      const round = this.rounds.get(req.roundId);
      if (!round) return this.fail(ProviderErrorCode.ROUND_NOT_FOUND, `Round ${req.roundId} not found.`, false);
      if (round.status !== 'active') return this.fail(ProviderErrorCode.VALIDATION, 'Round is already settled.');
      if (round.revealed.length === 0) return this.fail(ProviderErrorCode.VALIDATION, 'Nothing to cash out yet.');
      const cells = round.params.rows * round.params.cols;
      const multiplier = multiplierAt(this.rules.multiplier, cells, round.params.hazards, round.revealed.length);
      const amount = payout(round.params.bet, multiplier, this.rules.maxPayoutX);
      round.status = 'won';
      this.wallet += amount;
      this.notify();
      return {
        ok: true,
        value: { payout: amount, multiplier, balanceAfter: this.wallet, hazards: [...round.hazards].sort((a, b) => a - b), serverSeed: round.serverSeed },
      };
    });
  }

  // ------------------------------------------------------------ plumbing

  /**
   * Shared request pipeline: latency, fault injection and idempotency.
   * A repeated requestId returns the cached result and never re-applies the action.
   */
  private async handle<T>(
    key: string,
    requestId: number,
    work: (forced: ForcedStep) => Promise<WorkResult<T>>,
  ): Promise<ProviderResult<T>> {
    const forced = this.consumeForced();
    const [min, max] = this.settings.latencyMs;
    await this.delay(min + Math.random() * Math.max(0, max - min));

    const cached = this.responses.get(key);
    if (cached) return cached as ProviderResult<T>;

    if (forced === ForcedStep.TIMEOUT) {
      await this.delay(30_000);
      return { ok: false, requestId, error: { code: ProviderErrorCode.TIMEOUT, message: 'Late answer after the client gave up.', recoverable: true } };
    }
    if (forced === ForcedStep.NETWORK_ERROR || (forced === ForcedStep.NONE && Math.random() < this.settings.errorRate)) {
      return { ok: false, requestId, error: { code: ProviderErrorCode.NETWORK, message: 'Connection to the game server dropped.', recoverable: true } };
    }

    const r = await work(forced);
    const result: ProviderResult<T> = r.ok ? { ok: true, requestId, value: r.value } : { ok: false, requestId, error: r.error };
    if (result.ok) this.responses.set(key, result);

    if (forced === ForcedStep.LOST_RESPONSE) {
      // The server applied the action, but the answer never reaches the client.
      return { ok: false, requestId, error: { code: ProviderErrorCode.NETWORK, message: 'Response lost in transit (the server did apply it).', recoverable: true } };
    }
    return result;
  }

  private consumeForced(): ForcedStep {
    const f = this.settings.forced;
    if (f !== ForcedStep.NONE) this.updateSettings({ forced: ForcedStep.NONE });
    return f;
  }

  /** QA: relocate a hazard so the picked cell becomes safe or explosive. Marks the round as tampered. */
  private moveHazard(round: ServerRound, cell: number, makeHazard: boolean): void {
    const cells = round.params.rows * round.params.cols;
    if (makeHazard) {
      const victim = [...round.hazards][0];
      if (victim !== undefined) round.hazards.delete(victim);
      round.hazards.add(cell);
    } else {
      round.hazards.delete(cell);
      for (let i = 0; i < cells; i++) {
        if (i !== cell && !round.hazards.has(i) && !round.revealed.includes(i)) {
          round.hazards.add(i);
          break;
        }
      }
    }
    round.tampered = true;
  }

  private fail(code: ProviderErrorCode, message: string, recoverable = true): { ok: false; error: ProviderError } {
    return { ok: false, error: { code, message, recoverable } };
  }

  private notify(): void {
    this.version++;
    for (const l of this.listeners) l();
  }
}
