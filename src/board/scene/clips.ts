/**
 * Authored character clips. Each key eases FROM the previous value of a param TO the key's value,
 * using the key's easing. Timing follows anticipation → strike → follow-through → settle.
 * Faces act too: brows, squint, mouth and tension are keyed alongside the body so every beat reads
 * from the face first (surprise → cringe → grit → grudging smirk).
 */
import { Easing, type Ease } from './easing';
import type { KeyPose } from './pose';

export const ClipName = {
  IDLE: 'idle',
  READY: 'ready',
  SHOOT: 'shoot',
  AIM_HOLD: 'aimHold',
  CELEBRATE: 'celebrate',
  CELEBRATE_BIG: 'celebrateBig',
  ALARM: 'alarm',
  FLINCH: 'flinch',
  RECOVER: 'recover',
  COLLECT: 'collect',
  FIDGET_HAT: 'fidgetHat',
  FIDGET_LOOK: 'fidgetLook',
} as const;
export type ClipName = (typeof ClipName)[keyof typeof ClipName];

export const Marker = {
  MUZZLE: 'muzzle',
  HOLSTER: 'holster',
  STAGGER: 'stagger',
  DUST: 'dust',
  HAT: 'hat',
  COLLECT: 'collect',
  CATCH: 'catch',
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

/** Clips the animator may pick on its own after a quiet spell in idle. */
export const FIDGETS = ['fidgetHat', 'fidgetLook'] as const satisfies readonly ClipName[];

/** The settled stance every reaction returns to. */
const REST: KeyPose = {
  crouch: 0.05,
  lean: 0.02,
  hipShift: 0,
  knock: 0,
  headTilt: 0,
  headTurn: 0.2,
  armAim: 0,
  recoil: 0,
  backArm: 0,
  bagRaise: 0,
  bagToss: 0,
  brim: 0,
  brush: 0,
  hatTip: 0,
  hatLift: 0,
  hammer: 0,
  smirk: 0.15,
  squint: 0.15,
  brow: 0,
  mouth: 0,
  tension: 0,
};

export const CLIPS: Readonly<Record<ClipName, Clip>> = {
  idle: {
    name: 'idle',
    duration: 420,
    keys: [k(420, REST)],
    markers: [],
    next: null,
    idleWeight: 1,
  },
  ready: {
    name: 'ready',
    duration: 420,
    keys: [
      // settle into the gunfighter's crouch: weight down, gun hand hovering, eyes on the claims
      k(150, { crouch: 0.24, lean: 0.12, headTurn: 0.85, squint: 0.45, brow: -0.35, tension: 0.6 }, Easing.outQuad),
      // gun stays holstered: the hand hovers over the grip, fingers working (procedural twitch)
      k(420, { crouch: 0.16, armAim: 0.05, smirk: 0.05, brow: -0.25 }, Easing.outBack),
    ],
    markers: [],
    next: null,
    idleWeight: 0.6,
  },
  shoot: {
    name: 'shoot',
    duration: 460,
    keys: [
      // anticipation: dip, hand back to the holster, thumb on the hammer
      k(80, { crouch: 0.24, lean: -0.05, armAim: 0.1, headTurn: 1, squint: 0.45, brow: -0.6, hammer: 1, tension: 1, mouth: 0 }, Easing.outQuad),
      // strike: snap onto the aim line; any leftover reaction (knock-back, raised hand) resolves across the draw
      k(SHOOT_MUZZLE_MS, { armAim: 1, lean: 0.1, crouch: 0.16, squint: 0.85 }, Easing.outBack),
      k(SHOOT_MUZZLE_MS, { recoil: 0, backArm: 0, bagRaise: 0, bagToss: 0, brim: 0, brush: 0, hatLift: 0, knock: 0, smirk: 0 }, Easing.inOutCubic),
      // fire: hammer falls, recoil kicks the barrel up and the shoulders back
      k(SHOOT_MUZZLE_MS + 4, { hammer: 0 }, Easing.linear),
      k(236, { recoil: 1, lean: 0.02, squint: 1, brow: -0.8 }, Easing.outQuad),
      // follow-through & settle
      k(460, { recoil: 0, lean: 0.08, squint: 0.7, brow: -0.45 }, Easing.outSpring),
    ],
    markers: [{ at: SHOOT_MUZZLE_MS, name: 'muzzle' }],
    next: 'aimHold',
    idleWeight: 0.25,
  },
  aimHold: {
    name: 'aimHold',
    duration: Infinity,
    // breath held, eyes narrowed down the barrel
    keys: [k(220, { armAim: 1, recoil: 0, squint: 0.65, tension: 0.85, brow: -0.4 })],
    markers: [],
    next: null,
    idleWeight: 0.35,
  },
  celebrate: {
    name: 'celebrate',
    duration: 900,
    keys: [
      k(150, { headTilt: 0.2, smirk: 1, squint: 0.25, armAim: 0.75, lean: 0.04, brow: 0.15, tension: 0.1 }, Easing.outQuad), // nod down
      k(320, { headTilt: -0.06, flourish: 0.45 }, Easing.outBack), // chin up, twirl begins
      k(600, { armAim: 0, flourish: 1, hatTip: -0.14 }, Easing.inOutCubic), // twirl into the holster
      k(900, { hatTip: 0, smirk: 0.55, lean: 0.02, headTilt: 0, crouch: 0.05, brow: 0, tension: 0 }, Easing.outSpring),
    ],
    markers: [{ at: 600, name: 'holster' }],
    next: 'idle',
    idleWeight: 0.4,
  },
  celebrateBig: {
    name: 'celebrateBig',
    duration: 1300,
    keys: [
      // a hot streak: chin up, whoop, a double twirl and a tip of the hat to the house
      k(140, { headTilt: -0.12, smirk: 1, mouth: 0.7, brow: 0.6, squint: 0.1, armAim: 0.7, crouch: 0.02, lean: -0.04, tension: 0 }, Easing.outBack),
      k(420, { flourish: 1.2, mouth: 0.15, brim: 0.4 }, Easing.inOutCubic),
      k(700, { armAim: 0, flourish: 2, brim: 1, hatTip: 0.2, headTilt: 0.14, brow: 0.2 }, Easing.inOutCubic),
      k(980, { hatTip: -0.06, brim: 0.6, headTilt: 0 }, Easing.outBack),
      k(1300, { brim: 0, hatTip: 0, smirk: 0.7, mouth: 0, brow: 0, lean: 0.02, crouch: 0.05 }, Easing.outSpring),
    ],
    markers: [{ at: 700, name: 'holster' }],
    next: 'idle',
    idleWeight: 0.35,
  },
  alarm: {
    name: 'alarm',
    duration: 260,
    // the fuse catches: eyes wide, brows up, weight already rocking back before the blast
    keys: [k(90, { brow: 1, squint: 0, mouth: 0.35, smirk: 0, headTilt: -0.08, tension: 1 }, Easing.outQuad), k(260, { lean: -0.12, crouch: 0.2, backArm: 0.3, knock: 0.08 }, Easing.inOutCubic)],
    markers: [],
    next: null,
    idleWeight: 0.1,
  },
  flinch: {
    name: 'flinch',
    duration: 820,
    keys: [
      // strike: thrown back, off-hand up, hat pops, a shout
      k(70, { knock: 1, crouch: 0.5, lean: -0.34, backArm: 1, headTurn: -1, squint: 1, brow: -0.9, armAim: 0.25, recoil: 0, hatLift: 1, smirk: 0, mouth: 1 }, Easing.outQuad),
      // grit through it
      k(240, { knock: 0.84, lean: -0.24, hatLift: 0.7, mouth: 0.3 }, Easing.outCubic),
      // stagger: the hat drops back, a step to stay upright
      k(620, { knock: 0.45, crouch: 0.34, backArm: 0.5, hatLift: 0.08, headTilt: 0.12, headTurn: -0.3 }, Easing.inOutCubic),
      k(820, { knock: 0.36, crouch: 0.3, backArm: 0.25, hatLift: 0, mouth: 0 }, Easing.inOutSine),
    ],
    markers: [{ at: 70, name: 'stagger' }],
    next: 'recover',
    idleWeight: 0.15,
  },
  recover: {
    name: 'recover',
    duration: 1150,
    keys: [
      // look down, beat the dust off the duster
      k(220, { knock: 0.18, backArm: 0, brush: 1, headTilt: 0.24, headTurn: 0.3, squint: 0.5, brow: -0.3 }, Easing.inOutCubic),
      // set the hat back down with a firm tug
      k(560, { brush: 0, brim: 1, hatTip: 0.14, headTilt: 0.04 }, Easing.outBack),
      // a hard look at the board that did it
      k(800, { brim: 0.2, headTurn: 0.85, brow: -0.7, squint: 0.65, smirk: 0, hatTip: 0.04 }, Easing.inOutCubic),
      k(1150, { ...REST, smirk: 0.05, tension: 0.15 }, Easing.outSpring),
    ],
    markers: [
      { at: 220, name: 'dust' },
      { at: 560, name: 'hat' },
    ],
    next: 'idle',
    idleWeight: 0.3,
  },
  collect: {
    name: 'collect',
    duration: 1500,
    keys: [
      k(160, { armAim: 0, crouch: 0.14, recoil: 0, headTurn: 0.5, tension: 0 }, Easing.outQuad), // anticipation
      k(440, { bagRaise: 1, smirk: 1, hatTip: -0.2, lean: -0.08, crouch: 0.02, squint: 0.1, brow: 0.45, mouth: 0.4 }, Easing.outBack), // raise the purse
      k(640, { bagToss: 1, headTilt: -0.12, mouth: 0.1 }, Easing.outQuad), // toss it…
      k(840, { bagToss: 0, headTilt: 0 }, Easing.inQuad), // …and catch
      k(1050, { bagRaise: 0.85, hatTip: -0.14 }, Easing.outSpring),
      k(1500, { bagRaise: 0, hatTip: 0, smirk: 0.5, mouth: 0, brow: 0, lean: 0.02, headTurn: 0.2, crouch: 0.05 }, Easing.inOutCubic),
    ],
    markers: [
      { at: 440, name: 'collect' },
      { at: 840, name: 'catch' },
    ],
    next: 'idle',
    idleWeight: 0.3,
  },
  fidgetHat: {
    name: 'fidgetHat',
    duration: 1500,
    keys: [
      k(380, { brim: 1, headTilt: 0.06 }, Easing.inOutCubic),
      k(560, { hatTip: 0.16, headTilt: 0.1 }, Easing.outBack), // tug the brim down
      k(1050, { brim: 0, hatTip: 0.04, headTilt: 0 }, Easing.inOutCubic),
      k(1500, { hatTip: 0 }, Easing.inOutSine),
    ],
    markers: [],
    next: 'idle',
    idleWeight: 0.7,
  },
  fidgetLook: {
    name: 'fidgetLook',
    duration: 2000,
    keys: [
      // shade the eyes and squint down the street, then back to business
      k(420, { headTurn: -1, brim: 0.75, squint: 0.7, brow: -0.2, lean: -0.03 }, Easing.inOutCubic),
      k(1250, { headTurn: -0.85, headTilt: -0.05 }, Easing.inOutSine),
      k(1650, { headTurn: 0.4, brim: 0, squint: 0.2, brow: 0, headTilt: 0 }, Easing.inOutCubic),
      k(2000, { headTurn: 0.2, lean: 0.02 }, Easing.outSpring),
    ],
    markers: [],
    next: 'idle',
    idleWeight: 0.6,
  },
};
