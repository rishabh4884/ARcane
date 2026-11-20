"""
GORRIK THE BRAMBLECHIEF
=======================
The goblins' warlord (see docs/ART_BIBLE.md). Distinct from his kin even as a black shape: a trapezoid
of mass — a back overgrown into a hump of bramble like a thorned mantle, a small head sunk low between
enormous shoulders, forearms like logs, short bowed legs. Scarred, one eye milky and blind, a tusk
broken off, ochre war paint, a crown of thorns holding one stolen light. He drags a club of thorned
root with a caged lantern bound at its head.

The skeleton keeps the goblin joint names his animation drives, at his own proportions.
"""
import numpy as np

from arcane_art.paint import cell_spots, hue_shift_shadow, mix, noise, smoothstep, srgb_to_linear, response
from arcane_art.pipeline import AssetSpec, Painted, Part, Surface
from arcane_art.rig import mirror
from arcane_art.sdf import (Attr, Drape, Ellipsoid, Limb, Region, Relief, Sculpt, Shell, Torus, claw, hexcol, rotation, wrap_path)

SKELETON = mirror([
    ('root', None, (0, 0, 0), (0, 0.15, 0)),
    ('hips', 'root', (0, 1.30, 0), None),
    ('spine', 'hips', (0, 1.62, 0.03), None),
    ('chest', 'spine', (0, 1.98, 0.12), None),
    ('neck', 'chest', (0, 2.22, 0.32), None),
    ('head', 'neck', (0, 2.34, 0.42), (0, 2.62, 0.52)),
    ('jaw', 'head', (0, 2.30, 0.50), (0, 2.22, 0.70)),
    ('eyes', 'head', (0, 2.46, 0.66), (0, 2.46, 0.72)),
    ('earL', 'head', (0.2, 2.48, 0.38), None),
    ('ear2L', 'earL', (0.40, 2.55, 0.28), (0.58, 2.60, 0.18)),
    ('shoulderL', 'chest', (0.52, 2.12, 0.10), None),
    ('elbowL', 'shoulderL', (0.74, 1.70, 0.22), None),
    ('wristL', 'elbowL', (0.82, 1.24, 0.42), None),
    ('handL', 'wristL', (0.84, 1.10, 0.48), (0.86, 0.88, 0.56)),
    ('thighL', 'hips', (0.26, 1.26, 0.0), None),
    ('kneeL', 'thighL', (0.34, 0.72, 0.20), None),
    ('ankleL', 'kneeL', (0.30, 0.18, -0.04), None),
    ('toeL', 'ankleL', (0.30, 0.06, 0.20), (0.30, 0.05, 0.38)),
])

SKIN = hexcol('#5c6142')
BARK = hexcol('#2b2219')
HIDE = hexcol('#5a4430')
FUR = hexcol('#4a443a')
BONE = hexcol('#cfc3a4')
ROPE = hexcol('#7d6a4c')
OCHRE = hexcol('#b4652d')


def A(zone, mat='skin', color=SKIN, *bones):
    return Attr(mat, color, zone, tuple(bones))


def V(*p):
    return np.asarray(p, float)


