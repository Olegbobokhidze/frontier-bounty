import { formatMultiplier } from '../../core/money';
import { RoundState } from '../../engine/bounty/machine';
import { cellLabel } from '../../engine/spatial/grid';
import { useGame, useRound } from '../hooks/game';

export function ResultBanner() {
  const { formatMoney } = useGame();
  const ctx = useRound();
  const r = ctx.round;
  if (!r) return null;
  if (ctx.state === RoundState.ROUND_OVER_WIN) {
    return (
      <div className="banner banner--win" role="status" key={`w-${r.roundId}`}>
        <span className="banner__kicker">Bounty collected</span>
        <span className="banner__title">{formatMoney(r.payout)}</span>
        <span className="banner__sub">
          {r.picks.length} claims · {formatMultiplier(r.multiplier)}
        </span>
      </div>
    );
  }
  if (ctx.state === RoundState.ROUND_OVER_BUST) {
    const hit = r.disclosure?.hitCell;
    return (
      <div className="banner banner--bust" role="status" key={`b-${r.roundId}`}>
        <span className="banner__kicker">Kaboom</span>
        <span className="banner__title">Dynamite{hit !== null && hit !== undefined ? ` at ${cellLabel(r.params, hit)}` : ''}</span>
        <span className="banner__sub">The claim is lost. Saddle up and ride again.</span>
      </div>
    );
  }
  return null;
}
