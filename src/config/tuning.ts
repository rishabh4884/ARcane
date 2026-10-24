export interface Tuning { smoothing: { minCutoff: number; beta: number; dCutoff: number }; fingers: { on: number; off: number }; poseHoldMs: number; cooldownMs: number; lostGraceMs: number; cursorGain: number }
export const DEFAULT_TUNING: Tuning = {
  smoothing: {
    minCutoff: 1.2,
    beta: 2, // MediaPipe coordinates are normalized to 0..1 rather than pixels.
    dCutoff: 1,
  },
  fingers: { on: 0.68, off: 0.52 },
  poseHoldMs: 450,
  cooldownMs: 600,
  lostGraceMs: 180,
  cursorGain: 1.35,
};
