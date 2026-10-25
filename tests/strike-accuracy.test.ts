import { describe, expect, it } from 'vitest';
import { GESTURES } from '../src/config/gestures.ts';
import { DEFAULT_TUNING } from '../src/config/tuning.ts';
import { fingerExtensions } from '../src/gestures/features.ts';
import { GestureEngine } from '../src/gestures/GestureEngine.ts';
import { classifyPose, FingerStateTracker } from '../src/gestures/poses.ts';
import type { Vec3 } from '../src/tracking/types.ts';
import { ASPECT, makeHand, makeRng, POSES } from './helpers/synth.ts';

/** Same bones, but flexed at the finger joints instead of perfectly tucked into a fist. */
function relaxedPoint(): Vec3[] {
  const points = makeHand(0.7, 0.7, POSES.point);
  for (const base of [9, 13, 17]) {
    const directions = [0, 65, 100];
    const lengths = [0.4, 0.22, 0.18];
    for (let j = 0; j < 3; j++) {
      const angle = directions[j] * Math.PI / 180;
      const previous = points[base + j];
      points[base + j + 1] = {
        x: previous.x,
        y: previous.y - Math.cos(angle) * lengths[j] * 0.15,
        z: previous.z + Math.sin(angle) * lengths[j] * 0.15,
      };
    }
  }
  return points;
}

