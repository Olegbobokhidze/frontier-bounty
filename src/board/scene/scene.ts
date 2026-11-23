/**
 * Scene: the cosmetic layer that hosts the gunslinger and the FX on one canvas (ADR-0006).
 * It OBSERVES game events (picks, reveals, round end) and never drives the round machine.
 * The only coupling is impact gating: a cell flips when the shot lands (or after a safety timeout),
 * so the visual order is always shot → impact → flip → reaction.
 */
import { cellCenter, type GridLayout } from '../../engine/spatial/grid';
import { FxLayer, type FrameStatsSnapshot } from '../fx';
import { CharacterAnimator } from './animator';
import { SHOOT_MUZZLE_MS, type ClipName } from './clips';
import { frameCharacter, toStage, type Framing, type Rect } from './framing';
import { drawGunslinger } from './gunslinger';
import { solveRig } from './rig';

export type SceneEvent =
  | { readonly type: 'shot' }
  | { readonly type: 'impact'; readonly cell: number }
  | { readonly type: 'safe'; readonly cell: number }
  | { readonly type: 'fuse'; readonly cell: number }
  | { readonly type: 'boom'; readonly cell: number }
  | { readonly type: 'holster' }
  | { readonly type: 'collect' };

export type SceneGeometry = {
  readonly width: number;
  readonly height: number;
  /** Character slot in stage coordinates, or null when hidden by the layout. */
  readonly slot: Rect | null;
  /** Board host origin in stage coordinates. */
  readonly boardOrigin: { readonly x: number; readonly y: number };
};

export type SceneDebug = {
  readonly clip: ClipName;
  readonly clipMs: number;
  readonly framing: Framing['mode'];
  readonly particles: number;
  readonly events: readonly string[];
  readonly stats: FrameStatsSnapshot;
};

export type SceneOptions = {
  readonly reducedMotion: boolean;
  readonly layout: () => GridLayout | null;
  /** Decaying camera shake of the stage element (compositor-only transform). */
  readonly shake: (amplitude: number) => void;
};

/** If a shot never lands (paused tab, hidden canvas), flip anyway after this long. */
export const IMPACT_FALLBACK_MS = 700;
const BULLET_PX_PER_S = 2600;

