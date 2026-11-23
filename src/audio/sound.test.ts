import { describe, expect, it } from 'vitest';
import { Cue, FrontierSound } from './sound';

describe('FrontierSound', () => {
  it('is a safe no-op without Web Audio', () => {
    const s = new FrontierSound({ audioContext: null });
    expect(s.getState().status).toBe('unavailable');
    expect(() => {
      s.unlock();
      s.play(Cue.BLAST);
      s.setPageVisible(false);
      s.dispose();
    }).not.toThrow();
  });

  it('survives an AudioContext that refuses to start', () => {
    const Refusing = class {
      constructor() {
        throw new Error('NotAllowedError');
      }
    } as unknown as new () => AudioContext;
    const s = new FrontierSound({ audioContext: Refusing });
    expect(() => s.unlock()).not.toThrow();
    expect(s.getState().status).toBe('unavailable');
  });

  it('clamps volume', () => {
    const s = new FrontierSound({ audioContext: null });
    s.setVolume(3);
    expect(s.getState().volume).toBe(1);
  });
});