def spec() -> AssetSpec:
    body = Sculpt('body')
    gear = Sculpt('gear')
    armor = Sculpt('armor')
    sr = Relief(0.003, 30.0, 1.0, 'fbm', 3)

    # ── A torso built for weight: a gut, a barrel chest, a back heaped with muscle. ──
    body.ellipsoid((0, 1.36, 0.02), (0.3, 0.17, 0.24), A('pelvis', 'skin', SKIN, 'hips'), k=0.0, relief=sr)
    body.ellipsoid((0, 1.55, 0.2), (0.34, 0.3, 0.3), A('belly', 'skin', SKIN, 'spine', 'hips'), k=0.1, relief=sr)
    body.limb([(0, 1.6, 0.06), (0, 1.9, 0.1), (0, 2.12, 0.16)], radii=[(0, 0.36, 0.3), (0.5, 0.44, 0.34), (1, 0.4, 0.28)],
              square=[(0, 2.2), (1, 2.3)], attr=A('chest', 'skin', SKIN, 'chest', 'spine'), k=0.1, relief=sr)
    body.ellipsoid((0, 2.05, -0.08), (0.42, 0.26, 0.24), A('back', 'skin', SKIN, 'chest'), k=0.1, relief=sr)
    for x in (1, -1):
        body.ellipsoid((x * 0.17, 2.02, 0.33), (0.17, 0.11, 0.08), A('chest', 'skin', SKIN, 'chest'), k=0.06, rot=rotation(0.25, 0, 0))
        # Trapezius heaped up to the ears: the head sits low between the shoulders.
        body.limb([(x * 0.05, 2.4, 0.08), (x * 0.26, 2.33, 0.04), (x * 0.5, 2.2, 0.03)], radii=[(0, 0.17, 0.13), (0.5, 0.16, 0.13), (1, 0.11, 0.1)],
                  attr=A('back', 'skin', SKIN, 'chest', 'neck'), k=0.1, relief=sr)
    body.crease([(0.25, 1.78, 0.42), (0, 1.75, 0.5), (-0.25, 1.78, 0.42)], 0.03, 0.008)
    body.sub(Ellipsoid((0, 1.5, 0.5), (0.012, 0.018, 0.02)), k=0.01)
    # A bull neck, short, the head sunk low on it.
    body.limb([(0, 2.06, 0.14), (0, 2.3, 0.37)], radii=[(0, 0.17, 0.15), (1, 0.13, 0.12)], attr=A('neck', 'skin', SKIN, 'chest', 'neck', 'head'), k=0.08, relief=sr)

    # ── A small head: a jutting brow, deep little eyes (the right one blind), a crooked nose, an underbite. ──
    H = A('head', 'skin', SKIN, 'head')
    J = A('jaw', 'skin', SKIN, 'jaw')
    fr = Relief(0.002, 45.0, 1.0, 'fbm', 7)
    body.ellipsoid((0, 2.43, 0.46), (0.15, 0.135, 0.16), H, k=0.06, relief=fr)
    # A brow like a shelf of rock, frowning hard over the nose.
    body.box((0, 2.505, 0.6), (0.165, 0.032, 0.055), H, k=0.035, round_=0.024, rot=rotation(-0.25, 0, 0))
    for x in (1, -1):
        body.box((x * 0.105, 2.5, 0.59), (0.07, 0.03, 0.05), H, k=0.03, round_=0.02, rot=rotation(-0.2, x * 0.35, x * -0.18))
    body.crease([(0, 2.53, 0.66), (0, 2.49, 0.665)], 0.012, 0.006)
    body.crease([(0.03, 2.535, 0.655), (0.012, 2.5, 0.664)], 0.008, 0.004)
    body.crease([(-0.03, 2.535, 0.655), (-0.012, 2.5, 0.664)], 0.008, 0.004)
    for x in (1, -1):
        body.ellipsoid((x * 0.115, 2.34, 0.54), (0.085, 0.085, 0.085), H, k=0.05)
        body.limb([(x * 0.06, 2.41, 0.61), (x * 0.16, 2.42, 0.5)], radii=[(0, 0.024, 0.028), (1, 0.018, 0.022)], square=[(0, 2.6), (1, 2.6)], attr=H, k=0.03)
        body.sub(Ellipsoid((x * 0.07, 2.462, 0.62), (0.034, 0.022, 0.03)), k=0.012)
        e = 'eyeL' if x > 0 else 'eyeR'
        body.ellipsoid((x * 0.07, 2.46, 0.618), (0.021, 0.016, 0.014), A(e, 'eye', hexcol('#cdbf94'), 'eyes', 'head'), k=0.002)
        body.limb([(x * 0.07 - 0.026, 2.465, 0.618), (x * 0.07, 2.479, 0.632), (x * 0.07 + 0.026, 2.466, 0.616)],
                  radii=[(0, 0.008, 0.009), (0.5, 0.0095, 0.01), (1, 0.008, 0.009)], attr=A('lid', 'skin', SKIN, 'head'), k=0.004)
    body.ellipsoid((0, 2.37, 0.62), (0.115, 0.07, 0.09), H, k=0.05)
    # A broad, flattened nose, broken once and set crooked.
    nose = A('nose', 'skin', SKIN, 'head')
    body.limb([(0, 2.485, 0.64), (0.012, 2.44, 0.7), (0.022, 2.405, 0.733)], radii=[(0, 0.03, 0.028), (0.6, 0.05, 0.034), (1, 0.046, 0.03)],
              square=[(0, 2.8), (1, 2.4)], attr=nose, k=0.03)
    for x in (1, -1):
        body.ellipsoid((x * 0.04 + 0.02, 2.392, 0.716), (0.03, 0.022, 0.026), nose, k=0.015)
        body.sub(Ellipsoid((x * 0.024 + 0.021, 2.38, 0.735), (0.011, 0.007, 0.013)), k=0.005)
    # The scar: a ridge of healed skin from brow to cheek through the blind right eye.
    body.crease([(-0.03, 2.56, 0.6), (-0.075, 2.47, 0.635), (-0.12, 2.38, 0.6)], 0.01, -0.004)
    # An underbite: the lower jaw thrust past the upper lip, a wide mouth turned down.
    body.limb([(0.13, 2.34, 0.44), (0.12, 2.27, 0.6), (0, 2.225, 0.71), (-0.12, 2.27, 0.6), (-0.13, 2.34, 0.44)],
              radii=[(0, 0.052, 0.058), (0.5, 0.058, 0.064), (1, 0.052, 0.058)], attr=J, k=0.05)
    body.ellipsoid((0, 2.225, 0.705), (0.07, 0.045, 0.05), J, k=0.03)
    body.limb([(0.125, 2.296, 0.62), (0, 2.292, 0.728), (-0.125, 2.296, 0.62)], radii=[(0, 0.016, 0.018), (1, 0.016, 0.018)], attr=A('lip', 'skin', SKIN, 'jaw'), k=0.016)
    body.limb([(0.115, 2.325, 0.615), (0, 2.33, 0.68), (-0.115, 2.325, 0.615)], radii=[(0, 0.013, 0.014), (1, 0.013, 0.014)], attr=A('lip', 'skin', SKIN, 'head'), k=0.015)
    body.sub(Limb([(0.125, 2.305, 0.62), (0.06, 2.312, 0.68), (0, 2.313, 0.695), (-0.06, 2.312, 0.68), (-0.125, 2.305, 0.62)],
                  radii=[(0, 0.007, 0.008), (0.5, 0.009, 0.01), (1, 0.007, 0.008)]), k=0.007)
    for x in (1, -1):
        tusk = claw((x * 0.075, 2.27, 0.69), (x * 0.1, 2.46, 0.715), 0.03, curl=(x * 0.012, 0, 0.01), sides=5)
        for h in tusk:
            gear.hull(h, A('tooth', 'tooth', hexcol('#e0d5b5'), 'jaw'), k=0.002)
    gear.carve_plane((0.09, 2.39, 0.71), (0.2, 1.0, 0.15), Ellipsoid((0.09, 2.4, 0.71), (0.05, 0.05, 0.05)), k=0.002)
    # Ears: shorter than his kin's, chewed ragged; the left lost its tip.
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        tip = 0.5 if x > 0 else 0.6
        body.limb([(x * 0.15, 2.46, 0.4), (x * 0.3, 2.52, 0.33), (x * tip, 2.58, 0.2)],
                  radii=[(0, 0.07, 0.014), (0.4, 0.085, 0.011), (1, 0.02, 0.008)], up=(x * 0.1, 0.4, 1.0),
                  attr=A('ear', 'skin', SKIN, f'ear{s}', f'ear2{s}', 'head'), k=0.03)
        for k in range(3):
            body.sub(Ellipsoid((x * (0.26 + k * 0.085), 2.6 + k * 0.012, 0.31 - k * 0.04), (0.024, 0.03, 0.03)), k=0.004)

    # ── Arms like trunks: huge shoulders, a log of a forearm, hands that could crush a stag's skull. ──
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        sh, el, wr, hd = f'shoulder{s}', f'elbow{s}', f'wrist{s}', f'hand{s}'
        body.ellipsoid((x * 0.52, 2.12, 0.1), (0.16, 0.17, 0.16), A('arm', 'skin', SKIN, sh, 'chest'), k=0.08, relief=sr)
        body.limb([(x * 0.52, 2.12, 0.1), (x * 0.64, 1.9, 0.16), (x * 0.74, 1.7, 0.22)],
                  radii=[(0, 0.13, 0.14), (0.45, 0.12, 0.135), (1, 0.1, 0.11)], offset=[(0, 0, 0), (0.45, 0, 0.02), (1, 0, 0)],
                  attr=A('arm', 'skin', SKIN, sh), k=0.06, relief=sr)
        body.ellipsoid((x * 0.745, 1.71, 0.17), (0.07, 0.07, 0.06), A('elbow', 'skin', SKIN, el), k=0.03)
        body.limb([(x * 0.74, 1.7, 0.22), (x * 0.79, 1.46, 0.32), (x * 0.82, 1.25, 0.41)],
                  radii=[(0, 0.13, 0.12), (0.4, 0.15, 0.13), (1, 0.095, 0.075)], square=[(0, 2.2), (1, 2.7)],
                  attr=A('arm', 'skin', SKIN, el, wr), k=0.06, relief=sr)
        D = V(0.09 * x, -0.9, 0.35); D /= np.linalg.norm(D)
        N = V(-x, 0, 0)
        Ac = V(0, 0.35, 0.94); Ac -= D * (Ac @ D); Ac /= np.linalg.norm(Ac)
        w0 = V(x * 0.825, 1.23, 0.42)
        pe = w0 + D * 0.17
        body.limb([w0, w0 + D * 0.09, pe], radii=[(0, 0.085, 0.045), (0.5, 0.1, 0.05), (1, 0.105, 0.044)], square=[(0, 3.0), (1, 3.2)],
                  up=N, attr=A('hand', 'skin', SKIN, hd, wr), k=0.03, relief=sr)
        for off, sc in ((0.07, 1.0), (0.024, 1.08), (-0.024, 1.0), (-0.068, 0.82)):
            k0 = pe + Ac * off - D * 0.01
            p1 = k0 + D * 0.085 * sc + N * 0.012
            p2 = p1 + D * 0.06 * sc + N * 0.03 * sc
            p3 = p2 + D * 0.04 * sc + N * 0.04 * sc
            body.limb([k0, p1, p2, p3], radii=[(0, 0.03, 0.027), (0.2, 0.024, 0.022), (0.44, 0.027, 0.024), (0.6, 0.021, 0.02),
                                               (0.77, 0.023, 0.021), (1, 0.016, 0.015)],
                      square=[(0, 2.6), (1, 2.3)], up=N, attr=A('finger', 'skin', SKIN, hd), k=0.012)
            td = (p3 - p2) / np.linalg.norm(p3 - p2)
            for h in claw(p3 - td * 0.008, p3 + td * 0.03 + N * 0.03, 0.014, curl=N * 0.006):
                gear.hull(h, A('claw', 'claw', hexcol('#231c15'), hd), k=0.001)
        t0 = w0 + D * 0.07 + Ac * 0.075 + N * 0.025
        t1 = t0 + (Ac * 0.5 + D * 0.6 + N * 0.4) * 0.08
        t2 = t1 + (Ac * 0.2 + D * 0.7 + N * 0.6) * 0.06
        body.limb([t0, t1, t2], radii=[(0, 0.036, 0.032), (0.5, 0.027, 0.024), (1, 0.019, 0.017)], up=N, attr=A('finger', 'skin', SKIN, hd), k=0.02)
        # Wrist wraps of hide.
        pts, ax = wrap_path((x * 0.8, 1.4, 0.35), (x * 0.826, 1.24, 0.42), 0.14, 0.1, 3.0, lift=0.004, seed=2 if x > 0 else 4)
        body.add(Limb(pts, radii=[(0, 0.025, 0.004), (1, 0.025, 0.004)], around=ax, samples=3), A('wrap', 'leather', HIDE, el, wr), k=0.004)

    # ── Short bowed legs under the weight: thick thighs, knees out, broad clawed feet. ──
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        th, kn, an, to = f'thigh{s}', f'knee{s}', f'ankle{s}', f'toe{s}'
        body.ellipsoid((x * 0.17, 1.33, -0.14), (0.17, 0.16, 0.14), A('leg', 'skin', SKIN, 'hips', th), k=0.08, relief=sr)
        body.limb([(x * 0.25, 1.32, 0.0), (x * 0.31, 1.0, 0.1), (x * 0.34, 0.74, 0.2)], radii=[(0, 0.17, 0.18), (0.5, 0.15, 0.16), (1, 0.115, 0.12)],
                  attr=A('leg', 'skin', SKIN, th), k=0.08, relief=sr)
        body.ellipsoid((x * 0.34, 0.74, 0.27), (0.07, 0.075, 0.045), A('knee', 'skin', SKIN, kn), k=0.03)
        body.limb([(x * 0.34, 0.74, 0.2), (x * 0.33, 0.45, 0.08), (x * 0.3, 0.2, -0.03)], radii=[(0, 0.11, 0.12), (0.4, 0.1, 0.115), (1, 0.07, 0.075)],
                  offset=[(0, 0, 0), (0.35, 0, -0.025), (1, 0, 0)], square=[(0, 2.4), (1, 2.5)], attr=A('leg', 'skin', SKIN, kn, an), k=0.06, relief=sr)
        body.ellipsoid((x * 0.3, 0.13, -0.09), (0.07, 0.075, 0.08), A('foot', 'skin', SKIN, an), k=0.05)
        body.limb([(x * 0.3, 0.18, -0.06), (x * 0.3, 0.1, 0.1), (x * 0.3, 0.07, 0.22)], radii=[(0, 0.075, 0.07), (0.5, 0.095, 0.055), (1, 0.105, 0.045)],
                  square=[(0, 2.8), (1, 3.0)], up=(0, 1, 0), attr=A('foot', 'skin', SKIN, an, to), k=0.05)
        for kk in (-1, 0, 1):
            t1 = V(x * (0.3 + kk * 0.06), 0.07, 0.22)
            t2 = V(x * (0.3 + kk * 0.072), 0.055, 0.3)
            t3 = V(x * (0.3 + kk * 0.08), 0.035, 0.36 - abs(kk) * 0.03)
            body.limb([t1, t2, t3], radii=[(0, 0.036, 0.03), (0.5, 0.03, 0.025), (1, 0.022, 0.018)], up=(0, 1, 0), attr=A('toe', 'skin', SKIN, to), k=0.02)
            for h in claw(t3 - V(0, 0, 0.01), t3 + V(0, -0.02, 0.04), 0.016, curl=(0, -0.008, 0)):
                gear.hull(h, A('claw', 'claw', hexcol('#231c15'), to), k=0.001)

    # ── The bramble hump: thorned vines grown through the hide over his back, knotted into a mantle. ──
    bram = A('bramble', 'bark', BARK, 'chest', 'spine')
    body.ellipsoid((0, 2.24, -0.3), (0.44, 0.3, 0.26), bram, k=0.08, relief=Relief(0.035, 5.0, 1.0, 'cracks', 5))
    rng = np.random.default_rng(3)
    vines = []
    for i in range(9):
        a0 = rng.random() * np.pi
        pts = []
        for t in np.linspace(0, 1, 6):
            ang = a0 + t * 2.4
            pts.append(V(np.cos(ang) * (0.5 - 0.14 * t), 2.1 + np.sin(ang) * 0.3 + t * 0.14, -0.3 - np.sin(t * np.pi) * 0.22 + rng.random() * 0.05))
        body.limb(pts, radii=[(0, 0.045, 0.045), (0.5, 0.06, 0.05), (1, 0.025, 0.025)], attr=bram, k=0.035, samples=6)
        vines.append(pts)
    for pts in vines:
        for j in (1, 3, 4):
            p = pts[j]
            out = p - V(0, 2.1, -0.05)
            out /= np.linalg.norm(out)
            for h in claw(p - out * 0.01, p + out * (0.2 + rng.random() * 0.14) + V(0, 0.07, 0), 0.034, curl=(0, 0.03, 0)):
                gear.hull(h, A('thorn', 'bark', BARK, 'chest'), k=0.002)

    # ── What he wears: a ragged hide over the loins, a hide mantle, bark pauldrons, a belt of skulls. ──
    armor.add(Drape((0, 1.44, 0.04), 0.42, (0.34, 0.31), (0.44, 0.41), folds=7, depth=0.15, sharp=0.6, thickness=0.014,
                    hem=0.07, tatter=6, seed=31, lean=(0, 0.05), relief=Relief(0.003, 25.0, 0.4, 'fbm', 11)),
              A('hide', 'leather', HIDE, 'hips', 'thighL', 'thighR'), k=0.0)
    armor.add(Drape((0, 2.33, 0.12), 0.34, (0.24, 0.2), (0.66, 0.46), folds=9, depth=0.18, sharp=0.7, thickness=0.02,
                    hem=0.08, tatter=5, seed=17, opening=1.6, lean=(0, -0.06), relief=Relief(0.012, 12.0, 0.6, 'cells', 13)),
              A('fur', 'fur', FUR, 'chest', 'neck', 'shoulderL', 'shoulderR'), k=0.0)
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        c = V(x * 0.56, 2.2, 0.08)
        pa = A('pauldron', 'bark', hexcol('#3d3226'), f'shoulder{s}', 'chest')
        armor.add(Shell(Ellipsoid(c, (0.22, 0.14, 0.21), relief=Relief(0.01, 9.0, 0.4, 'cracks', 7)), 0.03), pa, k=0.0)
        armor.sub(Region(c - V(0, 0.02, 0), (0, -1, 0), Ellipsoid(c, (0.3, 0.2, 0.3))), k=0.006)
        for k in range(2):
            armor.add(Torus(c + V(0, -0.01 - k * 0.04, 0), (x * 0.3, 1, 0), 0.19 - k * 0.02, 0.012), A('rope', 'rope', ROPE, f'shoulder{s}'), k=0.002)
    belt = []
    for i in range(48):
        a = i / 47 * 2 * np.pi
        belt.append(V(np.sin(a) * 0.345, 1.47 + np.cos(a) * 0.015, 0.04 + np.cos(a) * 0.32))
    armor.add(Limb(belt, radii=[(0, 0.045, 0.012), (1, 0.045, 0.012)], up=(0, 1, 0), samples=2), A('belt', 'leather', hexcol('#3b2a1c'), 'hips', 'spine'), k=0.002)
    bone = A('bone', 'bone', BONE, 'hips')
    for i, ang in enumerate((-0.5, 0.0, 0.5)):
        sk = V(np.sin(ang) * 0.36, 1.38 - abs(ang) * 0.04, 0.04 + np.cos(ang) * 0.34)
        armor.ellipsoid(sk, (0.05, 0.045, 0.055), bone, k=0.0)
        armor.limb([sk + V(0, -0.02, 0.025), sk + V(0, -0.035, 0.085)], radii=[(0, 0.032, 0.026), (1, 0.017, 0.014)], attr=bone, k=0.015)
        for x in (1, -1):
            armor.sub(Ellipsoid(sk + V(x * 0.02, 0.006, 0.046), (0.015, 0.014, 0.016)), k=0.004)
    # The crown of thorns around his skull, and the one stolen light set in it.
    ring = []
    for i in range(30):
        a = i / 29 * 2 * np.pi
        ring.append(V(np.sin(a) * 0.17, 2.56 + np.sin(a * 3) * 0.012, 0.44 + np.cos(a) * 0.17))
    armor.add(Limb(ring, radii=[(0, 0.018, 0.018), (1, 0.018, 0.018)], samples=2), A('crown', 'bark', BARK, 'head'), k=0.004)
    for i in range(9):
        a = i / 9 * 2 * np.pi + 0.2
        p = V(np.sin(a) * 0.17, 2.57, 0.44 + np.cos(a) * 0.17)
        for h in claw(p, p + V(np.sin(a) * 0.05, 0.12 + (i % 2) * 0.05, np.cos(a) * 0.05), 0.015, curl=(0, 0, 0)):
            gear.hull(h, A('thorn', 'bark', BARK, 'head'), k=0.001)
    gear.ellipsoid((0, 2.6, 0.62), (0.026, 0.03, 0.02), A('stolen', 'glow', hexcol('#ffc860'), 'head'), k=0.0)

    # ── The club: a thorned root gripped in his right fist, a caged lantern bound near its head. ──
    club = A('club', 'bark', hexcol('#3a2a1d'), 'handR')
    a0, a1 = V(-0.85, 1.32, 0.38), V(-0.98, 0.32, 1.45)
    armor.limb([a0, (a0 + a1) / 2 + V(-0.03, 0.02, 0), a1], radii=[(0, 0.04, 0.04), (0.6, 0.06, 0.06), (1, 0.1, 0.1)], attr=club, k=0.0,
               relief=Relief(0.01, 12.0, 0.3, 'cracks', 19))
    armor.ellipsoid(a1 + V(-0.01, -0.03, 0.06), (0.17, 0.15, 0.18), club, k=0.08, relief=Relief(0.025, 7.0, 1.0, 'cells', 21))
    for i in range(10):
        u = 0.55 + i / 9 * 0.45
        c = a0 + (a1 - a0) * u
        ang = i * 2.4
        out = V(np.cos(ang), np.sin(ang) * 0.6, 0.3); out /= np.linalg.norm(out)
        for h in claw(c, c + out * (0.12 + 0.04 * (i % 3)), 0.02):
            gear.hull(h, A('thorn', 'bark', BARK, 'handR'), k=0.001)
    lc = a0 + (a1 - a0) * 0.72 + V(-0.07, 0.04, 0)
    iron = A('iron', 'metal', hexcol('#3b3a36'), 'handR')
    gear.box(lc + V(0, 0.07, 0), (0.04, 0.008, 0.04), iron, k=0.002, round_=0.004)
    gear.box(lc - V(0, 0.07, 0), (0.045, 0.008, 0.045), iron, k=0.002, round_=0.004)
    for bx, bz in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        gear.limb([lc + V(bx * 0.035, 0.066, bz * 0.035), lc + V(bx * 0.038, -0.066, bz * 0.038)], radii=[(0, 0.005, 0.005), (1, 0.005, 0.005)], attr=iron, k=0.002)
    gear.ellipsoid(lc, (0.03, 0.055, 0.03), A('captive', 'glow', hexcol('#e8a548'), 'handR'), k=0.0)
    for k in range(3):
        gear.add(Torus(lc + V(0.07, -0.02 + k * 0.025, 0), (0.3, 0.2, 1.0), 0.07, 0.006), A('rope', 'rope', ROPE, 'handR'), k=0.002)

    return AssetSpec(
        'gorrik',
        [Part(body, cell=0.0042, faces=30000, topology='tri', detail_zones=('head', 'jaw', 'nose', 'lip', 'lid', 'eyeL', 'eyeR', 'ear', 'hand', 'finger')),
         Part(armor, cell=0.0048, faces=12000, topology='tri'),
         Part(gear, cell=0.0022, faces=6000, topology='tri')],
        paint, texture=2048, bake_size=2048, height=3.0, centre=1.5, skeleton=SKELETON, extrusion=0.014,
        closeups=[('face', 20, 2.42, 0.9, 85, 0.0, 0.6), ('face-side', 75, 2.42, 1.0, 85, 0.0, 0.55),
                  ('club', 30, 0.9, 1.8, 60, -0.9, 0.9), ('hump', 160, 2.15, 1.6, 60, 0.0, -0.2)],
    )


