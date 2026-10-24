import { describe, expect, it } from 'vitest';
import { detectCircle, CIRCLE_DEFAULTS, detectSwipe, SWIPE_DEFAULTS, type Sample } from '../src/gestures/motion.ts';

const sample = (t: number, x: number, y = 0, pose: Sample['pose'] = 'open'): Sample => ({ t, x, y, pose });

describe('detectSwipe', () => {
  it('detects a quick flick after a long open-palm pause', () => {
    const flick = [sample(1500, 0), sample(1550, 0.8), sample(1600, 1.6), sample(1650, 2.4)];
    expect(detectSwipe([sample(0, 0), ...flick], SWIPE_DEFAULTS)).toEqual({ direction: 'right' });
    expect(detectSwipe(flick, SWIPE_DEFAULTS)).toEqual({ direction: 'right' });
  });

  it('does not cast an old stroke while the palm has stopped', () => {
    const stopped = [sample(0, 0), sample(50, 0.8), sample(100, 1.6), sample(150, 2.4), sample(200, 2.4), sample(250, 2.4)];
    expect(detectSwipe(stopped, SWIPE_DEFAULTS)).toBeNull();
  });

  it('rejects slow drift, short jitter, and back-and-forth motion', () => {
    expect(detectSwipe([sample(0, 0), sample(500, 1), sample(1000, 2)], SWIPE_DEFAULTS)).toBeNull();
    expect(detectSwipe([sample(0, 0), sample(30, 0.1), sample(60, -0.1), sample(90, 0)], SWIPE_DEFAULTS)).toBeNull();
    expect(detectSwipe([sample(0, 0), sample(40, 1), sample(80, -0.5), sample(120, 1)], SWIPE_DEFAULTS)).toBeNull();
  });

  it('does not turn a fist movement into an open-hand flick on the last frame', () => {
    expect(detectSwipe([sample(0, 0, 0, 'fist'), sample(50, 1, 0, 'fist'), sample(100, 2)], SWIPE_DEFAULTS)).toBeNull();
  });

  it('allows one onset anchor, but never reaches back across several different-shape frames', () => {
    const options = { ...SWIPE_DEFAULTS, hand: 'point' as const, direction: 'up' as const };
    expect(detectSwipe([
      sample(0, 0, 0, 'open'),
      sample(30, 0, -0.5, 'point'),
      sample(60, 0, -1, 'point'),
      sample(90, 0, -1.5, 'point'),
    ], options)).toEqual({ direction: 'up' });
    expect(detectSwipe([
      sample(0, 0, 0, 'open'), sample(30, 0, -2, 'open'),
      sample(60, 0, -2.3, 'point'), sample(90, 0, -2.6, 'point'), sample(120, 0, -2.9, 'point'),
    ], options)).toBeNull();
  });

  it('tolerates one uncertain pose without accepting a mostly uncertain stroke', () => {
    const stroke = [sample(0, 0), sample(30, 0.4), sample(60, 0.8, 0, 'unknown'), sample(90, 1.2), sample(120, 1.6)];
    expect(detectSwipe(stroke, SWIPE_DEFAULTS)).toEqual({ direction: 'right' });
    expect(detectSwipe(stroke.map((p, i) => i === 1 ? { ...p, pose: 'unknown' } : p), SWIPE_DEFAULTS)).toBeNull();
  });

  it('does not count a tracking jump as a flick', () => {
    expect(detectSwipe([sample(0, 0), sample(30, 0), sample(60, 2), sample(90, 2)], SWIPE_DEFAULTS)).toBeNull();
    expect(detectSwipe([sample(0, 0), sample(500, 1), sample(530, 2)], SWIPE_DEFAULTS)).toBeNull();
  });

  it.each([
    ['left', -1, 0],
    ['right', 1, 0],
    ['up', 0, -1],
    ['down', 0, 1],
  ] as const)('recognises a %s stroke', (direction, dx, dy) => {
    const stroke = [sample(0, 0), sample(50, dx, dy), sample(100, 2 * dx, 2 * dy)];
    expect(detectSwipe(stroke, { ...SWIPE_DEFAULTS, direction })).toEqual({ direction });
  });
});

describe('detectCircle across capture rates', () => {
  const makeCircle = (fps: number, direction: 1 | -1 = 1): Sample[] => {
    const samples: Sample[] = [];
    // Deliberate pointing pause before the drawing starts.
    for (let i = 0; i < Math.round(fps * 0.45); i++) samples.push(sample(1000 + i * 1000 / fps, 0, 0, 'point'));
    const start = samples.at(-1)!.t;
    const duration = 850;
    for (let i = 0; i <= Math.ceil(duration * fps / 1000); i++) {
      const p = Math.min(i * 1000 / fps / duration, 1);
      const angle = direction * p * Math.PI * 2;
      samples.push(sample(start + p * duration, Math.cos(angle) * 0.9, Math.sin(angle) * 0.9, 'point'));
    }
    return samples;
  };

  it.each([24, 30, 60])('recognizes the same completed circle at %i FPS', (fps) => {
    expect(detectCircle(makeCircle(fps), CIRCLE_DEFAULTS)).toEqual({ clockwise: true });
    expect(detectCircle(makeCircle(fps, -1), CIRCLE_DEFAULTS)).toEqual({ clockwise: false });
  });

  it.each([24, 30, 60])('does not turn a partial arc into a circle at %i FPS', (fps) => {
    const samples = Array.from({ length: fps }, (_, i) => {
      const angle = (i / (fps - 1)) * Math.PI * 1.5;
      return sample(1000 + i * 1000 / fps, Math.cos(angle), Math.sin(angle), 'point');
    });
    expect(detectCircle(samples, CIRCLE_DEFAULTS)).toBeNull();
  });

  it('ignores the idle pointing hold when finding the latest closed loop', () => {
    const drawing = makeCircle(30);
    expect(detectCircle(drawing, CIRCLE_DEFAULTS)).toEqual({ clockwise: true });
  });
});
