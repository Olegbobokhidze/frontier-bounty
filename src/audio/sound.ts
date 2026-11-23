/**
 * Frontier sound module: every cue is synthesized with Web Audio (wood knocks, brass clinks,
 * a fuse hiss, a blast, a register bell), so there are no files that can fail to load.
 * Every call is a safe no-op when audio is unavailable or blocked.
 */
export const Cue = {
  TAP: 'tap',
  PICK: 'pick',
  SAFE: 'safe',
  FUSE: 'fuse',
  BLAST: 'blast',
  CASHOUT: 'cashout',
  STAKE: 'stake',
  ERROR: 'error',
} as const;
export type Cue = (typeof Cue)[keyof typeof Cue];

export type SoundState = { readonly volume: number; readonly muted: boolean; readonly status: 'locked' | 'running' | 'unavailable' };

const KEY = 'frontier.audio.v1';
type Ctor = new () => AudioContext;

const storage = {
  get(k: string): string | null {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  },
  set(k: string, v: string): void {
    try {
      globalThis.localStorage?.setItem(k, v);
    } catch {
      /* private mode / quota */
    }
  },
};

export class FrontierSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private state: SoundState;
  private readonly listeners = new Set<() => void>();
  private readonly ctor: Ctor | null;

  constructor(options: { readonly audioContext?: Ctor | null } = {}) {
    const w = globalThis as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    this.ctor = options.audioContext !== undefined ? options.audioContext : (w.AudioContext ?? w.webkitAudioContext ?? null);
    let volume = 0.7;
    let muted = false;
    try {
      const p = JSON.parse(storage.get(KEY) ?? 'null') as { volume?: unknown; muted?: unknown } | null;
      if (p && typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1) volume = p.volume;
      if (p && typeof p.muted === 'boolean') muted = p.muted;
    } catch {
      /* corrupt prefs */
    }
    this.state = { volume, muted, status: this.ctor ? 'locked' : 'unavailable' };
  }

  getState = (): SoundState => this.state;
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  setVolume(v: number) {
    this.update({ volume: Math.max(0, Math.min(1, v)) });
  }
  setMuted(m: boolean) {
    this.update({ muted: m });
  }
  toggleMuted() {
    this.setMuted(!this.state.muted);
  }

  /** Call from a user gesture. Idempotent. */
  unlock(): void {
    if (!this.ctor) return;
    try {
      if (!this.ctx) {
        this.ctx = new this.ctor();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.applyGain();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      this.state = { ...this.state, status: 'running' };
      this.emit();
    } catch {
      this.ctx = null;
      this.state = { ...this.state, status: 'unavailable' };
      this.emit();
    }
  }

  setPageVisible(visible: boolean): void {
    try {
      if (visible) void this.ctx?.resume().catch(() => undefined);
      else void this.ctx?.suspend().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }

  play(cue: Cue, opts: { readonly pitch?: number } = {}): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.state.muted || ctx.state === 'closed') return;
    const k = opts.pitch ?? 1;
    const t = ctx.currentTime + 0.005;
    try {
      switch (cue) {
        case Cue.TAP: // light wooden tick
          this.knock(ctx, t, 900 * k, 0.03, 0.08);
          break;
        case Cue.PICK: // hollow plank knock
          this.knock(ctx, t, 220 * k, 0.09, 0.35);
          this.noiseHit(ctx, t, 0.05, 'bandpass', 1400, 0.12);
          break;
        case Cue.SAFE: // brass coin clink: inharmonic partials
          for (const [f, d, v] of [
            [2093, 0, 0.12],
            [3136, 0.004, 0.07],
            [4699, 0.008, 0.04],
          ] as const) this.tone(ctx, t + d, f * k, 0.32, 'sine', v);
          this.tone(ctx, t + 0.07, 2637 * k, 0.28, 'sine', 0.08);
          break;
        case Cue.FUSE: // short sizzling fuse
          this.noiseHit(ctx, t, 0.35, 'highpass', 5200, 0.09, 3200);
          break;
        case Cue.BLAST: // thump + rumble + debris crackle
          this.tone(ctx, t, 110, 0.55, 'sine', 0.8, 38);
          this.noiseHit(ctx, t, 0.9, 'lowpass', 900, 0.6, 120);
          this.noiseHit(ctx, t + 0.05, 0.4, 'bandpass', 2600, 0.12);
          break;
        case Cue.CASHOUT: // register bell "ka-ching" + coins
          this.tone(ctx, t, 1568, 0.6, 'triangle', 0.18);
          this.tone(ctx, t, 2349, 0.5, 'sine', 0.08);
          for (let i = 0; i < 6; i++) this.tone(ctx, t + 0.12 + i * 0.045, 2600 + ((i * 397) % 900), 0.12, 'sine', 0.06);
          break;
        case Cue.STAKE: // leather pouch + double knock
          this.noiseHit(ctx, t, 0.08, 'lowpass', 700, 0.18);
          this.knock(ctx, t + 0.06, 300, 0.07, 0.25);
          break;
        case Cue.ERROR: // dull iron clank
          this.tone(ctx, t, 196, 0.25, 'square', 0.06);
          this.tone(ctx, t + 0.12, 147, 0.3, 'square', 0.06);
          break;
      }
    } catch {
      /* audio must never break the game */
    }
  }

  dispose(): void {
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.listeners.clear();
  }

  // ------------------------------------------------------------ synthesis helpers

  private knock(ctx: AudioContext, at: number, freq: number, dur: number, vol: number) {
    this.tone(ctx, at, freq, dur, 'triangle', vol, freq * 0.55);
  }

  private tone(ctx: AudioContext, at: number, freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
    if (!this.master) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private noiseHit(ctx: AudioContext, at: number, dur: number, type: BiquadFilterType, freq: number, vol: number, sweepTo?: number) {
    if (!this.master || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, at);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  private update(patch: Partial<Pick<SoundState, 'volume' | 'muted'>>) {
    this.state = { ...this.state, ...patch };
    storage.set(KEY, JSON.stringify({ volume: this.state.volume, muted: this.state.muted }));
    this.applyGain();
    this.emit();
  }

  private applyGain() {
    if (!this.ctx || !this.master) return;
    try {
      this.master.gain.setTargetAtTime(this.state.muted ? 0 : this.state.volume * 0.7, this.ctx.currentTime, 0.02);
    } catch {
      /* ignore */
    }
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}
