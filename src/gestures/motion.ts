import type { PoseName } from './poses.ts';
export interface Sample { t:number; x:number; y:number; pose:PoseName; scale?:number }
export type SwipeDirection = 'left'|'right'|'up'|'down'|'horizontal'; export type SwipeHand = 'open'|'fist'|'point';
export const SWIPE_DEFAULTS = { direction: 'horizontal' as SwipeDirection, minTravel: 1.45, minSpeed: 3.5, hand: 'open' as SwipeHand };
export interface SwipeOptions { direction: SwipeDirection; minTravel: number; minSpeed: number; hand: SwipeHand; straightness?: number }
export function detectSwipe(samples: readonly Sample[], o: SwipeOptions): { direction: SwipeDirection } | null {
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
  let matchingMs = 0;
  let movingMs = 0;
  let forwardTravel = 0;
  let backwardTravel = 0;
  const speed = Math.hypot(vx, vy);
  for (let i = samples.length - 2; i >= 0; i--) {
    const start = samples[i];
    const next = samples[i + 1];
    const elapsed = (end.t - start.t) / 1000;
    if (elapsed <= 0 || next.t <= start.t || next.t - start.t > 180 || elapsed > 0.5) break;
    // The new shape can arrive on the first moving camera frame. Allow the preceding frame
    // to anchor its onset only after 50ms of newer samples agree on the requested shape.
    // This keeps the confirmation delay stable at both 30 and 60 camera FPS.
    const onset = start.pose !== o.hand && start.pose !== 'unknown';
    if (onset && (matchingMs < 50 || matching !== samples.length - i - 1)) break;
    if (start.pose === o.hand) {
      matching++;
      matchingMs += next.t - start.t;
    }
    const stepX = (next.x - start.x) / scale;
    const stepY = (next.y - start.y) / scale;
    const stepTravel = Math.hypot(stepX, stepY);
    pathLength += stepTravel;
    const projectedStep = stepX * vx / speed + stepY * vy / speed;
    if (projectedStep > 0) {
      forwardTravel += projectedStep;
      movingMs += next.t - start.t;
    } else {
      backwardTravel -= projectedStep;
    }
    if (samples.length - i < 3 || (start.pose !== o.hand && !onset)) continue;

    // Normalize displacement, not absolute positions: hand-size changes alone aren't a swipe.
    const dx = (end.x - start.x) / scale;
    const dy = (end.y - start.y) / scale;
    const travel = Math.hypot(dx, dy);
    // Finger strikes share their trajectory with sigils: a round arc must not qualify
    // as a straight stab merely because its endpoints happen to be far apart.
    const straightness = o.straightness ?? (o.hand === 'point' ? 0.96 : 0.8);
    if (
      movingMs < 45 || forwardTravel / Math.max(forwardTravel + backwardTravel, 1e-6) < 0.68 ||
      travel < o.minTravel || travel / elapsed < o.minSpeed ||
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
const MIN_CIRCLE_MS = 260;
const MAX_CIRCLE_MS = 1500;
const MAX_CIRCLE_GAP_MS = 180;
const FULL_TURN = Math.PI * 2;

export function detectCircle(s: readonly Sample[], o: typeof CIRCLE_DEFAULTS): { clockwise: boolean } | null {
  const end = s.at(-1);
  if (!end || end.pose !== 'point') return null;
  const oldest = Math.max(0, s.findIndex((sample) => end.t - sample.t <= MAX_CIRCLE_MS));

  // Search by elapsed stroke time, not `slice(-31)`: the same circle must have the same
  // geometry at 24, 30, and 60 camera FPS. Trying the shortest complete loop first also
  // ignores a stationary aiming pause before the player starts drawing.
  for (let startIndex = s.length - 8; startIndex >= oldest; startIndex -= 1) {
    const path = s.slice(startIndex);
    const duration = end.t - path[0].t;
    if (duration < MIN_CIRCLE_MS || duration > MAX_CIRCLE_MS) continue;
    if (path.some((sample) => sample.pose !== 'point')) continue;
    if (path.some((sample, index) => index > 0 && sample.t - path[index - 1].t > MAX_CIRCLE_GAP_MS)) continue;

    const xs = path.map((point) => point.x);
    const ys = path.map((point) => point.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = maxX - minX;
    const height = maxY - minY;
    const aspect = width / Math.max(height, 1e-6);
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    const radii = path.map((point) => Math.hypot(point.x - center.x, point.y - center.y));
    const radius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
    if (radius < o.minRadius || aspect < 0.55 || aspect > 1.8) continue;
    if (width < radius * 1.35 || height < radius * 1.35) continue;
    if (Math.hypot(end.x - path[0].x, end.y - path[0].y) > radius * 0.48) continue;

    const radialError = Math.sqrt(radii.reduce((sum, value) => sum + (value - radius) ** 2, 0) / radii.length) / radius;
    if (radialError > 0.38) continue;

    let turn = 0;
    let arcLength = 0;
    const sectors = new Set<number>();
    for (let i = 0; i < path.length; i += 1) {
      let angle = Math.atan2(path[i].y - center.y, path[i].x - center.x);
      if (angle < 0) angle += FULL_TURN;
      sectors.add(Math.floor(angle / FULL_TURN * 8) % 8);
      if (i === 0) continue;
      const previousAngle = Math.atan2(path[i - 1].y - center.y, path[i - 1].x - center.x);
      let delta = angle - previousAngle;
      if (delta > Math.PI) delta -= FULL_TURN;
      if (delta < -Math.PI) delta += FULL_TURN;
      turn += delta;
      arcLength += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    }
    const absoluteTurn = Math.abs(turn);
    const arcRatio = arcLength / Math.max(FULL_TURN * radius, 1e-6);
    if (absoluteTurn < FULL_TURN * 0.9 || absoluteTurn > FULL_TURN * 1.3) continue;
    if (sectors.size < 7 || arcRatio < 0.68 || arcRatio > 1.5) continue;

    const clockwise = turn > 0; // Camera y increases downward, so this sign is visually clockwise.
    return o.direction === 'any' || (o.direction === 'cw') === clockwise ? { clockwise } : null;
  }
  return null;
}
