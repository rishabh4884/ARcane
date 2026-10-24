import type { HandFrame, HandSide, Vec3 } from './types.ts';

/** A lone, newly seen hand takes the model's Left/Right label only above this confidence. */
const SOLO_HINT_CONFIDENCE = 0.7;
const PALM_LANDMARKS = [0, 5, 9, 13, 17] as const;
const SECOND_HAND_CONFIRM_FRAMES = 2;
const SECOND_HAND_MAX_GAP_MS = 160;

interface SecondHandCandidate {
  side: HandSide;
  wrist: Vec3;
  scale: number;
  frames: number;
  time: number;
}

/**
 * Keeps two detections pinned to stable left/right slots.
 *
 * MediaPipe's array order (and even its Left/Right label) can flip from frame to
 * frame. Feeding the wrong landmarks into a smoother is what makes two-hand
 * tracking jump. This binder matches by last wrist position. The model's handedness
 * label is never trusted to pair two hands (it is the least reliable signal and is easy
 * to get backwards); the first pairing follows the on-screen layout, which in the mirrored
 * world is exactly what the player sees: left hand on the left. A lone hand may use the
 * label, but only when the model is confident.
 */
export class HandBinder {
  private prev: { left: Vec3 | null; right: Vec3 | null } = { left: null, right: null };
  private lastSeen: Record<HandSide, number> = { left: -Infinity, right: -Infinity };
  private scales: Record<HandSide, number> = { left: 0, right: 0 };
  private secondCandidate: SecondHandCandidate | null = null;

  bind(frames: readonly HandFrame[], now: number, graceMs: number): { left: HandFrame | null; right: HandFrame | null } {
    // Expire slots separately, even if another hand is still visible or camera frames paused.
    // Keeping an absent slot's identity is not the same thing as publishing it as a live hand.
    for (const side of ['left', 'right'] as const) {
      if (now - this.lastSeen[side] > graceMs) this.prev[side] = null;
    }
    const valid = frames.filter((f) => f.landmarks.length === 21 &&
      f.landmarks.every((p) => [p.x, p.y, p.z].every(Number.isFinite)));
    if (!valid.length) {
      this.secondCandidate = null;
      return { left: null, right: null };
    }

    if (valid.length === 1) return this.bindSolo(valid[0], now);

    const a = valid[0];
    const b = valid[1];

    // MediaPipe can briefly return two overlapping hypotheses for one fast-moving hand.
    // Do not turn that into left + right tracks. Prefer continuity when possible; at startup,
    // keep the first model result as a deterministic tie-breaker.
    if (sameDetection(a, b)) {
      this.secondCandidate = null;
      const selected = this.nearestPrevious(a, b);
      return this.bindSolo(selected, now);
    }
    let left: HandFrame;
    let right: HandFrame;

    if (this.prev.left || this.prev.right) {
      const pair = this.pairByContinuity(a, b);
      left = pair.left;
      right = pair.right;
    } else if (wrist(a).x <= wrist(b).x) {
      left = a;
      right = b;
    } else {
      left = b;
      right = a;
    }

    const hasEstablishedPair = this.prev.left !== null && this.prev.right !== null;
    if (!hasEstablishedPair) {
      // Confirm a newly appearing second track on consecutive frames. This keeps a single
      // motion-blurred false positive from lighting up the second cursor for one frame.
      const primarySide: HandSide = this.prev.right && !this.prev.left ? 'right' : 'left';
      const primary = primarySide === 'left' ? left : right;
      const secondary = primarySide === 'left' ? right : left;
      const secondarySide = primarySide === 'left' ? 'right' : 'left';
      const candidateWrist = wrist(secondary);
      const scale = Math.max(distance3(secondary.landmarks[0], secondary.landmarks[9]), 0.001);
      const candidate = this.secondCandidate;
      const stable = candidate &&
        candidate.side === secondarySide &&
        now - candidate.time <= SECOND_HAND_MAX_GAP_MS &&
        dist(candidateWrist, candidate.wrist) <= Math.max(0.08, candidate.scale * 1.25);
      const frames = stable ? candidate.frames + 1 : 1;

      if (frames < SECOND_HAND_CONFIRM_FRAMES) {
        this.secondCandidate = { side: secondarySide, wrist: candidateWrist, scale, frames, time: now };
        this.remember(primary, primarySide, now);
        return primarySide === 'left'
          ? { left: tag(primary, 'left'), right: null }
          : { left: null, right: tag(primary, 'right') };
      }
    }

    this.secondCandidate = null;
    this.remember(left, 'left', now);
    this.remember(right, 'right', now);
    return {
      left: tag(left, 'left'),
      right: tag(right, 'right'),
    };
  }

