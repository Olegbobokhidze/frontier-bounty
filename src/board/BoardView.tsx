/**
 * Stage = character slot + board + one shared canvas (ADR-0004, ADR-0006).
 * Board cells are DOM buttons positioned from the shared GridLayout; pointer input is hit-tested through
 * engine/spatial; keyboard input uses a roving tabindex. The Scene (gunslinger + FX) observes picks and
 * reveals; a revealed cell only flips once the shot has landed.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { RoundState, type BountyContext } from '../engine/bounty/machine';
import type { BoardPort } from '../engine/bounty/ports';
import { cellLabel, cellRect, fitLayout, hitTest, move, toCell, type Direction, type GridLayout } from '../engine/spatial/grid';
import { BlastArt, BountyArt, DynamiteArt } from './art';
import { createBoardPort, revealTimings } from './board-port';
import { CellView, boardSize, cellViews, isFaceUp, pickMultipliers } from './cell-state';
import { Scene, type SceneEvent } from './scene/scene';

export type BoardReady = { readonly port: BoardPort; readonly scene: Scene };

type Props = {
  readonly ctx: BountyContext;
  readonly onPick: (cell: number) => void;
  readonly onReady: (ready: BoardReady | null) => void;
  /** QA-only overlay of hazard positions (Inspector "peek"). */
  readonly peek: readonly number[] | null;
  readonly reducedMotion: boolean;
};

const KEY_DIR: Readonly<Record<string, Direction>> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

const VIEW_LABEL: Readonly<Record<CellView, string>> = {
  hidden: 'unclaimed',
  pending: 'digging…',
  'reveal-safe': 'bounty',
  safe: 'bounty found',
  'reveal-hazard': 'dynamite!',
  'hazard-hit': 'dynamite: blew up',
  hazard: 'dynamite',
  missed: 'bounty (not claimed)',
};

/** The marshal's one-liners: flavour only, keyed by scene beat. */
const QUIPS: Partial<Record<SceneEvent['type'], readonly string[]>> = {
  safe: ["Claim's good.", 'Easy money.', 'Another nugget.', 'Steady hand.'],
  boom: ['Dang dynamite!', 'Hit the dirt!', 'Well, shoot.'],
  collect: ['Pay the marshal.', "That'll buy the saloon.", 'Pleasure doin’ business.'],
};

const rel = (r: DOMRect, base: DOMRect) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });

/** Decaying random camera shake (Web Animations, transform only). */
function shakeKeyframes(amplitude: number): Keyframe[] {
  const frames: Keyframe[] = [{ transform: 'translate(0, 0)' }];
  for (let i = 1; i <= 8; i++) {
    const a = amplitude * (1 - i / 9) ** 2;
    frames.push({ transform: `translate(${((i % 2 ? -1 : 1) * a * (0.6 + Math.random() * 0.4)).toFixed(2)}px, ${((Math.random() - 0.5) * a).toFixed(2)}px)` });
  }
  frames.push({ transform: 'translate(0, 0)' });
  return frames;
}

