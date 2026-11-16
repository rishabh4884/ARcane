import type { GestureDef } from '../config/gestures.ts';
import type { Tuning } from '../config/tuning.ts';
import type { BowCharge } from './BowRecognizer.ts';
import { LandmarkSmoother } from '../tracking/LandmarkSmoother.ts';
import { LM, type HandFrame, type HandSide, type Vec3 } from '../tracking/types.ts';
import { clamp01, fingerExtensions, handScale, palmCenter, type FingerName } from './features.ts';
import {
  CIRCLE_DEFAULTS,
  SWIPE_DEFAULTS,
  detectCircle,
  detectSwipe,
  type Sample,
} from './motion.ts';
import {
  FingerStateTracker,
  classifyPose,
  type FingerStates,
  type PoseName,
} from './poses.ts';

export interface GestureFiring {
  gestureId: string;
  /** Human-readable extra, e.g. "left" for a swipe. */
  detail?: string;
  side?: HandSide | 'both';
}

export interface TrackedHand {
  side: HandSide;
  present: boolean;
  pose: PoseName;
  fingers: Record<FingerName, number>;
  fingerStates: FingerStates;
  cursor: { x: number; y: number } | null;
  landmarks: Vec3[] | null;
  aspect: number;
  /** The shape this hand is currently charging, if any. */
  hold: { gestureId: string; progress: number } | null;
}

/** Optional per-frame instructions from a coordinator that sees both hands. */
export interface ProcessContext {
  /** Hand shapes whose single-hand gestures must not charge or fire this frame. */
  suppressPoses?: ReadonlySet<PoseName>;
  /** Pointing strikes, sigils and pointing holds stand down (the hand is aiming a two-hand spell). */
  suppressPointing?: boolean;
  /** Every held sign on this hand stands down (the hand is busy with a two-hand spell). */
  suppressHolds?: boolean;
}

export interface EngineOutput {
  present: boolean;
  pose: PoseName;
  fingers: Record<FingerName, number>;
  fingerStates: FingerStates;
  /** Palm position on screen, 0..1 (mirrored, already gained). */
  cursor: { x: number; y: number } | null;
  /** The pose gesture currently being charged, if any. */
  hold: { gestureId: string; progress: number; side?: HandSide | 'both' } | null;
  bow: BowCharge | null;
  /** Gestures completed on this frame (usually zero or one). */
  fired: GestureFiring[];
  /** Smoothed landmarks, for the debug view. */
  landmarks: Vec3[] | null;
  aspect: number;
  /** Every hand the engine is tracking this frame (one from GestureEngine, up to two from HandsEngine). */
  hands: TrackedHand[];
}

const WINDOW_MS = 1700;
const CURSOR_STEP_BASE = 0.12;
const CURSOR_STEP_PER_MS = 0.0005;
const CURSOR_CONFIRM_BASE = 0.12;
const CURSOR_CONFIRM_PER_MS = 0.004;
const CURSOR_CANDIDATE_MAX_AGE_MS = 100;
/**
 * An open palm that is sweeping is not "holding" a ward. Open-palm holds (Aegis, Eclipse) only
 * charge while the palm stays within this many palm-lengths over this many ms, otherwise every
 * open-hand sweep would charge them on the way.
 */
export const STILL_WINDOW_MS = 220;
export const STILL_TRAVEL = 0.45;
/** Tighter stillness for open-palm holds while an open-hand sweep is also live (pausing ≠ warding). */
const STILL_TRAVEL_SHARED_OPEN = 0.3;
/** A pointing path that turned this far recently is a sigil in progress, not a straight strike. */
const CIRCLE_GUARD_MS = 650;
const CIRCLE_GUARD_TURN = (150 * Math.PI) / 180;
const CIRCLE_GUARD_STEP = 0.12;
/**
 * While a sigil is live, a pointing strike waits this long before casting. If the fingertip keeps
 * curling by more than STRIKE_CURL in that time the player is drawing a circle, not striking.
 */
const STRIKE_CONFIRM_MS = 150;
const STRIKE_CURL = (35 * Math.PI) / 180;
const STRIKE_VETO_MS = 500;
/**
 * A resampled step that turns more than this is a cusp (a raise-then-drop U-turn), not sigil
 * curvature. Circles of the minimum sigil radius turn about 12° per step, so 40° separates them.
 */
