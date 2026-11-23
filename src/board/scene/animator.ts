/**
 * Character animator: a cosmetic state machine that only OBSERVES game events (ADR-0006).
 * It samples authored clips, blends from whatever pose is current (so interrupts never pop), and layers
 * procedural motion: breathing, weight shift, micro-looks, blinks, aim tracking and secondary springs
 * (hat lag, coat sway). Pure apart from an injectable random source, so it is unit-tested.
 */
import { CLIPS, type Clip, type ClipName, type Marker } from './clips';
import { lerp } from './easing';
import { KEYED_PARAMS, NEUTRAL, type KeyedParam, type Pose } from './pose';

type Track = { readonly at: number; readonly v: number; readonly ease: (u: number) => number }[];

export type AnimatorOptions = {
  readonly random?: () => number;
  /** Reduced motion: no idle layer, no springs, clips play at 3× speed. */
  readonly reducedMotion?: boolean;
};

export class CharacterAnimator {
  /** Pure keyed values (no procedural layers), the source for blending into the next clip. */
  private keyed: Record<KeyedParam, number> = Object.fromEntries(KEYED_PARAMS.map((p) => [p, NEUTRAL[p]])) as Record<KeyedParam, number>;
  private pose: Pose = NEUTRAL;
  private clip: Clip = CLIPS.idle;
  private t = 0;
  private tracks = new Map<KeyedParam, Track>();
  private readonly markerListeners = new Set<(m: Marker) => void>();
  private readonly random: () => number;
  private readonly reduced: boolean;
  // procedural state
  private clock = 0;
  private aimTarget = NEUTRAL.aimAngle;
  private aim = NEUTRAL.aimAngle;
  private shift = 0;
  private shiftTarget = 0;
  private nextShift = 2500;
  private look = 0;
  private lookTarget = 0;
  private nextLook = 1800;
  private blinkT = -1;
  private nextBlink = 2200;
  private hatLag = 0;
  private hatLagV = 0;
  private sway = 0;
  private swayV = 0;
  private prevDrive = 0;

  constructor(o: AnimatorOptions = {}) {
    this.random = o.random ?? Math.random;
    this.reduced = o.reducedMotion ?? false;
    this.start(CLIPS.idle);
  }

  get current(): ClipName {
    return this.clip.name;
  }
  get clipTime(): number {
    return this.t;
  }
  getPose(): Pose {
    return this.pose;
  }

  onMarker(l: (m: Marker) => void): () => void {
    this.markerListeners.add(l);
    return () => this.markerListeners.delete(l);
  }

  /** Aim direction (canvas radians). Tracked with a fast critically damped follow. */
  setAim(angle: number, snap = false): void {
    this.aimTarget = angle;
    if (snap) this.aim = angle;
  }

  play(name: ClipName): void {
    this.start(CLIPS[name]);
  }

