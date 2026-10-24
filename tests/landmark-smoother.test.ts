import { describe, expect, it } from 'vitest';
import { LandmarkSmoother } from '../src/tracking/LandmarkSmoother.ts';
import type { Vec3 } from '../src/tracking/types.ts';

const point = (x: number): Vec3[] => [{ x, y: x * 2, z: -x }];

describe('LandmarkSmoother', () => {
  it('passes through the first sample without mutating its input', () => {
    const smoother = new LandmarkSmoother({ minCutoff: 1.2, beta: 0.08, dCutoff: 1 });
    const input = point(2);

    const output = smoother.smooth(input, 100);

    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output[0]).not.toBe(input[0]);
    output[0].x = 99;
    expect(input[0].x).toBe(2);
  });

  it('reduces high-frequency landmark jitter', () => {
    const smoother = new LandmarkSmoother({ minCutoff: 1.2, beta: 0.08, dCutoff: 1 });
    const values = Array.from({ length: 30 }, (_, i) => (i % 2 ? 0.1 : -0.1));
    const outputs = values.map((value, i) => smoother.smooth(point(value), i * (1000 / 30))[0].x);
    const rawRange = Math.max(...values.slice(2)) - Math.min(...values.slice(2));
    const filteredRange = Math.max(...outputs.slice(2)) - Math.min(...outputs.slice(2));

    expect(filteredRange).toBeLessThan(rawRange * 0.5);
  });

  it('follows fast movement more closely when beta is higher', () => {
    const slow = new LandmarkSmoother({ minCutoff: 1, beta: 0, dCutoff: 1 });
    const responsive = new LandmarkSmoother({ minCutoff: 1, beta: 1, dCutoff: 1 });
    slow.smooth(point(0), 0);
    responsive.smooth(point(0), 0);

    const slowStep = slow.smooth(point(1), 1000 / 30)[0].x;
    const responsiveStep = responsive.smooth(point(1), 1000 / 30)[0].x;

    expect(responsiveStep).toBeGreaterThan(slowStep);
  });

  it('applies updated smoothness parameters without resetting the filter', () => {
    const smoother = new LandmarkSmoother({ minCutoff: 1, beta: 0, dCutoff: 1 });
    smoother.smooth(point(0), 0);
    smoother.setParams({ minCutoff: 4, beta: 0, dCutoff: 1 });

    expect(smoother.smooth(point(1), 1000 / 30)[0].x).toBeGreaterThan(0.3);
  });

  it('starts fresh after reset and after an invalid landmark sample', () => {
    const smoother = new LandmarkSmoother({ minCutoff: 1.2, beta: 0.08, dCutoff: 1 });
    smoother.smooth(point(0), 0);
    smoother.smooth(point(1), 1000 / 30);
    smoother.reset();
    expect(smoother.smooth(point(10), 2000 / 30)[0].x).toBe(10);

    expect(smoother.smooth([{ x: Number.NaN, y: 0, z: 0 }], 100)[0].x).toBe(10);
    expect(smoother.smooth(point(-4), 200)[0].x).toBe(-4);
  });
});
