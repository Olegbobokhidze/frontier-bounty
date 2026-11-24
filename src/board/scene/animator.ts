/**
 * Character animator: a cosmetic state machine that only OBSERVES game events (ADR-0006, ADR-0007).
 * It samples authored clips, blends from whatever pose is current (so interrupts never pop), and layers
 * procedural motion: breathing (faster and shallower under tension, held while aiming), weight shift,
 * micro-looks, blinks, gaze toward a targeted claim, a twitchy trigger hand, idle fidgets, hit-stop and
 * secondary springs (hat lag, coat sway). Pure apart from an injectable random source, so it is unit-tested.
 */
import { CLIPS, FIDGETS, type Clip, type ClipName, type Marker } from './clips';
import { lerp } from './easing';
import { KEYED_PARAMS, NEUTRAL, type KeyedParam, type Pose } from './pose';

type Track = { readonly at: number; readonly v: number; readonly ease: (u: number) => number }[];

export type AnimatorOptions = {
  readonly random?: () => number;
  /** Reduced motion: no idle layer, no springs, no fidgets or hit-stop, clips play at 3× speed. */
  readonly reducedMotion?: boolean;
};

/** Quiet time in idle before the first fidget, and the random extra on top. */
export const FIDGET_AFTER_MS = 6500;
const FIDGET_JITTER_MS = 5000;
/** A partial twirl left by an interrupt resolves to the nearest whole turn over this long. */
const TWIRL_RESOLVE_MS = 170;

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
  private breathPhase = 0;
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
  private gazeAngle = 0;
  private gazeOn = false;
  private gazeW = 0;
  private holdMs = 0;
  private quietMs = 0;
  private nextFidget: number;

  constructor(o: AnimatorOptions = {}) {
    this.random = o.random ?? Math.random;
    this.reduced = o.reducedMotion ?? false;
    this.nextFidget = FIDGET_AFTER_MS + this.random() * FIDGET_JITTER_MS;
    this.start(CLIPS.idle);
  }

  get current(): ClipName {
    return this.clip.name;
  }
  get clipTime(): number {
    return this.t;
  }
  /** 0..1 how strongly the marshal is looking at a gaze target right now. */
  get gazeWeight(): number {
    return this.gazeW;
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

  /** Look toward a direction (canvas radians from the head), or null to let the eyes wander again. */
  setGaze(angle: number | null): void {
    this.gazeOn = angle !== null;
    if (angle !== null) {
      this.gazeAngle = angle;
      this.quietMs = 0;
    }
  }

  /** Hit-stop: freeze the body for a few frames so a big impact lands with weight. */
  hold(ms: number): void {
    if (!this.reduced) this.holdMs = Math.max(this.holdMs, ms);
  }

  play(name: ClipName): void {
    this.quietMs = 0;
    this.start(CLIPS[name]);
  }

  update(dtMs: number): Pose {
    if (this.holdMs > 0) {
      this.holdMs -= dtMs;
      return this.pose;
    }
    const dt = Math.min(dtMs, 100) * (this.reduced ? 3 : 1);
    const prevT = this.t;
    this.t += dt;
    this.clock += dtMs;

    // Markers fire exactly once, in order, even across long frames.
    for (const m of this.clip.markers) if (m.at > prevT && m.at <= this.t) this.emit(m.name);

    this.keyed = { ...this.keyed, ...this.sample(this.t) };
    if (this.t >= this.clip.duration) {
      // Normalise completed twirls (whole turns ≡ 0) so the next blend never spins backwards.
      if (this.keyed.flourish >= 1) this.keyed = { ...this.keyed, flourish: 0 };
      const next = this.clip.next;
      if (next) this.start(CLIPS[next]);
      else this.freeze();
    }

    // ---- procedural layers
    const w = this.reduced ? 0 : this.clip.idleWeight;
    if (!this.reduced) {
      this.updateIdle(dtMs);
      this.updateFidget(dtMs);
    }
    const tension = this.keyed.tension;
    // Under tension the breath quickens and shallows; on the aim line it is all but held.
    const aiming = this.keyed.armAim > 0.8 ? 1 : 0;
    this.breathPhase += (dtMs / 1000) * Math.PI * 2 * (0.27 + tension * 0.22);
    const breath = Math.sin(this.breathPhase) * w * (1 - tension * 0.45) * (1 - aiming * 0.6);
    const blink = this.blinkT >= 0 ? Math.sin(Math.min(1, this.blinkT / 140) * Math.PI) : 0;
    this.aim += (this.aimTarget - this.aim) * (1 - Math.exp(-dtMs / 45));
    this.gazeW += ((this.gazeOn && !this.reduced ? 1 : 0) - this.gazeW) * (1 - Math.exp(-dtMs / 120));

    const base: Pose = { ...this.pose, ...this.keyed };
    // Gaze: the head turns to the target and pitches toward it; the eyes lead the head.
    const g = this.gazeW * Math.max(0, 1 - this.keyed.knock * 2);
    const gazePitch = Math.max(-0.12, Math.min(0.22, this.gazeAngle * 0.3));
    const wander = this.look * w * (1 - g);
    const twitchAmp = this.reduced ? 0 : Math.max(0, tension - 0.3) * (1 - Math.min(1, this.keyed.armAim * 3));
    const pose: Pose = {
      ...base,
      hipShift: base.hipShift + this.shift * w,
      headTurn: Math.max(-1, Math.min(1, lerp(base.headTurn + wander, Math.max(base.headTurn, 0.9), g))),
      headTilt: base.headTilt + gazePitch * g,
      eyeX: Math.max(-1, Math.min(1, lerp(wander * 0.8, 0.8, g))),
      eyeY: Math.max(-1, Math.min(1, Math.sin(this.gazeAngle) * 1.4 * g)),
      breath,
      blink,
      aimAngle: this.aim,
      brushPhase: Math.sin((this.clock / 1000) * Math.PI * 2 * 3.4),
      twitch: twitchAmp * Math.sin(this.clock * 0.019) * Math.sin(this.clock * 0.0047) * 2.4,
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
    // Whole turns are invisible: drop them so blends never unwind a twirl.
    this.keyed = { ...this.keyed, flourish: this.keyed.flourish % 1 };
    for (const p of KEYED_PARAMS) {
      const track: Track = [{ at: 0, v: this.keyed[p], ease: (u) => u }];
      for (const key of clip.keys) {
        const v = key.pose[p];
        if (v !== undefined) track.push({ at: key.at, v, ease: key.ease });
      }
      // An interrupted twirl finishes (or backs off) to the nearest whole turn instead of freezing mid-spin.
      if (p === 'flourish' && track.length === 1 && this.keyed.flourish > 0.001) {
        track.push({ at: Math.min(TWIRL_RESOLVE_MS, clip.duration), v: this.keyed.flourish >= 0.5 ? 1 : 0, ease: (u) => 1 - (1 - Math.min(1, Math.max(0, u))) ** 2 });
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

  /** After a quiet spell in plain idle (nobody targeting a claim) he adjusts his hat or squints down the street. */
  private updateFidget(dt: number): void {
    if (this.clip.name !== 'idle' || this.gazeOn) {
      this.quietMs = 0;
      return;
    }
    this.quietMs += dt;
    if (this.quietMs < this.nextFidget) return;
    const pick = FIDGETS[Math.floor(this.random() * FIDGETS.length)] ?? 'fidgetHat';
    this.nextFidget = FIDGET_AFTER_MS + this.random() * FIDGET_JITTER_MS;
    this.play(pick);
  }

  private emit(m: Marker): void {
    for (const l of this.markerListeners) l(m);
  }
}
