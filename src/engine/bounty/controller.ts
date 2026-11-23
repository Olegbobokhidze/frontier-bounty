/**
 * BountyController: runs the round machine and interprets its effects against the RoundProvider and BoardPort.
 * Framework-free (ADR-0001). Exposes subscribe/getSnapshot for useSyncExternalStore.
 */
import type { Clock, TimerHandle } from '../../core/clock';
import { Machine, type TransitionRecord } from '../../core/machine';
import { ProviderErrorCode, type ProviderResult } from '../../core/result';
import { createImmediateBoard, type BoardPort, type RoundProvider } from './ports';
import {
  createBountySpec,
  createInitialContext,
  EventType,
  RoundState,
  type BountyContext,
  type BountyEffect,
  type BountyEvent,
} from './machine';
import { DEFAULT_RULES, type RoundParams, type TableRules } from './rules';

export type ControllerCue =
  | { readonly type: 'response'; readonly kind: 'open' | 'reveal' | 'cashout'; readonly ok: boolean; readonly latencyMs: number; readonly requestId: number }
  | { readonly type: 'revealed'; readonly cell: number; readonly outcome: 'safe' | 'hazard' }
  | { readonly type: 'roundOver'; readonly outcome: 'win' | 'bust' };

export type BountyControllerOptions = {
  readonly provider: RoundProvider;
  readonly clock: Clock;
  readonly params: RoundParams;
  readonly balance: number;
  readonly rules?: TableRules;
  readonly board?: BoardPort;
  readonly requestTimeoutMs?: number;
  readonly isoNow?: () => string;
};

export class BountyController {
  readonly rules: TableRules;
  private readonly machine: Machine<RoundState, BountyEvent, BountyContext, BountyEffect>;
  private provider: RoundProvider;
  private board: BoardPort;
  private readonly clock: Clock;
  private readonly timeoutMs: number;
  private readonly cueListeners = new Set<(c: ControllerCue) => void>();
  private timeout: TimerHandle | null = null;

  constructor(o: BountyControllerOptions) {
    this.rules = o.rules ?? DEFAULT_RULES;
    this.provider = o.provider;
    this.board = o.board ?? createImmediateBoard();
    this.clock = o.clock;
    this.timeoutMs = o.requestTimeoutMs ?? 8000;
    const machineOptions = {
      clock: o.clock,
      runEffect: (effect: BountyEffect) => this.run(effect),
      ...(o.isoNow ? { isoNow: o.isoNow } : {}),
    };
    this.machine = new Machine(createBountySpec(this.rules), createInitialContext(o.params, o.balance), machineOptions);
  }

  // ------------------------------------------------------------ store

  readonly subscribe = (l: () => void) => this.machine.subscribe(l);
  readonly getSnapshot = (): BountyContext => this.machine.getSnapshot();
  onTransition(l: (r: TransitionRecord<RoundState>, ctx: BountyContext) => void) {
    return this.machine.onTransition(l);
  }
  onCue(l: (c: ControllerCue) => void): () => void {
    this.cueListeners.add(l);
    return () => this.cueListeners.delete(l);
  }
  getHistory() {
    return this.machine.getHistory();
  }
  clearHistory() {
    this.machine.clearHistory();
  }

  // ------------------------------------------------------------ intents

  start() {
    this.machine.dispatch({ type: EventType.START });
  }
  pick(cell: number) {
    this.machine.dispatch({ type: EventType.PICK, cell });
  }
  cashOut() {
    this.machine.dispatch({ type: EventType.CASH_OUT });
  }
  setParams(patch: Partial<RoundParams>) {
    this.machine.dispatch({ type: EventType.SET_PARAMS, patch });
  }
  setTurbo(enabled: boolean) {
    this.machine.dispatch({ type: EventType.SET_TURBO, enabled });
  }
  retry() {
    this.machine.dispatch({ type: EventType.RETRY });
  }
  dismissError() {
    this.machine.dispatch({ type: EventType.DISMISS_ERROR });
  }
  syncBalance() {
    this.run({ type: 'SYNC_BALANCE' });
  }

  /** Primary action: start between rounds, cash out during a round. */
  primary() {
    const s = this.getSnapshot().state;
    if (s === RoundState.ROUND_ACTIVE) this.cashOut();
    else this.start();
  }

