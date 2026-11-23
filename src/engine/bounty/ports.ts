/** Ports for Dynamite & Bounty (ADR-0005, ADR-0004). Implementations live in adapters/ and board/. */
import type { ProviderResult } from '../../core/result';
import type { RoundParams } from './rules';

// ------------------------------------------------------------------ backend

export type OpenRoundRequest = RoundParams & { readonly requestId: number };

export type RoundOpened = {
  readonly roundId: string;
  /** SHA-256(serverSeed): the commitment shown before any pick. */
  readonly serverSeedHash: string;
  readonly nonce: number;
  readonly balanceAfter: number;
};

export type RevealRequest = { readonly requestId: number; readonly roundId: string; readonly cell: number };

/** Revealed at round end so the client can render the full board and verify fairness. */
export type RoundDisclosure = {
  readonly hazards: readonly number[];
  readonly serverSeed: string;
};

export type RevealResult =
  | { readonly outcome: 'safe'; readonly cell: number; readonly safePicks: number; readonly multiplier: number }
  | ({ readonly outcome: 'hazard'; readonly cell: number } & RoundDisclosure);

export type CashOutRequest = { readonly requestId: number; readonly roundId: string };

export type CashOutResult = RoundDisclosure & {
  readonly payout: number;
  readonly multiplier: number;
  readonly balanceAfter: number;
};

export type RoundProvider = {
  readonly id: string;
  openRound(req: OpenRoundRequest): Promise<ProviderResult<RoundOpened>>;
  /** Idempotent per requestId: a retry returns the original result. */
  reveal(req: RevealRequest): Promise<ProviderResult<RevealResult>>;
  cashOut(req: CashOutRequest): Promise<ProviderResult<CashOutResult>>;
  getBalance(): Promise<number>;
};

// ------------------------------------------------------------------ board (animation timing + FX)

export type BoardPort = {
  /** Resolves when the flip/blast animation for this cell has finished. */
  playReveal(cell: number, outcome: 'safe' | 'hazard', options: { readonly turbo: boolean }): Promise<void>;
  /** Round-end sweep of the remaining board (fire-and-forget). */
  playSweep(outcome: 'win' | 'bust', options: { readonly turbo: boolean }): void;
};

export function createImmediateBoard(): BoardPort {
  return { playReveal: () => Promise.resolve(), playSweep: () => undefined };
}
