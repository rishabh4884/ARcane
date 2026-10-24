import { LM, type HandSide, type Vec3 } from '../tracking/types.ts';
import { handScale, palmCenter } from './features.ts';
import type { TrackedHand } from './GestureEngine.ts';

export const BOW_GESTURE_ID = 'bowdraw';

const PINCH_CLOSE = 0.28;
const PINCH_OPEN = 0.44;
const READY_MS = 100;
const RELEASE_MS = 70;
const MAX_START_GAP = 3;
const MIN_DRAW = 0.7;
const FULL_DRAW = 1.6;

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
  awayX: number;
  awayY: number;
  releaseSince: number | null;
  aimLostSince: number | null;
}

const QUIET: BowResult = { engaged: false, charge: null, fired: null };

/** Recognises a point-and-pinch bow, measuring the draw relative to both hands. */
export class BowRecognizer {
  private enabled = false;
  private attempt: BowAttempt | null = null;
  private readonly pinched: Record<HandSide, boolean> = { left: false, right: false };

  setEnabled(enabled: boolean): void {
    if (this.enabled !== enabled) this.reset();
    this.enabled = enabled;
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
    if (!left || !right || !left.landmarks || !right.landmarks) {
      this.reset();
      return QUIET;
    }

    const hands: Record<HandSide, TrackedHand> = { left, right };
    const pinch = {
      left: this.updatePinch(left),
      right: this.updatePinch(right),
    };

    if (!this.attempt) {
      if (!canBegin) return QUIET;
      const roles = findRoles(left, right, pinch);
      if (!roles) return QUIET;
      const initial = relation(roles.aim, roles.draw);
      if (!Number.isFinite(initial.gap) || initial.gap > MAX_START_GAP || initial.gap < 0.25) return QUIET;
      this.attempt = {
        aimSide: roles.aim.side,
        drawSide: roles.draw.side,
        since: now,
        initialGap: initial.gap,
        initialDrawCenter: initial.drawCenter,
        awayX: initial.awayX,
        awayY: initial.awayY,
        releaseSince: null,
        aimLostSince: null,
      };
      return this.result(now, hands);
    }

    const attempt = this.attempt;
    const aim = hands[attempt.aimSide];
    const draw = hands[attempt.drawSide];
    if (!aim.landmarks || !draw.landmarks) {
      this.reset();
      return QUIET;
    }

    if (aim.pose !== 'point') {
      attempt.aimLostSince ??= now;
      if (now - attempt.aimLostSince > RELEASE_MS) {
        this.reset();
        return QUIET;
      }
    } else {
      attempt.aimLostSince = null;
    }

    if (pinch[attempt.drawSide]) {
      attempt.releaseSince = null;
    } else {
      attempt.releaseSince ??= now;
      if (now - attempt.releaseSince >= RELEASE_MS) {
        const drawLength = this.drawLength(aim, draw, attempt);
        const wasReady = now - attempt.since >= READY_MS;
        this.attempt = null;
        if (wasReady && aim.pose === 'point' && drawLength >= MIN_DRAW) {
          return {
            engaged: true,
            charge: null,
            fired: {
              gestureId: BOW_GESTURE_ID,
              side: attempt.aimSide,
              detail: `${Math.round(Math.min(1, drawLength / FULL_DRAW) * 100)}% draw`,
            },
          };
        }
        return QUIET;
      }
    }

    return this.result(now, hands);
  }

  private updatePinch(hand: TrackedHand): boolean {
    if (!hand.landmarks) {
      this.pinched[hand.side] = false;
      return false;
    }
    const lm = hand.landmarks;
    const scale = handScale(lm);
    const gap = distance(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / scale;
    if (!Number.isFinite(gap)) {
      this.pinched[hand.side] = false;
    } else {
      this.pinched[hand.side] = this.pinched[hand.side] ? gap < PINCH_OPEN : gap <= PINCH_CLOSE;
    }
    return this.pinched[hand.side];
  }

  private result(
    now: number,
    hands: Record<HandSide, TrackedHand>,
  ): BowResult {
    const attempt = this.attempt!;
    const aim = hands[attempt.aimSide];
    const draw = hands[attempt.drawSide];
    const drawLength = this.drawLength(aim, draw, attempt);
    const progress = Math.min(1, drawLength / FULL_DRAW);
    const phase = now - attempt.since < READY_MS
      ? 'arming'
      : progress >= MIN_DRAW / FULL_DRAW ? 'ready' : 'drawing';
    return {
      engaged: true,
      charge: { gestureId: BOW_GESTURE_ID, phase, progress, aimSide: attempt.aimSide, drawSide: attempt.drawSide },
      fired: null,
    };
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
    return Math.max(0, Math.min(drawHandPull, separationGrowth));
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

function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
