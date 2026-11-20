"""
Shared tree builder for the wood's species (not an asset itself: the leading underscore keeps it out
of `npm run art -- all`).

A tree is designed in three layers: a trunk with an irregular, twisting, squared section; buttress roots
that splay and sink; limbs and branches that reach before the crown; a crown composed from masses (a
body, shoulders, strays) whose edges break into leaf clusters. Bark has long plates and cracks that run
with the grain, moss on the shaded side, soil climbing the roots.
"""
from dataclasses import dataclass, field

import numpy as np

from arcane_art.paint import grain_noise, hue_shift_shadow, mix, noise, smoothstep, srgb_to_linear
from arcane_art.pipeline import AssetSpec, Painted, Part, Surface
from arcane_art.sdf import Attr, Ellipsoid, Relief, Sculpt, hexcol


@dataclass
class TreeDesign:
    name: str
    seed: int = 1
    height: float = 8.6
    base: float = 0.85                 # trunk half-width at the flare
    top: float = 0.24
    lean: tuple = (0.3, -0.15)         # top offset (x, z)
    bends: int = 2
    twist: float = 0.9
    square: float = 2.4
    roots: int = 7
    root_reach: tuple = (2.0, 3.2)
    limbs: list = field(default_factory=list)   # (height, angle, length, rise, radius)
    broken: tuple | None = None        # (height, angle) of a limb snapped off short
    crown: list = field(default_factory=list)   # (centre, radii)
    crown_cell: float = 0.05
    hollow: tuple | None = None        # centre (x, y, z)
    bark: str = '#4a4136'
    bark_shade: str = '#2a241d'
    leaf: str = '#33432a'
    plates: Relief = field(default_factory=lambda: Relief(0.03, 2.6, 0.3, 'cracks', 4))
    paint: str = 'oak'                 # 'oak' | 'birch' | 'dead'
    trunk_cell: float = 0.014
    faces: int = 12000
    crown_faces: int = 5000
    lods: tuple = (3200, 900)