  reset(): void {
    this.prev = { left: null, right: null };
    this.lastSeen = { left: -Infinity, right: -Infinity };
    this.scales = { left: 0, right: 0 };
    this.secondCandidate = null;
  }

  private bindSolo(frame: HandFrame, now: number): { left: HandFrame | null; right: HandFrame | null } {
    this.secondCandidate = null;
    const w = wrist(frame);
    const dl = this.prev.left ? dist(w, this.prev.left) : Infinity;
    const dr = this.prev.right ? dist(w, this.prev.right) : Infinity;
    const nearest: HandSide = dl <= dr ? 'left' : 'right';
    // A tracking-unit constant alone reassigns fast/near-camera hands too easily. Scale
    // the continuity radius to the palm, and never let a label flip beat a nearby track.
    const stick = Math.max(0.32, this.scales[nearest] * 3);

    let side: HandSide;
    if (Math.min(dl, dr) < stick) {
      side = nearest;
    } else if (frame.side && frame.confidence >= SOLO_HINT_CONFIDENCE) {
      side = frame.side;
    } else {
      const mid = (frame.aspect || 1.333) * 0.5;
      side = w.x < mid ? 'left' : 'right';
    }

    this.remember(frame, side, now);
    return side === 'left' ? { left: tag(frame, 'left'), right: null } : { left: null, right: tag(frame, 'right') };
  }

  private remember(frame: HandFrame, side: HandSide, now: number): void {
    this.prev[side] = wrist(frame);
    this.lastSeen[side] = now;
    this.scales[side] = Math.max(distance3(frame.landmarks[0], frame.landmarks[9]), 0.001);
  }

  /** How far this detection is from where the slot's hand was last seen (0.4 if the slot was empty). */
  private cost(frame: HandFrame, side: HandSide): number {
    const prev = this.prev[side];
    return prev ? dist(wrist(frame), prev) : 0.4;
  }

  private nearestPrevious(a: HandFrame, b: HandFrame): HandFrame {
    const hasPrevious = this.prev.left !== null || this.prev.right !== null;
    if (!hasPrevious) return a;
    const aCost = Math.min(this.cost(a, 'left'), this.cost(a, 'right'));
    const bCost = Math.min(this.cost(b, 'left'), this.cost(b, 'right'));
    return aCost <= bCost ? a : b;
  }

  private pairByContinuity(a: HandFrame, b: HandFrame): { left: HandFrame; right: HandFrame } {
    const ident = this.cost(a, 'left') + this.cost(b, 'right');
    const swapped = this.cost(a, 'right') + this.cost(b, 'left');
    const MARGIN = 0.14;
    if (ident + MARGIN < swapped) return { left: a, right: b };
    if (swapped + MARGIN < ident) return { left: b, right: a };
    // Distances are close (hands crossing): keep whichever detection is nearer the previous left slot.
    const aLeft = this.cost(a, 'left') <= this.cost(b, 'left');
    return aLeft ? { left: a, right: b } : { left: b, right: a };
  }
}

const wrist = (f: HandFrame): Vec3 => f.landmarks[0];

const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y);

function sameDetection(a: HandFrame, b: HandFrame): boolean {
  const scaleA = Math.max(distance3(a.landmarks[0], a.landmarks[9]), 0.001);
  const scaleB = Math.max(distance3(b.landmarks[0], b.landmarks[9]), 0.001);
  const scale = Math.min(scaleA, scaleB);
  const wristGap = distance3(a.landmarks[0], b.landmarks[0]);
  const palmGap = PALM_LANDMARKS.reduce<number>(
    (sum, index) => sum + distance3(a.landmarks[index], b.landmarks[index]),
    0,
  ) / PALM_LANDMARKS.length;

  // Strict geometry catches near-identical duplicates even when the handedness label flips.
  if (wristGap < scale * 0.35 && palmGap < scale * 0.55) return true;

  // Same confident handedness plus strongly overlapping palms is additional evidence, but
  // never enough by itself: two genuine hands may be close together during a dual spell.
  const sameConfidentSide = a.side !== undefined && a.side === b.side && a.confidence >= 0.75 && b.confidence >= 0.75;
  return sameConfidentSide && wristGap < scale * 0.7 && palmGap < scale * 0.8;
}

function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const tag = (frame: HandFrame, side: HandSide): HandFrame => (frame.side === side ? frame : { ...frame, side });
