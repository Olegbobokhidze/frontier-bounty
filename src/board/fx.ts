/**
 * Canvas 2D effects layer (ADR-0004, ADR-0006, ADR-0007). One rAF loop with delta time, a fixed particle pool
 * and a fixed emitter bank (no allocation per frame), sprites pre-rendered once, and drawables (the character)
 * rendered under the particles. Effects: ambient dust, gold flecks and a brass ring, muzzle flash with a lingering
 * barrel wisp, tracer, shell casings, impact puffs, a sputtering fuse, boot and coat dust, coins that bounce, and a
 * layered dynamite BOOM (heat veil, flash, fireball, fire tongues, shockwaves, sparks, embers, splinters, clods,
 * scorch, billowing smoke, a smouldering crater and drifting ash).
 */
import { FRONTIER } from '../config/theme';

type Kind =
  | 'mote'
  | 'fleck'
  | 'chunk'
  | 'splinter'
  | 'clod'
  | 'smoke'
  | 'wisp'
  | 'dust'
  | 'coin'
  | 'glint'
  | 'flash'
  | 'veil'
  | 'fire'
  | 'ring'
  | 'brassRing'
  | 'ember'
  | 'ash'
  | 'spark'
  | 'muzzle'
  | 'tracer'
  | 'shell'
  | 'scorch';

type Particle = {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds before the particle becomes visible and starts simulating. */
  delay: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
  color: string;
  /** Tracer end point; for coins, x2 = bounces left and y2 = the floor line. */
  x2: number;
  y2: number;
};

type EmitterKind = 'fuse' | 'crater' | 'wisp';
/** Writes the emitter's current position into `out`; returns false when the source is not visible. */
export type Follow = (out: { x: number; y: number }) => boolean;
type Emitter = { kind: EmitterKind; active: boolean; x: number; y: number; delay: number; life: number; max: number; acc: number; rate: number; scale: number; follow: Follow | null };

export type FrameStatsSnapshot = { readonly fps: number; readonly avgMs: number; readonly p95Ms: number; readonly maxMs: number; readonly samples: readonly number[] };

export type Drawable = { update(dtMs: number): void; draw(g: CanvasRenderingContext2D): void };

class FrameStats {
  private readonly buf = new Float32Array(240);
  private i = 0;
  private n = 0;
  push(ms: number) {
    this.buf[this.i] = ms;
    this.i = (this.i + 1) % this.buf.length;
    this.n = Math.min(this.n + 1, this.buf.length);
  }
  snapshot(): FrameStatsSnapshot {
    if (this.n === 0) return { fps: 0, avgMs: 0, p95Ms: 0, maxMs: 0, samples: [] };
    const samples: number[] = [];
    const start = (this.i - this.n + this.buf.length) % this.buf.length;
    for (let k = 0; k < this.n; k++) samples.push(this.buf[(start + k) % this.buf.length] ?? 0);
    const sorted = [...samples].sort((a, b) => a - b);
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { fps: avg > 0 ? 1000 / avg : 0, avgMs: avg, p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, maxMs: sorted[sorted.length - 1] ?? 0, samples };
  }
}

export const FX_POOL = 560;
const MOTES = 30;
const EMITTERS = 6;

