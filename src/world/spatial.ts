import * as THREE from 'three';

/** World units are metres. Y is up; all navigation takes place in X/Z. */
export const WORLD_RADIUS = 76;
export const SPELL_RANGE = 55;
export const EYE_HEIGHT = 1.85;
export const SPAWN = { x: 0, z: 17 };
export const GUARDIAN = { x: 0, z: -12 };
export interface Obstacle { x: number; z: number; radius: number; height: number }
export interface TreeSite extends Obstacle { scale: number; phase: number; tier: number }

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function pathX(z: number): number {
  return Math.sin((z + 12) * 0.059) * 6.5;
}

/** Flatten the guardian clearing; low, continuous hills elsewhere. */
export function terrainHeight(x: number, z: number): number {
  const hills = Math.sin(x * 0.057) * 1.6 + Math.sin(z * 0.064 + x * 0.025) * 1.3
    + Math.cos(x * 0.12 - z * 0.043) * 0.48;
  const clearing = THREE.MathUtils.smoothstep(Math.hypot(x, z + 12), 9, 25);
  return hills * clearing;
}

export function forestLayout(): TreeSite[] {
  const random = seededRandom(0xa7ca9e);
  const sites: TreeSite[] = [];
  // A few deliberate foreground silhouettes frame the first view without closing it.
  const add = (x: number, z: number, scale: number) => {
    sites.push({ x, z, scale, radius: scale * 0.68, height: scale * 14, phase: random() * 6.28, tier: Math.hypot(x, z) > 50 ? 2 : 0 });
  };
  add(-10, 10, 1.6); add(12, 6, 1.8); add(-16, -8, 1.85); add(19, -17, 1.6);
  for (let i = 0; i < 1400 && sites.length < 195; i++) {
    const x = (random() - 0.5) * 188;
    const z = (random() - 0.5) * 188;
    const distance = Math.hypot(x, z);
    if (distance > 95 || distance < 14 || Math.hypot(x, z + 12) < 16) continue;
    if (Math.abs(x - pathX(z)) < 4.5 || Math.hypot(x - 25, z + 13) < 12) continue;
    if (Math.hypot(x + 25, z + 30) < 8 || Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6) continue;
    const scale = 0.85 + random() * 1.25;
    if (sites.some((site) => Math.hypot(site.x - x, site.z - z) < 4 + scale)) continue;
    add(x, z, scale);
  }
  return sites;
}

/** Axis-independent ray/cylinder intersection, including rays starting inside. */
export function intersectObstacle(ray: THREE.Ray, obstacle: Obstacle, maxDistance: number): number | null {
  const ox = ray.origin.x - obstacle.x;
  const oz = ray.origin.z - obstacle.z;
  const a = ray.direction.x ** 2 + ray.direction.z ** 2;
  const base = terrainHeight(obstacle.x, obstacle.z);
  const inside = ox * ox + oz * oz < obstacle.radius ** 2
    && ray.origin.y >= base && ray.origin.y <= base + obstacle.height;
  if (inside) return 0;
  const hits: number[] = [];
  if (Math.abs(ray.direction.y) > 1e-9) {
    for (const y of [base, base + obstacle.height]) {
      const t = (y - ray.origin.y) / ray.direction.y;
      const x = ox + ray.direction.x * t, z = oz + ray.direction.z * t;
      if (t >= 0 && t <= maxDistance && x * x + z * z <= obstacle.radius ** 2) hits.push(t);
    }
  }
  if (a > 1e-9) {
    const b = ox * ray.direction.x + oz * ray.direction.z;
    const discriminant = b * b - a * (ox * ox + oz * oz - obstacle.radius ** 2);
    if (discriminant >= 0) for (const t of [(-b - Math.sqrt(discriminant)) / a, (-b + Math.sqrt(discriminant)) / a]) {
      const y = ray.origin.y + ray.direction.y * t;
      if (t >= 0 && t <= maxDistance && y >= base && y <= base + obstacle.height) hits.push(t);
    }
  }
  if (hits.length) return Math.min(...hits);
  return null;
}

/** March the same height field used by the terrain, then refine to centimetres. */
export function intersectTerrain(ray: THREE.Ray, maxDistance: number): number | null {
  let previous = 0;
  const above = (t: number) => {
    const x = ray.origin.x + ray.direction.x * t;
    const z = ray.origin.z + ray.direction.z * t;
    return ray.origin.y + ray.direction.y * t - terrainHeight(x, z);
  };
  if (above(0) <= 0) return 0;
  for (let t = 0.75; t <= maxDistance + 0.75; t += 0.75) {
    const end = Math.min(t, maxDistance);
    if (above(end) <= 0) {
      let low = previous, high = end;
      for (let i = 0; i < 10; i++) {
        const mid = (low + high) / 2;
        if (above(mid) > 0) low = mid; else high = mid;
      }
      return high;
    }
    previous = end;
  }
  return null;
}

/** Substepped circle collision with sliding; no tunnelling at sprint speed. */
export function moveOnGround(position: THREE.Vector3, dx: number, dz: number, obstacles: readonly Obstacle[]): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.25));
  for (let step = 0; step < steps; step++) {
    position.x += dx / steps;
    position.z += dz / steps;
    for (const obstacle of obstacles) {
      const x = position.x - obstacle.x, z = position.z - obstacle.z;
      const minimum = obstacle.radius + 0.42;
      const distance = Math.hypot(x, z);
      if (distance < minimum) {
        position.x = obstacle.x + (distance > 1e-6 ? x / distance : 1) * minimum;
        position.z = obstacle.z + (distance > 1e-6 ? z / distance : 0) * minimum;
      }
    }
    const distance = Math.hypot(position.x, position.z);
    if (distance > WORLD_RADIUS) {
      position.x *= WORLD_RADIUS / distance;
      position.z *= WORLD_RADIUS / distance;
    }
  }
  position.y = terrainHeight(position.x, position.z) + EYE_HEIGHT;
}

export function screenPointAtDepth(camera: THREE.PerspectiveCamera, x: number, y: number, depth: number, out: THREE.Vector3): void {
  // A camera-space plane, not a sphere or a fixed world-Z plane.
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * depth;
  out.set((x * 2 - 1) * halfHeight * camera.aspect, (1 - y * 2) * halfHeight, -depth).applyMatrix4(camera.matrixWorld);
}

/** Nearest enemy wins only when no opaque surface is in front of it. */
export function chooseRayTarget<T>(
  ray: THREE.Ray, range: number, blockerDistance: number | null,
  candidates: readonly T[], intersect: (candidate: T, ray: THREE.Ray, point: THREE.Vector3) => number | null,
): { point: THREE.Vector3; enemy: T | null } {
  let distance = blockerDistance === null ? range : Math.min(range, Math.max(0, blockerDistance));
  let enemy: T | null = null;
  const point = new THREE.Vector3();
  for (const candidate of candidates) {
    const hit = intersect(candidate, ray, point);
    if (hit !== null && Number.isFinite(hit) && hit >= 0 && hit < distance) { distance = hit; enemy = candidate; }
  }
  return { point: ray.at(distance, new THREE.Vector3()), enemy };
}

