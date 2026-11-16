import { LM, type HandSide, type Vec3 } from '../tracking/types.ts';
import { palmCenter } from './features.ts';
import type { TrackedHand } from './GestureEngine.ts';
import type { PoseName } from './poses.ts';

export const BOW_GESTURE_ID = 'bowdraw';

/** Thumb–index gap, in palm lengths. Two channels: full 3D, or a tight on-screen overlap. */
const PINCH_CLOSE_3D = 0.34;
const PINCH_CLOSE_2D = 0.2;
const PINCH_CLOSE_2D_MAX_3D = 0.6;
const PINCH_OPEN_3D = 0.5;
const PINCH_OPEN_2D = 0.32;
/** A thumb this close to the index tip counts as "about to nock" for intent suppression. */
export const PINCH_INTENT = 0.6;
const READY_MS = 100;
const RELEASE_MS = 70;
/** A visibly different aim shape must persist this long before the shot is abandoned. */
const AIM_LOST_MS = 260;
/** Either hand may vanish for this long (motion blur during a fast pull) without cancelling. */
const DROPOUT_MS = 240;
const MIN_START_GAP = 0.25;
const MAX_START_GAP = 6;
const MIN_DRAW = 0.7;
const FULL_DRAW = 1.6;
/**
 * A hand at arm's length is roughly 5–6 palm lengths from the lens. Receding from scale s₀ to s
 * moves it (s₀/s − 1) of that distance, which turns apparent shrinkage into palm lengths of pull.
 */
const DEPTH_PALMS = 5.5;
/** The release flick slightly shortens the draw, so the shot uses the recent peak. */
const PEAK_WINDOW_MS = 200;
const AIM_BREAKERS: ReadonlySet<PoseName> = new Set(['open', 'victory', 'horns', 'trident']);

export interface BowCharge {
  gestureId: string;
  phase: 'arming' | 'drawing' | 'ready';
  progress: number;
  aimSide: HandSide;
  drawSide: HandSide;
}

export interface BowResult {
  engaged: boolean;
  charge: BowCharge | null;
  fired: { gestureId: string; side: HandSide; detail: string } | null;
}

interface BowAttempt {
  aimSide: HandSide;
  drawSide: HandSide;
  since: number;
  initialGap: number;
  initialDrawCenter: Vec3;
  initialDrawScale: number;
  initialAimScale: number;
  awayX: number;
  awayY: number;
  drawRatio: number;
  aimRatio: number;
  releaseSince: number | null;
  aimLostSince: number | null;
  missingSince: number | null;
  peaks: Array<{ t: number; length: number }>;
  lastCharge: BowCharge | null;
}

const QUIET: BowResult = { engaged: false, charge: null, fired: null };

/**
 * Recognises a point-and-pinch bow. The draw is measured relative to both hands, on screen and in
 * depth, so pulling straight back toward the body counts as well as pulling sideways.
 */
export class BowRecognizer {
  private enabled = false;
  private attempt: BowAttempt | null = null;
  private readonly pinched: Record<HandSide, boolean> = { left: false, right: false };

