import type { GestureDef } from '../config/gestures.ts';
import type { Tuning } from '../config/tuning.ts';
import { HandBinder } from '../tracking/HandBinder.ts';
import type { HandFrame } from '../tracking/types.ts';
import {
  DUAL_MOTION_DEFAULTS,
  detectDualMotion,
  type DualSample,
} from './dual.ts';
import { clamp01, handScale, palmCenter } from './features.ts';
import {
  GestureEngine,
  STILL_TRAVEL,
  STILL_WINDOW_MS,
  type EngineOutput,
  type GestureFiring,
  type TrackedHand,
} from './GestureEngine.ts';
import type { PoseName } from './poses.ts';

const NO_SUPPRESS: ReadonlySet<PoseName> = new Set();

const WINDOW_MS = 1700;

const IDLE: EngineOutput = {
  present: false,
  pose: 'unknown',
  fingers: { index: 0, middle: 0, ring: 0, pinky: 0 },
  fingerStates: { index: false, middle: false, ring: false, pinky: false },
  cursor: null,
  hold: null,
  fired: [],
  landmarks: null,
  aspect: 1,
  hands: [],
};

/**
 * Two independent single-hand engines plus two-hand signs, with sticky identity
 * so a left/right swap from the model cannot mix landmarks between filters.
 */
export class HandsEngine {
  private tuning: Tuning;
  private gestures: readonly GestureDef[];
  private readonly left: GestureEngine;
  private readonly right: GestureEngine;
  private readonly binder = new HandBinder();
  private dual: DualSample[] = [];
  private dualPose: PoseName = 'unknown';
  private dualPoseSince = 0;
  private dualStillSince = 0;
  private dualLatched: PoseName | null = null;
  private lastDualAt = -Infinity;

  constructor(gestures: readonly GestureDef[], tuning: Tuning) {
    this.gestures = gestures;
    this.tuning = tuning;
    this.left = new GestureEngine(gestures, tuning);
    this.right = new GestureEngine(gestures, tuning);
  }

  /** Only gestures bound to a spell should be live; see GestureEngine.setGestures. */
  setGestures(gestures: readonly GestureDef[]): void {
    this.gestures = gestures;
    this.left.setGestures(gestures);
    this.right.setGestures(gestures);
  }

  setTuning(tuning: Tuning): void {
    this.tuning = tuning;
    this.left.setTuning(tuning);
    this.right.setTuning(tuning);
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
    this.binder.reset();
    this.dual = [];
    this.dualPose = 'unknown';
    this.dualStillSince = 0;
    this.dualLatched = null;
  }

