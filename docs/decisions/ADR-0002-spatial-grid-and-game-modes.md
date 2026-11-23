# ADR-0002: Shared spatial module + pluggable game modes

- **Date:** 2026-11-23T18:03:08Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)
- **Related:** ADR-0001, ADR-0003

## Context

The first mode is a hazard grid ("Dynamite & Bounty"). The architecture must also accept other spatial modes,
such as a Frontier Plinko peg-board with several projectiles at once, without rewriting state, logging or provider infrastructure.

## Decision

- `engine/spatial` owns **coordinate maths only**: `Cell {row,col}` ⇄ index, bounds, 4/8-neighbours, keyboard
  movement, `GridLayout` (cell size + gap + origin) with `hitTest(point) → Cell | null` (gaps return null), and
  `Vec2`/`AABB` primitives that a Plinko mode would use for peg collision.
- `core/machine` is a **generic table-driven state machine runner**: `allowed[state]`, a pure reducer, effect
  descriptors, a bounded transition log with timestamps, and `subscribe/getSnapshot`. Every mode reuses it.
- A mode = `engine/<mode>/` (config, maths, reducer, controller, provider port) + `board/<mode>/` (rendering)
  + an entry in `config/modes.ts` (`GameMode` descriptor: id, title, status). Only `bounty` is implemented. `plinko` is
  registered as `planned`, so the UI and docs show the extension point.

## Alternatives Considered

1. **One generic "board game" engine with flags.** It turns into a god object, and Plinko physics shares nothing with discrete picks.
2. **Mode-specific everything.** Duplicates logging, inspector and provider plumbing.

## Trade-offs

| We gain | We give up |
|---|---|
| New modes reuse machine, log, inspector, audio, providers | One extra abstraction level for the first mode |
| Spatial maths is tested once, independent of rendering | Plinko still needs its own deterministic physics sim |

## Consequences

- A Plinko mode needs a deterministic path simulation (seeded, server-authoritative final slot). The renderer animates
  the path; it doesn't decide it.
