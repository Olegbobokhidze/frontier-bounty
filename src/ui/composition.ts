/**
 * Composition root: the only module that knows every layer (ADR-0001).
 * Swap MockProvider for HttpProvider here to play against a real server (ADR-0005).
 */
import { MockProvider } from '../adapters/mock-provider';
import { randomSeedHex } from '../adapters/fairness';
import { bindSound } from '../audio/bind';
import { FrontierSound } from '../audio/sound';
import { CURRENCY, DEFAULT_PRESET_ID, findPreset, STARTING_PURSE } from '../config/presets';
import { createSystemClock } from '../core/clock';
import { createMoneyFormatter } from '../core/money';
import type { Scene } from '../board/scene/scene';
import { BountyController } from '../engine/bounty/controller';
import { DEFAULT_RULES, type RoundParams } from '../engine/bounty/rules';

export type Holder<T> = { get(): T; set(v: T): void; subscribe(l: () => void): () => void };

export function createHolder<T>(initial: T): Holder<T> {
  let value = initial;
  const ls = new Set<() => void>();
  return {
    get: () => value,
    set: (v) => {
      value = v;
      for (const l of ls) l();
    },
    subscribe: (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
  };
}

export type Game = {
  readonly controller: BountyController;
  readonly provider: MockProvider;
  readonly sound: FrontierSound;
  readonly scene: Holder<Scene | null>;
  readonly formatMoney: (minor: number) => string;
  readonly initialInspectorOpen: boolean;
};

export function createGame(): Game {
  const q = new URLSearchParams(globalThis.location?.search ?? '');
  const preset = findPreset(q.get('preset') ?? DEFAULT_PRESET_ID) ?? findPreset(DEFAULT_PRESET_ID);
  const params: RoundParams = {
    rows: preset?.rows ?? 5,
    cols: preset?.cols ?? 5,
    hazards: preset?.hazards ?? 3,
    bet: 100,
    clientSeed: q.get('clientSeed') ?? `cowpoke-${randomSeedHex(4)}`,
  };
  const provider = new MockProvider({ rules: DEFAULT_RULES, balance: STARTING_PURSE });
  const controller = new BountyController({ provider, clock: createSystemClock(), params, balance: STARTING_PURSE, rules: DEFAULT_RULES });
  const sound = new FrontierSound();
  bindSound(controller, sound);
  return {
    controller,
    provider,
    sound,
    scene: createHolder<Scene | null>(null),
    formatMoney: createMoneyFormatter(CURRENCY),
    initialInspectorOpen: q.get('inspector') === '1',
  };
}