export function BoardView({ ctx, onPick, onReady, peek, reducedMotion }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const posseRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [, setImpactTick] = useState(0);
  const [quip, setQuip] = useState<{ id: number; text: string } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<GridLayout | null>(null);
  const downCell = useRef<number | null>(null);
  const [layout, setLayout] = useState<GridLayout | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const { rows, cols } = boardSize(ctx);
  const size = useMemo(() => ({ rows, cols }), [rows, cols]);
  const derived = useMemo(() => cellViews(ctx), [ctx]);
  // Impact gating: a revealed cell stays "digging" until the shot lands (ADR-0006).
  const views = derived.map((v, i) =>
    (v === CellView.REVEAL_SAFE || v === CellView.REVEAL_HAZARD) && sceneRef.current && !sceneRef.current.hasImpacted(i) ? CellView.PENDING : v,
  );
  const mults = useMemo(() => pickMultipliers(ctx), [ctx]);
  const peekSet = useMemo(() => new Set(peek ?? []), [peek]);
  const canPick = ctx.state === RoundState.ROUND_ACTIVE;
  const timings = revealTimings(ctx.turbo, reducedMotion);

  // Layout from container size (ResizeObserver), shared by DOM cells, canvas FX and hit-testing.
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const r = host.getBoundingClientRect();
      const next = fitLayout(size, { width: r.width, height: r.height });
      layoutRef.current = next;
      setLayout(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [size]);

  // Scene (character + FX) and BoardPort lifetime; geometry from the stage, slot and board boxes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!canvas || !stage || !host) return;
    const scene = new Scene(canvas, {
      reducedMotion,
      layout: () => layoutRef.current,
      shake: (a) => stage.animate(shakeKeyframes(a), { duration: 460, easing: 'linear' }),
    });
    sceneRef.current = scene;
    const measure = () => {
      const base = stage.getBoundingClientRect();
      const slot = posseRef.current ? rel(posseRef.current.getBoundingClientRect(), base) : null;
      const board = rel(host.getBoundingClientRect(), base);
      scene.setGeometry({ width: base.width, height: base.height, slot: slot && slot.w > 0 && slot.h > 0 ? slot : null, boardOrigin: { x: board.x, y: board.y } });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    ro.observe(host);
    if (posseRef.current) ro.observe(posseRef.current);
    const off = scene.onEvent((e) => {
      if (e.type === 'impact') setImpactTick((n) => n + 1);
      const line = QUIPS[e.type];
      if (line) setQuip({ id: Date.now(), text: line[Math.floor(Math.random() * line.length)] ?? '' });
    });
    onReady({ port: createBoardPort(scene, reducedMotion), scene });
    return () => {
      off();
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
      onReady(null);
    };
  }, [onReady, reducedMotion]);

  // Observe the round: a new reveal request → draw & fire; a new round → ready stance.
  const revealRequestId = ctx.inFlight?.kind === 'reveal' ? ctx.inFlight.request.requestId : null;
  const revealCell = ctx.inFlight?.kind === 'reveal' ? ctx.inFlight.request.cell : null;
  const lastShot = useRef<number | null>(null);
  useEffect(() => {
    if (revealRequestId === null || revealCell === null || lastShot.current === revealRequestId) return;
    lastShot.current = revealRequestId; // retries reuse the requestId → no second shot
    sceneRef.current?.shoot(revealCell);
  }, [revealRequestId, revealCell]);
  useEffect(() => {
    if (ctx.state === RoundState.CONFIGURING) sceneRef.current?.roundStart();
  }, [ctx.state]);

  // Keep keyboard focus inside the grid when it shrinks.
  const total = size.rows * size.cols;
  const focus = Math.min(focusIndex, total - 1);

  const focusCell = useCallback((i: number) => {
    setFocusIndex(i);
    surfaceRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)?.focus();
  }, []);

  const pointToCell = (e: PointerEvent<HTMLDivElement>): number | null => {
    const host = hostRef.current;
    const l = layoutRef.current;
    if (!host || !l) return null;
    const r = host.getBoundingClientRect();
    return hitTest(l, { x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    downCell.current = pointToCell(e);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const cell = pointToCell(e);
    // Same-cell press+release only: a drag or scroll on touch never reveals.
    if (cell !== null && cell === downCell.current) {
      setFocusIndex(cell);
      onPick(cell);
    }
    downCell.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = KEY_DIR[e.key];
    if (dir) {
      e.preventDefault();
      focusCell(move(size, focus, dir));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onPick(focus);
    }
  };

  const style = {
    '--reveal-safe-ms': `${timings.safe}ms`,
    '--reveal-hazard-ms': `${timings.hazard}ms`,
  } as CSSProperties;

  return (
    <div className="stage" ref={stageRef} style={style} data-state={ctx.state}>
      <div className="posse" ref={posseRef} aria-hidden="true">
        {quip && (
          <span key={quip.id} className="posse__quip" onAnimationEnd={() => setQuip(null)}>
            {quip.text}
          </span>
        )}
      </div>
      <div className="board" ref={hostRef}>
      <div
        ref={surfaceRef}
        className={`board__surface ${canPick ? 'is-live' : ''}`}
        role="grid"
        aria-label={`Claim board, ${size.rows} rows by ${size.cols} columns`}
        aria-rowcount={size.rows}
        aria-colcount={size.cols}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {layout &&
          views.map((v, i) => {
            const r = cellRect(layout, i);
            const label = cellLabel(size, i);
            const mult = mults.get(i);
            return (
              <button
                key={`${size.rows}x${size.cols}-${i}`}
                type="button"
                role="gridcell"
                data-cell={i}
                data-view={v}
                className={`cell cell--${v} ${isFaceUp(v) ? 'is-up' : ''} ${peekSet.has(i) && !isFaceUp(v) ? 'is-peek' : ''}`}
                style={{ transform: `translate(${r.x}px, ${r.y}px)`, width: r.w, height: r.h, fontSize: Math.max(10, Math.round(r.w / 7)), '--i': toCell(size, i).row + toCell(size, i).col } as CSSProperties}
                tabIndex={i === focus ? 0 : -1}
                aria-label={`${label}, ${VIEW_LABEL[v]}${mult ? `, ×${mult.toFixed(2)}` : ''}`}
                aria-disabled={!canPick || isFaceUp(v) || v === CellView.PENDING}
                onFocus={() => setFocusIndex(i)}
                // Pointer picks go through hit-testing; this handles screen-reader / programmatic activation only.
                onClick={(e) => e.detail === 0 && onPick(i)}
              >
                <span className="cell__inner">
                  <span className="cell__face cell__face--back">
                    <span className="cell__coord" aria-hidden="true">
                      {label}
                    </span>
                  </span>
                  <span className="cell__face cell__face--front">
                    {v === CellView.HAZARD_HIT && <BlastArt />}
                    {(v === CellView.REVEAL_HAZARD || v === CellView.HAZARD_HIT || v === CellView.HAZARD) && <DynamiteArt lit={v === CellView.REVEAL_HAZARD} />}
                    {(v === CellView.REVEAL_SAFE || v === CellView.SAFE || v === CellView.MISSED) && <BountyArt />}
                    {mult !== undefined && <span className="cell__mult">×{mult.toFixed(2)}</span>}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <canvas ref={canvasRef} className="stage__fx" aria-hidden="true" />
    </div>
  );
}
