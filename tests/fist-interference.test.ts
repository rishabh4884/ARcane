import { describe, expect, it } from 'vitest';
import { GESTURES } from '../src/config/gestures.ts';
import { DEFAULT_TUNING } from '../src/config/tuning.ts';
import { fingerExtensions } from '../src/gestures/features.ts';
import { GestureEngine } from '../src/gestures/GestureEngine.ts';
import { HandsEngine } from '../src/gestures/HandsEngine.ts';
import { classifyPose, FingerStateTracker } from '../src/gestures/poses.ts';
import type { HandFrame, Vec3 } from '../src/tracking/types.ts';
import { ASPECT, makeHand, POSES } from './helpers/synth.ts';

/** A flat hand with a bent wrist: all fingers are straight, perpendicular to the palm. */
function horizontalPalm(x: number, y: number, depthCompression = 1): Vec3[] {
  const points = makeHand(x, y, POSES.open);
  for (const base of [5, 9, 13, 17]) {
    for (let j = 1; j <= 3; j++) {
      const reach = points[base].y - points[base + j].y;
      points[base + j] = {
        x: points[base].x,
        y: points[base].y - reach * Math.cos(Math.PI * 0.48),
        z: reach * Math.sin(Math.PI * 0.48) * depthCompression,
      };
    }
  }
  return points;
}

describe('fist interference with horizontal palms', () => {
  it.each([1, 0.3])('keeps a flat, wrist-bent hand open with depth scale %f', (depthScale) => {
    const fingers = new FingerStateTracker(DEFAULT_TUNING.fingers.on, DEFAULT_TUNING.fingers.off);
    expect(classifyPose(fingers.update(fingerExtensions(horizontalPalm(0.5, 0.5, depthScale))))).toBe('open');
  });

  it.each([24, 30, 60])('does not cast a fist while horizontal open hands prepare and perform Cataclysm at %i fps', (fps) => {
    const engine = new HandsEngine(GESTURES.filter((g) => ['fist', 'cataclysm'].includes(g.id)), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    const step = (y: number) => {
      now += 1000 / fps;
      const frames: HandFrame[] = [0.4, 1].map((x) => ({
        time: now, aspect: ASPECT, confidence: 1, landmarks: horizontalPalm(x, y),
      }));
      fired.push(...engine.process(frames, now).fired.map((f) => f.gestureId));
    };
    for (let t = 0; t < 1000; t += 1000 / fps) step(0.2);
    for (let t = 1000 / fps; t < 200 + 1000 / fps; t += 1000 / fps) step(0.2 + Math.min(t / 200, 1) * 0.32);
    expect(fired).toEqual(['cataclysm']);
  });

  it('does not cast a fist from collapsed, unmeasurable finger landmarks', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'fist'), DEFAULT_TUNING);
    const points = makeHand(0.5, 0.5, POSES.open);
    for (const base of [5, 9, 13, 17]) {
      for (let j = 1; j <= 3; j++) points[base + j] = { ...points[base] };
    }
    const fired: string[] = [];
    for (let i = 0; i < 40; i++) {
      const time = 1000 + i * 1000 / 30;
      const out = engine.process({ time, aspect: ASPECT, confidence: 1, landmarks: points }, time);
      expect(out.pose).toBe('unknown');
      fired.push(...out.fired.map((f) => f.gestureId));
    }
    expect(fired).toEqual([]);
  });

  it('does not classify borderline folded fingers as a confident fist', () => {
    const points = makeHand(0.5, 0.5, POSES.open);
    for (const base of [5, 9, 13, 17]) {
      const lengths = [0.4, 0.22, 0.18];
      for (let j = 0; j < 3; j++) {
        const angle = (j === 0 ? 0 : 55) * Math.PI / 180;
        const previous = points[base + j];
        points[base + j + 1] = {
          x: previous.x,
          y: previous.y - Math.cos(angle) * lengths[j] * 0.15,
          z: previous.z + Math.sin(angle) * lengths[j] * 0.15,
        };
      }
    }
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'fist'), DEFAULT_TUNING);
    for (let i = 0; i < 40; i++) {
      const time = 1000 + i * 1000 / 30;
      const out = engine.process({ time, aspect: ASPECT, confidence: 1, landmarks: points }, time);
      expect(out.pose).toBe('unknown');
      expect(out.fired).toEqual([]);
    }
  });

  it.each([80, 90, 100])('recognises straight fingers angled %i degrees from the palm as open', (degrees) => {
    const points = makeHand(0.5, 0.5, POSES.open);
    for (const base of [5, 9, 13, 17]) {
      for (let j = 1; j <= 3; j++) {
        const reach = points[base].y - points[base + j].y;
        const angle = degrees * Math.PI / 180;
        points[base + j] = { x: points[base].x, y: points[base].y - reach * Math.cos(angle), z: reach * Math.sin(angle) };
      }
    }
    for (const rotation of [0, Math.PI / 2, Math.PI]) {
      const rotated = points.map((p) => ({
        x: p.x * Math.cos(rotation) - p.y * Math.sin(rotation),
        y: p.x * Math.sin(rotation) + p.y * Math.cos(rotation),
        z: p.z,
      }));
      const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'fist'), DEFAULT_TUNING);
      const out = engine.process({ time: 1000, aspect: ASPECT, confidence: 1, landmarks: rotated }, 1000);
      expect(out.pose).toBe('open');
    }
  });

  it('does not let one unmeasurable finger turn into a fist during a held sign', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'fist'), DEFAULT_TUNING);
    for (let i = 0; i < 40; i++) {
      const points = makeHand(0.5, 0.5, POSES.fist);
      for (let j = 1; j <= 3; j++) points[5 + j] = { ...points[5] };
      const time = 1000 + i * 1000 / 30;
      const out = engine.process({ time, aspect: ASPECT, confidence: 1, landmarks: points }, time);
      expect(out.pose).toBe('unknown');
      expect(out.fired).toEqual([]);
    }
  });

  it('keeps extended-finger hysteresis intact across an unmeasurable frame', () => {
    const fingers = new FingerStateTracker(DEFAULT_TUNING.fingers.on, DEFAULT_TUNING.fingers.off);
    const open = { index: 1, middle: 1, ring: 1, pinky: 1 };
    fingers.update(open);
    const invalid = { ...open, index: Number.NaN };
    expect(classifyPose(fingers.update(invalid), invalid)).toBe('unknown');
    const borderline = { ...open, index: 0.6 };
    expect(classifyPose(fingers.update(borderline), borderline)).toBe('open');
  });

  it('still casts a deliberately closed fist once when Cataclysm is assigned', () => {
    const engine = new HandsEngine(GESTURES.filter((g) => ['fist', 'cataclysm'].includes(g.id)), DEFAULT_TUNING);
    const fired: string[] = [];
    for (let i = 0; i < 60; i++) {
      const time = 1000 + i * 1000 / 30;
      const frames = [0.4, 1].map((x) => ({ time, aspect: ASPECT, confidence: 1, landmarks: makeHand(x, 0.4, POSES.fist) }));
      fired.push(...engine.process(frames, time).fired.map((f) => f.gestureId));
    }
    expect(fired).toEqual(['fist', 'fist']);
  });
});
