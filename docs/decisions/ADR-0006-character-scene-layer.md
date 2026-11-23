# ADR-0006: Cosmetic character & FX scene layer with impact gating

- **Date:** 2026-11-23T18:45:21Z
- **Status:** Accepted (extends ADR-0004; no change to ADR-0003 or ADR-0005 contracts)
- **Deciders:** Oleg Bobokhidze (owner: requested richer Western characters and BOOM FX), agent (Claude)
- **Related:** ADR-0001, ADR-0004

## Context

The board needed a Western character with expressive reactions (idle stance, aim and shoot, bounty nod and holster,
dynamite flinch, cash-out) and a layered dynamite blast. None of this may block or desync the round state machine,
change the engine's port contracts, or hurt frame rate or responsive layout.

## Decision

- New folder `src/board/scene/`, which is in the board layer and imports no React and no audio:
  - `pose.ts`, `clips.ts`, `easing.ts`, `animator.ts`: a **cosmetic** character state machine. Clips are keyframed with per-key
    easing (anticipation → strike → follow-through → settle). Interrupts blend from the current *keyed* pose. A procedural
    layer adds breathing, weight shift, micro-looks, blinks, aim tracking, and secondary springs (hat lag, coat sway).
    Markers (`muzzle`, `holster`, …) fire exactly once per clip. All of this is pure and unit-tested.
  - `rig.ts` (forward kinematics plus two-bone leg IK), `framing.ts` (full-body / waist-up / hidden camera that reserves room
    for the knock-back and the extended revolver), and `gunslinger.ts` (procedural Canvas 2D drawing, no assets).
  - `scene.ts`: hosts the character on the **same canvas and rAF loop** as the FX, maps cells to stage coordinates and
    emits beats (`shot, impact, fuse, safe, boom, holster, collect`).
- The Scene only **observes**. BoardView fires a shot when a new reveal `requestId` appears; retries reuse the id, so there is
  no second shot. A new round triggers the ready stance. Reactions come from the existing `BoardPort.playReveal/playSweep`.
- **Impact gating** (extends ADR-0004): a revealed cell renders as *digging* until the bullet lands, and `playReveal` awaits
  `scene.whenImpact(cell)` before the flip. A **700 ms fallback** guarantees progress when rAF is paused (background tab)
  or the character is hidden. A per-round epoch stops late timers from leaking into the next round.
  The engine's settle gating is unchanged: STEP_SETTLED still waits for `playReveal`.
- **Audio follows the beats**: ui/scene-sound.ts maps scene events to cues (shot, impact thunk, fuse, clink, blast, holster,
  register). Engine-level cues (stake, error) stay in audio/bind.ts. Mute and the no-Web-Audio fallback are unchanged.
- **BOOM** = flash → fireball → two shockwave rings → spark streaks → embers → debris → billowing smoke → drifting ash,
  plus a decaying camera shake (≤ 10 px, Web Animations, transform only). Everything comes from a fixed 520-particle pool;
  when the pool is full, new spawns are dropped. Nothing is allocated per frame.

## Alternatives Considered

1. **Sprite-sheet character**: richer art but needs assets, and has no runtime aim at arbitrary cells. Rejected for a code-only portfolio.
2. **Separate character canvas**: two rAF loops and two coordinate spaces, and tracers would have to cross canvases. Rejected.
3. **Driving reactions from the engine** (new port methods): it would widen the engine contract for cosmetic needs. Rejected.

## Trade-offs

| We gain | We give up |
|---|---|
| Expressive, aim-accurate character with zero assets | Procedural art is stylised, not illustrated |
| Shot → impact → flip ordering is guaranteed | A reveal now takes ~190–260 ms longer after a pick (muzzle + travel) |
| Contracts and engine tests untouched | One more cosmetic state machine to maintain (unit-tested) |

## Consequences

- Very short portrait screens (≤ 680 px tall) hide the character slot. Shots are then fired from off-screen below the board.
- Reduced motion: no idle layer or springs, clips play at 3× speed, no tracer or shake, and the FX is reduced.
