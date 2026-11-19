import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * PROCEDURAL BODIES
 * ─────────────────
 * Every character in the Hushwood is modelled here, in code, as a real volume: sculpted ellipsoids,
 * tubes swept along curves with a radius that swells and tapers, and lathed robes. Parts are built
 * in model space around a rest skeleton, then every vertex is weighted to the bones nearest it
 * (envelope skinning), so knees, spines, ears and caps bend the surface itself instead of swinging
 * separate pieces. Everything is merged into one skinned mesh per character: one draw call, one
 * silhouette that turns with the body, and no texture to blur at any distance.
 */

export type Surface = 'skin' | 'bark' | 'cloth' | 'bone' | 'metal' | 'fur' | 'moss' | 'glow' | 'leaf' | 'stone' | 'wing' | 'hair' | 'dark' | 'chitin';
export const SURFACES: Record<Surface, number> = {
  skin: 0, bark: 1, cloth: 2, bone: 3, metal: 4, fur: 5, moss: 6, glow: 7, leaf: 8, stone: 9, wing: 10, hair: 11, dark: 12, chitin: 13,
};

export type V3 = readonly [number, number, number];
const vec = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

/* ───────────────────────────── geometry builders ───────────────────────────── */

interface Ring { c: THREE.Vector3; n: THREE.Vector3; b: THREE.Vector3; r: number; u: number }

