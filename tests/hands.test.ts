import { describe, expect, it } from 'vitest';
import { HandBinder } from '../src/tracking/HandBinder.ts';
import type { HandFrame } from '../src/tracking/types.ts';
import { ASPECT, POSES, liveGestures, makeDuoDriver, makeHand, type DuoDriver, type HandSpec } from './helpers/synth.ts';

const at = (x: number, ext: HandSpec['ext'], y = 0.5): HandSpec => ({ x, y, ext });
const { open, fist, victory, point, trident, horns } = POSES;

describe('HandBinder', () => {
  const frame = (x: number, side?: 'left' | 'right', confidence = 0.95): HandFrame => ({
    time: 0,
    aspect: ASPECT,
    confidence,
    landmarks: makeHand(x, 0.5, open),
    side,
  });

  it('pairs two new hands by on-screen position, whatever the model labelled them', () => {
    for (const [a, b] of [['left', 'right'], ['right', 'left'], [undefined, undefined]] as const) {
      const binder = new HandBinder();
      binder.bind([frame(1.0, b), frame(0.4, a)], 0, 180);
      const r = binder.bind([frame(1.0, b), frame(0.4, a)], 33, 180);
      expect(r.left!.landmarks[0].x).toBeLessThan(r.right!.landmarks[0].x);
    }
  });

  it('keeps each hand in its slot as the two approach each other', () => {
    const binder = new HandBinder();
    let last: number | null = null;
    for (let s = 0; s <= 30; s++) {
      const gap = 0.9 - s * 0.022; // down to ~0.24
      const r = binder.bind([frame(0.8 - gap / 2, 'right'), frame(0.8 + gap / 2, 'left')], s * 33, 180);
      if (!r.right) continue; // A new second track is confirmed on its next frame.
      const leftX = r.left!.landmarks[0].x;
      if (last !== null) expect(Math.abs(leftX - last)).toBeLessThan(0.1);
      last = leftX;
    }
  });

  it('keeps identity when one of two hands flickers out for a few frames', () => {
    const binder = new HandBinder();
    binder.bind([frame(0.5), frame(1.1)], 0, 180);
    binder.bind([frame(0.5), frame(1.1)], 33, 180);
    binder.bind([frame(1.1)], 66, 180);
    binder.bind([frame(1.1)], 99, 180);
    binder.bind([frame(0.5), frame(1.1)], 132, 180);
    const r = binder.bind([frame(0.5), frame(1.1)], 165, 180);
    expect(r.left!.landmarks[0].x).toBeLessThan(0.7);
    expect(r.right!.landmarks[0].x).toBeGreaterThan(0.9);
  });

  it('only believes a lone hand’s label when the model is confident', () => {
    expect(new HandBinder().bind([frame(0.3, 'right', 0.95)], 0, 180).right).not.toBeNull();
    expect(new HandBinder().bind([frame(0.3, 'right', 0.4)], 0, 180).left).not.toBeNull();
  });
});

describe('HandsEngine: two hands at once', () => {
  it('tracks both hands and reports each one’s own pose', () => {
    const d = makeDuoDriver();
    d.hold(at(0.4, fist), at(1.0, victory), 200);
    const out = d.step(at(0.4, fist), at(1.0, victory));
    const poses = Object.fromEntries(out.hands.map((h) => [h.side, h.pose]));
    expect(out.hands).toHaveLength(2);
    expect(poses).toEqual({ left: 'fist', right: 'victory' });
    expect(out.hands.every((h) => h.cursor && h.landmarks)).toBe(true);
  });

  it('casts a different spell from each hand at the same moment', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'fist']]));
    d.hold(at(0.4, fist), at(1.0, victory), 1500);
    expect(d.log.sort()).toEqual(['fist@left', 'victory@right']);
  });

  it('casts the same sign from both hands once each', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'horns']]));
    d.hold(at(0.4, horns), at(1.0, horns), 1500);
    expect(d.log.sort()).toEqual(['horns@left', 'horns@right']);
  });

  it('reports a separate charge per hand while each is held', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'fist']]));
    d.hold(at(0.4, fist), at(1.0, victory), 150);
    const out = d.step(at(0.4, fist), at(1.0, victory));
    const holds = Object.fromEntries(out.hands.map((h) => [h.side, h.hold?.gestureId]));
    expect(holds).toEqual({ left: 'fist', right: 'victory' });
  });

  it('one hand casting does not disturb the other’s hold', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'fist']]));
    d.hold(at(0.4, fist), at(1.0, open), 500);
    d.hold(at(0.4, fist), at(1.0, victory), 1000);
    expect(d.log).toEqual(['fist@left', 'victory@right']);
  });

  it('casts from one hand while the other is idle in view', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'fist'], ['spell-7', 'trident']]));
    d.hold(at(0.4, open), at(1.0, open), 200);
    d.hold(at(0.4, open), at(1.0, fist), 1000);
    expect(d.log).toEqual(['fist@right']);
  });

  it('rides out a one-hand flicker without a spurious cast or swap', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'fist']]));
    for (let i = 0; i < 60; i++) {
      const dropped = i >= 20 && i < 24;
      const out = d.step(at(0.4, fist), dropped ? null : at(1.0, victory));
      for (const h of out.hands) expect(h.pose === 'unknown' || h.pose === (h.side === 'left' ? 'fist' : 'victory')).toBe(true);
    }
    expect(d.log.sort()).toEqual(['fist@left', 'victory@right']);
  });

  it('works for a single hand too, in either slot', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'fist']]));
    d.hold(null, at(1.0, fist), 1000);
    d.hold(at(0.4, victory), null, 1000);
    expect(d.log.sort()).toEqual(['fist@right', 'victory@left']);
  });
});

