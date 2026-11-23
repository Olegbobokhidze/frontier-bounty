import { TIMINGS } from '../config/theme';
import type { BoardPort } from '../engine/bounty/ports';
import { cellCenter, type GridLayout } from '../engine/spatial/grid';
import type { FxLayer } from './fx';

export type BoardPortDeps = {
  readonly fx: FxLayer;
  readonly layout: () => GridLayout | null;
  /** Web Animations shake of the board surface (compositor-only). */
  readonly shake: (strength: number) => void;
  readonly reducedMotion: boolean;
};

export function revealTimings(turbo: boolean, reducedMotion: boolean): { safe: number; hazard: number } {
  return reducedMotion ? TIMINGS.reduced : turbo ? TIMINGS.turbo : TIMINGS.normal;
}

/**
 * Implements the engine's BoardPort: resolves when the CSS flip has finished, and fires
 * canvas FX at the flip's midpoint. React renders the cell faces from engine state.
 */
export function createBoardPort(d: BoardPortDeps): BoardPort {
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  return {
    async playReveal(cell, outcome, { turbo }) {
      const t = revealTimings(turbo, d.reducedMotion);
      const ms = outcome === 'safe' ? t.safe : t.hazard;
      setTimeout(() => {
        const l = d.layout();
        if (!l) return;
        const c = cellCenter(l, cell);
        const scale = l.cell / 96;
        if (outcome === 'safe') d.fx.gold(c.x, c.y, scale);
        else {
          d.fx.blast(c.x, c.y, scale);
          if (!d.reducedMotion) d.shake(Math.min(14, 6 + l.cell / 16));
        }
      }, ms * 0.45);
      await wait(ms);
    },
    playSweep(outcome) {
      const l = d.layout();
      if (!l || outcome !== 'win') return;
      const width = l.cols * l.cell + (l.cols - 1) * l.gap;
      d.fx.coins(l.origin.x, l.origin.y, width);
    },
  };
}
