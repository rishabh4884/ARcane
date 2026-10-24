import { describe, expect, it } from 'vitest';
import { GESTURES } from '../src/config/gestures.ts';
import { DEFAULT_TUNING } from '../src/config/tuning.ts';
import { BowRecognizer } from '../src/gestures/BowRecognizer.ts';
import { HandsEngine } from '../src/gestures/HandsEngine.ts';
import type { TrackedHand } from '../src/gestures/GestureEngine.ts';
import type { HandFrame, HandSide } from '../src/tracking/types.ts';
import { ASPECT, makeHand, POSES } from './helpers/synth.ts';

const fingers = { index: 0, middle: 0, ring: 0, pinky: 0 };
const fingerStates = { index: false, middle: false, ring: false, pinky: false };

function hand(side: HandSide, x: number, pinched: boolean, pose: TrackedHand['pose'] = 'point'): TrackedHand {
  const landmarks = makeHand(x, 0.55, pose === 'open' ? POSES.open : POSES.point);
  if (pinched) landmarks[4] = { ...landmarks[8] };
  return {
    side,
    present: true,
    pose,
    fingers,
    fingerStates,
    cursor: { x, y: 0.55 },
    landmarks,
    aspect: ASPECT,
    hold: null,
  };
}

function makeRecognizer(): BowRecognizer {
  const recognizer = new BowRecognizer();
  recognizer.setEnabled(true);
  return recognizer;
}

describe('BowRecognizer', () => {
  it('does not arm from a pointing hand alone or two unpinched hands', () => {
    const bow = makeRecognizer();
    expect(bow.process(hand('left', 0.42, false), null, 0, true).engaged).toBe(false);
    expect(bow.process(hand('left', 0.42, false), hand('right', 0.55, false), 34, true).charge).toBeNull();
  });

  it('fires once on a confirmed pinch release after a relative draw', () => {
    const bow = makeRecognizer();
    const aim = hand('left', 0.42, false);
    const draw = (x: number, pinched = true) => hand('right', x, pinched);
    expect(bow.process(aim, draw(0.55), 0, true).charge?.phase).toBe('arming');
    bow.process(aim, draw(0.55), 40, false);
    bow.process(aim, draw(0.55), 80, false);
    expect(bow.process(aim, draw(0.55), 120, false).charge?.phase).toBe('drawing');

    expect(bow.process(aim, draw(0.75), 153, false).charge?.progress).toBeGreaterThan(0.5);
    expect(bow.process(aim, draw(0.75, false), 186, false).fired).toBeNull();
    expect(bow.process(aim, draw(0.75, false), 219, false).fired).toBeNull();
    expect(bow.process(aim, draw(0.75, false), 285, false).fired).toEqual({
      gestureId: 'bowdraw',
      side: 'left',
      detail: expect.stringMatching(/\d+% draw/),
    });
    expect(bow.process(aim, draw(0.75, false), 318, false).fired).toBeNull();
  });

  it('does not fire when the pinch is released before a meaningful draw', () => {
    const bow = makeRecognizer();
    const aim = hand('left', 0.42, false);
    const draw = (pinched: boolean) => hand('right', 0.55, pinched);
    bow.process(aim, draw(true), 0, true);
    bow.process(aim, draw(true), 120, false);
    bow.process(aim, draw(false), 153, false);
    expect(bow.process(aim, draw(false), 240, false).fired).toBeNull();
  });

  it('uses relative movement, so moving both hands together is not a draw', () => {
    const bow = makeRecognizer();
    bow.process(hand('left', 0.42, false), hand('right', 0.55, true), 0, true);
    bow.process(hand('left', 0.62, false), hand('right', 0.75, true), 120, false);
    bow.process(hand('left', 0.62, false), hand('right', 0.75, false), 153, false);
    expect(bow.process(hand('left', 0.62, false), hand('right', 0.75, false), 240, false).fired).toBeNull();
  });

  it('does not charge when only the aiming hand moves away', () => {
    const bow = makeRecognizer();
    bow.process(hand('left', 0.42, false), hand('right', 0.55, true), 0, true);
    bow.process(hand('left', 0.22, false), hand('right', 0.55, true), 120, false);
    bow.process(hand('left', 0.22, false), hand('right', 0.55, false), 153, false);
    expect(bow.process(hand('left', 0.22, false), hand('right', 0.55, false), 240, false).fired).toBeNull();
  });

  it('locks roles when the aiming hand is on the right', () => {
    const bow = makeRecognizer();
    const aim = hand('right', 0.62, false);
    const draw = (x: number, pinched = true) => hand('left', x, pinched);
    bow.process(draw(0.48), aim, 0, true);
    bow.process(draw(0.48), aim, 120, false);
    bow.process(draw(0.28), aim, 153, false);
    bow.process(draw(0.28, false), aim, 186, false);
    expect(bow.process(draw(0.28, false), aim, 285, false).fired?.side).toBe('right');
  });

  it('cancels without firing when either hand is lost', () => {
    const bow = makeRecognizer();
    const aim = hand('left', 0.42, false);
    const draw = hand('right', 0.55, true);
    bow.process(aim, draw, 0, true);
    expect(bow.process(aim, null, 33, false)).toEqual({ engaged: false, charge: null, fired: null });
    expect(bow.process(aim, hand('right', 0.8, false), 300, false).fired).toBeNull();
  });

  it('requires release to persist, ignoring a one-frame pinch dropout', () => {
    const bow = makeRecognizer();
    const aim = hand('left', 0.42, false);
    const draw = (x: number, pinched = true) => hand('right', x, pinched);
    bow.process(aim, draw(0.55), 0, true);
    bow.process(aim, draw(0.55), 120, false);
    bow.process(aim, draw(0.75), 153, false);
    bow.process(aim, draw(0.75, false), 186, false);
    expect(bow.process(aim, draw(0.75), 219, false).fired).toBeNull();
    expect(bow.process(aim, draw(0.75), 252, false).charge).not.toBeNull();
  });

  it('fires Bow Draw through HandsEngine once, from the aiming hand', () => {
    const engine = new HandsEngine(GESTURES.filter((g) => g.id === 'bowdraw'), DEFAULT_TUNING);
    const fired: string[] = [];
    let now = 1000;
    const step = (drawX: number, pinched: boolean) => {
      now += 1000 / 30;
      const makeFrame = (x: number, side: HandSide, pinch: boolean): HandFrame => {
        const landmarks = makeHand(x, 0.55, POSES.point);
        if (pinch) landmarks[4] = { ...landmarks[8] };
        return { time: now, landmarks, aspect: ASPECT, confidence: 1, side };
      };
      const output = engine.process([
        makeFrame(0.42, 'left', false),
        makeFrame(drawX, 'right', pinched),
      ], now);
      fired.push(...output.fired.map((item) => `${item.gestureId}@${item.side}`));
      return output;
    };

    for (let i = 0; i < 15; i++) step(0.55, true);
    expect(step(0.75, true).bow?.progress).toBeGreaterThan(0.2);
    for (let i = 0; i < 12; i++) step(0.75, false);
    expect(fired).toEqual(['bowdraw@left']);
  });
});
