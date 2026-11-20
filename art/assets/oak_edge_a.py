"""
An old oak of the Hushed Edge, the kind that frames the clearing.

Not a cylinder with leaves: a trunk that twists and leans with an irregular, squared section, bark split
into long vertical plates with deep cracks, buttress roots that splay out like planks and sink into
the soil (one torn and gnarled), burls, a dark hollow at the height of a goblin's head, and limbs that
reach out before the canopy takes over.
"""
import numpy as np

from arcane_art.paint import hue_shift_shadow, mix, noise, smoothstep, srgb_to_linear, grain_noise
from arcane_art.pipeline import AssetSpec, Painted, Part, Surface
from arcane_art.sdf import Attr, Ellipsoid, Limb, Relief, Sculpt, hexcol


def spec() -> AssetSpec:
    s = Sculpt('oak')
    bark = Attr('bark', hexcol('#4a4136'), 'bark')
    rng = np.random.default_rng(11)
    plates = Relief(0.03, 2.6, 0.22, 'cracks', 4)
    # The trunk: a slow S of a lean, wider than deep, slightly squared, twisting as it climbs.
    s.limb([(0, -0.4, 0), (0.06, 1.8, 0.03), (-0.1, 4.2, 0.12), (0.12, 6.6, 0.0), (0.3, 8.6, -0.15)],
           radii=[(0, 0.66, 0.58), (0.1, 0.52, 0.47), (0.45, 0.4, 0.36), (0.8, 0.3, 0.27), (1, 0.22, 0.2)],
           square=[(0, 2.5), (1, 2.2)], twist=[(0, 0), (1, 0.9)], up=(0, 0, 1), attr=bark, k=0.0, relief=plates)
    # Buttress roots: planks of wood splaying from the trunk and diving into the soil.
    for i in range(7):
        a = i / 7 * 2 * np.pi + rng.random() * 0.4
        reach = 2.1 + rng.random() * 1.1
        d = np.array([np.cos(a), 0, np.sin(a)])
        h0 = 1.0 + rng.random() * 0.5
        pts = [d * 0.32 + np.array([0, h0, 0]), d * 0.95 + np.array([0, h0 * 0.42, 0]), d * reach * 0.62 + np.array([0, 0.05, 0]),
               d * reach + np.array([0, -0.32, 0]) + np.array([-d[2], 0, d[0]]) * (rng.random() - 0.5) * 0.6]
        s.limb(pts, radii=[(0, 0.2, 0.42), (0.35, 0.15, 0.26), (0.75, 0.09, 0.11), (1, 0.05, 0.05)],
               square=[(0, 2.6), (1, 2.2)], up=(0, 1, 0), attr=bark, k=0.18, relief=plates)
    # A torn root lifted out of the ground, knotted where it broke.
    s.limb([(-0.3, 0.6, 0.35), (-1.0, 0.45, 1.0), (-1.7, 0.5, 1.5), (-2.2, 0.75, 1.75)],
           radii=[(0, 0.16, 0.2), (0.6, 0.1, 0.12), (1, 0.08, 0.08)], up=(0, 1, 0), attr=bark, k=0.12, relief=plates)
    s.ellipsoid((-2.22, 0.78, 1.76), (0.13, 0.11, 0.13), bark, k=0.05, relief=Relief(0.025, 7, 1.0, 'cells', 9))
    # Burls swelling out of the trunk.
    for (y, a, r) in ((2.6, 0.7, 0.24), (4.9, 3.6, 0.2), (1.4, 2.4, 0.18)):
        p = np.array([np.cos(a) * 0.46, y, np.sin(a) * 0.42])
        s.ellipsoid(p, (r, r * 1.2, r), bark, k=0.12, relief=Relief(0.03, 5.0, 1.0, 'cells', int(y * 10)))
    # Limbs reaching out before the canopy.
    limbs = []
    for i, (y, a, ln, up) in enumerate(((5.2, 0.4, 3.4, 0.7), (6.0, 2.5, 3.0, 0.9), (6.8, 4.3, 2.8, 1.1), (7.6, 1.4, 2.2, 1.3), (4.4, 3.4, 2.6, 0.5))):
        d = np.array([np.cos(a), 0, np.sin(a)])
        base = np.array([0.05, y, 0.03]) + d * 0.15
        p1 = base + d * ln * 0.45 + np.array([0, up * 0.6, 0])
        p2 = base + d * ln + np.array([0, up * 1.3, 0]) + np.array([-d[2], 0, d[0]]) * 0.4
        s.limb([base, p1, p2], radii=[(0, 0.2, 0.18), (0.5, 0.13, 0.12), (1, 0.05, 0.05)], up=(0, 1, 0), attr=bark, k=0.15, relief=plates)
        limbs.append((p1, p2, d))
        for j in range(2):
            q0 = p1 + (p2 - p1) * (0.35 + j * 0.3)
            side = np.array([-d[2], 0, d[0]]) * (1 if j else -1)
            q1 = q0 + side * 0.9 + d * 0.6 + np.array([0, 0.7, 0])
            s.limb([q0, q1], radii=[(0, 0.07, 0.065), (1, 0.025, 0.025)], up=(0, 1, 0), attr=bark, k=0.06)
    # A hollow at the height of a goblin's head: dark, deep, its lip worn.
    hollow_c = np.array([0.42, 1.55, 0.3])
    s.sub(Ellipsoid(hollow_c, (0.16, 0.26, 0.2)), k=0.05)
    # Fine grain over everything, the hollow included.
    s.displace(Relief(0.006, 9.0, 0.3, 'ridged', 21))

    # The crown: masses of leaves, composed (a big body, two shoulders, a few strays), dense at the
    # core and broken into clusters at the edge.
    crown = Sculpt('crown')
    leaf = Attr('leaf', hexcol('#33432a'), 'leaf')
    leafy = Relief(0.16, 1.6, 1.0, 'cells', 3)
    masses = [((0.4, 10.2, -0.1), (3.2, 2.0, 2.8)), ((3.0, 8.4, 0.9), (1.9, 1.3, 1.7)), ((-2.5, 9.0, -0.6), (2.0, 1.4, 1.8)),
              ((-1.2, 11.6, 1.1), (1.7, 1.2, 1.5)), ((1.6, 7.6, -2.0), (1.4, 1.0, 1.3)), ((-0.8, 7.9, 2.4), (1.2, 0.9, 1.1))]
    for c, r in masses:
        crown.ellipsoid(c, r, leaf, k=0.6, relief=leafy)
    crown.displace(Relief(0.05, 5.0, 1.0, 'cells', 13))

    return AssetSpec('oak_edge_a', [Part(s, cell=0.014, faces=14000), Part(crown, cell=0.05, faces=5000)], paint,
                     texture=2048, bake_size=2048, height=12.0, centre=5.0, extrusion=0.04,
                     lods=(3200,),
                     closeups=[('roots', 30, 0.8, 5.5, 50), ('bark', 10, 2.0, 2.2, 60), ('hollow', 40, 1.55, 1.6, 60, 0.42, 0.3)])


