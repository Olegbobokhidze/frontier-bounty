/**
 * Game-mode registry (ADR-0002). Each spatial mode plugs into the shared machine runner,
 * spatial maths, provider plumbing, audio and inspector.
 */
export const ModeStatus = { LIVE: 'live', PLANNED: 'planned' } as const;
export type ModeStatus = (typeof ModeStatus)[keyof typeof ModeStatus];

export type GameMode = {
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly status: ModeStatus;
  /** Folders that implement the mode (for docs and the inspector). */
  readonly modules: readonly string[];
};

export const GAME_MODES: readonly GameMode[] = [
  {
    id: 'bounty',
    title: 'Dynamite & Bounty',
    tagline: 'Pick claims, dodge the dynamite, cash out before it blows.',
    status: ModeStatus.LIVE,
    modules: ['src/engine/bounty', 'src/board'],
  },
  {
    id: 'plinko',
    title: 'Frontier Plinko',
    tagline: 'Drop gold through a peg board. Several projectiles, seeded paths.',
    status: ModeStatus.PLANNED,
    modules: ['src/engine/plinko (planned)', 'src/board/plinko (planned)'],
  },
];
