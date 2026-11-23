# ADR-0005: Server-authoritative RoundProvider with provably-fair commitment

- **Date:** 2026-11-23T18:03:08Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)
- **Related:** ADR-0003

## Context

Real-money grid games keep hazard positions on the server until the round ends. Operators expect *provably fair*
verification. A portfolio demo has no server, but the client must behave exactly as it would against one.

## Decision

```ts
type RoundProvider = {
  openRound(req): Promise<ProviderResult<RoundOpened>>;   // returns serverSeedHash + nonce (commitment)
  reveal(req): Promise<ProviderResult<RevealResult>>;      // safe → multiplier; hazard → full board + serverSeed
  cashOut(req): Promise<ProviderResult<CashOutResult>>;    // payout + full board + serverSeed
  getBalance(): Promise<number>;
};
```

- The client never learns hazard positions before the round ends.
- **Fairness**: `roundSeed = SHA-256(serverSeed + ":" + clientSeed + ":" + nonce)`. Its first 4 bytes seed the engine's
  mulberry32 PRNG, which places hazards with a partial Fisher–Yates shuffle (`engine/bounty/placement.ts`, pure and tested).
  Before the round the client sees `SHA-256(serverSeed)`. After it, the server reveals `serverSeed`, and the Inspector re-derives the
  layout and checks the commitment.
- Requests are **idempotent by requestId**: retrying after a network error returns the original result and never double-reveals.
- `MockProvider` adds latency ranges, an error rate, timeouts, and forced next-step scenarios (safe, hazard, network error, timeout).
  It also has a QA-only "peek" so testers can see the layout, clearly labelled as a cheat.
- Providers never throw across the port; transport failures resolve to `{ ok: false }`.

## Alternatives Considered

1. **Client-side hazard placement**: trivially exploitable via devtools, and reviewers would notice.
2. **HMAC-based derivation** (common in production): equivalent guarantees. SHA-256 of the concatenation keeps the demo simple and verifiable in a browser.

## Trade-offs

| We gain | We give up |
|---|---|
| Realistic contract; real backend drops in | Mock ships "server" logic in the client bundle |
| Verifiable rounds in the Inspector | Async WebCrypto in the adapter layer |