const CUSP = (40 * Math.PI) / 180;
/**
 * A hold whose shape also starts a live motion (an open palm while Gale is bound) only begins
 * charging after this much stillness: the pause before a sweep must not become a ward.
 */
const HOLD_COMMIT_MS = 300;
/** After a motion casts, a hold of the same shape cannot start for this long (or until the shape changes). */
const MOTION_LATCH_MS = 900;
/** Crisp poses charge faster and borderline poses slower, bounded to keep holds predictable. */
const CHARGE_RATE_MIN = 0.85;
const CHARGE_RATE_MAX = 1.2;
const NO_FINGERS = { index: 0, middle: 0, ring: 0, pinky: 0 };
const NO_STATES = { index: false, middle: false, ring: false, pinky: false };

const IDLE: EngineOutput = {
  present: false,
  pose: 'unknown',
  fingers: NO_FINGERS,
  fingerStates: NO_STATES,
  cursor: null,
  hold: null,
  bow: null,
  fired: [],
  landmarks: null,
  aspect: 1,
  hands: [],
};

/**
 * Raw hand landmarks in, finished gestures out.
 *
   *   landmarks → One Euro smoothing → joint angles → hysteresis → held pose / cursor
   *             ↘ raw joint angles + palm / fingertip trajectories → strikes and sweeps
 *
 * The engine knows nothing about spells. It reports gesture ids; the SpellBook decides what
 * those mean.
 */
export class GestureEngine {
  private tuning: Tuning;
  private gestures: readonly GestureDef[];
  private readonly smoother: LandmarkSmoother;
  private readonly fingers: FingerStateTracker;
  private readonly motionFingers: FingerStateTracker;

  private palm: Sample[] = [];
  private strikeTip: Sample[] = [];
  private tip: Sample[] = [];
  private scale = 0;
  private pose: PoseName = 'unknown';
  private poseSince = 0;
  /** Last moment the palm or pointing fingertip moved enough to interrupt a hold. */
  private stillSince = 0;
  /** Pose that already cast and has not been left yet (prevents machine-gun repeats). */
  private latched: PoseName | null = null;
  private lastFireAt = -Infinity;
  private lastSeenAt = -Infinity;
  private last: EngineOutput = IDLE;
  private pendingSwipe: { gestureId: string; detail: string; since: number } | null = null;
  private cursorAnchor: { x: number; y: number; t: number } | null = null;
  private cursorCandidate: { x: number; y: number; t: number } | null = null;
  /** Eased 0..1 confidence of the current held shape. */
  private poseConfidence = 0.5;
  private pendingStrike: { gestureId: string; detail: string; since: number } | null = null;
  private motionLatch: { pose: PoseName; until: number } | null = null;
  /** After a motion latch expires, a hold of that shape counts its charge only from that moment. */
  private holdFloor: { pose: PoseName; at: number } | null = null;
  private strikeVetoUntil = -Infinity;

  constructor(gestures: readonly GestureDef[], tuning: Tuning) {
    this.gestures = gestures;
    this.tuning = tuning;
    this.smoother = new LandmarkSmoother(tuning.smoothing);
    this.fingers = new FingerStateTracker(tuning.fingers.on, tuning.fingers.off);
    this.motionFingers = new FingerStateTracker(tuning.fingers.on, tuning.fingers.off);
  }

  /**
   * Which gestures are live. Only gestures bound to a spell should be passed: an unbound gesture
   * that still fires would silently burn the cooldown and wipe the motion buffers.
   */
  setGestures(gestures: readonly GestureDef[]): void {
    this.gestures = gestures;
    this.pendingSwipe = null;
  }

  setTuning(tuning: Tuning): void {
    this.tuning = tuning;
    this.smoother.setParams(tuning.smoothing);
    this.fingers.setThresholds(tuning.fingers.on, tuning.fingers.off);
    this.motionFingers.setThresholds(tuning.fingers.on, tuning.fingers.off);
  }

