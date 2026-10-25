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
/**
 * An open palm that is sweeping is not "holding" a ward. Open-palm holds (Aegis, Eclipse) only
 * charge while the palm stays within this many palm-lengths over this many ms, otherwise every
 * open-hand sweep would charge them on the way.
 */
export const STILL_WINDOW_MS = 220;
export const STILL_TRAVEL = 0.45;
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
    }
    if (pose !== 'unknown' && pose !== this.latched) this.latched = null;

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
    if (
      this.palmMoved(now) ||
      (hasMatchingMotion && this.trailMoved(pose === 'point' ? this.strikeTip : this.palm, now, 0.12))
    ) this.stillSince = now;

    const fired: GestureFiring[] = [];
    let hold: EngineOutput['hold'] = null;
    const ready = now - this.lastFireAt >= this.tuning.cooldownMs;

    for (const [index, g] of this.gestures.entries()) {
      if (fired.length) break;
      if (g.kind === 'pose') {
        if (g.pose !== pose || this.latched === pose) continue;
        if (ctx?.suppressPoses?.has(pose)) continue;
        const since = pose === 'open' || hasMatchingMotion ? Math.max(this.poseSince, this.stillSince) : this.poseSince;
        const progress = clamp01((now - since) / (g.holdMs ?? this.tuning.poseHoldMs));
        hold = { gestureId: g.id, progress };
        if (progress >= 1 && ready) {
          fired.push({ gestureId: g.id });
          this.latched = pose;
        }
      } else if (ready && g.kind === 'swipe') {
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
        const hit = detectCircle(this.tip, {
          ...CIRCLE_DEFAULTS,
          direction: g.direction,
          minRadius: g.minRadius ?? CIRCLE_DEFAULTS.minRadius,
        });
        if (hit) fired.push({ gestureId: g.id, detail: hit.clockwise ? 'cw' : 'ccw' });
      }
    }

    if (fired.length) {
      this.pendingSwipe = null;
      this.lastFireAt = now;
      this.palm = [];
      this.strikeTip = [];
      this.tip = [];
      hold = null;
    }

    const gain = this.tuning.cursorGain;
    const cursor = {
      x: clamp01(0.5 + (palm.x / frame.aspect - 0.5) * gain),
      y: clamp01(0.5 + (palm.y - 0.5) * gain),
    };

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
    this.lastFireAt = now;
    this.palm = [];
    this.strikeTip = [];
    this.tip = [];
    if (latch) this.latched = latch;
  }

  reset(): void {
    this.pendingSwipe = null;
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
  }

  /** True if the palm travelled more than STILL_TRAVEL palm-lengths within the last STILL_WINDOW_MS. */
  private palmMoved(now: number): boolean {
    return this.trailMoved(this.palm, now);
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