function sprite(size: number, stops: readonly [number, string][]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) {
    const r = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [at, col] of stops) r.addColorStop(at, col);
    g.fillStyle = r;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class FxLayer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly pool: Particle[] = [];
  private readonly emitters: Emitter[] = [];
  private readonly drawables: Drawable[] = [];
  private readonly at = { x: 0, y: 0 };
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private running = false;
  private cursor = 0;
  private readonly stats = new FrameStats();
  private readonly spr: Record<'smoke' | 'dust' | 'glint' | 'fire' | 'flash' | 'ember' | 'scorch', HTMLCanvasElement>;
  private activeCount = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly reducedMotion: boolean,
  ) {
    this.ctx = canvas.getContext('2d');
    for (let i = 0; i < FX_POOL; i++) {
      this.pool.push({ kind: 'mote', x: 0, y: 0, vx: 0, vy: 0, delay: 0, life: 0, max: 1, size: 1, grow: 0, rot: 0, vr: 0, gravity: 0, drag: 0, color: '#000', x2: 0, y2: 0 });
    }
    for (let i = 0; i < EMITTERS; i++) {
      this.emitters.push({ kind: 'fuse', active: false, x: 0, y: 0, delay: 0, life: 0, max: 0, acc: 0, rate: 0, scale: 1, follow: null });
    }
    this.spr = {
      smoke: sprite(96, [
        [0, 'rgba(112,102,92,0.72)'],
        [0.55, 'rgba(92,84,76,0.38)'],
        [1, 'rgba(80,72,66,0)'],
      ]),
      dust: sprite(64, [
        [0, 'rgba(216,195,160,0.6)'],
        [0.6, 'rgba(190,165,128,0.25)'],
        [1, 'rgba(170,145,110,0)'],
      ]),
      glint: sprite(32, [
        [0, 'rgba(255,240,200,0.9)'],
        [0.35, 'rgba(232,207,138,0.45)'],
        [1, 'rgba(232,207,138,0)'],
      ]),
      fire: sprite(96, [
        [0, 'rgba(255,244,214,1)'],
        [0.25, 'rgba(255,196,110,0.95)'],
        [0.55, 'rgba(214,98,40,0.7)'],
        [0.85, 'rgba(120,40,16,0.25)'],
        [1, 'rgba(60,20,8,0)'],
      ]),
      flash: sprite(128, [
        [0, 'rgba(255,246,224,0.95)'],
        [0.4, 'rgba(255,214,150,0.45)'],
        [1, 'rgba(255,190,120,0)'],
      ]),
      ember: sprite(16, [
        [0, 'rgba(255,214,140,1)'],
        [0.45, 'rgba(226,110,40,0.8)'],
        [1, 'rgba(180,60,20,0)'],
      ]),
      scorch: sprite(96, [
        [0, 'rgba(22,12,6,0.78)'],
        [0.45, 'rgba(36,20,10,0.5)'],
        [0.8, 'rgba(48,28,14,0.16)'],
        [1, 'rgba(48,28,14,0)'],
      ]),
    };
  }

  addDrawable(d: Drawable): () => void {
    this.drawables.push(d);
    return () => {
      const i = this.drawables.indexOf(d);
      if (i >= 0) this.drawables.splice(i, 1);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const elapsed = now - this.last;
      this.last = now;
      this.stats.push(elapsed);
      const dt = Math.min(elapsed, 100);
      for (const d of this.drawables) d.update(dt);
      this.emit(dt / 1000);
      this.step(dt / 1000);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.w = width;
    this.h = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    if (!this.reducedMotion) this.seedMotes();
  }

  getStats(): FrameStatsSnapshot {
    return this.stats.snapshot();
  }

  /** Live (non-ambient) particles: for the inspector's FX readout. */
  get active(): number {
    return this.activeCount;
  }

  // ------------------------------------------------------------ effects

  /** Gold flecks, a glint and a thin brass ring when a bounty is found. */
  gold(x: number, y: number, scale = 1): void {
    const n = this.reducedMotion ? 4 : Math.round(22 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160 * scale;
      this.spawn('fleck', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 80, rnd(0.6, 1.1), rnd(2, 5), { gravity: 520, drag: 1.6, color: Math.random() < 0.6 ? FRONTIER.gold : FRONTIER.brassLight });
    }
    this.spawn('glint', x, y, 0, 0, 0.35, 46 * scale);
    if (!this.reducedMotion) this.spawn('brassRing', x, y, 0, 0, 0.42, 18 * scale, { grow: 150 * scale });
  }

  /** Muzzle flash, gun smoke, sparks and an ejected brass casing. `angle` is the barrel direction. */
  muzzle(x: number, y: number, angle: number, scale = 1): void {
    this.spawn('muzzle', x, y, 0, 0, 0.075, 26 * scale, { rot: angle });
    this.spawn('flash', x, y, 0, 0, 0.09, 70 * scale);
    if (this.reducedMotion) return;
    for (let i = 0; i < 4; i++) {
      this.spawn('smoke', x + Math.cos(angle) * 6, y + Math.sin(angle) * 6, Math.cos(angle) * rnd(30, 70) + rnd(-8, 8), Math.sin(angle) * rnd(30, 70) - rnd(10, 25), rnd(0.6, 1), rnd(8, 14) * scale, {
        grow: 30 * scale,
        drag: 1.6,
        delay: i * 0.02,
      });
    }
    for (let i = 0; i < 6; i++) {
      const a = angle + rnd(-0.35, 0.35);
      const sp = rnd(260, 520);
      this.spawn('spark', x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.06, 0.14), rnd(5, 9) * scale, { drag: 4, color: FRONTIER.brassLight });
    }
    // casing ejects up and back from the cylinder
    this.spawn('shell', x - Math.cos(angle) * 20 * scale, y - Math.sin(angle) * 20 * scale, -Math.cos(angle) * 90 + rnd(-30, 30), -rnd(160, 230), rnd(0.6, 0.8), 3.2 * scale, {
      gravity: 900,
      vr: rnd(-18, 18),
      color: FRONTIER.brass,
    });
  }

  /** A thin curl of smoke that keeps rising from the barrel after a shot, following the gun. */
  barrelWisp(follow: Follow, seconds: number, scale = 1): void {
    if (this.reducedMotion) return;
    this.addEmitter('wisp', 0, 0, seconds, 16, scale, 0.05, follow);
  }

  /** Bullet tracer from the muzzle to the target; travel time in seconds. */
  tracer(x1: number, y1: number, x2: number, y2: number, travel: number): void {
    if (this.reducedMotion) return;
    this.spawn('tracer', x1, y1, 0, 0, travel + 0.06, 2, { x2, y2 });
  }

  /** Bullet striking a wooden lid: dust puff, splinters, a hot spark. */
  impact(x: number, y: number, scale = 1): void {
    const k = this.reducedMotion ? 0.3 : 1;
    for (let i = 0; i < 7 * k; i++) {
      const a = rnd(0, Math.PI * 2);
      this.spawn('dust', x, y, Math.cos(a) * rnd(30, 80), Math.sin(a) * rnd(20, 60) - 20, rnd(0.45, 0.8), rnd(10, 18) * scale, { grow: 40 * scale, drag: 2.2 });
    }
    for (let i = 0; i < 9 * k; i++) {
      const a = rnd(-Math.PI, 0);
      this.spawn('chunk', x, y, Math.cos(a) * rnd(80, 220), Math.sin(a) * rnd(120, 260), rnd(0.4, 0.7), rnd(2, 4.5) * scale, { gravity: 900, drag: 1, vr: rnd(-20, 20), color: Math.random() < 0.5 ? FRONTIER.timber : '#a87a4c' });
    }
    for (let i = 0; i < 3 * k; i++) {
      const a = rnd(-Math.PI * 0.9, -Math.PI * 0.1);
      this.spawn('splinter', x, y, Math.cos(a) * rnd(120, 240), Math.sin(a) * rnd(160, 280), rnd(0.45, 0.7), rnd(5, 8) * scale, { gravity: 900, drag: 0.8, vr: rnd(-26, 26), color: '#c89a62' });
    }
    this.spawn('glint', x, y, 0, 0, 0.12, 22 * scale);
  }

  /** The lit fuse sputters: sparks spit up and a thread of smoke, starting once the face shows. */
  fuse(x: number, y: number, seconds: number, delay: number, scale = 1): void {
    this.addEmitter('fuse', x, y, seconds, this.reducedMotion ? 6 : 46, scale, delay, null);
  }

  /** Boot-scuff dust when the marshal plants or slides a foot. `dir` = −1 kicks back, +1 forward. */
  footDust(x: number, y: number, dir: number, scale = 1): void {
    const n = this.reducedMotion ? 1 : 7;
    for (let i = 0; i < n; i++) {
      this.spawn('dust', x + rnd(-6, 6) * scale, y - rnd(0, 4) * scale, dir * rnd(30, 110) * scale, -rnd(10, 50) * scale, rnd(0.5, 0.9), rnd(8, 14) * scale, { grow: 34 * scale, drag: 2.4 });
    }
  }

  /** Dust beaten out of the duster. */
  coatDust(x: number, y: number, scale = 1): void {
    const n = this.reducedMotion ? 1 : 6;
    for (let i = 0; i < n; i++) {
      this.spawn('dust', x + rnd(-8, 8) * scale, y + rnd(-10, 10) * scale, rnd(-40, 20) * scale, rnd(-30, 10) * scale, rnd(0.5, 0.9), rnd(6, 11) * scale, { grow: 26 * scale, drag: 2.6 });
    }
  }

  /**
   * Layered dynamite BOOM: heat veil + white-hot flash → fireball and fire tongues → two shockwave rings →
   * sparks and embers → splinters, clods and debris → scorch under it all → billowing smoke that rises and
   * thins → a smouldering crater → slow drifting ash.
   */
  blast(x: number, y: number, scale = 1): void {
    const k = this.reducedMotion ? 0.25 : 1;
    this.spawn('scorch', x, y, 0, 0, 4.5, 150 * scale);
    this.spawn('flash', x, y, 0, 0, 0.18, 300 * scale);
    if (!this.reducedMotion) this.spawn('veil', 0, 0, 0, 0, 0.22, 1);
    for (let i = 0; i < Math.max(1, 6 * k); i++) {
      this.spawn('fire', x + rnd(-10, 10) * scale, y + rnd(-10, 10) * scale, rnd(-30, 30), rnd(-60, -10), rnd(0.34, 0.55), rnd(34, 52) * scale, { grow: rnd(180, 280) * scale, drag: 2.5, delay: i * 0.012 });
    }
    for (let i = 0; i < 4 * k; i++) {
      // fire tongues licking upward after the core
      this.spawn('fire', x + rnd(-18, 18) * scale, y, rnd(-40, 40), rnd(-260, -160) * scale, rnd(0.22, 0.34), rnd(18, 26) * scale, { grow: 60 * scale, drag: 3, delay: rnd(0.04, 0.09) });
    }
    if (!this.reducedMotion) {
      this.spawn('ring', x, y, 0, 0, 0.42, 12 * scale, { grow: 560 * scale });
      this.spawn('ring', x, y, 0, 0, 0.6, 6 * scale, { grow: 330 * scale, delay: 0.05 });
    }
    for (let i = 0; i < 18 * k; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(380, 720) * scale;
      this.spawn('spark', x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.1, 0.22), rnd(8, 14) * scale, { drag: 3, color: '#ffd28a' });
    }
    for (let i = 0; i < 22 * k * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 340 * scale;
      this.spawn('chunk', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 140, rnd(0.9, 1.5), rnd(3, 8), { gravity: 900, drag: 1.1, vr: rnd(-14, 14), color: Math.random() < 0.5 ? FRONTIER.timber : FRONTIER.iron });
    }
    for (let i = 0; i < 10 * k; i++) {
      const a = rnd(-Math.PI, 0);
      const sp = rnd(260, 560) * scale;
      this.spawn('splinter', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 80, rnd(0.8, 1.3), rnd(8, 14) * scale, { gravity: 860, drag: 0.9, vr: rnd(-22, 22), color: Math.random() < 0.5 ? '#a87a4c' : '#7a5232' });
    }
    for (let i = 0; i < 8 * k; i++) {
      const a = rnd(-Math.PI * 0.85, -Math.PI * 0.15);
      const sp = rnd(160, 340) * scale;
      this.spawn('clod', x, y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.9, 1.3), rnd(4, 7) * scale, { gravity: 1100, drag: 0.6, vr: rnd(-6, 6), color: '#3b2a1c' });
    }
    for (let i = 0; i < 24 * k; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = rnd(60, 260);
      this.spawn('ember', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120, rnd(0.9, 1.8), rnd(3, 6), { gravity: 120, drag: 1.6, delay: rnd(0, 0.08) });
    }
    for (let i = 0; i < 16 * k; i++) {
      this.spawn('smoke', x + rnd(-24, 24) * scale, y + rnd(-14, 14) * scale, rnd(-50, 50), rnd(-70, -25), rnd(1.8, 3), rnd(44, 66) * scale, {
        grow: rnd(55, 95) * scale,
        drag: 0.8,
        delay: rnd(0.04, 0.2),
      });
    }
    for (let i = 0; i < 20 * k; i++) {
      this.spawn('ash', x + rnd(-140, 140) * scale, y - rnd(40, 160) * scale, rnd(-12, 12), rnd(14, 36), rnd(2.2, 3.4), rnd(1.2, 2.4), { delay: rnd(0.35, 1.2), vr: rnd(-3, 3) });
    }
    if (!this.reducedMotion) this.addEmitter('crater', x, y, 1.8, 9, scale, 0.35, null);
  }

  /** Coins raining from the top edge of a rectangle (cash-out); they bounce once on `floorY` and settle. */
  coins(x: number, y: number, width: number, floorY: number): void {
    const n = this.reducedMotion ? 6 : 46;
    for (let i = 0; i < n; i++) {
      this.spawn('coin', x + Math.random() * width, y - Math.random() * 40, rnd(-30, 30), rnd(40, 160), rnd(1.5, 2.3), rnd(5, 8), {
        gravity: 640,
        drag: 0.2,
        vr: rnd(-8, 8),
        color: FRONTIER.gold,
        x2: 1,
        y2: floorY - rnd(0, 24),
        delay: rnd(0, 0.25),
      });
    }
  }

  dispose(): void {
    this.stop();
  }

  // ------------------------------------------------------------ simulation

  private addEmitter(kind: EmitterKind, x: number, y: number, seconds: number, rate: number, scale: number, delay: number, follow: Follow | null): void {
    const e = this.emitters.find((q) => !q.active) ?? this.emitters.reduce((a, b) => (a.life < b.life ? a : b));
    e.kind = kind;
    e.active = true;
    e.x = x;
    e.y = y;
    e.life = seconds;
    e.max = seconds;
    e.rate = rate;
    e.scale = scale;
    e.delay = delay;
    e.acc = 0;
    e.follow = follow;
  }

  private emit(dt: number): void {
    for (const e of this.emitters) {
      if (!e.active) continue;
      if (e.delay > 0) {
        e.delay -= dt;
        continue;
      }
      e.life -= dt;
      if (e.life <= 0) {
        e.active = false;
        e.follow = null;
        continue;
      }
      if (e.follow) {
        if (!e.follow(this.at)) continue;
        e.x = this.at.x;
        e.y = this.at.y;
      }
      const fade = e.life / e.max;
      e.acc += dt * e.rate * (0.4 + 0.6 * fade);
      const s = e.scale;
      while (e.acc >= 1) {
        e.acc -= 1;
        if (e.kind === 'fuse') {
          const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
          const sp = rnd(70, 190) * s;
          this.spawn('spark', e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, rnd(0.08, 0.18), rnd(3, 6) * s, { drag: 2.5, gravity: 300, color: Math.random() < 0.5 ? '#ffd28a' : '#f0a040' });
          if (Math.random() < 0.18) this.spawn('wisp', e.x, e.y, rnd(-6, 6), -rnd(18, 34), rnd(0.5, 0.8), rnd(3, 5) * s, { grow: 14 * s, drag: 1 });
        } else if (e.kind === 'crater') {
          this.spawn('smoke', e.x + rnd(-16, 16) * s, e.y + rnd(-6, 6) * s, rnd(-10, 10), -rnd(24, 48), rnd(1.4, 2.2), rnd(20, 32) * s, { grow: 40 * s, drag: 0.6 });
        } else {
          this.spawn('wisp', e.x, e.y, rnd(-5, 5), -rnd(16, 30), rnd(0.5, 0.9), rnd(2.5, 4) * s, { grow: 12 * s, drag: 0.9, vr: rnd(-2, 2) });
        }
      }
    }
  }

  private spawn(
    kind: Kind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    o: Partial<Pick<Particle, 'gravity' | 'drag' | 'color' | 'grow' | 'delay' | 'rot' | 'vr' | 'x2' | 'y2'>> = {},
  ): void {
    // Rolling cursor: free slots are found in amortised O(1); a full pool drops the spawn (bounded cost).
    let p: Particle | undefined;
    for (let n = 0; n < FX_POOL; n++) {
      const q = this.pool[(this.cursor + n) % FX_POOL];
      if (q && q.life <= 0) {
        p = q;
        this.cursor = (this.cursor + n + 1) % FX_POOL;
        break;
      }
    }
    if (!p) return;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.max = life;
    p.size = size;
    p.grow = o.grow ?? 0;
    p.delay = o.delay ?? 0;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.color = o.color ?? '#fff';
    p.rot = o.rot ?? Math.random() * Math.PI;
    p.vr = o.vr ?? 0;
    p.x2 = o.x2 ?? x;
    p.y2 = o.y2 ?? y;
  }

  private seedMotes(): void {
    let placed = 0;
    for (const p of this.pool) {
      if (placed >= MOTES) break;
      if (p.kind === 'mote' || p.life <= 0) {
        this.spawnMote(p);
        placed++;
      }
    }
  }

  private spawnMote(p: Particle): void {
    p.kind = 'mote';
    p.x = Math.random() * this.w;
    p.y = Math.random() * this.h;
    p.vx = rnd(4, 14);
    p.vy = rnd(-2, 2);
    p.life = Infinity;
    p.max = Infinity;
    p.size = rnd(0.8, 2.4);
    p.delay = 0;
    p.rot = Math.random() * Math.PI * 2;
    p.vr = rnd(0.3, 0.9);
    p.color = FRONTIER.dust;
  }

  private step(dt: number): void {
    let active = 0;
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      if (p.kind === 'mote') {
        p.rot += p.vr * dt;
        p.x += (p.vx + Math.sin(p.rot) * 6) * dt;
        p.y += (p.vy + Math.cos(p.rot * 0.7) * 3) * dt;
        if (p.x > this.w + 4) p.x = -4;
        if (p.y < -4) p.y = this.h + 4;
        if (p.y > this.h + 4) p.y = -4;
        continue;
      }
      active++;
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.life -= dt;
      p.vy += p.gravity * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size += p.grow * dt;
      if (p.kind === 'fire' || p.kind === 'ring' || p.kind === 'brassRing') p.grow *= Math.max(0, 1 - 3.2 * dt); // decelerating expansion
      else if (p.kind === 'ash' || p.kind === 'wisp') p.vx += Math.sin(p.rot * 3) * (p.kind === 'ash' ? 10 : 14) * dt; // flutter / curl
      else if (p.kind === 'coin' && p.y > p.y2 && p.vy > 0) {
        if (p.x2 > 0) {
          // one bounce with spin bleed, then settle and fade
          p.y = p.y2;
          p.vy *= -0.36;
          p.vx *= 0.5;
          p.vr *= 0.5;
          p.x2 = 0;
          p.life = Math.min(p.life, 0.55);
        } else {
          p.y = p.y2;
          p.vy = 0;
          p.vx *= 0.8;
          p.gravity = 0;
        }
      }
    }
    this.activeCount = active;
  }

  private draw(): void {
    const g = this.ctx;
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // Scorch sits under the character and everything else.
    for (const p of this.pool) {
      if (p.kind !== 'scorch' || p.life <= 0 || p.delay > 0) continue;
      const t = p.life / p.max;
      g.globalAlpha = Math.min(1, t * 2.5) * 0.85;
      g.drawImage(this.spr.scorch, p.x - p.size / 2, p.y - p.size * 0.42, p.size, p.size * 0.84);
    }
    g.globalAlpha = 1;
    for (const d of this.drawables) {
      g.save();
      d.draw(g);
      g.restore();
    }
    for (const p of this.pool) {
      if (p.life <= 0 || p.delay > 0 || p.kind === 'scorch') continue;
      const t = p.kind === 'mote' ? 1 : Math.max(0, p.life / p.max); // 1 → 0 over life
      const age = 1 - t;
      switch (p.kind) {
        case 'mote':
          g.globalAlpha = 0.16 + 0.12 * Math.sin(p.rot * 2);
          g.fillStyle = p.color;
          g.fillRect(p.x, p.y, p.size, p.size);
          break;
        case 'smoke':
          // dark and dense early, thinning grey later
          g.globalAlpha = Math.min(1, age * 6) * t * 0.85;
          g.drawImage(this.spr.smoke, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'wisp':
          g.globalAlpha = Math.min(1, age * 5) * t * 0.5;
          g.drawImage(this.spr.smoke, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'dust':
          g.globalAlpha = t * 0.8;
          g.drawImage(this.spr.dust, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'glint':
          g.globalAlpha = t;
          g.drawImage(this.spr.glint, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'flash':
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = t * t;
          g.drawImage(this.spr.flash, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          g.globalCompositeOperation = 'source-over';
          break;
        case 'veil':
          // a warm wash over the whole stage for a few frames: the blast lights the room
          g.globalAlpha = t * t * t * 0.32;
          g.fillStyle = '#ffd9a0';
          g.fillRect(0, 0, this.w, this.h);
          break;
        case 'fire':
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = Math.min(1, t * 1.6) * 0.9;
          g.drawImage(this.spr.fire, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          g.globalCompositeOperation = 'source-over';
          break;
        case 'ring':
          g.globalAlpha = t * 0.75;
          g.strokeStyle = '#f3dcae';
          g.lineWidth = 1 + 7 * t;
          g.beginPath();
          g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          g.stroke();
          break;
        case 'brassRing':
          g.globalAlpha = t * 0.8;
          g.strokeStyle = FRONTIER.brassLight;
          g.lineWidth = 1 + 2.5 * t;
          g.beginPath();
          g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          g.stroke();
          break;
        case 'ember': {
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = t * (0.65 + 0.35 * Math.sin(p.rot * 40 + p.life * 30));
          g.drawImage(this.spr.ember, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'ash':
          g.globalAlpha = Math.min(1, age * 4) * t * 0.7;
          g.fillStyle = '#5a534c';
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          g.restore();
          break;
        case 'spark': {
          // streak along the velocity
          const sp = Math.hypot(p.vx, p.vy) || 1;
          g.globalAlpha = t;
          g.strokeStyle = p.color;
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - (p.vx / sp) * p.size, p.y - (p.vy / sp) * p.size);
          g.stroke();
          break;
        }
        case 'muzzle': {
          // four-point star flash along the barrel
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = t;
          const L = p.size * (0.8 + 0.4 * age);
          g.fillStyle = '#ffe2a6';
          g.beginPath();
          g.moveTo(-2, 0);
          g.lineTo(L * 0.35, -L * 0.28);
          g.lineTo(L, 0);
          g.lineTo(L * 0.35, L * 0.28);
          g.closePath();
          g.fill();
          g.fillStyle = '#fff6e0';
          g.beginPath();
          g.arc(L * 0.18, 0, L * 0.16, 0, Math.PI * 2);
          g.fill();
          g.restore();
          g.globalCompositeOperation = 'source-over';
          break;
        }
        case 'tracer': {
          const travel = p.max - 0.06;
          const u = Math.min(1, (p.max - p.life) / Math.max(0.001, travel));
          const hx = p.x + (p.x2 - p.x) * u;
          const hy = p.y + (p.y2 - p.y) * u;
          const tail = Math.max(0, u - 0.35);
          const tx = p.x + (p.x2 - p.x) * tail;
          const ty = p.y + (p.y2 - p.y) * tail;
          const grad = g.createLinearGradient(tx, ty, hx, hy);
          grad.addColorStop(0, 'rgba(255,230,180,0)');
          grad.addColorStop(1, 'rgba(255,240,205,0.95)');
          g.globalAlpha = u >= 1 ? t / 0.5 : 1;
          g.strokeStyle = grad;
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(tx, ty);
          g.lineTo(hx, hy);
          g.stroke();
          break;
        }
        case 'shell':
          g.globalAlpha = Math.min(1, t * 2);
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          g.fillRect(-p.size, -p.size * 0.45, p.size * 2, p.size * 0.9);
          g.restore();
          break;
        case 'splinter':
          // long, thin plank shard tumbling end over end
          g.globalAlpha = Math.min(1, t * 2);
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          g.fillRect(-p.size / 2, -1, p.size, 2);
          g.fillStyle = 'rgba(0,0,0,0.3)';
          g.fillRect(-p.size / 2, 0.4, p.size, 0.8);
          g.restore();
          break;
        case 'clod':
          g.globalAlpha = Math.min(1, t * 2);
          g.fillStyle = p.color;
          g.beginPath();
          g.ellipse(p.x, p.y, p.size * 0.6, p.size * 0.48, p.rot, 0, Math.PI * 2);
          g.fill();
          break;
        case 'coin': {
          g.globalAlpha = Math.min(1, t * 2);
          g.save();
          g.translate(p.x, p.y);
          const face = Math.abs(Math.cos(p.rot)) * 0.9 + 0.1;
          g.scale(face, 1);
          g.fillStyle = FRONTIER.gold;
          g.beginPath();
          g.arc(0, 0, p.size, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = FRONTIER.leather;
          g.lineWidth = 1;
          g.stroke();
          if (face > 0.6) {
            g.fillStyle = FRONTIER.brassLight;
            g.fillRect(-p.size * 0.5, -p.size * 0.5, p.size * 0.4, p.size * 0.25);
          }
          g.restore();
          break;
        }
        default:
          g.globalAlpha = Math.min(1, t * 1.5);
          g.save();
          g.translate(p.x, p.y);
          g.rotate(p.rot);
          g.fillStyle = p.color;
          g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          g.restore();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}
