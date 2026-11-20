import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { butterflies, flowerField, hangingLantern, lanternFlower, rootThrone } from '../cutscene/cast.ts';
import type { LevelDef, Mood } from '../game/campaign.ts';
import type { ForestEnvironment } from './ForestEnvironment.ts';
import type { ParticleSystem } from './particles.ts';
import { ellipsoid, fbm3, lathe, mulberry, tube, type V3 } from './rig/Body.ts';
import { FIGURE_LIGHT } from './rig/figureMaterial.ts';
import { terrainHeight } from './spatial.ts';
import { glowSprite } from './vfx.ts';

/**
 * REGIONS
 * ───────
 * The caster never walks, but the wood moves around them. Each chapter is its own place: the
 * mossy Hushed Edge, the drowned Mirefen with its black water and reeds, the Lantern Deeps under
 * arches of giant roots hung with lanterns and glowworms, and the ash-pale birches of the Unlit
 * Throne. Within a chapter the wood grows denser and darker level by level, and named levels carry
 * their own set pieces: a market, a war camp, a bower of cocoons, a drowned chapel, an orchard of
 * bone, webs, a field of bells, the throne itself.
 */

export type RegionKey = 'edge' | 'fen' | 'deeps' | 'throne' | 'dawn';
export type SetPiece =
  | 'stile' | 'market' | 'warcamp' | 'bower' | 'chapel' | 'coils' | 'heartwood' | 'gallery' | 'lanterns' | 'coldfire'
  | 'orchard' | 'webs' | 'antlerhall' | 'loom' | 'bellfields' | 'origin' | 'lastflower' | 'throne';

export interface RegionSpec { key: RegionKey; depth: number; set?: SetPiece; seed: number }

const SETS: Partial<Record<number, SetPiece>> = {
  5: 'stile', 8: 'market', 9: 'warcamp', 10: 'bower', 15: 'chapel', 19: 'coils', 20: 'heartwood', 22: 'gallery',
  24: 'lanterns', 25: 'coldfire', 26: 'orchard', 27: 'webs', 29: 'antlerhall', 30: 'loom', 33: 'bellfields', 35: 'origin', 36: 'lastflower', 40: 'throne',
};
const CHAPTER_REGION: Record<number, RegionKey> = { 1: 'edge', 2: 'fen', 3: 'deeps', 4: 'throne' };

export function regionFor(level: LevelDef): RegionSpec {
  return { key: CHAPTER_REGION[level.chapter], depth: (level.index - 1) / 9, set: SETS[level.id], seed: level.id * 7919 };
}

/** Regions for cutscenes and the menu, by name. */
export function namedRegion(name: string): RegionSpec {
  const sets: Record<string, RegionSpec> = {
    edge: { key: 'edge', depth: 0.2, seed: 11 }, bower: { key: 'edge', depth: 0.9, set: 'bower', seed: 10 },
    fen: { key: 'fen', depth: 0.4, seed: 14 }, heartwood: { key: 'fen', depth: 1, set: 'heartwood', seed: 20 },
    deeps: { key: 'deeps', depth: 0.3, seed: 21 }, loom: { key: 'deeps', depth: 1, set: 'loom', seed: 30 },
    origin: { key: 'throne', depth: 0.4, set: 'origin', seed: 35 }, throne: { key: 'throne', depth: 1, set: 'throne', seed: 40 },
    dawn: { key: 'dawn', depth: 0, seed: 41 },
  };
  return sets[name] ?? sets.edge;
}

interface Look { trees: [number, number, number]; distant: string; ground: string; grass: [number, number, number]; grassHeight: number; light: Partial<Record<keyof typeof FIGURE_LIGHT, string>> }
const LOOKS: Record<RegionKey, Look> = {
  edge: { trees: [1, 1, 1], distant: '#bdcfc2', ground: '#ffffff', grass: [1, 1, 1], grassHeight: 1, light: { uSky: '#30444a', uGround: '#151c18', uFillColor: '#dcc6a2', uMoonColor: '#a9cadc', uRim: '#a6d6d6', uAir: '#26302f' } },
  fen: { trees: [0.72, 0.86, 0.7], distant: '#8ea489', ground: '#5d6e56', grass: [0.78, 1.0, 0.72], grassHeight: 0.1, light: { uSky: '#2c4436', uGround: '#111a12', uFillColor: '#cfd0a0', uMoonColor: '#a7d2b4', uRim: '#a6dcc0', uAir: '#22302a' } },
  deeps: { trees: [0.55, 0.6, 0.82], distant: '#5e6684', ground: '#5a5f78', grass: [0.55, 0.66, 0.95], grassHeight: 0, light: { uSky: '#262c46', uGround: '#0d0f18', uFillColor: '#c9b48e', uMoonColor: '#98a8e0', uRim: '#a4b4ff', uAir: '#1b1e2c' } },
  throne: { trees: [1.3, 1.3, 1.32], distant: '#c8c6c2', ground: '#b4aea6', grass: [0.82, 0.8, 0.72], grassHeight: 0.32, light: { uSky: '#3c3f44', uGround: '#18181a', uFillColor: '#d8d0c4', uMoonColor: '#c8d0dc', uRim: '#d8dde6', uAir: '#2a2a2e' } },
  dawn: { trees: [1.15, 1.2, 1.05], distant: '#d6e6c8', ground: '#e0ead0', grass: [1.15, 1.3, 0.9], grassHeight: 1, light: { uSky: '#8aa8a8', uGround: '#3a4a30', uFillColor: '#ffe6b8', uMoonColor: '#fff2d8', uRim: '#fff0c8', uAir: '#9ab8a4' } },
};

export const REGION_MOOD: Record<RegionKey, Mood> = { edge: 'edge', fen: 'fen', deeps: 'deeps', throne: 'throne', dawn: 'dawn' };

/* ─────────────────────────────── helpers ─────────────────────────────── */

const CENTRE = new THREE.Vector3(0, 0, -12);

