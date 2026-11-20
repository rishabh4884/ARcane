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

function sdCone(p: THREE.Vector3, pr: Prim): number {
  const bax = pr.b.x - pr.a.x, bay = pr.b.y - pr.a.y, baz = pr.b.z - pr.a.z;
  const pax = p.x - pr.a.x, pay = p.y - pr.a.y, paz = p.z - pr.a.z;
  const len2 = bax * bax + bay * bay + baz * baz;
  const t = len2 > 1e-12 ? Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / len2)) : 0;
  const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (pr.ra + (pr.rb - pr.ra) * t);
}

function sdEllipsoid(p: THREE.Vector3, pr: Prim): number {
  const l = tmpA.subVectors(p, pr.c).applyQuaternion(pr.qi);
  const ax = l.x / pr.r.x, ay = l.y / pr.r.y, az = l.z / pr.r.z;
  const bx = ax / pr.r.x, by = ay / pr.r.y, bz = az / pr.r.z;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(pr.r.x, pr.r.y, pr.r.z);
}

function sdBox(p: THREE.Vector3, pr: Prim): number {
  const l = tmpA.subVectors(p, pr.c).applyQuaternion(pr.qi);
  const qx = Math.abs(l.x) - pr.r.x + pr.round, qy = Math.abs(l.y) - pr.r.y + pr.round, qz = Math.abs(l.z) - pr.r.z + pr.round;
  const mx = Math.max(qx, 0), my = Math.max(qy, 0), mz = Math.max(qz, 0);
  return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - pr.round;
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

  /** The whole field at a point (every form): for placing details on the sculpted surface. */
  distanceAt(x: number, y: number, z: number): number { return this.field(new THREE.Vector3(x, y, z), this.prims); }

  /**
   * Cast a ray onto the surface as sculpted so far: where it lands and the outward normal there.
   * Cracks, studs, glowing seams and circlets are placed with it so they sit on the form exactly.
   */
  cast(from: V3, dir: V3, max = 4): { point: V3; normal: V3 } | null {
    const d = new THREE.Vector3(...dir).normalize(), p = this.v(from);
    const list = this.prims;
    let t = 0;
    for (let i = 0; i < 200 && t < max * this.scale; i++) {
      const q = p.clone().addScaledVector(d, t);
      const f = this.field(q, list);
      if (f < 0.0005 * this.scale) {
        const e = 0.002 * this.scale;
        const n = new THREE.Vector3(
          this.field(q.clone().setX(q.x + e), list) - this.field(q.clone().setX(q.x - e), list),
          this.field(q.clone().setY(q.y + e), list) - this.field(q.clone().setY(q.y - e), list),
          this.field(q.clone().setZ(q.z + e), list) - this.field(q.clone().setZ(q.z - e), list)).normalize();
        const s = 1 / this.scale;
        return { point: [q.x * s, q.y * s, q.z * s], normal: [n.x, n.y, n.z] };
      }
      t += Math.max(f * 0.7, 0.0004 * this.scale);
    }
    return null;
  }

  private primDistance(pr: Prim, p: THREE.Vector3): { d: number; t: number } {
    let d: number, t = 0.5;
    if (pr.kind === 0) { const r = sdRoundCone(p, pr); d = r.d; t = r.t; }
    else if (pr.kind === 1) { d = sdEllipsoid(p, pr); t = Math.min(1, Math.max(0, 0.5 - (p.y - pr.c.y) / (2 * pr.r.y))); }
    else d = sdBox(p, pr);
    if (pr.relief) d -= (fbm3(p.x * pr.reliefFreq, p.y * pr.reliefFreq * pr.stretch, p.z * pr.reliefFreq, 3) - 0.5) * 2 * pr.relief;
    return { d, t };
  }

  /** A form's distance without its relief: the coarse occlusion grid only needs the masses. */
  private rawDistance(pr: Prim, p: THREE.Vector3): number {
    return pr.kind === 0 ? sdCone(p, pr) : pr.kind === 1 ? sdEllipsoid(p, pr) : sdBox(p, pr);
  }

  /** Distance to one form with its relief, no allocation: the hot path of meshing. */
  private formDistance(pr: Prim, p: THREE.Vector3): number {
    let d = pr.kind === 0 ? sdCone(p, pr) : pr.kind === 1 ? sdEllipsoid(p, pr) : sdBox(p, pr);
    if (pr.relief) d -= (fbm3(p.x * pr.reliefFreq, p.y * pr.reliefFreq * pr.stretch, p.z * pr.reliefFreq, 3) - 0.5) * 2 * pr.relief;
    return d;
  }

  /** The field at a point, using only the forms whose bounds reach it. */
  private field(p: THREE.Vector3, list: readonly Prim[]): number {
    let d = 1e9;
    // Forms that share a relief share its noise: evaluate it once per sample.
    let nf = -1, ns = -1, nv = 0;
    for (let i = 0; i < list.length; i++) {
      const pr = list[i];
      // A form farther than its blend from the surface so far cannot change it.
      if (!pr.carve && d < 1e8) {
        const bx = Math.max(pr.min.x - p.x, 0, p.x - pr.max.x), by = Math.max(pr.min.y - p.y, 0, p.y - pr.max.y), bz = Math.max(pr.min.z - p.z, 0, p.z - pr.max.z);
        if (bx * bx + by * by + bz * bz > (d + pr.blend) * (d + pr.blend) && d > -pr.blend) continue;
      }
      let pd = pr.kind === 0 ? sdCone(p, pr) : pr.kind === 1 ? sdEllipsoid(p, pr) : sdBox(p, pr);
      if (pr.relief) {
        if (pr.reliefFreq !== nf || pr.stretch !== ns) { nf = pr.reliefFreq; ns = pr.stretch; nv = fbm3(p.x * nf, p.y * nf * ns, p.z * nf, 3) - 0.5; }
        pd -= nv * 2 * pr.relief;
      }
      d = pr.carve ? smax(d, -pd, pr.blend) : smin(d, pd, pr.blend);
    }
    return d;
  }

  /**
   * Mesh the field with Surface Nets at `cell` metres. Returns geometry plus, per vertex, a colour,
   * a surface id, a glow, and the bones it may bind to (from the forms nearest it).
   */
  mesh(cell: number): { geometry: THREE.BufferGeometry; colors: Float32Array; surf: Float32Array; bones: string[][]; ao: Float32Array; curv: Float32Array } {
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
    const exact = new Uint8Array(bx * by * bz);
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
      if (fill === null) exact[ib + bx * (jb + by * kb)] = 1;
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
    // Only blocks evaluated exactly can hold the surface (the rest lie two cells or more from it).
    const cellsOf = function* (lo1: number, hi1: number) {
      for (let kb = 0; kb < bz; kb++) for (let jb = 0; jb < by; jb++) for (let ib = 0; ib < bx; ib++) {
        if (!exact[ib + bx * (jb + by * kb)]) continue;
        const i0 = Math.max(lo1, ib * B), j0 = Math.max(lo1, jb * B), k0 = Math.max(lo1, kb * B);
        const i1 = Math.min(nx - hi1, ib * B + B), j1 = Math.min(ny - hi1, jb * B + B), k1 = Math.min(nz - hi1, kb * B + B);
        for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) yield [i, j, k] as const;
      }
    };
    for (const [i, j, k] of cellsOf(0, 1)) {
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
    for (const [i, j, k] of cellsOf(1, 1)) {
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
    const { ao, curv } = this.bakeDetail(positions, normals, { lo, cell, nx, ny, nz, B, bx, by, bz, value, exact });
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
    return { geometry, colors, surf, bones, ao, curv };
  }

  /**
   * Bake what a sculptor's texture artist would bake from a high-poly model, straight from the field:
   *  - ambient occlusion, by marching the distance field outward over a hemisphere around each normal
   *    (an armpit, the gap under a jaw, the inside of an orbit go dark; an open cheek does not);
   *  - curvature, from the field's Laplacian at two scales: positive on convex edges (where paint
   *    wears and bark weathers pale), negative in crevices (where dirt and darkness gather).
   * Near the surface the fine grid is exact; farther out a coarse grid of the bare masses stands in.
   */
  private bakeDetail(positions: number[], normals: Float32Array, g: { lo: THREE.Vector3; cell: number; nx: number; ny: number; nz: number; B: number; bx: number; by: number; bz: number; value: Float32Array; exact: Uint8Array }): { ao: Float32Array; curv: Float32Array } {
    const { lo, cell, nx, ny, nz, B, bx, by, bz, value, exact } = g;
    const count = positions.length / 3;
    const ao = new Float32Array(count).fill(1), curv = new Float32Array(count);
    if (!count) return { ao, curv };
    const solids = this.prims.filter((pr) => !pr.carve);
    const diag = Math.hypot(nx, ny, nz) * cell;
    const R = Math.max(cell * 8, diag * 0.045);
    // Coarse grid on the block corners: the nearest bare mass, capped at 2R, culled by bounds.
    const G = B * cell, cx = bx + 1, cy = by + 1, cz = bz + 1;
    const coarse = new Float32Array(cx * cy * cz);
    const q = new THREE.Vector3();
    const boxDist = (pr: Prim, x: number, y: number, z: number) => Math.hypot(Math.max(pr.min.x - x, 0, x - pr.max.x), Math.max(pr.min.y - y, 0, y - pr.max.y), Math.max(pr.min.z - z, 0, z - pr.max.z));
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      const x = lo.x + i * G, y = lo.y + j * G, z = lo.z + k * G;
      let d = R * 2;
      q.set(x, y, z);
      for (const pr of solids) {
        if (boxDist(pr, x, y, z) >= d) continue;
        const pd = this.rawDistance(pr, q);
        if (pd < d) d = pd;
      }
      coarse[i + cx * (j + cy * k)] = d;
    }
    const tri = (arr: Float32Array, sx: number, sy: number, fx: number, fy: number, fz: number) => {
      const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
      const u = fx - i, v = fy - j, w = fz - k;
      const at = (a: number, b: number, c: number) => arr[a + sx * (b + sy * c)];
      const c00 = at(i, j, k) * (1 - u) + at(i + 1, j, k) * u, c10 = at(i, j + 1, k) * (1 - u) + at(i + 1, j + 1, k) * u;
      const c01 = at(i, j, k + 1) * (1 - u) + at(i + 1, j, k + 1) * u, c11 = at(i, j + 1, k + 1) * (1 - u) + at(i + 1, j + 1, k + 1) * u;
      return (c00 * (1 - v) + c10 * v) * (1 - w) + (c01 * (1 - v) + c11 * v) * w;
    };
    const sample = (x: number, y: number, z: number): number => {
      const fx = (x - lo.x) / cell, fy = (y - lo.y) / cell, fz = (z - lo.z) / cell;
      if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return R * 2;
      const ib = Math.min(bx - 1, Math.floor(fx / B)), jb = Math.min(by - 1, Math.floor(fy / B)), kb = Math.min(bz - 1, Math.floor(fz / B));
      if (exact[ib + bx * (jb + by * kb)]) return tri(value, nx, ny, fx, fy, fz);
      return tri(coarse, cx, cy, Math.min(fx / B, cx - 1.0001), Math.min(fy / B, cy - 1.0001), Math.min(fz / B, cz - 1.0001));
    };
    // A fixed hemisphere: the normal, then two rings tilted 35° and 65° from it.
    const dirs: Array<[number, number, number]> = [[0, 0, 1]];
    for (const [tilt, n] of [[0.61, 6], [1.13, 8]] as const) for (let a = 0; a < n; a++) {
      const phi = (a / n) * Math.PI * 2 + tilt;
      dirs.push([Math.sin(tilt) * Math.cos(phi), Math.sin(tilt) * Math.sin(phi), Math.cos(tilt)]);
    }
    const STEPS = 5;
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), nn = new THREE.Vector3(), up = new THREE.Vector3();
    const e1 = cell * 1.5, e2 = cell * 4;
    for (let v = 0; v < count; v++) {
      const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
      nn.set(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]);
      up.set(Math.abs(nn.y) < 0.9 ? 0 : 1, Math.abs(nn.y) < 0.9 ? 1 : 0, 0);
      t1.crossVectors(up, nn).normalize(); t2.crossVectors(nn, t1);
      let occ = 0, wsum = 0;
      for (const [dx, dy, dz] of dirs) {
        const wx = t1.x * dx + t2.x * dy + nn.x * dz, wy = t1.y * dx + t2.y * dy + nn.y * dz, wz = t1.z * dx + t2.z * dy + nn.z * dz;
        const cosw = 0.35 + dz;
        for (let s = 1; s <= STEPS; s++) {
          const h = R * Math.pow(s / STEPS, 1.6) + cell * 0.75;
          const d = sample(px + wx * h, py + wy * h, pz + wz * h);
          const w = cosw / Math.sqrt(s);
          occ += Math.min(1, Math.max(0, (h - d) / h)) * w;
          wsum += w;
        }
      }
      ao[v] = Math.max(0.12, 1 - Math.pow(occ / wsum, 0.85) * 1.9);
      // Laplacian of the field: ≈ 2/radius on a convex form, negative in a crease.
      const lap = (e: number) => (sample(px + e, py, pz) + sample(px - e, py, pz) + sample(px, py + e, pz) + sample(px, py - e, pz) + sample(px, py, pz + e) + sample(px, py, pz - e) - 6 * sample(px, py, pz)) / (e * e);
      curv[v] = Math.max(-1, Math.min(1, lap(e1) * cell * 1.6 + lap(e2) * cell * 3.2));
    }
    return { ao, curv };
  }
}
