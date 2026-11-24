/**
 * Gunslinger pose parameters. Keyframed params are authored in clips; procedural params
 * (breath, blink, gaze, secondary springs, aim tracking) are layered on by the animator.
 */
export type Pose = {
  /** 0..1 knee bend / body lowered. */
  readonly crouch: number;
  /** Torso lean in radians, + = toward the board. */
  readonly lean: number;
  /** Weight shift of the hips (local units), + = forward. */
  readonly hipShift: number;
  /** 0..1 knock-back from a blast. */
  readonly knock: number;
  /** Head pitch in radians, + = chin down (nod). */
  readonly headTilt: number;
  /** -1 look away · 0 neutral · +1 look at the target. */
  readonly headTurn: number;
  /** 0 holstered/at side · 1 arm fully extended on the aim line. */
  readonly armAim: number;
  /** 0..1 recoil kick. */
  readonly recoil: number;
  /** Revolver twirl progress in turns (1 = one full turn). */
  readonly flourish: number;
  /** 0 relaxed · 1 off-hand raised to shield the face. */
  readonly backArm: number;
  /** 0..1 money bag raised in the off hand. */
  readonly bagRaise: number;
  /** 0..1 bag tossed up out of the hand (caught again at 0). */
  readonly bagToss: number;
  /** 0..1 off hand at the hat brim (tip, tug, shade the eyes). */
  readonly brim: number;
  /** 0..1 off hand brushing dust off the coat. */
  readonly brush: number;
  /** Extra hat pitch in radians (+ = tip forward). */
  readonly hatTip: number;
  /** 0..1 hat popped up by a blast. */
  readonly hatLift: number;
  /** 0..1 revolver hammer cocked. */
  readonly hammer: number;
  readonly smirk: number;
  readonly squint: number;
  /** −1 furrowed · 0 neutral · +1 raised (surprise). */
  readonly brow: number;
  /** 0..1 mouth open (shout, whoop). */
  readonly mouth: number;
  /** 0 relaxed · 1 coiled: faster, shallower breathing, a twitchy trigger hand. */
  readonly tension: number;
  // ---- procedural layers (not keyframed)
  readonly breath: number;
  readonly blink: number;
  /** Eye direction, −1..1 on each axis (+x toward the board, +y down). */
  readonly eyeX: number;
  readonly eyeY: number;
  /** Aim direction in canvas radians (0 = right, + = down). */
  readonly aimAngle: number;
  readonly coatSway: number;
  readonly hatLag: number;
  /** −1..1 oscillation used while brushing the coat. */
  readonly brushPhase: number;
  /** Small trigger-hand jitter (local units) while tense and undrawn. */
  readonly twitch: number;
};

export const KEYED_PARAMS = [
  'crouch',
  'lean',
  'hipShift',
  'knock',
  'headTilt',
  'headTurn',
  'armAim',
  'recoil',
  'flourish',
  'backArm',
  'bagRaise',
  'bagToss',
  'brim',
  'brush',
  'hatTip',
  'hatLift',
  'hammer',
  'smirk',
  'squint',
  'brow',
  'mouth',
  'tension',
] as const satisfies readonly (keyof Pose)[];
export type KeyedParam = (typeof KEYED_PARAMS)[number];
export type KeyPose = Partial<Record<KeyedParam, number>>;

export const NEUTRAL: Pose = {
  crouch: 0.05,
  lean: 0.02,
  hipShift: 0,
  knock: 0,
  headTilt: 0,
  headTurn: 0.2,
  armAim: 0,
  recoil: 0,
  flourish: 0,
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
  breath: 0,
  blink: 0,
  eyeX: 0,
  eyeY: 0,
  aimAngle: 0.1,
  coatSway: 0,
  hatLag: 0,
  brushPhase: 0,
  twitch: 0,
};
