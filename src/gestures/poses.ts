import { FINGERS, type FingerName } from './features.ts';
export type PoseName = 'unknown' | 'fist' | 'victory' | 'horns' | 'trident' | 'point' | 'open';
export type FingerStates = Record<FingerName, boolean>;
export class FingerStateTracker {
  private value: FingerStates = { index: false, middle: false, ring: false, pinky: false };

  constructor(private on: number, private off: number) {}

  setThresholds(on: number, off: number): void {
    this.on = on;
    this.off = off;
  }

  reset(): void {
    this.value = { index: false, middle: false, ring: false, pinky: false };
  }

  update(values: Record<FingerName, number>): FingerStates {
    for (const f of FINGERS) {
      // Preserve hysteresis across unmeasurable joints; classifyPose rejects the frame.
      if (!Number.isFinite(values[f])) continue;
      this.value[f] = this.value[f] ? values[f] > this.off : values[f] >= this.on;
    }
    return { ...this.value };
  }
}
export function classifyPose(s: FingerStates, extensions?: Record<FingerName, number>): PoseName {
  if (extensions && FINGERS.some((f) => !Number.isFinite(extensions[f]))) return 'unknown';
  const k = FINGERS.filter((f) => s[f]);
  // "No finger definitely extended" is not enough to prove a clenched fist.
  // Borderline curl scores must not turn horizontal/occluded hands into an automatic cast.
  if (!k.length) return extensions && FINGERS.some((f) => extensions[f] > 0.35) ? 'unknown' : 'fist';
  if (k.join() === 'index,middle') return 'victory';
  if (k.join() === 'index,pinky') return 'horns';
  if (k.join() === 'index') return 'point';
  if (k.join() === 'index,middle,ring') return 'trident';
  if (k.length === 4) return 'open';
  return 'unknown';
}
