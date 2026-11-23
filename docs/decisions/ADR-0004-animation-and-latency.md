# ADR-0004: DOM grid + Canvas FX hybrid; settle gating for latency

- **Date:** 2026-11-23T18:03:08Z
- **Status:** Accepted
- **Deciders:** Oleg Bobokhidze (owner), agent (Claude)
- **Related:** ADR-0003

## Context

The board needs accessible, keyboard-navigable cells, crisp text at any DPI, tactile flip animations, and
particle effects (dust motes, gold glints, dynamite debris and smoke) at 60fps on phones. Network latency must never
let the UI run ahead of the server, or show a result before the request resolves.

## Decision

- **DOM for cells**: real `<button>`s with a roving tabindex (arrow keys), `aria-label` per coordinate, and CSS 3D flips
  that animate **transform/opacity only**. **Canvas 2D for FX**: one absolutely positioned canvas, one rAF loop driven by
  delta time, pooled particles, sized with devicePixelRatio, which also feeds the FPS/frame-time meter.
- **Pointer input is hit-tested** through `engine/spatial` `GridLayout.hitTest` from a single delegated listener.
  pointerdown and pointerup must land on the same cell (prevents scroll-drag reveals on touch). Gaps return null.
- **Settle gating**: a pick immediately shows a "pending" wobble on the cell (instant feedback). The controller waits for
  BOTH the provider response AND `BoardPort.playReveal()` before dispatching `STEP_SETTLED`. Input stays locked by state, not by timers.
- Turbo mode and `prefers-reduced-motion` shorten or skip animations but keep the same state sequence.

## Alternatives Considered

1. **All-canvas (Pixi)**: fast, but you have to rebuild focus management, screen-reader labels and text crispness yourself.
2. **All-DOM incl. particles**: hundreds of animated nodes cause style recalc and compositor pressure on phones.

## Trade-offs

| We gain | We give up |
|---|---|
| Accessible, keyboard-first board with native semantics | Two rendering systems to keep aligned (shared GridLayout) |
| Particles never touch React or layout | Canvas FX must be repositioned on resize (ResizeObserver) |