  process(frames: readonly HandFrame[], now: number): EngineOutput {
    const bound = this.binder.bind(frames, now, this.tuning.lostGraceMs);
    // When both hands already hold the same shape and a two-hand sign wants it, the single-hand
    // gestures for that shape stand down so a double fist is one Blood Pact, not two fists + a pact.
    const suppress = this.suppressedPoses(!!bound.left && !!bound.right);
    const L = this.left.process(bound.left, now, { suppressPoses: suppress });
    const R = this.right.process(bound.right, now, { suppressPoses: suppress });
    const leftOn = !!bound.left && L.present;
    const rightOn = !!bound.right && R.present;

    if (leftOn && rightOn && L.landmarks && R.landmarks) {
      this.lastDualAt = now;
      // Match the single-hand motion path: filtered visuals must not let a single sweep
      // overtake a two-hand stroke merely because the latter lags behind.
      const lp = palmCenter(bound.left!.landmarks);
      const rp = palmCenter(bound.right!.landmarks);
      const scale = (handScale(L.landmarks) + handScale(R.landmarks)) / 2;
      // Order by on-screen position, not by slot: the two-hand motions mean "the hand on the
      // left moves left", which must hold whatever the binder happened to call each hand.
      const swap = lp.x > rp.x;
      this.dual.push({
        t: now,
        lx: swap ? rp.x : lp.x,
        ly: swap ? rp.y : lp.y,
        rx: swap ? lp.x : rp.x,
        ry: swap ? lp.y : rp.y,
        lPose: swap ? R.pose : L.pose,
        rPose: swap ? L.pose : R.pose,
        scale,
      });
      while (this.dual.length && now - this.dual[0].t > WINDOW_MS) this.dual.shift();
      if (this.dualMoved(now)) this.dualStillSince = now;

      const shared = L.pose === R.pose && L.pose !== 'unknown' ? L.pose : 'unknown';
      if (shared !== this.dualPose) {
        this.dualPose = shared;
        this.dualPoseSince = now;
      }
      if (shared !== 'unknown' && shared !== this.dualLatched) this.dualLatched = null;
    } else {
      if (now - this.lastDualAt > this.tuning.lostGraceMs) {
        this.dual = [];
        this.dualPose = 'unknown';
        this.dualLatched = null;
      }
    }

    const fired: GestureFiring[] = [
      ...L.fired.map((f) => ({ ...f, side: 'left' as const })),
      ...R.fired.map((f) => ({ ...f, side: 'right' as const })),
    ];

    let dualHold: EngineOutput['hold'] = null;
    const dualReady = this.left.canFire(now) && this.right.canFire(now);

    if (leftOn && rightOn) {
      for (const g of this.gestures) {
        if (g.kind === 'dual-pose') {
          if (this.dualPose !== g.pose || this.dualLatched === g.pose) continue;
          const since = g.pose === 'open' ? Math.max(this.dualPoseSince, this.dualStillSince) : this.dualPoseSince;
          const progress = clamp01((now - since) / (g.holdMs ?? this.tuning.poseHoldMs));
          dualHold = { gestureId: g.id, progress, side: 'both' };
          if (progress >= 1 && dualReady) {
            fired.push({ gestureId: g.id, side: 'both' });
            this.dualLatched = g.pose;
            this.left.absorbCast(now, g.pose);
            this.right.absorbCast(now, g.pose);
            this.dual = [];
          }
        } else if (dualReady && g.kind === 'dual-motion') {
          const hit = detectDualMotion(this.dual, { ...DUAL_MOTION_DEFAULTS, motion: g.motion });
          if (hit) {
            fired.push({ gestureId: g.id, detail: hit.motion, side: 'both' });
            this.left.absorbCast(now);
            this.right.absorbCast(now);
            this.dual = [];
          }
        }
      }
    }

    const hands: TrackedHand[] = [];
    if (L.present) {
      hands.push({
        side: 'left',
        present: true,
        pose: L.pose,
        fingers: L.fingers,
        fingerStates: L.fingerStates,
        cursor: L.cursor,
        landmarks: L.landmarks,
        hold: L.hands[0]?.hold ?? null,
      });
    }
    if (R.present) {
      hands.push({
        side: 'right',
        present: true,
        pose: R.pose,
        fingers: R.fingers,
        fingerStates: R.fingerStates,
        cursor: R.cursor,
        landmarks: R.landmarks,
        hold: R.hands[0]?.hold ?? null,
      });
    }

    const hold = dualHold ?? pickHold(L.hold, R.hold);
    const primary = hold?.side === 'left' ? L : hold?.side === 'right' ? R : R.present ? R : L;
    const cursor =
      hold?.side === 'both' && L.cursor && R.cursor
        ? { x: (L.cursor.x + R.cursor.x) / 2, y: (L.cursor.y + R.cursor.y) / 2 }
        : primary.cursor;

    if (!hands.length) return { ...IDLE, fired: [] };

    return {
      present: true,
      pose: primary.pose,
      fingers: primary.fingers,
      fingerStates: primary.fingerStates,
      cursor,
      hold,
      fired,
      landmarks: primary.landmarks,
      aspect: primary.aspect || L.aspect || R.aspect,
      hands,
    };
  }

  /** Shapes that a live two-hand sign is already claiming (both hands currently showing it). */
  private suppressedPoses(bothHands: boolean): ReadonlySet<PoseName> {
    if (!bothHands || this.dualPose === 'unknown') return NO_SUPPRESS;
    const claimed = this.gestures.some((g) => g.kind === 'dual-pose' && g.pose === this.dualPose);
    return claimed ? new Set<PoseName>([this.dualPose]) : NO_SUPPRESS;
  }

  /** True if either palm travelled more than STILL_TRAVEL palm-lengths within STILL_WINDOW_MS. */
  private dualMoved(now: number): boolean {
    const n = this.dual[this.dual.length - 1];
    for (let i = this.dual.length - 2; i >= 0; i--) {
      const a = this.dual[i];
      if (now - a.t > STILL_WINDOW_MS) break;
      const s = Math.max((a.scale + n.scale) / 2, 1e-6);
      if (Math.hypot(n.lx - a.lx, n.ly - a.ly) / s > STILL_TRAVEL) return true;
      if (Math.hypot(n.rx - a.rx, n.ry - a.ry) / s > STILL_TRAVEL) return true;
    }
    return false;
  }
}

function pickHold(
  a: EngineOutput['hold'],
  b: EngineOutput['hold'],
): EngineOutput['hold'] {
  if (a && b) return a.progress >= b.progress ? a : b;
  return a ?? b;
}
