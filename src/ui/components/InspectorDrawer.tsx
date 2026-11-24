import { useEffect, useState, useSyncExternalStore } from 'react';
import { verifyRound, type Verification } from '../../adapters/fairness';
import { FORCED_STEP_LABELS, ForcedStep } from '../../adapters/mock-provider';
import type { SceneDebug } from '../../board/scene/scene';
import { GAME_MODES } from '../../config/modes';
import { TERRITORY_PRESETS } from '../../config/presets';
import type { TransitionRecord } from '../../core/machine';
import { formatMultiplier } from '../../core/money';
import { ROUND_STATE_ORDER, RoundState } from '../../engine/bounty/machine';
import { cellLabel } from '../../engine/spatial/grid';
import { useCue, useGame, useMock, useRound } from '../hooks/game';
import { Drawer } from './Drawer';

type Props = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly peek: boolean;
  readonly onPeek: (v: boolean) => void;
};

export function InspectorDrawer({ open, onClose, peek, onPeek }: Props) {
  const { controller } = useGame();
  const [history, setHistory] = useState<readonly TransitionRecord[]>([]);
  const [lastLatency, setLastLatency] = useState<string>('—');

  useEffect(() => {
    if (!open) return;
    setHistory([...controller.getHistory()]);
    return controller.onTransition(() => setHistory([...controller.getHistory()]));
  }, [open, controller]);

  useCue((c) => {
    if (c.type === 'response') setLastLatency(`${c.kind} #${c.requestId} · ${c.ok ? 'ok' : 'error'} · ${c.latencyMs.toFixed(0)} ms`);
  });

  const exportLog = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), transitions: controller.getHistory() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frontier-transitions-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      modal={false}
      className="inspector"
      title={
        <>
          Provider Inspector <kbd>`</kbd>
        </>
      }
      footer={
        <>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              controller.clearHistory();
              setHistory([]);
            }}
          >
            Clear log
          </button>
          <button type="button" className="btn btn--ghost" onClick={exportLog}>
            Export log
          </button>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      {open && (
        <>
          <StateSection />
          <RoundSection peek={peek} onPeek={onPeek} />
          <MockSection lastLatency={lastLatency} />
          <PresetSection />
          <SceneSection />
          <LogSection history={history} />
        </>
      )}
    </Drawer>
  );
}

function StateSection() {
  const ctx = useRound();
  const { formatMoney } = useGame();
  return (
    <section className="insp">
      <h3 className="insp__title">Round state machine</h3>
      <ol className="chain">
        {ROUND_STATE_ORDER.map((s) => (
          <li key={s} className={`pill ${s === ctx.state ? 'is-active' : ''} ${s === RoundState.ERROR_RECOVERABLE ? 'is-error' : ''}`}>
            {s}
          </li>
        ))}
      </ol>
      <dl className="kv">
        <div>
          <dt>purse</dt>
          <dd>{formatMoney(ctx.balance)}</dd>
        </div>
        <div>
          <dt>requestSeq</dt>
          <dd>{ctx.requestSeq}</dd>
        </div>
        <div>
          <dt>in flight</dt>
          <dd>{ctx.inFlight ? `${ctx.inFlight.kind} #${ctx.inFlight.request.requestId}` : '—'}</dd>
        </div>
        <div>
          <dt>rounds</dt>
          <dd>{ctx.roundsPlayed}</dd>
        </div>
        <div>
          <dt>turbo</dt>
          <dd>{ctx.turbo ? 'on' : 'off'}</dd>
        </div>
        <div>
          <dt>modes</dt>
          <dd>{GAME_MODES.map((m) => `${m.id}:${m.status}`).join(' · ')}</dd>
        </div>
      </dl>
    </section>
  );
}

