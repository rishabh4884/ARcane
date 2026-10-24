import type { HandFrame, HandSide, Vec3 } from './types.ts';

/** A lone, newly seen hand takes the model's Left/Right label only above this confidence. */
const SOLO_HINT_CONFIDENCE = 0.7;

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
  private lastSeen = -Infinity;

  bind(frames: readonly HandFrame[], now: number, graceMs: number): { left: HandFrame | null; right: HandFrame | null } {
    const valid = frames.filter((f) => f.landmarks.length === 21);
    if (!valid.length) {
      if (now - this.lastSeen > graceMs) this.prev = { left: null, right: null };
      return { left: null, right: null };
    }
    this.lastSeen = now;

    if (valid.length === 1) return this.bindSolo(valid[0]);

    const a = valid[0];
    const b = valid[1];
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

    this.prev = { left: wrist(left), right: wrist(right) };
    return {
      left: tag(left, 'left'),
      right: tag(right, 'right'),
    };
  }

  reset(): void {
    this.prev = { left: null, right: null };
    this.lastSeen = -Infinity;
  }

  private bindSolo(frame: HandFrame): { left: HandFrame | null; right: HandFrame | null } {
    const w = wrist(frame);
    const dl = this.prev.left ? dist(w, this.prev.left) : Infinity;
    const dr = this.prev.right ? dist(w, this.prev.right) : Infinity;
    const STICK = 0.32;

    let side: HandSide;
    if (dl < STICK || dr < STICK) {
      side = dl + 0.06 <= dr ? 'left' : 'right';
    } else if (frame.side && frame.confidence >= SOLO_HINT_CONFIDENCE) {
      side = frame.side;
    } else {
      const mid = (frame.aspect || 1.333) * 0.5;
      side = w.x < mid ? 'left' : 'right';
    }

    this.prev = {
      left: side === 'left' ? w : null,
      right: side === 'right' ? w : null,
    };
    return side === 'left' ? { left: tag(frame, 'left'), right: null } : { left: null, right: tag(frame, 'right') };
  }

  /** How far this detection is from where the slot's hand was last seen (0.4 if the slot was empty). */
  private cost(frame: HandFrame, side: HandSide): number {
    const prev = this.prev[side];
    return prev ? dist(wrist(frame), prev) : 0.4;
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

const tag = (frame: HandFrame, side: HandSide): HandFrame => (frame.side === side ? frame : { ...frame, side });