  /** Feed one camera result (or `null` when no hand was seen). `now` is performance.now(). */
  process(frame: HandFrame | null, now: number, ctx?: ProcessContext): EngineOutput {
    if (!frame) {
      if (now - this.lastSeenAt > this.tuning.lostGraceMs) {
        this.reset();
        this.last = IDLE;
        return IDLE;
      }
      // A brief dropout (motion blur) is bridged: keep state, report no new casts.
      return { ...this.last, fired: [] };
    }
    // A stalled camera/inference loop delivers no null frames. Expire state on recovery
    // as well, or an old half-held sign can instantly cast using unobserved elapsed time.
    if (now - this.lastSeenAt > this.tuning.lostGraceMs) this.reset();
    this.lastSeenAt = now;

    const lm = this.smoother.smooth(frame.landmarks, now);
    const scale = handScale(lm);
    this.scale = this.scale === 0 ? scale : this.scale + (scale - this.scale) * 0.08;

    const ext = fingerExtensions(lm);
    const fingerStates = this.fingers.update(ext);
    const pose = classifyPose(fingerStates, ext);
    if (pose !== this.pose) {
      this.pose = pose;
      this.poseSince = now;
      this.poseConfidence = 0.5;
    }
    this.poseConfidence += (shapeConfidence(ext, fingerStates, this.tuning.fingers) - this.poseConfidence) * 0.25;
    if (pose !== 'unknown' && pose !== this.latched) this.latched = null;
    if (this.motionLatch && ((pose !== 'unknown' && pose !== this.motionLatch.pose) || now >= this.motionLatch.until)) this.motionLatch = null;
    if (this.holdFloor && pose !== 'unknown' && pose !== this.holdFloor.pose) this.holdFloor = null;

    const palm = palmCenter(lm);
    const tip = lm[LM.INDEX_TIP];
    // Palm averaging plus the detector's travel/straightness checks reject jitter without
    // delaying quick flicks behind the visual landmark filter.
    const motionPalm = palmCenter(frame.landmarks);
    // Don't label current motion with a delayed pose from smoothed coordinates. Hysteresis
    // and the detector's multi-sample shape checks still reject transient misclassifications.
    const motionExtensions = fingerExtensions(frame.landmarks);
    const motionPose = classifyPose(this.motionFingers.update(motionExtensions), motionExtensions);
    this.push(this.palm, { t: now, x: motionPalm.x, y: motionPalm.y, scale: this.scale, pose: motionPose }, now);
    const motionTip = frame.landmarks[LM.INDEX_TIP];
    this.push(this.strikeTip, { t: now, x: motionTip.x, y: motionTip.y, scale: this.scale, pose: motionPose }, now);
    this.push(this.tip, { t: now, x: tip.x / this.scale, y: tip.y / this.scale, pose }, now);
    // A pointing hold must not steal a finger strike as its hold timer completes.
    const hasMatchingMotion = this.gestures.some((g) =>
      (g.kind === 'swipe' && (g.hand ?? SWIPE_DEFAULTS.hand) === pose) ||
      (g.kind === 'circle' && pose === 'point'),
    );
    const sharedOpen = pose === 'open' && hasMatchingMotion;
    if (
      this.trailMoved(this.palm, now, sharedOpen ? STILL_TRAVEL_SHARED_OPEN : STILL_TRAVEL) ||
      (hasMatchingMotion && this.trailMoved(pose === 'point' ? this.strikeTip : this.palm, now, 0.12))
    ) this.stillSince = now;
    const circleLive = this.gestures.some((g) => g.kind === 'circle');
    // Never rush a hold whose shape also starts a live motion: that is how holds steal strikes.
    const chargeRate = CHARGE_RATE_MIN + ((hasMatchingMotion ? 1 : CHARGE_RATE_MAX) - CHARGE_RATE_MIN) * this.poseConfidence;

    const fired: GestureFiring[] = [];
    let hold: EngineOutput['hold'] = null;
    const ready = now - this.lastFireAt >= this.tuning.cooldownMs;

    if (this.pendingStrike) {
      const pending = this.pendingStrike;
      if (ctx?.suppressPointing || !ready || !this.gestures.some((g) => g.id === pending.gestureId)) {
        this.pendingStrike = null;
      } else if (Math.abs(this.turning(pending.since)) > STRIKE_CURL || this.recentlyTurned(now)) {
        // Still curling: this is a sigil being drawn. Stay quiet for the rest of the loop.
        this.pendingStrike = null;
        this.strikeVetoUntil = now + STRIKE_VETO_MS;
      } else if (now - pending.since >= STRIKE_CONFIRM_MS) {
        fired.push({ gestureId: pending.gestureId, detail: pending.detail });
        this.pendingStrike = null;
      }
    }

    for (const [index, g] of this.gestures.entries()) {
      if (fired.length) break;
      if (g.kind === 'pose') {
        if (g.pose !== pose || this.latched === pose) continue;
        if (ctx?.suppressPoses?.has(pose) || ctx?.suppressHolds || (ctx?.suppressPointing && pose === 'point')) continue;
        if (this.motionLatch?.pose === pose) continue;
        let since = pose === 'open' || hasMatchingMotion ? Math.max(this.poseSince, this.stillSince) : this.poseSince;
        if (this.holdFloor?.pose === pose) since = Math.max(since, this.holdFloor.at);
        if (hasMatchingMotion) {
          since += HOLD_COMMIT_MS;
          // Not committed yet: show no charge, so a sweep's wind-up never looks like a ward filling.
          if (now < since) continue;
        }
        const progress = clamp01(((now - since) * chargeRate) / (g.holdMs ?? this.tuning.poseHoldMs));
        hold = { gestureId: g.id, progress };
        if (progress >= 1 && ready) {
          fired.push({ gestureId: g.id });
          this.latched = pose;
        }
      } else if (ready && g.kind === 'swipe') {
        if (g.hand === 'point' && ctx?.suppressPointing) continue;
        const trail = g.hand === 'point' ? this.strikeTip : this.palm;
        const hit = detectSwipe(trail, {
          ...SWIPE_DEFAULTS,
          direction: g.direction,
          minTravel: g.minTravel ?? SWIPE_DEFAULTS.minTravel,
          minSpeed: g.minSpeed ?? SWIPE_DEFAULTS.minSpeed,
          hand: g.hand ?? SWIPE_DEFAULTS.hand,
          straightness: g.straightness,
        });
        const pending = this.pendingSwipe?.gestureId === g.id ? this.pendingSwipe : null;
        // A sigil's descending (or rising) arc is not a straight strike. Confirm the stroke over a
        // short window instead of casting on the first qualifying frame.
        if (hit && g.hand === 'point' && circleLive) {
          if (!this.pendingStrike && now >= this.strikeVetoUntil && !this.recentlyTurned(now)) {
            this.pendingStrike = { gestureId: g.id, detail: hit.direction, since: now };
          }
          continue;
        }
        if (hit || pending) {
          // A fast stroke reaches Rise's shorter distance before Phoenix's. Give an earlier,
          // longer gesture at the same speed up to 100 ms to finish, then keep the weaker cast.
          const stronger = this.gestures.slice(0, index).some((candidate) =>
            candidate.kind === 'swipe' &&
            (candidate.hand ?? SWIPE_DEFAULTS.hand) === (g.hand ?? SWIPE_DEFAULTS.hand) &&
            (candidate.minTravel ?? SWIPE_DEFAULTS.minTravel) > (g.minTravel ?? SWIPE_DEFAULTS.minTravel) &&
            detectSwipe(trail, {
              ...SWIPE_DEFAULTS,
              direction: candidate.direction,
              hand: candidate.hand ?? SWIPE_DEFAULTS.hand,
              minTravel: g.minTravel ?? SWIPE_DEFAULTS.minTravel,
              minSpeed: candidate.minSpeed ?? SWIPE_DEFAULTS.minSpeed,
            }) !== null,
          );
          const detail = hit?.direction ?? pending!.detail;
          const since = pending?.since ?? now;
          if (stronger && now - since < 100) {
            this.pendingSwipe = { gestureId: g.id, detail, since };
            break;
          }
          fired.push({ gestureId: g.id, detail });
        }
      } else if (ready && g.kind === 'circle') {
        if (ctx?.suppressPointing) continue;
        const hit = detectCircle(this.tip, {
          ...CIRCLE_DEFAULTS,
          direction: g.direction,
          minRadius: g.minRadius ?? CIRCLE_DEFAULTS.minRadius,
        });
        if (hit) fired.push({ gestureId: g.id, detail: hit.clockwise ? 'cw' : 'ccw' });
      }
    }

    if (fired.length) {
      // A sweep or sigil ends with the hand still in its shape; that must not charge a hold next.
      const firedMotion = this.gestures.find((g) => g.id === fired[0].gestureId);
      if (firedMotion && firedMotion.kind !== 'pose') {
        const shape = firedMotion.kind === 'swipe' ? firedMotion.hand ?? SWIPE_DEFAULTS.hand : 'point';
        this.motionLatch = { pose: shape, until: now + MOTION_LATCH_MS };
        this.holdFloor = { pose: shape, at: now + MOTION_LATCH_MS };
      }
      this.pendingSwipe = null;
      this.pendingStrike = null;
      this.lastFireAt = now;
      this.palm = [];
      this.strikeTip = [];
      this.tip = [];
      hold = null;
    }

    const gain = this.tuning.cursorGain;
    const cursor = this.stabilizeCursor({
      x: clamp01(0.5 + (palm.x / frame.aspect - 0.5) * gain),
      y: clamp01(0.5 + (palm.y - 0.5) * gain),
    }, {
      x: clamp01(0.5 + (motionPalm.x / frame.aspect - 0.5) * gain),
      y: clamp01(0.5 + (motionPalm.y - 0.5) * gain),
    }, now);

    const side = frame.side ?? 'right';
    this.last = {
      present: true,
      pose,
      fingers: ext,
      fingerStates,
      cursor,
      hold: hold ? { ...hold, side } : null,
      bow: null,
      fired: fired.map((f) => ({ ...f, side })),
      landmarks: lm,
      aspect: frame.aspect,
      hands: [
        {
          side,
          present: true,
          pose,
          fingers: ext,
          fingerStates,
          cursor,
          landmarks: lm,
          aspect: frame.aspect,
          hold: hold ? { gestureId: hold.gestureId, progress: hold.progress } : null,
        },
      ],
    };
    return this.last;
  }

