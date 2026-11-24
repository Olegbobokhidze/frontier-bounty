# Session Report: native-craft-character-polish

- **Date:** 2026-11-24
- **Started:** ~2026-11-24T13:30Z (baseline e2e scene log at 13:35:19Z); report created 2026-11-24T14:15:32Z
- **Ended:** 2026-11-24T14:17:23Z
- **Actor(s):** Oleg Bobokhidze (owner, request), agent (Claude Opus 5.5)
- **Branch / commits:** `main`, uncommitted working tree on top of `be279ee` (no commits made this session)

## 1. Summary

This session raised the board and the marshal to a "native" craft bar without touching the round machine, the spatial maths or
any port contract.

- **Stage:** the marshal's place is now computed by a pure, property-tested function, so he fills the space the square board
  leaves. He also watches the claim you're targeting.
- **Acting:** he acts through every beat (cock and draw, celebrate, a streak flourish, alarm at the fuse, hit-stop and flinch,
  dust-off recovery, a purse toss).
- **Cells:** each state is now unmistakable, from the targeting sights and the stamped bounty to the scorched crater and a
  sweep that ripples out from the deciding cell.
- **BOOM:** richer but bounded. FX stays at 59 fps through the blast.

## 2. Completed Work

- [x] **Stage arrangement (ADR-0007):** pure `arrangeStage()` in [src/board/stage-layout.ts](../../../src/board/stage-layout.ts).
  It returns `side | stack | board` by sweeping board sizes within a 14% cell budget (≥ 44px) and scoring
  `ln(characterScale) − 2.5·cellLoss`. Replaces the `0.36fr` column and the portrait strip breakpoints. The waist-up framing
  is tightened to hat→chest ([framing.ts](../../../src/board/scene/framing.ts)).
- [x] **One-frame overflow fix:** `GridLayout` is derived from the arrangement in the same render
  ([BoardView.tsx](../../../src/board/BoardView.tsx)), instead of a second ResizeObserver.
- [x] **Performance layer**, all observer-only and unit-tested:
  - Pose and clips ([pose.ts](../../../src/board/scene/pose.ts), [clips.ts](../../../src/board/scene/clips.ts)): new keyed
    params `brow`, `mouth`, `tension`, `brim`, `brush`, `bagToss`, `hammer`, and new clips `alarm`, `recover`,
    `celebrateBig`, `fidgetHat`, `fidgetLook`.
  - Animator ([animator.ts](../../../src/board/scene/animator.ts)): procedural gaze, tension breathing that is held on the
    aim line, trigger twitch, `hold(ms)` hit-stop, fidgets only when nobody is targeting, and twirl resolution on interrupt.
- [x] **Gaze hook:** `Scene.lookAt(cell | null)` is fed by mouse/pen hover (hit-tested) and keyboard focus. The barrel tracks
  the target in `aimHold`. The safe streak picks `celebrateBig` every third claim. Markers drive boot and coat dust, the hat
  slap and the purse catch ([scene.ts](../../../src/board/scene/scene.ts)). New `hat` and `catch` cues are in
  [scene-sound.ts](../../../src/ui/scene-sound.ts).
- [x] **Rig:** off-hand IK reaches (hat brim, brushing the coat) blend along an arc about the shoulder with a smoothstep
  weight, and the bag can be tossed ([rig.ts](../../../src/board/scene/rig.ts)).
- [x] **Drawing** ([gunslinger.ts](../../../src/board/scene/gunslinger.ts)):
  - body: tapered limbs with shade strips, leather gloves, a tin star, a forked duster with two swaying tails, the bandana knot
  - face: the hat brim's shadow band across the eyes, with catch-lights; eyes that widen; brows that arch or furrow; an open
    shout or whoop
  - gun: a hammer that cocks and a cylinder that indexes
  - figure–ground: the chaps were dropped and the backdrop behind him darkened
- [x] **FX** ([fx.ts](../../../src/board/fx.ts)):
  - a fixed bank of 6 emitters: fuse sparks, barrel wisp, crater smoke
  - new kinds: scorch, heat veil, splinter, clod, brass ring, wisp
  - coins bounce once on the board floor
  - the pool grew 520 → 560 slots, with a rolling spawn cursor
