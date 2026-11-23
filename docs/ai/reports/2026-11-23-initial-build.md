# Session Report: initial-build

- **Date:** 2026-11-23
- **Started:** 2026-11-23T18:03:08Z (repo scaffold; this file was generated at 18:23:56Z)
- **Ended:** 2026-11-23T18:26:00Z
- **Actor(s):** Oleg Bobokhidze (owner: requirements, separate repo, deploy-config-only), agent (Claude Opus 5.5: implementation)
- **Branch / commits:** `main`, `f038b18..HEAD`

## 1. Summary

Built **Frontier Dynamite & Bounty** from an empty folder as its own deployable repo. It has a deterministic
8-state grid round engine on a generic machine runner, a shared spatial module ready for a Plinko mode,
a provably-fair server-authoritative mock provider with fault injection, an accessible DOM + Canvas board,
a Western ledger HUD, synthesized frontier audio, and a Provider Inspector. Decision tracking (ADRs, a JSONL log,
reports, AGENTS.md) and deploy configs for Netlify, Vercel and GitHub Pages are included.

## 2. Completed Work

- [x] **Docs & tooling**: [AGENTS.md](../../../AGENTS.md), [ADR-0001…0005](../../decisions/), [decision-log.jsonl](../decision-log.jsonl),
      the report template, `pnpm log:decision` / `pnpm report:new`, and ESLint layer rules (no `enum` or `interface`).