  palmTrail(): readonly Sample[] {
    return this.palm;
  }

  currentPose(): PoseName {
    return this.pose;
  }

  poseHeldMs(now: number): number {
    return now - this.poseSince;
  }

  canFire(now: number): boolean {
    return now - this.lastFireAt >= this.tuning.cooldownMs;
  }

  /** Clear motion buffers after a two-hand cast so leftover strokes cannot fire. */
  absorbCast(now: number, latch?: PoseName): void {
    this.pendingSwipe = null;
    this.pendingStrike = null;
    this.lastFireAt = now;
    this.palm = [];
    this.strikeTip = [];
    this.tip = [];
    if (latch) this.latched = latch;
  }

  /**
   * Another recogniser owns this hand for now: drop motion trails and restart hold timers, but do
   * not start a cast pause. Nothing was cast, so the hand must be free to act the moment it is released.
   */
  suspend(now: number): void {
    this.pendingSwipe = null;
    this.pendingStrike = null;
    this.palm = [];
    this.strikeTip = [];
    this.tip = [];
    this.poseSince = now;
    this.stillSince = now;
  }

  reset(): void {
    this.pendingSwipe = null;
    this.pendingStrike = null;
    this.strikeVetoUntil = -Infinity;
    this.motionLatch = null;
    this.holdFloor = null;
    this.smoother.reset();
    this.fingers.reset();
    this.motionFingers.reset();
    this.palm = [];
    this.strikeTip = [];
    this.tip = [];
    this.scale = 0;
    this.pose = 'unknown';
    this.poseSince = 0;
    this.stillSince = 0;
    this.latched = null;
    this.lastFireAt = -Infinity;
    this.lastSeenAt = -Infinity;
    this.last = IDLE;
    this.cursorAnchor = null;
    this.cursorCandidate = null;
    this.poseConfidence = 0.5;
  }