- [x] **Cells** ([app.css](../../../src/ui/styles/app.css), [art.tsx](../../../src/board/art.tsx),
  [board-motion.ts](../../../src/board/board-motion.ts)):
  - targeting: brass sight brackets on hover or focus, locking tight while pending
  - reveal: a stamped badge, a popped multiplier tag, and an overshoot slap on the flip
  - BOOM: the lit-fuse lid trembles; the blast punch moves to a `.cell__jolt` wrapper at the BOOM beat, which fixes the old
    re-flip at settle; neighbours get jolts from `blastJolts()`
  - end of round: the sweep ripples outward via `rippleDistances()`
  - faces: found, unclaimed, cold and scorched are now distinct, and the hit lid shows charred crater art with irregular
    splinters
- [x] **HUD** ([motion.ts](../../../src/ui/hooks/motion.ts), [Ledger.tsx](../../../src/ui/components/Ledger.tsx)):
  - the purse counts up on cash-out only (reduced motion snaps), with an sr-only authoritative live region
  - the multiplier bumps and the ladder rung bumps
  - `tabular-nums` on every changing figure
  - warmer lamp light on the wall and the table
- [x] **Inspector:** previews of every clip, framing and gaze readouts, and the real pool size
  ([InspectorDrawer.tsx](../../../src/ui/components/InspectorDrawer.tsx)).
- [x] **Tests:** 84 unit tests (+25), including a property test of `arrangeStage` over about 2,000 stage sizes and 3 grids.
  e2e has 44 checks (+4 new, and the 6 viewport checks now also assert the marshal stays clear of the board)
  ([e2e/smoke.mjs](../../../e2e/smoke.mjs)).
- [x] **Docs:** [ADR-0007](../../decisions/ADR-0007-stage-arrangement-and-character-performance.md), 10 decision-log
  entries, README *Character & FX* section and e2e count.

## 3. Key Decisions

| Timestamp (UTC) | Area | Decision | Reference |
|---|---|---|---|
| 2026-11-24T14:13:58Z | board/scene (human) | Presentation-only scope; state machine, spatial maths, ports and layers untouched | ADR-0007, log |
| 2026-11-24T14:13:59Z | board/layout | Computed stage arrangement, scored `ln(scale) − 2.5·loss` within a 14% / 44px cell budget | ADR-0007, log |
| 2026-11-24T14:13:59Z | board/layout | Derive `GridLayout` from the arrangement in the same render (e2e found a 57px one-frame overflow) | log |
| 2026-11-24T14:13:59Z | board/scene | Performance layer: face params, gaze, tension breath, twitch, hit-stop, fidgets, new clips | ADR-0007, log |
| 2026-11-24T14:14:00Z | board/scene | Arc-blended, smoothstepped off-hand IK (tests found an elbow spin and a singularity pop) | log |
| 2026-11-24T14:14:00Z | board/scene | Drawing craft and figure–ground fixes found in zoomed captures | log |
| 2026-11-24T14:14:01Z | board/fx | Emitter bank and new particle kinds; pool 560, rolling cursor | log |
| 2026-11-24T14:14:01Z | board/cells | Sights, stamp, tremble, jolt-wrapper punch at the BOOM beat, ripple sweep, distinct faces | log |
| 2026-11-24T14:14:02Z | ui/hud | Cash-out count-up, sr-only authoritative purse, bumps, tabular nums | log |
| 2026-11-24T14:14:02Z | e2e | +4 checks; marshal-clear-of-board at 6 viewports | log |

## 4. Verification

The baseline before any edit: `pnpm verify` passed with 59 tests, and `pnpm e2e` passed 40/40.

