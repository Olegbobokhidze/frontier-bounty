import type { FrontierSound } from '../audio/sound';
import { Cue } from '../audio/sound';
import type { Scene } from '../board/scene/scene';

/**
 * Scene beats → audio (ADR-0006). Lives in ui/ because only the composition layer may know both
 * board and audio. FrontierSound already respects mute and is a no-op without Web Audio.
 */
export function bindSceneSound(scene: Scene, sound: FrontierSound): () => void {
  let streak = 0;
  return scene.onEvent((e) => {
    switch (e.type) {
      case 'shot':
        sound.play(Cue.SHOT);
        break;
      case 'impact':
        sound.play(Cue.PICK); // bullet into a wooden lid
        break;
      case 'safe':
        sound.play(Cue.SAFE, { pitch: 1 + Math.min(++streak, 12) * 0.02 });
        break;
      case 'fuse':
        sound.play(Cue.FUSE);
        break;
      case 'boom':
        streak = 0;
        sound.play(Cue.BLAST);
        break;
      case 'holster':
        sound.play(Cue.HOLSTER);
        break;
      case 'collect':
        streak = 0;
        sound.play(Cue.CASHOUT);
        break;
    }
  });
}
