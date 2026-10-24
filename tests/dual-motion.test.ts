import { describe, expect, it } from 'vitest';
import { detectDualMotion, DUAL_MOTION_DEFAULTS, type DualSample, type DualMotion } from '../src/gestures/dual.ts';

function stroke(fps: number, motion: DualMotion, durationMs = 450, travel = 0.36): DualSample[] {
  const samples: DualSample[] = [];
  const begin = 1000;
  for (let i = 0; i <= Math.ceil(durationMs * fps / 1000); i++) {
    const p = Math.min(i * 1000 / fps / durationMs, 1);
    const t = begin + p * durationMs;
    const open: DualSample = { t, lx: 0.4, ly: 0.4, rx: 0.9, ry: 0.4, lPose: 'open', rPose: 'open', scale: 0.15 };
    if (motion === 'apart') samples.push({ ...open, lx: open.lx - p * travel, rx: open.rx + p * travel });
    else if (motion === 'together') samples.push({ ...open, lx: open.lx + p * travel, rx: open.rx - p * travel });
    else if (motion === 'lift') samples.push({ ...open, ly: open.ly - p * travel, ry: open.ry - p * travel });
    else samples.push({ ...open, ly: open.ly + p * travel, ry: open.ry + p * travel });
  }
  return samples;
}

describe('two-hand motion timing', () => {
  it.each([24, 30, 60])('recognizes each paired stroke at %i FPS', (fps) => {
    for (const motion of ['apart', 'together', 'lift', 'drop'] as const) {
      expect(detectDualMotion(stroke(fps, motion), { ...DUAL_MOTION_DEFAULTS, motion })?.motion).toBe(motion);
    }
  });

  it('honors minimum speed rather than accepting any long, slow separation', () => {
    const slow = stroke(30, 'apart', 1200, 0.18);
    expect(detectDualMotion(slow, { ...DUAL_MOTION_DEFAULTS, motion: 'apart' })).toBeNull();
  });

  it('rejects backtracking that only happens to end at a wide separation', () => {
    const samples = stroke(30, 'apart');
    const middle = samples[Math.floor(samples.length / 2)];
    const reversed = samples.map((sample, index) => index < samples.length / 2
      ? sample
      : { ...sample, lx: middle.lx - (sample.lx - middle.lx), rx: middle.rx - (sample.rx - middle.rx) });
    expect(detectDualMotion(reversed, { ...DUAL_MOTION_DEFAULTS, motion: 'apart' })).toBeNull();
  });
});