| Check | Command | Result |
|---|---|---|
| Types | `pnpm typecheck` | pass (`tsc -p tsconfig.json`, no output) |
| Lint (layer rules) | `pnpm lint` | pass (`eslint .`, no output) |
| Tests | `pnpm test` | `Test Files 9 passed (9)` · `Tests 84 passed (84)` |
| Build | `pnpm build` | `index-CADLL0aq.js 258.47 kB │ gzip: 84.91 kB` · `index-BtTpjWoJ.css 33.27 kB │ gzip: 7.51 kB` · `✓ built in 2.37s` |
| E2E | `pnpm e2e` (with `pnpm dev`) | `44/44 checks passed` |
| Manual | CDP screencast at real-time offsets (desktop 1440×900), layouts at 5 viewports, reduced-motion round | see below |

Selected e2e lines from the final run:

```
PASS  marshal looks at the targeted claim (gaze follows hover)  — bust · 1.00
PASS  targeted claim shows the sight brackets  — opacity 1
PASS  flip waits for the bullet even with zero latency  — view at +110ms: pending
PASS  BOOM punches the hit lid and jolts its neighbours  — {"blasted":true,"jolted":10}
PASS  after the blast he recovers (dust off, hat back) before idling  — idle · 50 ms
PASS  frame rate holds through the BOOM window (≥ 50 fps)  — 59 fps · avg 16.9 ms · p95 16.8 ms · max 33.4 ms
PASS  FPS during reveals ≥ 50  — 57 fps · avg 17.4 ms · p95 16.8 ms · max 50.0 ms
PASS  tablet-820: … {"overflow":0,…,"minCell":102,"stage":"side","posseOk":true}
PASS  portrait-320: … {"overflow":0,…,"minCell":49,"stage":"board","posseOk":true}
PASS  no uncaught page errors
44/44 checks passed
```

Manual probes run this session:

- **Repeated BOOM previews:** three, 1.3s apart, with no screenshots: `avg 16.7 ms · p95 16.8 ms · max 16.8 ms`. One earlier
  e2e run showed a 66.6ms max, which was the in-window full-page screenshot; it doesn't reproduce without captures.
- **Reduced motion:** a full round with `prefers-reduced-motion: reduce`. The safe pick settled in 446ms and the bust in
  548ms; framing read `bust · 0.00` (no gaze) and there were no page errors.
- **Arrangement at each viewport:**

  | Viewport | Arrangement | Cell |
  |---|---|---|
  | 1440×900, Inspector open | stack | 87px |
  | 390×844 | stack | 55px |
  | 820×1180 | side | 102px |
  | 844×390 | side | 58px |
  | 360×740 | stack | 50px |

## 5. Known Limitations

- **Smaller cells on some stages:** the arrangement may give up to 14% of cell size for a much larger marshal. With the
  Inspector open at 1440×900, cells go from 101 to 87px; on an 820×1180 tablet, from 118 to 102px. Tune
  `STAGE.cellCost` / `STAGE.maxCellLoss` to taste.
- **Tall slots:** on very tall side slots (e.g. a portrait tablet) there is still empty wall above the full-body figure,
  because the width budget (knock-back + extended revolver) limits his scale.
- **Gaze needs a pointer or keyboard:** touch has no hover, so on phones the marshal only looks at a claim once it is picked.
- **Turbo:** it still shortens only the flip, not the draw (carried over from the previous report).
- **Reaction length:** flinch → recover adds about 1.15s after a bust. It is cosmetic, and the next round's `ready` clip
  interrupts it cleanly, but a rapid restart cuts the recovery short by design.
- **Canvas scorch fades:** the canvas scorch fades over 4.5s. The DOM crater on the hit lid persists until the next round.
- **Per-frame gradients:** the rim light allocates one linear gradient per frame, alongside the existing tracer gradient.

## 6. Next Steps

1. A turbo `shoot` variant (a shorter draw) so turbo also shortens pick → impact.
2. Touch gaze: on `pointerdown` (before the same-cell release confirms a pick), call `lookAt` for a brief glance.
3. Cache the rim gradient per framing (rebuild on `setGeometry` and when the torso angle changes by more than a threshold).
4. A rival character on the far side of the board reusing `rig`/`framing` mirrored, which `arrangeStage` could offer a
   `flank` mode for on wide stages.
5. Keep the e2e screenshot out of the BOOM FPS window, so the `max` metric reflects only the FX.