def build(d: TreeDesign) -> AssetSpec:
    rng = np.random.default_rng(d.seed)
    s = Sculpt('trunk')
    bark = Attr('bark', hexcol(d.bark), 'bark')
    # Trunk: a slow, irregular lean, squared and twisting as it climbs.
    pts = [np.array([0.0, -0.45, 0.0])]
    for i in range(1, d.bends + 3):
        t = i / (d.bends + 2)
        wob = (rng.random(2) - 0.5) * 0.35 * np.sin(t * np.pi)
        pts.append(np.array([d.lean[0] * t * t + wob[0], d.height * t, d.lean[1] * t * t + wob[1]]))
    s.limb(pts, radii=[(0, d.base * 1.08, d.base * 0.95), (0.08, d.base * 0.78, d.base * 0.7), (0.45, d.base * 0.58, d.base * 0.52),
                       (0.8, d.top * 1.35, d.top * 1.2), (1, d.top, d.top * 0.9)],
           square=[(0, d.square), (1, d.square - 0.2)], twist=[(0, 0), (1, d.twist)], up=(0, 0, 1), attr=bark, k=0.0, relief=d.plates)
    # Buttress roots: planks splaying out and diving into the soil.
    for i in range(d.roots):
        a = i / d.roots * 2 * np.pi + rng.random() * 0.5
        reach = d.root_reach[0] + rng.random() * (d.root_reach[1] - d.root_reach[0])
        dv = np.array([np.cos(a), 0, np.sin(a)])
        h0 = 0.9 + rng.random() * 0.6
        side = np.array([-dv[2], 0, dv[0]]) * (rng.random() - 0.5) * 0.7
        rp = [dv * d.base * 0.4 + np.array([0, h0, 0]), dv * d.base * 1.15 + np.array([0, h0 * 0.4, 0]),
              dv * reach * 0.6 + np.array([0, 0.04, 0]) + side * 0.4, dv * reach + np.array([0, -0.35, 0]) + side]
        w = d.base * (0.26 + rng.random() * 0.1)
        s.limb(rp, radii=[(0, w, w * 2.0), (0.35, w * 0.72, w * 1.2), (0.75, w * 0.42, w * 0.5), (1, w * 0.2, w * 0.2)],
               square=[(0, 2.6), (1, 2.2)], up=(0, 1, 0), attr=bark, k=d.base * 0.22, relief=d.plates)
    # Limbs reaching out, each with two branches; one may be snapped short.
    for (y, a, ln, rise, r) in d.limbs:
        dv = np.array([np.cos(a), 0, np.sin(a)])
        t = y / d.height
        base = np.array([d.lean[0] * t * t, y, d.lean[1] * t * t]) + dv * d.top
        p1 = base + dv * ln * 0.45 + np.array([0, rise * 0.55, 0])
        p2 = base + dv * ln + np.array([0, rise, 0]) + np.array([-dv[2], 0, dv[0]]) * ln * 0.12
        s.limb([base, p1, p2], radii=[(0, r, r * 0.9), (0.5, r * 0.62, r * 0.58), (1, r * 0.22, r * 0.22)], up=(0, 1, 0), attr=bark, k=r * 0.7, relief=d.plates)
        for j in range(2):
            q0 = p1 + (p2 - p1) * (0.3 + j * 0.35)
            side = np.array([-dv[2], 0, dv[0]]) * (1 if j else -1)
            q1 = q0 + side * ln * 0.25 + dv * ln * 0.18 + np.array([0, ln * 0.22, 0])
            s.limb([q0, q1], radii=[(0, r * 0.36, r * 0.33), (1, r * 0.1, r * 0.1)], up=(0, 1, 0), attr=bark, k=r * 0.3)
    if d.broken:
        y, a = d.broken
        dv = np.array([np.cos(a), 0, np.sin(a)])
        t = y / d.height
        base = np.array([d.lean[0] * t * t, y, d.lean[1] * t * t]) + dv * d.top
        stub = base + dv * 0.7 + np.array([0, 0.25, 0])
        s.limb([base, stub], radii=[(0, d.top * 0.9, d.top * 0.8), (1, d.top * 0.6, d.top * 0.55)], up=(0, 1, 0), attr=bark, k=d.top * 0.5, relief=d.plates)
        s.carve_plane(stub - dv * 0.05, dv + np.array([0, 0.4, 0]), Ellipsoid(stub, (0.4, 0.4, 0.4)), k=0.01)
        s.displace(Relief(0.04, 9.0, 1.0, 'cracks', 41), bound=Ellipsoid(stub, (0.3, 0.3, 0.3)))
    if d.hollow is not None:
        s.sub(Ellipsoid(d.hollow, (d.base * 0.24, d.base * 0.4, d.base * 0.3)), k=0.05)
    s.displace(Relief(0.006, 9.0, 0.3, 'ridged', 21))
    parts = [Part(s, cell=d.trunk_cell, faces=d.faces)]
    if d.crown:
        crown = Sculpt('crown')
        leaf = Attr('leaf', hexcol(d.leaf), 'leaf')
        for c, r in d.crown:
            crown.ellipsoid(c, r, leaf, k=min(r) * 0.35, relief=Relief(min(r) * 0.11, 1.4 / max(min(r), 0.4), 1.0, 'cells', int(c[1] * 13)))
        # The edge breaks into clusters: deeper cells, then fine leafiness.
        crown.displace(Relief(0.12, 1.1, 1.0, 'cells', 7))
        crown.displace(Relief(0.04, 4.5, 1.0, 'cells', 13))
        parts.append(Part(crown, cell=d.crown_cell, faces=d.crown_faces))
    return AssetSpec(d.name, parts, lambda m: paint(m, d), texture=2048, bake_size=2048, height=d.height + 3, centre=d.height * 0.55,
                     extrusion=0.04, lods=d.lods, closeups=[('roots', 30, 0.8, 5.5, 50), ('bark', 10, 2.0, 2.2, 60)])