/** Connect rings (and optional pole points) into a smooth closed-around surface. */
function ringSurface(rings: Ring[], radial: number, opts: {
  startPole?: THREE.Vector3; endPole?: THREE.Vector3;
  shape?: (offset: THREE.Vector3, angle: number, ring: Ring, index: number) => void;
}): THREE.BufferGeometry {
  const positions: number[] = [];
  const grad: number[] = [];
  const index: number[] = [];
  const offset = new THREE.Vector3();
  let base = 0;
  if (opts.startPole) { positions.push(opts.startPole.x, opts.startPole.y, opts.startPole.z); grad.push(rings[0].u); base = 1; }
  rings.forEach((ring, ri) => {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      offset.copy(ring.n).multiplyScalar(Math.cos(a) * ring.r).addScaledVector(ring.b, Math.sin(a) * ring.r);
      opts.shape?.(offset, a, ring, ri);
      positions.push(ring.c.x + offset.x, ring.c.y + offset.y, ring.c.z + offset.z);
      grad.push(ring.u);
    }
  });
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * radial + j, b = base + i * radial + (j + 1) % radial;
      const c = a + radial, d = b + radial;
      index.push(a, c, b, b, c, d);
    }
  }
  if (opts.startPole) for (let j = 0; j < radial; j++) index.push(0, 1 + j, 1 + (j + 1) % radial);
  if (opts.endPole) {
    const pole = positions.length / 3;
    positions.push(opts.endPole.x, opts.endPole.y, opts.endPole.z);
    grad.push(rings[rings.length - 1].u);
    const last = base + (rings.length - 1) * radial;
    for (let j = 0; j < radial; j++) index.push(last + j, pole, last + (j + 1) % radial);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('grad', new THREE.Float32BufferAttribute(grad, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export interface TubeOptions {
  radial?: number;
  segments?: number;
  /** Rounded ends (default true). A flat open end is used where a part disappears inside another. */
  capStart?: boolean;
  capEnd?: boolean;
  /** Squash the cross-section along a model-space axis: 0 round … 0.9 almost a blade (ears, leaves). */
  flatten?: { axis: V3; amount: number };
  /** Irregular radius: amount (fraction of r) and noise frequency, for bark, roots and knobbly fingers. */
  wobble?: number;
  wobbleFrequency?: number;
  seed?: number;
}

/**
 * A tube swept along a smooth curve through `points`, its radius following `radii` (one per point,
 * interpolated) or a function of 0..1 length. Frames are parallel-transported, so the surface never
 * twists or pinches along a bend.
 */
export function tube(points: readonly V3[], radii: readonly number[] | ((u: number) => number), o: TubeOptions = {}): THREE.BufferGeometry {
  const radial = o.radial ?? 10;
  const curve = new THREE.CatmullRomCurve3(points.map(vec), false, 'centripetal');
  const segments = o.segments ?? Math.max(6, points.length * 5);
  const radiusAt = typeof radii === 'function' ? radii : radii.length === 1 ? () => radii[0] : (u: number) => {
    const f = u * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)), t = f - i;
    const s = t * t * (3 - 2 * t);
    return radii[i] * (1 - s) + radii[i + 1] * s;
  };
  const frames = curve.computeFrenetFrames(segments, false);
  const rings: Ring[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    rings.push({ c: curve.getPointAt(u), n: frames.normals[i].clone(), b: frames.binormals[i].clone().negate(), r: Math.max(1e-4, radiusAt(u)), u });
  }
  const capStart = o.capStart ?? true, capEnd = o.capEnd ?? true;
  const capRings = (end: Ring, tangent: THREE.Vector3, sign: number): Ring[] => {
    const out: Ring[] = [];
    for (let k = 1; k <= 3; k++) {
      const th = (k / 4) * Math.PI / 2;
      out.push({ c: end.c.clone().addScaledVector(tangent, sign * Math.sin(th) * end.r * 0.9), n: end.n, b: end.b, r: end.r * Math.cos(th), u: end.u });
    }
    return out;
  };
  const t0 = frames.tangents[0], t1 = frames.tangents[segments];
  const head = capStart ? capRings(rings[0], t0, -1).reverse() : [];
  const tail = capEnd ? capRings(rings[segments], t1, 1) : [];
  const all = [...head, ...rings, ...tail];
  const flatAxis = o.flatten ? vec(o.flatten.axis).normalize() : null;
  const random = mulberry(o.seed ?? 11);
  const phases = [random() * 6.28, random() * 6.28, random() * 6.28];
  const freq = o.wobbleFrequency ?? 3;
  const geometry = ringSurface(all, radial, {
    startPole: capStart ? rings[0].c.clone().addScaledVector(t0, -rings[0].r * 0.9) : undefined,
    endPole: capEnd ? rings[segments].c.clone().addScaledVector(t1, rings[segments].r * 0.9) : undefined,
    shape: (offset, a, ring) => {
      if (o.wobble) {
        const w = Math.sin(a * freq + phases[0] + ring.u * 9) * 0.5 + Math.sin(a * (freq + 2) - ring.u * 17 + phases[1]) * 0.3 + Math.sin(ring.u * 31 + phases[2]) * 0.2;
        offset.multiplyScalar(1 + w * o.wobble);
      }
      if (flatAxis) offset.addScaledVector(flatAxis, -offset.dot(flatAxis) * o.flatten!.amount);
    },
  });
  return geometry;
}

export interface EllipsoidOptions {
  widthSegments?: number;
  heightSegments?: number;
  /** Sculpt the surface: `dir` is the unit-sphere direction, `p` the scaled offset to edit in place. */
  deform?: (dir: THREE.Vector3, p: THREE.Vector3) => void;
}

/** A sculpted ellipsoid: heads, bellies, noses, eyes, shoulder moss. */
export function ellipsoid(center: V3, radii: V3, o: EllipsoidOptions = {}): THREE.BufferGeometry {
  const sphere = new THREE.SphereGeometry(1, o.widthSegments ?? 22, o.heightSegments ?? 16);
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const g = mergeVertices(sphere, 1e-5);
  sphere.dispose();
  const position = g.attributes.position as THREE.BufferAttribute;
  const grad = new Float32Array(position.count);
  const dir = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    dir.fromBufferAttribute(position, i);
    p.set(dir.x * radii[0], dir.y * radii[1], dir.z * radii[2]);
    o.deform?.(dir, p);
    grad[i] = 0.5 - dir.y * 0.5;
    position.setXYZ(i, p.x + center[0], p.y + center[1], p.z + center[2]);
  }
  g.setAttribute('grad', new THREE.BufferAttribute(grad, 1));
  g.computeVertexNormals();
  return g;
}

export interface LatheOptions {
  segments?: number;
  center?: V3;
  scaleX?: number;
  scaleZ?: number;
  closeTop?: boolean;
  closeBottom?: boolean;
  /** Edit each vertex offset: angle around the axis, t = 0 top … 1 bottom of the profile. */
  deform?: (offset: THREE.Vector3, angle: number, t: number, y: number) => void;
}

/** A surface of revolution from a [radius, height] profile listed top to bottom: robes, caps, lanterns. */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, o: LatheOptions = {}): THREE.BufferGeometry {
  const cx = o.center?.[0] ?? 0, cz = o.center?.[2] ?? 0, cy = o.center?.[1] ?? 0;
  const rings: Ring[] = profile.map(([r, y], i) => ({
    c: new THREE.Vector3(cx, y + cy, cz),
    n: new THREE.Vector3(o.scaleX ?? 1, 0, 0),
    b: new THREE.Vector3(0, 0, -(o.scaleZ ?? 1)),
    r: Math.max(1e-4, r),
    u: i / Math.max(1, profile.length - 1),
  }));
  return ringSurface(rings, o.segments ?? 20, {
    startPole: o.closeTop ? new THREE.Vector3(cx, profile[0][1] + cy, cz) : undefined,
    endPole: o.closeBottom ? new THREE.Vector3(cx, profile[profile.length - 1][1] + cy, cz) : undefined,
    shape: o.deform ? (offset, a, ring) => o.deform!(offset, a, ring.u, ring.c.y) : undefined,
  });
}

