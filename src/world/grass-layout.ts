import * as THREE from 'three';
import { pathX, seededRandom, terrainHeight, type Obstacle } from './spatial.ts';

export const GRASS_TILE = 8;
export const GRASS_RADIUS = 88;
export interface GrassSite {
  x: number; y: number; z: number;
  angle: number; scale: number; height: number; shade: number; phase: number;
  slopeX: number; slopeZ: number;
}
export interface GrassTile { x: number; z: number; sites: GrassSite[] }

/** No painted blades: this mask only describes where actual geometry should grow. */
export function grassHabitat(x: number, z: number, obstacles: readonly Obstacle[]): number {
  if (Math.hypot(x, z) > GRASS_RADIUS) return 0;
  if (((x - 25) / 8.0) ** 2 + ((z + 15) / 4.9) ** 2 < 1) return 0;
  const pathDistance = Math.abs(x - pathX(z));
  // A worn trail, an irregular short verge, then a full meadow: never a hard rectangle.
  const edge = 1.45 + Math.sin(z * 0.61) * 0.10 + Math.cos(z * 0.27) * 0.12;
  const verge = THREE.MathUtils.smoothstep(pathDistance, edge, edge + 1.4);
  if (verge === 0) return 0;
  for (const obstacle of obstacles) {
    // The spring has its own elliptical exclusion above, not a circular bald patch.
    if (obstacle.x === 25 && obstacle.z === -15) continue;
    if (Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + 0.18) return 0;
  }
  return verge;
}

/** Continuous slope used to attach every blade root to the very same walkable terrain. */
export function groundSlope(x: number, z: number): { x: number; z: number } {
  const step = 0.1;
  return { x: (terrainHeight(x + step, z) - terrainHeight(x - step, z)) / (2 * step),
    z: (terrainHeight(x, z + step) - terrainHeight(x, z - step)) / (2 * step) };
}

export function makeGrassTile(tx: number, tz: number, obstacles: readonly Obstacle[], density = 10.0): GrassTile {
  const random = seededRandom((Math.imul(tx + 97, 73856093) ^ Math.imul(tz + 127, 19349663)) >>> 0);
  const sites: GrassSite[] = [];
  const side = Math.ceil(GRASS_TILE * Math.sqrt(density));
  const spacing = GRASS_TILE / side;
  const x0 = tx * GRASS_TILE, z0 = tz * GRASS_TILE;
  for (let zIndex = 0; zIndex < side; zIndex++) for (let xIndex = 0; xIndex < side; xIndex++) {
    const x = x0 + (xIndex + 0.12 + random() * 0.76) * spacing;
    const z = z0 + (zIndex + 0.12 + random() * 0.76) * spacing;
    const habitat = grassHabitat(x, z, obstacles);
    if (habitat <= 0 || random() > 0.6 + habitat * 0.4) continue;
    const patch = 0.5 + Math.sin(x * 0.21 + Math.sin(z * 0.16) * 1.8) * Math.cos(z * 0.18) * 0.5;
    const slope = groundSlope(x, z);
    sites.push({ x, z, y: terrainHeight(x, z) - 0.016,
      angle: random() * Math.PI * 2,
      scale: 0.85 + random() * 0.4,
      height: (0.67 + patch * 0.35 + random() * 0.25) * (0.24 + habitat * 0.76),
      shade: patch * 0.75 + random() * 0.25,
      phase: random() * Math.PI * 2,
      slopeX: slope.x, slopeZ: slope.z });
  }
  return { x: x0 + GRASS_TILE / 2, z: z0 + GRASS_TILE / 2, sites };
}

export type GrassLod = 'near' | 'middle' | 'far' | 'hidden';
export function grassLod(distance: number): GrassLod {
  return distance < 20 ? 'near' : distance < 39 ? 'middle' : distance < 62 ? 'far' : 'hidden';
}
