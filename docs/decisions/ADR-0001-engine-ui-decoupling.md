# ADR-0001: Pure engine, layered single-package repo

- **Date:** 2026-11-23T18:03:08Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)
- **Related:** ADR-0002, ADR-0003

## Context

The game must ship as its own deployable app with its own link, while showing provider-grade separation
between game logic and presentation. Logic welded to React components can't be unit tested
deterministically, and it hides double-reveal races inside component lifecycles.

## Decision

- One Vite package (one deploy target) with **layers enforced by ESLint**:
  `core ← engine ← adapters/audio/config ← board ← ui`.
- `core` and `engine` are pure TypeScript with no React or DOM globals. Time and randomness are injected (`Clock`, `Rng`).
- The engine reaches the outside world only through ports: `RoundProvider` (backend) and `BoardPort` (animations).
- React reads engine state via `useSyncExternalStore(controller.subscribe, controller.getSnapshot)` and sends intents only.

## Alternatives Considered

1. **pnpm monorepo** (as in the slot project). Stronger physical boundaries, but more tooling for a single deployable.
   Lint rules give the same guarantees here.
2. **Zustand/Redux as the engine.** Couples game rules to a UI state library, and async effect ordering becomes implicit.

## Trade-offs

| We gain | We give up |
|---|---|
| One build, one deploy, simple hosting config | Boundaries rely on lint, not on package manifests |
| Engine tests run in Node in milliseconds | Ports need careful design up front |

## Consequences

- Splitting into packages later is mechanical: each folder already has an explicit import surface.