describe('pointing-strike accuracy', () => {
  it('recognises pointing with flexed, not perfectly clenched, other fingers', () => {
    const states = new FingerStateTracker(DEFAULT_TUNING.fingers.on, DEFAULT_TUNING.fingers.off);
    expect(classifyPose(states.update(fingerExtensions(relaxedPoint())))).toBe('point');
  });

  it('does not call a shorter, straight little finger curled', () => {
    const points = makeHand(0.7, 0.7, POSES.open);
    const base = points[17];
    for (let i = 18; i <= 20; i++) {
      points[i] = {
        x: base.x + (points[i].x - base.x) * 0.65,
        y: base.y + (points[i].y - base.y) * 0.65,
        z: base.z + (points[i].z - base.z) * 0.65,
      };
    }
    const states = new FingerStateTracker(DEFAULT_TUNING.fingers.on, DEFAULT_TUNING.fingers.off);
    expect(classifyPose(states.update(fingerExtensions(points)))).toBe('open');
  });

  it('recognises fingers folded at the knuckle even when their other joints stay straight', () => {
    const points = makeHand(0.7, 0.7, POSES.open);
    for (const base of [9, 13, 17]) {
      for (let j = 1; j <= 3; j++) {
        const length = Math.hypot(points[base + j].y - points[base].y, points[base + j].z - points[base].z);
        points[base + j] = { x: points[base].x, y: points[base].y + length, z: points[base].z };
      }
    }
    const states = new FingerStateTracker(DEFAULT_TUNING.fingers.on, DEFAULT_TUNING.fingers.off);
    expect(classifyPose(states.update(fingerExtensions(points)))).toBe('point');
  });

  it.each(['point', 'open', 'fist', 'victory', 'horns', 'trident'])('recognises %s after rotating and scaling the hand', (pose) => {
    const original = makeHand(0.7, 0.7, POSES[pose]);
    for (const scale of [0.5, 1, 1.5]) {
      for (const angle of [0, Math.PI / 3, Math.PI / 2, Math.PI]) {
        const points = original.map((p) => ({
          x: (p.x * Math.cos(angle) - p.z * Math.sin(angle)) * scale,
          y: p.y * scale,
          z: (p.x * Math.sin(angle) + p.z * Math.cos(angle)) * scale,
        }));
        const states = new FingerStateTracker(DEFAULT_TUNING.fingers.on, DEFAULT_TUNING.fingers.off);
        expect(classifyPose(states.update(fingerExtensions(points)))).toBe(pose);
      }
    }
  });

  it('casts Skybolt rather than an open-hand spell with noisy, flexed pointing fingers', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => ['skybolt', 'rise', 'swish'].includes(g.id)), DEFAULT_TUNING);
    const rng = makeRng(19);
    let now = 1000;
    const fired: string[] = [];
    const step = (distance: number) => {
      now += 1000 / 30;
      const landmarks = relaxedPoint().map((p) => ({
        x: p.x + rng() * 0.004,
        y: p.y - distance + rng() * 0.004,
        z: p.z + rng() * 0.004,
      }));
      fired.push(...engine.process({ time: now, landmarks, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 30; i++) step(0);
    for (let i = 1; i <= 5; i++) step(i * 0.06);
    for (let i = 0; i < 30; i++) step(0.3);
    expect(fired).toEqual(['skybolt']);
  });

  it('recognizes a slightly arcing, noisy downward Skyfall thrust', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'impale'), DEFAULT_TUNING);
    const rng = makeRng(42);
    let now = 1000;
    const fired: string[] = [];
    for (let i = 0; i < 30; i++) {
      now += 1000 / 30;
      const progress = Math.max(0, (i - 24) / 5);
      const arc = Math.sin(progress * Math.PI) * 0.035;
      const landmarks = relaxedPoint().map((p) => ({
        x: p.x + arc + (rng() - 0.5) * 0.004,
        y: p.y + progress * 0.25 + (rng() - 0.5) * 0.004,
        z: p.z + (rng() - 0.5) * 0.004,
      }));
      fired.push(...engine.process({ time: now, landmarks, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    }
    expect(fired).toEqual(['impale']);
  });

  it('still casts Lance once when a pointing hold is stationary and Skybolt is assigned', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => ['lance', 'skybolt'].includes(g.id)), DEFAULT_TUNING);
    const fired: string[] = [];
    const rng = makeRng(31);
    for (let i = 0; i < 90; i++) {
      const time = 1000 + i * 1000 / 30;
      const landmarks = relaxedPoint().map((p) => ({ x: p.x + rng() * 0.002, y: p.y + rng() * 0.002, z: p.z + rng() * 0.002 }));
      fired.push(...engine.process({ time, landmarks, aspect: ASPECT, confidence: 1 }, time).fired.map((f) => f.gestureId));
    }
    expect(fired).toEqual(['lance']);
  });

  it.each([24, 30, 60])('does not use the previous open shape for a short pointing strike at %i fps', (fps) => {
    const engine = new GestureEngine(GESTURES.filter((g) => ['skybolt', 'rise'].includes(g.id)), DEFAULT_TUNING);
    let now = 1000;
    const dt = 1000 / fps;
    const fired: string[] = [];
    const step = (points: Vec3[]) => {
      now += dt;
      fired.push(...engine.process({ time: now, landmarks: points, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let t = 0; t < 1000; t += dt) step(makeHand(0.7, 0.8, POSES.open));
    for (let t = dt; t < 100 + dt; t += dt) step(makeHand(0.7, 0.8 - Math.min(t / 100, 1) * 0.25, POSES.point));
    expect(fired).toEqual(['skybolt']);
  });

  it('does not use the previous pointing shape to fire Skybolt during an open-hand scoop', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => ['skybolt', 'rise'].includes(g.id)), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    const step = (points: Vec3[]) => {
      now += 1000 / 60;
      fired.push(...engine.process({ time: now, landmarks: points, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 60; i++) step(makeHand(0.7, 0.8, POSES.point));
    for (let i = 1; i <= 6; i++) step(makeHand(0.7, 0.8 - i * 0.05, POSES.open));
    expect(fired).toEqual(['rise']);
  });

  it('casts Skybolt, not Rise, when the fingers change to pointing during the thrust', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => ['skybolt', 'rise'].includes(g.id)), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    const step = (points: Vec3[]) => {
      now += 1000 / 30;
      fired.push(...engine.process({ time: now, landmarks: points, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 30; i++) step(makeHand(0.7, 0.8, POSES.open));
    for (let i = 0; i <= 4; i++) step(makeHand(0.7, 0.8 - i * 0.08, POSES.point));
    expect(fired).toEqual(['skybolt']);
  });

  it.each([
    ['skybolt', Math.PI / 2, 0],
    ['impale', 0, Math.PI / 2],
    ['slash', -Math.PI / 2, 0],
  ] as const)('casts %s for a pointing wrist flick with a small palm displacement', (id, start, end) => {
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === id), DEFAULT_TUNING);
    const hand = makeHand(0.6, 0.65, POSES.point);
    const pivot = hand[0];
    const rotate = (angle: number) => hand.map((p) => ({
      x: pivot.x + (p.x - pivot.x) * Math.cos(angle) - (p.y - pivot.y) * Math.sin(angle),
      y: pivot.y + (p.x - pivot.x) * Math.sin(angle) + (p.y - pivot.y) * Math.cos(angle),
      z: p.z,
    }));
    let now = 1000;
    const fired: string[] = [];
    const step = (angle: number) => {
      now += 1000 / 30;
      fired.push(...engine.process({ time: now, landmarks: rotate(angle), aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 30; i++) step(start);
    for (let i = 1; i <= 5; i++) step(start + (end - start) * i / 5);
    expect(fired).toEqual([id]);
  });

  it('a moving Lance does not fire before the Skybolt stroke completes', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => ['lance', 'skybolt'].includes(g.id)), DEFAULT_TUNING);
    const fired: string[] = [];
    for (let i = 0; i < 40; i++) {
      const time = 1000 + i * 1000 / 60;
      const y = i < 25 ? 0.8 - i * 0.001 : 0.775 - (i - 25) * 0.015;
      fired.push(...engine.process({ time, landmarks: makeHand(0.7, y, POSES.point), aspect: ASPECT, confidence: 1 }, time).fired.map((f) => f.gestureId));
    }
    expect(fired).toEqual(['skybolt']);
  });

  it('does not mistake a pointing circle for Skybolt when both are assigned', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => ['circle', 'skybolt'].includes(g.id)), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    const step = (x: number, y: number) => {
      now += 1000 / 30;
      const landmarks = makeHand(x, y, POSES.point);
      fired.push(...engine.process({ time: now, landmarks, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 15; i++) step(0.9, 0.6);
    for (let i = 0; i <= 33; i++) {
      const angle = i / 30 * Math.PI * 2;
      step(0.7 + 0.2 * Math.cos(angle), 0.6 + 0.2 * Math.sin(angle));
    }
    expect(fired).toEqual(['circle']);
  });
});
