import { describe, expect, it } from 'vitest';
import { GESTURES } from '../src/config/gestures.ts';
import { POSES, liveGestures, makeDriver } from './helpers/synth.ts';

describe('GestureEngine (end to end on synthetic hands)', () => {
  it.each([
    ['fist', 'fist'],
    ['victory', 'victory'],
    ['horns', 'horns'],
  ])('casts %s exactly once while the pose is held', (pose, id) => {
    const d = makeDriver();
    d.hold(0.7, 0.5, POSES.open, 300);
    expect(d.hold(0.7, 0.5, POSES[pose], 1500)).toEqual([id]);
  });

  it('does not cast a pose that is only passed through', () => {
    const d = makeDriver();
    d.hold(0.7, 0.5, POSES.open, 300);
    expect(d.hold(0.7, 0.5, POSES.fist, 150)).toEqual([]);
    expect(d.hold(0.7, 0.5, POSES.open, 300)).toEqual([]);
  });

  it('can cast the same pose again after leaving it', () => {
    const d = makeDriver();
    d.hold(0.7, 0.5, POSES.fist, 800);
    d.hold(0.7, 0.5, POSES.open, 900);
    expect(d.hold(0.7, 0.5, POSES.fist, 800)).toEqual(['fist']);
  });

  it('stays steady under realistic landmark jitter', () => {
    const d = makeDriver();
    d.hold(0.7, 0.5, POSES.open, 300, 0.004);
    expect(d.hold(0.7, 0.5, POSES.victory, 1500, 0.004)).toEqual(['victory']);
  });

  it('casts a swish when the open hand sweeps sideways', () => {
    const d = makeDriver();
    d.hold(0.4, 0.5, POSES.open, 400);
    const fired: string[] = [];
    for (let i = 0; i < 14; i++) d.step(0.4 + i * 0.045, 0.5, POSES.open).fired.forEach((f) => fired.push(f.gestureId));
    expect(fired).toEqual(['swish']);
  });

  it('casts a rise when the open hand scoops upward', () => {
    const d = makeDriver();
    d.hold(0.7, 0.8, POSES.open, 400);
    const fired: string[] = [];
    for (let i = 0; i < 14; i++) d.step(0.7, 0.8 - i * 0.04, POSES.open).fired.forEach((f) => fired.push(f.gestureId));
    expect(fired).toEqual(['rise']);
  });

  it('casts a circle when a pointing finger draws one', () => {
    const d = makeDriver();
    d.hold(0.7, 0.5, POSES.point, 200);
    const fired: string[] = [];
    for (let i = 0; i <= 36; i++) {
      const a = (i / 30) * 2 * Math.PI;
      d.step(0.7 + Math.cos(a) * 0.12, 0.5 + Math.sin(a) * 0.12, POSES.point).fired.forEach((f) =>
        fired.push(f.gestureId),
      );
    }
    expect(fired).toEqual(['circle']);
  });

  it('does not confuse a straight pointing-finger Skybolt stroke with a sigil', () => {
    const d = makeDriver(liveGestures([['spell-1', 'skybolt']]));
    d.hold(0.7, 0.8, POSES.point, 250);
    const fired: string[] = [];
    for (let i = 0; i < 14; i++) {
      d.step(0.7, 0.8 - i * 0.04, POSES.point).fired.forEach((f) => fired.push(f.gestureId));
    }
    expect(fired).toEqual(['skybolt']);
  });

  it('does not cast anything while the hand just rests or drifts', () => {
    const d = makeDriver();
    expect(d.hold(0.7, 0.5, POSES.open, 2000, 0.004)).toEqual([]);
  });

  it('bridges a brief dropout and resets after a long one', () => {
    const d = makeDriver();
    d.hold(0.7, 0.5, POSES.fist, 200);
    d.lose(100);
    expect(d.hold(0.7, 0.5, POSES.fist, 300)).toEqual(['fist']);
    d.lose(500);
    expect(d.engine.process(null, d.t).present).toBe(false);
  });

  it('maps the palm to a 0..1 mirrored cursor', () => {
    const d = makeDriver();
    const out = d.step(0.8, 0.5, POSES.open);
    expect(out.cursor).not.toBeNull();
    expect(out.cursor!.x).toBeGreaterThan(0.5);
    expect(out.cursor!.y).toBeCloseTo(0.5, 1);
  });

  it('ignores gestures that are not bound to a spell', () => {
    // Every gesture in the library is switched on here, but only the default six are bound.
    const d = makeDriver(liveGestures());
    expect(d.hold(0.7, 0.5, POSES.trident, 1500)).toEqual([]);
    expect(d.hold(0.7, 0.5, POSES.open, 1500)).toEqual([]);
    expect(GESTURES.length).toBeGreaterThan(liveGestures().length);
  });

  it('fires a newly bound gesture and nothing else', () => {
    const d = makeDriver(liveGestures([['spell-1', 'trident']]));
    expect(d.hold(0.7, 0.5, POSES.trident, 1500)).toEqual(['trident']);
  });

  it('only charges a bound open-palm ward while the palm is still', () => {
    const d = makeDriver(liveGestures([['spell-1', 'aegis']]));
    // an open hand drifting steadily (3 palm-lengths/s: moving, but far too slow to be a sweep)
    const fired: string[] = [];
    for (let i = 0; i < 40; i++) {
      d.step(0.3 + i * 0.015, 0.5, POSES.open).fired.forEach((f) => fired.push(f.gestureId));
    }
    expect(fired).toEqual([]);
    // the same hand, held still, does
    expect(d.hold(0.6, 0.5, POSES.open, 1200)).toEqual(['aegis']);
  });

  it('prefers a stricter sweep when two overlapping ones are bound', () => {
    const d = makeDriver(liveGestures([['spell-1', 'gale']]));
    d.hold(0.7, 0.5, POSES.open, 400);
    const fired: string[] = [];
    for (let i = 0; i < 14; i++) d.step(0.7 - i * 0.045, 0.5, POSES.open).fired.forEach((f) => fired.push(f.gestureId));
    expect(fired).toEqual(['gale']);
  });
});
