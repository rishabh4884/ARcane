"""
THE BACKGROUND PAINTER
======================
Paints a set the way a background painter on an animated series works, from the facts the layout
gathered (setscene.py) rather than from a finished render:

1. DESIGN  — decide the picture: values from the moon, the sky and the lanterns, each with its own
   colour and weight; the region's palette pressed onto them (darks are deep teal-green, never black;
   local colour shows in the light and sinks into the palette in shadow); the four depth layers
   (a dark foreground frame, the play plane with the most contrast, a midground lifting toward the
   air, a quiet background); ground mist that gathers in hollows and separates the layers; a painted
   sky with the moon, its halo and silvered clouds.
2. PAINT   — repaint the design with brush strokes, broad to fine: each stroke one colour with
   bristle streaks, laid along the forms (up a trunk, across the ground, round a canopy), stopping at
   the edge of a thing so silhouettes stay drawn; foliage in dabs that break the canopy's outline
   against the sky; detail gathered where the eye goes, the distance left broad.
3. DETAIL  — what a painter adds by hand: grass tufts with moonlit tips, a fern in the corner.
4. FINISH  — wobble in every edge, the tooth of the paper.

Runs in plain Python with numpy, scipy and Pillow (not inside Blender).
"""
from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

SKY, GROUND, TRUNK, ROCK, LEAF, LANTERN, GLASS, GATE, WATER = range(9)


# ───────────────────────────── colour helpers ─────────────────────────────

