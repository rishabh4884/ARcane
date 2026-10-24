import type { Vec3 } from './types.ts';
export class LandmarkSmoother { constructor(_params: unknown) {} setParams(_params: unknown): void {} reset(): void {} smooth(points: readonly Vec3[], _now?: number): Vec3[] { return points.map((p) => ({ ...p })); } }
