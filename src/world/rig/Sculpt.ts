import * as THREE from 'three';
import { fbm3, SURFACES, type Surface, type V3 } from './Body.ts';

/**
 * SCULPT
 * ──────
 * Bodies modelled the way a sculptor blocks out clay: a signed-distance field built from tapered
 * capsules, ellipsoids and rounded boxes that melt into one another with a smooth union, carved by
 * smooth subtraction (eye orbits, nostrils, mouths, the gaps between ribs), each form with its own
 * surface relief. The field is meshed once per design with Surface Nets (smooth, even triangles,
 * normals from the field's gradient), then colour, material and bone influence are blended across
 * the joins, so a limb grows out of a torso instead of being stuck to it.
 */

type Kind = 0 | 1 | 2; // round cone, ellipsoid, rounded box

interface Prim {
  kind: Kind;
  a: THREE.Vector3; b: THREE.Vector3; ra: number; rb: number; // round cone
  c: THREE.Vector3; r: THREE.Vector3; q: THREE.Quaternion; qi: THREE.Quaternion; round: number; // ellipsoid / box
  blend: number;
  carve: boolean;
  color: THREE.Color; shade: THREE.Color; surface: number; glow: number; bones: readonly string[];
  relief: number; reliefFreq: number; stretch: number;
  min: THREE.Vector3; max: THREE.Vector3;
}