def paint(m: Surface) -> Painted:
    P, N, zone = m.V, m.N, m.zone
    col = srgb_to_linear(m.color)
    n = len(P)

    def z(*names):
        return np.isin(zone, names)

    skin = z('pelvis', 'belly', 'chest', 'back', 'neck', 'head', 'jaw', 'lip', 'nose', 'lid', 'ear', 'arm', 'elbow', 'hand', 'finger', 'leg', 'knee', 'foot', 'toe')
    s = col * (0.8 + 0.35 * noise(P, 5.0, 3, 1)[:, None]) * (0.94 + 0.12 * noise(P, 16.0, 2, 4)[:, None])
    s = mix(s, s * np.array([1.25, 1.2, 0.95]), np.clip(N[:, 2] * 0.5 - N[:, 1] * 0.4, 0, 1) * z('belly', 'chest', 'jaw') * 0.5)
    s = mix(s, s * np.array([1.25, 0.92, 0.82]), z('nose', 'ear', 'lip', 'knee', 'elbow', 'finger', 'toe') * 0.32)
    crev = np.clip(-m.curv * 0.03, 0, 1)
    crest = np.clip(m.curv * 0.02, 0, 1)
    s = hue_shift_shadow(s, crev * 0.55 + (1 - m.ao) * 0.6, toward=(0.15, 0.12, 0.12))
    s = mix(s, s * 1.3 + 0.01, crest * 0.45)
    # Old scars: pale, raised lines (the creased ridge across the right eye shows as a crest).
    scars = cell_spots(P, 9.0, 0.83, 41) * z('chest', 'arm', 'back', 'belly')
    s = mix(s, srgb_to_linear(np.array([0.55, 0.42, 0.36])), scars * 0.55)
    # War paint: three ochre stripes across the face under the eyes, two down the chest.
    # War paint, smeared on by hand: two strokes down each cheek from under the eye, three claw marks
    # raked across the chest; broken where the paint ran thin.
    ax = np.abs(P[:, 0])
    cheek = np.zeros(len(P))
    for off in (0.0, 0.035):
        d = np.abs((P[:, 1] - 2.43) + (ax - 0.08 - off) * 1.2)
        cheek = np.maximum(cheek, (d < 0.011) & (P[:, 1] < 2.45) & (P[:, 1] > 2.31) & (ax > 0.06) & (P[:, 2] > 0.5))
    rake = np.zeros(len(P))
    for off in (-0.08, 0.0, 0.08):
        d = np.abs((P[:, 1] - 1.95) - (P[:, 0] - off) * 0.9)
        rake = np.maximum(rake, (d < 0.022) & (P[:, 2] > 0.25) & (P[:, 1] > 1.75) & (P[:, 1] < 2.12))
    wear = smoothstep(0.3, 0.6, noise(P, 26, 3, 9))
    paint_mask = (cheek * z('head', 'jaw', 'nose') + rake * z('chest', 'belly')) * wear
    s = mix(s, srgb_to_linear(np.array([0.48, 0.24, 0.12])), np.clip(paint_mask, 0, 0.8))
    grime = (1 - smoothstep(0.1, 0.6, P[:, 1])) * 0.7 + z('hand', 'finger') * 0.3
    s = mix(s, srgb_to_linear(np.array([0.18, 0.14, 0.09])), np.clip(grime * 0.8, 0, 0.75))
    col = np.where(skin[:, None], s, col)
    # Eyes: the left a small fierce amber; the right milky and blind.
    emit = np.zeros((n, 3))
    for x, e in ((0.07, 'eyeL'), (-0.07, 'eyeR')):
        sel = zone == e
        if not sel.any():
            continue
        q = P[sel] - np.array([x, 2.46, 0.618])
        rr = np.sqrt((q[:, 0] / 0.022) ** 2 + (q[:, 1] / 0.017) ** 2)
        front = q[:, 2] > 0.004
        if x > 0:
            iris = (rr < 0.6) & front
            pupil = (rr < 0.22) & front
            c = np.tile(srgb_to_linear(np.array([0.78, 0.7, 0.52])), (sel.sum(), 1))
            c = np.where(iris[:, None], srgb_to_linear(np.array([0.85, 0.42, 0.08])), c)
            c = np.where(pupil[:, None], 0.01, c)
            em = np.zeros((sel.sum(), 3)); em[iris & ~pupil] = 0.6
            emit[sel] = em
        else:
            c = np.tile(srgb_to_linear(np.array([0.72, 0.74, 0.7])), (sel.sum(), 1))
            c = mix(c, srgb_to_linear(np.array([0.86, 0.88, 0.86])), (rr < 0.55) & front)
        col[sel] = c
    # Bark and thorns: dark, drying paler at the tips and ridges.
    bark = z('bramble', 'thorn', 'crown', 'club', 'pauldron')
    b = col * (0.8 + 0.4 * noise(P, 14, 3, 5)[:, None])
    b = mix(b, b * 1.7 + 0.03, np.clip(m.curv * 0.02, 0, 1) * 0.6)
    b = hue_shift_shadow(b, (1 - m.ao) * 0.7)
    col = np.where(bark[:, None], b, col)
    hide = z('hide', 'wrap', 'belt')
    h = col * (0.82 + 0.3 * noise(P, 9, 3, 7)[:, None])
    h = mix(h, srgb_to_linear(np.array([0.16, 0.11, 0.07])), smoothstep(0.55, 0.8, noise(P, 4, 3, 13)) * 0.5)
    col = np.where(hide[:, None], hue_shift_shadow(h, (1 - m.ao) * 0.7), col)
    fur = z('fur')
    f = col * (0.7 + 0.6 * noise(P, 18, 3, 15)[:, None])
    col = np.where(fur[:, None], hue_shift_shadow(f, (1 - m.ao) * 0.8), col)
    bonez = z('bone')
    col = np.where(bonez[:, None], mix(col, srgb_to_linear(np.array([0.36, 0.28, 0.18])), (1 - m.ao) * 0.9), col)
    ropez = z('rope')
    col = np.where(ropez[:, None], hue_shift_shadow(col * (0.85 + 0.25 * noise(P, 40, 2, 21)[:, None]), (1 - m.ao) * 0.8), col)
    ironz = z('iron')
    col = np.where(ironz[:, None], mix(col * 0.6, col * 1.6, np.clip(0.5 + m.curv * 0.02, 0, 1)), col)
    emit[z('stolen')] = srgb_to_linear(np.array([1.0, 0.75, 0.32]))
    emit[z('captive')] = srgb_to_linear(np.array([0.7, 0.42, 0.14]))
    rough, metal, fx = response(m.mat)
    fx[z('ear'), 1] = 0.45
    return Painted(albedo=np.clip(col, 0, 1), emit=emit, fx=fx)
