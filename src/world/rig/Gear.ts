import * as THREE from 'three';
import { mulberry, type V3 } from './Body.ts';

/**
 * GEAR
 * ────
 * What a character carries and wears besides cloth: leather straps that lie flat on the body,
 * bandages and wraps wound round a limb, twisted rope, rings. Each returns a geometry with normals,
 * ready for Body.part, so it is skinned and shaded like the rest of the figure.
 */

const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

/**
 * A strap that lies on a surface: a flat band of `width` and `thickness` through points, kept
 * tangent to the surface by the normals there (cast them from a Sculpt). Closed at both ends.
 */
export function strap(points: readonly V3[], normals: readonly V3[], width: number, thickness: number, samples = 4): THREE.BufferGeometry {
  // Smooth the path so a handful of cast points makes a clean curve.
  const curve = new THREE.CatmullRomCurve3(points.map(v3));
  const ncurve = new THREE.CatmullRomCurve3(normals.map(v3));
  const n = Math.max(2, (points.length - 1) * samples + 1);
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const t = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    ncurve.getPointAt(u, up).normalize();
    side.crossVectors(t, up).normalize();
    up.crossVectors(side, t).normalize();
    const hw = width / 2;
    // Section corners: bottom-left, top-left, top-right, bottom-right; face f runs from corner f
    // to corner f+1 with its own normal, so the edges stay crisp.
    const corners = [[-hw, 0], [-hw, thickness], [hw, thickness], [hw, 0]];
    const faceN = [side.clone().negate(), up.clone(), side.clone(), up.clone().negate()];
    for (let f = 0; f < 4; f++) for (const c of [f, (f + 1) % 4]) {
      const [x, y] = corners[c];
      pos.push(p.x + side.x * x + up.x * y, p.y + side.y * x + up.y * y, p.z + side.z * x + up.z * y);
      nor.push(faceN[f].x, faceN[f].y, faceN[f].z);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let f = 0; f < 4; f++) {
    const v0 = i * 8 + f * 2, v1 = v0 + 1;
    idx.push(v0, v0 + 8, v1, v1, v0 + 8, v1 + 8);
  }
  // End caps.
  for (const base of [0, (n - 1) * 8]) idx.push(base, base + 2, base + 4, base, base + 4, base + 6);
  return finish(pos, nor, idx);
}

/** Geometry from arrays, every triangle wound to face along its vertex normals (the shader trusts it). */
function finish(pos: number[], nor: number[], idx: number[]): THREE.BufferGeometry {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
    a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3).sub(a); c.fromArray(pos, i2 * 3).sub(a);
    const n = b.cross(c);
    const nx = nor[i0 * 3] + nor[i1 * 3] + nor[i2 * 3], ny = nor[i0 * 3 + 1] + nor[i1 * 3 + 1] + nor[i2 * 3 + 1], nz = nor[i0 * 3 + 2] + nor[i1 * 3 + 2] + nor[i2 * 3 + 2];
    if (n.x * nx + n.y * ny + n.z * nz < 0) { idx[t + 1] = i2; idx[t + 2] = i1; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/**
 * A bandage or cloth strip wound round a tapered limb from a to b: a ribbon lying on the limb's
 * surface, overlapping itself as it climbs, with a little irregularity so it looks tied by hand.
 */
export function wrap(a: V3, b: V3, ra: number, rb: number, o: { turns: number; width: number; seed?: number; lift?: number }): THREE.BufferGeometry {
  const A = v3(a), B = v3(b), axis = B.clone().sub(A);
  const len = axis.length();
  axis.normalize();
  const ref = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(axis, ref).normalize(), e2 = new THREE.Vector3().crossVectors(axis, e1);
  const rand = mulberry(o.seed ?? 3);
  const n = Math.ceil(o.turns * 28);
  const wobble = Array.from({ length: 6 }, () => rand() * Math.PI * 2);
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const lift = o.lift ?? 0.003;
  for (let i = 0; i <= n; i++) {
    const u = i / n, ang = u * o.turns * Math.PI * 2;
    const r = ra + (rb - ra) * u + lift + Math.sin(ang * 0.5 + wobble[0]) * lift * 0.5;
    const radial = e1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(e2, Math.sin(ang));
    const c = A.clone().addScaledVector(axis, u * len).addScaledVector(radial, r);
    // The ribbon is tilted along the climb, slightly uneven in width.
    const w = o.width * (0.85 + 0.15 * Math.sin(ang * 1.3 + wobble[1]));
    const along = axis.clone().multiplyScalar(w / 2);
    pos.push(c.x - along.x, c.y - along.y, c.z - along.z, c.x + along.x, c.y + along.y, c.z + along.z);
    nor.push(radial.x, radial.y, radial.z, radial.x, radial.y, radial.z);
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  return finish(pos, nor, idx);
}

/** Twisted rope through points: strands spiralling round the path (a tube per strand). */
export function ropeStrands(points: readonly V3[], radius: number, strands = 3, twist = 40): V3[][] {
  const curve = new THREE.CatmullRomCurve3(points.map(v3));
  const len = curve.getLength();
  const n = Math.max(8, Math.ceil(len / (radius * 1.2)));
  const frames = curve.computeFrenetFrames(n, false);
  const out: V3[][] = Array.from({ length: strands }, () => []);
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u);
    for (let s = 0; s < strands; s++) {
      const a = (s / strands) * Math.PI * 2 + u * len * twist;
      const q = p.clone().addScaledVector(frames.normals[i], Math.cos(a) * radius * 0.55).addScaledVector(frames.binormals[i], Math.sin(a) * radius * 0.55);
      out[s].push([q.x, q.y, q.z]);
    }
  }
  return out;
}

/** A ring (earring, buckle loop, chain link) around `axis`, centred at c. */
export function ring(c: V3, axis: V3, radius: number, thickness: number, segments = 18): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(radius, thickness, 6, segments);
  g.deleteAttribute('uv');
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(axis).normalize());
  g.applyQuaternion(q);
  g.translate(c[0], c[1], c[2]);
  return g;
}

/** Euler angles (XYZ) that turn a form's own x and y axes onto the given directions. */
export function frame(x: V3, y: V3): V3 {
  const X = v3(x).normalize(), Y0 = v3(y);
  const Z = new THREE.Vector3().crossVectors(X, Y0).normalize();
  const Y = new THREE.Vector3().crossVectors(Z, X);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z), 'XYZ');
  return [e.x, e.y, e.z];
}
