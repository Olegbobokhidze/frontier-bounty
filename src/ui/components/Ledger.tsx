/** The control panel ("ledger"): purse, stake, territory, dynamite count, and the primary action. */
import { TERRITORY_PRESETS, presetFor } from '../../config/presets';
import { formatMultiplier } from '../../core/money';
import { currentSafeChance, RoundState } from '../../engine/bounty/machine';
import { multiplierAt, payout } from '../../engine/bounty/math';
import { useGame, usePrefersReducedMotion, useRound } from '../hooks/game';
import { useCountUp } from '../hooks/motion';
import { IconMinus, IconPlus, IconSpur } from './icons';

export function Ledger() {
  const { controller, formatMoney } = useGame();
  const ctx = useRound();
  const reducedMotion = usePrefersReducedMotion();
  const rules = controller.rules;
  const s = ctx.state;
  const between = s === RoundState.IDLE || s === RoundState.ROUND_OVER_WIN || s === RoundState.ROUND_OVER_BUST;
  const p = ctx.round?.params ?? ctx.params;
  const cells = p.rows * p.cols;
  const picks = ctx.round?.picks.length ?? 0;
  const current = ctx.round?.multiplier ?? 1;
  const next = picks < cells - p.hazards ? multiplierAt(rules.multiplier, cells, p.hazards, picks + 1) : null;
  const betIndex = rules.betPresets.indexOf(ctx.params.bet);
  const preset = presetFor(ctx.params.rows, ctx.params.cols, ctx.params.hazards);
  const sizes = [...new Set(TERRITORY_PRESETS.map((t) => `${t.rows}x${t.cols}`))];
  // A cash-out counts up into the purse; stakes and refunds snap.
  const purse = useCountUp(ctx.balance, s === RoundState.ROUND_OVER_WIN && !reducedMotion);

  const primary = (() => {
    switch (s) {
      case RoundState.ROUND_ACTIVE:
        return picks > 0
          ? { label: `Cash out ${formatMoney(payout(p.bet, current, rules.maxPayoutX))}`, kind: 'cash', disabled: false }
          : { label: 'Pick a claim…', kind: 'cash', disabled: true };
      case RoundState.CONFIGURING:
        return { label: 'Staking claim…', kind: 'busy', disabled: true };
      case RoundState.REVEALING_STEP:
        return { label: 'Digging…', kind: 'busy', disabled: true };
      case RoundState.CASHING_OUT:
        return { label: 'Counting gold…', kind: 'busy', disabled: true };
      case RoundState.ERROR_RECOVERABLE:
        return { label: 'Trouble on the trail', kind: 'busy', disabled: true };
      default:
        return { label: s === RoundState.IDLE ? 'Stake claim' : 'Ride again', kind: 'stake', disabled: false };
    }
  })();

  return (
    <section className="ledger" aria-label="Wager controls">
      <div className="ledger__row ledger__purse">
        <span className="label">Purse</span>
        <span className={`figure ${purse.counting ? 'is-counting' : ''}`} aria-hidden="true">
          {formatMoney(purse.shown)}
        </span>
        <output className="sr-only" aria-live="polite">
          {formatMoney(ctx.balance)}
        </output>
      </div>

      <div className="ledger__group">
        <span className="label" id="stake-label">
          Stake
        </span>
        <div className="stepper" role="group" aria-labelledby="stake-label">
          <button type="button" className="stepper__btn" aria-label="Lower stake" disabled={!between || betIndex <= 0} onClick={() => controller.setParams({ bet: rules.betPresets[Math.max(0, betIndex - 1)] ?? ctx.params.bet })}>
            <IconMinus />
          </button>
          <output className="stepper__value">{formatMoney(ctx.params.bet)}</output>
          <button
            type="button"
            className="stepper__btn"
            aria-label="Raise stake"
            disabled={!between || betIndex >= rules.betPresets.length - 1}
            onClick={() => controller.setParams({ bet: rules.betPresets[Math.min(rules.betPresets.length - 1, betIndex + 1)] ?? ctx.params.bet })}
          >
            <IconPlus />
          </button>
        </div>
      </div>

      <div className="ledger__split">
        <label className="ledger__group">
          <span className="label">Territory</span>
          <select
            className="select"
            disabled={!between}
            value={`${ctx.params.rows}x${ctx.params.cols}`}
            onChange={(e) => {
              const [r, c] = e.target.value.split('x').map(Number);
              if (r && c) controller.setParams({ rows: r, cols: c });
            }}
          >
            {sizes.map((sz) => (
              <option key={sz} value={sz}>
                {sz.replace('x', ' × ')}
              </option>
            ))}
          </select>
        </label>
        <div className="ledger__group">
          <span className="label" id="dyn-label">
            Dynamite
          </span>
          <div className="stepper stepper--compact" role="group" aria-labelledby="dyn-label">
            <button type="button" className="stepper__btn" aria-label="Fewer dynamite" disabled={!between || ctx.params.hazards <= 1} onClick={() => controller.setParams({ hazards: ctx.params.hazards - 1 })}>
              <IconMinus />
            </button>
            <output className="stepper__value">{ctx.params.hazards}</output>
            <button
              type="button"
              className="stepper__btn"
              aria-label="More dynamite"
              disabled={!between || ctx.params.hazards >= ctx.params.rows * ctx.params.cols - 1}
              onClick={() => controller.setParams({ hazards: ctx.params.hazards + 1 })}
            >
              <IconPlus />
            </button>
          </div>
        </div>
      </div>

      <div className="presets" role="group" aria-label="Territory presets">
        {TERRITORY_PRESETS.slice(0, 4).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`chip ${preset?.id === t.id ? 'is-on' : ''}`}
            disabled={!between}
            title={t.blurb}
            onClick={() => controller.setParams({ rows: t.rows, cols: t.cols, hazards: t.hazards })}
          >
            {t.name.split(' ')[0]}
          </button>
        ))}
      </div>

      <dl className="odds">
        <div>
          <dt>Current</dt>
          <dd key={current} className={picks > 0 ? 'is-bumped' : undefined}>
            {formatMultiplier(current)}
          </dd>
        </div>
        <div>
          <dt>Next claim</dt>
          <dd>{next ? formatMultiplier(next) : '—'}</dd>
        </div>
        <div>
          <dt>Safe odds</dt>
          <dd>{Math.round(currentSafeChance(ctx) * 100)}%</dd>
        </div>
      </dl>

      <div className="ledger__actions">
        <button type="button" className={`toggle ${ctx.turbo ? 'is-on' : ''}`} aria-pressed={ctx.turbo} onClick={() => controller.setTurbo(!ctx.turbo)} title="Turbo (T)">
          <IconSpur />
          <span>Turbo</span>
        </button>
        <button type="button" className={`primary primary--${primary.kind}`} disabled={primary.disabled} onClick={() => controller.primary()} data-testid="primary">
          {primary.label}
        </button>
      </div>
    </section>
  );
}