function RoundSection({ peek, onPeek }: { readonly peek: boolean; readonly onPeek: (v: boolean) => void }) {
  const { controller } = useGame();
  const ctx = useRound();
  const r = ctx.round;
  const [verification, setVerification] = useState<{ roundId: string; v: Verification } | null>(null);
  const [seed, setSeed] = useState(ctx.params.clientSeed);
  const between = ctx.state === RoundState.IDLE || ctx.state === RoundState.ROUND_OVER_WIN || ctx.state === RoundState.ROUND_OVER_BUST;

  const verify = async () => {
    if (!r?.disclosure) return;
    const v = await verifyRound({
      serverSeed: r.disclosure.serverSeed,
      serverSeedHash: r.serverSeedHash,
      clientSeed: r.params.clientSeed,
      nonce: r.nonce,
      cells: r.params.rows * r.params.cols,
      hazards: r.disclosure.hazards,
    });
    setVerification({ roundId: r.roundId, v });
  };

  return (
    <section className="insp">
      <h3 className="insp__title">Round & fairness</h3>
      <form
        className="field field--inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (seed.trim()) controller.setParams({ clientSeed: seed.trim() });
        }}
      >
        <label className="field__label" htmlFor="client-seed">
          Client seed
        </label>
        <input id="client-seed" value={seed} disabled={!between} onChange={(e) => setSeed(e.target.value)} maxLength={64} />
        <button type="submit" className="btn btn--ghost btn--sm" disabled={!between}>
          Set
        </button>
      </form>
      {r ? (
        <>
          <dl className="kv">
            <div>
              <dt>round / nonce</dt>
              <dd>
                {r.roundId} / {r.nonce}
              </dd>
            </div>
            <div>
              <dt>commitment</dt>
              <dd className="hash" title={r.serverSeedHash}>
                {r.serverSeedHash.slice(0, 24)}…
              </dd>
            </div>
            <div>
              <dt>server seed</dt>
              <dd className="hash">{r.disclosure ? r.disclosure.serverSeed : 'hidden until the claim ends'}</dd>
            </div>
            <div>
              <dt>picks</dt>
              <dd>{r.picks.map((p) => `${cellLabel(r.params, p.cell)} ${formatMultiplier(p.multiplier)}`).join(' → ') || '—'}</dd>
            </div>
            {r.disclosure && (
              <div>
                <dt>dynamite</dt>
                <dd>{r.disclosure.hazards.map((h) => cellLabel(r.params, h)).join(', ')}</dd>
              </div>
            )}
          </dl>
          <div className="row-actions">
            <label className="checkbox" title="QA only: a real server never exposes the layout">
              <input type="checkbox" checked={peek} onChange={(e) => onPeek(e.target.checked)} />
              <span>QA peek at dynamite</span>
            </label>
            <button type="button" className="btn btn--ghost btn--sm" disabled={!r.disclosure} onClick={() => void verify()}>
              Verify round
            </button>
          </div>
          {verification && verification.roundId === r.roundId && (
            <p className={`verdict ${verification.v.commitmentOk && verification.v.layoutOk ? 'is-ok' : 'is-bad'}`} role="status">
              Commitment {verification.v.commitmentOk ? '✓ matches' : '✗ mismatch'} · Layout {verification.v.layoutOk ? '✓ re-derived exactly' : '✗ differs (tampered by QA force)'}
            </p>
          )}
        </>
      ) : (
        <p className="muted small">No claim staked yet.</p>
      )}
    </section>
  );
}

