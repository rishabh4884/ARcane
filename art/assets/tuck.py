"""
TUCK, WHO KEEPS THE STUMPS
==========================
The moss gnome who finds the Kindler (see docs/ART_BIBLE.md): a practical woodland craftsman about
three and a half heads tall. His charm is in how he is made and what he carries, not in mascot
proportions: a big, weathered, kind face (a bulbous nose, bushy brows, crow's feet, apple cheeks), a
beard grown long and tucked into his belt, a floppy felt cap with a sprig of oak in its band, a patched
coat open over a leather apron with a trowel and a ball of twine in its pockets, big capable hands,
stitched boots.

The skeleton keeps the gnome joint names their animation drives (beard and cap chains included).
"""
import numpy as np

from arcane_art.paint import hue_shift_shadow, mix, noise, smoothstep, srgb_to_linear, response
from arcane_art.pipeline import AssetSpec, Painted, Part, Surface
from arcane_art.rig import mirror
from arcane_art.sdf import Attr, Box, Drape, Ellipsoid, Limb, Relief, Sculpt, Torus, claw, hexcol, rotation

SKELETON = mirror([
    ('root', None, (0, 0, 0), (0, 0.05, 0)),
    ('hips', 'root', (0, 0.36, 0), None),
    ('spine', 'hips', (0, 0.48, 0), None),
    ('chest', 'spine', (0, 0.6, 0.01), None),
    ('head', 'chest', (0, 0.7, 0.03), (0, 0.84, 0.04)),
    ('eyes', 'head', (0, 0.76, 0.13), (0, 0.76, 0.16)),
    ('beard', 'head', (0, 0.67, 0.13), None),
    ('beard2', 'beard', (0, 0.53, 0.17), (0, 0.4, 0.18)),
    ('cap1', 'head', (0, 0.84, 0.01), None),
    ('cap2', 'cap1', (0, 1.0, -0.04), None),
    ('cap3', 'cap2', (0, 1.12, -0.13), (0, 1.18, -0.26)),
    ('shoulderL', 'chest', (0.15, 0.6, 0), None),
    ('elbowL', 'shoulderL', (0.22, 0.47, 0.03), None),
    ('handL', 'elbowL', (0.25, 0.37, 0.06), (0.26, 0.3, 0.07)),
    ('thighL', 'hips', (0.08, 0.34, 0), None),
    ('kneeL', 'thighL', (0.09, 0.2, 0.02), None),
    ('ankleL', 'kneeL', (0.09, 0.075, 0), None),
    ('toeL', 'ankleL', (0.09, 0.03, 0.1), (0.09, 0.035, 0.16)),
])

SKIN = hexcol('#b97f62')
BEARD = hexcol('#d9d3c6')
CAP = hexcol('#4e6a3a')
COAT = hexcol('#6a4c32')
PATCH1 = hexcol('#5c5d3c')
PATCH2 = hexcol('#7d6243')
APRON = hexcol('#55391f')
BOOT = hexcol('#3a2a1c')
BRASS = hexcol('#a1843f')


def A(zone, mat='skin', color=SKIN, *bones):
    return Attr(mat, color, zone, tuple(bones))


def V(*p):
    return np.asarray(p, float)


