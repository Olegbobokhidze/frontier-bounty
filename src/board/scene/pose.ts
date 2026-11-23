/**
 * Gunslinger pose parameters. Keyframed params are authored in clips; procedural params
 * (breath, blink, secondary springs, aim tracking) are layered on by the animator.
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
  /** 0..1 revolver twirl progress (1 = one full turn). */
  readonly flourish: number;
  /** 0 relaxed · 1 off-hand raised to shield the face. */
  readonly backArm: number;
  /** 0..1 money bag raised in the off hand. */
  readonly bagRaise: number;
  /** Extra hat pitch in radians (+ = tip forward). */
  readonly hatTip: number;
  /** 0..1 hat popped up by a blast. */
  readonly hatLift: number;
  readonly smirk: number;
  readonly squint: number;
  // ---- procedural layers (not keyframed)
  readonly breath: number;
  readonly blink: number;
  /** Aim direction in canvas radians (0 = right, + = down). */
  readonly aimAngle: number;
  readonly coatSway: number;
  readonly hatLag: number;
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
  'hatTip',
  'hatLift',
  'smirk',
  'squint',
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
  hatTip: 0,
  hatLift: 0,
  smirk: 0.15,
  squint: 0.15,
  breath: 0,
  blink: 0,
  aimAngle: 0.1,
  coatSway: 0,
  hatLag: 0,
};
