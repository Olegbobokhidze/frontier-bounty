import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardView, type BoardReady } from '../board/BoardView';
import { GAME_MODES } from '../config/modes';
import { bindSceneSound } from './scene-sound';
import { RoundState } from '../engine/bounty/machine';
import { ErrorDialog } from './components/ErrorDialog';
import { IconMute, IconScroll, IconSound, IconWrench } from './components/icons';
import { InspectorDrawer } from './components/InspectorDrawer';
import { LadderStrip } from './components/LadderStrip';
import { Ledger } from './components/Ledger';
import { ResultBanner } from './components/ResultBanner';
import { RulesDrawer } from './components/RulesDrawer';
import { useGame, useMock, usePrefersReducedMotion, useRound, useSoundState } from './hooks/game';

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(t.tagName));

export function App() {
  const game = useGame();
  const { controller, sound, provider } = game;
  const ctx = useRound();
  useMock(); // re-render peek overlay when the mock changes
  const audio = useSoundState();
  const reducedMotion = usePrefersReducedMotion();
  const [rulesOpen, setRulesOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(game.initialInspectorOpen);
  const [peek, setPeek] = useState(false);

  // Board/scene attach: port to the engine, scene events to audio (cues land on the animation beats).
  const offSceneAudio = useRef<(() => void) | null>(null);
  const onReady = useCallback(
    (ready: BoardReady | null) => {
      controller.attachBoard(ready?.port ?? null);
      game.scene.set(ready?.scene ?? null);
      offSceneAudio.current?.();
      offSceneAudio.current = ready ? bindSceneSound(ready.scene, sound) : null;
    },
    [controller, game.scene, sound],
  );
  const onPick = useCallback((cell: number) => controller.pick(cell), [controller]);

  // Audio unlock on first gesture; pause in background tabs.
  useEffect(() => {
    const unlock = () => sound.unlock();
    const vis = () => sound.setPageVisible(document.visibilityState === 'visible');
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [sound]);

  const modalOpen = rulesOpen || ctx.state === RoundState.ERROR_RECOVERABLE;

  // Global shortcuts. The board handles arrows/Enter/Space itself when focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '`') {
        e.preventDefault();
        setInspectorOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        setRulesOpen(false);
        return;
      }
      if (modalOpen || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'enter') {
        e.preventDefault();
        if (!e.repeat) controller.primary();
      } else if (k === 'c') controller.cashOut();
      else if (k === 't') controller.setTurbo(!controller.getSnapshot().turbo);
      else if (/^[1-9]$/.test(k)) {
        const bet = controller.rules.betPresets[Number(k) - 1];
        if (bet !== undefined) controller.setParams({ bet });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, modalOpen]);

  const peekCells = peek && ctx.round && !ctx.round.disclosure ? provider.peek(ctx.round.roundId) : null;
  const live = GAME_MODES.filter((m) => m.status === 'live');

  return (
    <div className="app" data-state={ctx.state} data-inspector={inspectorOpen ? 'open' : 'closed'}>
      <header className="topbar">
        <div className="brand">
          <span className="brand__badge" aria-hidden="true">
            ★
          </span>
          <div className="brand__text">
            <h1 className="brand__title">Frontier Dynamite &amp; Bounty</h1>
            <span className="brand__sub">by Oleg Bobokhidze</span>
          </div>
        </div>
        <nav className="modes" aria-label="Game modes">
          {GAME_MODES.map((m) => (
            <button key={m.id} type="button" className={`mode ${m.status === 'live' ? 'is-on' : ''}`} disabled={m.status !== 'live'} title={m.tagline} aria-current={live[0]?.id === m.id ? 'page' : undefined}>
              {m.title}
              {m.status !== 'live' && <span className="mode__soon">soon</span>}
            </button>
          ))}
        </nav>
        <div className="topbar__actions">
          <button
            type="button"
            className="icon-btn"
            aria-pressed={audio.muted}
            aria-label={audio.muted ? 'Unmute sound' : 'Mute sound'}
            title={audio.status === 'unavailable' ? 'Audio unavailable in this browser' : undefined}
            onClick={() => {
              sound.unlock();
              sound.toggleMuted();
            }}
          >
            {audio.muted || audio.status === 'unavailable' ? <IconMute /> : <IconSound />}
          </button>
          <button type="button" className="icon-btn" aria-label="Rules and payouts" onClick={() => setRulesOpen(true)}>
            <IconScroll />
          </button>
          <button type="button" className={`icon-btn ${inspectorOpen ? 'is-on' : ''}`} aria-pressed={inspectorOpen} aria-label="Provider inspector (backtick)" onClick={() => setInspectorOpen((v) => !v)}>
            <IconWrench />
          </button>
        </div>
      </header>

      <main className="table-top">
        <section className="claim" aria-label="Claim">
          <LadderStrip />
          <div className="claim__board">
            <BoardView ctx={ctx} onPick={onPick} onReady={onReady} peek={peekCells} reducedMotion={reducedMotion} />
            <ResultBanner />
          </div>
        </section>
        <Ledger />
      </main>

      <footer className="credit">Frontier Dynamite &amp; Bounty · created by Oleg Bobokhidze</footer>

      <RulesDrawer open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <InspectorDrawer open={inspectorOpen} onClose={() => setInspectorOpen(false)} peek={peek} onPeek={setPeek} />
      <ErrorDialog />
    </div>
  );
}