- [x] **core/**: `Machine` (allow-list, pure reducer, effect descriptors, queued dispatch, bounded transition log), clocks, rng, money, result types.
- [x] **engine/spatial**: coordinates, labels (C3), neighbours, clamped keyboard moves, `fitLayout`, `hitTest` (gaps miss), AABB and circle overlap.
- [x] **engine/bounty**: fair multiplier model (3% house edge, floored), table model, ladder, deterministic Fisher–Yates placement,
      round machine (`IDLE, CONFIGURING, ROUND_ACTIVE, REVEALING_STEP, CASHING_OUT, ROUND_OVER_WIN, ROUND_OVER_BUST, ERROR_RECOVERABLE`),
      controller with per-attempt timeouts, settle gating and client cross-checks of multiplier and payout.
- [x] **adapters/**: `MockProvider` (SHA-256 commitment, idempotent requestIds, latency range, error rate, forced safe/dynamite/network/lost-response/timeout,
      QA peek), `HttpProvider` (Idempotency-Key header, response validation), and `verifyRound`.
- [x] **board/**: absolutely positioned DOM buttons from the shared `GridLayout`, CSS 3D flips (transform/opacity only),
      a diagonal sweep at round end, a Canvas FX layer (dust motes, gold flecks, debris, smoke, coins) with frame stats, and a `BoardPort` implementation.
- [x] **ui/**: ledger (purse, stake, territory, dynamite, presets, odds, turbo, primary), multiplier ladder, wanted-poster results,
      rules drawer with payout table and fairness notes, error dialog (Retry vs Back to camp), and the Provider Inspector.
- [x] **audio/**: synthesized wood knock, brass clink, fuse hiss, blast, register bell, stake and error cues. Persisted volume and mute, safe fallback.
- [x] **Deploy config**: `netlify.toml`, `vercel.json`, and a manual GitHub Pages workflow (runs `pnpm verify` before publishing). Relative build base.

## 3. Key Decisions

| Timestamp (UTC) | Area | Decision | Reference |
|---|---|---|---|
| 2026-11-23T18:03:08Z | repo | Separate repo; deploy config only (owner) | log |
| 2026-11-23T18:03:08Z | architecture | Single package, lint-enforced layers | ADR-0001 |
| 2026-11-23T18:03:08Z | spatial | Shared spatial module + mode registry (Plinko planned) | ADR-0002 |
| 2026-11-23T18:03:08Z | state machine | Whitelist table, one reveal in flight, requestId guard | ADR-0003 |
| 2026-11-23T18:03:08Z | board | DOM cells + Canvas FX, hit-testing, settle gating | ADR-0004 |
| 2026-11-23T18:03:08Z | adapters | Server-authoritative, SHA-256 commitment, idempotency | ADR-0005 |
| 2026-11-23T18:23:38Z | idempotency | Retries reuse requestId; DUPLICATE_RESPONSE guard; no dismiss mid-round | log |
| 2026-11-23T18:23:38Z | controller | Per-attempt timeout handles (found in review) | log |
| 2026-11-23T18:23:39Z | input | Same-cell press+release for pointer picks | log |
| 2026-11-23T18:23:39Z | responsive | Compact portrait ledger; overflow and cell-size assertions | log |

## 4. Verification

All runs below happened in this session, after the last code change.

| Check | Command | Result |
|---|---|---|
| Types | `tsc -p tsconfig.json` | ✅ 0 errors |
| Lint | `eslint .` | ✅ 0 problems |
| Tests | `vitest run` | ✅ 6 files, **45 tests**: spatial maths, multiplier maths (exact RTP bound for every cash-out strategy, Monte-Carlo ≈ 97%), placement determinism and uniformity, 15 state-machine cases, cell-view derivation, audio fallback, 6 controller × mock integration tests (fair round verifies, double-click, lost response + retry, timeout, tamper detection, throwing board) |
| Build | `vite build` | ✅ 68.3 KB gzipped JS, 6.0 KB CSS. `dist/index.html` uses relative `./assets/…` paths |
| E2E | `node e2e/smoke.mjs` (headless Chrome, Intel Xe iGPU) | ✅ **35/35**: stake and debit, double-click → 1 accepted PICK, keyboard arrows + Enter, C cash-out, win and bust posters + sweep, both rounds verify, lost response → Retry → pick applied once, forced dynamite detected as tampered, open failure refunds, 6×6 preset, **59 fps during reveals (p95 16.8 ms)**, right-aligned modal and drawer actions, no overflow (page or ledger) and ≥ 40 px cells at 320/360/390 portrait, 844×390 landscape, 820 tablet, 1280 desktop, no page errors |

Not verified: no one has listened to the audio (only fallback and clamping are tested). The deploy configs were not run against
real Netlify, Vercel or GitHub accounts. `pnpm e2e` ran against a dev server on port 5199, because 5174 was busy on this machine.

## 5. Known Limitations

- QA peek and forced outcomes ship in the bundle. Gate them behind a build flag for operator builds.
- After a failed **open**, the server may still have created the round. The client resyncs the balance but doesn't reconcile orphaned rounds.
- The mock server lives in browser memory, so a reload starts a new wallet. There's no round resume.
- The Plinko mode is registered and documented but not implemented.
- Arrow-key navigation covers the grid only. Ledger controls use the native tab order.

## 6. Next Steps

1. Frontier Plinko: a deterministic peg-path simulation in `engine/plinko` reusing `core/machine` and `spatial.circleIntersectsAabb`, plus a canvas board.
2. Round resume: `RoundProvider.getActiveRound()` and a `RESUME` event.
3. CI: `pnpm verify` on push, and e2e with `E2E_GPU=0`.
4. A build flag that strips the QA peek and forced outcomes from production.
5. Auto-play ("dig N claims then cash out") as a pure strategy on top of the machine.

## How to run & demo

```bash
pnpm install
pnpm dev                     # http://localhost:5174
```

1. Press **Space** to stake a claim. Click cells, or use the **arrows + Enter**. Double-clicking can't reveal twice.
2. Watch the ladder climb, then press **C** to cash out. Coins drop and the wanted poster shows the bounty.
3. Press **`** for the Inspector. Click **Verify round** to re-derive the layout from the revealed server seed.
4. *Force next request → processed, response lost*, then dig. The error dialog shows **Retry**, and the same request recovers the pick exactly once.
5. *Force → dynamite*, then dig and verify. The tampering is detected.
6. Use presets (Greenhorn → Big Country 8×8), turbo (**T**), stake keys **1–9**, and the latency and error-rate sliders.
