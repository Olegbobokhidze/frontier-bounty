# Session Report: characters-and-boom-fx

- **Date:** 2026-11-23
- **Started:** 2026-11-23T18:28:00Z (baseline `pnpm verify` green; this file was generated at 18:45:33Z)
- **Ended:** 2026-11-23T18:48:00Z
- **Actor(s):** Oleg Bobokhidze (owner: scope = characters, animation, shot/hit reactions and BOOM FX only), agent (Claude Opus 5.5)
- **Branch / commits:** `main`, one commit on top of `f4305a1`

## 1. Summary

Added **Marshal Silas Kane**, a procedurally drawn Western gunslinger with keyframed and procedural animation. He idles,
aims at the exact cell, fires, reacts to a bounty, flinches at dynamite, and collects on a cash-out. Shot, impact and dynamite
FX were rebuilt as a layered BOOM. The round state machine, round logic, provider contracts and engine tests are
**unchanged**. The scene only observes events. The one sanctioned coupling, impact gating, is recorded in **ADR-0006**.

## 2. Completed Work

- [x] `src/board/scene/` (new): `pose`, `clips` (idle, ready, shoot, aimHold, celebrate, flinch, collect), `easing`
      (outBack strike, outSpring settle, …), `animator` (blending from the current keyed pose, markers fired once,
      breathing, weight shift, micro-looks, blinks, aim tracking, hat-lag and coat-sway springs), `rig` (FK + two-bone leg IK),
      `framing` (full / bust / hidden), `gunslinger` (Canvas 2D drawing: duster, hat and band, bandana, vest, gun belt and holster,
      spurs, revolver, money bag, expressive face, warm key light and rim), `scene` (beats, impact gating, previews, debug).
- [x] `board/fx.ts`: muzzle flash, tracer, shell casing, impact dust and splinters, and a layered BOOM (flash, fireball, 2 shockwave
      rings, spark streaks, embers, debris, billowing smoke, delayed ash). The character is drawn on the same canvas and loop.
- [x] `board/BoardView.tsx`: stage = character slot + board + shared canvas. A shot fires on each new reveal `requestId`.
      The flip waits for impact. Decaying camera shake on the stage. Character quips.
- [x] `board/board-port.ts`: `playReveal` awaits the impact, then fires the safe or boom reaction at the flip's midpoint.
- [x] Audio: new `SHOT` and `HOLSTER` cues. `ui/scene-sound.ts` aligns shot, impact, fuse, clink, blast, holster and register cues
      to the animation beats. Mute and fallback behaviour unchanged.
- [x] Inspector: a **Character & FX** section with the live clip, framing, particle count, scene events, clip previews and frame time.
- [x] Responsive: character column on desktop and landscape, waist-up strip on phone portrait (68–76 px), hidden at ≤ 680 px tall.
- [x] Docs: ADR-0006, 8 decision-log entries, AGENTS.md (scene rule), README.

## 3. Key Decisions

| Timestamp (UTC) | Area | Decision | Reference |
|---|---|---|---|
| 2026-11-23T18:45:21Z | scope | Characters, animation and FX only; machine and logic untouched | log, ADR-0006 |
| 2026-11-23T18:45:22Z | board/scene | Observer-only cosmetic scene with pure animator and rig | ADR-0006 |
| 2026-11-23T18:45:22Z | timing | Impact gating + 700 ms fallback + per-round epoch | ADR-0006 |
| 2026-11-23T18:45:23Z | animator | Keyed state separate from procedural output; smooth interrupt keys | log (bug found by tests) |
| 2026-11-23T18:45:23Z | fx | Layered BOOM in a fixed 520-particle pool, ≤ 10 px shake | log |
| 2026-11-23T18:45:23Z | framing | Reserve room for knock-back and gun; bust strip; hide on very short screens | log (bug found in captures) |
| 2026-11-23T18:45:24Z | audio | Cues follow scene beats | log |
| 2026-11-23T18:45:24Z | presentation | Posters delayed (win 520 ms, bust 1150 ms); quips | log |

## 4. Verification

All runs below happened in this session, after the final code change.

| Check | Command | Result |
|---|---|---|
| Baseline (before changes) | `pnpm verify` | ✅ 45 tests, build OK |
| Types / lint / tests / build | `pnpm verify` | ✅ **59 tests** (+14: easing, animator idle/markers/interrupt/return-to-idle/reduced-motion, rig aim/recoil/knock-back, framing incl. knock-back containment). JS 78.0 KB gzipped (was 68.3) |
| E2E | `node e2e/smoke.mjs` (headless Chrome, Intel Xe iGPU) | ✅ **40/40**: all 35 previous checks, plus: flip still *pending* 110 ms after a pick with **zero** latency (waits for the bullet); scene logs `shoot N → safe N`; dynamite emits `BOOM` with a 97-particle burst; the marshal plays `flinch`; **60 fps (p95 16.8 ms) through the BOOM window**; 59 fps during reveals; no overflow and ≥ 40 px cells at 320/360/390 portrait, 844×390, 820 tablet, 1280 desktop |
| Visual review | beat captures (idle, muzzle, boom flash, fireball, flinch, smoke, collect, portrait) | Reviewed. That review found two problems, both fixed: the flinch was clipped out of the slot, and the bust poster hid the blast |

Not verified: nobody has listened to the audio. Headless screenshots can't capture the fast beats (anticipation, muzzle,
impact) at exact times, so their ordering is asserted through the scene event log and cell state instead.

## 5. Known Limitations

- The character is stylised procedural vector art, not illustrated. At narrow slot widths (for example with the Inspector open) he renders small.
- A pick now completes about 190–260 ms later (draw, muzzle, bullet travel) before the flip starts. Turbo shortens the flip, not the draw.
- Very short portrait screens (≤ 680 px tall) hide the character, and shots come from off-screen below the board.
- Only one character so far. A rival or sheriff would reuse the rig, clips and framing.
- The tracer allocates one canvas gradient per frame while in flight (one or two frames per shot).

## 6. Next Steps

1. A turbo-specific `shoot` clip (shorter draw) so turbo also shortens the time from pick to impact.
2. A second character (a rival outlaw on the far side) that reacts to the BOOM by ducking. Reuse `rig`/`framing` with a mirrored transform.
3. Optional sprite-atlas skin behind the same `Pose → Rig` contract, for illustrated art.
4. A scorch decal on the blasted lid that persists until the next round.

## How to demo

```bash
pnpm dev    # http://localhost:5174
```

Watch the marshal idle (breathing, glances, weight shift). Stake a claim (Space) and click a lid: he draws, fires, the bullet
strikes, the lid flips, then he nods and twirls the revolver into the holster. Use Inspector → Force *dynamite* to see the BOOM
and the flinch. Press **C** to cash out and see the purse raised and the coins. Inspector → *Character & FX* previews each clip
and shows live particle counts and frame time.
