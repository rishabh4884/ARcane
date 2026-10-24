import { describe, expect, it } from 'vitest';
import { GESTURES } from '../src/config/gestures.ts';
import { DEFAULT_TUNING } from '../src/config/tuning.ts';
import { GestureEngine } from '../src/gestures/GestureEngine.ts';
import { HandsEngine } from '../src/gestures/HandsEngine.ts';
import { ASPECT, makeHand, POSES } from './helpers/synth.ts';

describe('single-hand movement gestures after a pause', () => {
  it.each([24, 30, 60])('detects quick open-palm flicks at %i fps with smoothing enabled', (fps) => {
    for (const [id, dx, dy] of [
      ['swish', 1, 0], ['gale', -1, 0], ['tempest', 1, 0], ['rise', 0, -1], ['bury', 0, 1],
    ] as const) {
      const engine = new HandsEngine(GESTURES.filter((g) => g.id === id), DEFAULT_TUNING);
      let now = 1000;
      const dt = 1000 / fps;
      const fired: string[] = [];
      const step = (distance: number) => {
        now += dt;
        const landmarks = makeHand(0.65 + dx * distance, 0.5 + dy * distance, POSES.open);
        const out = engine.process([{ time: now, landmarks, aspect: ASPECT, confidence: 1, side: 'right' }], now);
        fired.push(...out.fired.map((f) => f.gestureId));
      };
      for (let t = 0; t < 2000; t += dt) step(0);
      const duration = 150;
      for (let t = dt; t < duration + dt; t += dt) step(0.35 * Math.min(t / duration, 1));
      expect(fired, `${id} at ${fps} fps`).toEqual([id]);
      for (let t = 0; t < 800; t += dt) step(0.35);
      expect(fired, `${id} must not repeat at rest`).toEqual([id]);
    }
  });

  it.each([24, 30, 60])('prefers Phoenix over Rise for a fast upward flick at %i fps', (fps) => {
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'phoenix' || g.id === 'rise'), DEFAULT_TUNING);
    let now = 1000;
    const dt = 1000 / fps;
    const fired: string[] = [];
    const step = (distance: number) => {
      now += dt;
      const landmarks = makeHand(0.7, 0.8 - distance, POSES.open);
      fired.push(...engine.process({ time: now, landmarks, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let t = 0; t < 1500; t += dt) step(0);
    for (let t = dt; t < 100 + dt; t += dt) step(0.5 * Math.min(t / 100, 1));
    for (let t = 0; t < 400; t += dt) step(0.5);
    expect(fired).toEqual(['phoenix']);
  });

  it.each(['sunder', 'ember', 'wrath', 'slash', 'skybolt', 'impale'])('detects %s after preparing the hand shape', (id) => {
    const gesture = GESTURES.find((g) => g.id === id)!;
    if (gesture.kind !== 'swipe') throw new Error('Expected a swipe');
    const engine = new GestureEngine([gesture], DEFAULT_TUNING);
    let now = 1000;
    const pose = POSES[gesture.hand ?? 'open'];
    const fired: string[] = [];
    const step = (distance: number) => {
      now += 1000 / 30;
      const x = gesture.direction === 'horizontal' ? 0.5 + distance : 0.7;
      const y = gesture.direction === 'up' ? 0.8 - distance : gesture.direction === 'down' ? 0.2 + distance : 0.5;
      const landmarks = makeHand(x, y, pose);
      fired.push(...engine.process({ time: now, landmarks, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 45; i++) step(0);
    for (let i = 1; i <= 5; i++) step(i * 0.07);
    expect(fired).toEqual([id]);
  });

  it.each([
    [0.25, 60], // Fast enough for Phoenix, but not long enough: fall back to Rise.
    [0.35, 300], // A normal scoop should not wait for Phoenix.
  ])('still casts Rise for an upward stroke of %f over %i ms when Phoenix is bound', (travel, duration) => {
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'phoenix' || g.id === 'rise'), DEFAULT_TUNING);
    let now = 1000;
    const dt = 1000 / 60;
    const fired: string[] = [];
    const step = (distance: number) => {
      now += dt;
      const landmarks = makeHand(0.7, 0.8 - distance, POSES.open);
      fired.push(...engine.process({ time: now, landmarks, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let t = 0; t < 1500; t += dt) step(0);
    for (let t = dt; t < duration + dt; t += dt) step(travel * Math.min(t / duration, 1));
    for (let t = 0; t < 400; t += dt) step(travel);
    expect(fired).toEqual(['rise']);
  });

  it('does not detect a sweep when only hand size changes', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'swish' || g.id === 'rise'), DEFAULT_TUNING);
    const fired: string[] = [];
    for (let i = 0; i < 30; i++) {
      const factor = i < 5 ? 1 : Math.max(0.5, 1 - (i - 5) * 0.1);
      const landmarks = makeHand(0.7, 0.5, POSES.open).map((p) => ({
        x: 0.7 + (p.x - 0.7) * factor,
        y: 0.5 + (p.y - 0.5) * factor,
        z: p.z * factor,
      }));
      const time = 1000 + i * 1000 / 30;
      fired.push(...engine.process({ time, landmarks, aspect: ASPECT, confidence: 1 }, time).fired.map((f) => f.gestureId));
    }
    expect(fired).toEqual([]);
  });
});
