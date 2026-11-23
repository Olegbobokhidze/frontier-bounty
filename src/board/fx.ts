/**
 * Canvas 2D effects layer (ADR-0004): ambient dust motes, gold flecks, dynamite debris and smoke,
 * and a coin shower. One rAF loop with delta time, a fixed particle pool, and pre-rendered sprites.
 * It never touches React or layout. It also measures frame times for the Inspector.
 */
import { FRONTIER } from '../config/theme';

type Kind = 'mote' | 'fleck' | 'chunk' | 'smoke' | 'coin' | 'spark';

type Particle = {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
  color: string;
};

export type FrameStatsSnapshot = { readonly fps: number; readonly avgMs: number; readonly p95Ms: number; readonly maxMs: number; readonly samples: readonly number[] };

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

const POOL = 260;
const MOTES = 34;

function sprite(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  return c;
}

export class FxLayer {
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly pool: Particle[] = [];
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private readonly stats = new FrameStats();
  private readonly smoke: HTMLCanvasElement;
  private readonly glint: HTMLCanvasElement;
  private running = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly reducedMotion: boolean,
  ) {
    this.ctx = canvas.getContext('2d');
    for (let i = 0; i < POOL; i++) this.pool.push({ kind: 'mote', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, rot: 0, vr: 0, gravity: 0, drag: 0, color: '#000' });
    this.smoke = sprite(64, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(140,130,118,0.55)');
      r.addColorStop(0.6, 'rgba(110,100,92,0.25)');
      r.addColorStop(1, 'rgba(90,80,72,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    });
    this.glint = sprite(32, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,240,200,0.9)');
      r.addColorStop(0.35, 'rgba(232,207,138,0.45)');
      r.addColorStop(1, 'rgba(232,207,138,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, s, s);
    });
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
      this.step(Math.min(elapsed, 100) / 1000);
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

  /** Gold flecks + a glint when a bounty is found. */
  gold(x: number, y: number, scale = 1): void {
    const n = this.reducedMotion ? 4 : Math.round(22 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160 * scale;
      this.spawn('fleck', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 80, 0.6 + Math.random() * 0.5, 2 + Math.random() * 3, 520, 1.6, Math.random() < 0.6 ? FRONTIER.gold : FRONTIER.brassLight);
    }
    this.spawn('spark', x, y, 0, 0, 0.35, 46 * scale, 0, 0, FRONTIER.brassLight);
  }

  /** Dynamite: debris chunks, embers and a smoke column. */
  blast(x: number, y: number, scale = 1): void {
    const k = this.reducedMotion ? 0.2 : 1;
    for (let i = 0; i < 26 * k * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 320 * scale;
      this.spawn('chunk', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120, 0.9 + Math.random() * 0.6, 3 + Math.random() * 5, 900, 1.2, Math.random() < 0.5 ? FRONTIER.timber : FRONTIER.iron);
    }
    for (let i = 0; i < 18 * k * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 260;
      this.spawn('fleck', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 60, 0.4 + Math.random() * 0.4, 1.5 + Math.random() * 2, 300, 2, FRONTIER.ember);
    }
    for (let i = 0; i < 10 * k * scale; i++) {
      this.spawn('smoke', x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40, -30 - Math.random() * 50, 1.4 + Math.random() * 1.2, 30 + Math.random() * 40 * scale, -10, 0.6, FRONTIER.smoke);
    }
  }

  /** Coins raining from the top edge of a rectangle (cash-out). */
  coins(x: number, y: number, width: number): void {
    const n = this.reducedMotion ? 6 : 46;
    for (let i = 0; i < n; i++) {
      this.spawn('coin', x + Math.random() * width, y - Math.random() * 40, (Math.random() - 0.5) * 60, 40 + Math.random() * 120, 1.4 + Math.random() * 0.8, 5 + Math.random() * 3, 640, 0.2, FRONTIER.gold);
    }
  }

  dispose(): void {
    this.stop();
  }

  // ------------------------------------------------------------ simulation

  private spawn(kind: Kind, x: number, y: number, vx: number, vy: number, life: number, size: number, gravity: number, drag: number, color: string): void {
    const p = this.pool.find((q) => q.life <= 0 && q.kind !== 'mote') ?? this.pool.find((q) => q.life <= 0);
    if (!p) return;
    Object.assign(p, { kind, x, y, vx, vy, life, max: life, size, gravity, drag, color, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 10 });
  }

  private seedMotes(): void {
    let placed = 0;
    for (const p of this.pool) {
      if (placed >= MOTES) break;
      if (p.kind === 'mote' || p.life <= 0) {
        Object.assign(p, {
          kind: 'mote',
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          vx: 4 + Math.random() * 10,
          vy: -2 + Math.random() * 4,
          life: Infinity,
          max: Infinity,
          size: 0.8 + Math.random() * 1.6,
          gravity: 0,
          drag: 0,
          color: FRONTIER.dust,
          rot: Math.random() * Math.PI * 2,
          vr: 0.3 + Math.random() * 0.6,
        });
        placed++;
      }
    }
  }

  private step(dt: number): void {
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
      p.life -= dt;
      p.vy += p.gravity * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'smoke') p.size += 26 * dt;
    }
  }

  private draw(): void {
    const g = this.ctx;
    if (!g) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      const t = p.kind === 'mote' ? 1 : Math.max(0, p.life / p.max);
      switch (p.kind) {
        case 'mote':
          g.globalAlpha = 0.18 + 0.12 * Math.sin(p.rot * 2);
          g.fillStyle = p.color;
          g.fillRect(p.x, p.y, p.size, p.size);
          break;
        case 'smoke':
          g.globalAlpha = Math.min(1, t * 1.4) * 0.8;
          g.drawImage(this.smoke, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'spark':
          g.globalAlpha = t;
          g.drawImage(this.glint, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          break;
        case 'coin': {
          g.globalAlpha = Math.min(1, t * 2);
          g.save();
          g.translate(p.x, p.y);
          g.scale(Math.abs(Math.cos(p.rot)) * 0.9 + 0.1, 1);
          g.fillStyle = FRONTIER.gold;
          g.beginPath();
          g.arc(0, 0, p.size, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = FRONTIER.leather;
          g.lineWidth = 1;
          g.stroke();
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
  }
}
