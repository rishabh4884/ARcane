import { describe, expect, it } from 'vitest';
import { GESTURES } from '../src/config/gestures.ts';
import { DEFAULT_TUNING } from '../src/config/tuning.ts';
import { BowRecognizer } from '../src/gestures/BowRecognizer.ts';
import { GestureEngine, type TrackedHand } from '../src/gestures/GestureEngine.ts';
import { HandsEngine } from '../src/gestures/HandsEngine.ts';
import type { HandFrame, HandSide, Vec3 } from '../src/tracking/types.ts';
import { ASPECT, liveGestures, makeHand, POSES } from './helpers/synth.ts';

const fingers = { index: 0, middle: 0, ring: 0, pinky: 0 };
const fingerStates = { index: false, middle: false, ring: false, pinky: false };

/** Scale a hand about its palm centre: smaller means farther from the camera. */
function scaled(points: Vec3[], factor: number): Vec3[] {
  const ids = [0, 5, 9, 13, 17];
  const cx = ids.reduce((s, i) => s + points[i].x, 0) / ids.length;
  const cy = ids.reduce((s, i) => s + points[i].y, 0) / ids.length;
  return points.map((p) => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor, z: p.z * factor }));
}

function tracked(side: HandSide, x: number, pinched: boolean, pose: TrackedHand['pose'] = 'point', scale = 1): TrackedHand {
  let landmarks = makeHand(x, 0.55, pose === 'open' ? POSES.open : POSES.point);
  if (pinched) landmarks[4] = { ...landmarks[8] };
  landmarks = scaled(landmarks, scale);
  return { side, present: true, pose, fingers, fingerStates, cursor: { x, y: 0.55 }, landmarks, aspect: ASPECT, hold: null };
}

function bow(): BowRecognizer {
  const recognizer = new BowRecognizer();
  recognizer.setEnabled(true);
  return recognizer;
}