  attachBoard(board: BoardPort | null) {
    this.board = board ?? createImmediateBoard();
  }

  /** Swap the backend between rounds only. */
  setProvider(provider: RoundProvider): boolean {
    const s = this.getSnapshot().state;
    if (s !== RoundState.IDLE && s !== RoundState.ROUND_OVER_WIN && s !== RoundState.ROUND_OVER_BUST) return false;
    this.provider = provider;
    return true;
  }

  dispose() {
    this.clearTimeout();
    this.machine.dispose();
    this.cueListeners.clear();
  }

  // ------------------------------------------------------------ effects

  private run(effect: BountyEffect): void {
    switch (effect.type) {
      case 'OPEN_ROUND':
        this.request('open', effect.request.requestId, () => this.provider.openRound(effect.request), (result) =>
          this.machine.dispatch({ type: EventType.ROUND_OPENED, result }),
        );
        return;
      case 'REQUEST_REVEAL':
        this.request('reveal', effect.request.requestId, () => this.provider.reveal(effect.request), (result) =>
          this.machine.dispatch({ type: EventType.REVEAL_RESPONSE, result }),
        );
        return;
      case 'REQUEST_CASHOUT':
        this.request('cashout', effect.request.requestId, () => this.provider.cashOut(effect.request), (result) =>
          this.machine.dispatch({ type: EventType.CASHED, result }),
        );
        return;
      case 'PLAY_REVEAL': {
        const { requestId, cell, outcome, turbo } = effect;
        this.cue({ type: 'revealed', cell, outcome });
        let p: Promise<void>;
        try {
          p = this.board.playReveal(cell, outcome, { turbo });
        } catch {
          p = Promise.resolve();
        }
        const settle = () => this.machine.dispatch({ type: EventType.STEP_SETTLED, requestId });
        p.then(settle, settle);
        return;
      }
      case 'PLAY_SWEEP':
        this.cue({ type: 'roundOver', outcome: effect.outcome });
        try {
          this.board.playSweep(effect.outcome, { turbo: effect.turbo });
        } catch {
          /* cosmetic */
        }
        return;
      case 'SYNC_BALANCE':
        this.provider.getBalance().then(
          (balance) => this.machine.dispatch({ type: EventType.BALANCE_SYNCED, balance }),
          () => undefined,
        );
        return;
    }
  }

  /** Call a provider method with a client-side timeout; never throws. */
  private request<T>(kind: 'open' | 'reveal' | 'cashout', requestId: number, call: () => Promise<ProviderResult<T>>, deliver: (r: ProviderResult<T>) => void) {
    const sentAt = this.clock.now();
    this.clearTimeout();
    const finish = (r: ProviderResult<T>) => {
      this.cue({ type: 'response', kind, ok: r.ok, latencyMs: this.clock.now() - sentAt, requestId });
      deliver(r);
    };
    // Each attempt owns its timer, so a late answer to an earlier attempt can't cancel a retry's timeout.
    const handle = this.clock.setTimeout(() => {
      if (this.timeout === handle) this.timeout = null;
      finish({ ok: false, requestId, error: { code: ProviderErrorCode.TIMEOUT, message: `No answer within ${this.timeoutMs} ms.`, recoverable: true } });
    }, this.timeoutMs);
    this.timeout = handle;
    const clearMine = () => {
      this.clock.clearTimeout(handle);
      if (this.timeout === handle) this.timeout = null;
    };

    let pending: Promise<ProviderResult<T>>;
    try {
      pending = call();
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending.then(
      (r) => {
        clearMine();
        finish(r);
      },
      (err: unknown) => {
        clearMine();
        finish({ ok: false, requestId, error: { code: ProviderErrorCode.NETWORK, message: err instanceof Error ? err.message : String(err), recoverable: true } });
      },
    );
  }

  private clearTimeout() {
    if (this.timeout) this.clock.clearTimeout(this.timeout);
    this.timeout = null;
  }

  private cue(c: ControllerCue) {
    for (const l of this.cueListeners) {
      try {
        l(c);
      } catch {
        /* ignore */
      }
    }
  }
}