/** Keep only position and normal so different builders can be merged into one draw. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.getIndex()) { const n = g.attributes.position.count; g.setIndex(Array.from({ length: n }, (_, i) => i)); }
  return g;
}

function std(color: THREE.ColorRepresentation, o: { rough?: number; emissive?: THREE.ColorRepresentation; flat?: boolean; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.92, metalness: 0, emissive: o.emissive ?? '#000000', flatShading: o.flat ?? false, side: o.side ?? THREE.FrontSide });
}

/** Carve noise relief into a prop (rock, bark) after it is built. */
function rough(g: THREE.BufferGeometry, amp: number, freq: number, stretch = 1): THREE.BufferGeometry {
  g.computeVertexNormals();
  const p = g.attributes.position as THREE.BufferAttribute, n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = (fbm3(x * freq, y * freq * stretch, z * freq, 3) - 0.5) * 2 * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}

/** A point in a ring around the clearing, clear of the caster and (for tall things) of the lanes. */
function ringPoint(rng: () => number, rMin: number, rMax: number, tall: boolean): THREE.Vector3 {
  for (let k = 0; k < 40; k++) {
    const a = rng() * Math.PI * 2, r = rMin + rng() * (rMax - rMin);
    const x = CENTRE.x + Math.cos(a) * r, z = CENTRE.z + Math.sin(a) * r;
    if (Math.hypot(x, z - 17) < 6) continue;
    if (tall && Math.abs(x) < 7 && z > -26 && z < 16) continue;
    return new THREE.Vector3(x, terrainHeight(x, z), z);
  }
  return new THREE.Vector3(18, terrainHeight(18, -12), -12);
}

/** Rows flanking the clearing on both sides, where tall props frame the fight without hiding it. */
function flankPoint(rng: () => number, near = 8, far = 17): THREE.Vector3 {
  const side = rng() < 0.5 ? -1 : 1;
  const x = side * (near + rng() * (far - near)), z = 12 - rng() * 44;
  return new THREE.Vector3(x, terrainHeight(x, z), z);
}

function placeInstances(mesh: THREE.InstancedMesh, points: THREE.Vector3[], rng: () => number, scale: [number, number], tilt = 0.15): void {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
  points.forEach((p, i) => {
    e.set((rng() - 0.5) * tilt, rng() * Math.PI * 2, (rng() - 0.5) * tilt);
    s.setScalar(scale[0] + rng() * (scale[1] - scale[0]));
    mesh.setMatrixAt(i, m.compose(p, q.setFromEuler(e), s));
  });
  mesh.instanceMatrix.needsUpdate = true;
}

/* ─────────────────────────────── the region set ─────────────────────────────── */

export class Regions {
  readonly group = new THREE.Group();
  private current = '';
  private animated: Array<(t: number, dt: number) => void> = [];
  private time = 0;

  constructor(private readonly env: ForestEnvironment, private readonly particles: ParticleSystem, private readonly mist: ParticleSystem) {
    this.group.name = 'Region';
  }

  get key(): string { return this.current; }

  apply(spec: RegionSpec): void {
    const id = `${spec.key}:${spec.set ?? ''}:${Math.round(spec.depth * 9)}`;
    if (id === this.current) return;
    this.clear();
    this.current = id;
    const look = LOOKS[spec.key];
    // Deeper into a chapter, the wood itself darkens a little.
    const darken = 1 - spec.depth * 0.18;
    this.env.setTint(new THREE.Color(...look.trees).multiplyScalar(darken), new THREE.Color(look.distant).multiplyScalar(darken), new THREE.Color(look.ground).multiplyScalar(darken), new THREE.Color(...look.grass).multiplyScalar(darken), look.grassHeight);
    for (const [k, c] of Object.entries(look.light)) (FIGURE_LIGHT as Record<string, { value: THREE.Color }>)[k].value.set(c);
    const rng = mulberry(spec.seed);
    const build = { edge: this.edge, fen: this.fen, deeps: this.deeps, throne: this.throne, dawn: this.dawn }[spec.key];
    build.call(this, rng, spec.depth);
    if (spec.set) this.set(spec.set, rng);
  }

  update(dt: number): void {
    this.time += dt;
    for (const fn of this.animated) fn(this.time, dt);
  }

