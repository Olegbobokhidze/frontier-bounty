import { useEffect, useRef } from 'react';
import { formatMultiplier } from '../../core/money';
import { multiplierLadder } from '../../engine/bounty/math';
import { useGame, useRound } from '../hooks/game';

/** Multiplier progression for the current claim; the reached step is highlighted and kept in view. */
export function LadderStrip() {
  const { controller } = useGame();
  const ctx = useRound();
  const p = ctx.round?.params ?? ctx.params;
  const ladder = multiplierLadder(controller.rules.multiplier, p.rows * p.cols, p.hazards);
  const reached = ctx.round?.picks.length ?? 0;
  const ref = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-step="${Math.max(1, reached)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [reached, p.rows, p.cols, p.hazards]);

  return (
    <ol className="ladder" ref={ref} aria-label="Multiplier ladder">
      {ladder.map((m, i) => {
        const step = i + 1;
        const cls = step < reached ? 'is-past' : step === reached ? 'is-current' : step === reached + 1 ? 'is-next' : '';
        return (
          <li key={step} data-step={step} className={`ladder__step ${cls}`} aria-current={step === reached ? 'step' : undefined}>
            <span className="ladder__n">{step}</span>
            <span className="ladder__x">{formatMultiplier(m)}</span>
          </li>
        );
      })}
    </ol>
  );
}