def spec() -> AssetSpec:
    body = Sculpt('body')
    gear = Sculpt('gear')
    felt = Relief(0.0012, 90.0, 0.6, 'fbm', 3)
    wool = Relief(0.0016, 60.0, 0.35, 'fbm', 5)

    # ── Under the coat: a sturdy round body, broad in the shoulder. ──
    body.ellipsoid((0, 0.42, 0.02), (0.12, 0.09, 0.1), A('body', 'cloth', COAT, 'hips'), k=0.0)
    body.ellipsoid((0, 0.5, 0.04), (0.13, 0.11, 0.115), A('body', 'cloth', COAT, 'spine', 'hips'), k=0.04)
    body.ellipsoid((0, 0.585, 0.02), (0.135, 0.07, 0.1), A('body', 'cloth', COAT, 'chest'), k=0.04)

    # ── The head: a big, weathered, kind face. ──
    H = A('head', 'skin', SKIN, 'head')
    fr = Relief(0.0008, 120.0, 1.0, 'fbm', 7)
    body.ellipsoid((0, 0.765, 0.03), (0.088, 0.094, 0.09), H, k=0.03, relief=fr)
    body.ellipsoid((0, 0.79, 0.075), (0.078, 0.05, 0.06), H, k=0.03)
    for x in (1, -1):
        body.ellipsoid((x * 0.046, 0.738, 0.1), (0.032, 0.028, 0.026), A('cheek', 'skin', SKIN, 'head'), k=0.02)
        body.sub(Ellipsoid((x * 0.032, 0.77, 0.116), (0.016, 0.0115, 0.012)), k=0.007)
        e = 'eyeL' if x > 0 else 'eyeR'
        body.ellipsoid((x * 0.032, 0.769, 0.1175), (0.0125, 0.0098, 0.009), A(e, 'eye', hexcol('#e8e2d4'), 'eyes', 'head'), k=0.0015)
        body.limb([(x * 0.032 - 0.015, 0.773, 0.116), (x * 0.032, 0.781, 0.125), (x * 0.032 + 0.015, 0.774, 0.115)],
                  radii=[(0, 0.004, 0.0045), (0.5, 0.0048, 0.0052), (1, 0.004, 0.0045)], attr=A('lid', 'skin', SKIN, 'head'), k=0.003)
        body.limb([(x * 0.032 - 0.013, 0.763, 0.117), (x * 0.032, 0.758, 0.123), (x * 0.032 + 0.013, 0.763, 0.116)],
                  radii=[(0, 0.0025, 0.003), (1, 0.0025, 0.003)], attr=A('lid', 'skin', SKIN, 'head'), k=0.002)
        # Crow's feet: a life of squinting into weather.
        for k in range(3):
            body.crease([(x * 0.05, 0.775 - k * 0.006, 0.1), (x * 0.064, 0.778 - k * 0.012, 0.09)], 0.0025, 0.0012)
        # Bushy brows: designed masses of hair, swept up and out.
        body.limb([(x * 0.01, 0.789, 0.124), (x * 0.034, 0.797, 0.128), (x * 0.062, 0.806, 0.112), (x * 0.074, 0.816, 0.098)],
                  radii=[(0, 0.009, 0.008), (0.45, 0.016, 0.012), (0.8, 0.011, 0.009), (1, 0.004, 0.004)], attr=A('brow', 'hair', BEARD, 'head'), k=0.004,
                  relief=Relief(0.0016, 70.0, 0.25, 'ridged', 23))
        # Nasolabial folds: the cheeks sit heavy on the moustache.
        body.crease([(x * 0.024, 0.752, 0.128), (x * 0.042, 0.736, 0.122), (x * 0.05, 0.72, 0.112)], 0.0045, 0.0022)
        # Ears, modest and a little pointed.
        body.limb([(x * 0.082, 0.762, 0.022), (x * 0.102, 0.786, 0.006), (x * 0.116, 0.818, -0.012)],
                  radii=[(0, 0.026, 0.007), (0.5, 0.024, 0.006), (1, 0.005, 0.003)], up=(x * 0.3, 0.2, 1.0), attr=A('ear', 'skin', SKIN, 'head'), k=0.01)
    # A forehead lined by weather.
    for k in range(3):
        body.crease([(-0.04, 0.812 + k * 0.009, 0.112 - k * 0.004), (0.04, 0.814 + k * 0.009, 0.112 - k * 0.004)], 0.003, 0.0014)
    # The nose: big and round, a potato of a nose, the gnome's signature.
    nose = A('nose', 'skin', SKIN, 'head')
    body.limb([(0, 0.775, 0.12), (0, 0.755, 0.138)], radii=[(0, 0.011, 0.012), (1, 0.016, 0.017)], attr=nose, k=0.01)
    body.ellipsoid((0, 0.745, 0.145), (0.026, 0.023, 0.024), nose, k=0.012)
    for x in (1, -1):
        body.ellipsoid((x * 0.019, 0.742, 0.135), (0.012, 0.011, 0.012), nose, k=0.008)
        body.sub(Ellipsoid((x * 0.01, 0.734, 0.143), (0.0045, 0.003, 0.005)), k=0.002)

    # ── The beard: one designed mass from the cheeks to the belt, parted, tucked in. ──
    beard = A('beard', 'hair', BEARD, 'beard', 'beard2', 'head')
    body.limb([(0, 0.73, 0.1), (0, 0.66, 0.13), (0, 0.58, 0.15), (0.004, 0.5, 0.16), (0.008, 0.44, 0.15)],
              radii=[(0, 0.07, 0.03), (0.3, 0.075, 0.04), (0.65, 0.06, 0.035), (1, 0.04, 0.02)], square=[(0, 2.4), (1, 2.0)],
              up=(0, 0, 1), attr=beard, k=0.02, relief=Relief(0.003, 40.0, 0.12, 'ridged', 9))
    for x in (1, -1):
        body.limb([(x * 0.06, 0.745, 0.075), (x * 0.05, 0.69, 0.1), (x * 0.03, 0.63, 0.12)],
                  radii=[(0, 0.02, 0.02), (0.5, 0.026, 0.024), (1, 0.018, 0.018)], attr=beard, k=0.015, relief=Relief(0.002, 50.0, 0.15, 'ridged', 11))
        # The moustache curls out over the beard.
        body.limb([(x * 0.004, 0.728, 0.142), (x * 0.03, 0.722, 0.14), (x * 0.052, 0.712, 0.125), (x * 0.06, 0.722, 0.11)],
                  radii=[(0, 0.009, 0.008), (0.5, 0.011, 0.009), (1, 0.004, 0.004)], attr=beard, k=0.006, relief=Relief(0.0012, 80.0, 0.2, 'ridged', 13))
    body.crease([(0, 0.62, 0.17), (0.003, 0.54, 0.185), (0.006, 0.47, 0.17)], 0.006, 0.004)

    # ── The cap: soft felt, a roll at the band, flopping back, an oak sprig tucked in. ──
    cap = A('cap', 'cloth', CAP, 'cap1', 'cap2', 'cap3', 'head')
    body.limb([(0, 0.82, 0.02), (0, 0.92, -0.01), (0, 1.0, -0.045), (0, 1.07, -0.1), (0.01, 1.11, -0.17), (0.02, 1.12, -0.24)],
              radii=[(0, 0.098, 0.096), (0.25, 0.085, 0.082), (0.55, 0.06, 0.056), (0.8, 0.035, 0.032), (1, 0.008, 0.008)],
              attr=cap, k=0.01, relief=felt)
    ring = [V(np.sin(a) * 0.099, 0.835 + np.cos(a) * 0.004, 0.025 + np.cos(a) * 0.097) for a in np.linspace(0, 2 * np.pi, 33)]
    body.limb(ring, radii=[(0, 0.014, 0.012), (1, 0.014, 0.012)], attr=A('band', 'cloth', hexcol('#3e5530'), 'cap1', 'head'), k=0.006, samples=2)
    for k, (x0, z0) in enumerate(((0.0, 0.07), (0.06, 0.04), (-0.06, 0.03), (0.03, -0.06))):
        body.crease([(x0, 0.86, z0), (x0 * 0.7, 0.96, z0 * 0.6 - 0.02), (x0 * 0.4, 1.04, z0 * 0.3 - 0.07)], 0.009, 0.0035)
    leaf = A('leaf', 'leaf', hexcol('#6f8a3a'), 'cap1')
    for i, ang in enumerate((-0.4, 0.0, 0.45)):
        base = V(0.07, 0.85, 0.07)
        tip = base + V(0.03 + np.sin(ang) * 0.03, 0.05 + np.cos(ang) * 0.02, 0.01)
        gear.limb([base, (base + tip) / 2 + V(0, 0.004, 0.006), tip], radii=[(0, 0.004, 0.0015), (0.4, 0.014, 0.0015), (1, 0.001, 0.001)],
                  up=(0, 0, 1), attr=leaf, k=0.001)

    # ── The coat: patched wool, open over the apron, sleeves with rolled cuffs. ──
    coat = A('coat', 'cloth', COAT, 'chest', 'spine', 'hips', 'thighL', 'thighR')
    body.add(Drape((0, 0.64, 0.015), 0.4, (0.13, 0.11), (0.2, 0.18), folds=7, depth=0.1, sharp=0.75, thickness=0.008,
                   hem=0.012, tatter=5, seed=5, opening=0.85, lean=(0, 0.02), belly=0.03, relief=wool), coat, k=0.01)
    body.limb([(0.06, 0.66, 0.06), (0.11, 0.645, 0.03), (0.15, 0.62, 0.0)], radii=[(0, 0.03, 0.02), (1, 0.028, 0.02)], attr=coat, k=0.02)
    body.limb([(-0.06, 0.66, 0.06), (-0.11, 0.645, 0.03), (-0.15, 0.62, 0.0)], radii=[(0, 0.03, 0.02), (1, 0.028, 0.02)], attr=coat, k=0.02)
    # Patches sewn on where the coat wore through.
    for c, half, rot, col in (((0.12, 0.42, 0.11), (0.035, 0.03, 0.006), (0, 0.85, 0.2), PATCH1), ((-0.1, 0.33, 0.14), (0.03, 0.028, 0.006), (0, -0.6, -0.15), PATCH2),
                              ((0.0, 0.52, -0.13), (0.05, 0.04, 0.006), (0, 3.14, 0.1), PATCH2)):
        hit = body.cast(V(*c) * V(1.6, 1, 1.6) + V(0, 0, 0), -V(c[0], 0, c[2]), 0.5)
        if hit is None:
            continue
        p, n = hit
        yaw = np.arctan2(n[0], n[2])
        body.box(p + n * 0.003, half, A('patch', 'cloth', col, 'spine', 'hips'), k=0.002, round_=0.004, rot=rotation(0, yaw, rot[2]))
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        sh, el, hd = f'shoulder{s}', f'elbow{s}', f'hand{s}'
        body.limb([(x * 0.13, 0.62, 0.0), (x * 0.18, 0.54, 0.015), (x * 0.22, 0.47, 0.03), (x * 0.245, 0.39, 0.055)],
                  radii=[(0, 0.045, 0.045), (0.4, 0.04, 0.042), (0.75, 0.038, 0.04), (1, 0.042, 0.044)],
                  attr=A('sleeve', 'cloth', COAT, sh, el), k=0.02, relief=wool)
        cuff = [V(x * 0.245, 0.395, 0.055) + V(np.cos(a) * 0.044, np.sin(a) * 0.012, np.sin(a) * 0.044) for a in np.linspace(0, 2 * np.pi, 25)]
        body.limb(cuff, radii=[(0, 0.011, 0.011), (1, 0.011, 0.011)], attr=A('sleeve', 'cloth', COAT, el, hd), k=0.005, samples=2)
        # Big capable hands, thick-fingered, a little dirty.
        D = V(0.04 * x, -0.95, 0.3); D /= np.linalg.norm(D)
        N = V(-x, 0, 0)
        Ac = V(0, 0.3, 0.95); Ac -= D * (Ac @ D); Ac /= np.linalg.norm(Ac)
        w0 = V(x * 0.25, 0.375, 0.06)
        pe = w0 + D * 0.05
        body.limb([w0, pe], radii=[(0, 0.026, 0.014), (1, 0.03, 0.013)], square=[(0, 3.0), (1, 3.0)], up=N, attr=A('hand', 'skin', SKIN, hd), k=0.008)
        for off, sc in ((0.02, 1.0), (0.007, 1.06), (-0.007, 1.0), (-0.02, 0.82)):
            k0 = pe + Ac * off - D * 0.003
            p1 = k0 + D * 0.022 * sc + N * 0.002
            p2 = p1 + D * 0.016 * sc + N * 0.007 * sc
            p3 = p2 + D * 0.011 * sc + N * 0.009 * sc
            body.limb([k0, p1, p2, p3], radii=[(0, 0.0085, 0.0075), (0.45, 0.0072, 0.0066), (0.75, 0.0066, 0.006), (1, 0.0052, 0.0048)],
                      square=[(0, 2.5), (1, 2.2)], up=N, attr=A('finger', 'skin', SKIN, hd), k=0.004)
        t0 = w0 + D * 0.018 + Ac * 0.022 + N * 0.006
        t1 = t0 + (Ac * 0.55 + D * 0.55 + N * 0.35) * 0.022
        t2 = t1 + (Ac * 0.2 + D * 0.7 + N * 0.55) * 0.016
        body.limb([t0, t1, t2], radii=[(0, 0.0095, 0.0085), (0.5, 0.0078, 0.007), (1, 0.0056, 0.005)], up=N, attr=A('finger', 'skin', SKIN, hd), k=0.005)

    # ── The apron: thick leather, pockets, a trowel and a ball of twine; a belt the beard tucks under. ──
    apron = A('apron', 'leather', APRON, 'spine', 'hips', 'thighL', 'thighR')
    body.limb([(0, 0.6, 0.1), (0, 0.48, 0.155), (0, 0.36, 0.15), (0, 0.24, 0.13)],
              radii=[(0, 0.075, 0.008), (0.3, 0.1, 0.008), (1, 0.11, 0.008)], square=[(0, 3.5), (1, 3.5)], up=(0, 0, 1), attr=apron, k=0.006,
              relief=Relief(0.0012, 70.0, 0.5, 'fbm', 15))
    for x in (1, -1):
        body.box((x * 0.055, 0.34, 0.158), (0.036, 0.03, 0.006), apron, k=0.002, round_=0.004)
        body.crease([(x * 0.019, 0.37, 0.165), (x * 0.091, 0.37, 0.165)], 0.003, 0.0018)
    belt = [V(np.sin(a) * 0.14, 0.45, 0.035 + np.cos(a) * 0.132) for a in np.linspace(0, 2 * np.pi, 41)]
    body.limb(belt, radii=[(0, 0.016, 0.006), (1, 0.016, 0.006)], up=(0, 1, 0), attr=A('belt', 'leather', hexcol('#3b2817'), 'spine', 'hips'), k=0.003, samples=2)
    brass = A('brass', 'brass', BRASS, 'hips')
    gear.add(Box((0, 0.45, 0.172), (0.02, 0.018, 0.004), 0.003), brass, k=0.0)
    gear.sub(Box((0, 0.45, 0.176), (0.013, 0.011, 0.005), 0.002), k=0.001)
    tool = A('tool', 'wood', hexcol('#7a5a36'), 'hips', 'thighL')
    gear.limb([(0.06, 0.37, 0.163), (0.062, 0.44, 0.17)], radii=[(0, 0.007, 0.007), (1, 0.008, 0.008)], attr=tool, k=0.001)
    gear.limb([(0.06, 0.37, 0.163), (0.058, 0.3, 0.16)], radii=[(0, 0.012, 0.003), (1, 0.003, 0.002)], up=(0, 0, 1), attr=A('tool', 'metal', hexcol('#6b6a63'), 'hips', 'thighL'), k=0.001)
    gear.ellipsoid((-0.055, 0.365, 0.168), (0.016, 0.016, 0.014), A('twine', 'rope', hexcol('#a08a62'), 'hips', 'thighR'), k=0.0, relief=Relief(0.0012, 160.0, 1.0, 'ridged', 17))

    # ── Legs in wool, boots of stitched leather with turned-down cuffs. ──
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        th, kn, an, to = f'thigh{s}', f'knee{s}', f'ankle{s}', f'toe{s}'
        body.limb([(x * 0.075, 0.35, 0.0), (x * 0.088, 0.2, 0.02), (x * 0.09, 0.1, 0.005)], radii=[(0, 0.05, 0.05), (0.6, 0.04, 0.042), (1, 0.035, 0.036)],
                  attr=A('leg', 'cloth', hexcol('#5a4a3a'), th, kn), k=0.02, relief=wool)
        boot = A('boot', 'leather', BOOT, an, kn, to)
        body.limb([(x * 0.09, 0.14, 0.0), (x * 0.09, 0.06, 0.01), (x * 0.09, 0.035, 0.07), (x * 0.09, 0.04, 0.15)],
                  radii=[(0, 0.042, 0.044), (0.35, 0.038, 0.042), (0.7, 0.04, 0.03), (1, 0.032, 0.024)], square=[(0, 2.2), (1, 2.6)],
                  up=(0, 0, 1), attr=boot, k=0.012, relief=Relief(0.001, 80.0, 1.0, 'fbm', 19))
        cuffb = [V(x * 0.09, 0.145, 0.0) + V(np.cos(a) * 0.048, 0.0, np.sin(a) * 0.05) for a in np.linspace(0, 2 * np.pi, 25)]
        body.limb(cuffb, radii=[(0, 0.012, 0.014), (1, 0.012, 0.014)], attr=boot, k=0.004, samples=2)
        body.box((x * 0.09, 0.012, 0.06), (0.04, 0.012, 0.1), A('sole', 'leather', hexcol('#241a12'), an, to), k=0.004, round_=0.008)
        body.crease([(x * 0.09 + 0.03, 0.05, 0.12), (x * 0.09, 0.062, 0.15), (x * 0.09 - 0.03, 0.05, 0.12)], 0.003, 0.0015)

    return AssetSpec(
        'tuck',
        [Part(body, cell=0.0014, faces=26000, topology='tri', detail_zones=('head', 'cheek', 'nose', 'lid', 'eyeL', 'eyeR', 'brow', 'ear', 'hand', 'finger', 'beard')),
         Part(gear, cell=0.0008, faces=3000, topology='tri')],
        paint, texture=1024, bake_size=2048, height=1.18, centre=0.55, skeleton=SKELETON, extrusion=0.004,
        closeups=[('face', 15, 0.75, 0.32, 85, 0.0, 0.1), ('face-side', 70, 0.76, 0.36, 85, 0.0, 0.08), ('hands', 35, 0.37, 0.3, 85, 0.2, 0.08)],
    )


