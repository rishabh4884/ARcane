import * as THREE from 'three';
import type { Mood } from '../game/campaign.ts';

/**
 * How each reach of the wood looks: fog, sky, and the grade laid over the painted world. The last
 * mood is the Hushwood freed: warm, bright and full of colour.
 */
export interface MoodDef { fog: string; density: number; sky: string; tint: [number, number, number]; lift: [number, number, number]; saturation: number; exposure: number; vignette: number }

export const MOODS: Record<Mood, MoodDef> = {
  edge: { fog: '#222b29', density: 0.023, sky: '#10171a', tint: [1, 1, 1], lift: [0, 0, 0], saturation: 1, exposure: 1, vignette: 0.5 },
  fen: { fog: '#1f2c22', density: 0.027, sky: '#0d1712', tint: [0.9, 1.05, 0.92], lift: [0.0, 0.008, 0.0], saturation: 0.95, exposure: 0.98, vignette: 0.55 },
  deeps: { fog: '#1a1e2b', density: 0.029, sky: '#0a0c15', tint: [0.88, 0.92, 1.1], lift: [0.004, 0.0, 0.012], saturation: 0.92, exposure: 0.94, vignette: 0.6 },
  throne: { fog: '#29292d', density: 0.025, sky: '#131317', tint: [1.0, 0.97, 1.03], lift: [0.008, 0.006, 0.01], saturation: 0.72, exposure: 0.95, vignette: 0.62 },
  dawn: { fog: '#8fae96', density: 0.011, sky: '#b9d6de', tint: [1.55, 1.42, 1.2], lift: [0.06, 0.055, 0.03], saturation: 1.3, exposure: 1.08, vignette: 0.28 },
};

export interface MoodState { fog: THREE.Color; density: number; sky: THREE.Color; tint: THREE.Vector3; lift: THREE.Vector3; saturation: number; exposure: number; vignette: number }

export function moodState(m: MoodDef): MoodState {
  return { fog: new THREE.Color(m.fog), density: m.density, sky: new THREE.Color(m.sky), tint: new THREE.Vector3(...m.tint), lift: new THREE.Vector3(...m.lift), saturation: m.saturation, exposure: m.exposure, vignette: m.vignette };
}

export function lerpMood(out: MoodState, a: MoodState, b: MoodState, t: number): MoodState {
  out.fog.copy(a.fog).lerp(b.fog, t);
  out.sky.copy(a.sky).lerp(b.sky, t);
  out.density = a.density + (b.density - a.density) * t;
  out.tint.copy(a.tint).lerp(b.tint, t);
  out.lift.copy(a.lift).lerp(b.lift, t);
  out.saturation = a.saturation + (b.saturation - a.saturation) * t;
  out.exposure = a.exposure + (b.exposure - a.exposure) * t;
  out.vignette = a.vignette + (b.vignette - a.vignette) * t;
  return out;
}
