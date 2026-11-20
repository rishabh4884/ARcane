import * as THREE from 'three';
import { forestLayout, pathX, seededRandom, terrainHeight, type TreeSite } from './spatial.ts';

/**
 * THE WOOD'S LAYOUT, AS DATA
 * ──────────────────────────
 * Where the ground lies and what it is painted with, and where every tree and stone stands. Pure
 * functions with no rendering, shared by the game (its proxies and collisions) and by the painted-set
 * pipeline (tools/dump-set.ts → art/sets/), so a painting composed in Blender lines up exactly with the
 * ground the creatures walk on and the trunks they pass behind.
 */

export const GROUND = { size: 220, seg: 220 };
/** The casting spot, and the distances at which trees lose detail. */
export const EYE = new THREE.Vector2(0, 17);
export const FULL = 30, MID = 58, SECTORS = 10;

const smooth = (x: number, a: number, b: number) => THREE.MathUtils.smoothstep(x, a, b);
const wave = (x: number, z: number, f: number) =>
  Math.sin(x * f + Math.sin(z * f * 0.7) * 1.3) * 0.5 + Math.sin(z * f * 1.3 + Math.sin(x * f * 0.6 + 2.0)) * 0.5;

export interface GroundData {
  /** (seg+1)² vertices, row-major from (−size/2, −size/2), x fastest. */
  positions: Float32Array;
  colors: Float32Array;
  index: Uint32Array;
}

export function groundData(sites: readonly TreeSite[] = forestLayout()): GroundData {
  const { size, seg } = GROUND;
  const n = seg + 1;
  const positions = new Float32Array(n * n * 3), colors = new Float32Array(n * n * 3);
  const humus = new THREE.Color('#1c2219'), litter = new THREE.Color('#4a3c2a'), soil = new THREE.Color('#5c4d3a');
  const moss = new THREE.Color('#2f3f22'), trampled = new THREE.Color('#463b2c'), grassy = new THREE.Color('#2c3a24');
  const c = new THREE.Color();
  const rnd = seededRandom(771);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -size / 2 + (i / seg) * size, z = -size / 2 + (j / seg) * size;
    const k = j * n + i;
    // A little relief beyond the gameplay terrain: roots and hummocks near trees, never in the lanes.
    let near = 99;
    for (const s of sites) { const d = Math.hypot(x - s.x, z - s.z) / (s.scale * 2.2); if (d < near) near = d; }
    const bump = Math.max(0, 1 - near) * 0.35 * (0.6 + 0.4 * wave(x, z, 1.9));
    positions.set([x, terrainHeight(x, z) + bump, z], k * 3);
    // Painted with intent: worn path, trampled clearing, litter under the canopy, moss at roots,
    // grassy patches in the open, dark humus where the wood closes in.
    const path = 1 - smooth(Math.abs(x - pathX(z)), 0.9, 2.6);
    const clearing = 1 - smooth(Math.hypot(x, z + 12), 8, 17);
    const edge = smooth(Math.hypot(x, z + 8), 22, 48);
    const patch = wave(x, z, 0.21) * 0.5 + 0.5;
    c.copy(grassy).lerp(litter, smooth(patch, 0.35, 0.75));
    c.lerp(humus, edge * 0.8);
    c.lerp(moss, Math.max(0, 1 - near * 0.9) * 0.85);
    c.lerp(trampled, clearing * 0.7);
    c.lerp(soil, path * 0.75);
    const v = 0.85 + rnd() * 0.15;
    colors.set([c.r * v, c.g * v, c.b * v], k * 3);
  }
  const index = new Uint32Array(seg * seg * 6);
  let o = 0;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * n + i, b = a + 1, d = a + n, e = d + 1;
    index.set([a, d, b, b, d, e], o);
    o += 6;
  }
  return { positions, colors, index };
}

export interface TreePlacement { kind: string; x: number; y: number; z: number; scale: number; yaw: number; lod: 0 | 1 | 2; sector: number }

