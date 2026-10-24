import type { PoseName } from './poses.ts';
export interface Sample { t:number; x:number; y:number; pose:PoseName }
export type SwipeDirection = 'left'|'right'|'up'|'down'|'horizontal'; export type SwipeHand = 'open'|'fist'|'point';
export const SWIPE_DEFAULTS = { direction: 'horizontal' as SwipeDirection, minTravel: 1.45, minSpeed: 3.5, hand: 'open' as SwipeHand };
export function detectSwipe(samples: readonly Sample[], o: typeof SWIPE_DEFAULTS): { direction: SwipeDirection } | null { if(samples.length<3)return null; const a=samples[0], b=samples[samples.length-1], dx=b.x-a.x, dy=b.y-a.y, dt=Math.max((b.t-a.t)/1000,.001); const poseOk=o.hand==='open'? b.pose==='open':b.pose===o.hand; if(!poseOk||Math.hypot(dx,dy)<o.minTravel||Math.hypot(dx,dy)/dt<o.minSpeed)return null; const dir=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up'; return o.direction==='horizontal' ? (dir==='left'||dir==='right'?{direction:dir}:null) : dir===o.direction?{direction:dir}:null; }
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
