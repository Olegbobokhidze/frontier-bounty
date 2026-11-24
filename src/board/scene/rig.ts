/**
 * Forward kinematics for the gunslinger. Local space: feet on y = 0, up is −y, facing +x.
 * The character is about 232 units tall (boot to hat crown). Pure, so aim and recoil maths are unit-tested.
 * The off hand blends between authored arm angles (relaxed, shield, purse) and IK reaches
 * (hat brim, brushing the coat), so it can touch things on the body wherever the body has moved.
 */
import { lerp } from './easing';
import type { Pose } from './pose';

export type P = { readonly x: number; readonly y: number };

export type Rig = {
  readonly hip: P;
  readonly neck: P;
  readonly head: P;
  readonly torsoAngle: number;
  readonly headAngle: number;
  readonly shoulderF: P;
  readonly shoulderB: P;
  readonly elbowF: P;
  readonly handF: P;
  readonly elbowB: P;
  readonly handB: P;
  readonly kneeF: P;
  readonly footF: P;
  readonly kneeB: P;
  readonly footB: P;
  readonly gunAngle: number;
  readonly gunTip: P;
  readonly holstered: boolean;
  readonly hat: P;
  readonly hatAngle: number;
  /** Where the money bag is drawn: in the off hand, or in the air during a toss. */
  readonly bag: P;
};

export const LIMB = { upperArm: 30, foreArm: 28, thigh: 52, shin: 50, torso: 70, neck: 20, gun: 26 } as const;

const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const dir = (a: number, len: number): P => ({ x: Math.cos(a) * len, y: Math.sin(a) * len });
/** Unit "up" for a body part leaning by `a` radians toward +x. */
const up = (a: number, len: number): P => ({ x: Math.sin(a) * len, y: -Math.cos(a) * len });
const rot = (p: P, a: number): P => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/** Two-bone IK: middle joint for a root→end chain of lengths a, b, bending toward `bendSign`. */
export function twoBone(root: P, end: P, a: number, b: number, bendSign: number): P {
  const dx = end.x - root.x;
  const dy = end.y - root.y;
  const d = Math.max(0.001, Math.min(Math.hypot(dx, dy), a + b - 0.001));
  const base = Math.atan2(dy, dx);
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const off = Math.acos(Math.max(-1, Math.min(1, cos)));
  return add(root, dir(base - off * bendSign, a));
}

/** Clamp a reach target onto the arm's sphere so IK never over-extends. */
function reach(root: P, target: P, len: number): P {
  const dx = target.x - root.x;
  const dy = target.y - root.y;
  const d = Math.hypot(dx, dy);
  return d <= len ? target : { x: root.x + (dx / d) * len, y: root.y + (dy / d) * len };
}

// Canvas angles (0 = +x, + = clockwise/down).
const REST_UPPER = 1.72;
const REST_FORE = 1.2;

