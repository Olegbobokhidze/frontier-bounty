import { useEffect, useId, useRef } from 'react';
import type { ProviderErrorCode } from '../../core/result';
import { RoundState } from '../../engine/bounty/machine';
import { useGame, useRound } from '../hooks/game';

const COPY: Readonly<Record<ProviderErrorCode, string>> = {
  NETWORK: 'The telegraph line to the assay office went dead.',
  TIMEOUT: 'The assay office is taking too long to answer.',
  INSUFFICIENT_FUNDS: 'Your purse is too light for this stake.',
  VALIDATION: 'The assay report failed the integrity check.',
  ROUND_NOT_FOUND: 'The assay office has no record of this claim.',
  SERVER: 'Trouble at the assay office.',
};

export function ErrorDialog() {
  const { controller } = useGame();
  const ctx = useRound();
  const id = useId();
  const primary = useRef<HTMLButtonElement>(null);
  const err = ctx.error;
  const open = ctx.state === RoundState.ERROR_RECOVERABLE && err !== null;
  const midRound = err?.phase === 'reveal' || err?.phase === 'cashout';

  useEffect(() => {
    if (open) primary.current?.focus();
  }, [open]);

  if (!open || !err) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby={id} aria-describedby={`${id}-d`}>
        <div className="modal__code">
          {err.code} · during {err.phase}
        </div>
        <h2 id={id} className="modal__title">
          {midRound ? 'Hold your horses' : 'Claim not staked'}
        </h2>
        <p id={`${id}-d`} className="modal__body">
          {COPY[err.code]}{' '}
          {midRound
            ? 'Your claim is safe on the server. Retrying sends the same request again, so nothing is applied twice.'
            : err.phase === 'open'
              ? 'Your stake has been returned to your purse.'
              : ''}
        </p>
        <p className="modal__detail">{err.message}</p>
        <div className="modal__actions">
          {midRound ? (
            <button ref={primary} type="button" className="btn btn--primary" onClick={() => controller.retry()}>
              Retry
            </button>
          ) : (
            <button ref={primary} type="button" className="btn btn--primary" onClick={() => controller.dismissError()}>
              Back to camp
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
