import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react';
import type { MockSettings } from '../../adapters/mock-provider';
import type { SoundState } from '../../audio/sound';
import type { ControllerCue } from '../../engine/bounty/controller';
import type { BountyContext } from '../../engine/bounty/machine';
import type { Game } from '../composition';

export const GameContext = createContext<Game | null>(null);

export function useGame(): Game {
  const g = useContext(GameContext);
  if (!g) throw new Error('useGame outside <GameContext.Provider>');
  return g;
}

export function useRound(): BountyContext {
  const { controller } = useGame();
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

export function useSoundState(): SoundState {
  const { sound } = useGame();
  return useSyncExternalStore(sound.subscribe, sound.getState);
}

export function useMock(): { settings: MockSettings; wallet: number } {
  const { provider } = useGame();
  const version = useSyncExternalStore(
    (l) => provider.subscribe(l),
    () => provider.getVersion(),
  );
  void version;
  return { settings: provider.getSettings(), wallet: provider.getWallet() };
}

export function useCue(handler: (c: ControllerCue) => void): void {
  const { controller } = useGame();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => controller.onCue((c) => ref.current(c)), [controller]);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (l) => {
      const m = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
      m?.addEventListener('change', l);
      return () => m?.removeEventListener('change', l);
    },
    () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
}
