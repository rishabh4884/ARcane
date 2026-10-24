import type { PoseName } from './poses.ts';

export type DualMotion = 'apart' | 'together' | 'lift' | 'drop';
export interface DualSample {
  t: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  lPose: PoseName;
  rPose: PoseName;
  scale: number;
}

/** Speeds are palm-lengths per second and are evaluated over candidate stroke intervals. */
export const DUAL_MOTION_DEFAULTS = {
  motion: 'apart' as DualMotion,
  minTravel: 0.9,
  minSpeed: 2,
};

const MAX_STROKE_MS = 900;
const MIN_STROKE_MS = 70;
const MAX_SAMPLE_GAP_MS = 180;
const MIN_DIRECTIONAL_RATIO = 0.68;

export function detectDualMotion(
  samples: readonly DualSample[],
  options: typeof DUAL_MOTION_DEFAULTS,
): { motion: DualMotion } | null {
  if (samples.length < 3) return null;
  const end = samples.at(-1)!;
  if (end.lPose !== 'open' || end.rPose !== 'open') return null;
  const oldest = Math.max(0, samples.findIndex((sample) => end.t - sample.t <= MAX_STROKE_MS));

  // Try the shortest recent interval first. Long idle periods cannot dilute speed, and the
  // same elapsed-time stroke is evaluated identically regardless of the camera's sample count.
  for (let startIndex = samples.length - 2; startIndex >= oldest; startIndex -= 1) {
    const start = samples[startIndex];
    const durationMs = end.t - start.t;
    if (durationMs < MIN_STROKE_MS || durationMs > MAX_STROKE_MS) continue;
    const path = samples.slice(startIndex);
    if (path.length < 3 || path.some((sample) => sample.lPose !== 'open' || sample.rPose !== 'open')) continue;
    if (path.some((sample, index) => index > 0 && sample.t - path[index - 1].t > MAX_SAMPLE_GAP_MS)) continue;

    const scale = Math.max((start.scale + end.scale) / 2, 1e-6);
    const seconds = durationMs / 1000;
    const lx = (end.lx - start.lx) / scale;
    const rx = (end.rx - start.rx) / scale;
    const ly = (end.ly - start.ly) / scale;
    const ry = (end.ry - start.ry) / scale;
    let expected: [number, number, number, number];
    if (options.motion === 'apart') expected = [-1, 0, 1, 0];
    else if (options.motion === 'together') expected = [1, 0, -1, 0];
    else if (options.motion === 'lift') expected = [0, -1, 0, -1];
    else expected = [0, 1, 0, 1];

    const deltas = [lx, ly, rx, ry] as const;
    const activeAxes = expected.map((direction, index) => direction === 0 ? -1 : index).filter((index) => index >= 0);
    if (activeAxes.some((i) => deltas[i] * expected[i] < options.minTravel)) continue;
    if (activeAxes.some((i) => deltas[i] * expected[i] / seconds < options.minSpeed)) continue;

    // Reject counter-motions that happen to end far apart. Compare normalized distance, not
    // point counts; a 60fps trace must not get three times the vote of a 20fps trace.
    const forward = [0, 0];
    const backward = [0, 0];
    for (let i = 1; i < path.length; i += 1) {
      const previous = path[i - 1];
      const current = path[i];
      const stepL = (current.lx - previous.lx) * expected[0] + (current.ly - previous.ly) * expected[1];
      const stepR = (current.rx - previous.rx) * expected[2] + (current.ry - previous.ry) * expected[3];
      if (stepL > 0) forward[0] += stepL / scale;
      else backward[0] -= stepL / scale;
      if (stepR > 0) forward[1] += stepR / scale;
      else backward[1] -= stepR / scale;
    }
    if (activeAxes.some((i) => forward[i] / Math.max(forward[i] + backward[i], 1e-6) < MIN_DIRECTIONAL_RATIO)) continue;
    return { motion: options.motion };
  }
  return null;
}
