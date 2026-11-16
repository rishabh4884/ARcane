import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AudioEngine } from '../src/audio/AudioEngine.ts';

describe('AudioEngine without a browser audio context', () => {
  it('stays inert and never throws before (or without) unlocking', () => {
    const audio = new AudioEngine();
    expect(audio.unlocked).toBe(false);
    expect(() => {
      audio.handle({ type: 'cast', effect: 'lightning', position: new THREE.Vector3(), pan: 0 });
      audio.handle({ type: 'player-hurt', amount: 12 });
      audio.setCharge('left', 0.5);
      audio.setBowDraw(0.4);
      audio.setBowDraw(null);
    }).not.toThrow();
  });

  it('clamps volume and toggles mute', () => {
    const audio = new AudioEngine();
    audio.setVolume(3);
    expect(audio.volume).toBe(1);
    const before = audio.muted;
    audio.toggleMuted();
    expect(audio.muted).toBe(!before);
  });
});