/** Mirror a geometry across x = 0 (left part → right part), keeping faces outward. */
export function mirrorX(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.clone();
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  const index = g.getIndex();
  if (index) for (let i = 0; i < index.count; i += 3) { const a = index.getX(i + 1); index.setX(i + 1, index.getX(i + 2)); index.setX(i + 2, a); }
  g.computeVertexNormals();
  return g;
}

/* ───────────────────────────── skeleton + skinning ───────────────────────────── */

export interface PartOptions {
  color: THREE.ColorRepresentation;
  /** Colour toward the part's far end (tube tip, ellipsoid underside, robe hem). */
  shade?: THREE.ColorRepresentation;
  surface?: Surface;
  /** 0..1 self-light; exactly 1 marks the creature's eyes (coloured live by the material). */
  glow?: number;
  /** Bones this part may bind to. Vertices weight to the nearest of them. */
  bones: readonly string[];
  /** Bind entirely to the first bone (skulls, noses, rocks in hand). */
  rigid?: boolean;
  /** How sharply weights fall off with distance (higher = crisper joints). */
  falloff?: number;
}

interface PartRecord { geometry: THREE.BufferGeometry; o: PartOptions }

const sideSwap = (name: string) => name.endsWith('L') ? `${name.slice(0, -1)}R` : name.endsWith('R') ? `${name.slice(0, -1)}L` : name;

export class Body {
  readonly root = new THREE.Bone();
  private readonly bones = new Map<string, THREE.Bone>();
  private readonly at = new Map<string, THREE.Vector3>();
  private readonly tails = new Map<string, THREE.Vector3>();
  private readonly parts: PartRecord[] = [];
  /** Uniform scale applied to every joint and part added from now on (a giant built from a design). */
  scale = 1;

  constructor() {
    this.root.name = 'root';
    this.bones.set('root', this.root);
    this.at.set('root', new THREE.Vector3());
  }

  /** A joint at a model-space rest position. `tail` overrides where its influence segment ends. */
  bone(name: string, parent: string, at: V3, tail?: V3): this {
    const p = this.bones.get(parent);
    if (!p) throw new Error(`unknown parent bone ${parent}`);
    const bone = new THREE.Bone();
    bone.name = name;
    const world = vec(at).multiplyScalar(this.scale);
    bone.position.copy(world).sub(this.at.get(parent)!);
    p.add(bone);
    this.bones.set(name, bone);
    this.at.set(name, world);
    if (tail) this.tails.set(name, vec(tail).multiplyScalar(this.scale));
    return this;
  }

  /** A left joint (name ending in L at +x) and its mirror. */
  pairBone(name: string, parent: string, at: V3, tail?: V3): this {
    this.bone(name, parent, at, tail);
    const mirrored = sideSwap(name);
    const mirroredParent = this.bones.has(sideSwap(parent)) && parent !== sideSwap(parent) ? sideSwap(parent) : parent;
    return this.bone(mirrored, mirroredParent, [-at[0], at[1], at[2]], tail ? [-tail[0], tail[1], tail[2]] : undefined);
  }

  has(name: string): boolean { return this.bones.has(name); }
  restPosition(name: string): THREE.Vector3 { return this.at.get(name)!.clone(); }
  boneNames(): string[] { return [...this.bones.keys()]; }

  part(geometry: THREE.BufferGeometry, o: PartOptions): this {
    this.parts.push({ geometry: this.scaled(geometry), o });
    return this;
  }

  /** A left part and its mirror bound to the matching right bones. */
  pair(geometry: THREE.BufferGeometry, o: PartOptions): this {
    const g = this.scaled(geometry);
    this.parts.push({ geometry: g, o });
    this.parts.push({ geometry: mirrorX(g), o: { ...o, bones: o.bones.map(sideSwap) } });
    return this;
  }

  private scaled(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    if (this.scale !== 1) geometry.scale(this.scale, this.scale, this.scale);
    return geometry;
  }

