/**
 * Stage = character slot + board + one shared canvas (ADR-0004, ADR-0006, ADR-0007).
 * Board cells are DOM buttons positioned from the shared GridLayout; pointer input is hit-tested through
 * engine/spatial; keyboard input uses a roving tabindex. The stage arrangement (marshal beside, above, or
 * hidden) comes from a pure layout function. The Scene (gunslinger + FX) observes picks, reveals and which
 * claim the player is targeting; a revealed cell only flips once the shot has landed.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { RoundState, type BountyContext } from '../engine/bounty/machine';
import type { BoardPort } from '../engine/bounty/ports';
import { cellLabel, cellRect, fitLayout, hitTest, move, toCell, type Direction, type GridLayout } from '../engine/spatial/grid';
import { BlastArt, BountyArt, DynamiteArt } from './art';
import { blastJolts, rippleDistances } from './board-motion';
import { createBoardPort, revealTimings } from './board-port';
import { CellView, boardSize, cellViews, isFaceUp, pickMultipliers } from './cell-state';
import { frameCharacter } from './scene/framing';
import { Scene, type SceneEvent } from './scene/scene';
import { arrangeStage, type StageArrangement } from './stage-layout';

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
const STREAK_QUIPS = ['Hot streak!', 'Lady Luck rides with me.', 'Count it twice.'] as const;

const rel = (r: DOMRect, base: DOMRect) => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
const pick = <T,>(xs: readonly T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];

/** Decaying camera shake with a little roll (Web Animations, transform only, ≤ amplitude px, ≤ 0.6°). */
function shakeKeyframes(amplitude: number): Keyframe[] {
  const frames: Keyframe[] = [{ transform: 'translate(0, 0) rotate(0deg)' }];
  const steps = 11;
  for (let i = 1; i <= steps; i++) {
    const a = amplitude * (1 - i / (steps + 1)) ** 2;
    const x = (i % 2 ? -1 : 1) * a * (0.6 + Math.random() * 0.4);
    const y = (Math.random() - 0.5) * a * 0.9;
    const r = (i % 2 ? 1 : -1) * Math.min(0.6, a * 0.06) * Math.random();
    frames.push({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg)` });
  }
  frames.push({ transform: 'translate(0, 0) rotate(0deg)' });
  return frames;
}

/** Stable per-cell timber variation, so the lids don't look stamped from one plank. */
const grainVars = (i: number) => ({ '--gx': `${(i * 37) % 113}px`, '--tone': `${(((i * 2654435761) >>> 0) % 7) * 0.018}` });

const px = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });

export function BoardView({ ctx, onPick, onReady, peek, reducedMotion }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const posseRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [, setImpactTick] = useState(0);
  const [quip, setQuip] = useState<{ id: number; text: string } | null>(null);
  const [jolt, setJolt] = useState<{ id: number; cell: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<GridLayout | null>(null);
  const downCell = useRef<number | null>(null);
  const hoverCell = useRef<number | null>(null);
  const [arrangement, setArrangement] = useState<StageArrangement | null>(null);
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

  // End-of-round sweep ripples out from the cell that decided the round (the blast, or the last claim).
  const round = ctx.round;
  const sweepOrigin = round?.disclosure ? (round.disclosure.hitCell ?? round.picks[round.picks.length - 1]?.cell ?? null) : null;
  const ripple = useMemo(() => rippleDistances(size, sweepOrigin), [size, sweepOrigin]);
  const jolts = useMemo(() => (jolt ? blastJolts(size, jolt.cell) : null), [size, jolt]);

  // Stage arrangement from the stage box: marshal beside / above the board, or board only.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const r = stage.getBoundingClientRect();
      const next = arrangeStage(size, { width: r.width, height: r.height });
      setArrangement((prev) =>
        prev && prev.mode === next.mode && Math.abs(prev.board.w - next.board.w) < 0.5 && Math.abs(prev.board.h - next.board.h) < 0.5 && Math.abs(prev.board.x - next.board.x) < 0.5 && Math.abs(prev.board.y - next.board.y) < 0.5
          ? prev
          : next,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [size]);

  // Grid layout derived in the same render as the arrangement, shared by DOM cells, canvas FX and hit-testing.
  // (Measuring the host separately left one frame where cells were fitted to the old host box and overflowed.)
  const layout = useMemo(() => (arrangement ? fitLayout(size, { width: arrangement.board.w, height: arrangement.board.h }) : null), [arrangement, size]);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Scene (character + FX) and BoardPort lifetime; geometry from the stage, slot and board boxes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!canvas || !stage || !host) return;
    const scene = new Scene(canvas, {
      reducedMotion,
      layout: () => layoutRef.current,
      shake: (a) => stage.animate(shakeKeyframes(a), { duration: 520, easing: 'linear' }),
    });
    sceneRef.current = scene;
    const measure = () => {
      const base = stage.getBoundingClientRect();
      const posse = posseRef.current;
      const slot = posse && posse.dataset.hidden !== 'true' ? rel(posse.getBoundingClientRect(), base) : null;
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
      if (e.type === 'boom') setJolt({ id: Date.now(), cell: e.cell });
      const line = e.type === 'safe' && e.streak >= 3 && e.streak % 3 === 0 ? pick(STREAK_QUIPS) : pick(QUIPS[e.type] ?? []);
      if (line) setQuip({ id: Date.now(), text: line });
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
    if (ctx.state === RoundState.CONFIGURING) {
      sceneRef.current?.roundStart();
      setJolt(null);
    }
  }, [ctx.state]);

  // Keep keyboard focus inside the grid when it shrinks.
  const total = size.rows * size.cols;
  const focus = Math.min(focusIndex, total - 1);

  const focusCell = useCallback((i: number) => {
    setFocusIndex(i);
    surfaceRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)?.focus();
  }, []);

  /** Tell the marshal which claim is being targeted (cosmetic only). */
  const target = (cell: number | null) => {
    if (hoverCell.current === cell) return;
    hoverCell.current = cell;
    sceneRef.current?.lookAt(cell);
  };

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
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') target(pointToCell(e));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = KEY_DIR[e.key];
    if (dir) {
      e.preventDefault();
      const next = move(size, focus, dir);
      focusCell(next);
      target(next);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onPick(focus);
    }
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!surfaceRef.current?.contains(e.relatedTarget as Node | null)) target(null);
  };

  const style = {
    '--reveal-safe-ms': `${timings.safe}ms`,
    '--reveal-hazard-ms': `${timings.hazard}ms`,
  } as CSSProperties;

  const slotHidden = !arrangement?.slot;
  const frame = frameCharacter(arrangement?.slot ?? null).mode;

  return (
    <div className="stage" ref={stageRef} style={style} data-state={ctx.state} data-arrangement={arrangement?.mode ?? 'board'}>
      <div
        className="posse"
        ref={posseRef}
        aria-hidden="true"
        data-hidden={slotHidden ? 'true' : 'false'}
        data-frame={frame}
        style={arrangement?.slot ? px(arrangement.slot) : { display: 'none' }}
      >
        {quip && (
          <span key={quip.id} className="posse__quip" onAnimationEnd={() => setQuip(null)}>
            {quip.text}
          </span>
        )}
      </div>
      <div className="board" ref={hostRef} style={arrangement ? px(arrangement.board) : { inset: 0 }}>
        <div
          ref={surfaceRef}
          className={`board__surface ${canPick ? 'is-live' : ''}`}
          role="grid"
          aria-label={`Claim board, ${size.rows} rows by ${size.cols} columns`}
          aria-rowcount={size.rows}
          aria-colcount={size.cols}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
          onPointerLeave={() => target(null)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        >
          {layout &&
            views.map((v, i) => {
              const r = cellRect(layout, i);
              const label = cellLabel(size, i);
              const mult = mults.get(i);
              const j = jolts?.get(i);
              const c = toCell(size, i);
              // The lid shows the crater from the BOOM beat on, not only once the round settles.
              const blasted = v === CellView.HAZARD_HIT || (jolt?.cell === i && v === CellView.REVEAL_HAZARD);
              return (
                <button
                  key={`${size.rows}x${size.cols}-${i}`}
                  type="button"
                  role="gridcell"
                  data-cell={i}
                  data-view={v}
                  className={`cell cell--${v} ${isFaceUp(v) ? 'is-up' : ''} ${peekSet.has(i) && !isFaceUp(v) ? 'is-peek' : ''} ${j ? 'is-jolt' : ''} ${jolt?.cell === i ? 'is-blasted' : ''}`}
                  style={
                    {
                      transform: `translate(${r.x}px, ${r.y}px)`,
                      width: r.w,
                      height: r.h,
                      fontSize: Math.max(10, Math.round(r.w / 7)),
                      '--i': c.row + c.col,
                      '--d': ripple[i] ?? 0,
                      ...(j ? { '--jx': j.x.toFixed(2), '--jy': j.y.toFixed(2), '--js': j.strength } : {}),
                      ...grainVars(i),
                    } as CSSProperties
                  }
                  tabIndex={i === focus ? 0 : -1}
                  aria-label={`${label}, ${VIEW_LABEL[v]}${mult ? `, ×${mult.toFixed(2)}` : ''}`}
                  aria-disabled={!canPick || isFaceUp(v) || v === CellView.PENDING}
                  onFocus={() => setFocusIndex(i)}
                  // Pointer picks go through hit-testing; this handles screen-reader / programmatic activation only.
                  onClick={(e) => e.detail === 0 && onPick(i)}
                >
                  <span className="cell__jolt">
                    <span className="cell__inner">
                      <span className="cell__face cell__face--back">
                        <span className="cell__coord" aria-hidden="true">
                          {label}
                        </span>
                      </span>
                      <span className="cell__face cell__face--front">
                        {blasted && <BlastArt />}
                        {!blasted && (v === CellView.REVEAL_HAZARD || v === CellView.HAZARD) && <DynamiteArt lit={v === CellView.REVEAL_HAZARD} />}
                        {(v === CellView.REVEAL_SAFE || v === CellView.SAFE || v === CellView.MISSED) && <BountyArt />}
                        {mult !== undefined && <span className="cell__mult">×{mult.toFixed(2)}</span>}
                      </span>
                    </span>
                  </span>
                  <span className="cell__sight" aria-hidden="true" />
                </button>
              );
            })}
        </div>
      </div>
      <canvas ref={canvasRef} className="stage__fx" aria-hidden="true" />
    </div>
  );
}