function MockSection({ lastLatency }: { readonly lastLatency: string }) {
  const { provider, controller, formatMoney } = useGame();
  const { settings, wallet } = useMock();
  const [min, max] = settings.latencyMs;
  return (
    <section className="insp">
      <h3 className="insp__title">Mock assay office (RoundProvider)</h3>
      <label className="field">
        <span className="field__label">Force next request</span>
        <select value={settings.forced} onChange={(e) => provider.updateSettings({ forced: e.target.value as ForcedStep })}>
          {Object.values(ForcedStep).map((f) => (
            <option key={f} value={f}>
              {FORCED_STEP_LABELS[f]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">
          Latency {min}–{max} ms
        </span>
        <div className="range-pair">
          <input type="range" min={0} max={3000} step={20} value={min} aria-label="Minimum latency" onChange={(e) => provider.updateSettings({ latencyMs: [Number(e.target.value), Math.max(Number(e.target.value), max)] })} />
          <input type="range" min={0} max={3000} step={20} value={max} aria-label="Maximum latency" onChange={(e) => provider.updateSettings({ latencyMs: [Math.min(min, Number(e.target.value)), Number(e.target.value)] })} />
        </div>
      </label>
      <label className="field">
        <span className="field__label">Random network error rate {(settings.errorRate * 100).toFixed(0)}%</span>
        <input type="range" min={0} max={50} value={Math.round(settings.errorRate * 100)} onChange={(e) => provider.updateSettings({ errorRate: Number(e.target.value) / 100 })} />
      </label>
      <dl className="kv">
        <div>
          <dt>last response</dt>
          <dd>{lastLatency}</dd>
        </div>
        <div>
          <dt>server wallet</dt>
          <dd>{formatMoney(wallet)}</dd>
        </div>
      </dl>
      <div className="row-actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            provider.setWallet(wallet + 100_000);
            controller.syncBalance();
          }}
        >
          +$1,000 to purse
        </button>
      </div>
    </section>
  );
}

function PresetSection() {
  const { controller } = useGame();
  const ctx = useRound();
  const between = ctx.state === RoundState.IDLE || ctx.state === RoundState.ROUND_OVER_WIN || ctx.state === RoundState.ROUND_OVER_BUST;
  return (
    <section className="insp">
      <h3 className="insp__title">Config presets</h3>
      <div className="preset-grid">
        {TERRITORY_PRESETS.map((t) => (
          <button key={t.id} type="button" className="chip" disabled={!between} title={t.blurb} onClick={() => controller.setParams({ rows: t.rows, cols: t.cols, hazards: t.hazards })}>
            {t.name} · {t.rows}×{t.cols} · {t.hazards}
          </button>
        ))}
      </div>
    </section>
  );
}

function SceneSection() {
  const { scene } = useGame();
  const current = useSyncExternalStore(scene.subscribe, scene.get);
  const [debug, setDebug] = useState<SceneDebug | null>(null);
  useEffect(() => {
    if (!current) return;
    const id = window.setInterval(() => setDebug(current.getDebug()), 250);
    return () => window.clearInterval(id);
  }, [current]);
  const stats = debug?.stats;
  const samples = stats?.samples ?? [];
  const W = 280;
  const H = 44;
  const pts = samples.map((v, i) => `${(i / Math.max(1, samples.length - 1)) * W},${H - (Math.min(v, 50) / 50) * H}`).join(' ');
  const previews = ['shoot', 'celebrate', 'celebrateBig', 'alarm', 'boom', 'recover', 'collect', 'fidgetHat', 'fidgetLook', 'idle'] as const;
  return (
    <section className="insp">
      <h3 className="insp__title">Character & FX · Marshal Silas Kane</h3>
      <dl className="kv">
        <div>
          <dt>clip</dt>
          <dd data-testid="scene-clip">
            {debug ? `${debug.clip} · ${debug.clipMs} ms` : '—'}
          </dd>
        </div>
        <div>
          <dt>framing · gaze</dt>
          <dd data-testid="scene-framing">{debug ? `${debug.framing} · ${debug.gaze.toFixed(2)}` : '—'}</dd>
        </div>
        <div>
          <dt>live particles</dt>
          <dd data-testid="scene-particles">
            {debug?.particles ?? 0} / {debug?.pool ?? 0}
          </dd>
        </div>
        <div>
          <dt>scene events</dt>
          <dd data-testid="scene-events">{debug?.events.slice(0, 4).join(' · ') || '—'}</dd>
        </div>
      </dl>
      <div className="preset-row" role="group" aria-label="Preview animations (cosmetic only)">
        {previews.map((p) => (
          <button key={p} type="button" className="btn btn--ghost btn--sm" disabled={!current} onClick={() => current?.preview(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="perf">
        <span className={`perf__fps ${stats && stats.fps < 50 ? 'is-warn' : ''}`}>
          {stats ? stats.fps.toFixed(0) : '—'}
          <small>fps</small>
        </span>
        <span className="perf__stats">
          avg {stats?.avgMs.toFixed(1) ?? '—'} ms · p95 {stats?.p95Ms.toFixed(1) ?? '—'} ms · max {stats?.maxMs.toFixed(1) ?? '—'} ms
        </span>
      </div>
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Frame time, last 240 frames">
        <line x1={0} x2={W} y1={H - (16.67 / 50) * H} y2={H - (16.67 / 50) * H} className="spark__budget" />
        <polyline points={pts} className="spark__line" />
      </svg>
    </section>
  );
}

function LogSection({ history }: { readonly history: readonly TransitionRecord[] }) {
  const rows = history.slice(-120).reverse();
  const t0 = history[0]?.at ?? 0;
  return (
    <section className="insp">
      <h3 className="insp__title">
        Transition log <span className="muted small">newest first · {history.length}</span>
      </h3>
      <div className="log" role="log">
        <table>
          <thead>
            <tr>
              <th scope="col">+ms</th>
              <th scope="col">event</th>
              <th scope="col">from → to</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.seq} className={r.accepted ? '' : 'is-rejected'} title={r.iso}>
                <td className="num">{(r.at - t0).toFixed(0)}</td>
                <td>
                  {r.event}
                  {r.detail && <span className="log__detail">{r.detail}</span>}
                </td>
                <td>{r.from === r.to ? <span className="muted">{r.to}</span> : `${r.from} → ${r.to}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted small">No transitions yet.</p>}
      </div>
    </section>
  );
}