  setEnabled(enabled: boolean): void {
    if (this.enabled !== enabled) this.reset();
    this.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** True while a draw is in progress (including a bridged hand drop-out). */
  get active(): boolean {
    return this.attempt !== null;
  }

  reset(): void {
    this.attempt = null;
    this.pinched.left = false;
    this.pinched.right = false;
  }

  process(
    left: TrackedHand | null,
    right: TrackedHand | null,
    now: number,
    canBegin: boolean,
  ): BowResult {
    if (!this.enabled) return QUIET;
    const attempt = this.attempt;

    if (!left?.landmarks || !right?.landmarks) {
      if (!attempt) {
        this.pinched.left = false;
        this.pinched.right = false;
        return QUIET;
      }
      // Bridge brief drop-outs; a hand that stays gone cancels rather than firing.
      attempt.missingSince ??= now;
      if (now - attempt.missingSince > DROPOUT_MS) {
        this.reset();
        return QUIET;
      }
      return { engaged: true, charge: attempt.lastCharge, fired: null };
    }

    const hands: Record<HandSide, TrackedHand> = { left, right };
    const pinch = {
      left: this.updatePinch(left),
      right: this.updatePinch(right),
    };

    if (!attempt) {
      if (!canBegin) return QUIET;
      const roles = findRoles(left, right, pinch);
      if (!roles) return QUIET;
      const initial = relation(roles.aim, roles.draw);
      if (!Number.isFinite(initial.gap) || initial.gap > MAX_START_GAP || initial.gap < MIN_START_GAP) return QUIET;
      this.attempt = {
        aimSide: roles.aim.side,
        drawSide: roles.draw.side,
        since: now,
        initialGap: initial.gap,
        initialDrawCenter: initial.drawCenter,
        initialDrawScale: palmSize3d(roles.draw.landmarks!),
        initialAimScale: palmSize3d(roles.aim.landmarks!),
        awayX: initial.awayX,
        awayY: initial.awayY,
        drawRatio: 1,
        aimRatio: 1,
        releaseSince: null,
        aimLostSince: null,
        missingSince: null,
        peaks: [],
        lastCharge: null,
      };
      return this.result(now, hands);
    }

    attempt.missingSince = null;
    const aim = hands[attempt.aimSide];
    const draw = hands[attempt.drawSide];

    // Pointing at the lens foreshortens the index finger, so `unknown` (and even `fist`) are
    // common misreads of a steady aim. Only a clearly different shape, held, abandons the shot.
    if (AIM_BREAKERS.has(aim.pose)) {
      attempt.aimLostSince ??= now;
      if (now - attempt.aimLostSince > AIM_LOST_MS) {
        this.reset();
        return QUIET;
      }
    } else {
      attempt.aimLostSince = null;
    }

    const length = this.drawLength(aim, draw, attempt);
    attempt.peaks.push({ t: now, length });
    while (attempt.peaks.length && now - attempt.peaks[0].t > PEAK_WINDOW_MS) attempt.peaks.shift();

    if (pinch[attempt.drawSide]) {
      attempt.releaseSince = null;
    } else {
      attempt.releaseSince ??= now;
      if (now - attempt.releaseSince >= RELEASE_MS) {
        const peak = attempt.peaks.reduce((best, p) => Math.max(best, p.length), length);
        const wasReady = now - attempt.since >= READY_MS;
        this.attempt = null;
        if (wasReady && !AIM_BREAKERS.has(aim.pose) && peak >= MIN_DRAW) {
          return {
            engaged: true,
            charge: null,
            fired: {
              gestureId: BOW_GESTURE_ID,
              side: attempt.aimSide,
              detail: `${Math.round(Math.min(1, peak / FULL_DRAW) * 100)}% draw`,
            },
          };
        }
        return QUIET;
      }
    }

    return this.result(now, hands, length);
  }

  private updatePinch(hand: TrackedHand): boolean {
    const gaps = hand.landmarks ? pinchGaps(hand.landmarks) : null;
    if (!gaps || !Number.isFinite(gaps.gap3)) {
      this.pinched[hand.side] = false;
      return false;
    }
    const closed = gaps.gap3 <= PINCH_CLOSE_3D || (gaps.gap2 <= PINCH_CLOSE_2D && gaps.gap3 <= PINCH_CLOSE_2D_MAX_3D);
    const open = gaps.gap3 >= PINCH_OPEN_3D && gaps.gap2 >= PINCH_OPEN_2D;
    this.pinched[hand.side] = this.pinched[hand.side] ? !open : closed;
    return this.pinched[hand.side];
  }

  private result(now: number, hands: Record<HandSide, TrackedHand>, measured?: number): BowResult {
    const attempt = this.attempt!;
    const drawLength = measured ?? this.drawLength(hands[attempt.aimSide], hands[attempt.drawSide], attempt);
    const progress = Math.min(1, drawLength / FULL_DRAW);
    const phase = now - attempt.since < READY_MS
      ? 'arming'
      : progress >= MIN_DRAW / FULL_DRAW ? 'ready' : 'drawing';
    const charge: BowCharge = { gestureId: BOW_GESTURE_ID, phase, progress, aimSide: attempt.aimSide, drawSide: attempt.drawSide };
    attempt.lastCharge = charge;
    return { engaged: true, charge, fired: null };
  }

  private drawLength(aim: TrackedHand, draw: TrackedHand, attempt: BowAttempt): number {
    const current = relation(aim, draw);
    const scale = Math.max(current.scale, 1e-6);
    const dx = current.drawCenter.x - attempt.initialDrawCenter.x;
    const dy = current.drawCenter.y - attempt.initialDrawCenter.y;
    const drawHandPull = (dx * attempt.awayX + dy * attempt.awayY) / scale;
    const separationGrowth = current.gap - attempt.initialGap;
    // Require the pinching hand itself to move outward, and require the hands to separate.
    // Aim-hand movement alone therefore cannot charge a shot.
    const planar = Math.max(0, Math.min(drawHandPull, separationGrowth));

    // Depth: the drawing hand receding from the lens, relative to the aiming hand so that leaning
    // back with both hands does not count. Ratios are eased to keep MediaPipe scale noise out.
    const drawScale = palmSize3d(draw.landmarks!);
    const aimScale = palmSize3d(aim.landmarks!);
    if (Number.isFinite(drawScale) && drawScale > 1e-6) {
      attempt.drawRatio += (attempt.initialDrawScale / drawScale - attempt.drawRatio) * 0.5;
    }
    if (Number.isFinite(aimScale) && aimScale > 1e-6) {
      attempt.aimRatio += (attempt.initialAimScale / aimScale - attempt.aimRatio) * 0.5;
    }
    const recede = (attempt.drawRatio - 1) * DEPTH_PALMS;
    const relative = (attempt.drawRatio - attempt.aimRatio) * DEPTH_PALMS;
    // Small apparent shrinkage is mostly noise or wrist rotation; ignore it.
    const depth = Math.max(0, Math.min(recede, relative) - 0.15);
    return Math.hypot(planar, depth);
  }
}

function findRoles(
  left: TrackedHand,
  right: TrackedHand,
  pinch: Record<HandSide, boolean>,
): { aim: TrackedHand; draw: TrackedHand } | null {
  if (left.pose === 'point' && !pinch.left && pinch.right) return { aim: left, draw: right };
  if (right.pose === 'point' && !pinch.right && pinch.left) return { aim: right, draw: left };
  return null;
}

/** Thumb-tip to index-tip distance in palm lengths, in 3D and on screen. */
export function pinchGaps(lm: readonly Vec3[]): { gap3: number; gap2: number } {
  const scale = palmSize3d(lm);
  const a = lm[LM.THUMB_TIP];
  const b = lm[LM.INDEX_TIP];
  return {
    gap3: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / scale,
    gap2: Math.hypot(a.x - b.x, a.y - b.y) / scale,
  };
}

/** Palm size from three wrist-to-knuckle bones in 3D: stable while the hand rotates. */
export function palmSize3d(lm: readonly Vec3[]): number {
  const w = lm[LM.WRIST];
  let sum = 0;
  for (const i of [LM.INDEX_MCP, LM.MIDDLE_MCP, LM.PINKY_MCP]) {
    const p = lm[i];
    sum += Math.hypot(p.x - w.x, p.y - w.y, p.z - w.z);
  }
  return Math.max(sum / 3, 1e-3);
}

function relation(aim: TrackedHand, draw: TrackedHand): {
  gap: number;
  scale: number;
  drawCenter: Vec3;
  awayX: number;
  awayY: number;
} {
  if (!aim.landmarks || !draw.landmarks) {
    return { gap: Number.NaN, scale: Number.NaN, drawCenter: { x: 0, y: 0, z: 0 }, awayX: 0, awayY: 0 };
  }
  const a = screenCenter(aim.landmarks, aim.aspect);
  const d = screenCenter(draw.landmarks, draw.aspect);
  const aspect = Math.max(aim.aspect, 1e-3);
  const scale = (screenPalmScale(aim.landmarks, aspect) + screenPalmScale(draw.landmarks, aspect)) / 2;
  const dx = d.x - a.x;
  const dy = d.y - a.y;
  const distance = Math.hypot(dx, dy);
  return {
    gap: distance / Math.max(scale, 1e-6),
    scale,
    drawCenter: d,
    awayX: dx / Math.max(distance, 1e-6),
    awayY: dy / Math.max(distance, 1e-6),
  };
}

function screenCenter(points: readonly Vec3[], aspect: number): Vec3 {
  const center = palmCenter(points);
  return { x: center.x / Math.max(aspect, 1e-3), y: center.y, z: 0 };
}

function screenPalmScale(points: readonly { x: number; y: number; z: number }[], aspect: number): number {
  return Math.hypot((points[LM.MIDDLE_MCP].x - points[LM.WRIST].x) / aspect, points[LM.MIDDLE_MCP].y - points[LM.WRIST].y);
}
