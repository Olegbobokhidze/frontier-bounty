import { formatMultiplier } from '../../core/money';
import { multiplierLadder, survivalProbability } from '../../engine/bounty/math';
import { useGame, useRound } from '../hooks/game';
import { Drawer } from './Drawer';

export function RulesDrawer({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const { controller, formatMoney } = useGame();
  const ctx = useRound();
  const p = ctx.round?.params ?? ctx.params;
  const cells = p.rows * p.cols;
  const model = controller.rules.multiplier;
  const ladder = multiplierLadder(model, cells, p.hazards);
  const edge = model.kind === 'fair' ? model.houseEdge : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Rules of the Claim"
      className="rules"
      footer={
        <button type="button" className="btn btn--primary" onClick={onClose} data-autofocus>
          Back to the saloon
        </button>
      }
    >
      <ol className="rules__list">
        <li>Choose a stake, a territory size and how many sticks of dynamite are buried.</li>
        <li>
          <strong>Stake your claim</strong>, then dig one cell at a time. Every bounty raises your multiplier.
        </li>
        <li>
          <strong>Cash out</strong> whenever you like after the first bounty. Hit dynamite and the stake is lost.
        </li>
        <li>Find every bounty and the claim cashes out automatically.</li>
      </ol>

      <h3 className="section-title">Keyboard</h3>
      <dl className="keys">
        {[
          ['Arrows', 'Move between cells'],
          ['Enter / Space', 'Dig the focused cell (on the board) · stake or cash out (elsewhere)'],
          ['C', 'Cash out'],
          ['T', 'Turbo'],
          ['1 – 9', 'Choose a stake between rounds'],
          ['`', 'Provider inspector'],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <h3 className="section-title">
        Payout ladder · {p.rows}×{p.cols}, {p.hazards} dynamite, stake {formatMoney(ctx.params.bet)}
      </h3>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Claims</th>
            <th scope="col">Multiplier</th>
            <th scope="col">Payout</th>
            <th scope="col">Chance</th>
          </tr>
        </thead>
        <tbody>
          {ladder.map((m, i) => (
            <tr key={i}>
              <td>{i + 1}</td>
              <td>{formatMultiplier(m)}</td>
              <td>{formatMoney(Math.floor(ctx.params.bet * m))}</td>
              <td>{(survivalProbability(cells, p.hazards, i + 1) * 100).toFixed(survivalProbability(cells, p.hazards, i + 1) < 0.01 ? 4 : 1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="section-title">Fair play</h3>
      <p className="muted">
        {edge !== null && <>Multipliers are fair odds less a {(edge * 100).toFixed(0)}% house edge (return to player {(100 - edge * 100).toFixed(0)}%). </>}
        Before you dig, the server commits to its secret seed by showing its SHA-256 hash. When the claim ends, it reveals the seed. The
        dynamite layout is derived from <code>SHA-256(serverSeed:clientSeed:nonce)</code>, so anyone can recompute it. Open the inspector to
        verify any finished round.
      </p>
    </Drawer>
  );
}
