import { TIMINGS } from '../config/theme';
import type { BoardPort } from '../engine/bounty/ports';
import type { Scene } from './scene/scene';

export function revealTimings(turbo: boolean, reducedMotion: boolean): { safe: number; hazard: number } {
  return reducedMotion ? TIMINGS.reduced : turbo ? TIMINGS.turbo : TIMINGS.normal;
}

/**
 * Implements the engine's BoardPort (contract unchanged, ADR-0004/0006). A reveal resolves only after
 * the bullet has landed AND the flip has finished. The safe/boom reaction fires at the flip's midpoint,
 * where the face becomes visible, so the FX, the character's reaction and the audio line up.
 */
export function createBoardPort(scene: Scene, reducedMotion: boolean): BoardPort {
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return {
    async playReveal(cell, outcome, { turbo }) {
      await scene.whenImpact(cell);
      const t = revealTimings(turbo, reducedMotion);
      const ms = outcome === 'safe' ? t.safe : t.hazard;
      if (outcome === 'hazard') scene.lightFuse(cell);
      setTimeout(() => (outcome === 'safe' ? scene.revealSafe(cell) : scene.boom(cell)), ms * 0.45);
      await wait(ms);
    },
    playSweep(outcome) {
      if (outcome === 'win') scene.collect();
    },
  };
}
