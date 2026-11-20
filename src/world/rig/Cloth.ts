import * as THREE from 'three';
import { mulberry, SURFACES, type Surface, type V3 } from './Body.ts';

/**
 * CLOTH
 * ─────
 * Garments are not lathed: they are cut as a sheet of cloth, hung from where they are sewn (a
 * collar, a belt, the shoulders) and let fall. A short verlet simulation runs once when the design
 * is built: gravity pulls, the weave resists stretching but folds freely, a little bending stiffness
 * sets how wide the folds are, and the body underneath (a distance field of rough masses) holds the
 * cloth off it. The extra width of a hem that wants to hang straight under a narrower collar has
 * nowhere to go but into folds, so they form the way real ones do; what reaches the ground pools.
 * The settled sheet is skinned like any other part, and the shader keeps it moving.
 */

export interface Collider { distance(x: number, y: number, z: number): number }

/** A body to drape over: tapered capsules and ellipsoids, hard-unioned. */
export class BodyProxy implements Collider {
  private readonly caps: Array<[THREE.Vector3, THREE.Vector3, number, number]> = [];
  private readonly ells: Array<[THREE.Vector3, THREE.Vector3]> = [];
  capsule(a: V3, b: V3, ra: number, rb = ra): this { this.caps.push([new THREE.Vector3(...a), new THREE.Vector3(...b), ra, rb]); return this; }
  ellipsoid(c: V3, r: V3): this { this.ells.push([new THREE.Vector3(...c), new THREE.Vector3(...r)]); return this; }
  distance(x: number, y: number, z: number): number {
    let d = 1e9;
    for (const [a, b, ra, rb] of this.caps) {
      const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z, pax = x - a.x, pay = y - a.y, paz = z - a.z;
      const l2 = bax * bax + bay * bay + baz * baz;
      const t = l2 > 1e-12 ? Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / l2)) : 0;
      const dx = pax - bax * t, dy = pay - bay * t, dz = paz - baz * t;
      d = Math.min(d, Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * t));
    }
    for (const [c, r] of this.ells) {
      const lx = x - c.x, ly = y - c.y, lz = z - c.z;
      const ax = lx / r.x, ay = ly / r.y, az = lz / r.z, bx = ax / r.x, by = ay / r.y, bz = az / r.z;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az), k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      d = Math.min(d, k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r.x, r.y, r.z));
    }
    return d;
  }
}

/** Several colliders as one. */
export function union(...cs: Collider[]): Collider {
  return { distance: (x, y, z) => { let d = 1e9; for (const c of cs) d = Math.min(d, c.distance(x, y, z)); return d; } };
}

/**
 * A garment already settled, as a collider for the next layer: the farthest the cloth reaches from
 * the axis, in bins of angle and height (dilated a bin each way so folds cannot slip between).
 */
export class RadialHull implements Collider {
  private readonly A = 96;
  private readonly H = 90;
  private readonly r: Float32Array;
  private readonly y0: number;
  private readonly y1: number;
  constructor(geometry: THREE.BufferGeometry, private readonly cx: number, private readonly cz: number, private readonly depth: number, pad = 0.02) {
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    let y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)); }
    this.y0 = y0; this.y1 = y1;
    const raw = new Float32Array(this.A * this.H);
    for (let i = 0; i < pos.count; i++) {
      const [a, h, q] = this.bin(pos.getX(i), pos.getY(i), pos.getZ(i));
      raw[a + this.A * h] = Math.max(raw[a + this.A * h], q + pad);
    }
    this.r = new Float32Array(raw.length);
    for (let h = 0; h < this.H; h++) for (let a = 0; a < this.A; a++) {
      let m = 0;
      for (let dh = -1; dh <= 1; dh++) for (let da = -1; da <= 1; da++) {
        const hh = h + dh; if (hh < 0 || hh >= this.H) continue;
        m = Math.max(m, raw[((a + da + this.A) % this.A) + this.A * hh]);
      }
      this.r[a + this.A * h] = m;
    }
  }
  private bin(x: number, y: number, z: number): [number, number, number] {
    const lx = x - this.cx, lz = (z - this.cz) / this.depth;
    const a = Math.floor(((Math.atan2(lx, lz) / (Math.PI * 2) + 1) % 1) * this.A) % this.A;
    const h = Math.min(this.H - 1, Math.max(0, Math.floor(((y - this.y0) / Math.max(1e-6, this.y1 - this.y0)) * this.H)));
    return [a, h, Math.hypot(lx, lz)];
  }
  distance(x: number, y: number, z: number): number {
    if (y < this.y0 || y > this.y1) return 1e3;
    const [a, h, q] = this.bin(x, y, z);
    const r = this.r[a + this.A * h];
    return r > 0 ? (q - r) * Math.min(1, this.depth) : 1e3;
  }
}

