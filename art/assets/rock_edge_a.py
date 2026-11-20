"""A weathered boulder of the Hushed Edge: faceted, eroded, chipped, mossed on top."""
import numpy as np

from arcane_art.paint import cell_spots, hue_shift_shadow, mix, noise, smoothstep, srgb_to_linear
from arcane_art.pipeline import AssetSpec, Painted, Part, Surface
from arcane_art.sdf import Attr, Ellipsoid, Hull, Relief, Sculpt, hexcol


def spec() -> AssetSpec:
    s = Sculpt('rock')
    stone = Attr('stone', hexcol('#77756c'), 'stone')
    rng = np.random.default_rng(7)
    # A boulder is planes: fracture faces around a squat volume, edges worn soft but still edges.
    c = np.array([0.0, 0.42, 0.0])
    r = np.array([0.72, 0.5, 0.58])
    planes = [(c + np.array([0, -0.4, 0]), np.array([0, -1.0, 0]))]
    for i in range(15):
        n = rng.normal(size=3)
        n[1] = abs(n[1]) * 0.7 + (0.5 if i < 4 else -0.15)
        n /= np.linalg.norm(n)
        reach = 1.0 / np.sqrt(np.sum((n / r) ** 2))
        planes.append((c + n * reach * (0.86 + rng.random() * 0.1), n))
    s.hull(Hull(planes, bevel=0.07, bound=(c - 1.0, c + 1.0), relief=Relief(0.02, 2.2, 1.0, 'stone', 2)), stone, k=0.0)
    # A second, smaller stone leaning into it, and chips knocked off the edges.
    planes2 = []
    c2 = np.array([0.62, 0.22, 0.25]); r2 = np.array([0.32, 0.26, 0.3])
    planes2.append((c2 + np.array([0, -0.22, 0]), np.array([0, -1.0, 0])))
    for i in range(10):
        n = rng.normal(size=3); n[1] = abs(n[1]) * 0.6 + 0.1; n /= np.linalg.norm(n)
        reach = 1.0 / np.sqrt(np.sum((n / r2) ** 2))
        planes2.append((c2 + n * reach * 0.9, n))
    s.hull(Hull(planes2, bevel=0.04, bound=(c2 - 0.6, c2 + 0.6), relief=Relief(0.014, 3.0, 1.0, 'stone', 5)), stone.with_(color=hexcol('#6d6b63')), k=0.02)
    # Chips: shallow fracture planes across edges, bounded wide enough to leave a clean facet.
    for _ in range(5):
        n = rng.normal(size=3); n[1] = abs(n[1]) * 0.5; n /= np.linalg.norm(n)
        reach = 1.0 / np.sqrt(np.sum((n / r) ** 2))
        p = c + n * reach * 0.94
        s.carve_plane(p, n, Ellipsoid(p, (0.45, 0.35, 0.45)), k=0.006)
    # Grit over everything, the fresh chip faces included.
    s.displace(Relief(0.0035, 14.0, 1.0, 'stone', 21))
    # Weathering cracks.
    s.crease([c + [-0.5, 0.35, 0.3], c + [-0.1, 0.3, 0.52], c + [0.25, 0.1, 0.5]], 0.025, 0.012)
    s.crease([c + [0.1, 0.45, -0.2], c + [0.35, 0.3, 0.1], c + [0.6, 0.05, 0.2]], 0.02, 0.01)
    return AssetSpec('rock_edge_a', [Part(s, cell=0.006, faces=3000)], paint, texture=1024, bake_size=2048, height=1.0, centre=0.35)


def paint(m: Surface) -> Painted:
    V, N = m.V, m.N
    base = srgb_to_linear(m.color)
    # Stone that varies: cooler and warmer patches, darker banding with height.
    patch = noise(V, 2.2, 3, 1)
    base = mix(base, srgb_to_linear(np.array([0.36, 0.37, 0.33])), smoothstep(0.55, 0.8, patch) * 0.6)
    base = mix(base, srgb_to_linear(np.array([0.52, 0.47, 0.40])), smoothstep(0.6, 0.85, noise(V, 3.1, 3, 4)) * 0.4)
    # Crevices hold darkness (cool, not black); crests weather pale.
    crev = np.clip(-m.curv * 0.08, 0, 1)
    crest = np.clip(m.curv * 0.06, 0, 1)
    base = hue_shift_shadow(base, crev * 0.7 + (1 - m.ao) * 0.5)
    base = mix(base, base * 1.5 + 0.03, crest * 0.6)
    # Moss on what faces the sky, thick where it is flat and sheltered, broken at its edge.
    up = N[:, 1]
    moss_mask = smoothstep(0.35, 0.75, up + (noise(V, 6, 3, 9) - 0.5) * 0.6) * smoothstep(0.1, 0.35, V[:, 1])
    moss = srgb_to_linear(np.array([0.27, 0.33, 0.15])) * (0.8 + 0.5 * noise(V, 22, 3, 3))[:, None]
    moss = mix(moss, srgb_to_linear(np.array([0.45, 0.5, 0.22])), smoothstep(0.6, 0.9, noise(V, 40, 2, 5)) * 0.5)
    col = mix(base, moss, moss_mask)
    # Lichen flecks on the sides, dirt where it meets the ground.
    lichen = cell_spots(V, 18, 0.78, 11) * (1 - moss_mask) * smoothstep(-0.2, 0.3, up)
    col = mix(col, srgb_to_linear(np.array([0.62, 0.64, 0.52])), lichen * 0.8)
    dirt = 1 - smoothstep(0.02, 0.16, V[:, 1])
    col = mix(col, srgb_to_linear(np.array([0.13, 0.11, 0.08])), dirt * 0.85)
    rough = np.full(len(V), 0.9) - lichen * 0.05
    mats = np.where(moss_mask > 0.5, 'moss', 'stone')
    fx = np.zeros((len(V), 3)); fx[:, 0] = moss_mask * 0.5; fx[:, 1] = moss_mask * 0.15
    del mats
    return Painted(albedo=col, rough=rough, fx=fx)
