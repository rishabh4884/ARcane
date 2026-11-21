import { describe, expect, it, vi } from 'vitest';
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

describe('creature sound identities', () => {
  it('gives each projectile a distinct, bounded synthesis score with its event pan', () => {
    const audio = new AudioEngine();
    const internals = audio as unknown as {ctx: {state:string}; tone: (o: Record<string, unknown>) => void; noise: (o: Record<string, unknown>) => void};
    internals.ctx = {state:'running'};
    const tone = vi.spyOn(internals, 'tone').mockImplementation(() => {}), noise = vi.spyOn(internals, 'noise').mockImplementation(() => {});
    const scores: string[] = [];
    for (const style of ['moth','lantern','boulder','bile','cold','pale','star','wisp','ember']) {
      tone.mockClear(); noise.mockClear();
      audio.handle({type:'projectile', position:new THREE.Vector3(), pan:-0.4, style});
      const calls = [...tone.mock.calls, ...noise.mock.calls];
      expect(calls.length).toBeGreaterThan(0); expect(calls.length).toBeLessThanOrEqual(4);
      for (const [o] of calls) { expect(o.pan).toBe(-0.4); expect(Number(o.gain)).toBeLessThanOrEqual(0.25); }
      scores.push(JSON.stringify([tone.mock.calls, noise.mock.calls]));
    }
    expect(new Set(scores).size).toBe(9);
    vi.restoreAllMocks();
  });
});