  build(material: THREE.Material): { mesh: THREE.SkinnedMesh; bones: Record<string, THREE.Bone> } {
    const names = [...this.bones.keys()];
    const boneIndex = new Map(names.map((n, i) => [n, i]));
    // Influence segments: head → tail (explicit, else the average of its children, else a stub).
    const segA = new Map<string, THREE.Vector3>(), segB = new Map<string, THREE.Vector3>();
    for (const name of names) {
      const head = this.at.get(name)!;
      let tail = this.tails.get(name);
      if (!tail) {
        const kids = this.bones.get(name)!.children.filter((c): c is THREE.Bone => c instanceof THREE.Bone);
        if (kids.length) {
          tail = new THREE.Vector3();
          for (const k of kids) tail.add(this.at.get(k.name)!);
          tail.multiplyScalar(1 / kids.length);
        } else tail = head.clone();
      }
      segA.set(name, head);
      segB.set(name, tail);
    }
    let vertexCount = 0, indexCount = 0;
    for (const { geometry } of this.parts) {
      vertexCount += geometry.attributes.position.count;
      indexCount += geometry.getIndex()?.count ?? geometry.attributes.position.count;
    }
    const position = new Float32Array(vertexCount * 3);
    const normal = new Float32Array(vertexCount * 3);
    const color = new Float32Array(vertexCount * 3);
    const surf = new Float32Array(vertexCount * 2);
    const skinIndex = new Uint16Array(vertexCount * 4);
    const skinWeight = new Float32Array(vertexCount * 4);
    const index = new Uint32Array(indexCount);
    const p = new THREE.Vector3(), closest = new THREE.Vector3(), line = new THREE.Line3();
    const c0 = new THREE.Color(), c1 = new THREE.Color(), mixed = new THREE.Color();
    let vo = 0, io = 0;
    const candidates: Array<{ i: number; w: number }> = [];
    for (const { geometry, o } of this.parts) {
      const pos = geometry.attributes.position as THREE.BufferAttribute;
      const nor = geometry.attributes.normal as THREE.BufferAttribute;
      const grad = geometry.attributes.grad as THREE.BufferAttribute | undefined;
      c0.set(o.color);
      c1.set(o.shade ?? o.color);
      const sid = SURFACES[o.surface ?? 'skin'];
      for (const b of o.bones) if (!boneIndex.has(b)) throw new Error(`part binds to unknown bone ${b}`);
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i);
        const k = vo + i;
        position.set([p.x, p.y, p.z], k * 3);
        normal.set([nor.getX(i), nor.getY(i), nor.getZ(i)], k * 3);
        mixed.copy(c0).lerp(c1, grad ? grad.getX(i) : 0);
        color.set([mixed.r, mixed.g, mixed.b], k * 3);
        surf[k * 2] = sid;
        surf[k * 2 + 1] = o.glow ?? 0;
        if (o.rigid || o.bones.length === 1) {
          skinIndex[k * 4] = boneIndex.get(o.bones[0])!;
          skinWeight[k * 4] = 1;
          continue;
        }
        candidates.length = 0;
        const falloff = o.falloff ?? 4;
        for (const b of o.bones) {
          const a0 = segA.get(b)!, b0 = segB.get(b)!;
          let d: number;
          if (a0.distanceToSquared(b0) < 1e-10) d = a0.distanceTo(p);
          else { line.set(a0, b0); line.closestPointToPoint(p, true, closest); d = closest.distanceTo(p); }
          candidates.push({ i: boneIndex.get(b)!, w: 1 / Math.pow(d + 0.012, falloff) });
        }
        candidates.sort((a, b) => b.w - a.w);
        const top = candidates.slice(0, 4);
        const total = top.reduce((s, c) => s + c.w, 0);
        top.forEach((c, j) => { skinIndex[k * 4 + j] = c.i; skinWeight[k * 4 + j] = c.w / total; });
      }
      const gi = geometry.getIndex();
      if (gi) for (let i = 0; i < gi.count; i++) index[io++] = gi.getX(i) + vo;
      else for (let i = 0; i < pos.count; i++) index[io++] = vo + i;
      vo += pos.count;
      geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    geometry.setAttribute('aSurf', new THREE.BufferAttribute(surf, 2));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.add(this.root);
    mesh.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(names.map((n) => this.bones.get(n)!));
    mesh.bind(skeleton);
    // Skinned bounds follow the pose, not the bind; a figure is never large enough to matter.
    mesh.frustumCulled = false;
    const bones: Record<string, THREE.Bone> = {};
    for (const [n, b] of this.bones) bones[n] = b;
    return { mesh, bones };
  }
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