  /**
   * Total turning of the smoothed fingertip path over the recent window, resampled by arc length so
   * that jitter while aiming adds nothing. A straight thrust turns little; a sigil arc turns a lot.
   */
  private recentlyTurned(now: number): boolean {
    return Math.abs(this.turning(now - CIRCLE_GUARD_MS)) > CIRCLE_GUARD_TURN;
  }

  /** Signed turning (radians) of the fingertip path since `from`; reversals are cusps, not curvature. */
  private turning(from: number): number {
    const points: Array<{ x: number; y: number }> = [];
    for (const s of this.tip) {
      if (s.t < from) continue;
      const last = points[points.length - 1];
      if (!last || Math.hypot(s.x - last.x, s.y - last.y) >= CIRCLE_GUARD_STEP) points.push({ x: s.x, y: s.y });
    }
    let turn = 0;
    for (let i = 2; i < points.length; i++) {
      const ax = points[i - 1].x - points[i - 2].x, ay = points[i - 1].y - points[i - 2].y;
      const bx = points[i].x - points[i - 1].x, by = points[i].y - points[i - 1].y;
      const step = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
      if (Math.abs(step) < CUSP) turn += step;
    }
    return turn;
  }

  private stabilizeCursor(
    position: { x: number; y: number },
    rawPosition: { x: number; y: number },
    now: number,
  ): { x: number; y: number } {
    if (!this.cursorAnchor) {
      this.cursorAnchor = { ...position, t: now };
      return position;
    }

    const anchor = this.cursorAnchor;
    const elapsed = Math.min(Math.max(0, now - anchor.t), CURSOR_CANDIDATE_MAX_AGE_MS);
    const maxStep = CURSOR_STEP_BASE + elapsed * CURSOR_STEP_PER_MS;
    const candidate = this.cursorCandidate;
    if (candidate && now - candidate.t <= CURSOR_CANDIDATE_MAX_AGE_MS) {
      const candidateElapsed = Math.max(0, now - candidate.t);
      const confirmStep = CURSOR_CONFIRM_BASE + candidateElapsed * CURSOR_CONFIRM_PER_MS;
      if (distance2d(rawPosition, candidate) <= confirmStep) {
        this.cursorAnchor = { ...position, t: now };
        this.cursorCandidate = null;
        return position;
      }
    }

    const anchorConfirmStep = CURSOR_CONFIRM_BASE + Math.min(elapsed, CURSOR_CANDIDATE_MAX_AGE_MS) * CURSOR_CONFIRM_PER_MS;
    const rawStep = distance2d(rawPosition, anchor);
    const filteredStep = distance2d(position, anchor);
    if (rawStep <= maxStep && filteredStep <= maxStep) {
      this.cursorCandidate = null;
      this.cursorAnchor = { ...position, t: now };
      return position;
    }

    if (rawStep <= anchorConfirmStep) {
      this.cursorCandidate = null;
      return { x: anchor.x, y: anchor.y };
    }

    // Confirm discontinuities with raw samples; the landmark smoother can carry a one-frame
    // tracking spike forward and would otherwise make that spike look like sustained movement.
    this.cursorCandidate = { ...rawPosition, t: now };
    return { x: anchor.x, y: anchor.y };
  }