export class Scene {
  readonly fx: FxLayer;
  readonly animator: CharacterAnimator;
  private geo: SceneGeometry = { width: 0, height: 0, slot: null, boardOrigin: { x: 0, y: 0 } };
  private framing: Framing = { mode: 'hidden' };
  private pendingShot: { cell: number; x: number; y: number; epoch: number } | null = null;
  /** Bumped every round so late timers from a previous round can never mark cells in this one. */
  private epoch = 0;
  private readonly impacted = new Set<number>();
  private readonly waiters = new Map<number, { promise: Promise<void>; resolve: () => void }>();
  private readonly listeners = new Set<(e: SceneEvent) => void>();
  private readonly log: string[] = [];
  private readonly offMarker: () => void;
  private readonly offDrawable: () => void;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly o: SceneOptions,
  ) {
    this.fx = new FxLayer(canvas, o.reducedMotion);
    this.animator = new CharacterAnimator({ reducedMotion: o.reducedMotion });
    this.offMarker = this.animator.onMarker((m) => {
      if (m === 'muzzle') this.fire();
      if (m === 'holster') this.emit({ type: 'holster' });
    });
    this.offDrawable = this.fx.addDrawable({
      update: (dt) => this.animator.update(dt),
      draw: (g) => this.drawCharacter(g),
    });
    this.fx.start();
  }

  // ------------------------------------------------------------ wiring

  onEvent(l: (e: SceneEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  setGeometry(geo: SceneGeometry): void {
    const resized = geo.width !== this.geo.width || geo.height !== this.geo.height;
    this.geo = geo;
    this.framing = frameCharacter(geo.slot);
    if (resized) this.fx.resize(geo.width, geo.height);
  }

  hasImpacted(cell: number): boolean {
    return this.impacted.has(cell);
  }

  /** Resolves when the shot at `cell` has landed (or immediately if nothing is in flight). */
  whenImpact(cell: number): Promise<void> {
    if (this.impacted.has(cell)) return Promise.resolve();
    return this.waiters.get(cell)?.promise ?? Promise.resolve();
  }

  // ------------------------------------------------------------ game hooks

  roundStart(): void {
    this.epoch++;
    this.impacted.clear();
    for (const w of this.waiters.values()) w.resolve();
    this.waiters.clear();
    this.animator.play('ready');
    this.note('ready');
  }

  /** A claim was picked: draw, aim at the cell and fire. */
  shoot(cell: number): void {
    const target = this.cellPoint(cell);
    if (!target) return;
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((r) => (resolve = r));
    this.waiters.set(cell, { promise, resolve });
    const epoch = this.epoch;
    this.later(IMPACT_FALLBACK_MS, () => this.land(cell, target.x, target.y, false, epoch));
    this.pendingShot = { cell, ...target, epoch };
    this.note(`shoot ${cell}`);

    if (this.framing.mode === 'hidden' || this.o.reducedMotion) {
      // Off-screen shooter (compact layouts) or reduced motion: shot from the bottom edge, no character beat.
      this.later(this.o.reducedMotion ? 0 : 60, () => this.fire());
      return;
    }
    this.aimAt(target.x, target.y, false);
    this.animator.play('shoot');
  }

  revealSafe(cell: number): void {
    const c = this.cellPoint(cell);
    if (c) this.fx.gold(c.x, c.y, this.cellScale());
    this.animator.play('celebrate');
    this.emit({ type: 'safe', cell });
    this.note(`safe ${cell}`);
  }

  /** Dynamite revealed: the fuse sizzles during the flip, before the blast. */
  lightFuse(cell: number): void {
    this.emit({ type: 'fuse', cell });
  }

  boom(cell: number): void {
    const c = this.cellPoint(cell);
    const s = this.cellScale();
    if (c) this.fx.blast(c.x, c.y, s);
    if (!this.o.reducedMotion) this.o.shake(Math.min(10, 5 + s * 4));
    this.animator.play('flinch');
    this.emit({ type: 'boom', cell });
    this.note(`BOOM ${cell}`);
  }

  collect(): void {
    const l = this.o.layout();
    if (l) {
      const width = l.cols * l.cell + (l.cols - 1) * l.gap;
      this.fx.coins(this.geo.boardOrigin.x + l.origin.x, this.geo.boardOrigin.y + l.origin.y, width);
    }
    this.animator.play('collect');
    this.emit({ type: 'collect' });
    this.note('collect');
  }

  /** Inspector preview: plays a clip (and its FX) without touching the round. */
  preview(name: ClipName | 'boom'): void {
    const l = this.o.layout();
    const centre = l ? Math.floor((l.rows * l.cols) / 2) : 0;
    if (name === 'boom') {
      const c = this.cellPoint(centre);
      if (c) this.fx.blast(c.x, c.y, this.cellScale());
      if (!this.o.reducedMotion) this.o.shake(8);
      this.animator.play('flinch');
    } else if (name === 'shoot') {
      const c = this.cellPoint(centre);
      if (c) {
        this.pendingShot = { cell: -1, ...c, epoch: this.epoch };
        this.aimAt(c.x, c.y, false);
      }
      this.animator.play('shoot');
    } else this.animator.play(name);
    this.note(`preview ${name}`);
  }

  getDebug(): SceneDebug {
    return {
      clip: this.animator.current,
      clipMs: Math.round(this.animator.clipTime),
      framing: this.framing.mode,
      particles: this.fx.active,
      events: [...this.log],
      stats: this.fx.getStats(),
    };
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    for (const w of this.waiters.values()) w.resolve();
    this.waiters.clear();
    this.offMarker();
    this.offDrawable();
    this.fx.dispose();
    this.listeners.clear();
  }

  // ------------------------------------------------------------ internals

  private fire(): void {
    const shot = this.pendingShot;
    this.pendingShot = null;
    if (!shot) return;
    this.emit({ type: 'shot' });
    let from: { x: number; y: number };
    let angle: number;
    const f = this.framing;
    if (f.mode !== 'hidden' && !this.o.reducedMotion) {
      const rig = solveRig(this.animator.getPose());
      from = toStage(f, rig.gunTip);
      angle = rig.gunAngle;
      this.fx.muzzle(from.x, from.y, angle, Math.max(0.6, f.scale * 1.2));
    } else {
      from = { x: this.geo.width / 2, y: this.geo.height + 12 };
      angle = Math.atan2(shot.y - from.y, shot.x - from.x);
    }
    const travel = Math.min(0.12, Math.max(0.035, Math.hypot(shot.x - from.x, shot.y - from.y) / BULLET_PX_PER_S));
    this.fx.tracer(from.x, from.y, shot.x, shot.y, travel);
    this.later(this.o.reducedMotion ? 0 : travel * 1000, () => this.land(shot.cell, shot.x, shot.y, true, shot.epoch));
  }

  private land(cell: number, x: number, y: number, fx: boolean, epoch: number): void {
    if (epoch !== this.epoch) return;
    if (cell < 0 || this.impacted.has(cell)) {
      if (cell < 0 && fx) this.fx.impact(x, y, this.cellScale());
      return;
    }
    if (fx) this.fx.impact(x, y, this.cellScale());
    this.impacted.add(cell);
    this.waiters.get(cell)?.resolve();
    this.waiters.delete(cell);
    this.emit({ type: 'impact', cell });
  }

  private aimAt(x: number, y: number, snap: boolean): void {
    const f = this.framing;
    if (f.mode === 'hidden') return;
    const local = { x: (x - f.originX) / f.scale, y: (y - f.originY) / f.scale };
    const shoulder = solveRig({ ...this.animator.getPose(), armAim: 1, recoil: 0 }).shoulderF;
    const angle = Math.atan2(local.y - shoulder.y, local.x - shoulder.x);
    this.animator.setAim(Math.max(f.aimMin, Math.min(f.aimMax, angle)), snap);
  }

  private cellPoint(cell: number): { x: number; y: number } | null {
    const l = this.o.layout();
    if (!l || cell < 0 || cell >= l.rows * l.cols) return null;
    const c = cellCenter(l, cell);
    return { x: this.geo.boardOrigin.x + c.x, y: this.geo.boardOrigin.y + c.y };
  }

  private cellScale(): number {
    return (this.o.layout()?.cell ?? 96) / 96;
  }

  private drawCharacter(g: CanvasRenderingContext2D): void {
    const f = this.framing;
    if (f.mode === 'hidden') return;
    g.beginPath();
    g.rect(f.clip.x, f.clip.y, f.clip.w, f.clip.h);
    g.clip();
    g.translate(f.originX, f.originY);
    g.scale(f.scale, f.scale);
    const pose = this.animator.getPose();
    drawGunslinger(g, solveRig(pose), pose);
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private note(s: string): void {
    this.log.unshift(`${new Date().toISOString().slice(11, 23)} ${s}`);
    if (this.log.length > 8) this.log.pop();
  }

  private emit(e: SceneEvent): void {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        /* observers must not break the scene */
      }
    }
  }
}

/** Shot timing exposed for docs/tests: muzzle at this offset after the pick. */
export const SHOT_TIMING = { muzzleMs: SHOOT_MUZZLE_MS } as const;
