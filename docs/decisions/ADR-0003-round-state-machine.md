# ADR-0003: Explicit round lifecycle with a whitelist transition table

- **Date:** 2026-11-23T18:03:08Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)
- **Related:** ADR-0002, ADR-0004, ADR-0005

## Context

Grid games break in production through rapid double-clicks (two reveals in flight), revealing during an animation,
cashing out while a reveal is pending, and stale responses after an error. QA and operators also need to know
exactly which state the client was in.

## Decision

States (const object + union): `IDLE, CONFIGURING, ROUND_ACTIVE, REVEALING_STEP, CASHING_OUT, ROUND_OVER_WIN, ROUND_OVER_BUST, ERROR_RECOVERABLE`.

```
IDLE ──START──▶ CONFIGURING ──ROUND_OPENED──▶ ROUND_ACTIVE ──PICK──▶ REVEALING_STEP ──STEP_SETTLED(safe)──▶ ROUND_ACTIVE
                                                  │                         └─STEP_SETTLED(hazard)──▶ ROUND_OVER_BUST
                                                  └──CASH_OUT──▶ CASHING_OUT ──CASHED──▶ ROUND_OVER_WIN
   (all safe cells found → auto cash-out)   ROUND_OVER_* ──START──▶ CONFIGURING   any request failure ──▶ ERROR_RECOVERABLE
```

- **CONFIGURING** means "round being configured with the provider": the bet is debited optimistically and the provider is
  creating the round (seed commitment, hazard layout). Board settings are locked from here until the round ends.
- Pure reducer `transition(ctx, event) → accepted + effects | rejected + reason`. Events not allowed in the current
  state are rejected and logged, never thrown. **Exactly one reveal can be in flight**, because `PICK` is only allowed in `ROUND_ACTIVE`.
- Every request carries a monotonic `requestId`. Responses for any other id are discarded as stale.
- Recovery depends on where the error happened: a failed start refunds and returns to IDLE. A failed reveal or cash-out
  returns to ROUND_ACTIVE (the round still exists server-side) and is retried idempotently with the same requestId.

## Alternatives Considered

1. **Boolean flags** (`isRevealing`, `isBusy`): the classic source of impossible states.
2. **Queueing clicks during a reveal**: surprising for players, and dangerous with hazards. Rejected.
3. **XState**: a good fit, but a dependency plus a DSL. The table is about 30 lines.

## Trade-offs

| We gain | We give up |
|---|---|
| Double-reveal, reveal-during-cashout and stale-response bugs are unrepresentable | New states need table and test updates |
| Inspector can render the live chain + log directly | Slightly more ceremony than flags |
