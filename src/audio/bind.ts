import type { BountyController } from '../engine/bounty/controller';
import { RoundState } from '../engine/bounty/machine';
import { Cue, type FrontierSound } from './sound';

/** Audio observes the engine; it never drives it (ADR-0001). */
export function bindSound(controller: BountyController, sound: FrontierSound): () => void {
  // Shot, impact, fuse, clink, blast and cash-out cues are driven by the scene so they land on the
  // animation beats (ui/scene-sound.ts). Only engine-level cues remain here.
  const offTransition = controller.onTransition((r) => {
    if (!r.accepted || r.from === r.to) return;
    if (r.to === RoundState.CONFIGURING) sound.play(Cue.STAKE);
    if (r.to === RoundState.ERROR_RECOVERABLE) sound.play(Cue.ERROR);
  });
  return offTransition;
}