/** Where along the cut (0 at the top, 1 at the hem) a sheet's row starts at height y. */
export function vAtHeight(profile: DrapeOptions['profile'], extra: number, y: number): number {
  const along = cut(profile, extra);
  let best = 0, bestD = Infinity;
  for (let i = 0; i <= 400; i++) { const v = i / 400, d = Math.abs(along(v)[1] - y); if (d < bestD) { bestD = d; best = v; } }
  return best;
}

function cut(profile: DrapeOptions['profile'], extra: number): (v: number) => [number, number] {
  const prof = profile.map(([r, y]) => [r, y] as [number, number]);
  if (extra) { const [r, y] = prof[prof.length - 1], [r0, y0] = prof[prof.length - 2]; const len = Math.hypot(r - r0, y - y0) || 1; prof.push([r + ((r - r0) / len) * extra, y + ((y - y0) / len) * extra]); }
  const cum = [0];
  for (let i = 1; i < prof.length; i++) cum.push(cum[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const total = cum[cum.length - 1];
  const fn = (v: number): [number, number] => {
    const s = v * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
    return [prof[i - 1][0] + (prof[i][0] - prof[i - 1][0]) * t, prof[i - 1][1] + (prof[i][1] - prof[i - 1][1]) * t];
  };
  (fn as unknown as { total: number }).total = total;
  return fn;
}

/** A stripe of the garment in its own colour and material: an embroidered hem, a trimmed edge. */
export interface Band {
  /** Which particles it covers, by their place on the sheet (u around/across, v down). */
  where: (u: number, v: number) => boolean;
  color: THREE.ColorRepresentation;
  shade?: THREE.ColorRepresentation;
  surface: Surface;
  glow?: number;
}

export interface DrapeOptions {
  /** Columns across (around a closed garment) and rows down. */
  cols: number;
  rows: number;
  /** A closed garment wraps around (a skirt, a robe); an open one has two free edges (a cloak). */
  closed?: boolean;
  /**
   * The cut: the profile the sheet starts on, as [radius, y] pairs from top to bottom (rows are
   * spaced evenly along it), swept over angles `arc` (radians from the front, clockwise seen from
   * above) about a vertical axis at `center`, squashed front-to-back by `depth`.
   */
  profile: ReadonlyArray<readonly [number, number]>;
  arc?: readonly [number, number];
  center?: readonly [number, number];
  depth?: number;
  /** Extra length below the profile's last point, so the hem reaches the ground and pools. */
  extra?: number;
  /** Particles held where they start (sewn): defaults to the top row. */
  pinned?: (u: number, v: number) => boolean;
  /** Pulls pinned particles to where they are finally sewn (gathers a collar, cinches a belt). */
  sew?: (u: number, v: number, p: THREE.Vector3) => void;
  collider?: Collider;
  /** How far the cloth keeps from the body (m). */
  thickness?: number;
  ground?: number;
  /** Seeded ripples that decide where the folds start. */
  folds?: number;
  foldDepth?: number;
  seed?: number;
  /** 0 = silk, 1 = felt: how much the cloth resists bending (sets the width of the folds). */
  stiffness?: number;
  steps?: number;
  color: THREE.ColorRepresentation;
  /** Colour toward the hem. */
  shade?: THREE.ColorRepresentation;
  surface?: Surface;
  glow?: number;
  bands?: readonly Band[];
  /** Bones the cloth may follow, chosen per vertex by distance. */
  bones: readonly string[];
  /** Bones by height: [y, bones][] from top down, overriding `bones` for vertices below each y. */
  bonesByHeight?: ReadonlyArray<readonly [number, readonly string[]]>;
}

export interface Drape {
  geometry: THREE.BufferGeometry;
  colors: Float32Array;
  surf: Float32Array;
  bones: string[][];
  ao: Float32Array;
  curv: Float32Array;
  /** The settled edges, for trims and hems that follow them: bottom row, and the free side edges. */
  hem: V3[];
  left: V3[];
  right: V3[];
  /** A settled point on the sheet. */
  at(u: number, v: number): V3;
  /** Its outward normal there. */
  normalAt(u: number, v: number): V3;
}

export function drape(o: DrapeOptions): Drape {
  const closed = o.closed ?? false;
  const cols = o.cols, rows = o.rows;
  const W = cols;
  const N = W * rows;
  const arc = o.arc ?? [0, Math.PI * 2];
  const [cx, cz] = o.center ?? [0, 0];
  const depth = o.depth ?? 1;
  const ground = o.ground ?? 0;
  const rand = mulberry(o.seed ?? 7);
  // Rows evenly spaced along the profile's length (plus the extra hanging length).
  const along = cut(o.profile, o.extra ?? 0);
  const total = (along as unknown as { total: number }).total;
  const U = (c: number) => (closed ? c / cols : c / (cols - 1));
  const V = (r: number) => r / (rows - 1);
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const ox = new Float32Array(N), oy = new Float32Array(N), oz = new Float32Array(N);
  const pin = new Uint8Array(N);
  const isPinned = o.pinned ?? ((_u: number, v: number) => v === 0);
  const folds = o.folds ?? 0, foldDepth = o.foldDepth ?? 0;
  const phase = Array.from({ length: 4 }, () => rand() * Math.PI * 2);
  for (let r = 0; r < rows; r++) {
    const [rad, y] = along(V(r));
    for (let c = 0; c < W; c++) {
      const u = U(c), v = V(r);
      const a = arc[0] + (arc[1] - arc[0]) * u;
      // Ripples that seed the folds, deeper toward the hem, irregular in width.
      const ripple = folds ? (Math.sin(a * folds + phase[0] + Math.sin(a * 3 + phase[1]) * 1.2) * 0.75 + Math.sin(a * folds * 1.7 + phase[2]) * 0.25) * foldDepth * Math.min(1, v * 1.6) : 0;
      const rr = rad * (1 + ripple);
      const i = r * W + c;
      px[i] = ox[i] = cx + Math.sin(a) * rr;
      py[i] = oy[i] = y;
      pz[i] = oz[i] = cz + Math.cos(a) * rr * depth;
      if (isPinned(u, v)) pin[i] = 1;
    }
  }
  // Constraints: [a, b, rest, kind] — 0 resists stretching only (cloth folds freely), 1 bends.
  const ca: number[] = [], cb: number[] = [], rest: number[] = [], kind: number[] = [];
  const link = (i: number, j: number, k: number) => { ca.push(i); cb.push(j); rest.push(Math.hypot(px[i] - px[j], py[i] - py[j], pz[i] - pz[j])); kind.push(k); };
  const idx = (r: number, c: number) => r * W + (closed ? ((c % W) + W) % W : c);
  for (let r = 0; r < rows; r++) for (let c = 0; c < W; c++) {
    const hasRight = closed || c + 1 < W, hasRight2 = closed || c + 2 < W;
    if (hasRight) link(idx(r, c), idx(r, c + 1), 0);
    if (r + 1 < rows) link(idx(r, c), idx(r + 1, c), 0);
    if (r + 1 < rows && hasRight) { link(idx(r, c), idx(r + 1, c + 1), 0); link(idx(r, c + 1), idx(r + 1, c), 0); }
    if (hasRight2) link(idx(r, c), idx(r, c + 2), 1);
    if (r + 2 < rows) link(idx(r, c), idx(r + 2, c), 1);
  }
  // Sew pinned particles to their final places, gradually, so the cloth gathers instead of tearing.
  const sewFrom = new Float32Array(N * 3), sewTo = new Float32Array(N * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    sewFrom.set([px[i], py[i], pz[i]], i * 3);
    tmp.set(px[i], py[i], pz[i]);
    if (pin[i] && o.sew) o.sew(U(i % W), V(Math.floor(i / W)), tmp);
    sewTo.set([tmp.x, tmp.y, tmp.z], i * 3);
  }
  const C = ca.length;
  const CA = Int32Array.from(ca), CB = Int32Array.from(cb), REST = Float32Array.from(rest), KIND = Uint8Array.from(kind);
  const stiff = o.stiffness ?? 0.25;
  const thick = o.thickness ?? 0.02;
  const coll = o.collider;
  const steps = o.steps ?? 110;
  const dt = 1 / 60, g = -9.8 * dt * dt * 0.7;
  const e = 0.004;
  for (let step = 0; step < steps; step++) {
    const sew = Math.min(1, step / (steps * 0.4));
    // Integrate: momentum, damped, and gravity.
    const damp = step < steps * 0.8 ? 0.985 : 0.9;
    for (let i = 0; i < N; i++) {
      if (pin[i]) {
        px[i] = sewFrom[i * 3] + (sewTo[i * 3] - sewFrom[i * 3]) * sew;
        py[i] = sewFrom[i * 3 + 1] + (sewTo[i * 3 + 1] - sewFrom[i * 3 + 1]) * sew;
        pz[i] = sewFrom[i * 3 + 2] + (sewTo[i * 3 + 2] - sewFrom[i * 3 + 2]) * sew;
        ox[i] = px[i]; oy[i] = py[i]; oz[i] = pz[i];
        continue;
      }
      const vx = (px[i] - ox[i]) * damp, vy = (py[i] - oy[i]) * damp, vz = (pz[i] - oz[i]) * damp;
      ox[i] = px[i]; oy[i] = py[i]; oz[i] = pz[i];
      px[i] += vx; py[i] += vy + g; pz[i] += vz;
    }
    // Satisfy the weave a few times per step.
    for (let it = 0; it < 6; it++) {
      for (let k = 0; k < C; k++) {
        const i = CA[k], j = CB[k];
        const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const r0 = REST[k];
        let diff: number;
        if (KIND[k] === 0) { if (d <= r0) continue; diff = (d - r0) / d; }
        else { diff = ((d - r0) / d) * stiff * 0.5; }
        const wi = pin[i] ? 0 : 1, wj = pin[j] ? 0 : 1, ws = wi + wj;
        if (!ws) continue;
        const fi = (diff * wi) / ws, fj = (diff * wj) / ws;
        px[i] += dx * fi; py[i] += dy * fi; pz[i] += dz * fi;
        px[j] -= dx * fj; py[j] -= dy * fj; pz[j] -= dz * fj;
      }
    }
    // Keep off the body and above the ground; friction where it rests.
    for (let i = 0; i < N; i++) {
      if (pin[i]) continue;
      if (coll) {
        const d = coll.distance(px[i], py[i], pz[i]) - thick;
        if (d < 0) {
          const gx = coll.distance(px[i] + e, py[i], pz[i]) - coll.distance(px[i] - e, py[i], pz[i]);
          const gy = coll.distance(px[i], py[i] + e, pz[i]) - coll.distance(px[i], py[i] - e, pz[i]);
          const gz = coll.distance(px[i], py[i], pz[i] + e) - coll.distance(px[i], py[i], pz[i] - e);
          const gl = Math.hypot(gx, gy, gz) || 1;
          px[i] -= (gx / gl) * d; py[i] -= (gy / gl) * d; pz[i] -= (gz / gl) * d;
          ox[i] += (px[i] - ox[i]) * 0.5; oz[i] += (pz[i] - oz[i]) * 0.5;
        }
      }
      if (py[i] < ground + thick) { py[i] = ground + thick; ox[i] += (px[i] - ox[i]) * 0.7; oz[i] += (pz[i] - oz[i]) * 0.7; }
    }
  }
  // The settled sheet as triangles.
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) positions.set([px[i], py[i], pz[i]], i * 3);
  const index: number[] = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < (closed ? W : W - 1); c++) {
    const a = idx(r, c), b = idx(r, c + 1), d = idx(r + 1, c), f = idx(r + 1, c + 1);
    index.push(a, d, b, b, d, f);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  // Normals must face out, away from the axis the garment hangs about.
  const nor = geometry.attributes.normal as THREE.BufferAttribute;
  let outward = 0;
  for (let i = 0; i < N; i++) outward += (px[i] - cx) * nor.getX(i) + (pz[i] - cz) * nor.getZ(i);
  if (outward < 0) {
    for (let t = 0; t < index.length; t += 3) { const s = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = s; }
    geometry.setIndex(index);
    geometry.computeVertexNormals();
  }
  // Per vertex: colour down the length, bands, folds' own occlusion and curvature.
  const colors = new Float32Array(N * 3), surf = new Float32Array(N * 2), ao = new Float32Array(N), curv = new Float32Array(N);
  const bones: string[][] = new Array(N);
  const c0 = new THREE.Color(o.color), c1 = new THREE.Color(o.shade ?? o.color), mixed = new THREE.Color(), b0 = new THREE.Color(), b1 = new THREE.Color();
  const sid = SURFACES[o.surface ?? 'cloth'];
  const n2 = geometry.attributes.normal as THREE.BufferAttribute;
  const spacing = total / (rows - 1);
  for (let r = 0; r < rows; r++) for (let c = 0; c < W; c++) {
    const i = idx(r, c), u = U(c), v = V(r);
    mixed.copy(c0).lerp(c1, v);
    let s = sid, gl = o.glow ?? 0;
    for (const band of o.bands ?? []) if (band.where(u, v)) { b0.set(band.color); b1.set(band.shade ?? band.color); mixed.copy(b0).lerp(b1, v); s = SURFACES[band.surface]; gl = band.glow ?? 0; }
    colors.set([mixed.r, mixed.g, mixed.b], i * 3);
    surf.set([s, gl], i * 2);
    // Umbrella operator: neighbours bulging in front of the normal mean the vertex sits in a fold's valley.
    let mx = 0, my = 0, mz = 0, n = 0;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || rr >= rows || (!closed && (cc < 0 || cc >= W))) continue;
      const j = idx(rr, cc);
      mx += px[j]; my += py[j]; mz += pz[j]; n++;
    }
    const lx = mx / n - px[i], ly = my / n - py[i], lz = mz / n - pz[i];
    const k = (lx * n2.getX(i) + ly * n2.getY(i) + lz * n2.getZ(i)) / (spacing * spacing);
    curv[i] = Math.max(-1, Math.min(1, -k * spacing * 2.2));
    ao[i] = Math.max(0.35, 1 - Math.max(0, k * spacing * 2.6)) * (0.82 + 0.18 * Math.min(1, v * 6));
    let list = o.bones as readonly string[];
    for (const [y, bl] of o.bonesByHeight ?? []) if (py[i] < y) list = bl;
    bones[i] = [...list];
  }
  // Smooth the occlusion and curvature once so folds shade softly.
  const smooth = (arr: Float32Array) => {
    const out = new Float32Array(arr.length);
    for (let r = 0; r < rows; r++) for (let c = 0; c < W; c++) {
      let s = arr[idx(r, c)] * 2, n = 2;
      for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= rows || (!closed && (cc < 0 || cc >= W))) continue;
        s += arr[idx(rr, cc)]; n++;
      }
      out[idx(r, c)] = s / n;
    }
    arr.set(out);
  };
  smooth(ao); smooth(curv);
  const point = (i: number): V3 => [px[i], py[i], pz[i]];
  const hem: V3[] = [], left: V3[] = [], right: V3[] = [];
  for (let c = 0; c < W; c++) hem.push(point(idx(rows - 1, c)));
  if (closed) hem.push(hem[0]);
  for (let r = 0; r < rows; r++) { left.push(point(idx(r, 0))); right.push(point(idx(r, W - 1))); }
  const nearest = (u: number, v: number) => idx(Math.round(Math.min(1, Math.max(0, v)) * (rows - 1)), Math.round(Math.min(1, Math.max(0, u)) * (closed ? cols : cols - 1)));
  return {
    geometry, colors, surf, bones, ao, curv, hem, left, right,
    at: (u, v) => point(nearest(u, v)),
    normalAt: (u, v) => { const i = nearest(u, v); return [n2.getX(i), n2.getY(i), n2.getZ(i)]; },
  };
}