def hexc(h: str) -> np.ndarray:
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def to_lin(c):
    c = np.asarray(c, np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((np.maximum(c, 0) + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.maximum(np.asarray(c, np.float32), 0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def luma(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def mix(a, b, t):
    """Linear blend; a mask (H, W) blends colours (…, 3) channel-wise."""
    a = np.asarray(a, np.float32); b = np.asarray(b, np.float32); t = np.asarray(t, np.float32)
    colour = (a.ndim and a.shape[-1] == 3) or (b.ndim and b.shape[-1] == 3)
    if colour and t.ndim and t.shape[-1] not in (1, 3):
        t = t[..., None]
    return a + (b - a) * t


def blur(img, sigma):
    if sigma <= 0:
        return img
    if img.ndim == 3:
        return np.stack([ndi.gaussian_filter(img[..., c], sigma, mode='nearest') for c in range(img.shape[2])], -1)
    return ndi.gaussian_filter(img, sigma, mode='nearest')


def noise2(H: int, W: int, scale: float, seed: int, octaves: int = 4, aniso: tuple = (1.0, 1.0)) -> np.ndarray:
    """Smooth fractal noise in [0, 1] by blurring white noise at several scales (scale = feature size px)."""
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(scale / (2 ** o), 1.0)
        small = (max(2, int(H / s * aniso[0]) + 2), max(2, int(W / s * aniso[1]) + 2))
        n = rng.random(small).astype(np.float32)
        n = ndi.zoom(n, (H / (small[0] - 1), W / (small[1] - 1)), order=3, mode='nearest')[:H, :W]
        out += n * amp
        tot += amp
        amp *= 0.5
    out /= tot
    lo, hi = np.percentile(out, (1, 99))
    return np.clip((out - lo) / max(hi - lo, 1e-6), 0, 1)


def world_noise(P: np.ndarray, scale_m: float, seed: int, octaves: int = 3, extent: float = 240.0) -> np.ndarray:
    """Noise fixed to the ground (sampled at each pixel's world x, z), so patches sit in perspective."""
    n = int(min(2048, max(64, extent / scale_m * 6)))
    tex = noise2(n, n, n * scale_m / extent * 2.2, seed, octaves)
    u = (P[..., 0] + extent / 2) / extent * (n - 1)
    v = (P[..., 2] + extent / 2) / extent * (n - 1)
    return ndi.map_coordinates(tex, [v.ravel(), u.ravel()], order=1, mode='reflect').reshape(P.shape[:2])


def _hash3(c: np.ndarray, seed: int) -> np.ndarray:
    c = c.astype(np.int64)
    h = (c[:, 0] * 73856093) ^ (c[:, 1] * 19349663) ^ (c[:, 2] * 83492791) ^ (seed * 2654435761)
    out = []
    for k in (0x9E3779B1, 0x85EBCA77, 0xC2B2AE3D):
        x = (h * k) & 0xFFFFFFFF
        x ^= x >> 15
        x = (x * 0x2C1B3C6D) & 0xFFFFFFFF
        x ^= x >> 12
        out.append((x & 0xFFFFFF) / float(0x1000000))
    return np.stack(out, 1)


def clumps(P: np.ndarray, size: float, light: np.ndarray, seed: int = 1) -> tuple[np.ndarray, np.ndarray]:
    """Foliage as clumps: each point belongs to the nearest of a scatter of clump centres (3D cells of
    `size` metres); its side of the clump facing `light` is lit. Returns (lit side -1..1, gap 0..)."""
    Q = P / size
    base = np.floor(Q)
    b1 = np.full(len(Q), 1e9); b2 = np.full(len(Q), 1e9)
    v1 = np.zeros_like(Q)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cell = base + np.array([dx, dy, dz])
                fp = cell + 0.15 + 0.7 * _hash3(cell, seed)
                diff = Q - fp
                dist = np.sqrt((diff * diff).sum(1))
                closer = dist < b1
                b2 = np.where(closer, b1, np.minimum(b2, dist))
                v1 = np.where(closer[:, None], diff, v1)
                b1 = np.where(closer, dist, b1)
    n = v1 / np.maximum(np.linalg.norm(v1, axis=1, keepdims=True), 1e-6)
    return n @ light, b2 - b1


# ───────────────────────────── the facts of the place ─────────────────────────────

@dataclass
class Passes:
    albedo: np.ndarray
    moon: np.ndarray
    sky: np.ndarray
    lamp: np.ndarray
    P: np.ndarray            # game-space positions
    N: np.ndarray            # game-space normals
    K: np.ndarray            # class ids
    rnd: np.ndarray          # random per object
    depth: np.ndarray
    rays: np.ndarray         # view ray per pixel (game space)
    ground_h: np.ndarray     # height of the ground beneath each pixel's point
    meta: dict
    layout: dict
    moon_px: tuple = (0.0, 0.0)
    focal: float = 1.0
    H: int = 0
    W: int = 0
    extra: dict = field(default_factory=dict)


def load_passes(build: str, layout_path: str, depth_max: float = 400.0) -> Passes:
    meta = json.load(open(f'{build}/meta.json'))
    layout = json.load(open(layout_path))
    ld = lambda k: np.load(f'{build}/{k}.npy').astype(np.float32)  # noqa: E731
    albedo, moon, sky, lamp = ld('albedo'), ld('moon').mean(-1), ld('sky').mean(-1), ld('lamp').mean(-1)
    pb, nb, ids = ld('position'), ld('normal'), ld('ids')
    P = np.stack([pb[..., 0], pb[..., 2], -pb[..., 1]], -1)
    N = np.stack([nb[..., 0], nb[..., 2], -nb[..., 1]], -1)
    K = np.clip(np.round(ids[..., 0] * 10), 0, 8).astype(np.int8)
    H, W = K.shape
    cam = np.asarray(meta['position'], np.float32)
    look = np.asarray(meta['lookAt'], np.float32)
    fwd = look - cam; fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    tv = math.tan(math.radians(meta['fov']) / 2)
    th = tv * W / H
    xs = ((np.arange(W) + 0.5) / W * 2 - 1) * th
    ys = (1 - (np.arange(H) + 0.5) / H * 2) * tv
    rays = fwd[None, None] + right[None, None] * xs[None, :, None] + up[None, None] * ys[:, None, None]
    rays /= np.linalg.norm(rays, axis=-1, keepdims=True)
    depth = np.linalg.norm(P - cam[None, None], axis=-1)
    depth = np.where(K == SKY, depth_max, depth)
    g = layout['ground']
    n = g['seg'] + 1
    hf = np.asarray(g['heights'], np.float32).reshape(n, n)
    gi = (P[..., 0] + g['size'] / 2) / g['size'] * g['seg']
    gj = (P[..., 2] + g['size'] / 2) / g['size'] * g['seg']
    ground_h = ndi.map_coordinates(hf, [gj.ravel(), gi.ravel()], order=1, mode='nearest').reshape(H, W)
    m = np.asarray(meta.get('moon', layout['moon']), np.float32); m /= np.linalg.norm(m)
    zc = m @ fwd
    mx = (m @ right) / zc / th; my = (m @ up) / zc / tv
    moon_px = ((mx + 1) / 2 * W, (1 - my) / 2 * H)
    p = Passes(albedo, moon, sky, lamp, P, N, K, ids[..., 1], depth, rays, ground_h, meta, layout,
               moon_px=moon_px, focal=(H / 2) / tv, H=H, W=W)
    p.extra['cam'] = cam
    p.extra['moon_dir'] = m
    return p


# ───────────────────────────── 1. design ─────────────────────────────

@dataclass
class Direction:
    """The art direction for a set: its palette, and the value each thing takes in light and in shadow."""
    deep: tuple = ('#0f1d1c', '#1b2b2a', '#243936', '#2d4a47')       # the Edge's dominant family, darkest first
    air_near: str = '#3a5552'
    air_far: str = '#6f8c86'
    sky_zenith: str = '#13232a'
    sky_mid: str = '#2a4447'
    sky_horizon: str = '#6f8c86'
    moon_light: str = '#cfe0e6'
    moon_disc: str = '#f4f1e4'
    lamp: str = '#e8a548'
    lamp_core: str = '#ffe2a8'
    mist: str = '#8ea9a4'
    moss: str = '#5d6b3a'
    lichen: str = '#8c9a6a'
    earth: str = '#5a4a38'
    birch: str = '#b8b2a2'
    warm_fill: str = '#e2c9a2'
    moon_size_deg: float = 2.3
    # sRGB values in shadow and in moonlight, per kind of thing
    values: dict = field(default_factory=lambda: {
        GROUND: (0.12, 0.27), TRUNK: (0.11, 0.5), ROCK: (0.14, 0.46), LEAF: (0.12, 0.38),
        LANTERN: (0.07, 0.34), GATE: (0.09, 0.42), WATER: (0.1, 0.3)})
    # moon-pass levels at which each kind turns from shadow to light (soft, but decided)
    thresholds: dict = field(default_factory=lambda: {
        GROUND: (0.07, 0.19), TRUNK: (0.16, 0.42), ROCK: (0.07, 0.2), LEAF: (0.1, 0.28),
        LANTERN: (0.2, 0.5), GATE: (0.06, 0.12), WATER: (0.1, 0.3)})
    pool: tuple = (0.5, -10.0, 5.0, 14.0)   # a pool of moonlight on the clearing: x, z, inner, outer radius
    air_reach: float = 62.0           # metres for the air to take most of the colour
    frame_dark: float = 0.5           # how dark the foreground frame goes
    focus: tuple = (0.5, 0.58)        # where the eye goes, in screen fractions (x, y)
    corner_ferns: bool = False        # paint ferns into the bottom corners (for stills; the game has its own)


def design(ps: Passes, d: Direction, log=print) -> tuple[np.ndarray, dict]:
    """The decided picture (sRGB, 0..1) before any brush touches it, and the masks the painter needs.
    Composed in sRGB, as paint is mixed: every thing has a decided colour in shadow and in moonlight,
    and the moon pass only says where the light falls."""
    t0 = time.time()
    H, W = ps.H, ps.W
    K, depth = ps.K, ps.depth
    sky = K == SKY
    solid = ~sky
    c = lambda h: hexc(h)  # noqa: E731
    deep = [c(h) for h in d.deep]
    moon_light = c(d.moon_light)
    P = ps.P

    # Local colour as a hue: what the thing is, separated from how much light is on it.
    A = to_srgb(np.clip(ps.albedo, 0, 1))
    Al = np.maximum(luma(A), 1e-3)[..., None]
    hue = A / Al
    hue = 1 + (hue - 1) * 0.9                         # a touch less saturated than the albedo
    moon = np.clip(ps.moon, 0, 2)
    openness = np.clip(ps.sky, 0, 1)

    # Where the light falls: a decided edge between shadow and moonlight, per kind of thing.
    lit = np.zeros((H, W), np.float32)
    v_sh = np.zeros((H, W), np.float32)
    v_lt = np.zeros((H, W), np.float32)
    for k, (a, b) in d.thresholds.items():
        m = K == k
        lit[m] = smooth(a, b, moon[m])
        v_sh[m], v_lt[m] = d.values[k]
    # The worn path and the pool of moonlight in the clearing, where the eye is led.
    path = np.asarray(ps.layout.get('path', []), np.float32)
    on_path = np.zeros((H, W), np.float32)
    if len(path):
        px = np.interp(P[..., 2], path[::-1, 1], path[::-1, 0])
        on_path = np.where(K == GROUND, smooth(2.6, 0.9, np.abs(P[..., 0] - px)), 0)
    wob = (noise2(H, W, W / 40, 12, 3) - 0.5) * 3.0
    px0, pz0, r_in, r_out = d.pool
    pool = np.where(solid, smooth(r_out, r_in, np.hypot(P[..., 0] - px0, P[..., 2] - pz0) + wob), 0)
    ground = K == GROUND
    # Off the clearing the moon reaches the floor only in broken patches, through the canopy.
    dapple = smooth(0.32, 0.62, world_noise(P, 3.2, 104)) * 0.75 + 0.25
    lit = np.where(ground, np.maximum(lit * mix(dapple, 1.0, pool), pool * 0.92), lit)
    v_lt = v_lt * (1 + 0.3 * pool + 0.1 * on_path)
    v_sh = v_sh * (1 + 0.25 * on_path)
    # Within the light, the moon's strength still models the form; within shadow, how open it is to the sky.
    v_lt = v_lt * (0.82 + 0.36 * np.clip(moon / 0.45, 0, 1))
    v_sh = v_sh * (0.7 + 0.55 * openness)
    # Ground hue: moss where it is green, earth on the path.
    hue = np.where((ground & (on_path > 0))[..., None], mix(hue, c(d.earth) / luma(c(d.earth)), on_path * 0.7), hue)

    # The woodland floor, designed in patches fixed to the ground: moss, leaf litter, pale lichen, dark
    # humus under the trees, the earth of the path; mottled small.
    g1, g2, g3 = world_noise(P, 7.0, 101), world_noise(P, 2.4, 102), world_noise(P, 0.6, 103)
    gcol = mix(c('#4f5d34'), c('#64553a'), smooth(0.45, 0.72, g1))
    gcol = mix(gcol, c(d.lichen), smooth(0.68, 0.9, g2) * 0.45)
    gcol = mix(gcol, c('#2c3527'), smooth(0.6, 0.88, 1 - g2) * 0.4)
    gcol = mix(gcol, c('#5e5444'), on_path * 0.8)
    gcol = gcol * (0.9 + 0.2 * g3)[..., None]
    gcol = mix(luma(gcol)[..., None] * c('#9fb2ad') / luma(c('#9fb2ad')), gcol, 0.55)   # night takes the colour out
    hue = np.where(ground[..., None], gcol / np.maximum(luma(gcol), 1e-3)[..., None], hue)

    # Foliage in clumps: every leaf mass lit along its edge toward the moon, dark in the gaps between.
    leaf = K == LEAF
    clump_lit = np.zeros((H, W), np.float32)
    gap = np.ones((H, W), np.float32)
    if leaf.any():
        side, g = clumps(P[leaf], 1.25, ps.extra['moon_dir'] * np.array([1, 1.6, 0.2], np.float32) / 1.2, seed=4)
        clump_lit[leaf] = smooth(0.15, 0.75, side) * (0.45 + 0.55 * smooth(0.03, 0.16, moon[leaf]))
        gap[leaf] = 0.72 + 0.28 * smooth(0.0, 0.35, g)
        lit = np.where(leaf, np.maximum(lit, clump_lit * 0.8), lit)
        hue = np.where(leaf[..., None], mix(hue, c(d.moss) / luma(c(d.moss)), 0.5), hue)

    shadow_col = mix(deep[1] * (v_sh / luma(deep[1]))[..., None], hue * v_sh[..., None], 0.34)
    lit_col = mix(hue * v_lt[..., None], moon_light * v_lt[..., None] * 1.05, np.where(ground, 0.28, 0.38)[..., None])
    C = mix(shadow_col, lit_col, lit) * gap[..., None]
    # The birch is pale even in shadow; its bark keeps a little of its own light.
    pale = (K == TRUNK) & (Al[..., 0] > 0.42)
    C = np.where(pale[..., None], mix(C, c(d.birch) * (0.45 + 0.55 * lit)[..., None], 0.6), C)
    # The caster's warm fill: the faintest lift on what faces the eye.
    fill = np.clip(ps.N @ np.array([0.2, 0.35, 0.92], np.float32), 0, 1) * smooth(30, 6, depth) * solid
    C = C + (c(d.warm_fill) - 0.5) * (fill * 0.05)[..., None] + (fill * 0.015)[..., None]

    # Captive light: the lantern panes glow from a hot core to amber at their frames, and warm what
    # is close a little, never generously.
    glass = K == GLASS
    core = smooth(0, 2.2 * W / 3072 + 0.6, ndi.distance_transform_edt(glass))
    pane = mix(c(d.lamp) * 0.7, c(d.lamp_core) * 0.92, core)
    C = np.where(glass[..., None], pane, C)
    lamp = 1 - np.exp(-np.clip(ps.lamp, 0, 50) * 1.4)
    C = C + c(d.lamp) * hue.clip(0.6, 1.6) * (lamp * 0.32 * solid * ~glass)[..., None]
    halo_l = blur(glass.astype(np.float32), 5 * W / 3072 + 1) * 1.5
    C = C + c(d.lamp) * np.clip(halo_l, 0, 1)[..., None] * 0.35

    # The air: haze toward the region's air with distance, glowing toward the moon.
    mdir = ps.extra['moon_dir']
    cosm = np.clip(ps.rays @ mdir, -1, 1)
    ang = np.degrees(np.arccos(cosm))
    glow = np.exp(-(ang / 4.0) ** 2) * 0.6 + np.exp(-(ang / 16) ** 2) * 0.3 + np.exp(-(ang / 45) ** 2) * 0.12
    tfar = smooth(12, 110, depth)
    air = mix(c(d.air_near), c(d.air_far), tfar) * (0.85 + glow[..., None] * 0.6)
    haze = (1 - np.exp(-np.maximum(depth - 8, 0) / d.air_reach)) * 0.92
    C = np.where(solid[..., None], mix(C, air, haze), C)

    # Beyond the gate the air is lighter: a soft clearing of mist framed by the arch, the view's destination.
    gate = K == GATE
    beyond = np.zeros((H, W), np.float32)
    if gate.any():
        gy, gx = np.nonzero(gate)
        cy, cx = gy.mean() + (gy.max() - gy.min()) * 0.15, gx.mean()
        rx, ry = max(gx.max() - gx.min(), 8) * 1.4, max(gy.max() - gy.min(), 8) * 1.1
        yy, xx = np.mgrid[0:H, 0:W]
        beyond = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)).astype(np.float32)
        beyond *= (depth > np.median(depth[gate]) + 2)
        C = mix(C, c(d.mist) * 1.12, beyond * 0.7)

    # Ground mist: banks thickening toward the treeline and in the hollows, thin on the play plane.
    h = np.where(solid, P[..., 1] - ps.ground_h, 0)
    hollow = smooth(0.6, -1.4, ps.ground_h)
    banks = noise2(H, W, W / 6, 31, 3, aniso=(1.0, 0.3))
    dens = smooth(16, 75, depth) * (0.4 + 0.6 * banks) * (0.6 + 0.5 * hollow) * np.exp(-np.maximum(h, 0) / 1.8)
    dens = np.where(solid, np.clip(dens, 0, 0.8), 0)
    mist = c(d.mist) * (0.8 + glow[..., None] * 0.5)
    C = mix(C, mist, dens * 0.7)

    # The foreground frame: the nearest ground and trunks sink toward the deepest teal.
    near = np.where(solid, smooth(11.0, 2.5, depth) ** 1.3, 0)
    C = mix(C, deep[0] * 0.9 + C * 0.3, near * d.frame_dark)

    # The sky, painted: deep above, lighter low down, the moon with its halo, clouds silvered near it.
    elev = np.degrees(np.arcsin(np.clip(ps.rays[..., 1], -1, 1)))
    sk = mix(c(d.sky_horizon), c(d.sky_mid), smooth(0, 16, elev))
    sk = mix(sk, c(d.sky_zenith), smooth(16, 44, elev))
    halo = np.exp(-(ang / 3.0) ** 2) * 0.5 + np.exp(-(ang / 10) ** 2) * 0.22 + np.exp(-(ang / 28) ** 2) * 0.1
    sk = sk + (moon_light - sk) * np.clip(halo, 0, 0.85)[..., None]
    cl = noise2(H, W, W / 4, 77, 4, aniso=(1.0, 0.4))
    cl2 = noise2(H, W, W / 11, 78, 3, aniso=(1.0, 0.5))
    cloud = smooth(0.58, 0.8, cl * 0.72 + cl2 * 0.38) * smooth(3, 10, elev) * (1 - smooth(28, 46, elev) * 0.7)
    above = np.vstack([np.repeat(cloud[:1], 6, 0), cloud[:-6]])
    cloud_top = np.clip(cloud - above, 0, 1)
    cloud_col = mix(c(d.sky_mid) * 0.8, moon_light * 0.78, np.clip(halo * 1.4, 0, 1))
    sk = mix(sk, cloud_col, cloud * 0.75)
    sk = sk + moon_light * (cloud_top * np.clip(halo * 2.5, 0, 1) * 0.35)[..., None]
    r = d.moon_size_deg / 2
    disc = smooth(r + 0.05, r - 0.05, ang)
    maria = 0.9 + 0.1 * noise2(H, W, max(4.0, ps.focal * math.radians(r) / 2), 5, 2)
    sk = mix(sk, c(d.moon_disc) * maria[..., None], disc * (1 - cloud * 0.5))
    rng = np.random.default_rng(3)
    stars = np.zeros((H, W), np.float32)
    n_st = int(W * H / 7000)
    sy, sx = rng.integers(0, H, n_st), rng.integers(0, W, n_st)
    stars[sy, sx] = rng.random(n_st) ** 3 * 3.0
    stars = blur(stars, max(0.6, W / 4000)) * (W / 3072 + 0.5)
    stars *= smooth(12, 30, elev) * (1 - cloud) * smooth(8, 25, ang)
    sk = sk + moon_light * stars[..., None] * 0.6
    C = np.where(sky[..., None], sk, C)

    D = np.clip(C, 0, 1).astype(np.float32)
    edge_light = lit * np.isin(K, (TRUNK, LEAF, ROCK, GATE, LANTERN))
    masks = {'mist': dens, 'near': near, 'halo': halo, 'edge_light': edge_light, 'cloud': cloud, 'elev': elev, 'ang': ang,
             'lit': lit, 'pool': pool, 'path': on_path}
    log(f'[paint] designed in {time.time() - t0:.0f}s')
    return D, masks


# ───────────────────────────── 2. paint ─────────────────────────────

class Canvas:
    """A supersampled canvas strokes are laid on with alpha (Pillow draws them; it is fast)."""

    def __init__(self, base: np.ndarray, ss: int = 2):
        self.ss = ss
        self.H, self.W = base.shape[:2]
        im = Image.fromarray((np.clip(base, 0, 1) * 255 + 0.5).astype(np.uint8))
        self.img = im.resize((self.W * ss, self.H * ss), Image.BILINEAR)
        self.draw = ImageDraw.Draw(self.img, 'RGBA')

    def array(self) -> np.ndarray:
        return np.asarray(self.img.resize((self.W, self.H), Image.BOX), np.float32) / 255

    def ribbon(self, pts: np.ndarray, half: np.ndarray, color, alpha: float) -> None:
        if len(pts) < 2:
            return
        p = pts * self.ss
        w = half * self.ss
        t = np.gradient(p, axis=0)
        t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-6)
        nrm = np.stack([-t[:, 1], t[:, 0]], 1)
        left = p + nrm * w[:, None]
        right = p - nrm * w[:, None]
        poly = np.vstack([left, right[::-1]])
        c = np.clip(np.asarray(color) * 255, 0, 255).astype(int)
        self.draw.polygon([tuple(q) for q in poly.tolist()], fill=(int(c[0]), int(c[1]), int(c[2]), int(np.clip(alpha, 0, 1) * 255)))

    def blade(self, pts: np.ndarray, w0: float, color, alpha: float) -> None:
        n = len(pts)
        s = np.linspace(0, 1, n)
        self.ribbon(pts, w0 * (1 - s) ** 0.8 + 0.15, color, alpha)


def resample(pts: np.ndarray, step: float) -> np.ndarray:
    if len(pts) < 2:
        return pts
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    if cum[-1] < 1e-3:
        return pts[:1]
    n = max(2, int(cum[-1] / step) + 1)
    s = np.linspace(0, cum[-1], n)
    return np.stack([np.interp(s, cum, pts[:, 0]), np.interp(s, cum, pts[:, 1])], 1)


class Painter:
    def __init__(self, D: np.ndarray, ps: Passes, masks: dict, d: Direction, seed: int = 7, ss: int = 2, log=print):
        self.D = D
        self.ps = ps
        self.masks = masks
        self.dir = d
        self.H, self.W = D.shape[:2]
        self.rng = np.random.default_rng(seed)
        self.log = log
        self.scale = self.W / 3072
        self.K = ps.K
        self.depth = ps.depth
        # The underpainting: the design, broad.
        self.canvas = Canvas(blur(D, 9 * self.scale), ss)
        fx, fy = d.focus
        yy, xx = np.mgrid[0:self.H, 0:self.W]
        self.focus = np.exp(-(((xx / self.W - fx) / 0.3) ** 2 + ((yy / self.H - fy) / 0.24) ** 2)).astype(np.float32)

    # The direction a stroke runs: along the edges of the forms; in flat places, by what the thing is.
    def orientation(self, target: np.ndarray, R: float) -> tuple[np.ndarray, np.ndarray]:
        L = luma(target)
        gx = ndi.sobel(L, axis=1); gy = ndi.sobel(L, axis=0)
        s = max(R * 0.8, 1.0)
        jxx, jyy, jxy = blur(gx * gx, s), blur(gy * gy, s), blur(gx * gy, s)
        theta = 0.5 * np.arctan2(2 * jxy, jxx - jyy) + np.pi / 2        # along the edge
        lam = np.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2)
        coh = lam / np.maximum(jxx + jyy, 1e-9)
        strength = np.sqrt(jxx + jyy)
        coherent = (coh > 0.35) & (strength > 0.01)
        K = self.K
        default = np.zeros_like(theta)
        default[K == TRUNK] = np.pi / 2
        default[K == LANTERN] = np.pi / 2
        default[K == GATE] = 0.0
        jitter = (noise2(self.H, self.W, 40 * self.scale, 9, 2) - 0.5) * 0.5
        default[K == GROUND] = jitter[K == GROUND] * 0.25
        default[K == SKY] = jitter[K == SKY] * 0.15
        default[K == LEAF] = jitter[K == LEAF] * 6.0
        theta = np.where(coherent & (K != SKY), theta, default)
        return np.cos(theta).astype(np.float32), np.sin(theta).astype(np.float32)

    def trace(self, x: float, y: float, R: float, target: np.ndarray, color: np.ndarray, ox, oy, max_len: int,
              tol: float, overflow: bool) -> np.ndarray:
        H, W = self.H, self.W
        iy, ix = int(y), int(x)
        k0 = self.K[iy, ix]
        d0 = self.depth[iy, ix]
        dvec = np.array([ox[iy, ix], oy[iy, ix]], np.float32)
        if self.rng.random() < 0.5:
            dvec = -dvec
        pts = [np.array([x, y], np.float32)]
        spill = 0
        for _ in range(max_len):
            nxt = pts[-1] + dvec * R * 0.85
            jx, jy = int(nxt[0]), int(nxt[1])
            if jx < 0 or jy < 0 or jx >= W or jy >= H:
                break
            k = self.K[jy, jx]
            if k != k0:
                # Foliage may push a dab out over the sky; nothing else crosses the edge of a thing.
                if overflow and k0 == LEAF and k == SKY and spill == 0:
                    spill = 1
                else:
                    break
            elif abs(self.depth[jy, jx] - d0) > max(0.1 * d0, 0.4):
                break
            if spill == 0 and np.abs(target[jy, jx] - color).sum() > tol:
                break
            pts.append(nxt)
            if spill:
                break
            nd = np.array([ox[jy, jx], oy[jy, jx]], np.float32)
            if nd @ dvec < 0:
                nd = -nd
            dvec = dvec * 0.6 + nd * 0.4
            dvec /= max(float(np.linalg.norm(dvec)), 1e-6)
        return np.asarray(pts)

    def stroke(self, pts: np.ndarray, R: float, color: np.ndarray, alpha: float, bristles: int, jitter: float) -> None:
        if len(pts) == 1:
            a = self.rng.random() * np.pi
            pts = np.vstack([pts[0] - [np.cos(a) * R * 0.35, np.sin(a) * R * 0.35], pts[0] + [np.cos(a) * R * 0.35, np.sin(a) * R * 0.35]])
        pts = resample(pts, max(R * 0.4, 0.8))
        if len(pts) < 2:
            return
        s = np.linspace(0, 1, len(pts))
        taper = 0.4 + 0.6 * np.sqrt(np.clip(np.sin(np.pi * np.clip(s * 1.04, 0, 1)), 0, 1))
        cv = self.canvas
        cv.ribbon(pts, R * taper, color, alpha * 0.6)
        t = np.gradient(pts, axis=0)
        t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-6)
        nrm = np.stack([-t[:, 1], t[:, 0]], 1)
        for b in range(bristles):
            off = ((b + 0.5) / bristles * 2 - 1) * 0.72
            a0 = int(self.rng.random() * 0.22 * len(pts))
            a1 = len(pts) - int(self.rng.random() * 0.22 * len(pts))
            if a1 - a0 < 2:
                continue
            q = pts[a0:a1] + nrm[a0:a1] * (off * R * taper[a0:a1])[:, None]
            c = np.clip(color * (1 + (self.rng.random(3) - 0.5) * jitter) + (self.rng.random() - 0.5) * jitter * 0.6, 0, 1)
            cv.ribbon(q, R * taper[a0:a1] / bristles * 1.25, c, alpha * (0.55 + 0.35 * self.rng.random()))

    def layer(self, R: float, threshold: float, max_len: int, alpha: float, bristles: int = 4, jitter: float = 0.05,
              where: np.ndarray | None = None, focus_bias: float = 0.0, tol: float = 0.16, leaf_dabs: bool = True) -> int:
        target = blur(self.D, max(R * 0.35, 0.6))
        ox, oy = self.orientation(target, R)
        cur = self.canvas.array()
        err = np.abs(cur - target).sum(-1)
        step = max(1, int(round(R)))
        ys = np.arange(step // 2, self.H, step)
        xs = np.arange(step // 2, self.W, step)
        gy, gx = np.meshgrid(ys, xs, indexing='ij')
        gy = np.clip(gy + self.rng.integers(-step // 2, step // 2 + 1, gy.shape), 0, self.H - 1)
        gx = np.clip(gx + self.rng.integers(-step // 2, step // 2 + 1, gx.shape), 0, self.W - 1)
        cells = np.stack([gy.ravel(), gx.ravel()], 1)
        thr = threshold * (1 - focus_bias * self.focus[cells[:, 0], cells[:, 1]])
        e = ndi.uniform_filter(err, step)[cells[:, 0], cells[:, 1]]
        keep = e >= thr
        if where is not None:
            keep &= where[cells[:, 0], cells[:, 1]]
        cells = cells[keep]
        self.rng.shuffle(cells)
        n = 0
        for (y, x) in cells:
            color = target[y, x].copy()
            k = self.K[y, x]
            ml, R_, br = max_len, R, bristles
            if k == LEAF and leaf_dabs:
                ml, R_ = 1, R * (0.75 + 0.5 * self.rng.random())
                color = np.clip(color * (1 + (self.rng.random(3) - 0.5) * jitter * 1.6), 0, 1)
            pts = self.trace(x + 0.5, y + 0.5, R_, target, color, ox, oy, ml, tol, overflow=(k == LEAF))
            if k == SKY:
                self.stroke(pts, R_ * 1.2, color, alpha * 0.8, 2, jitter * 0.2)
            else:
                self.stroke(pts, R_, color, alpha, br, jitter)
            n += 1
        return n


# ───────────────────────────── 3. detail ─────────────────────────────

def grass(p: Painter, density: float = 1.0) -> int:
    """Tufts on the ground of the play plane and the near frame, backlit by the moon: dark at the root,
    silver at the tips. Thickest at the clearing's rim and round the roots, thin on the path."""
    ps, rng, cv = p.ps, p.rng, p.canvas
    H, W = p.H, p.W
    K, depth = ps.K, ps.depth
    layout = ps.layout
    cand = (K == GROUND) & (depth > 2.0) & (depth < 34)
    P = ps.P
    clear_r = np.hypot(P[..., 0], P[..., 2] + 12)
    rim = smooth(8, 13, clear_r) * (1 - smooth(22, 34, clear_r))
    path = np.asarray(layout.get('path', []), np.float32)
    if len(path):
        px = np.interp(P[..., 2], path[::-1, 1], path[::-1, 0])
        on_path = smooth(2.8, 1.2, np.abs(P[..., 0] - px))
    else:
        on_path = np.zeros_like(depth)
    roots = np.zeros_like(depth)
    for t in layout['trees']:
        dd = np.hypot(P[..., 0] - t['x'], P[..., 2] - t['z'])
        roots = np.maximum(roots, smooth(t['scale'] * 3.2, t['scale'] * 0.9, dd))
    patch = noise2(H, W, W / 18, 41, 3)
    want = (rim * 0.3 + roots * 1.0) ** 1.5 * (0.15 + 1.0 * smooth(0.45, 0.75, patch)) * (1 - on_path * 0.95)
    want = np.where(cand, want, 0)
    # Fewer, larger tufts near; many small ones far.
    ys, xs = np.nonzero(cand)
    if not len(ys):
        return 0
    prob = want[ys, xs] * np.maximum(depth[ys, xs], 1) ** 1.5
    prob = prob / prob.sum()
    n = int(650 * density * (W / 3072))
    pick = rng.choice(len(ys), size=n, p=prob)
    order = np.argsort(-depth[ys[pick], xs[pick]])          # far first
    moon_light = hexc(p.dir.moon_light)
    for i in pick[order]:
        y, x = ys[i], xs[i]
        dist = depth[y, x]
        hpx = (0.16 + 0.3 * rng.random()) * ps.focal / dist
        if hpx < 2.5:
            continue
        base = p.D[y, x] * (0.78 + 0.1 * rng.random())
        wind = (rng.random() - 0.5) * 0.45
        tip_lit = 0.06 + 0.14 * rng.random()
        blades = 6 + int(rng.random() * 8)
        for b in range(blades):
            a = wind + rng.normal() * 0.3
            L = hpx * (0.4 + 0.6 * rng.random())
            bend = a * L * 0.25 + wind * L * 0.3
            tt = np.linspace(0, 1, 7)
            bx = x + 0.5 + (rng.random() - 0.5) * hpx * 0.3 + np.sin(a) * L * tt + bend * tt ** 2
            by = y + 0.5 + hpx * 0.04 - np.cos(a) * L * tt
            pts = np.stack([bx, by], 1)
            w0 = max(0.5, hpx * 0.032)
            cv.blade(pts, w0, base, 0.92)
            col = mix(base, moon_light * 0.85, tip_lit)
            cv.blade(pts[3:], w0 * 0.55, col, 0.7)
    return n


def canopy_edges(p: Painter, density: float = 1.0) -> int:
    """Foliage silhouettes are drawn, not rendered: along every canopy edge that meets something farther
    away, little clusters of leaves are dabbed outward past the edge, and here and there the sky shows
    back through a hole near it. Far trees first, so near leaves overlap them."""
    ps, rng, cv = p.ps, p.rng, p.canvas
    H, W = p.H, p.W
    K, depth = ps.K, ps.depth
    leaf = K == LEAF
    if not leaf.any():
        return 0
    # Edge pixels: leaf next to sky, or next to something much farther.
    far_next = np.zeros_like(leaf)
    for dy, dx in ((0, 2), (0, -2), (2, 0), (-2, 0)):
        nb_d = np.roll(np.roll(depth, dy, 0), dx, 1)
        nb_k = np.roll(np.roll(K, dy, 0), dx, 1)
        far_next |= (nb_k == SKY) | ((nb_d > depth * 1.25 + 1.0) & (nb_k != LEAF)) | ((nb_k == LEAF) & (nb_d > depth * 1.35 + 1.5))
    edge = leaf & far_next
    soft = blur(leaf.astype(np.float32), 2.0 * p.scale + 0.8)
    gy, gx = np.gradient(soft)
    ys, xs = np.nonzero(edge)
    if not len(ys):
        return 0
    size = 0.42 * ps.focal / np.maximum(depth[ys, xs], 1)          # a leaf cluster ~0.4 m across
    keep = rng.random(len(ys)) < np.clip(1.6 / np.maximum(size, 1.2), 0, 1) * density
    ys, xs, size = ys[keep], xs[keep], size[keep]
    order = np.argsort(-depth[ys, xs])
    n = 0
    canvas_now = p.canvas.array()
    for i in order:
        y, x, r = ys[i], xs[i], max(float(size[i]), 1.1)
        nx, ny = -gx[y, x], -gy[y, x]
        nl = math.hypot(nx, ny)
        if nl < 1e-6:
            continue
        nx, ny = nx / nl, ny / nl
        # colour from just inside the edge, as the painter's brush would carry it
        iy = int(np.clip(y - ny * r * 1.2, 0, H - 1)); ix = int(np.clip(x - nx * r * 1.2, 0, W - 1))
        base = canvas_now[iy, ix] if K[iy, ix] == LEAF else canvas_now[y, x]
        for _ in range(2 + int(rng.random() * 3)):
            out = (0.05 + rng.random() * 0.6) * r
            cx = x + 0.5 + nx * out + (rng.random() - 0.5) * r * 1.5 * -ny
            cy = y + 0.5 + ny * out + (rng.random() - 0.5) * r * 1.5 * nx
            a = math.atan2(ny, nx) + (rng.random() - 0.5) * 2.0
            rl, rw = r * (0.32 + 0.3 * rng.random()), r * (0.24 + 0.18 * rng.random())
            col = np.clip(base * (0.93 + 0.14 * rng.random()), 0, 1)
            ca, sa = math.cos(a), math.sin(a)
            # a rounded leaf cluster: a soft-cornered oval, slightly lopsided
            pts = []
            for j in range(10):
                t = j / 10 * 2 * math.pi
                ex, ey = math.cos(t) * rl * (1.0 + 0.18 * math.cos(t)), math.sin(t) * rw
                pts.append(((cx + ca * ex - sa * ey) * cv.ss, (cy + sa * ex + ca * ey) * cv.ss))
            cc = (col * 255).astype(int)
            cv.draw.polygon(pts, fill=(int(cc[0]), int(cc[1]), int(cc[2]), 240))
            n += 1
    return n


def litter(p: Painter, density: float = 1.0) -> int:
    """Fallen leaves and a few pale stones on the near floor, gathered under the trees, quiet in value."""
    ps, rng, cv = p.ps, p.rng, p.canvas
    K, depth = ps.K, ps.depth
    cand = (K == GROUND) & (depth > 2.5) & (depth < 22)
    ys, xs = np.nonzero(cand)
    if not len(ys):
        return 0
    under = 1 - p.masks['lit'][ys, xs] * 0.6
    prob = under * np.maximum(depth[ys, xs], 1) ** 1.2 * (1 - p.masks['path'][ys, xs] * 0.7)
    prob /= prob.sum()
    n = int(1400 * density * (p.W / 3072))
    pick = rng.choice(len(ys), size=n, p=prob)
    warm = [hexc('#5a4a38'), hexc('#6b5a3e'), hexc('#4a3c2a'), hexc('#5d6b3a')]
    for i in pick[np.argsort(-depth[ys[pick], xs[pick]])]:
        y, x = ys[i], xs[i]
        r = (0.05 + 0.05 * rng.random()) * ps.focal / depth[y, x]
        if r < 0.9:
            continue
        g = p.D[y, x]
        col = mix(g, warm[int(rng.random() * 4)] * (luma(g) / 0.32 + 0.15), 0.35) * (0.85 + 0.25 * rng.random())
        a = rng.random() * math.pi
        ca, sa = math.cos(a), math.sin(a)
        pts = [(x + ca * r, y + sa * r * 0.45), (x - sa * r * 0.35, y + ca * r * 0.16), (x - ca * r, y - sa * r * 0.45), (x + sa * r * 0.35, y - ca * r * 0.16)]
        cc = (np.clip(col, 0, 1) * 255).astype(int)
        cv.draw.polygon([(q[0] * cv.ss, q[1] * cv.ss) for q in pts], fill=(int(cc[0]), int(cc[1]), int(cc[2]), 200))
    return n


def fern(p: Painter, x0: float, y0: float, size: float, facing: float, seed: int) -> None:
    """A fern reaching into a corner of the frame: arching near-black fronds of small leaflets, a thread
    of moonlight along their upper edges."""
    rng = np.random.default_rng(seed)
    cv = p.canvas
    ss = cv.ss
    dark = hexc(p.dir.deep[0]) * 0.9
    rimc = mix(hexc(p.dir.deep[3]), hexc(p.dir.moon_light), 0.3)

    def leaflet(base, direction, perp, w, col, alpha):
        pts = [base, base + direction * w * 0.45 + perp * w * 0.2, base + direction * w, base + direction * w * 0.45 - perp * w * 0.2]
        cc = np.clip(np.asarray(col) * 255, 0, 255).astype(int)
        cv.draw.polygon([tuple((q * ss).tolist()) for q in pts], fill=(int(cc[0]), int(cc[1]), int(cc[2]), int(alpha * 255)))
    for f in range(8):
        a = facing + (f / 7 - 0.5) * 1.3 + rng.normal() * 0.07
        L = size * (0.55 + 0.45 * rng.random())
        droop = 0.25 + rng.random() * 0.3
        tt = np.linspace(0, 1, 40)
        sx = x0 + np.sin(a) * L * tt
        sy = y0 - np.cos(a) * L * tt + droop * L * tt ** 2
        spine = np.stack([sx, sy], 1)
        cv.blade(spine, size * 0.008 + 1, dark, 1.0)
        tang = np.gradient(spine, axis=0)
        tang /= np.maximum(np.linalg.norm(tang, axis=1, keepdims=True), 1e-6)
        nrm = np.stack([-tang[:, 1], tang[:, 0]], 1)
        for i in range(3, 39):
            w = size * 0.075 * math.sin(math.pi * min(1.0, (i / 39) ** 0.75 * 1.05))
            for side in (-1, 1):
                direction = nrm[i] * side * 0.9 + tang[i] * 0.45
                direction /= np.linalg.norm(direction)
                perp = np.array([-direction[1], direction[0]])
                leaflet(spine[i], direction, perp, w, dark, 1.0)
            if i % 3 == 0:
                up = nrm[i] if nrm[i][1] < 0 else -nrm[i]
                q = spine[i] + up * w * 0.15
                cv.blade(np.stack([q, q + (up * 0.9 + tang[i] * 0.45) * w * 0.8]), max(0.6, w * 0.05), rimc, 0.5)


# ───────────────────────────── 4. finish ─────────────────────────────

def finish(img: np.ndarray, seed: int = 1) -> np.ndarray:
    H, W = img.shape[:2]
    s = W / 3072
    # Every edge a little unsteady, as a hand leaves it.
    wx = (noise2(H, W, 22 * s, seed, 2) - 0.5) * 2.2 * s
    wy = (noise2(H, W, 22 * s, seed + 1, 2) - 0.5) * 2.2 * s
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    out = np.stack([ndi.map_coordinates(img[..., c], [yy + wy, xx + wx], order=1, mode='nearest') for c in range(3)], -1)
    # The paper's tooth, and the slight unevenness of a wash.
    tooth = (noise2(H, W, 3 * s, seed + 2, 2) - 0.5) * 0.035 + (noise2(H, W, 90 * s, seed + 3, 3) - 0.5) * 0.04
    return np.clip(out * (1 + tooth[..., None]), 0, 1)


def paint(ps: Passes, d: Direction, seed: int = 7, log=print, quick: bool = False) -> tuple[np.ndarray, np.ndarray]:
    t0 = time.time()
    D, masks = design(ps, d, log)
    p = Painter(D, ps, masks, d, seed, ss=2, log=log)
    s = p.scale
    K = ps.K
    near_or_mid = ps.depth < 75
    layers = [
        # radius, threshold, length, alpha, bristles, where, focus bias
        (16, 0.0, 6, 0.9, 5, None, 0.0),
        (8, 0.035, 7, 0.88, 4, None, 0.25),
        (4.2, 0.05, 7, 0.86, 3, near_or_mid | ((K == SKY) & ((masks['halo'] > 0.15) | (masks['cloud'] > 0.2))), 0.5),
        (2.2, 0.07, 6, 0.85, 3, ((ps.depth < 45) & (K != SKY)) | (K == GLASS) | (masks['edge_light'] > 0.3), 0.7),
    ]
    if quick:
        layers = layers[:2]
    for R, thr, ln, a, br, where, fb in layers:
        t = time.time()
        n = p.layer(R * s, thr, ln, a, br, where=where, focus_bias=fb)
        log(f'[paint] brush {R * s:.1f}px: {n} strokes in {time.time() - t:.0f}s')
    t = time.time()
    n = canopy_edges(p)
    log(f'[paint] {n} leaf dabs along the canopy edges in {time.time() - t:.0f}s')
    t = time.time()
    litter(p)
    n = grass(p)
    W, H = p.W, p.H
    if d.corner_ferns:     # in the game the living foreground layer hangs its own fronds into the corners
        fern(p, 0.01 * W, 1.0 * H, 0.36 * H, 0.55, 3)
        fern(p, 0.995 * W, 1.0 * H, 0.3 * H, -0.6, 4)
    log(f'[paint] {n} tufts in {time.time() - t:.0f}s')
    out = finish(p.canvas.array(), seed)
    log(f'[paint] painted in {time.time() - t0:.0f}s')
    return out, D
