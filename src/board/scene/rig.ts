/**
 * Forward kinematics for the gunslinger. Local space: feet on y = 0, up is −y, facing +x.
 * The character is about 232 units tall (boot to hat crown). Pure, so aim and recoil maths are unit-tested.
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
};

export const LIMB = { upperArm: 30, foreArm: 28, thigh: 52, shin: 50, torso: 70, neck: 20, gun: 26 } as const;

const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y });
const dir = (a: number, len: number): P => ({ x: Math.cos(a) * len, y: Math.sin(a) * len });
/** Unit "up" for a body part leaning by `a` radians toward +x. */
const up = (a: number, len: number): P => ({ x: Math.sin(a) * len, y: -Math.cos(a) * len });
const rot = (p: P, a: number): P => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) });

/** Two-bone IK: knee position for a hip→foot chain bending toward `bendSign` (+1 = knee forward). */
function knee(hip: P, foot: P, a: number, b: number, bendSign: number): P {
  const dx = foot.x - hip.x;
  const dy = foot.y - hip.y;
  const d = Math.min(Math.hypot(dx, dy), a + b - 0.001);
  const base = Math.atan2(dy, dx);
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const off = Math.acos(Math.max(-1, Math.min(1, cos)));
  return add(hip, dir(base - off * bendSign, a));
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
  const shoulderF = add(neck, rot({ x: 5, y: 10 }, torsoAngle));
  const shoulderB = add(neck, rot({ x: -9, y: 11 }, torsoAngle));

  // Gun arm: rest (hand at the holster) → aim line, with recoil lifting the forearm more than the upper arm.
  const t = pose.armAim;
  const aimU = pose.aimAngle - pose.recoil * 0.22;
  const aimF = pose.aimAngle - pose.recoil * 0.7;
  const upperA = lerp(REST_UPPER, aimU, t);
  const foreA = lerp(REST_FORE, aimF, t);
  const elbowF = add(shoulderF, dir(upperA, LIMB.upperArm));
  const handF = add(elbowF, dir(foreA, LIMB.foreArm));
  const gunAngle = foreA + (1 - t) * 0.25 + pose.flourish * Math.PI * 2;
  const gunTip = add(handF, rot({ x: LIMB.gun, y: -4 }, gunAngle));

  // Off hand: relaxed → shielding the face (flinch) → raising the money bag (collect).
  const relaxed = { u: 1.95, f: 1.65 };
  const shield = { u: -0.75, f: -2.55 };
  const bag = { u: -1.5, f: -1.62 };
  const bu = lerp(lerp(relaxed.u, shield.u, pose.backArm), bag.u, pose.bagRaise);
  const bf = lerp(lerp(relaxed.f, shield.f, pose.backArm), bag.f, pose.bagRaise);
  const elbowB = add(shoulderB, dir(bu, LIMB.upperArm));
  const handB = add(elbowB, dir(bf, LIMB.foreArm));

  // Legs: planted feet, the knock-back slides the back foot.
  const footF: P = { x: 20 + hip.x * 0.25 - pose.knock * 4, y: 0 };
  const footB: P = { x: -18 + hip.x * 0.25 - pose.knock * 16, y: 0 };
  const kneeF = knee(hip, footF, LIMB.thigh, LIMB.shin, 1);
  const kneeB = knee(hip, footB, LIMB.thigh, LIMB.shin, 1);

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
  };
}

/** Shoulder position used to compute the aim angle toward a target (local space). */
export function shoulderOf(pose: Pose): P {
  return solveRig(pose).shoulderF;
}