  private trailMoved(trail: readonly Sample[], now: number, minTravel = STILL_TRAVEL): boolean {
    const newest = trail[trail.length - 1];
    for (let i = trail.length - 2; i >= 0; i--) {
      const s = trail[i];
      if (now - s.t > STILL_WINDOW_MS) break;
      if (Math.hypot(newest.x - s.x, newest.y - s.y) / Math.max(this.scale, 1e-6) > minTravel) return true;
    }
    return false;
  }

  private push(buf: Sample[], s: Sample, now: number): void {
    buf.push(s);
    while (buf.length && now - buf[0].t > WINDOW_MS) buf.shift();
  }
}

/** 0 when any finger sits at its hysteresis edge, 1 when every finger is decisively up or down. */
function shapeConfidence(
  ext: Record<FingerName, number>,
  states: FingerStates,
  band: { on: number; off: number },
): number {
  let confidence = 1;
  for (const finger of Object.keys(states) as FingerName[]) {
    const value = ext[finger];
    if (!Number.isFinite(value)) return 0;
    const margin = states[finger]
      ? (value - band.off) / Math.max(1 - band.off, 1e-6)
      : (band.on - value) / Math.max(band.on, 1e-6);
    confidence = Math.min(confidence, clamp01(margin));
  }
  return confidence;
}

function distance2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