export interface FormOptions {
  color: THREE.ColorRepresentation;
  /** Colour toward the far end (b) of a cone, or the underside of other forms. */
  shade?: THREE.ColorRepresentation;
  surface?: Surface;
  glow?: number;
  bones: readonly string[];
  /** Smooth-union radius with what is already there (m). 0 = hard. */
  blend?: number;
  /** Relief amplitude (m) and frequency, stretched along y by `stretch`. */
  relief?: number;
  reliefFreq?: number;
  stretch?: number;
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();

function sdRoundCone(p: THREE.Vector3, pr: Prim): { d: number; t: number } {
  // Capsule with linearly varying radius (an exact-enough round cone for sculpting).
  const ba = tmpA.subVectors(pr.b, pr.a), pa = tmpB.subVectors(p, pr.a);
  const len2 = ba.lengthSq();
  const t = len2 > 1e-12 ? Math.min(1, Math.max(0, pa.dot(ba) / len2)) : 0;
  const r = pr.ra + (pr.rb - pr.ra) * t;
  return { d: tmpC.copy(pr.a).addScaledVector(ba, t).distanceTo(p) - r, t };
}

function sdEllipsoid(p: THREE.Vector3, pr: Prim): number {
  const l = tmpA.subVectors(p, pr.c).applyQuaternion(pr.qi);
  const k0 = Math.hypot(l.x / pr.r.x, l.y / pr.r.y, l.z / pr.r.z);
  const k1 = Math.hypot(l.x / (pr.r.x * pr.r.x), l.y / (pr.r.y * pr.r.y), l.z / (pr.r.z * pr.r.z));
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(pr.r.x, pr.r.y, pr.r.z);
}

function sdBox(p: THREE.Vector3, pr: Prim): number {
  const l = tmpA.subVectors(p, pr.c).applyQuaternion(pr.qi);
  const qx = Math.abs(l.x) - pr.r.x + pr.round, qy = Math.abs(l.y) - pr.r.y + pr.round, qz = Math.abs(l.z) - pr.r.z + pr.round;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - pr.round;
}

const smin = (a: number, b: number, k: number) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export class Sculpt {
  private readonly prims: Prim[] = [];
  /** Uniform scale applied to every form added (giants built from a design). */
  scale = 1;

  private push(kind: Kind, o: FormOptions, carve: boolean, setup: (p: Prim) => void): this {
    const pr: Prim = {
      kind, a: new THREE.Vector3(), b: new THREE.Vector3(), ra: 0, rb: 0, c: new THREE.Vector3(), r: new THREE.Vector3(1, 1, 1),
      q: new THREE.Quaternion(), qi: new THREE.Quaternion(), round: 0, blend: (o.blend ?? 0.04) * this.scale, carve,
      color: new THREE.Color(o.color), shade: new THREE.Color(o.shade ?? o.color), surface: SURFACES[o.surface ?? 'skin'], glow: o.glow ?? 0, bones: o.bones,
      relief: (o.relief ?? 0) * this.scale, reliefFreq: (o.reliefFreq ?? 8) / this.scale, stretch: o.stretch ?? 1,
      min: new THREE.Vector3(), max: new THREE.Vector3(),
    };
    setup(pr);
    const pad = pr.blend + Math.abs(pr.relief) + 0.01;
    if (kind === 0) {
      pr.min.set(Math.min(pr.a.x - pr.ra, pr.b.x - pr.rb), Math.min(pr.a.y - pr.ra, pr.b.y - pr.rb), Math.min(pr.a.z - pr.ra, pr.b.z - pr.rb)).subScalar(pad);
      pr.max.set(Math.max(pr.a.x + pr.ra, pr.b.x + pr.rb), Math.max(pr.a.y + pr.ra, pr.b.y + pr.rb), Math.max(pr.a.z + pr.ra, pr.b.z + pr.rb)).addScalar(pad);
    } else {
      const m = Math.max(pr.r.x, pr.r.y, pr.r.z);
      pr.min.copy(pr.c).subScalar(m + pad);
      pr.max.copy(pr.c).addScalar(m + pad);
    }
    this.prims.push(pr);
    return this;
  }

  private v(p: V3): THREE.Vector3 { return new THREE.Vector3(p[0], p[1], p[2]).multiplyScalar(this.scale); }

  /** A tapered capsule from a to b: limbs, necks, fingers, horns. */
  cone(a: V3, b: V3, ra: number, rb: number, o: FormOptions): this {
    return this.push(0, o, false, (p) => { p.a.copy(this.v(a)); p.b.copy(this.v(b)); p.ra = ra * this.scale; p.rb = rb * this.scale; });
  }

  /** A chain of tapered capsules through points: a spine, a tail, an antler beam. */
  chain(points: readonly V3[], radii: readonly number[], o: FormOptions): this {
    for (let i = 0; i < points.length - 1; i++) this.cone(points[i], points[i + 1], radii[Math.min(i, radii.length - 1)], radii[Math.min(i + 1, radii.length - 1)], o);
    return this;
  }

  /** An ellipsoid, optionally rotated (Euler XYZ, radians): skulls, bellies, muscle masses. */
  blob(c: V3, r: V3, o: FormOptions, rot: V3 = [0, 0, 0]): this {
    return this.push(1, o, false, (p) => { p.c.copy(this.v(c)); p.r.set(r[0], r[1], r[2]).multiplyScalar(this.scale); p.q.setFromEuler(new THREE.Euler(...rot)); p.qi.copy(p.q).invert(); });
  }

  /** A rounded box: plates, hooves, armour, the planes of a mask. */
  box(c: V3, half: V3, round: number, o: FormOptions, rot: V3 = [0, 0, 0]): this {
    return this.push(2, o, false, (p) => { p.c.copy(this.v(c)); p.r.set(half[0], half[1], half[2]).multiplyScalar(this.scale); p.round = round * this.scale; p.q.setFromEuler(new THREE.Euler(...rot)); p.qi.copy(p.q).invert(); });
  }

  /** Carve a capsule-shaped hollow out of what came before (orbits, nostrils, the gaps between ribs). */
  carveCone(a: V3, b: V3, ra: number, rb: number, blend: number, o: Partial<FormOptions> = {}): this {
    return this.push(0, { color: '#000', bones: [], ...o, blend }, true, (p) => { p.a.copy(this.v(a)); p.b.copy(this.v(b)); p.ra = ra * this.scale; p.rb = rb * this.scale; });
  }

  carveBlob(c: V3, r: V3, blend: number, rot: V3 = [0, 0, 0]): this {
    return this.push(1, { color: '#000', bones: [], blend }, true, (p) => { p.c.copy(this.v(c)); p.r.set(r[0], r[1], r[2]).multiplyScalar(this.scale); p.q.setFromEuler(new THREE.Euler(...rot)); p.qi.copy(p.q).invert(); });
  }

  get empty(): boolean { return this.prims.length === 0; }

  private primDistance(pr: Prim, p: THREE.Vector3): { d: number; t: number } {
    let d: number, t = 0.5;
    if (pr.kind === 0) { const r = sdRoundCone(p, pr); d = r.d; t = r.t; }
    else if (pr.kind === 1) { d = sdEllipsoid(p, pr); t = Math.min(1, Math.max(0, 0.5 - (p.y - pr.c.y) / (2 * pr.r.y))); }
    else d = sdBox(p, pr);
    if (pr.relief) d -= (fbm3(p.x * pr.reliefFreq, p.y * pr.reliefFreq * pr.stretch, p.z * pr.reliefFreq, 3) - 0.5) * 2 * pr.relief;
    return { d, t };
  }

  /** The field at a point, using only the forms whose bounds reach it. */
  private field(p: THREE.Vector3, list: readonly Prim[]): number {
    let d = 1e9;
    for (const pr of list) {
      const pd = this.primDistance(pr, p).d;
      d = pr.carve ? smax(d, -pd, pr.blend) : smin(d, pd, pr.blend);
    }
    return d;
  }

  /**
   * Mesh the field with Surface Nets at `cell` metres. Returns geometry plus, per vertex, a colour,
   * a surface id, a glow, and the bones it may bind to (from the forms nearest it).
   */
  mesh(cell: number): { geometry: THREE.BufferGeometry; colors: Float32Array; surf: Float32Array; bones: string[][] } {
    const solids = this.prims;
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (const pr of solids) if (!pr.carve) { lo.min(pr.min); hi.max(pr.max); }
    lo.subScalar(cell * 2); hi.addScalar(cell * 2);
    const nx = Math.ceil((hi.x - lo.x) / cell) + 1, ny = Math.ceil((hi.y - lo.y) / cell) + 1, nz = Math.ceil((hi.z - lo.z) / cell) + 1;
    // Coarse blocks list only the forms that reach them: most samples see a handful of forms.
    const B = 6, bx = Math.ceil(nx / B), by = Math.ceil(ny / B), bz = Math.ceil(nz / B);
    const blocks: Prim[][] = new Array(bx * by * bz);
    for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
      const bmin = new THREE.Vector3(lo.x + i * B * cell, lo.y + j * B * cell, lo.z + k * B * cell);
      const bmax = bmin.clone().addScalar(B * cell);
      blocks[i + bx * (j + by * k)] = solids.filter((pr) => pr.max.x >= bmin.x && pr.min.x <= bmax.x && pr.max.y >= bmin.y && pr.min.y <= bmax.y && pr.max.z >= bmin.z && pr.min.z <= bmax.z);
    }
    const value = new Float32Array(nx * ny * nz);
    const p = new THREE.Vector3();
    // Narrow band: a block whose centre is farther from the surface than its own half-diagonal lies
    // wholly inside or outside, and is filled without evaluating every sample.
    const half = Math.sqrt(3) * B * cell * 0.5;
    for (let kb = 0; kb < bz; kb++) for (let jb = 0; jb < by; jb++) for (let ib = 0; ib < bx; ib++) {
      const list = blocks[ib + bx * (jb + by * kb)];
      const i0 = ib * B, j0 = jb * B, k0 = kb * B;
      const i1 = Math.min(nx, i0 + B + 1), j1 = Math.min(ny, j0 + B + 1), k1 = Math.min(nz, k0 + B + 1);
      let fill: number | null = null;
      if (!list.length) fill = cell * 4;
      else {
        p.set(lo.x + (i0 + B / 2) * cell, lo.y + (j0 + B / 2) * cell, lo.z + (k0 + B / 2) * cell);
        const dc = this.field(p, list);
        if (Math.abs(dc) > half + cell * 2) fill = dc;
      }
      for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
        const idx = i + nx * (j + ny * k);
        if (fill !== null) { value[idx] = fill; continue; }
        p.set(lo.x + i * cell, lo.y + j * cell, lo.z + k * cell);
        value[idx] = this.field(p, list);
      }
    }
    const at = (i: number, j: number, k: number) => value[i + nx * (j + ny * k)];
    // One vertex per cell that the surface crosses, at the mean of its edge crossings.
    const vertexOf = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
    const positions: number[] = [];
    const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const cv = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) { cv[c] = at(i + corners[c][0], j + corners[c][1], k + corners[c][2]); if (cv[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [e0, e1] of edges) {
        const a = cv[e0], b = cv[e1];
        if ((a < 0) === (b < 0)) continue;
        const t = a / (a - b);
        sx += corners[e0][0] + (corners[e1][0] - corners[e0][0]) * t;
        sy += corners[e0][1] + (corners[e1][1] - corners[e0][1]) * t;
        sz += corners[e0][2] + (corners[e1][2] - corners[e0][2]) * t;
        n++;
      }
      vertexOf[i + (nx - 1) * (j + (ny - 1) * k)] = positions.length / 3;
      positions.push(lo.x + (i + sx / n) * cell, lo.y + (j + sy / n) * cell, lo.z + (k + sz / n) * cell);
    }
    const index: number[] = [];
    const vid = (i: number, j: number, k: number) => vertexOf[i + (nx - 1) * (j + (ny - 1) * k)];
    // A quad for every grid edge the surface crosses, joining the four cells around it.
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const v0 = at(i, j, k);
      const inside = v0 < 0;
      if ((at(i + 1, j, k) < 0) !== inside && i < nx - 1) {
        const q = [vid(i, j - 1, k - 1), vid(i, j, k - 1), vid(i, j, k), vid(i, j - 1, k)];
        if (q.every((x) => x >= 0)) inside ? index.push(q[0], q[1], q[2], q[0], q[2], q[3]) : index.push(q[0], q[2], q[1], q[0], q[3], q[2]);
      }
      if ((at(i, j + 1, k) < 0) !== inside) {
        const q = [vid(i - 1, j, k - 1), vid(i, j, k - 1), vid(i, j, k), vid(i - 1, j, k)];
        if (q.every((x) => x >= 0)) inside ? index.push(q[0], q[2], q[1], q[0], q[3], q[2]) : index.push(q[0], q[1], q[2], q[0], q[2], q[3]);
      }
      if ((at(i, j, k + 1) < 0) !== inside) {
        const q = [vid(i - 1, j - 1, k), vid(i, j - 1, k), vid(i, j, k), vid(i - 1, j, k)];
        if (q.every((x) => x >= 0)) inside ? index.push(q[0], q[1], q[2], q[0], q[2], q[3]) : index.push(q[0], q[2], q[1], q[0], q[3], q[2]);
      }
    }
    const count = positions.length / 3;
    const normals = new Float32Array(count * 3), colors = new Float32Array(count * 3), surf = new Float32Array(count * 2);
    const bones: string[][] = new Array(count);
    const e = cell * 0.5, q = new THREE.Vector3(), mixed = new THREE.Color(), base = new THREE.Color();
    for (let v = 0; v < count; v++) {
      p.set(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]);
      const list = blocks[Math.min(bx - 1, Math.floor((p.x - lo.x) / cell / B)) + bx * (Math.min(by - 1, Math.floor((p.y - lo.y) / cell / B)) + by * Math.min(bz - 1, Math.floor((p.z - lo.z) / cell / B)))];
      // Smooth normals from the field's gradient.
      const gx = this.field(q.set(p.x + e, p.y, p.z), list) - this.field(q.set(p.x - e, p.y, p.z), list);
      const gy = this.field(q.set(p.x, p.y + e, p.z), list) - this.field(q.set(p.x, p.y - e, p.z), list);
      const gz = this.field(q.set(p.x, p.y, p.z + e), list) - this.field(q.set(p.x, p.y, p.z - e), list);
      const gl = Math.hypot(gx, gy, gz) || 1;
      normals.set([gx / gl, gy / gl, gz / gl], v * 3);
      // Blend the material of the forms nearest the surface here.
      let best: Prim | null = null, bestD = Infinity, bestT = 0;
      const near: Array<{ pr: Prim; d: number; t: number }> = [];
      for (const pr of list) {
        if (pr.carve) continue;
        const r = this.primDistance(pr, p);
        near.push({ pr, d: r.d, t: r.t });
        if (r.d < bestD) { bestD = r.d; best = pr; bestT = r.t; }
      }
      if (!best) { colors.set([0.5, 0.5, 0.5], v * 3); surf.set([0, 0], v * 2); bones[v] = ['root']; continue; }
      let wsum = 0;
      mixed.setRGB(0, 0, 0);
      const boneSet = new Set<string>(best.bones);
      for (const n of near) {
        const w = Math.exp(-Math.max(0, n.d - bestD) / Math.max(n.pr.blend * 0.35, cell * 0.5));
        if (w < 0.05) continue;
        base.copy(n.pr.color).lerp(n.pr.shade, n.t);
        mixed.r += base.r * w; mixed.g += base.g * w; mixed.b += base.b * w;
        wsum += w;
        if (w > 0.25) for (const b of n.pr.bones) boneSet.add(b);
      }
      colors.set([mixed.r / wsum, mixed.g / wsum, mixed.b / wsum], v * 3);
      surf.set([best.surface, best.glow], v * 2);
      bones[v] = [...boneSet];
      void bestT;
    }
    // Every triangle must wind outward (the shader trusts gl_FrontFacing): check against the field.
    const fa = new THREE.Vector3(), fb = new THREE.Vector3(), fc = new THREE.Vector3(), fn = new THREE.Vector3();
    for (let t = 0; t < index.length; t += 3) {
      const i0 = index[t], i1 = index[t + 1], i2 = index[t + 2];
      fa.fromArray(positions, i0 * 3); fb.fromArray(positions, i1 * 3).sub(fa); fc.fromArray(positions, i2 * 3).sub(fa);
      fn.crossVectors(fb, fc);
      const nx = normals[i0 * 3] + normals[i1 * 3] + normals[i2 * 3], ny = normals[i0 * 3 + 1] + normals[i1 * 3 + 1] + normals[i2 * 3 + 1], nz = normals[i0 * 3 + 2] + normals[i1 * 3 + 2] + normals[i2 * 3 + 2];
      if (fn.x * nx + fn.y * ny + fn.z * nz < 0) { index[t + 1] = i2; index[t + 2] = i1; }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(index);
    return { geometry, colors, surf, bones };
  }
}
