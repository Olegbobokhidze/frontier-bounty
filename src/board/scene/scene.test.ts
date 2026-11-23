import { describe, expect, it } from 'vitest';
import { CharacterAnimator } from './animator';
import { CLIPS, SHOOT_MUZZLE_MS } from './clips';
import { Easing } from './easing';
import { frameCharacter, toStage } from './framing';
import { NEUTRAL } from './pose';
import { solveRig } from './rig';

const seeded = () => {
  let s = 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

const run = (a: CharacterAnimator, ms: number, step = 16) => {
  for (let t = 0; t < ms; t += step) a.update(step);
  return a.getPose();
};

describe('easing', () => {
  it('starts at 0 and ends at 1', () => {
    for (const e of Object.values(Easing)) {
      expect(e(0)).toBeCloseTo(0, 5);
      expect(e(1)).toBeCloseTo(1, 2);
    }
  });
  it('outBack overshoots (anticipation/strike feel)', () => {
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => Easing.outBack(i / 49)))).toBeGreaterThan(1.05);
  });
});

describe('CharacterAnimator', () => {
  it('idles without freezing (breathing changes over time)', () => {
    const a = new CharacterAnimator({ random: seeded() });
    const b1 = run(a, 500).breath;
    const b2 = run(a, 900).breath;
    expect(a.current).toBe('idle');
    expect(b1).not.toBeCloseTo(b2, 3);
  });

  it('shoot: muzzle marker fires exactly once at the strike, then holds aim', () => {
    const a = new CharacterAnimator({ random: seeded() });
    const markers: string[] = [];
    a.onMarker((m) => markers.push(`${m}@${Math.round(a.clipTime)}`));
    a.play('shoot');
    run(a, SHOOT_MUZZLE_MS - 20);
    expect(markers).toEqual([]);
    run(a, 600, 33); // long frames must not skip or repeat markers
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatch(/^muzzle@/);
    expect(a.current).toBe('aimHold');
    expect(a.getPose().armAim).toBeGreaterThan(0.95);
  });

  it('interrupting a clip blends from the current pose (no pop)', () => {
    const a = new CharacterAnimator({ random: seeded() });
    a.play('flinch');
    run(a, 120);
    const before = a.getPose().knock;
    a.play('shoot');
    const after = a.update(16).knock;
    expect(Math.abs(after - before)).toBeLessThan(0.25);
  });

  it('every reaction clip returns to idle with a settled stance', () => {
    for (const name of ['celebrate', 'flinch', 'collect'] as const) {
      const a = new CharacterAnimator({ random: seeded() });
      a.play(name);
      const p = run(a, CLIPS[name].duration + CLIPS.idle.duration + 200);
      expect(a.current).toBe('idle');
      expect(p.knock).toBeCloseTo(0, 2);
      expect(p.bagRaise).toBeCloseTo(0, 2);
      expect(p.flourish).toBe(0);
    }
  });

  it('reduced motion: no idle layer, clips run faster', () => {
    const a = new CharacterAnimator({ random: seeded(), reducedMotion: true });
    expect(run(a, 2000).breath).toBeCloseTo(0, 10);
    a.play('flinch');
    run(a, CLIPS.flinch.duration / 3 + 50);
    expect(a.current).toBe('idle');
  });
});

describe('rig', () => {
  it('aimed arm points the gun along the aim angle', () => {
    for (const angle of [-0.6, 0, 0.5, 1]) {
      const r = solveRig({ ...NEUTRAL, armAim: 1, recoil: 0, aimAngle: angle });
      const shot = Math.atan2(r.gunTip.y - r.shoulderF.y, r.gunTip.x - r.shoulderF.x);
      expect(Math.abs(shot - angle)).toBeLessThan(0.2);
    }
  });
  it('recoil kicks the muzzle upward', () => {
    const calm = solveRig({ ...NEUTRAL, armAim: 1, aimAngle: 0 });
    const kick = solveRig({ ...NEUTRAL, armAim: 1, aimAngle: 0, recoil: 1 });
    expect(kick.gunTip.y).toBeLessThan(calm.gunTip.y);
  });
  it('knock-back moves the body away from the board and keeps feet on the ground', () => {
    const r = solveRig({ ...NEUTRAL, knock: 1 });
    expect(r.hip.x).toBeLessThan(solveRig(NEUTRAL).hip.x);
    expect(r.footF.y).toBe(0);
    expect(r.footB.y).toBe(0);
  });
});

describe('framing', () => {
  it('hidden without a usable slot', () => {
    expect(frameCharacter(null).mode).toBe('hidden');
    expect(frameCharacter({ x: 0, y: 0, w: 0, h: 0 }).mode).toBe('hidden');
  });
  it('full body in a tall slot keeps the hat and boots inside', () => {
    const slot = { x: 10, y: 20, w: 220, h: 520 };
    const f = frameCharacter(slot);
    expect(f.mode).toBe('full');
    if (f.mode === 'hidden') return;
    const hat = toStage(f, { x: 0, y: -236 });
    const boot = toStage(f, { x: 0, y: 0 });
    expect(hat.y).toBeGreaterThanOrEqual(slot.y);
    expect(boot.y).toBeLessThanOrEqual(slot.y + slot.h);
  });
  it('full body keeps the knocked-back stance and the aimed gun inside a narrow slot', () => {
    const slot = { x: 0, y: 0, w: 150, h: 520 };
    const f = frameCharacter(slot);
    if (f.mode === 'hidden') throw new Error('expected a frame');
    const knocked = solveRig({ ...NEUTRAL, knock: 1, lean: -0.32, crouch: 0.5, backArm: 1, coatSway: -14 });
    const tail = toStage(f, { x: knocked.hip.x - 22 - 14, y: -30 });
    const back = toStage(f, knocked.footB);
    expect(Math.min(tail.x, back.x)).toBeGreaterThanOrEqual(slot.x);
    const aimed = solveRig({ ...NEUTRAL, armAim: 1, aimAngle: 0 });
    expect(toStage(f, aimed.gunTip).x).toBeLessThanOrEqual(slot.x + slot.w);
  });
  it('bust framing in a short strip keeps the hat inside', () => {
    const slot = { x: 0, y: 0, w: 340, h: 80 };
    const f = frameCharacter(slot);
    expect(f.mode).toBe('bust');
    if (f.mode === 'hidden') return;
    expect(toStage(f, { x: 0, y: -236 }).y).toBeGreaterThanOrEqual(0);
  });
});