  update(dtMs: number): Pose {
    const dt = Math.min(dtMs, 100) * (this.reduced ? 3 : 1);
    const prevT = this.t;
    this.t += dt;
    this.clock += dtMs;

    // Markers fire exactly once, in order, even across long frames.
    for (const m of this.clip.markers) if (m.at > prevT && m.at <= this.t) this.emit(m.name);

    this.keyed = { ...this.keyed, ...this.sample(this.t) };
    if (this.t >= this.clip.duration) {
      // Normalise a completed twirl (1 turn ≡ 0) so the next blend never spins backwards.
      if (this.keyed.flourish >= 1) this.keyed = { ...this.keyed, flourish: 0 };
      const next = this.clip.next;
      if (next) this.start(CLIPS[next]);
      else this.freeze();
    }

    // ---- procedural layers
    const w = this.reduced ? 0 : this.clip.idleWeight;
    if (!this.reduced) this.updateIdle(dtMs);
    const breath = Math.sin((this.clock / 1000) * Math.PI * 2 * 0.28) * w;
    const blink = this.blinkT >= 0 ? Math.sin(Math.min(1, this.blinkT / 140) * Math.PI) : 0;
    this.aim += (this.aimTarget - this.aim) * (1 - Math.exp(-dtMs / 45));

    const base: Pose = { ...this.pose, ...this.keyed };
    const pose: Pose = {
      ...base,
      hipShift: base.hipShift + this.shift * w,
      headTurn: Math.max(-1, Math.min(1, base.headTurn + this.look * w)),
      breath,
      blink,
      aimAngle: this.aim,
    };

    // Secondary motion: hat lags head pitch/lean; coat tail swings with hip motion and knock-back.
    if (!this.reduced) {
      const drive = pose.lean * 30 - pose.knock * 26 + pose.hipShift * 0.6 - pose.crouch * 10;
      const vel = (drive - this.prevDrive) / Math.max(1, dtMs);
      this.prevDrive = drive;
      const s = dtMs / 1000;
      this.swayV += (-120 * this.sway - 9 * this.swayV - vel * 900) * s;
      this.sway += this.swayV * s;
      const hatDrive = -(pose.lean + pose.headTilt) * 0.5 - pose.knock * 0.6;
      this.hatLagV += (-140 * (this.hatLag - hatDrive * 0.15) - 10 * this.hatLagV) * s;
      this.hatLag += this.hatLagV * s;
      this.sway = Math.max(-14, Math.min(14, this.sway));
      this.hatLag = Math.max(-0.35, Math.min(0.35, this.hatLag));
    }
    this.pose = { ...pose, coatSway: this.sway + Math.sin(this.clock / 900) * 1.2 * w, hatLag: this.hatLag };
    return this.pose;
  }

  // ------------------------------------------------------------ internals

  private start(clip: Clip): void {
    this.clip = clip;
    this.t = 0;
    this.tracks = new Map();
    for (const p of KEYED_PARAMS) {
      const track: Track = [{ at: 0, v: this.keyed[p], ease: (u) => u }];
      for (const key of clip.keys) {
        const v = key.pose[p];
        if (v !== undefined) track.push({ at: key.at, v, ease: key.ease });
      }
      if (track.length > 1) this.tracks.set(p, track);
    }
  }

  /** Clip finished with no successor: hold its final values. */
  private freeze(): void {
    this.tracks = new Map();
    this.t = 0;
    this.clip = { ...this.clip, duration: Infinity, markers: [], keys: [] };
  }

  private sample(t: number): Partial<Record<KeyedParam, number>> {
    const out: Partial<Record<KeyedParam, number>> = {};
    for (const [p, track] of this.tracks) {
      let i = 1;
      while (i < track.length - 1 && (track[i]?.at ?? 0) < t) i++;
      const a = track[i - 1];
      const b = track[i];
      if (!a || !b) continue;
      const span = b.at - a.at;
      const u = span <= 0 ? 1 : (t - a.at) / span;
      out[p] = u >= 1 && i === track.length - 1 ? b.v : lerp(a.v, b.v, b.ease(Math.min(1, Math.max(0, u))));
    }
    return out;
  }

  private updateIdle(dt: number): void {
    this.nextShift -= dt;
    if (this.nextShift <= 0) {
      this.shiftTarget = (this.random() - 0.5) * 8;
      this.nextShift = 2600 + this.random() * 2600;
    }
    this.shift += (this.shiftTarget - this.shift) * (1 - Math.exp(-dt / 600));

    this.nextLook -= dt;
    if (this.nextLook <= 0) {
      // Micro-look: glance at the board, away down the street, or back to centre.
      const r = this.random();
      this.lookTarget = r < 0.4 ? 0.6 : r < 0.7 ? -0.6 : 0;
      this.nextLook = 1600 + this.random() * 3200;
    }
    this.look += (this.lookTarget - this.look) * (1 - Math.exp(-dt / 160));

    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 140) this.blinkT = -1;
    } else {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) {
        this.blinkT = 0;
        this.nextBlink = 2000 + this.random() * 3500;
      }
    }
  }

  private emit(m: Marker): void {
    for (const l of this.markerListeners) l(m);
  }
}