describe('two-hand signs', () => {
  it('Blood Pact: both fists cast the pact once, not two fists plus a pact', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'fist'], ['spell-3', 'pact']]));
    d.hold(at(0.4, fist), at(1.0, fist), 2500);
    expect(d.log).toEqual(['pact@both']);
  });

  it('a lone fist still casts the single-hand spell when a two-hand fist is also bound', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'fist'], ['spell-3', 'pact'], ['spell-7', 'trident']]));
    d.hold(at(0.4, open), at(1.0, open), 200);
    d.hold(at(0.4, fist), at(1.0, open), 1000);
    expect(d.log).toEqual(['fist@left']);
  });

  it.each([
    ['fangs', victory],
    ['crossfire', point],
    ['maw', horns],
    ['leviathan', trident],
  ])('%s fires once when both hands hold the sign', (id, ext) => {
    const d = makeDuoDriver(liveGestures([['spell-1', id]]));
    d.hold(at(0.4, ext), at(1.0, ext), 2000);
    expect(d.log).toEqual([`${id}@both`]);
  });

  it('Eclipse fires for two still open palms but not while they are moving about', () => {
    const moving = makeDuoDriver(liveGestures([['spell-1', 'eclipse']]));
    for (let i = 0; i < 60; i++) moving.step(at(0.3 + i * 0.012, open), at(1.1 - i * 0.012, open));
    expect(moving.log).toEqual([]);
    const still = makeDuoDriver(liveGestures([['spell-1', 'eclipse']]));
    still.hold(at(0.4, open), at(1.0, open), 1500);
    expect(still.log).toEqual(['eclipse@both']);
  });

  it('mixed shapes on the two hands do not trigger a two-hand sign', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'pact']]));
    d.hold(at(0.4, fist), at(1.0, point), 400);
    expect(d.log.filter((x) => x.startsWith('pact'))).toEqual([]);
  });
});

describe('two-hand motions', () => {
  const motion = (id: string, path: (i: number) => [HandSpec, HandSpec], start: [HandSpec, HandSpec], hints: 'correct' | 'inverted' | 'none') => {
    const d = makeDuoDriver(liveGestures([['spell-1', id]]), hints);
    for (let i = 0; i < 9; i++) d.step(...start);
    for (let i = 0; i < 14; i++) d.step(...path(i));
    return d.log.filter((x) => x.endsWith('@both')); // single-hand sweeps (e.g. the default swish) are fine
  };
  const apart = (i: number): [HandSpec, HandSpec] => [at(0.6 - i * 0.035, open), at(0.8 + i * 0.035, open)];
  const together = (i: number): [HandSpec, HandSpec] => [at(0.2 + i * 0.045, open), at(1.1 - i * 0.045, open)];
  const lift = (i: number): [HandSpec, HandSpec] => [at(0.4, open, 0.8 - i * 0.04), at(1.0, open, 0.8 - i * 0.04)];
  const drop = (i: number): [HandSpec, HandSpec] => [at(0.4, open, 0.25 + i * 0.04), at(1.0, open, 0.25 + i * 0.04)];

  // The model's Left/Right label may be right, wrong or absent; two-hand motions must not care.
  for (const hints of ['correct', 'inverted', 'none'] as const) {
    it(`rift, bind, skywake and cataclysm fire with ${hints} handedness labels`, () => {
      expect(motion('rift', apart, apart(0), hints)).toEqual(['rift@both']);
      expect(motion('bind', together, together(0), hints)).toEqual(['bind@both']);
      expect(motion('skywake', lift, lift(0), hints)).toEqual(['skywake@both']);
      expect(motion('cataclysm', drop, drop(0), hints)).toEqual(['cataclysm@both']);
    });
  }

  it('does not mistake apart for together or lift', () => {
    expect(motion('bind', apart, apart(0), 'correct')).toEqual([]);
    expect(motion('skywake', apart, apart(0), 'correct')).toEqual([]);
    expect(motion('cataclysm', lift, lift(0), 'correct')).toEqual([]);
  });

  it('is not triggered when only one hand moves', () => {
    const path = (i: number): [HandSpec, HandSpec] => [at(0.6 - i * 0.05, open), at(0.8, open)];
    expect(motion('rift', path, path(0), 'correct')).toEqual([]);
  });

  it('wins over the single-hand sweep it resembles when both are bound', () => {
    const d = makeDuoDriver(liveGestures([['spell-1', 'rift']]));
    for (let i = 0; i < 9; i++) d.step(...apart(0));
    for (let i = 0; i < 14; i++) d.step(...apart(i));
    expect(d.log).toEqual(['rift@both']);
  });

  it('a two-hand sign held beforehand does not steal a motion that follows', () => {
    const d: DuoDriver = makeDuoDriver(liveGestures([['spell-1', 'rift'], ['spell-2', 'eclipse']]));
    d.hold(...apart(0), 300);
    for (let i = 0; i < 14; i++) d.step(...apart(i));
    expect(d.log).toEqual(['rift@both']);
  });
});
