import { describe, expect, it } from 'vitest';
import { CharacterAnimator, FIDGET_AFTER_MS } from './animator';
import { CLIPS, SHOOT_MUZZLE_MS, type ClipName } from './clips';
import { Easing } from './easing';
import { frameCharacter, toStage } from './framing';
import { NEUTRAL } from './pose';
import { LIMB, solveRig } from './rig';

const seeded = () => {
  let s = 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

/** Total length of a clip and the clips it chains into, up to (not including) idle. */
const chainMs = (name: ClipName): number => {
  let ms = 0;
  for (let c: ClipName | null = name; c && c !== 'idle'; c = CLIPS[c].next) ms += CLIPS[c].duration;
  return ms;
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
    for (const name of ['celebrate', 'celebrateBig', 'flinch', 'recover', 'collect', 'fidgetHat', 'fidgetLook'] as const) {
      const a = new CharacterAnimator({ random: seeded() });
      a.play(name);
      const p = run(a, chainMs(name) + CLIPS.idle.duration + 200);
      expect(a.current, name).toBe('idle');
      expect(p.knock).toBeCloseTo(0, 2);
      expect(p.bagRaise).toBeCloseTo(0, 2);
      expect(p.bagToss).toBeCloseTo(0, 2);
      expect(p.brim).toBeCloseTo(0, 2);
      expect(p.brush).toBeCloseTo(0, 2);
      expect(p.hatLift).toBeCloseTo(0, 2);
      expect(p.mouth).toBeCloseTo(0, 2);
      expect(p.flourish).toBe(0);
    }
  });

  it('reduced motion: no idle layer, clips run faster', () => {
    const a = new CharacterAnimator({ random: seeded(), reducedMotion: true });
    expect(run(a, 2000).breath).toBeCloseTo(0, 10);
    a.play('flinch');
    run(a, chainMs('flinch') / 3 + 50);
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

describe('CharacterAnimator: performance layer', () => {
  it('flinch chains into recover (dust-off, hat back on) before idle', () => {
    const a = new CharacterAnimator({ random: seeded() });
    const markers: string[] = [];
    a.onMarker((m) => markers.push(m));
    a.play('flinch');
    run(a, CLIPS.flinch.duration + 30);
    expect(a.current).toBe('recover');
    run(a, CLIPS.recover.duration + 30);
    expect(markers).toEqual(['stagger', 'dust', 'hat']);
    expect(a.current).toBe('idle');
  });

  it('collect tosses the purse and catches it again', () => {
    const a = new CharacterAnimator({ random: seeded() });
    const markers: string[] = [];
    a.onMarker((m) => markers.push(m));
    a.play('collect');
    const toss = run(a, 640).bagToss;
    expect(toss).toBeGreaterThan(0.9);
    run(a, 400);
    expect(markers).toEqual(['collect', 'catch']);
  });

  it('gaze turns the head and eyes toward a target, then lets go', () => {
    const a = new CharacterAnimator({ random: seeded() });
    a.setGaze(0.4);
    const looking = run(a, 600);
    expect(a.gazeWeight).toBeGreaterThan(0.95);
    expect(looking.headTurn).toBeGreaterThan(0.85);
    expect(looking.eyeX).toBeGreaterThan(0.7);
    expect(looking.eyeY).toBeGreaterThan(0.3);
    a.setGaze(null);
    run(a, 900);
    expect(a.gazeWeight).toBeLessThan(0.05);
  });

  it('a blast overrides the gaze: the head is thrown away from the board', () => {
    const a = new CharacterAnimator({ random: seeded() });
    a.setGaze(0.3);
    run(a, 500);
    a.play('flinch');
    expect(run(a, 90).headTurn).toBeLessThan(-0.6);
  });

  it('breath is shallower on the aim line than at ease', () => {
    const swing = (clip: 'idle' | 'aimHold') => {
      const a = new CharacterAnimator({ random: seeded() });
      a.play(clip);
      run(a, 600);
      let max = 0;
      for (let t = 0; t < 4000; t += 16) max = Math.max(max, Math.abs(a.update(16).breath));
      return max;
    };
    expect(swing('aimHold')).toBeLessThan(swing('idle') * 0.25);
  });

  it('the gun hand twitches over the holster in the ready crouch, and is still at ease', () => {
    const peak = (clip: 'idle' | 'ready') => {
      const a = new CharacterAnimator({ random: seeded() });
      a.play(clip);
      run(a, 500);
      let max = 0;
      for (let t = 0; t < 3000; t += 16) max = Math.max(max, Math.abs(a.update(16).twitch));
      return max;
    };
    expect(peak('ready')).toBeGreaterThan(0.2);
    expect(peak('idle')).toBe(0);
  });

  it('hit-stop freezes the pose for the held frames, then resumes', () => {
    const a = new CharacterAnimator({ random: seeded() });
    a.play('flinch');
    a.hold(70);
    const frozen = a.getPose();
    run(a, 48);
    expect(a.getPose()).toBe(frozen);
    run(a, 80);
    expect(a.getPose().knock).toBeGreaterThan(frozen.knock);
  });

  it('fidgets after a quiet spell in idle, but not while a claim is being targeted', () => {
    const quiet = new CharacterAnimator({ random: seeded() });
    const seen = new Set<string>();
    for (let t = 0; t < FIDGET_AFTER_MS * 4; t += 32) {
      quiet.update(32);
      seen.add(quiet.current);
    }
    expect([...seen].some((c) => c.startsWith('fidget'))).toBe(true);

    const watching = new CharacterAnimator({ random: seeded() });
    watching.setGaze(0.2);
    const clips = new Set<string>();
    for (let t = 0; t < 30000; t += 32) {
      watching.update(32);
      clips.add(watching.current);
    }
    expect([...clips]).toEqual(['idle']);
  });

  it('an interrupted twirl resolves to a whole turn instead of freezing the gun mid-spin', () => {
    const a = new CharacterAnimator({ random: seeded() });
    a.play('celebrateBig');
    const mid = run(a, 300).flourish;
    expect(mid % 1).toBeGreaterThan(0.05);
    a.play('shoot');
    const f = run(a, 200).flourish;
    expect(Math.min(f % 1, 1 - (f % 1))).toBeLessThan(0.01);
  });

  it('reduced motion: no gaze, no fidgets, no hit-stop', () => {
    const a = new CharacterAnimator({ random: seeded(), reducedMotion: true });
    a.setGaze(0.4);
    run(a, 600);
    expect(a.gazeWeight).toBe(0);
    a.play('flinch');
    a.hold(70);
    const before = a.getPose();
    run(a, 32);
    expect(a.getPose()).not.toBe(before);
  });
});

describe('rig: off-hand reaches', () => {
  const arm = LIMB.upperArm + LIMB.foreArm;
  it('brim: the off hand reaches the hat brim', () => {
    const r = solveRig({ ...NEUTRAL, brim: 1 });
    expect(Math.hypot(r.handB.x - r.head.x, r.handB.y - r.head.y)).toBeLessThan(26);
    expect(r.handB.y).toBeLessThan(r.head.y);
  });
  it('brush: the off hand sweeps the front of the coat', () => {
    const lo = solveRig({ ...NEUTRAL, brush: 1, brushPhase: -1 });
    const hi = solveRig({ ...NEUTRAL, brush: 1, brushPhase: 1 });
    expect(Math.abs(lo.handB.y - hi.handB.y)).toBeGreaterThan(12);
    expect(lo.handB.x).toBeGreaterThan(lo.hip.x);
  });
  it('IK never over-extends the arm, whatever the pose', () => {
    for (const p of [{ brim: 1, knock: 1, hatLift: 1 }, { brush: 1, crouch: 0.5 }, { brim: 0.5, backArm: 1 }]) {
      const r = solveRig({ ...NEUTRAL, ...p });
      expect(Math.hypot(r.handB.x - r.shoulderB.x, r.handB.y - r.shoulderB.y)).toBeLessThanOrEqual(arm + 0.01);
      expect(Math.hypot(r.elbowB.x - r.shoulderB.x, r.elbowB.y - r.shoulderB.y)).toBeCloseTo(LIMB.upperArm, 3);
    }
  });
  it('blending into a reach is continuous: no elbow flip, no pop as the IK takes over', () => {
    for (const key of ['brim', 'brush'] as const) {
      let prev = solveRig(NEUTRAL).elbowB;
      for (let w = 0.01; w <= 1.0001; w += 0.01) {
        const e = solveRig({ ...NEUTRAL, [key]: w }).elbowB;
        // ~100 units of travel over the blend → ≤ ~2.6 per 1% at smoothstep's peak; a flip would jump 20+.
        expect(Math.hypot(e.x - prev.x, e.y - prev.y), `${key} @ ${w.toFixed(2)}`).toBeLessThan(4);
        prev = e;
      }
    }
  });
  it('the tossed purse rises above the hand', () => {
    const r = solveRig({ ...NEUTRAL, bagRaise: 1, bagToss: 1 });
    expect(r.bag.y).toBeLessThan(r.handB.y - 30);
  });
});