describe('Bow Draw robustness', () => {
  it('counts a pull straight back toward the body (the hand shrinks on camera) as a draw', () => {
    const b = bow();
    const aim = tracked('left', 0.42, false);
    let t = 0;
    b.process(aim, tracked('right', 0.56, true), t, true);
    for (let i = 1; i <= 6; i++) b.process(aim, tracked('right', 0.56, true), (t += 33), false);
    // Pull back: the drawing hand barely moves on screen but recedes to 65% of its size.
    for (let i = 1; i <= 6; i++) b.process(aim, tracked('right', 0.565, true, 'point', 1 - i * 0.06), (t += 33), false);
    const fired = [];
    for (let i = 0; i < 4; i++) {
      const r = b.process(aim, tracked('right', 0.565, false, 'point', 0.64), (t += 33), false);
      if (r.fired) fired.push(r.fired);
    }
    expect(fired).toHaveLength(1);
    expect(fired[0].gestureId).toBe('bowdraw');
  });

  it('bridges a brief drop-out of the drawing hand instead of cancelling', () => {
    const b = bow();
    const aim = tracked('left', 0.42, false);
    let t = 0;
    b.process(aim, tracked('right', 0.55, true), t, true);
    for (let i = 0; i < 4; i++) b.process(aim, tracked('right', 0.55, true), (t += 33), false);
    b.process(aim, tracked('right', 0.68, true), (t += 33), false);
    expect(b.process(aim, null, (t += 33), false).engaged).toBe(true);
    expect(b.process(aim, null, (t += 33), false).engaged).toBe(true);
    b.process(aim, tracked('right', 0.78, true), (t += 33), false);
    let shot = null;
    for (let i = 0; i < 4; i++) shot ??= b.process(aim, tracked('right', 0.78, false), (t += 33), false).fired;
    expect(shot?.gestureId).toBe('bowdraw');
  });

  it('keeps aiming through a short misread of the pointing hand', () => {
    const b = bow();
    let t = 0;
    const draw = (x: number, pinch = true) => tracked('right', x, pinch);
    b.process(tracked('left', 0.42, false), draw(0.55), t, true);
    for (let i = 0; i < 4; i++) b.process(tracked('left', 0.42, false), draw(0.55), (t += 33), false);
    for (let i = 0; i < 4; i++) b.process(tracked('left', 0.42, false, 'unknown'), draw(0.6 + i * 0.04), (t += 33), false);
    let shot = null;
    for (let i = 0; i < 4; i++) shot ??= b.process(tracked('left', 0.42, false), draw(0.76, false), (t += 33), false).fired;
    expect(shot?.gestureId).toBe('bowdraw');
  });

  it('arms with the hands a wide shoulder-width apart', () => {
    const b = bow();
    const r = b.process(tracked('left', 0.2, false), tracked('right', 0.9, true), 0, true);
    expect(r.engaged).toBe(true);
  });

  it('can re-arm immediately after a cancelled draw (no cast pause was spent)', () => {
    const engine = new HandsEngine(GESTURES.filter((g) => g.id === 'bowdraw'), DEFAULT_TUNING);
    let now = 1000;
    const frame = (x: number, side: HandSide, pinch: boolean, pose = POSES.point): HandFrame => {
      const landmarks = makeHand(x, 0.55, pose);
      if (pinch) landmarks[4] = { ...landmarks[8] };
      return { time: now, landmarks, aspect: ASPECT, confidence: 1, side };
    };
    const step = (frames: HandFrame[]) => { now += 1000 / 30; return engine.process(frames.map((f) => ({ ...f, time: now })), now); };
    for (let i = 0; i < 8; i++) step([frame(0.42, 'left', false), frame(0.55, 'right', true)]);
    // The aim hand clearly opens: that cancels the attempt.
    for (let i = 0; i < 12; i++) step([frame(0.42, 'left', false, POSES.open), frame(0.55, 'right', true)]);
    // Point again and draw: it must arm right away and fire.
    const fired: string[] = [];
    for (let i = 0; i < 6; i++) step([frame(0.42, 'left', false), frame(0.55, 'right', true)]);
    for (let i = 0; i < 6; i++) step([frame(0.42, 'left', false), frame(0.55 + i * 0.05, 'right', true)]);
    for (let i = 0; i < 6; i++) fired.push(...step([frame(0.42, 'left', false), frame(0.8, 'right', false)]).fired.map((f) => f.gestureId));
    expect(fired).toEqual(['bowdraw']);
  });

  it('does not fire Skyfall from the aiming hand while the bow is being nocked', () => {
    const engine = new HandsEngine(liveGestures(), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    const step = (aimY: number, drawPinchGap: number) => {
      now += 1000 / 30;
      const aim = makeHand(0.42, aimY, POSES.point);
      const draw = makeHand(0.6, 0.55, POSES.point);
      // Bring the thumb most of the way to the index tip without closing the pinch yet.
      draw[4] = { x: draw[8].x + drawPinchGap, y: draw[8].y, z: draw[8].z };
      fired.push(...engine.process([
        { time: now, landmarks: aim, aspect: ASPECT, confidence: 1, side: 'left' },
        { time: now, landmarks: draw, aspect: ASPECT, confidence: 1, side: 'right' },
      ], now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 12; i++) step(0.4, 0.06);
    // The pointing hand dips to settle on the target, a stroke that would otherwise be Skyfall.
    for (let i = 0; i < 6; i++) step(0.4 + i * 0.05, 0.06);
    for (let i = 0; i < 12; i++) step(0.65, 0.06);
    expect(fired).toEqual([]);
  });
});

describe('cross-spell accuracy', () => {
  it('draws a full Mend circle with the default bindings without Skyfall firing on its downward arc', () => {
    const engine = new GestureEngine(liveGestures(), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    const step = (x: number, y: number) => {
      now += 1000 / 30;
      fired.push(...engine.process({ time: now, landmarks: makeHand(x, y, POSES.point), aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (const start of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      fired.length = 0;
      engine.reset();
      for (let i = 0; i < 12; i++) step(0.7 + 0.16 * Math.cos(start), 0.5 + 0.16 * Math.sin(start));
      for (let i = 0; i <= 34; i++) {
        const a = start + (i / 30) * Math.PI * 2;
        step(0.7 + 0.16 * Math.cos(a), 0.5 + 0.16 * Math.sin(a));
      }
      expect(fired, `circle starting at ${start.toFixed(2)} rad`).toEqual(['circle']);
    }
  });

  it('still casts a deliberate Skyfall with the default bindings', () => {
    const engine = new GestureEngine(liveGestures(), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    for (let i = 0; i < 30; i++) {
      now += 1000 / 30;
      const progress = Math.max(0, (i - 20) / 5);
      fired.push(...engine.process({ time: now, landmarks: makeHand(0.7, 0.3 + Math.min(progress, 1) * 0.3, POSES.point), aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    }
    expect(fired).toEqual(['impale']);
  });

  it('completes a fast circle even with a motion-blurred frame in the loop', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => g.id === 'circle'), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    const step = (x: number, y: number, ext = POSES.point) => {
      now += 1000 / 30;
      fired.push(...engine.process({ time: now, landmarks: makeHand(x, y, ext), aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 8; i++) step(0.82, 0.5);
    for (let i = 0; i <= 22; i++) {
      const a = (i / 20) * Math.PI * 2;
      // One blurred frame where the finger reads half-bent (neither extended nor curled).
      const blurred = i === 9;
      const landmarks = makeHand(0.7 + 0.12 * Math.cos(a), 0.5 + 0.12 * Math.sin(a), POSES.point);
      if (blurred) {
        for (const j of [6, 7, 8]) landmarks[j] = { x: landmarks[5].x, y: landmarks[5].y - 0.02 * (j - 5), z: 0.03 * (j - 5) };
      }
      now += 1000 / 30;
      fired.push(...engine.process({ time: now, landmarks, aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    }
    expect(fired).toEqual(['circle']);
  });
});

describe('stroke disambiguation', () => {
  it('does not cast Swish or Rise from an ambiguous 45° diagonal sweep', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => ['swish', 'rise'].includes(g.id)), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    const step = (x: number, y: number) => {
      now += 1000 / 30;
      fired.push(...engine.process({ time: now, landmarks: makeHand(x, y, POSES.open), aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 10; i++) step(0.9, 0.8);
    for (let i = 1; i <= 6; i++) step(0.9 - i * 0.05, 0.8 - i * 0.05);
    for (let i = 0; i < 6; i++) step(0.6, 0.5);
    expect(fired).toEqual([]);
  });

  it('casts a clearly leftward sweep as Swish even with a little rise in it', () => {
    const engine = new GestureEngine(GESTURES.filter((g) => ['swish', 'rise'].includes(g.id)), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    const step = (x: number, y: number) => {
      now += 1000 / 30;
      fired.push(...engine.process({ time: now, landmarks: makeHand(x, y, POSES.open), aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    };
    for (let i = 0; i < 10; i++) step(0.9, 0.6);
    for (let i = 1; i <= 6; i++) step(0.9 - i * 0.06, 0.6 - i * 0.02);
    expect(fired).toEqual(['swish']);
  });
});

describe('easy Skyfall', () => {
  const run = (frames: Array<[number, number]>) => {
    const engine = new GestureEngine(liveGestures(), DEFAULT_TUNING);
    let now = 1000;
    const fired: string[] = [];
    for (const [x, y] of frames) {
      now += 1000 / 30;
      fired.push(...engine.process({ time: now, landmarks: makeHand(x, y, POSES.point), aspect: ASPECT, confidence: 1 }, now).fired.map((f) => f.gestureId));
    }
    return fired;
  };

  it('casts from a short downward flick without raising the hand first', () => {
    const frames: Array<[number, number]> = [];
    for (let i = 0; i < 15; i++) frames.push([0.7, 0.45]);
    // About 0.8 palm-lengths of fingertip travel in ~130 ms.
    for (let i = 1; i <= 4; i++) frames.push([0.7, 0.45 + i * 0.03]);
    for (let i = 0; i < 10; i++) frames.push([0.7, 0.57]);
    expect(run(frames)).toEqual(['impale']);
  });

  it('casts when the player raises, turns and drops in one rounded motion', () => {
    const frames: Array<[number, number]> = [];
    for (let i = 0; i < 12; i++) frames.push([0.7, 0.5]);
    for (let i = 1; i <= 5; i++) frames.push([0.7, 0.5 - i * 0.025]);
    frames.push([0.705, 0.37], [0.71, 0.375]);
    for (let i = 1; i <= 5; i++) frames.push([0.71, 0.375 + i * 0.045]);
    for (let i = 0; i < 10; i++) frames.push([0.71, 0.6]);
    expect(run(frames)).toEqual(['impale']);
  });
});

describe('open-hand sweeps and Aegis do not get in each other’s way', () => {
  const engineWith = () => new GestureEngine(liveGestures([['spell-1', 'swish']]), DEFAULT_TUNING);
  const step = (engine: GestureEngine, t: { now: number }, x: number, ext = POSES.open, fired: string[] = []) => {
    t.now += 1000 / 30;
    fired.push(...engine.process({ time: t.now, landmarks: makeHand(x, 0.5, ext), aspect: ASPECT, confidence: 1 }, t.now).fired.map((f) => f.gestureId));
    return fired;
  };

  it('does not cast Aegis while the open palm pauses for most of a second before a sweep', () => {
    const engine = engineWith(), t = { now: 1000 }, fired: string[] = [];
    for (let i = 0; i < 26; i++) step(engine, t, 0.9, POSES.open, fired); // ~870 ms pause
    for (let i = 1; i <= 6; i++) step(engine, t, 0.9 - i * 0.055, POSES.open, fired);
    expect(fired).toEqual(['swish']);
  });

  it('does not cast Aegis right after a sweep when the hand stops open', () => {
    const engine = engineWith(), t = { now: 1000 }, fired: string[] = [];
    for (let i = 0; i < 8; i++) step(engine, t, 0.9, POSES.open, fired);
    for (let i = 1; i <= 6; i++) step(engine, t, 0.9 - i * 0.055, POSES.open, fired);
    for (let i = 0; i < 40; i++) step(engine, t, 0.57, POSES.open, fired); // 1.3 s resting open
    expect(fired).toEqual(['swish']);
  });

  it('still casts a deliberately held Aegis', () => {
    const engine = engineWith(), t = { now: 1000 }, fired: string[] = [];
    for (let i = 0; i < 45; i++) step(engine, t, 0.6, POSES.open, fired);
    expect(fired).toEqual(['aegis']);
  });

  it('keeps a sweep whose palm turns edge-on (reads as three fingers) mid-stroke', () => {
    const engine = engineWith(), t = { now: 1000 }, fired: string[] = [];
    for (let i = 0; i < 8; i++) step(engine, t, 0.9, POSES.open, fired);
    for (let i = 1; i <= 6; i++) step(engine, t, 0.9 - i * 0.055, i >= 4 ? POSES.trident : POSES.open, fired);
    expect(fired).toEqual(['swish']);
  });
});