def paint(m: Surface, d: TreeDesign) -> Painted:
    P, N = m.V, m.N
    col = srgb_to_linear(m.color)
    barkz = m.zone == 'bark'
    g = grain_noise(P, (0, 1, 0), 3.0, 0.25, d.seed)
    crev = np.clip(-m.curv * 0.6, 0, 1)
    crest = np.clip(m.curv * 0.5, 0, 1)
    if d.paint == 'birch':
        # Pale papery bark peeling in bands, dark lenticels and black diamonds where branches were.
        c = col * (0.9 + 0.2 * g[:, None])
        bands = smoothstep(0.62, 0.7, grain_noise(P, (1, 0, 0), 6.0, 0.15, d.seed + 3))
        c = mix(c, srgb_to_linear(np.array([0.12, 0.11, 0.1])), bands * smoothstep(0.4, 0.7, noise(P, 3.0, 2, d.seed)) * 0.85)
        c = hue_shift_shadow(c, crev * 0.8 + (1 - m.ao) * 0.5, toward=(0.1, 0.1, 0.1))
    elif d.paint == 'dead':
        c = col * (0.85 + 0.3 * g[:, None])
        c = hue_shift_shadow(c, crev * 0.8 + (1 - m.ao) * 0.6)
        c = mix(c, c * 1.8 + 0.04, crest * 0.6)
    else:
        c = col * (0.8 + 0.4 * g[:, None])
        c = hue_shift_shadow(c, crev * 0.75 + (1 - m.ao) * 0.6, toward=(0.08, 0.1, 0.08))
        c = mix(c, c * 1.55 + srgb_to_linear(np.array([0.05, 0.05, 0.045])), crest * 0.55)
    moss_amt = smoothstep(0.1, 0.7, -N[:, 2] * 0.6 + N[:, 1] * 0.7 + (noise(P, 1.3, 3, 5) - 0.5) * 0.9) * (1 - smoothstep(1.0, 4.0, P[:, 1]))
    if d.paint == 'birch':
        moss_amt *= 0.4
    moss = srgb_to_linear(np.array([0.22, 0.29, 0.12])) * (0.75 + 0.5 * noise(P, 9, 2, 6))[:, None]
    c = mix(c, moss, np.clip(moss_amt, 0, 1) * 0.9)
    lichen = smoothstep(0.7, 0.78, noise(P, 7, 2, 8)) * (1 - moss_amt)
    c = mix(c, srgb_to_linear(np.array([0.5, 0.54, 0.42])), lichen * 0.55)
    soil = 1 - smoothstep(-0.1, 0.35, P[:, 1])
    c = mix(c, srgb_to_linear(np.array([0.1, 0.08, 0.06])), soil * 0.85)
    if d.hollow is not None:
        hol = np.linalg.norm((P - np.array(d.hollow)) / (np.array([0.24, 0.4, 0.3]) * d.base * 1.25), axis=1) < 1.05
        c = np.where((hol & (m.ao < 0.8))[:, None], srgb_to_linear(np.array([0.04, 0.03, 0.025])), c)
    col = np.where(barkz[:, None], c, col)
    leafz = m.zone == 'leaf'
    lc = col * (0.65 + 0.7 * noise(P, 1.7, 3, 11)[:, None])
    lc = mix(lc, lc * np.array([1.3, 1.35, 0.9]), np.clip(m.curv * 0.3, 0, 1) * 0.6)
    lc = hue_shift_shadow(lc, (1 - m.ao) * 0.85, toward=(0.05, 0.1, 0.11))
    col = np.where(leafz[:, None], lc, col)
    fx = np.zeros((len(P), 3))
    fx[leafz] = (0.15, 0.5, 0.25)
    fx[barkz, 0] = moss_amt[barkz] * 0.4
    return Painted(albedo=np.clip(col, 0, 1), fx=fx)
