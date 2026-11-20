"""
THE SCULPTING KERNEL
====================
Forms are signed-distance functions evaluated with numpy, combined in order the way a sculptor adds
and cuts clay. Coordinates are the game's: metres, Y up, a character facing +Z.

The vocabulary is chosen so finished forms never read as primitives:

- ``limb``     a sweep along a smooth spline whose cross-section is a superellipse (diamond, oval,
               squared) with its own two radii, squareness, offset and twist varying along the
               length: muscle bellies swell to one side, tendons pinch, a shin is flat-fronted.
- ``hull``     a convex polyhedron from planes: claws, teeth, plates, chips of stone, bevelled gear.
- ``ellipsoid``/``box``/``cone``  blockout masses, used sparingly and cut into.
- ``carve_plane`` flattens a region with a plane (the planes of a face, a split in bark).
- ``crease``   a V-shaped groove along a curve (eyelid folds, seams, bark splits).
- ``relief``   per-form surface noise aligned with the form's own grain.

Every additive form carries attributes (material, colour, zone, bones) that are blended across joins
on the final mesh, so paint and rigging know where each part came from.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Callable, Sequence

import numpy as np

Vec = Sequence[float]
BIG = 1e3


# ───────────────────────────── noise ─────────────────────────────

def _hash_int(ix: np.ndarray, iy: np.ndarray, iz: np.ndarray, seed: int) -> np.ndarray:
    h = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (seed * 2654435761 & 0xFFFFFFFF)
    h &= 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h ^= h >> 16
    return h


def _hash(ix, iy, iz, seed):
    return (_hash_int(ix, iy, iz, seed) & 0xFFFFFF).astype(np.float64) / float(0x1000000)


# Gradient directions for Perlin-style noise (the 12 cube edges, padded to 16).
_GRAD = np.array([[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
                  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1], [1, 1, 0], [-1, 1, 0], [0, -1, 1], [0, -1, -1]], float)
# A fixed irrational rotation between octaves, so lattice directions never line up into a maze.
_ROT = None


def _octave_rotation() -> np.ndarray:
    global _ROT
    if _ROT is None:
        _ROT = rotation(0.61, 1.17, 0.37)
    return _ROT


def gradient_noise(p: np.ndarray, seed: int = 0) -> np.ndarray:
    """Perlin-style gradient noise at points p (n, 3), roughly in [-1, 1]."""
    i = np.floor(p)
    f = p - i
    u = f * f * f * (f * (f * 6 - 15) + 10)
    ix, iy, iz = i[:, 0].astype(np.int64), i[:, 1].astype(np.int64), i[:, 2].astype(np.int64)
    out = 0.0
    for dx in (0, 1):
        wx = u[:, 0] if dx else 1 - u[:, 0]
        for dy in (0, 1):
            wy = u[:, 1] if dy else 1 - u[:, 1]
            for dz in (0, 1):
                wz = u[:, 2] if dz else 1 - u[:, 2]
                g = _GRAD[_hash_int(ix + dx, iy + dy, iz + dz, seed) & 15]
                d = (f[:, 0] - dx) * g[:, 0] + (f[:, 1] - dy) * g[:, 1] + (f[:, 2] - dz) * g[:, 2]
                out = out + d * wx * wy * wz
    return out


def value_noise(p: np.ndarray, seed: int = 0) -> np.ndarray:
    """Smooth noise in [0, 1] (gradient noise remapped)."""
    return np.clip(0.5 + gradient_noise(p, seed) * 0.62, 0, 1)


def fbm(p: np.ndarray, octaves: int = 4, seed: int = 0, lacunarity: float = 2.03, gain: float = 0.5) -> np.ndarray:
    """Fractal noise in roughly [0, 1]."""
    R = _octave_rotation()
    total, amp, norm = 0.0, 0.5, 0.0
    q = p.copy()
    for o in range(octaves):
        total = total + amp * value_noise(q, seed + o * 17)
        norm += amp
        q = (q @ R) * lacunarity + 7.31
        amp *= gain
    return total / norm


def ridged(p: np.ndarray, octaves: int = 4, seed: int = 0) -> np.ndarray:
    """Ridged fractal noise in [0, 1]: sharp crests, like bark ridges or eroded stone."""
    R = _octave_rotation()
    total, amp, norm = 0.0, 0.5, 0.0
    q = p.copy()
    for o in range(octaves):
        n = 1.0 - np.abs(gradient_noise(q, seed + o * 31)) * 1.4
        n = np.clip(n, 0, 1)
        total = total + amp * n * n
        norm += amp
        q = (q @ R) * 2.07 + 3.17
        amp *= 0.5
    return total / norm


def cellular(p: np.ndarray, seed: int = 0, jitter: float = 0.9) -> tuple[np.ndarray, np.ndarray]:
    """Worley noise: distances to the nearest and second-nearest feature points (F1, F2).
    F2 − F1 draws crack networks (dried mud, bark plates, scales); F1 makes pebbled cells."""
    i = np.floor(p).astype(np.int64)
    f = p - i
    f1 = np.full(len(p), 9.0); f2 = np.full(len(p), 9.0)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cy, cz = i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz
                ox = dx + _hash(cx, cy, cz, seed) * jitter + (1 - jitter) * 0.5
                oy = dy + _hash(cx, cy, cz, seed + 1) * jitter + (1 - jitter) * 0.5
                oz = dz + _hash(cx, cy, cz, seed + 2) * jitter + (1 - jitter) * 0.5
                d = np.sqrt((ox - f[:, 0]) ** 2 + (oy - f[:, 1]) ** 2 + (oz - f[:, 2]) ** 2)
                closer = d < f1
                f2 = np.where(closer, f1, np.minimum(f2, d))
                f1 = np.where(closer, d, f1)
    return f1, f2


# ───────────────────────────── helpers ─────────────────────────────

def rotation(rx: float = 0.0, ry: float = 0.0, rz: float = 0.0) -> np.ndarray:
    """Rotation matrix for Euler angles in three.js's 'XYZ' order (R = Rx · Ry · Rz)."""
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz


def basis(x: Vec, y: Vec) -> np.ndarray:
    """Rotation whose local x axis points along x and y as close to y as possible."""
    X = np.asarray(x, float); X = X / np.linalg.norm(X)
    Z = np.cross(X, np.asarray(y, float)); Z = Z / np.linalg.norm(Z)
    Y = np.cross(Z, X)
    return np.stack([X, Y, Z], axis=1)


def smin(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    return -smin(-a, -b, k)


def interp_keys(keys: Sequence[Sequence[float]], u: np.ndarray, smooth: bool = True) -> np.ndarray:
    """Interpolate keyed values [(t, v...), ...] at parameters u in [0, 1]; returns (n, k)."""
    k = np.asarray(keys, float)
    t = k[:, 0]
    out = []
    for c in range(1, k.shape[1]):
        if smooth and len(t) > 1:
            # Smoothstep between keys: bellies and tapers without kinks.
            idx = np.clip(np.searchsorted(t, u, side='right') - 1, 0, len(t) - 2)
            t0, t1 = t[idx], t[idx + 1]
            s = np.clip((u - t0) / np.maximum(t1 - t0, 1e-9), 0, 1)
            s = s * s * (3 - 2 * s)
            out.append(k[idx, c] + (k[idx + 1, c] - k[idx, c]) * s)
        else:
            out.append(np.interp(u, t, k[:, c]))
    return np.stack(out, axis=1)


def catmull_rom(points: Sequence[Vec], samples_per_span: int = 10) -> np.ndarray:
    """A centripetal Catmull-Rom spline through points, sampled densely."""
    P = np.asarray(points, float)
    if len(P) == 2:
        t = np.linspace(0, 1, samples_per_span + 1)[:, None]
        return P[0] + (P[1] - P[0]) * t
    ext = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        def tj(ti, a, b):
            return ti + max(np.linalg.norm(b - a), 1e-6) ** 0.5
        t0 = 0.0; t1 = tj(t0, p0, p1); t2 = tj(t1, p1, p2); t3 = tj(t2, p2, p3)
        ts = np.linspace(t1, t2, samples_per_span, endpoint=(i == len(ext) - 3))
        for t in ts:
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    return np.asarray(out)


# ───────────────────────────── attributes ─────────────────────────────

@dataclass
class Attr:
    """What a form is made of: paint and rigging read these from the finished mesh."""
    mat: str = 'skin'
    color: tuple = (0.5, 0.5, 0.5)
    zone: str = ''
    bones: tuple = ()

    def with_(self, **kw) -> 'Attr':
        d = dict(mat=self.mat, color=self.color, zone=self.zone, bones=self.bones)
        d.update(kw)
        return Attr(**d)


def hexcol(h: str) -> tuple:
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


# ───────────────────────────── forms ─────────────────────────────

@dataclass
class Relief:
    """Surface relief: amplitude (m), frequency (cycles/m), stretch along the grain, kind."""
    amp: float = 0.0
    freq: float = 20.0
    stretch: float = 1.0
    kind: str = 'fbm'  # 'fbm' | 'ridged' | 'cells'
    seed: int = 0


def relief_value(Q: np.ndarray, r: 'Relief') -> np.ndarray:
    """Signed relief in about [-0.5, 0.5] (positive raises the surface)."""
    if r.kind == 'ridged':
        return ridged(Q, 3, r.seed) - 0.5
    if r.kind == 'cracks':
        # Plates separated by sharp-walled cracks; gentle fbm on the plates.
        f1, f2 = cellular(Q, r.seed)
        crack = np.clip((f2 - f1) / 0.12, 0, 1)
        return (crack ** 0.5 - 0.75) * 0.8 + (fbm(Q * 2.3, 2, r.seed + 3) - 0.5) * 0.35
    if r.kind == 'cells':
        f1, _ = cellular(Q, r.seed)
        return 0.35 - f1 * 0.7
    if r.kind == 'stone':
        # Weathered stone: broad erosion, then small pits and grit.
        broad = fbm(Q, 3, r.seed) - 0.5
        f1, _ = cellular(Q * 3.1, r.seed + 7)
        pits = np.clip(0.18 - f1, 0, 0.18) * -1.6
        return broad * 0.8 + pits + (fbm(Q * 9.0, 2, r.seed + 11) - 0.5) * 0.18
    return fbm(Q, 3, r.seed) - 0.5


class Form:
    lo: np.ndarray
    hi: np.ndarray
    relief: Relief | None = None

    def dist(self, P: np.ndarray) -> np.ndarray:  # (n, 3) -> (n,)
        raise NotImplementedError

    def grain(self, P: np.ndarray) -> np.ndarray:
        """Unit grain direction at points (default: the world's up)."""
        g = np.zeros_like(P); g[:, 1] = 1
        return g

    def eval(self, P: np.ndarray) -> np.ndarray:
        d = self.dist(P)
        r = self.relief
        if r is not None and r.amp:
            # Stretch the noise along the grain so bark runs with the trunk, cloth with the fall.
            g = self.grain(P)
            along = np.sum(P * g, axis=1, keepdims=True)
            Q = (P + g * along * (1.0 / max(r.stretch, 1e-3) - 1.0)) * r.freq
            d = d - relief_value(Q, r) * 2 * r.amp
        return d


class Ellipsoid(Form):
    def __init__(self, c: Vec, r: Vec, rot: np.ndarray | None = None, relief: Relief | None = None):
        self.c = np.asarray(c, float); self.r = np.asarray(r, float)
        self.R = np.eye(3) if rot is None else rot
        self.relief = relief
        m = self.r.max() + (relief.amp if relief else 0)
        self.lo, self.hi = self.c - m, self.c + m

    def dist(self, P):
        L = (P - self.c) @ self.R
        a = L / self.r
        b = L / (self.r * self.r)
        k0 = np.sqrt(np.sum(a * a, axis=1)); k1 = np.sqrt(np.sum(b * b, axis=1))
        return np.where(k1 > 1e-9, k0 * (k0 - 1) / np.maximum(k1, 1e-9), -self.r.min())

    def grain(self, P):
        g = np.tile(self.R[:, 1], (len(P), 1))
        return g


class Box(Form):
    def __init__(self, c: Vec, half: Vec, round_: float = 0.0, rot: np.ndarray | None = None, relief: Relief | None = None):
        self.c = np.asarray(c, float); self.h = np.asarray(half, float); self.rr = round_
        self.R = np.eye(3) if rot is None else rot
        self.relief = relief
        m = np.linalg.norm(self.h) + (relief.amp if relief else 0)
        self.lo, self.hi = self.c - m, self.c + m

    def dist(self, P):
        L = np.abs((P - self.c) @ self.R) - self.h + self.rr
        out = np.sqrt(np.sum(np.maximum(L, 0) ** 2, axis=1))
        return out + np.minimum(L.max(axis=1), 0) - self.rr

    def grain(self, P):
        return np.tile(self.R[:, 1], (len(P), 1))


class Cone(Form):
    """A tapered capsule (round ends): blockout only, or small round things (knuckle pads)."""
    def __init__(self, a: Vec, b: Vec, ra: float, rb: float, relief: Relief | None = None):
        self.a = np.asarray(a, float); self.b = np.asarray(b, float); self.ra, self.rb = ra, rb
        self.relief = relief
        m = max(ra, rb) + (relief.amp if relief else 0)
        self.lo = np.minimum(self.a, self.b) - m; self.hi = np.maximum(self.a, self.b) + m

    def dist(self, P):
        ba = self.b - self.a
        l2 = max(float(ba @ ba), 1e-12)
        t = np.clip(((P - self.a) @ ba) / l2, 0, 1)
        C = self.a + t[:, None] * ba
        return np.linalg.norm(P - C, axis=1) - (self.ra + (self.rb - self.ra) * t)

    def grain(self, P):
        g = self.b - self.a
        return np.tile(g / max(np.linalg.norm(g), 1e-9), (len(P), 1))


class Hull(Form):
    """A convex polyhedron from planes (point, outward normal), bevelled by `bevel`."""
    def __init__(self, planes: Sequence[tuple], bevel: float = 0.0, bound: tuple | None = None, relief: Relief | None = None):
        self.pts = np.asarray([p for p, _ in planes], float)
        n = np.asarray([nn for _, nn in planes], float)
        self.ns = n / np.linalg.norm(n, axis=1, keepdims=True)
        self.bevel = bevel
        self.relief = relief
        if bound is None:
            bound = (self.pts.min(axis=0) - 0.5, self.pts.max(axis=0) + 0.5)
        pad = relief.amp if relief else 0
        self.lo, self.hi = np.asarray(bound[0], float) - pad, np.asarray(bound[1], float) + pad

    def dist(self, P):
        d = None
        for p, n in zip(self.pts, self.ns):
            di = (P - p) @ n
            d = di if d is None else smax(d, di, self.bevel)
        return d


def prism(base: Sequence[Vec], apex: Vec, bevel: float = 0.0) -> Hull:
    """A pointed prism/pyramid from a convex base polygon (counter-clockwise seen from apex) to an apex:
    claws, thorns, teeth, horn tips — sharp, faceted, never round."""
    B = np.asarray(base, float); A = np.asarray(apex, float)
    c = B.mean(axis=0)
    planes = []
    n_base = np.cross(B[1] - B[0], B[2] - B[0]); n_base /= np.linalg.norm(n_base)
    if (A - c) @ n_base > 0:
        n_base = -n_base
    planes.append((c, n_base))
    for i in range(len(B)):
        p0, p1 = B[i], B[(i + 1) % len(B)]
        n = np.cross(p1 - p0, A - p0); n /= np.linalg.norm(n)
        if (c - p0) @ n > 0:
            n = -n
        planes.append((p0, n))
    lo = np.minimum(B.min(axis=0), A) - 0.01; hi = np.maximum(B.max(axis=0), A) + 0.01
    return Hull(planes, bevel, (lo, hi))


def claw(root: Vec, tip: Vec, width: float, curl: Vec = (0, 0, 0), sides: int = 3, bevel: float = 0.0005) -> list[Hull]:
    """A hooked claw or thorn: faceted segments tapering to a point along a curve."""
    root = np.asarray(root, float); tip = np.asarray(tip, float); curl = np.asarray(curl, float)
    mid = (root + tip) / 2 + curl
    axis = tip - root; axis /= np.linalg.norm(axis)
    up = np.array([0, 1, 0]) if abs(axis[1]) < 0.9 else np.array([1, 0, 0])
    e1 = np.cross(axis, up); e1 /= np.linalg.norm(e1); e2 = np.cross(axis, e1)
    def ring(c, w):
        return [c + (e1 * math.cos(a) + e2 * math.sin(a)) * w for a in np.linspace(0, 2 * math.pi, sides, endpoint=False)]
    hulls = []
    # Base segment (a frustum as a hull) then the hooked point.
    r0, r1 = ring(root, width), ring(mid, width * 0.55)
    planes = []
    for i in range(sides):
        a, b, c2 = r0[i], r0[(i + 1) % sides], r1[i]
        n = np.cross(b - a, c2 - a); n /= np.linalg.norm(n)
        if (root - a) @ n > 0:
            n = -n
        planes.append((a, n))
    planes.append((root, -axis))
    seg = mid - root; seg /= np.linalg.norm(seg)
    planes.append((mid, seg))
    lo = np.minimum(root, mid) - width * 1.2; hi = np.maximum(root, mid) + width * 1.2
    hulls.append(Hull(planes, bevel, (lo, hi)))
    hulls.append(prism(r1[::-1], tip, bevel))
    return hulls


class Limb(Form):
    """
    A sweep along a spline with a superellipse cross-section that changes along its length.

    keys (each a list of (t, ...) with t in [0, 1] along the length):
      radii:  (t, ru, rv)   half-widths across the local x (side) and y (front) axes
      square: (t, n)        2 = oval, 3–5 = squared, 1.2–1.8 = diamond-ish
      offset: (t, ou, ov)   shift the section off the spine (a calf swelling behind)
      twist:  (t, radians)  rotate the section about the spine
    `up` orients the section's local y at the start (for a leg, forward).
    """
    def __init__(self, points: Sequence[Vec], radii, square=((0, 2.0), (1, 2.0)), offset=((0, 0, 0), (1, 0, 0)),
                 twist=((0, 0.0), (1, 0.0)), up: Vec = (0, 0, 1), cap: float = 0.3, relief: Relief | None = None,
                 samples: int = 10):
        S = catmull_rom(points, samples)
        self.S = S
        seg = S[1:] - S[:-1]
        self.len = np.linalg.norm(seg, axis=1)
        self.cum = np.concatenate([[0], np.cumsum(self.len)])
        self.total = self.cum[-1]
        self.radii, self.square, self.offset, self.twist = radii, square, offset, twist
        self.cap = cap
        self.relief = relief
        # Parallel-transported frames along the spline (no flips).
        T = np.vstack([seg / self.len[:, None], (seg[-1] / self.len[-1])[None]])
        T = (T + np.vstack([T[:1], T[:-1]])) / 2
        T /= np.linalg.norm(T, axis=1, keepdims=True)
        u0 = np.asarray(up, float)
        N = [u0 - T[0] * (u0 @ T[0])]
        N[0] /= np.linalg.norm(N[0])
        for i in range(1, len(T)):
            n = N[-1] - T[i] * (N[-1] @ T[i])
            N.append(n / np.linalg.norm(n))
        self.T, self.N = T, np.asarray(N)
        self.B = np.cross(self.T, self.N)  # local x (side); N is local y (front)
        rmax = np.max(np.asarray(radii, float)[:, 1:]) + np.max(np.abs(np.asarray(offset, float)[:, 1:])) + (relief.amp if relief else 0)
        self.lo = S.min(axis=0) - rmax * 1.3; self.hi = S.max(axis=0) + rmax * 1.3

    def _project(self, P):
        A = self.S[:-1]; AB = self.S[1:] - A
        l2 = np.maximum(np.sum(AB * AB, axis=1), 1e-12)
        # (n, m) parameters per segment; pick the nearest segment for each point.
        rel = P[:, None, :] - A[None, :, :]
        traw = np.sum(rel * AB[None], axis=2) / l2[None]
        t = np.clip(traw, 0, 1)
        C = A[None] + t[..., None] * AB[None]
        d2 = np.sum((P[:, None, :] - C) ** 2, axis=2)
        s = np.argmin(d2, axis=1)
        idx = np.arange(len(P))
        return s, t[idx, s], traw[idx, s], C[idx, s]

    def _frames(self, P):
        s, t, traw, C = self._project(P)
        u = (self.cum[s] + t * self.len[s]) / self.total
        T = self.T[s] * (1 - t[:, None]) + self.T[s + 1] * t[:, None]
        N = self.N[s] * (1 - t[:, None]) + self.N[s + 1] * t[:, None]
        T /= np.linalg.norm(T, axis=1, keepdims=True)
        N = N - T * np.sum(N * T, axis=1, keepdims=True)
        N /= np.linalg.norm(N, axis=1, keepdims=True)
        B = np.cross(T, N)
        # Distance past either end, along the spine.
        axial = np.where((s == 0) & (traw < 0), -traw * self.len[0], 0.0)
        last = len(self.len) - 1
        axial = np.where((s == last) & (traw > 1), (traw - 1) * self.len[last], axial)
        return u, C, T, N, B, axial

    def dist(self, P):
        u, C, T, N, B, axial = self._frames(P)
        tw = interp_keys(self.twist, u)[:, 0]
        ct, st = np.cos(tw)[:, None], np.sin(tw)[:, None]
        Bx = B * ct + N * st
        Ny = N * ct - B * st
        rel = P - C - T * np.sum((P - C) * T, axis=1, keepdims=True)
        off = interp_keys(self.offset, u)
        x = np.sum(rel * Bx, axis=1) - off[:, 0]
        y = np.sum(rel * Ny, axis=1) - off[:, 1]
        r = interp_keys(self.radii, u)
        ru, rv = np.maximum(r[:, 0], 1e-5), np.maximum(r[:, 1], 1e-5)
        n = interp_keys(self.square, u)[:, 0]
        ax, ay = np.abs(x) / ru, np.abs(y) / rv
        f = (ax ** n + ay ** n) ** (1 / n)
        f = np.maximum(f, 1e-9)
        gx = (ax ** (n - 1)) * f ** (1 - n) / ru
        gy = (ay ** (n - 1)) * f ** (1 - n) / rv
        g = np.sqrt(gx * gx + gy * gy) + 1e-9
        dsec = (f - 1) / g
        # Keep the estimate honest far from the surface.
        radial = np.sqrt(x * x + y * y)
        dsec = np.where(dsec > 0, np.minimum(dsec, radial), np.maximum(dsec, -np.minimum(ru, rv)))
        # Ends: a flat cap softened by `cap` (fraction of the end radius), not a hemisphere.
        rc = self.cap * np.minimum(ru, rv)
        q0, q1 = dsec + rc, axial + rc
        outside = np.sqrt(np.maximum(q0, 0) ** 2 + np.maximum(q1, 0) ** 2)
        return outside + np.minimum(np.maximum(q0, q1), 0) - rc

    def grain(self, P):
        _, _, T, _, _, _ = self._frames(P)
        return T


class Shell(Form):
    """Any form hollowed to a thickness (a mask, a helmet, a cup)."""
    def __init__(self, inner: Form, thickness: float):
        self.inner, self.t = inner, thickness
        self.lo, self.hi = inner.lo, inner.hi
        self.relief = None

    def dist(self, P):
        return np.abs(self.inner.eval(P) + self.t / 2) - self.t / 2


class Region(Form):
    """Intersection of a half-space with a bounding form: what a local plane cut removes."""
    def __init__(self, point: Vec, normal: Vec, bound: Form):
        self.p = np.asarray(point, float); n = np.asarray(normal, float); self.n = n / np.linalg.norm(n)
        self.bound = bound
        self.lo, self.hi = bound.lo, bound.hi
        self.relief = None

    def dist(self, P):
        return np.maximum(-((P - self.p) @ self.n), self.bound.dist(P))


# ───────────────────────────── the sculpt ─────────────────────────────

@dataclass
class Op:
    kind: str           # 'add' | 'sub' | 'int' | 'crease'
    form: Form | None
    k: float
    attr: Attr | None = None
    crease: dict | None = None
    lo: np.ndarray = field(default_factory=lambda: np.zeros(3))
    hi: np.ndarray = field(default_factory=lambda: np.zeros(3))


class Sculpt:
    def __init__(self, name: str = 'sculpt'):
        self.name = name
        self.ops: list[Op] = []

    # Adding and cutting ------------------------------------------------------------
    def add(self, form: Form, attr: Attr, k: float = 0.01) -> Form:
        self.ops.append(Op('add', form, k, attr, lo=form.lo - k, hi=form.hi + k))
        return form

    def sub(self, form: Form, k: float = 0.004) -> Form:
        self.ops.append(Op('sub', form, k, lo=form.lo - k, hi=form.hi + k))
        return form

    def carve_plane(self, point: Vec, normal: Vec, bound: Form, k: float = 0.002) -> None:
        """Flatten whatever lies past a plane, only inside `bound` (a local cut, not a global one)."""
        self.sub(Region(point, normal, bound), k)

    def displace(self, relief: 'Relief', bound: Form | None = None) -> None:
        """Relief over everything sculpted so far (cut faces included), optionally only inside `bound`."""
        lo = bound.lo if bound is not None else np.full(3, -1e9)
        hi = bound.hi if bound is not None else np.full(3, 1e9)
        self.ops.append(Op('displace', bound, 0, crease=dict(r=relief), lo=lo, hi=hi))

    def crease(self, points: Sequence[Vec], width: float, depth: float, profile: float = 1.0, taper: bool = True) -> None:
        """A V-groove along a curve: pushes the surface in by `depth` within `width` of it."""
        S = catmull_rom(points, 8)
        lo = S.min(axis=0) - width * 2; hi = S.max(axis=0) + width * 2
        self.ops.append(Op('crease', None, 0, crease=dict(S=S, w=width, d=depth, p=profile, taper=taper), lo=lo, hi=hi))

    # Convenience builders ----------------------------------------------------------
    def limb(self, points, radii, attr: Attr, k: float = 0.01, **kw) -> Limb:
        return self.add(Limb(points, radii, **kw), attr, k)

    def ellipsoid(self, c, r, attr: Attr, k: float = 0.01, rot=None, relief=None) -> Ellipsoid:
        return self.add(Ellipsoid(c, r, rot, relief), attr, k)

    def box(self, c, half, attr: Attr, k: float = 0.004, round_=0.0, rot=None, relief=None) -> Box:
        return self.add(Box(c, half, round_, rot, relief), attr, k)

    def cone(self, a, b, ra, rb, attr: Attr, k: float = 0.006, relief=None) -> Cone:
        return self.add(Cone(a, b, ra, rb, relief), attr, k)

    def hull(self, hull: Hull, attr: Attr, k: float = 0.002) -> Hull:
        return self.add(hull, attr, k)

    # Evaluation ----------------------------------------------------------------------
    def bounds(self, pad: float) -> tuple[np.ndarray, np.ndarray]:
        lo = np.full(3, np.inf); hi = np.full(3, -np.inf)
        for op in self.ops:
            if op.kind == 'add':
                lo = np.minimum(lo, op.lo); hi = np.maximum(hi, op.hi)
        return lo - pad, hi + pad

    def field(self, P: np.ndarray, plo: np.ndarray | None = None, phi: np.ndarray | None = None) -> np.ndarray:
        """The sculpted field at points P (n, 3), using only operations whose bounds reach [plo, phi]."""
        if plo is None:
            plo, phi = P.min(axis=0), P.max(axis=0)
        d = np.full(len(P), BIG)
        for op in self.ops:
            if np.any(op.hi < plo) or np.any(op.lo > phi):
                continue
            if op.kind == 'add':
                d = smin(d, op.form.eval(P), op.k)
            elif op.kind == 'sub':
                d = smax(d, -op.form.eval(P), op.k)
            elif op.kind == 'int':
                d = smax(d, op.form.eval(P), op.k)
            elif op.kind == 'displace':
                r = op.crease['r']
                near = np.abs(d) < r.amp * 4 + 0.01
                if near.any():
                    Q = P[near] * r.freq
                    amt = relief_value(Q, r) * 2 * r.amp
                    if op.form is not None:
                        amt = amt * np.clip(-op.form.eval(P[near]) / 0.02, 0, 1)
                    d = d.copy(); d[near] = d[near] - amt
            elif op.kind == 'crease':
                c = op.crease
                S = c['S']
                A = S[:-1]; AB = S[1:] - A
                l2 = np.maximum(np.sum(AB * AB, axis=1), 1e-12)
                rel = P[:, None, :] - A[None]
                t = np.clip(np.sum(rel * AB[None], axis=2) / l2[None], 0, 1)
                C = A[None] + t[..., None] * AB[None]
                dist = np.sqrt(np.min(np.sum((P[:, None, :] - C) ** 2, axis=2), axis=1))
                fall = np.clip(1 - dist / c['w'], 0, 1) ** c['p']
                if c['taper']:
                    s = np.argmin(np.sum((P[:, None, :] - C) ** 2, axis=2), axis=1)
                    u = (s + 0.5) / len(A)
                    fall = fall * np.clip(np.sin(np.pi * u) * 1.6, 0, 1)
                d = d + fall * c['d']
        return d

    def attributes(self, V: np.ndarray, chunk: int = 12000) -> dict:
        """Blend the additive forms' attributes onto mesh vertices V (n, 3), a chunk at a time."""
        adds = [op for op in self.ops if op.kind == 'add']
        n = len(V)
        color = np.zeros((n, 3))
        best_i = np.zeros(n, dtype=np.int64)
        for start in range(0, n, chunk):
            Pc = V[start:start + chunk]
            lo, hi = Pc.min(axis=0), Pc.max(axis=0)
            D = np.full((len(Pc), len(adds)), np.inf)
            for j, op in enumerate(adds):
                if np.any(op.hi < lo) or np.any(op.lo > hi):
                    continue
                D[:, j] = op.form.eval(Pc)
            bi = np.argmin(D, axis=1)
            best = D[np.arange(len(Pc)), bi]
            ws = np.zeros(len(Pc)); col = np.zeros((len(Pc), 3))
            for j, op in enumerate(adds):
                dj = D[:, j]
                ok = np.isfinite(dj)
                if not ok.any():
                    continue
                w = np.where(ok, np.exp(-np.maximum(np.where(ok, dj, 0) - best, 0) / max(op.k * 0.45, 0.0015)), 0)
                col += w[:, None] * np.asarray(op.attr.color)[None]
                ws += w
            color[start:start + chunk] = col / np.maximum(ws, 1e-9)[:, None]
            best_i[start:start + chunk] = bi
        mats = np.array([adds[i].attr.mat for i in best_i])
        zones = np.array([adds[i].attr.zone for i in best_i])
        bones = [adds[i].attr.bones for i in best_i]
        return dict(color=color, mat=mats, zone=zones, bones=bones, form=best_i)