export function solveRig(pose: Pose): Rig {
  const hip: P = { x: pose.hipShift - pose.knock * 22, y: -100 + pose.crouch * 18 - pose.breath * 0.6 };
  const torsoAngle = pose.lean - pose.knock * 0.12;
  const neck = add(hip, up(torsoAngle, LIMB.torso - pose.crouch * 4 + pose.breath * 1.2));
  const headAngle = torsoAngle + pose.headTilt;
  const head = add(neck, up(headAngle, LIMB.neck));
  // Shoulders rise a touch on the in-breath.
  const shoulderF = add(neck, rot({ x: 5, y: 10 - pose.breath * 0.8 }, torsoAngle));
  const shoulderB = add(neck, rot({ x: -9, y: 11 - pose.breath * 0.8 }, torsoAngle));

  // Gun arm: rest (hand at the holster) → aim line, with recoil lifting the forearm more than the upper arm.
  const t = pose.armAim;
  const aimU = pose.aimAngle - pose.recoil * 0.22;
  const aimF = pose.aimAngle - pose.recoil * 0.7;
  const upperA = lerp(REST_UPPER, aimU, t);
  const foreA = lerp(REST_FORE, aimF, t);
  const elbowF = add(shoulderF, dir(upperA, LIMB.upperArm));
  const handF = add(add(elbowF, dir(foreA, LIMB.foreArm)), { x: pose.twitch * 0.5, y: pose.twitch });
  const gunAngle = foreA + (1 - t) * 0.25 + pose.flourish * Math.PI * 2;
  const gunTip = add(handF, rot({ x: LIMB.gun, y: -4 }, gunAngle));

  // Off hand, authored angles: relaxed → shielding the face (flinch) → raising the money bag (collect).
  const relaxed = { u: 1.95, f: 1.65 };
  const shield = { u: -0.75, f: -2.55 };
  const purse = { u: -1.5, f: -1.62 };
  const bu = lerp(lerp(relaxed.u, shield.u, pose.backArm), purse.u, pose.bagRaise);
  const bf = lerp(lerp(relaxed.f, shield.f, pose.backArm), purse.f, pose.bagRaise);
  const fkElbow = add(shoulderB, dir(bu, LIMB.upperArm));
  const fkHand = add(fkElbow, dir(bf, LIMB.foreArm));

  // Off hand, IK reaches: the front of the hat brim, or sweeping down the duster.
  const brimPoint = add(head, rot({ x: 16, y: -13 - pose.hatLift * 10 }, headAngle + pose.hatTip * 0.5));
  const coatPoint = add(hip, rot({ x: 12, y: -34 + pose.brushPhase * 11 }, torsoAngle));
  // Smoothstep the blend: the relaxed arm is nearly straight, where IK is touchy, so ease the reach in.
  const rawW = Math.min(1, pose.brim + pose.brush);
  const ikW = rawW * rawW * (3 - 2 * rawW);
  let elbowB = fkElbow;
  let handB = fkHand;
  if (ikW > 0.001) {
    const ikTarget = pose.brim >= pose.brush ? brimPoint : coatPoint;
    // Swing the hand in an arc about the shoulder (angle + radius), not a straight line through the body:
    // a straight path from hip to hat passes over the shoulder joint and would spin the elbow.
    const a0 = Math.atan2(fkHand.y - shoulderB.y, fkHand.x - shoulderB.x);
    const a1 = Math.atan2(ikTarget.y - shoulderB.y, ikTarget.x - shoulderB.x);
    const da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    const r0 = Math.hypot(fkHand.x - shoulderB.x, fkHand.y - shoulderB.y);
    const r1 = Math.hypot(ikTarget.x - shoulderB.x, ikTarget.y - shoulderB.y);
    const swung = add(shoulderB, dir(a0 + da * ikW, lerp(r0, r1, ikW)));
    const target = reach(shoulderB, swung, LIMB.upperArm + LIMB.foreArm - 0.5);
    // Bend the same way the FK arm bends so the blend in never flips the elbow.
    const cross = (fkElbow.x - shoulderB.x) * (fkHand.y - shoulderB.y) - (fkElbow.y - shoulderB.y) * (fkHand.x - shoulderB.x);
    elbowB = twoBone(shoulderB, target, LIMB.upperArm, LIMB.foreArm, cross > 0 ? 1 : -1);
    handB = target;
  }
  const bag = add(handB, { x: pose.bagToss * 4, y: -pose.bagToss * 46 });

  // Legs: planted feet, the knock-back slides the back foot.
  const footF: P = { x: 20 + hip.x * 0.25 - pose.knock * 4, y: 0 };
  const footB: P = { x: -18 + hip.x * 0.25 - pose.knock * 16, y: 0 };
  const kneeF = twoBone(hip, footF, LIMB.thigh, LIMB.shin, 1);
  const kneeB = twoBone(hip, footB, LIMB.thigh, LIMB.shin, 1);

  const hatAngle = headAngle + pose.hatTip + pose.hatLag - pose.hatLift * 0.35;
  const hat = add(head, up(headAngle + pose.hatTip * 0.5, 13 + pose.hatLift * 18));

  return {
    hip,
    neck,
    head,
    torsoAngle,
    headAngle,
    shoulderF,
    shoulderB,
    elbowF,
    handF,
    elbowB,
    handB,
    kneeF,
    footF,
    kneeB,
    footB,
    gunAngle,
    gunTip,
    holstered: t < 0.08 && pose.flourish === 0,
    hat,
    hatAngle,
    bag,
  };
}

/** Shoulder position used to compute the aim angle toward a target (local space). */
export function shoulderOf(pose: Pose): P {
  return solveRig(pose).shoulderF;
}