  clear(): void {
    this.animated = [];
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        const m = o.material as THREE.Material | THREE.Material[];
        (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
      } else if (o instanceof THREE.Sprite) o.material.dispose();
    });
    this.group.clear();
    this.current = '';
  }

  private add<T extends THREE.Object3D>(o: T): T { this.group.add(o); return o; }

  private merged(parts: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh | null {
    if (!parts.length) return null;
    const g = mergeGeometries(parts.map(plain), false);
    parts.forEach((p) => p.dispose());
    if (!g) return null;
    const mesh = new THREE.Mesh(g, material);
    return this.add(mesh);
  }

  /* ── shared props ── */

  private ferns(rng: () => number, count: number, color: string): void {
    const fronds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const g = ellipsoid([0, 0, 0.32], [0.08, 0.012, 0.34], { widthSegments: 8, heightSegments: 4, deform: (d, p) => { p.y += (p.z + 0.34) * (p.z + 0.34) * -0.9 + 0.25 * (p.z + 0.34); p.x *= 1 - Math.abs(d.z) * 0.5; } });
      g.rotateX(-0.5).rotateY(a);
      fronds.push(plain(g));
    }
    const geometry = mergeGeometries(fronds)!;
    const mesh = new THREE.InstancedMesh(geometry, std(color, { side: THREE.DoubleSide }), count);
    const pts = Array.from({ length: count }, (_, i) => i % 5 === 0
      ? new THREE.Vector3((rng() < 0.5 ? -1 : 1) * (4 + rng() * 6), 0, 9 + rng() * 6)
      : ringPoint(rng, 9, 30, false));
    pts.forEach((p) => { p.y = terrainHeight(p.x, p.z); });
    placeInstances(mesh, pts, rng, [0.9, 1.8]);
    this.add(mesh);
  }

  private boulders(rng: () => number, count: number, stone: string, moss: string): void {
    const rocks: THREE.BufferGeometry[] = [], caps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const p = ringPoint(rng, 10, 32, false), s = 0.5 + rng() * 1.3;
      const r = rough(ellipsoid([0, s * 0.45, 0], [s, s * 0.7, s * 0.85], { widthSegments: 12, heightSegments: 8 }), s * 0.18, 1.6 / s);
      r.rotateY(rng() * 6).translate(p.x, p.y - s * 0.15, p.z);
      rocks.push(r);
      const c = rough(ellipsoid([0, s * 0.9, 0], [s * 0.85, s * 0.22, s * 0.7], { widthSegments: 10, heightSegments: 5 }), s * 0.08, 3 / s);
      c.translate(p.x, p.y - s * 0.15, p.z);
      caps.push(c);
    }
    this.merged(rocks, std(stone, { flat: true }));
    this.merged(caps, std(moss));
  }

  private mushrooms(rng: () => number, count: number, cap: string, glow: number): void {
    const stem = plain(new THREE.CylinderGeometry(0.03, 0.045, 0.22, 7).translate(0, 0.11, 0));
    const capG = plain(lathe([[0.005, 0.3], [0.09, 0.27], [0.13, 0.22], [0.12, 0.2]], { closeTop: true, closeBottom: true, segments: 10 }));
    const stems = new THREE.InstancedMesh(stem, std('#d8ccb0'), count);
    const caps = new THREE.InstancedMesh(capG, new THREE.MeshStandardMaterial({ color: cap, emissive: cap, emissiveIntensity: glow, roughness: 0.6 }), count);
    const pts: THREE.Vector3[] = [];
    while (pts.length < count) {
      const c = ringPoint(rng, 7, 26, false);
      for (let k = 0; k < 5 && pts.length < count; k++) { const p = c.clone().add(new THREE.Vector3((rng() - 0.5) * 1.6, 0, (rng() - 0.5) * 1.6)); p.y = terrainHeight(p.x, p.z); pts.push(p); }
    }
    const r2 = mulberry(Math.floor(rng() * 1e6));
    placeInstances(stems, pts, r2, [0.6, 1.6], 0.3);
    stems.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < count; i++) { const m = new THREE.Matrix4(); stems.getMatrixAt(i, m); caps.setMatrixAt(i, m); }
    caps.instanceMatrix.needsUpdate = true;
    this.add(stems); this.add(caps);
    if (glow > 0.3) for (let i = 0; i < count; i += 4) { const s = glowSprite(cap, 0.7, undefined, 0.35 * glow); s.position.copy(pts[i]).setY(pts[i].y + 0.3); this.add(s); }
  }

  private logs(rng: () => number, count: number): void {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const p = ringPoint(rng, 10, 26, false), a = rng() * Math.PI, len = 3 + rng() * 4;
      const dx = Math.cos(a) * len / 2, dz = Math.sin(a) * len / 2;
      parts.push(rough(tube([[p.x - dx, p.y + 0.25, p.z - dz], [p.x, p.y + 0.32, p.z], [p.x + dx, p.y + 0.22, p.z + dz]], [0.32, 0.36, 0.28], { radial: 10 }), 0.05, 2.2, 0.3));
    }
    this.merged(parts, std('#3b2e22'));
  }

  private emitter(rate: number, spawn: (rng: () => number) => void): void {
    const rng = mulberry(Math.floor(Math.random() * 1e9));
    let acc = 0;
    this.animated.push((_t, dt) => { acc += dt * rate; while (acc > 1) { acc -= 1; spawn(rng); } });
  }

  /* ── chapters ── */

  private edge(rng: () => number, depth: number): void {
    this.ferns(rng, Math.round(70 + depth * 70), '#2f4a2c');
    this.boulders(rng, Math.round(10 + depth * 8), '#5a5f58', '#45602f');
    this.mushrooms(rng, Math.round(20 + depth * 30), '#b8452e', 0.12);
    this.logs(rng, 3 + Math.round(depth * 3));
    // Fireflies drift low over the grass.
    this.emitter(6, (r) => {
      const p = ringPoint(r, 2, 26, false);
      this.particles.emit({ x: p.x, y: p.y + 0.4 + r() * 1.6, z: p.z, vx: (r() - 0.5) * 0.3, vy: 0.05, vz: (r() - 0.5) * 0.3, color: new THREE.Color('#f7d27a'), size: 0.06, sizeEnd: 0.02, ttl: 3 + r() * 2, drag: 0.3, style: 'glow', fadeIn: 0.8 });
    });
  }

  private fen(rng: () => number, depth: number): void {
    // Black water lying over the low ground, the grass standing out of it.
    const geometry = new THREE.PlaneGeometry(90, 90, 90, 90).rotateX(-Math.PI / 2).translate(0, 0, -14);
    const p = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) + 0.07);
    const water = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: { value: 0 }, uDeep: { value: new THREE.Color('#06100c') }, uSky: { value: new THREE.Color('#7f9c90') }, uMoon: { value: new THREE.Vector3(-0.34, 0.5, -0.8).normalize() } },
      vertexShader: '#include <fog_pars_vertex>\nvarying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: `#include <common>
        #include <fog_pars_fragment>
        uniform float uTime; uniform vec3 uDeep; uniform vec3 uSky; uniform vec3 uMoon; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 q = vW.xz;
          // Wind ripples and slow rings from things moving under the surface.
          vec2 g = vec2(n(q * 1.3 + uTime * 0.25) - n(q * 1.3 - vec2(0.7, 0.0) + uTime * 0.25), n(q * 1.3 + vec2(0.0, 0.7) + uTime * 0.2) - n(q * 1.3 - vec2(0.0, 0.7) - uTime * 0.21));
          g += vec2(n(q * 6.0 - uTime), n(q * 6.0 + 3.0 + uTime)) * 0.25 - 0.125;
          vec3 N = normalize(vec3(g.x * 0.35, 1.0, g.y * 0.35));
          vec3 V = normalize(cameraPosition - vW);
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          vec3 col = mix(uDeep, uSky * 0.55, fres);
          col += vec3(0.75, 0.9, 1.0) * pow(max(dot(R, uMoon), 0.0), 180.0) * 1.6;
          col += vec3(0.6, 0.85, 0.7) * pow(max(dot(R, uMoon), 0.0), 18.0) * 0.08;
          // Patchy: open water, then reedy mud, then dry tussocks where the grass takes over.
          float marsh = smoothstep(0.22, 0.48, n(q * 0.12) * 0.7 + n(q * 0.5) * 0.3);
          float alpha = (0.55 + 0.4 * fres) * marsh;
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }`,
    }));
    water.renderOrder = 1;
    this.add(water);
    this.animated.push((t) => { (water.material as THREE.ShaderMaterial).uniforms.uTime.value = t; });
    // Reeds and bulrushes in clumps.
    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, r = 0.06;
      blades.push(plain(tube([[Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r * 2, 0.8, Math.sin(a) * r * 2], [Math.cos(a) * r * 3.5, 1.5 + (i % 3) * 0.25, Math.sin(a) * r * 3.5]], [0.016, 0.01, 0.002], { radial: 3, segments: 5, flatten: { axis: [Math.cos(a), 0, Math.sin(a)], amount: 0.7 } })));
    }
    blades.push(plain(ellipsoid([0.1, 1.45, 0], [0.035, 0.14, 0.035], { widthSegments: 6, heightSegments: 5 })));
    const reedGeo = mergeGeometries(blades)!;
    const reedCount = Math.round(140 + depth * 120);
    const reeds = new THREE.InstancedMesh(reedGeo, std('#4f5b34', { side: THREE.DoubleSide }), reedCount);
    const pts: THREE.Vector3[] = [];
    while (pts.length < reedCount) {
      const c = ringPoint(rng, 6, 32, false);
      for (let k = 0; k < 8 && pts.length < reedCount; k++) { const q = c.clone().add(new THREE.Vector3((rng() - 0.5) * 2.4, 0, (rng() - 0.5) * 2.4)); q.y = terrainHeight(q.x, q.z); pts.push(q); }
    }
    placeInstances(reeds, pts, rng, [0.7, 1.5], 0.25);
    this.add(reeds);
    // Drowned trees: bare, leaning, pale with old water.
    const trunks: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 10 + Math.round(depth * 8); i++) {
      const b = i % 2 === 0 ? flankPoint(rng, 8, 20) : ringPoint(rng, 14, 34, true), lean = (rng() - 0.5) * 2.5, hgt = 6 + rng() * 6;
      const top: V3 = [b.x + lean, b.y + hgt, b.z + (rng() - 0.5) * 2];
      trunks.push(rough(tube([[b.x, b.y - 0.3, b.z], [b.x + lean * 0.3, b.y + hgt * 0.4, b.z], top], [0.45, 0.3, 0.08], { radial: 9 }), 0.06, 1.4, 0.3));
      for (let k = 0; k < 4; k++) {
        const t = 0.45 + k * 0.13, a = rng() * Math.PI * 2, len = 1.2 + rng() * 2;
        const o: V3 = [b.x + lean * t, b.y + hgt * t, b.z];
        trunks.push(tube([o, [o[0] + Math.cos(a) * len * 0.6, o[1] + len * 0.35, o[2] + Math.sin(a) * len * 0.6], [o[0] + Math.cos(a) * len, o[1] + len * 0.2, o[2] + Math.sin(a) * len]], [0.1, 0.05, 0.01], { radial: 5 }));
      }
    }
    this.merged(trunks, std('#8a917f'));
    this.boulders(rng, 8, '#4c5048', '#3f5a30');
    // Fen-lights: cold green motes that wander over the water.
    this.emitter(5, (r) => {
      const q = ringPoint(r, 4, 28, false);
      this.particles.emit({ x: q.x, y: q.y + 0.3 + r() * 1.2, z: q.z, vx: (r() - 0.5) * 0.5, vy: 0.04, vz: (r() - 0.5) * 0.5, color: new THREE.Color('#b8ff9a'), size: 0.08, sizeEnd: 0.03, ttl: 4, drag: 0.2, style: 'glow', fadeIn: 1 });
    });
    this.emitter(2.5, (r) => {
      const q = ringPoint(r, 4, 30, false);
      this.mist.emit({ x: q.x, y: q.y + 0.2, z: q.z, vx: 0.2, vy: 0.02, vz: 0, color: new THREE.Color('#4c5e54'), size: 3, sizeEnd: 6, alpha: 0.12, ttl: 7, drag: 0.1, style: 'mist', fadeIn: 2 });
    });
  }

  private deeps(rng: () => number, depth: number): void {
    // Arches of giant roots close over the clearing like the roof of a cave.
    const arches: THREE.BufferGeometry[] = [], curves: THREE.CatmullRomCurve3[] = [];
    const count = 5 + Math.round(depth * 6);
    for (let i = 0; i < count; i++) {
      const z = 10 - (i / Math.max(1, count - 1)) * 44 + (rng() - 0.5) * 3, span = 18 + rng() * 10, peak = 9 + rng() * 6;
      const sx = (rng() - 0.5) * 6;
      const a = new THREE.Vector3(-span + sx, terrainHeight(-span + sx, z) - 0.5, z + (rng() - 0.5) * 6);
      const b = new THREE.Vector3(span + sx, terrainHeight(span + sx, z) - 0.5, z + (rng() - 0.5) * 6);
      const pts = [a, a.clone().lerp(b, 0.15).setY(peak * 0.7), a.clone().lerp(b, 0.5).setY(peak + rng() * 2), a.clone().lerp(b, 0.85).setY(peak * 0.75), b];
      const curve = new THREE.CatmullRomCurve3(pts);
      curves.push(curve);
      const r0 = 0.6 + rng() * 0.5;
      arches.push(rough(tube(pts.map((p) => [p.x, p.y, p.z] as V3), [r0 * 1.4, r0, r0 * 0.75, r0, r0 * 1.4], { radial: 12, segments: 40 }), r0 * 0.18, 0.9, 0.3));
    }
    this.merged(arches, std('#2c2620'));
    // Glowworms hang from the roots' undersides: thousands of small cold lights.
    const worms = Math.round(500 + depth * 600);
    const positions = new Float32Array(worms * 3), phases = new Float32Array(worms);
    for (let i = 0; i < worms; i++) {
      const c = curves[i % curves.length].getPoint(0.1 + rng() * 0.8);
      positions.set([c.x + (rng() - 0.5) * 1.6, c.y - 0.6 - rng() * 2.2, c.z + (rng() - 0.5) * 1.6], i * 3);
      phases[i] = rng() * 10;
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pg.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    const glowworms = new THREE.Points(pg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
      vertexShader: 'attribute float phase; uniform float uTime; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = 0.45 + 0.55 * (sin(uTime * 1.3 + phase) * 0.5 + 0.5); gl_PointSize = clamp(90.0 / -mv.z, 1.5, 7.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(vec3(0.55, 0.95, 1.0), pow(1.0 - d, 2.0) * vA); }',
    }));
    this.add(glowworms);
    this.animated.push((t) => { (glowworms.material as THREE.ShaderMaterial).uniforms.uTime.value = t; });
    // Lanterns on long chains from the roots.
    for (let i = 0; i < 8 + Math.round(depth * 8); i++) {
      const c = curves[i % curves.length].getPoint(0.2 + rng() * 0.6);
      const l = hangingLantern(1.5 + rng() * 3);
      l.group.position.copy(c);
      l.set(0.55 + rng() * 0.35);
      this.add(l.group);
      const ph = rng() * 6;
      this.animated.push((t) => { l.pivot.rotation.z = Math.sin(t * 0.7 + ph) * 0.06; l.pivot.rotation.x = Math.cos(t * 0.5 + ph) * 0.05; });
    }
    this.mushrooms(rng, Math.round(40 + depth * 50), '#5fe8ff', 0.9);
    this.boulders(rng, 6, '#3c3f4a', '#2f3d4a');
    this.emitter(3, (r) => {
      const q = ringPoint(r, 3, 24, false);
      this.particles.emit({ x: q.x, y: q.y + 2 + r() * 6, z: q.z, vx: 0, vy: -0.15, vz: 0, color: new THREE.Color('#9fe8ff'), size: 0.04, sizeEnd: 0.01, ttl: 6, drag: 0.1, style: 'glow', fadeIn: 1 });
    });
  }

  private throne(rng: () => number, depth: number): void {
    // Ash-pale birches marked with black, standing close.
    const bark: THREE.BufferGeometry[] = [], marks: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 26 + Math.round(depth * 12); i++) {
      const b = i % 3 === 0 ? ringPoint(rng, 14, 34, true) : flankPoint(rng, 7.5, 18), hgt = 11 + rng() * 8, lean = (rng() - 0.5) * 0.8;
      bark.push(tube([[b.x, b.y - 0.4, b.z], [b.x + lean * 0.5, b.y + hgt * 0.5, b.z], [b.x + lean, b.y + hgt, b.z]], [0.32, 0.24, 0.12], { radial: 10 }));
      for (let k = 0; k < 9; k++) {
        const t = rng(), a = rng() * Math.PI * 2, y = b.y + t * hgt * 0.9;
        const r = 0.32 - t * 0.18;
        marks.push(ellipsoid([b.x + lean * t + Math.cos(a) * r * 0.92, y, b.z + Math.sin(a) * r * 0.92], [0.08 + rng() * 0.1, 0.025 + rng() * 0.03, 0.06], { widthSegments: 6, heightSegments: 4, deform: (_d, p) => p.applyAxisAngle(new THREE.Vector3(0, 1, 0), -a) }));
      }
      for (let k = 0; k < 3; k++) {
        const t = 0.6 + k * 0.12, a = rng() * Math.PI * 2, len = 1 + rng() * 1.8;
        const o: V3 = [b.x + lean * t, b.y + hgt * t, b.z];
        bark.push(tube([o, [o[0] + Math.cos(a) * len, o[1] + len * 0.6, o[2] + Math.sin(a) * len]], [0.06, 0.008], { radial: 5 }));
      }
    }
    this.merged(bark, std('#f4f1ea', { emissive: '#4a4842' }));
    this.merged(marks, std('#1c1b1a'));
    // Standing stones, each carved with a crown that someone has scratched out.
    const stones: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5 + Math.round(depth * 4); i++) {
      const p = ringPoint(rng, 13, 28, true), h = 2.5 + rng() * 2;
      const g = rough(ellipsoid([0, h * 0.5, 0], [0.7, h * 0.55, 0.35], { widthSegments: 10, heightSegments: 10 }), 0.12, 1.4);
      g.rotateY(Math.atan2(-p.x, 17 - p.z)).translate(p.x, p.y - 0.2, p.z);
      stones.push(g);
    }
    this.merged(stones, std('#7d7b77', { flat: true }));
    // Ash falls without end.
    this.emitter(40, (r) => {
      const x = (r() - 0.5) * 44, z = -26 + r() * 40;
      this.mist.emit({ x, y: terrainHeight(x, z) + 6 + r() * 6, z, vx: 0.25 + (r() - 0.5) * 0.2, vy: -0.4, vz: 0.05, color: new THREE.Color('#e2dfd8'), size: 0.16, sizeEnd: 0.12, alpha: 0.9, ttl: 16, drag: 0.04, style: 'mist' });
    });
  }

  private dawn(rng: () => number): void {
    this.ferns(rng, 80, '#4f7a3c');
    this.boulders(rng, 8, '#8a8f84', '#7fa04e');
    const field = flowerField(new THREE.Vector3(0, 0, -6), 26, 1100, terrainHeight);
    field.set(1);
    this.add(field.mesh);
    const flies = butterflies(30, new THREE.Vector3(0, terrainHeight(0, -6), -6), 10);
    this.add(flies.group);
    this.animated.push((t) => flies.update(t));
    for (let i = 0; i < 12; i++) {
      const f = lanternFlower(0.8 + rng() * 0.4);
      const p = ringPoint(rng, 6, 18, false);
      f.group.position.copy(p);
      f.set(1, 1);
      this.add(f.group);
    }
  }

  /* ── set pieces ── */

  private set(piece: SetPiece, rng: () => number): void {
    const wood = std('#4a3826'), cloth = std('#6a3a34', { side: THREE.DoubleSide }), stone = std('#6e6b66', { flat: true });
    switch (piece) {
      case 'stile': {
        const parts: THREE.BufferGeometry[] = [];
        for (let x = -16; x <= 16; x += 2) {
          if (Math.abs(x) < 3) continue;
          const z = -20 + Math.sin(x * 0.3) * 1.5, y = terrainHeight(x, z);
          parts.push(tube([[x, y - 0.2, z], [x + 0.05, y + 1.2, z]], [0.07, 0.06], { radial: 6 }));
          parts.push(tube([[x, y + 0.9, z], [x + 2, terrainHeight(x + 2, z) + 0.95, -20 + Math.sin((x + 2) * 0.3) * 1.5]], [0.04, 0.04], { radial: 5 }));
          parts.push(tube([[x, y + 0.45, z], [x + 2, terrainHeight(x + 2, z) + 0.5, -20 + Math.sin((x + 2) * 0.3) * 1.5]], [0.035, 0.035], { radial: 5 }));
        }
        const y0 = terrainHeight(0, -20);
        for (const [h, w] of [[0.35, 0.8], [0.7, 0.8]]) parts.push(plain(new THREE.BoxGeometry(w * 2, 0.06, 0.4).translate(0, y0 + h, -20)));
        this.merged(parts, wood);
        break;
      }
      case 'market': {
        const posts: THREE.BufferGeometry[] = [], awnings: THREE.BufferGeometry[] = [];
        for (const [x, z, a] of [[-11, -8, 0.5], [12, -6, -0.6], [-13, -18, 0.9], [13, -19, -0.9], [-6, -27, 0.2], [7, -28, -0.2]] as const) {
          const y = terrainHeight(x, z);
          const g = new THREE.Group();
          for (const [dx, dz] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) posts.push(plain(new THREE.CylinderGeometry(0.06, 0.07, 2.4, 6).translate(dx, 1.2, dz).rotateY(a).translate(x, y, z)));
          posts.push(plain(new THREE.BoxGeometry(2.4, 0.08, 1.4).translate(0, 0.9, 0).rotateY(a).translate(x, y, z)));
          const aw = new THREE.PlaneGeometry(2.8, 2, 8, 4).rotateX(-Math.PI / 2 + 0.25);
          const ap = aw.attributes.position as THREE.BufferAttribute;
          for (let i = 0; i < ap.count; i++) ap.setY(i, ap.getY(i) - Math.sin((ap.getX(i) / 2.8 + 0.5) * Math.PI) * 0.12 + (fbm3(ap.getX(i) * 3, 0, ap.getZ(i) * 3) - 0.5) * 0.1);
          aw.translate(0, 2.45, 0).rotateY(a).translate(x, y, z);
          awnings.push(plain(aw));
          const l = hangingLantern(0.6);
          l.group.position.set(x, y + 2.3, z);
          l.set(0.05);
          g.add(l.group);
          this.add(g);
        }
        this.merged(posts, wood);
        this.merged(awnings, cloth);
        break;
      }
      case 'warcamp': {
        const stakes: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 40; i++) {
          const a = -Math.PI * 0.85 + (i / 39) * Math.PI * 0.7, r = 22;
          const x = Math.cos(a) * r, z = -12 + Math.sin(a) * r, y = terrainHeight(x, z);
          stakes.push(plain(new THREE.ConeGeometry(0.16, 2.6 + rng() * 0.8, 6).translate(0, 1.2, 0).rotateZ((rng() - 0.5) * 0.3).rotateX(-0.35).translate(x, y, z)));
        }
        this.merged(stakes, wood);
        for (const [x, z] of [[-9, -26], [9, -27], [0, -31]] as const) {
          const y = terrainHeight(x, z);
          this.merged([tube([[x, y, z], [x, y + 4.5, z]], [0.07, 0.05], { radial: 6 })], wood);
          const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2, 6, 10), std('#5b1f1a', { side: THREE.DoubleSide }));
          banner.position.set(x + 0.62, y + 3.3, z);
          this.add(banner);
          const bp = banner.geometry.attributes.position as THREE.BufferAttribute, base = Float32Array.from(bp.array as Float32Array);
          this.animated.push((t) => { for (let i = 0; i < bp.count; i++) bp.setZ(i, Math.sin(t * 2.2 + base[i * 3] * 3 + base[i * 3 + 1]) * 0.12 * (base[i * 3] + 0.6)); bp.needsUpdate = true; });
        }
        // A bonfire throwing sparks.
        const fx = 0, fz = -22, fy = terrainHeight(fx, fz);
        this.merged(Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI; return tube([[fx + Math.cos(a) * 1, fy + 0.1, fz + Math.sin(a) * 1], [fx - Math.cos(a) * 1, fy + 0.25, fz - Math.sin(a) * 1]], [0.12, 0.1], { radial: 6 }); }), std('#2a1d14'));
        const fire = glowSprite('#ff9a4a', 2.6, undefined, 0.8);
        fire.position.set(fx, fy + 0.9, fz);
        this.add(fire);
        this.animated.push((t) => { fire.material.opacity = 0.65 + Math.sin(t * 13) * 0.1 + Math.sin(t * 7.3) * 0.08; });
        this.emitter(30, (r) => this.particles.emit({ x: fx + (r() - 0.5) * 0.8, y: fy + 0.4, z: fz + (r() - 0.5) * 0.8, vx: (r() - 0.5) * 0.6, vy: 1.6 + r() * 1.5, vz: (r() - 0.5) * 0.6, color: new THREE.Color(r() < 0.5 ? '#ff8a3d' : '#ffd08a'), size: 0.14, sizeEnd: 0.01, ttl: 1.2, drag: 0.6, gravity: -0.5, style: 'glow' }));
        break;
      }
      case 'bower': case 'loom': {
        // Cocoons hang on silk from the canopy, swaying slightly.
        const silk = new THREE.MeshBasicMaterial({ color: '#d8d2c4', transparent: true, opacity: 0.45 });
        for (let i = 0; i < 26; i++) {
          const p = ringPoint(rng, 7, 24, false), top = p.y + 9 + rng() * 5, hang = 3 + rng() * 4;
          const g = new THREE.Group();
          g.position.set(p.x, top, p.z);
          g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, hang, 3).translate(0, -hang / 2, 0), silk));
          const c = new THREE.Mesh(plain(rough(ellipsoid([0, -hang - 0.5, 0], [0.28, 0.6, 0.28], { widthSegments: 10, heightSegments: 10 }), 0.05, 6, 0.4)), std('#c9c0ae'));
          g.add(c);
          this.add(g);
          const ph = rng() * 6;
          this.animated.push((t) => { g.rotation.z = Math.sin(t * 0.6 + ph) * 0.05; g.rotation.x = Math.cos(t * 0.45 + ph) * 0.04; });
        }
        if (piece === 'loom') this.webs(rng, 7);
        break;
      }
      case 'webs': this.webs(rng, 10); break;
      case 'chapel': {
        // A drowned chapel: two broken walls and a pointed arch where the window was.
        const z = -27, parts: THREE.BufferGeometry[] = [];
        for (const sx of [-1, 1]) {
          for (let row = 0; row < 7; row++) for (let k = 0; k < 4; k++) {
            if (row > 4 + k % 2 && sx > 0) continue;
            const x = sx * (3.2 + k * 1.05), y = terrainHeight(x, z) + row * 0.62 + 0.2;
            parts.push(rough(plain(new THREE.BoxGeometry(1, 0.58, 0.8, 2, 2, 2)).translate(x + (row % 2) * 0.3, y, z + (rng() - 0.5) * 0.1), 0.03, 4));
          }
        }
        const arch: V3[] = [];
        for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI; arch.push([Math.cos(a) * 2.6, terrainHeight(0, z) + 4.2 + Math.sin(a) * 2.2 * (1 + 0.2 * Math.sin(a)), z]); }
        parts.push(tube(arch, [0.4], { radial: 6, segments: 30 }));
        for (const x of [-2.6, 2.6]) parts.push(rough(tube([[x, terrainHeight(x, z) - 0.2, z], [x, terrainHeight(x, z) + 4.3, z]], [0.42, 0.38], { radial: 8 }), 0.04, 3));
        this.merged(parts, stone);
        break;
      }
      case 'coils': {
        const ribs: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 9; i++) {
          const z = -30 + i * 2.6, w = 4.5 - Math.abs(i - 4) * 0.35;
          ribs.push(tube([[-w, terrainHeight(-w, z) - 0.4, z], [-w * 0.7, 3.5 - Math.abs(i - 4) * 0.2, z], [0, 4.6 - Math.abs(i - 4) * 0.25, z], [w * 0.7, 3.5 - Math.abs(i - 4) * 0.2, z], [w, terrainHeight(w, z) - 0.4, z]], [0.22, 0.18, 0.15, 0.18, 0.22], { radial: 8, segments: 20 }));
        }
        this.merged(ribs, std('#c9bea4'));
        break;
      }
      case 'heartwood': {
        const roots: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2, r0 = 4, r1 = 16 + rng() * 6;
          const p0: V3 = [Math.cos(a) * r0, terrainHeight(Math.cos(a) * r0, -20 + Math.sin(a) * r0) - 0.5, -20 + Math.sin(a) * r0];
          const p1: V3 = [Math.cos(a) * (r0 + r1) * 0.5, 1.8 + rng() * 1.5, -20 + Math.sin(a) * (r0 + r1) * 0.5];
          const p2: V3 = [Math.cos(a) * r1, terrainHeight(Math.cos(a) * r1, -20 + Math.sin(a) * r1) - 0.3, -20 + Math.sin(a) * r1];
          roots.push(rough(tube([p0, p1, p2], [1.0, 0.7, 0.35], { radial: 10, segments: 24 }), 0.12, 1.2, 0.4));
        }
        this.merged(roots, std('#3a2c20'));
        const heart = glowSprite('#ffd27a', 7, undefined, 0.45);
        heart.position.set(0, terrainHeight(0, -20) + 0.6, -20);
        this.add(heart);
        this.animated.push((t) => { heart.material.opacity = 0.35 + Math.sin(t * 1.4) * 0.1; });
        break;
      }
      case 'gallery': {
        // Extra glowworms in a low cloud over the clearing.
        this.emitter(20, (r) => { const q = ringPoint(r, 0, 20, false); this.particles.emit({ x: q.x, y: q.y + 3 + r() * 5, z: q.z, vx: 0, vy: 0.02, vz: 0, color: new THREE.Color('#9fe8ff'), size: 0.05, sizeEnd: 0.02, ttl: 5, drag: 0.1, style: 'glow', fadeIn: 1 }); });
        break;
      }
      case 'lanterns': {
        for (let i = 0; i < 26; i++) {
          const p = ringPoint(rng, 5, 22, false);
          const l = hangingLantern(1 + rng() * 2.5);
          l.group.position.set(p.x, p.y + 6 + rng() * 4, p.z);
          l.set(0.5 + rng() * 0.4);
          this.add(l.group);
          const ph = rng() * 6;
          this.animated.push((t) => { l.pivot.rotation.z = Math.sin(t * 0.8 + ph) * 0.07; });
        }
        break;
      }
      case 'coldfire': {
        for (let i = 0; i < 9; i++) {
          const p = ringPoint(rng, 7, 20, false);
          this.merged([rough(ellipsoid([p.x, p.y + 0.2, p.z], [0.6, 0.35, 0.5], { widthSegments: 10, heightSegments: 6 }), 0.08, 3)], std('#4a4e58', { flat: true }));
          const f = glowSprite('#8fdcff', 1.6, undefined, 0.6);
          f.position.set(p.x, p.y + 0.9, p.z);
          this.add(f);
          const ph = rng() * 6;
          this.animated.push((t) => { f.material.opacity = 0.45 + Math.sin(t * 9 + ph) * 0.12; f.scale.setScalar(1.4 + Math.sin(t * 6 + ph) * 0.15); });
          this.emitter(5, (r) => this.particles.emit({ x: p.x + (r() - 0.5) * 0.4, y: p.y + 0.5, z: p.z + (r() - 0.5) * 0.4, vx: 0, vy: 0.9 + r(), vz: 0, color: new THREE.Color('#bfeeff'), size: 0.12, sizeEnd: 0.01, ttl: 1, drag: 0.5, style: 'glow' }));
        }
        break;
      }
      case 'orchard': {
        const bones: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 12; i++) {
          const b = ringPoint(rng, 9, 26, true), h = 4 + rng() * 3;
          bones.push(tube([[b.x, b.y - 0.2, b.z], [b.x + (rng() - 0.5), b.y + h * 0.5, b.z], [b.x + (rng() - 0.5) * 1.5, b.y + h, b.z]], [0.22, 0.14, 0.06], { radial: 8 }));
          for (let k = 0; k < 5; k++) {
            const t = 0.5 + rng() * 0.45, a = rng() * Math.PI * 2, len = 1 + rng() * 1.5;
            const o: V3 = [b.x, b.y + h * t, b.z];
            const end: V3 = [o[0] + Math.cos(a) * len, o[1] + len * 0.5, o[2] + Math.sin(a) * len];
            bones.push(tube([o, end], [0.07, 0.04], { radial: 5 }));
            bones.push(ellipsoid(end, [0.08, 0.08, 0.08], { widthSegments: 6, heightSegments: 4 }));
            if (k % 2 === 0) bones.push(tube([end, [end[0], end[1] - 0.7, end[2]]], [0.03, 0.025], { radial: 4 }));
          }
        }
        this.merged(bones, std('#d6ccb4'));
        break;
      }
      case 'antlerhall': {
        const antlers: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 6; i++) {
          const z = 6 - i * 7;
          for (const s of [-1, 1]) {
            const base: V3 = [s * 9, terrainHeight(s * 9, z) - 0.2, z];
            antlers.push(tube([base, [s * 7, 5, z], [s * 3, 9, z], [0, 10, z]], [0.35, 0.25, 0.15, 0.06], { radial: 7, wobble: 0.15 }));
            for (let k = 0; k < 3; k++) antlers.push(tube([[s * (7 - k * 2), 5 + k * 2, z], [s * (7.5 - k * 2), 7 + k * 2, z + 0.3]], [0.1, 0.02], { radial: 5 }));
          }
        }
        this.merged(antlers, std('#3a3128'));
        break;
      }
      case 'bellfields': {
        for (let i = 0; i < 16; i++) {
          const p = ringPoint(rng, 6, 24, false), h = 2.2 + rng() * 1.2;
          this.merged([tube([[p.x, p.y - 0.2, p.z], [p.x, p.y + h, p.z]], [0.06, 0.05], { radial: 6 }), tube([[p.x, p.y + h, p.z], [p.x + 0.6, p.y + h, p.z]], [0.04], { radial: 5 })], wood);
          const bell = new THREE.Group();
          bell.position.set(p.x + 0.55, p.y + h - 0.02, p.z);
          bell.add(new THREE.Mesh(plain(lathe([[0.02, 0], [0.09, -0.05], [0.12, -0.2], [0.17, -0.35], [0.18, -0.37]], { closeTop: true, segments: 14 })), std('#8f7d50', { rough: 0.35 })));
          this.add(bell);
          const ph = rng() * 6;
          this.animated.push((t) => { bell.rotation.z = Math.sin(t * 1.1 + ph) * 0.08; });
        }
        break;
      }
      case 'origin': {
        const f = lanternFlower(0.9);
        f.group.position.copy(new THREE.Vector3(0, terrainHeight(0, 11), 11));
        f.set(0.4, 0.5);
        this.add(f.group);
        break;
      }
      case 'lastflower': {
        const f = lanternFlower(1);
        f.group.scale.setScalar(4);
        f.group.position.set(0, terrainHeight(0, -24), -24);
        f.set(1, 1);
        this.add(f.group);
        this.animated.push((t) => f.set(1, 0.8 + Math.sin(t * 1.5) * 0.2));
        break;
      }
      case 'throne': {
        const throne = rootThrone();
        throne.position.set(0, terrainHeight(0, -32), -32);
        throne.scale.setScalar(1.5);
        this.add(throne);
        break;
      }
    }
  }

  private webs(rng: () => number, count: number): void {
    const positions: number[] = [];
    for (let w = 0; w < count; w++) {
      const c = ringPoint(rng, 8, 22, false), r = 1.5 + rng() * 2;
      const cy = c.y + 3 + rng() * 4, a0 = rng() * 6, face = Math.atan2(-c.x, 17 - c.z);
      const pt = (a: number, rr: number) => new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), face).add(new THREE.Vector3(c.x, cy, c.z));
      for (let s = 0; s < 12; s++) { const a = a0 + (s / 12) * Math.PI * 2; const p0 = pt(a, 0), p1 = pt(a, r); positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); }
      for (let ring = 1; ring < 9; ring++) for (let s = 0; s < 12; s++) {
        const a1 = a0 + (s / 12) * Math.PI * 2, a2 = a0 + ((s + 1) / 12) * Math.PI * 2, rr = (ring / 9) * r;
        const p1 = pt(a1, rr), p2 = pt(a2, rr * 1.02);
        positions.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#d8dce4', transparent: true, opacity: 0.35 })));
  }
}