export const TREE_KINDS = ['oak_edge_a', 'oak_edge_b', 'birch_edge_a', 'snag_edge_a'];

/**
 * Oaks hold the clearing, birches stand pale in groups along the edge where the moon finds them, a
 * few dead snags tell what the dark has done.
 */
export function treePlacements(sites: readonly TreeSite[] = forestLayout(), has: (kind: string) => boolean = () => true): TreePlacement[] {
  const rnd = seededRandom(4471);
  const out: TreePlacement[] = [];
  let snags = 0;
  for (const s of sites) {
    const d = Math.hypot(s.x - EYE.x, s.z - EYE.y);
    const lod: 0 | 1 | 2 = d < FULL ? 0 : d < MID ? 1 : 2;
    const r = Math.abs((Math.sin(s.x * 12.9898 + s.z * 78.233) * 43758.5453) % 1);
    const birchGroup = Math.sin(s.x * 0.09 + 1.3) * Math.cos(s.z * 0.07) > 0.55;
    let kind = birchGroup ? 'birch_edge_a' : r < 0.55 ? 'oak_edge_a' : 'oak_edge_b';
    if (lod < 2 && r > 0.93 && snags < 5) { kind = 'snag_edge_a'; snags++; }
    if (!has(kind)) kind = TREE_KINDS.find(has) ?? kind;
    const sector = Math.floor(((Math.atan2(s.x, s.z + 12) / (Math.PI * 2) + 1) % 1) * SECTORS);
    out.push({ kind, x: s.x, y: terrainHeight(s.x, s.z) - 0.05, z: s.z, scale: 0.8 + s.scale * 0.32 + (kind === 'birch_edge_a' ? -0.1 : 0), yaw: rnd() * Math.PI * 2, lod, sector });
  }
  return out;
}

export interface RockPlacement { x: number; y: number; z: number; scale: [number, number, number]; rotation: [number, number, number] }

/** Stones gather: a few clusters near trees and at the clearing's edge, none in the lanes. */
export function rockPlacements(sites: readonly TreeSite[] = forestLayout()): RockPlacement[] {
  const rnd = seededRandom(9932);
  const spots: Array<[number, number, number]> = [];
  for (let i = 0; i < 400 && spots.length < 26; i++) {
    const a = rnd() * Math.PI * 2, r = 12 + rnd() * 50;
    const x = Math.sin(a) * r, z = Math.cos(a) * r - 10;
    if (Math.abs(x - pathX(z)) < 4 || Math.hypot(x, z + 12) < 11 || Math.hypot(x, z - 17) < 7) continue;
    if (sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.scale * 1.6)) continue;
    const cluster = rnd() < 0.6 ? 1 + Math.floor(rnd() * 3) : 1;
    for (let k = 0; k < cluster; k++) spots.push([x + (rnd() - 0.5) * 2.4, z + (rnd() - 0.5) * 2.4, 0.5 + rnd() * (k ? 0.5 : 1.1)]);
  }
  return spots.map(([x, z, s]) => ({
    x, y: terrainHeight(x, z) - 0.12 * s, z,
    rotation: [(rnd() - 0.5) * 0.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.2] as [number, number, number],
    scale: [s, s * (0.8 + rnd() * 0.4), s] as [number, number, number],
  }));
}

export interface GateSite { x: number; y: number; z: number; yaw: number; /** the piers stand this far either side of the centre */ span: number }

/**
 * The forgotten gate: a ruined arch standing over the path where it bends out of sight, the view's
 * destination. Creatures come from beyond it.
 */
export function gateSite(): GateSite {
  const z = -50, x = pathX(z);
  const slope = 6.5 * 0.059 * Math.cos((z + 12) * 0.059);
  return { x, y: terrainHeight(x, z) - 0.05, z, yaw: Math.atan2(slope, 1), span: 2.95 * 1.45 };
}

