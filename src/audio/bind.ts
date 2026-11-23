import type { BountyController } from '../engine/bounty/controller';
import { RoundState } from '../engine/bounty/machine';
import { Cue, type FrontierSound } from './sound';

/** Audio observes the engine; it never drives it (ADR-0001). */
export function bindSound(controller: BountyController, sound: FrontierSound): () => void {
  const offCue = controller.onCue((c) => {
    if (c.type === 'revealed') sound.play(c.outcome === 'safe' ? Cue.SAFE : Cue.FUSE, { pitch: 1 + Math.min(controller.getSnapshot().round?.picks.length ?? 0, 12) * 0.02 });
    if (c.type === 'roundOver' && c.outcome === 'bust') sound.play(Cue.BLAST);
    if (c.type === 'roundOver' && c.outcome === 'win') sound.play(Cue.CASHOUT);
  });
  const offTransition = controller.onTransition((r) => {
    if (!r.accepted || r.from === r.to) return;
    if (r.to === RoundState.CONFIGURING) sound.play(Cue.STAKE);
    if (r.to === RoundState.REVEALING_STEP) sound.play(Cue.PICK);
    if (r.to === RoundState.ERROR_RECOVERABLE) sound.play(Cue.ERROR);
  });
  return () => {
    offCue();
    offTransition();
  };
}
