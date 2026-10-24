import type { Tuning } from '../config/tuning.ts';
import type { Vec3 } from './types.ts';

type SmoothingParams = Tuning['smoothing'];

/** A One Euro low-pass filter over all 3D hand landmarks. */
export class LandmarkSmoother {
  private params: SmoothingParams;
  private previousRaw: Vec3[] = [];
  private filtered: Vec3[] = [];
  private derivative: Vec3[] = [];
  private lastTime: number | null = null;

  constructor(params: SmoothingParams) {
    this.params = { minCutoff: 1.2, beta: 2, dCutoff: 1 };
    this.setParams(params);
  }

  setParams(params: SmoothingParams): void {
    this.params = {
      minCutoff: Number.isFinite(params.minCutoff) ? Math.max(params.minCutoff, 1e-3) : 1.2,
      beta: Number.isFinite(params.beta) ? Math.max(params.beta, 0) : 2,
      dCutoff: Number.isFinite(params.dCutoff) ? Math.max(params.dCutoff, 1e-3) : 1,
    };
  }

  reset(): void {
    this.previousRaw = [];
    this.filtered = [];
    this.derivative = [];
    this.lastTime = null;
  }

  smooth(points: readonly Vec3[], now?: number): Vec3[] {
    if (!points.length) {
      this.reset();
      return [];
    }

    // Keep the original API useful in tests and other callers without a clock.
    const time = Number.isFinite(now) ? now! : (this.lastTime ?? 0) + 1000 / 30;
    const dt = this.lastTime === null ? 0 : (time - this.lastTime) / 1000;
    const valid = points.every(({ x, y, z }) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));

    if (!valid) {
      const fallback = points.length === this.filtered.length
        ? this.filtered
        : points.map(({ x, y, z }) => ({
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            z: Number.isFinite(z) ? z : 0,
          }));
      this.reset();
      return fallback.map(({ x, y, z }) => ({ x, y, z }));
    }

    // A changed landmark count or non-monotonic clock starts a fresh filter.
    if (
      points.length !== this.filtered.length ||
      (this.lastTime !== null && dt <= 0)
    ) {
      this.seed(points, time);
      return points.map(({ x, y, z }) => ({ x, y, z }));
    }

    if (this.lastTime === null) {
      this.seed(points, time);
      return points.map(({ x, y, z }) => ({ x, y, z }));
    }

    const seconds = dt;
    const dAlpha = alpha(this.params.dCutoff, seconds);
    const smoothed = points.map((point, i) => {
      const raw = this.previousRaw[i];
      const previous = this.filtered[i];
      const previousDerivative = this.derivative[i];
      const next: Vec3 = { x: 0, y: 0, z: 0 };
      const nextDerivative: Vec3 = { x: 0, y: 0, z: 0 };

      for (const axis of ['x', 'y', 'z'] as const) {
        const dx = (point[axis] - raw[axis]) / seconds;
        nextDerivative[axis] = lowPass(dx, previousDerivative[axis], dAlpha);
        const cutoff = this.params.minCutoff + this.params.beta * Math.abs(nextDerivative[axis]);
        next[axis] = lowPass(point[axis], previous[axis], alpha(cutoff, seconds));
      }

      this.derivative[i] = nextDerivative;
      return next;
    });

    this.previousRaw = points.map(({ x, y, z }) => ({ x, y, z }));
    this.filtered = smoothed;
    this.lastTime = time;
    return smoothed.map(({ x, y, z }) => ({ x, y, z }));
  }

  private seed(points: readonly Vec3[], time: number): void {
    this.previousRaw = points.map(({ x, y, z }) => ({ x, y, z }));
    this.filtered = points.map(({ x, y, z }) => ({ x, y, z }));
    this.derivative = points.map(() => ({ x: 0, y: 0, z: 0 }));
    this.lastTime = time;
  }
}

function lowPass(value: number, previous: number, a: number): number {
  return a * value + (1 - a) * previous;
}

function alpha(cutoff: number, dt: number): number {
  const safeCutoff = Number.isFinite(cutoff) ? Math.max(cutoff, 1e-3) : 1e-3;
  const tau = 1 / (2 * Math.PI * safeCutoff);
  return 1 / (1 + tau / dt);
}