def paint(m: Surface) -> Painted:
    P, N, zone = m.V, m.N, m.zone
    col = srgb_to_linear(m.color)
    n = len(P)

    def z(*names):
        return np.isin(zone, names)

    skin = z('head', 'cheek', 'nose', 'lid', 'ear', 'hand', 'finger')
    s = col * (0.86 + 0.24 * noise(P, 30, 3, 1)[:, None])
    flush = z('cheek', 'nose', 'ear') * 1.0
    s = mix(s, s * np.array([1.22, 0.78, 0.72]), flush * 0.6)
    s = mix(s, s * np.array([1.1, 0.92, 0.85]), z('finger') * 0.35)
    s = hue_shift_shadow(s, np.clip(-m.curv * 0.02, 0, 1) * 0.5 + (1 - m.ao) * 0.6, toward=(0.2, 0.12, 0.12))
    s = mix(s, s * 1.15 + 0.01, np.clip(m.curv * 0.012, 0, 1) * 0.4)
    s = mix(s, srgb_to_linear(np.array([0.22, 0.17, 0.12])), z('hand', 'finger') * smoothstep(0.5, 0.8, noise(P, 40, 2, 5)) * 0.45)
    col = np.where(skin[:, None], s, col)
    # Eyes: small, dark and bright: a kind hazel iris.
    for x, e in ((0.032, 'eyeL'), (-0.032, 'eyeR')):
        sel = zone == e
        if not sel.any():
            continue
        q = P[sel] - np.array([x, 0.769, 0.111])
        rr = np.sqrt((q[:, 0] / 0.0115) ** 2 + (q[:, 1] / 0.009) ** 2)
        front = q[:, 2] > 0.002
        c = np.tile(srgb_to_linear(np.array([0.88, 0.85, 0.78])), (sel.sum(), 1))
        c = np.where(((rr < 0.7) & front)[:, None], srgb_to_linear(np.array([0.36, 0.3, 0.14])), c)
        c = np.where(((rr < 0.32) & front)[:, None], 0.01, c)
        c = np.where(((np.abs(q[:, 0] - 0.003) < 0.0018) & (np.abs(q[:, 1] - 0.003) < 0.0018) & front)[:, None], 0.9, c)
        col[sel] = c
    hair = z('beard', 'brow')
    hcol = col * (0.86 + 0.24 * noise(P * np.array([1, 0.2, 1]), 60, 2, 7)[:, None])
    col = np.where(hair[:, None], hue_shift_shadow(hcol, (1 - m.ao) * 0.7, toward=(0.3, 0.3, 0.32)), col)
    cloth = z('coat', 'sleeve', 'cap', 'band', 'patch', 'leg', 'body')
    c = col * (0.84 + 0.25 * noise(P, 24, 3, 11)[:, None])
    c = mix(c, c * 0.75, smoothstep(0.6, 0.85, noise(P, 8, 3, 13)) * 0.5)
    c = hue_shift_shadow(c, (1 - m.ao) * 0.7)
    col = np.where(cloth[:, None], c, col)
    leather = z('apron', 'belt', 'boot', 'sole')
    l = col * (0.82 + 0.3 * noise(P, 18, 3, 15)[:, None])
    l = mix(l, l * 1.35 + 0.01, np.clip(m.curv * 0.01, 0, 1) * 0.5)
    col = np.where(leather[:, None], hue_shift_shadow(l, (1 - m.ao) * 0.7), col)
    brass = z('brass')
    col = np.where(brass[:, None], mix(col * 0.6, col * 1.4, np.clip(0.5 + m.curv * 0.01, 0, 1)), col)
    rough, metal, fx = response(m.mat)
    fx[z('ear'), 1] = 0.4
    return Painted(albedo=np.clip(col, 0, 1), fx=fx)
