import { LM, type Vec3 } from '../tracking/types.ts';
export const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
export type FingerName = typeof FINGERS[number];
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
export const handScale = (p: readonly Vec3[]) => Math.max(distance(p[LM.WRIST], p[LM.MIDDLE_MCP]), 0.001);
export const palmCenter = (p: readonly Vec3[]): Vec3 => { const ids = [0,5,9,13,17]; return ids.reduce((a, i) => ({ x:a.x+p[i].x/ids.length, y:a.y+p[i].y/ids.length, z:a.z+p[i].z/ids.length }), {x:0,y:0,z:0}); };
/** Finger extension from joint bend, independent of finger length and hand orientation. */
export function fingerExtensions(p: readonly Vec3[]): Record<FingerName, number> {
  const bases: Record<FingerName, number> = { index: 5, middle: 9, ring: 13, pinky: 17 };
  const bent = Math.cos(80 * Math.PI / 180);
  const straight = Math.cos(25 * Math.PI / 180);
  return Object.fromEntries(FINGERS.map((finger) => {
    const base = bases[finger];
    const bend = Math.min(
      jointAlignment(p[base], p[base + 1], p[base + 2]),
      jointAlignment(p[base + 1], p[base + 2], p[base + 3]),
    );
    // A flat hand can bend ~90 degrees at the wrist/knuckles while pressing down. Only
    // penalize fingers pointing back into the palm, not straight fingers held horizontally.
    const knuckle = jointAlignment(p[LM.WRIST], p[base], p[base + 1]);
    const knuckleBent = Math.cos(140 * Math.PI / 180);
    const knuckleStraight = Math.cos(95 * Math.PI / 180);
    return [finger, Math.min(
      clamp01((bend - bent) / (straight - bent)),
      clamp01((knuckle - knuckleBent) / (knuckleStraight - knuckleBent)),
    )];
  })) as Record<FingerName, number>;
}

function jointAlignment(a: Vec3, b: Vec3, c: Vec3): number {
  const length = distance(a, b) * distance(b, c);
  // Missing/collapsed joints are uncertain, not evidence that a finger is curled.
  if (!Number.isFinite(length) || length < 1e-10) return Number.NaN;
  return ((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) + (b.z - a.z) * (c.z - b.z)) / length;
}
