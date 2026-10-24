import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/config/tuning.ts';
import { GESTURES } from '../src/config/gestures.ts';
import { GestureEngine } from '../src/gestures/GestureEngine.ts';
import { HandsEngine } from '../src/gestures/HandsEngine.ts';
import { HandBinder } from '../src/tracking/HandBinder.ts';
import type { HandFrame } from '../src/tracking/types.ts';
import { ASPECT, makeHand, POSES } from './helpers/synth.ts';

function frame(x: number, side?: 'left' | 'right', shiftX = 0): HandFrame {
  return {
    time: 1000,
    aspect: ASPECT,
    confidence: 0.95,
    side,
    landmarks: makeHand(x, 0.5, POSES.open).map((point) => ({ ...point, x: point.x + shiftX })),
  };
}

describe('false second-hand detections', () => {
  it('does not finish a held sign using time when the camera was stalled', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'fist'), DEFAULT_TUNING);
    const fist = { ...frame(0.5, 'left'), landmarks: makeHand(0.5, 0.5, POSES.fist) };
    engine.process(fist, 1000);
    engine.process(fist, 1100);
    // No null frame was delivered while inference/the camera was stalled.
    const recovered = engine.process(fist, 2000);
    expect(recovered.fired).toEqual([]);
    expect(recovered.hold?.progress).toBe(0);
  });

  it('immediately restores an established hand after one missed frame', () => {
    const binder = new HandBinder();
    const pair = [frame(0.35, 'left'), frame(0.95, 'right')];
    binder.bind(pair, 1000, 180);
    binder.bind(pair, 1033, 180);
    const missed = binder.bind([pair[0]], 1066, 180);
    const returned = binder.bind([...pair].reverse(), 1099, 180);

    expect(missed.right).toBeNull();
    expect(returned.left?.landmarks[0].x).toBeCloseTo(0.35);
    expect(returned.right?.landmarks[0].x).toBeCloseTo(0.95);
  });

  it.each([24, 30, 60])('survives repeated one-hand dropouts at %i fps without re-confirming the established pair', (fps) => {
    const binder = new HandBinder();
    const pair = [frame(0.35, 'left'), frame(0.95, 'right')];
    const dt = 1000 / fps;
    binder.bind(pair, 1000, 180);
    binder.bind(pair, 1000 + dt, 180);
    for (let i = 2; i < 35; i++) {
      const missing = i % 3 === 0;
      const result = binder.bind(missing ? [pair[0]] : [pair[1], pair[0]], 1000 + i * dt, 180);
      expect(result.left).not.toBeNull();
      expect(result.right !== null).toBe(!missing);
    }
  });

  it('expires only the missing slot while another hand remains visible', () => {
    const binder = new HandBinder();
    const pair = [frame(0.35, 'left'), frame(0.95, 'right')];
    binder.bind(pair, 1000, 180);
    binder.bind(pair, 1033, 180);
    for (let t = 1066; t < 1400; t += 33) binder.bind([pair[0]], t, 180);
    const candidate = binder.bind(pair, 1400, 180);
    expect(candidate.right).toBeNull();
    const confirmed = binder.bind(pair, 1433, 180);
    expect(confirmed.right).not.toBeNull();
  });

  it('keeps a rapidly moving solo hand in its slot when the handedness label flickers', () => {
    const binder = new HandBinder();
    binder.bind([frame(0.35, 'left')], 1000, 180);
    const moved = binder.bind([frame(0.75, 'right')], 1033, 180);
    expect(moved.left).not.toBeNull();
    expect(moved.right).toBeNull();
  });

  it('expires an old slot even when the next frame contains a hand after a long pause', () => {
    const binder = new HandBinder();
    binder.bind([frame(0.5, 'left')], 1000, 180);
    const newSession = binder.bind([frame(0.5, 'right')], 2000, 180);
    expect(newSession.left).toBeNull();
    expect(newSession.right).not.toBeNull();
  });

  it('keeps two genuine hands with overlapping wrists but opposite finger directions', () => {
    const binder = new HandBinder();
    const a = frame(0.55, 'left');
    const b = frame(0.58, 'left');
    // Same (possibly wrong) handedness labels must not be used as detection confidence.
    // Mirror the second hand about its wrist to represent hands crossing in opposite directions.
    const wristY = b.landmarks[0].y;
    b.landmarks = b.landmarks.map((p, i) => i < 5 ? p : { ...p, y: 2 * wristY - p.y });
    binder.bind([a, b], 1000, 180);
    const crossed = binder.bind([a, b], 1033, 180);
    expect(crossed.left).not.toBeNull();
    expect(crossed.right).not.toBeNull();
  });

  it('collapses two overlapping hypotheses for the same moving hand into one track', () => {
    const binder = new HandBinder();
    const result = binder.bind([frame(0.55, 'left'), frame(0.55, 'left', 0.025)], 1000, 180);

    expect(Number(result.left !== null) + Number(result.right !== null)).toBe(1);
  });

  it('does not collapse two distinct hands that are both present', () => {
    const binder = new HandBinder();
    const pair = [frame(0.35, 'left'), frame(0.95, 'right')];
    const firstFrame = binder.bind(pair, 1000, 180);
    const result = binder.bind(pair, 1033, 180);

    expect(Number(firstFrame.left !== null) + Number(firstFrame.right !== null)).toBe(1);
    expect(result.left).not.toBeNull();
    expect(result.right).not.toBeNull();
  });

  it('drops a one-frame phantom second detection before it becomes a live hand', () => {
    const binder = new HandBinder();
    const real = frame(0.4, 'left');
    const ghost = frame(1.0, 'right');
    const first = binder.bind([real, ghost], 1000, 180);
    const next = binder.bind([real], 1033, 180);

    expect(Number(first.left !== null) + Number(first.right !== null)).toBe(1);
    expect(Number(next.left !== null) + Number(next.right !== null)).toBe(1);
  });

  it('does not publish a stale second hand during the dropout grace period', () => {
    const engine = new HandsEngine([], DEFAULT_TUNING);
    const pair = [frame(0.35), frame(0.95)];
    engine.process(pair, 1000);
    const both = engine.process(pair, 1033);
    const one = engine.process([frame(0.35)], 1066);

    expect(both.hands).toHaveLength(2);
    expect(one.hands).toHaveLength(1);
    expect(one.present).toBe(true);
  });
});
