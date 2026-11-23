/**
 * Board: DOM buttons positioned from the shared GridLayout + one Canvas FX layer (ADR-0004).
 * Pointer input is hit-tested through engine/spatial from a single delegated listener;
 * keyboard input uses a roving tabindex with arrow keys.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { RoundState, type BountyContext } from '../engine/bounty/machine';
import type { BoardPort } from '../engine/bounty/ports';
import { cellLabel, cellRect, fitLayout, hitTest, move, toCell, type Direction, type GridLayout } from '../engine/spatial/grid';
import { BlastArt, BountyArt, DynamiteArt } from './art';
import { createBoardPort, revealTimings } from './board-port';
import { CellView, boardSize, cellViews, isFaceUp, pickMultipliers } from './cell-state';
import { FxLayer } from './fx';

export type BoardReady = { readonly port: BoardPort; readonly fx: FxLayer };

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

export function BoardView({ ctx, onPick, onReady, peek, reducedMotion }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<GridLayout | null>(null);
  const downCell = useRef<number | null>(null);
  const [layout, setLayout] = useState<GridLayout | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const { rows, cols } = boardSize(ctx);
  const size = useMemo(() => ({ rows, cols }), [rows, cols]);
  const views = useMemo(() => cellViews(ctx), [ctx]);
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

  // FX layer + BoardPort lifetime.
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const fx = new FxLayer(canvas, reducedMotion);
    const r = host.getBoundingClientRect();
    fx.resize(r.width, r.height);
    fx.start();
    const ro = new ResizeObserver(() => {
      const b = host.getBoundingClientRect();
      fx.resize(b.width, b.height);
    });
    ro.observe(host);
    const port = createBoardPort({
      fx,
      layout: () => layoutRef.current,
      reducedMotion,
      shake: (s) =>
        surfaceRef.current?.animate(
          [
            { transform: 'translate(0,0)' },
            { transform: `translate(${-s}px, ${s * 0.4}px)` },
            { transform: `translate(${s * 0.8}px, ${-s * 0.5}px)` },
            { transform: `translate(${-s * 0.4}px, ${s * 0.3}px)` },
            { transform: 'translate(0,0)' },
          ],
          { duration: 380, easing: 'cubic-bezier(.36,.07,.19,.97)' },
        ),
    });
    onReady({ port, fx });
    return () => {
      ro.disconnect();
      fx.dispose();
      onReady(null);
    };
  }, [onReady, reducedMotion]);

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
    <div className="board" ref={hostRef} style={style} data-state={ctx.state}>
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
      <canvas ref={canvasRef} className="board__fx" aria-hidden="true" />
    </div>
  );
}
