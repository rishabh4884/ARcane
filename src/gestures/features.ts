import { LM, type Vec3 } from '../tracking/types.ts';
export const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
export type FingerName = typeof FINGERS[number];
export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);
export const handScale = (p: readonly Vec3[]) => Math.max(distance(p[LM.WRIST], p[LM.MIDDLE_MCP]), 0.001);
export const palmCenter = (p: readonly Vec3[]): Vec3 => { const ids = [0,5,9,13,17]; return ids.reduce((a, i) => ({ x:a.x+p[i].x/ids.length, y:a.y+p[i].y/ids.length, z:a.z+p[i].z/ids.length }), {x:0,y:0,z:0}); };
export function fingerExtensions(p: readonly Vec3[]): Record<FingerName, number> { const pairs: Record<FingerName, [number,number]> = { index:[5,8], middle:[9,12], ring:[13,16], pinky:[17,20] }; const s=handScale(p); return Object.fromEntries(FINGERS.map((f) => [f, clamp01((distance(p[pairs[f][0]], p[pairs[f][1]]) / s - .25) / .5)])) as Record<FingerName,number>; }
