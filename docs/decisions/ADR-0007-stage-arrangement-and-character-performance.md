# ADR-0007: Computed stage arrangement and a character performance layer

- **Date:** 2026-11-24T14:13:58Z
- **Status:** Accepted (extends ADR-0006; replaces only its CSS-breakpoint slot rules; no change to ADR-0003, ADR-0004 or ADR-0005 contracts)
- **Deciders:** Oleg Bobokhidze (owner: requested "native"-grade craft, a living character and richer BOOM FX), agent (Claude)
- **Related:** ADR-0004, ADR-0006; decision log 2026-11-24T14:13:58Z – 14:14:02Z

## Context

The owner asked for a step up in visual craft and character liveliness. Three findings drove the design:

1. **The marshal was small.** The character slot was a fixed `0.36fr` CSS column (portrait: fixed 68–150px strips, hidden
   at ≤ 680px tall). The board is square-celled, so on most stages it left slack on one axis that nobody used. On a
   1440×900 desktop with the Inspector open he rendered about 170px tall inside a 580px column.
2. **He did not act.** Idle was breathing plus micro-looks. Nothing linked him to the claim being targeted. A blast ended
   in a generic settle, and every face read the same.
3. **Cell states blurred together.** Found and unclaimed bounties looked alike, hover was a 3px lift, and the blast
   face was a cartoon starburst. The `punch` keyframes restarted at `rotateY(0)` when the view switched to `hazard-hit`
   at settle, so the hit lid flipped a second time.

The round machine, the port contracts and the spatial maths had to stay untouched (AGENTS.md, ADR-0006).

## Decision

**Stage arrangement is computed, not media-queried.** `board/stage-layout.ts` exposes a pure `arrangeStage(grid, stageBox)`
that returns `side | stack | board` plus slot and board rectangles. It sweeps board sizes from the largest down to a
cell-loss budget (≤ 14% and never under 44px unless the board alone can't do better). It scores each candidate as
`ln(characterScale) − 2.5 × cellLoss`, so a big gain for the marshal is worth a few percent of cell, while a marshal
who is already large never eats into the board. `BoardView` places `.posse` and `.board` absolutely from the result.
It derives the `GridLayout` in the same render, which fixed a one-frame overflow found in e2e. The CSS breakpoints
that sized the slot are removed.

**Waist-up framing is tighter** (hat to mid-chest), so the face reads in a strip above the board.

**The Scene observes one more cosmetic input: what the player is targeting.** `Scene.lookAt(cell | null)` is fed by
hover (mouse/pen, hit-tested through `engine/spatial`) and keyboard focus. The head and eyes follow the claim, and the
barrel tracks it when the gun is already up. This is board-internal; `BoardPort` is unchanged.

**The animator gains a performance layer** (still pure and unit-tested):

- keyed face params (`brow`, `mouth`, `tension`)
- off-hand IK reaches (`brim`, `brush`) that blend in an arc about the shoulder, so the elbow never spins
- a purse toss and a hammer that cocks
- procedural gaze, tension-driven breathing (shallow when tense, nearly held on the aim line)
- a trigger-hand twitch over the holster
- `hold(ms)` hit-stop on the BOOM
- idle fidgets that fire only when nobody is targeting a claim
- interrupted twirls that resolve to a whole turn

New clips: `alarm` (the fuse catches), `recover` (after `flinch`: dust off, hat back on, a hard look), `celebrateBig`
(every third claim in a row), `fidgetHat`, `fidgetLook`.

**FX gains fixed emitters and new particle kinds**, all from a fixed 560-slot pool with a rolling spawn cursor:

- emitters: fuse sparks, barrel wisp, crater smoke
- BOOM additions: scorch, heat veil, splinters, clods, fire tongues
- smaller effects: brass ring on a found bounty, boot and coat dust, coins that bounce once on the board floor

**Board motion is driven by pure data.** `board/board-motion.ts` computes the sweep ripple distance from the cell that
decided the round, and blast jolt vectors for neighbouring lids. They feed CSS custom properties for animations that
touch only `transform` and `opacity`. The blast punch now plays on a `.cell__jolt` wrapper at the BOOM beat, and the
crater art appears from that beat on.

## Alternatives Considered

1. **More CSS breakpoints**: can't express "give the marshal the slack the square board leaves". The rules multiply per
   preset and grid size, and the 0.36fr column was the problem itself.
2. **Container queries + aspect-ratio grid**: aspect-ratio items inside an auto grid track resolve before the row height
   is known, which is unreliable across engines and still can't trade cell size against character size.
3. **Feeding hover into the engine** (a new port or event): it would widen ADR-0003/0005 contracts for a purely cosmetic need.
   Rejected for the same reason as in ADR-0006.

## Trade-offs

| We gain | We give up |
|---|---|
| The marshal fills the slack: ~320 → ~390px tall at 1440×900, full body instead of a 150px waist-up strip on an 820×1180 tablet, a readable close-up in stacked strips | Up to 14% smaller cells on some stages (Inspector open at 1440×900: 101 → 87px; tablet: 118 → 102px) |
| One pure, property-tested function replaces scattered breakpoints | Slot placement is now JS-driven (one ResizeObserver on the stage) |
| Gaze, fidgets, alarm and recovery make him react to the player, not just to results | More cosmetic state to maintain (all unit-tested, observer-only) |
| Clear found / unclaimed / cold / scorched faces; the blast lands on the beat | Pool grew 520 → 560 slots (bounded, preallocated) |

## Consequences

- The "≤ 680px tall portrait hides the marshal" rule from ADR-0006 now falls out of the arrangement: the board takes the
  stage when no slot fits the cell budget (e.g. 320×640 → `board`). Shots still come from off-screen in that case.
- e2e asserts, at 6 viewports, that the slot stays inside the stage and never overlaps a cell. It also covers gaze on hover,
  the sight brackets, the blast punch and jolt, and flinch → recover.
- Any future spatial mode can reuse `arrangeStage` with its own board aspect.