def paint(m: Surface) -> Painted:
    P, N = m.V, m.N
    col = srgb_to_linear(m.color)
    barkz = m.zone == 'bark'
    # Bark: grey-brown plates, darker and greener in the cracks, lichen and moss where the wet runs.
    g = grain_noise(P, (0, 1, 0), 3.0, 0.25, 1)
    c = col * (0.8 + 0.4 * g[:, None])
    crev = np.clip(-m.curv * 0.6, 0, 1)
    crest = np.clip(m.curv * 0.5, 0, 1)
    c = hue_shift_shadow(c, crev * 0.75 + (1 - m.ao) * 0.6, toward=(0.08, 0.1, 0.08))
    c = mix(c, c * 1.55 + srgb_to_linear(np.array([0.05, 0.05, 0.045])), crest * 0.55)
    # Moss on the north (−z) side and on top of roots, thicker low down.
    moss_amt = smoothstep(0.1, 0.7, -N[:, 2] * 0.6 + N[:, 1] * 0.7 + (noise(P, 1.3, 3, 5) - 0.5) * 0.9) * (1 - smoothstep(1.0, 4.0, P[:, 1]))
    moss = srgb_to_linear(np.array([0.22, 0.29, 0.12])) * (0.75 + 0.5 * noise(P, 9, 2, 6))[:, None]
    c = mix(c, moss, np.clip(moss_amt, 0, 1) * 0.9)
    lichen = smoothstep(0.7, 0.78, noise(P, 7, 2, 8)) * (1 - moss_amt)
    c = mix(c, srgb_to_linear(np.array([0.5, 0.54, 0.42])), lichen * 0.55)
    # Soil climbing the roots where they enter the ground.
    soil = 1 - smoothstep(-0.1, 0.35, P[:, 1])
    c = mix(c, srgb_to_linear(np.array([0.1, 0.08, 0.06])), soil * 0.85)
    # The hollow: deep dark inside.
    hollow = np.linalg.norm((P - np.array([0.42, 1.55, 0.3])) / np.array([0.2, 0.3, 0.24]), axis=1) < 1.05
    c = np.where((hollow & (m.ao < 0.8))[:, None], srgb_to_linear(np.array([0.04, 0.03, 0.025])), c)
    col = np.where(barkz[:, None], c, col)
    leafz = m.zone == 'leaf'
    # Leaves: darker in the core, lighter and warmer at the clusters' crowns, cool in their shade.
    lc = col * (0.7 + 0.6 * noise(P, 2.5, 3, 11)[:, None])
    lc = mix(lc, lc * np.array([1.25, 1.3, 0.9]), np.clip(m.curv * 0.3, 0, 1) * 0.6)
    lc = hue_shift_shadow(lc, (1 - m.ao) * 0.8, toward=(0.06, 0.1, 0.1))
    col = np.where(leafz[:, None], lc, col)
    fx = np.zeros((len(P), 3))
    fx[leafz] = (0.15, 0.5, 0.25)
    fx[barkz] = (0.0, 0.0, 0.0)
    fx[barkz, 0] = moss_amt[barkz] * 0.4
    return Painted(albedo=np.clip(col, 0, 1), fx=fx)
