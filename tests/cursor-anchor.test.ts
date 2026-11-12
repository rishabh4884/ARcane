import { describe, expect, it } from 'vitest';
import { GESTURES } from '../src/config/gestures.ts';
import { DEFAULT_TUNING } from '../src/config/tuning.ts';
import { GestureEngine } from '../src/gestures/GestureEngine.ts';
import { ASPECT, makeHand, POSES } from './helpers/synth.ts';

function cursorFromLandmarks(points: readonly { x: number; y: number }[]): { x: number; y: number } {
  const palm = [0, 5, 9, 13, 17].reduce(
    (center, index) => ({ x: center.x + points[index].x / 5, y: center.y + points[index].y / 5 }),
    { x: 0, y: 0 },
  );
  return {
    x: Math.max(0, Math.min(1, 0.5 + (palm.x / ASPECT - 0.5) * DEFAULT_TUNING.cursorGain)),
    y: Math.max(0, Math.min(1, 0.5 + (palm.y - 0.5) * DEFAULT_TUNING.cursorGain)),
  };
}

describe('aim cursor anchor', () => {
  it('rejects isolated far tracking jumps across capture rates and screen directions', () => {
    let rejected = 0;
    for (const fps of [24, 30, 60]) {
      const dt = 1000 / fps;
      for (const [x, y] of [[0.98, 0.5], [0.55, 0.02], [0.02, 0.02], [0.98, 0.98]]) {
        const engine = new GestureEngine([], DEFAULT_TUNING);
        const step = (cx: number, cy: number, frame: number) => engine.process(
          { time: 1000 + frame * dt, landmarks: makeHand(cx, cy, POSES.open), aspect: ASPECT, confidence: 1 },
          1000 + frame * dt,
        );

        const anchor = step(0.55, 0.5, 0).cursor!;
        const glitch = step(x, y, 1).cursor!;
        const recovered = step(0.55, 0.5, 2).cursor!;

        expect(glitch).toEqual(anchor);
        expect(recovered).toEqual(anchor);
        rejected += 1;
      }
    }
    expect(rejected).toBe(12);
  });

  it.each([24, 30, 60])('confirms sustained relocation promptly at %i FPS', (fps) => {
    const engine = new GestureEngine([], DEFAULT_TUNING);
    const dt = 1000 / fps;
    const step = (x: number, frame: number) => engine.process(
      { time: 1000 + frame * dt, landmarks: makeHand(x, 0.5, POSES.open), aspect: ASPECT, confidence: 1 },
      1000 + frame * dt,
    );

    const initial = step(0.55, 0).cursor!;
    expect(step(0.98, 1).cursor).toEqual(initial);
    const confirmed = step(0.98, 2);
    expect(confirmed.cursor!.x).toBeGreaterThan(initial.x);
    expect(confirmed.cursor!.x).toBeCloseTo(cursorFromLandmarks(confirmed.landmarks!).x);
  });

  it('keeps ordinary fast cursor movement immediate', () => {
    const engine = new GestureEngine([], DEFAULT_TUNING);
    const start = engine.process(
      { time: 1000, landmarks: makeHand(0.5, 0.5, POSES.open), aspect: ASPECT, confidence: 1 },
      1000,
    ).cursor!;
    const out = engine.process(
      { time: 1016, landmarks: makeHand(0.58, 0.44, POSES.open), aspect: ASPECT, confidence: 1 },
      1016,
    );
    const moved = out.cursor!;

    expect(moved.x).toBeCloseTo(cursorFromLandmarks(out.landmarks!).x);
    expect(moved.y).toBeCloseTo(cursorFromLandmarks(out.landmarks!).y);
    expect(moved.x).toBeGreaterThan(start.x);
    expect(moved.y).toBeLessThan(start.y);
  });

  it('does not release a swipe spell from a one-frame position spike', () => {
    const engine = new GestureEngine(GESTURES.filter((gesture) => gesture.id === 'swish'), DEFAULT_TUNING);
    const fired: string[] = [];
    for (let frame = 0; frame < 20; frame += 1) {
      const x = frame === 12 ? 0.98 : 0.55;
      const time = 1000 + frame * (1000 / 30);
      fired.push(...engine.process(
        { time, landmarks: makeHand(x, 0.5, POSES.open), aspect: ASPECT, confidence: 1 },
        time,
      ).fired.map(({ gestureId }) => gestureId));
    }
    expect(fired).toEqual([]);
  });
});
