import type { FingerName } from '../../src/gestures/features.ts';
import { GestureEngine, type EngineOutput } from '../../src/gestures/GestureEngine.ts';
import { HandsEngine } from '../../src/gestures/HandsEngine.ts';
import { DEFAULT_TUNING } from '../../src/config/tuning.ts';
import { GESTURES, type GestureDef } from '../../src/config/gestures.ts';
import { SPELLS } from '../../src/config/spells.ts';
import { SpellBook } from '../../src/spells/SpellBook.ts';
import type { HandFrame, HandSide, Vec3 } from '../../src/tracking/types.ts';

/** The gestures the app would have live: those bound to a spell (defaults, or after `assign`). */
export function liveGestures(assign: Array<[spellId: string, gestureId: string]> = []): GestureDef[] {
  const book = new SpellBook(SPELLS, GESTURES, null);
  for (const [spell, gesture] of assign) book.assign(spell, gesture);
  return book.activeGestures();
}

/** Palm length of the synthetic hand, in tracking units (≈ 9 cm at arm's length). */
export const PALM = 0.15;
export const ASPECT = 4 / 3;

export type Extended = Partial<Record<FingerName, boolean>>;

const rad = (d: number) => (d * Math.PI) / 180;
const SEGMENTS = [0.4, 0.22, 0.18];
const CURLED_DIRECTIONS = [85, 185, 245]; // cumulative bend, degrees from "up"

/**
 * Builds 21 anatomically plausible landmarks (upright palm, +y is "up" locally).
 * Curled fingers fold toward +z, the way a real fist closes toward the camera.
 */
export function makeHand(cx: number, cy: number, ext: Extended): Vec3[] {
  const local: Vec3[] = new Array(21);
  local[0] = { x: 0, y: 0, z: 0 };
  const thumb = [[-0.2, 0.2], [-0.45, 0.45], [-0.65, 0.7], [-0.8, 0.9]];
  thumb.forEach(([x, y], i) => (local[1 + i] = { x: x * PALM, y: y * PALM, z: 0 }));

  const fingers: Array<[FingerName, number, number]> = [
    ['index', -0.3, 0.97],
    ['middle', -0.1, 1.0],
    ['ring', 0.1, 0.95],
    ['pinky', 0.28, 0.88],
  ];
  fingers.forEach(([name, dx, dy], f) => {
    const base = 5 + f * 4;
    let pos = { x: dx * PALM, y: dy * PALM, z: 0 };
    local[base] = pos;
    const extended = ext[name] ?? false;
    for (let k = 0; k < 3; k++) {
      const a = rad(extended ? 0 : CURLED_DIRECTIONS[k]);
      pos = {
        x: pos.x,
        y: pos.y + Math.cos(a) * SEGMENTS[k] * PALM,
        z: pos.z + Math.sin(a) * SEGMENTS[k] * PALM,
      };
      local[base + 1 + k] = pos;
    }
  });

  // Centre on the palm and convert to image space (y down).
  const ids = [0, 5, 9, 13, 17];
  const mx = ids.reduce((s, i) => s + local[i].x, 0) / ids.length;
  const my = ids.reduce((s, i) => s + local[i].y, 0) / ids.length;
  return local.map((p) => ({ x: cx + (p.x - mx), y: cy - (p.y - my), z: p.z }));
}

export const POSES: Record<string, Extended> = {
  fist: {},
  victory: { index: true, middle: true },
  horns: { index: true, pinky: true },
  point: { index: true },
  trident: { index: true, middle: true, ring: true },
  open: { index: true, middle: true, ring: true, pinky: true },
};

/** Deterministic pseudo-noise so tests are repeatable. */
export function makeRng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296 - 0.5;
  };
}

export interface Driver {
  engine: GestureEngine;
  t: number;
  /** Advance by one 30 fps frame with the given hand. Returns the engine output. */
  step(cx: number, cy: number, ext: Extended, jitter?: number): EngineOutput;
  /** Run `ms` of a constant hand, return every gesture id fired. */
  hold(cx: number, cy: number, ext: Extended, ms: number, jitter?: number): string[];
  lose(ms: number): void;
}

export function makeDriver(gestures: readonly GestureDef[] = liveGestures()): Driver {
  const engine = new GestureEngine(gestures, DEFAULT_TUNING);
  const rng = makeRng(7);
  const dt = 1000 / 30;
  const d: Driver = {
    engine,
    t: 1000,
    step(cx, cy, ext, jitter = 0) {
      d.t += dt;
      const lm = makeHand(cx, cy, ext).map((p) => ({
        x: p.x + rng() * jitter,
        y: p.y + rng() * jitter,
        z: p.z + rng() * jitter,
      }));
      const frame: HandFrame = { time: d.t, landmarks: lm, aspect: ASPECT, confidence: 1 };
      return engine.process(frame, d.t);
    },
    hold(cx, cy, ext, ms, jitter = 0) {
      const fired: string[] = [];
      for (let e = 0; e < ms; e += dt) {
        d.step(cx, cy, ext, jitter).fired.forEach((f) => fired.push(f.gestureId));
      }
      return fired;
    },
    lose(ms) {
      for (let e = 0; e < ms; e += dt) {
        d.t += dt;
        engine.process(null, d.t);
      }
    },
  };
  return d;
}

/* ───────────────────────────── two hands ───────────────────────────── */

export interface HandSpec {
  x: number;
  y: number;
  ext: Extended;
}

export interface DuoDriver {
  engine: HandsEngine;
  t: number;
  /** Every gesture fired so far, as "id@side". */
  log: string[];
  /** One 30 fps frame. Pass null to drop that hand for the frame. */
  step(left: HandSpec | null, right: HandSpec | null): ReturnType<HandsEngine['process']>;
  hold(left: HandSpec | null, right: HandSpec | null, ms: number): void;
}

/**
 * Drives HandsEngine with two synthetic hands. `left` is the hand on the left of the screen.
 * `hints` controls the model's Left/Right label: 'correct', 'inverted' (what raw MediaPipe
 * used to give), or 'none'. Nothing in the engine may depend on it for two-hand work.
 */
export function makeDuoDriver(
  gestures: readonly GestureDef[] = liveGestures(),
  hints: 'correct' | 'inverted' | 'none' = 'correct',
): DuoDriver {
  const engine = new HandsEngine(gestures, DEFAULT_TUNING);
  const dt = 1000 / 30;
  const label = (side: HandSide): HandSide | undefined =>
    hints === 'none' ? undefined : hints === 'correct' ? side : side === 'left' ? 'right' : 'left';
  const d: DuoDriver = {
    engine,
    t: 1000,
    log: [],
    step(left, right) {
      d.t += dt;
      const frames: HandFrame[] = [];
      const add = (h: HandSpec | null, side: HandSide) => {
        if (h) frames.push({ time: d.t, landmarks: makeHand(h.x, h.y, h.ext), aspect: ASPECT, confidence: 0.95, side: label(side) });
      };
      add(left, 'left');
      add(right, 'right');
      const out = engine.process(frames, d.t);
      out.fired.forEach((f) => d.log.push(`${f.gestureId}@${f.side}`));
      return out;
    },
    hold(left, right, ms) {
      for (let e = 0; e < ms; e += dt) d.step(left, right);
    },
  };
  return d;
}
