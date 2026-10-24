import type { PoseName } from './poses.ts';
export interface Sample { t:number; x:number; y:number; pose:PoseName; scale?:number }
export type SwipeDirection = 'left'|'right'|'up'|'down'|'horizontal'; export type SwipeHand = 'open'|'fist'|'point';
export const SWIPE_DEFAULTS = { direction: 'horizontal' as SwipeDirection, minTravel: 1.45, minSpeed: 3.5, hand: 'open' as SwipeHand };
export function detectSwipe(samples: readonly Sample[], o: typeof SWIPE_DEFAULTS): { direction: SwipeDirection } | null {
  if (samples.length < 3) return null;
  const end = samples[samples.length - 1];
  if (end.pose !== o.hand) return null;
  const scale = Math.max(end.scale ?? 1, 1e-6);

  // A stroke must still be moving. Otherwise an old sweep (or a filter settling after it)
  // can fire when the player is already holding still or a cooldown expires.
  let tail = samples.length - 2;
  while (tail > 0 && end.t - samples[tail].t < 80) tail--;
  const tailStart = samples[tail];
  const tailSeconds = (end.t - tailStart.t) / 1000;
  if (tailSeconds <= 0) return null;
  const vx = (end.x - tailStart.x) / scale / tailSeconds;
  const vy = (end.y - tailStart.y) / scale / tailSeconds;
  if (Math.hypot(vx, vy) < o.minSpeed) return null;

  let pathLength = 0;
  let matching = 1;
  let movingSteps = 0;
  for (let i = samples.length - 2; i >= 0; i--) {
    const start = samples[i];
    const next = samples[i + 1];
    const elapsed = (end.t - start.t) / 1000;
    if (elapsed <= 0 || next.t <= start.t || next.t - start.t > 180 || elapsed > 0.5) break;
    // The new shape can arrive on the first moving camera frame. Allow the preceding frame
    // to anchor its onset only after three newer samples agree on the requested shape.
    // A last-frame shape change must never relabel an entire stroke.
    const onset = start.pose !== o.hand && start.pose !== 'unknown';
    if (onset && (matching < 3 || matching !== samples.length - i - 1)) break;
    if (start.pose === o.hand) matching++;
    const stepTravel = Math.hypot(next.x - start.x, next.y - start.y) / scale;
    pathLength += stepTravel;
    if (stepTravel > 0.05 && (next.x - start.x) * vx + (next.y - start.y) * vy > 0) movingSteps++;
    if (samples.length - i < 3 || (start.pose !== o.hand && !onset)) continue;

    // Normalize displacement, not absolute positions: hand-size changes alone aren't a swipe.
    const dx = (end.x - start.x) / scale;
    const dy = (end.y - start.y) / scale;
    const travel = Math.hypot(dx, dy);
    // Finger strikes share their trajectory with sigils: a round arc must not qualify
    // as a straight stab merely because its endpoints happen to be far apart.
    const straightness = o.hand === 'point' ? 0.96 : 0.8;
    if (
      movingSteps < 2 || travel < o.minTravel || travel / elapsed < o.minSpeed ||
      (!onset && matching / (samples.length - i) < 0.8) ||
      travel < pathLength * straightness ||
      (vx * dx + vy * dy) / Math.max(travel, 1e-6) < o.minSpeed
    ) {
      if (onset) break;
      continue;
    }

    const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    return o.direction === 'horizontal'
      ? (direction === 'left' || direction === 'right' ? { direction } : null)
      : (direction === o.direction ? { direction } : null);
  }
  return null;
}
export const CIRCLE_DEFAULTS = { direction: 'any' as 'any'|'cw'|'ccw', minRadius: .55 };
export function detectCircle(s: readonly Sample[], o: typeof CIRCLE_DEFAULTS): { clockwise:boolean } | null {
  if (s.length < 12 || s.at(-1)?.pose !== 'point') return null;
  // Inspect only the newest turn. A short pause in the pointing pose before drawing should not
  // distort the centre or closure of an otherwise clean sigil.
  const path = s.slice(-31);
  const c = path.reduce((a, p) => ({ x: a.x + p.x / path.length, y: a.y + p.y / path.length }), { x: 0, y: 0 });
  const r = path.reduce((n, p) => n + Math.hypot(p.x - c.x, p.y - c.y), 0) / path.length;
  if (r < o.minRadius) return null;

  // A straight Skybolt/Impale stroke can produce an angular jump around its centre. Require a
  // real two-dimensional, closed path before treating it as a sigil.
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const aspect = width / Math.max(height, 1e-6);
  const first = path[0];
  const last = path.at(-1)!;
  if (aspect < 0.55 || aspect > 1.8 || width < r * 1.35 || height < r * 1.35) return null;
  if (Math.hypot(last.x - first.x, last.y - first.y) > r * 0.85) return null;

  let turn = 0;
  for (let i = 1; i < path.length; i++) {
    const a = Math.atan2(path[i - 1].y - c.y, path[i - 1].x - c.x);
    const b = Math.atan2(path[i].y - c.y, path[i].x - c.x);
    let d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    turn += d;
  }
  if (Math.abs(turn) < Math.PI * 1.9) return null;
  const clockwise = turn > 0;
  return o.direction === 'any' || (o.direction === 'cw') === clockwise ? { clockwise } : null;
}
