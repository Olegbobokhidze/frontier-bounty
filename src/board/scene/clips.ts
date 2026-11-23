/**
 * Authored character clips. Each key eases FROM the previous value of a param TO the key's value,
 * using the key's easing. Timing follows anticipation → strike → follow-through → settle.
 */
import { Easing, type Ease } from './easing';
import type { KeyPose } from './pose';

export const ClipName = {
  IDLE: 'idle',
  READY: 'ready',
  SHOOT: 'shoot',
  AIM_HOLD: 'aimHold',
  CELEBRATE: 'celebrate',
  FLINCH: 'flinch',
  COLLECT: 'collect',
} as const;
export type ClipName = (typeof ClipName)[keyof typeof ClipName];

export const Marker = {
  MUZZLE: 'muzzle',
  HOLSTER: 'holster',
  STAGGER: 'stagger',
  COLLECT: 'collect',
} as const;
export type Marker = (typeof Marker)[keyof typeof Marker];

export type Key = { readonly at: number; readonly pose: KeyPose; readonly ease: Ease };

export type Clip = {
  readonly name: ClipName;
  /** ms; Infinity = hold the last pose until another clip plays. */
  readonly duration: number;
  readonly keys: readonly Key[];
  readonly markers: readonly { readonly at: number; readonly name: Marker }[];
  readonly next: ClipName | null;
  /** How much of the idle layer (breathing, weight shift, micro-looks) plays on top (0..1). */
  readonly idleWeight: number;
};

const k = (at: number, pose: KeyPose, ease: Ease = Easing.inOutCubic): Key => ({ at, pose, ease });

/** Time from the start of SHOOT to the muzzle flash. */
export const SHOOT_MUZZLE_MS = 190;

export const CLIPS: Readonly<Record<ClipName, Clip>> = {
  idle: {
    name: 'idle',
    duration: 420,
    keys: [
      k(420, { crouch: 0.05, lean: 0.02, hipShift: 0, knock: 0, headTilt: 0, headTurn: 0.2, armAim: 0, recoil: 0, backArm: 0, bagRaise: 0, hatTip: 0, hatLift: 0, smirk: 0.15, squint: 0.15 }),
    ],
    markers: [],
    next: null,
    idleWeight: 1,
  },
  ready: {
    name: 'ready',
    duration: 360,
    keys: [k(140, { crouch: 0.22, lean: 0.1, headTurn: 0.8, squint: 0.45 }, Easing.outQuad), k(360, { crouch: 0.16, armAim: 0.12, smirk: 0.05 }, Easing.outBack)],
    markers: [],
    next: null,
    idleWeight: 0.6,
  },
  shoot: {
    name: 'shoot',
    duration: 440,
    keys: [
      // anticipation: dip, draw the hand back toward the holster
      k(80, { crouch: 0.24, lean: -0.05, armAim: 0.1, headTurn: 1, squint: 0.4 }, Easing.outQuad),
      // strike: snap onto the aim line; any leftover reaction (knock-back, raised hand) resolves across the draw
      k(SHOOT_MUZZLE_MS, { armAim: 1, lean: 0.1, crouch: 0.16, squint: 0.8 }, Easing.outBack),
      k(SHOOT_MUZZLE_MS, { recoil: 0, backArm: 0, bagRaise: 0, hatLift: 0, knock: 0 }, Easing.inOutCubic),
      // fire: recoil kick
      k(232, { recoil: 1, lean: 0.03 }, Easing.outQuad),
      // follow-through & settle
      k(440, { recoil: 0, lean: 0.08 }, Easing.outSpring),
    ],
    markers: [{ at: SHOOT_MUZZLE_MS, name: 'muzzle' }],
    next: 'aimHold',
    idleWeight: 0.25,
  },
  aimHold: {
    name: 'aimHold',
    duration: Infinity,
    keys: [k(200, { armAim: 1, recoil: 0, squint: 0.65 })],
    markers: [],
    next: null,
    idleWeight: 0.35,
  },
  celebrate: {
    name: 'celebrate',
    duration: 900,
    keys: [
      k(150, { headTilt: 0.2, smirk: 1, squint: 0.25, armAim: 0.75, lean: 0.04 }, Easing.outQuad), // nod down
      k(320, { headTilt: -0.06, flourish: 0.45 }, Easing.outBack), // chin up, twirl begins
      k(600, { armAim: 0, flourish: 1, hatTip: -0.14 }, Easing.inOutCubic), // twirl into the holster
      k(900, { hatTip: 0, smirk: 0.55, lean: 0.02, headTilt: 0, crouch: 0.05 }, Easing.outSpring),
    ],
    markers: [{ at: 600, name: 'holster' }],
    next: 'idle',
    idleWeight: 0.4,
  },
  flinch: {
    name: 'flinch',
    duration: 1300,
    keys: [
      // strike: thrown back, off-hand up, hat pops
      k(90, { knock: 1, crouch: 0.5, lean: -0.32, backArm: 1, headTurn: -1, squint: 1, armAim: 0.25, recoil: 0, hatLift: 1, smirk: 0 }, Easing.outQuad),
      k(260, { knock: 0.82, lean: -0.22, hatLift: 0.55 }, Easing.outCubic),
      // stagger & recover
      k(720, { knock: 0.32, crouch: 0.32, backArm: 0.45, hatLift: 0, headTilt: 0.12 }, Easing.inOutCubic),
      k(980, { headTilt: -0.1, headTurn: 0.3 }, Easing.inOutSine), // shake it off
      k(1300, { knock: 0, crouch: 0.06, backArm: 0, headTurn: 0.2, headTilt: 0, squint: 0.3, lean: 0.02, armAim: 0 }, Easing.outSpring),
    ],
    markers: [{ at: 90, name: 'stagger' }],
    next: 'idle',
    idleWeight: 0.15,
  },
  collect: {
    name: 'collect',
    duration: 1400,
    keys: [
      k(160, { armAim: 0, crouch: 0.14, recoil: 0, headTurn: 0.5 }, Easing.outQuad), // anticipation
      k(440, { bagRaise: 1, smirk: 1, hatTip: -0.2, lean: -0.08, crouch: 0.02, squint: 0.1 }, Easing.outBack), // raise the purse
      k(950, { bagRaise: 0.9, hatTip: -0.16 }, Easing.inOutSine),
      k(1400, { bagRaise: 0, hatTip: 0, smirk: 0.5, lean: 0.02, headTurn: 0.2, crouch: 0.05 }, Easing.inOutCubic),
    ],
    markers: [{ at: 440, name: 'collect' }],
    next: 'idle',
    idleWeight: 0.3,
  },
};
