"""
THE BRAMBLE GOBLIN
==================
A wiry woodland scavenger, mischievous and wary (see docs/ART_BIBLE.md). A compact question mark:
head thrust ahead of a short ribcage and pot belly, arms long enough that the knuckles pass the knees,
huge swept-back ears, long gripping feet. Bramble grows out of it — thorns at the elbows and down the
spine, heavier on the right arm. It wears what it scavenged: a torn sacking kilt and cowl with the
hood pushed back, a rope belt hung with stolen trinkets (a dead lantern, a tiny skull, a spoon), rag
wraps on its forearms and shins, brass rings in its torn left ear.

The skeleton keeps the joint names and rest positions the game's goblin animation already drives.
"""
import numpy as np

from arcane_art.paint import (cell_spots, hue_shift_shadow, mix, noise, smoothstep, srgb_to_linear)
from arcane_art.pipeline import AssetSpec, Painted, Part, Surface
from arcane_art.rig import mirror
from arcane_art.sdf import (Attr, Drape, Ellipsoid, Limb, Relief, Sculpt, Torus, claw, hexcol, rotation, wrap_path)

SKELETON = mirror([
    ('root', None, (0, 0, 0), (0, 0.1, 0)),
    ('hips', 'root', (0, 0.82, 0), None),
    ('spine', 'hips', (0, 0.98, 0.02), None),
    ('chest', 'spine', (0, 1.18, 0.1), None),
    ('neck', 'chest', (0, 1.34, 0.2), None),
    ('head', 'neck', (0, 1.44, 0.26), (0, 1.62, 0.34)),
    ('jaw', 'head', (0, 1.42, 0.32), (0, 1.37, 0.46)),
    ('eyes', 'head', (0, 1.525, 0.45), (0, 1.525, 0.5)),
    ('earL', 'head', (0.15, 1.56, 0.25), None),
    ('ear2L', 'earL', (0.37, 1.62, 0.15), (0.6, 1.67, 0.03)),
    ('shoulderL', 'chest', (0.24, 1.28, 0.1), None),
    ('elbowL', 'shoulderL', (0.36, 1.02, 0.14), None),
    ('wristL', 'elbowL', (0.42, 0.76, 0.22), None),
    ('handL', 'wristL', (0.44, 0.67, 0.26), (0.45, 0.55, 0.31)),
    ('thighL', 'hips', (0.13, 0.8, 0), None),
    ('kneeL', 'thighL', (0.15, 0.46, 0.1), None),
    ('ankleL', 'kneeL', (0.15, 0.12, -0.04), None),
    ('toeL', 'ankleL', (0.15, 0.04, 0.12), (0.15, 0.03, 0.22)),
])

SKIN = hexcol('#6f7652')
SKIN_WARM = hexcol('#8d6a4e')
THORN = hexcol('#2f241a')
CLAW = hexcol('#2a2219')
SACK = hexcol('#6e5c41')
ROPE = hexcol('#8b7657')
WRAP = hexcol('#857a68')
BRASS = hexcol('#a1843f')
BONE = hexcol('#d4c9ad')


def A(zone: str, mat: str = 'skin', color=SKIN, *bones: str) -> Attr:
    return Attr(mat, color, zone, tuple(bones))


def V(*p):
    return np.asarray(p, float)


def spec() -> AssetSpec:
    body = Sculpt('body')
    gear = Sculpt('gear')
    skin_relief = Relief(0.0016, 55.0, 1.0, 'fbm', 3)

    # ── Torso: a short ribcage tipped forward over a sagging belly, a hunched upper back. ──
    body.ellipsoid((0, 0.86, 0.01), (0.135, 0.085, 0.105), A('pelvis', 'skin', SKIN, 'hips'), k=0.0, relief=skin_relief)
    body.ellipsoid((0, 0.965, 0.095), (0.145, 0.125, 0.125), A('belly', 'skin', SKIN, 'spine', 'hips'), k=0.05, relief=skin_relief)
    body.limb([(0, 0.98, 0.04), (0, 1.15, 0.05), (0, 1.29, 0.11)],
              radii=[(0, 0.13, 0.11), (0.35, 0.165, 0.135), (0.75, 0.158, 0.124), (1, 0.11, 0.085)],
              square=[(0, 2.2), (1, 2.4)], attr=A('chest', 'skin', SKIN, 'chest', 'spine'), k=0.05, relief=skin_relief)
    body.ellipsoid((0, 1.22, -0.03), (0.15, 0.12, 0.1), A('back', 'skin', SKIN, 'chest'), k=0.05, relief=skin_relief)
    body.limb([(0, 1.28, 0.176), (0, 1.11, 0.204)], radii=[(0, 0.012, 0.008), (1, 0.01, 0.007)], attr=A('chest', 'skin', SKIN, 'chest'), k=0.02)
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        body.ellipsoid((x * 0.095, 1.215, -0.085), (0.055, 0.07, 0.022), A('back', 'skin', SKIN, 'chest'), k=0.03, rot=rotation(0, x * 0.35, 0))
        body.ellipsoid((x * 0.07, 1.215, 0.165), (0.07, 0.042, 0.03), A('chest', 'skin', SKIN, 'chest'), k=0.035, rot=rotation(0.3, 0, 0))
        body.limb([(x * 0.025, 1.29, 0.18), (x * 0.2, 1.315, 0.1)], radii=[(0, 0.013, 0.011), (1, 0.012, 0.01)], square=[(0, 2.5), (1, 2.5)],
                  attr=A('chest', 'skin', SKIN, 'chest'), k=0.015)
        body.limb([(x * 0.03, 1.36, 0.08), (x * 0.21, 1.3, 0.07)], radii=[(0, 0.05, 0.035), (1, 0.03, 0.025)],
                  attr=A('back', 'skin', SKIN, 'chest', 'neck'), k=0.04)
        # Starved ribs along the flanks.
        for k in range(4):
            y = 1.075 + k * 0.045
            body.crease([(x * 0.1, y + 0.01, 0.17), (x * 0.152, y - 0.005, 0.09), (x * 0.168, y - 0.015, -0.005)], 0.014, 0.0055)
    body.sub(Ellipsoid((0, 0.955, 0.22), (0.007, 0.011, 0.012)), k=0.006)
    body.crease([(0.11, 1.045, 0.19), (0, 1.035, 0.225), (-0.11, 1.045, 0.19)], 0.016, 0.004)

    # ── Neck: a sinewy column thrust forward, tendons standing out, an apple at the throat. ──
    body.limb([(0, 1.26, 0.09), (0, 1.37, 0.19), (0, 1.47, 0.29)], radii=[(0, 0.068, 0.062), (0.5, 0.057, 0.051), (1, 0.055, 0.05)],
              attr=A('neck', 'skin', SKIN, 'chest', 'neck', 'head'), k=0.04, relief=skin_relief)
    for x in (1, -1):
        body.limb([(x * 0.06, 1.47, 0.27), (x * 0.022, 1.29, 0.17)], radii=[(0, 0.012, 0.01), (1, 0.011, 0.009)], attr=A('neck', 'skin', SKIN, 'neck', 'chest'), k=0.018)
    body.ellipsoid((0, 1.375, 0.268), (0.013, 0.017, 0.012), A('neck', 'skin', SKIN, 'neck'), k=0.012)

    # ── Head: heavy brow cocked higher on the right, sunk eyes, hooked warty nose, lipped mouth. ──
    H = A('head', 'skin', SKIN, 'head')
    J = A('jaw', 'skin', SKIN, 'jaw')
    face_relief = Relief(0.0011, 80.0, 1.0, 'fbm', 7)
    body.ellipsoid((0, 1.537, 0.298), (0.118, 0.108, 0.13), H, k=0.04, relief=face_relief)
    body.ellipsoid((0, 1.512, 0.198), (0.098, 0.092, 0.078), H, k=0.045)
    body.ellipsoid((0, 1.572, 0.382), (0.096, 0.056, 0.068), H, k=0.045)
    body.limb([(0.118, 1.575, 0.385), (0.06, 1.568, 0.448), (0, 1.559, 0.459), (-0.06, 1.576, 0.449), (-0.118, 1.59, 0.386)],
              radii=[(0, 0.014, 0.016), (0.25, 0.017, 0.022), (0.5, 0.016, 0.02), (0.75, 0.017, 0.022), (1, 0.014, 0.016)],
              square=[(0, 2.6), (1, 2.6)], attr=H, k=0.022)
    for x in (1, -1):
        body.sub(Ellipsoid((x * 0.115, 1.54, 0.38), (0.028, 0.038, 0.038)), k=0.03)
        body.limb([(x * 0.055, 1.494, 0.444), (x * 0.118, 1.5, 0.37)], radii=[(0, 0.014, 0.018), (1, 0.011, 0.013)], square=[(0, 2.5), (1, 2.5)], attr=H, k=0.024)
        body.ellipsoid((x * 0.064, 1.503, 0.451), (0.03, 0.011, 0.015), H, k=0.012)
        body.sub(Ellipsoid((x * 0.09, 1.455, 0.428), (0.034, 0.028, 0.028)), k=0.03)
        body.sub(Ellipsoid((x * 0.065, 1.527, 0.449), (0.035, 0.025, 0.034)), k=0.012)
    body.ellipsoid((0, 1.455, 0.44), (0.074, 0.04, 0.064), H, k=0.034)
    # Nose: a narrow boxy bridge, a hump, wings flaring at the base, a heavy drooping bulb.
    nose = A('nose', 'skin', SKIN, 'head')
    body.limb([(0, 1.553, 0.465), (0, 1.522, 0.51), (0.003, 1.488, 0.56), (0.007, 1.462, 0.592)],
              radii=[(0, 0.012, 0.014), (0.4, 0.015, 0.02), (0.8, 0.019, 0.019), (1, 0.014, 0.014)],
              offset=[(0, 0, 0), (0.4, 0, 0.004), (1, 0, 0)], square=[(0, 3.2), (0.5, 2.8), (1, 2.2)], attr=nose, k=0.016)
    body.ellipsoid((0.008, 1.452, 0.598), (0.02, 0.018, 0.019), nose, k=0.012)
    for x in (1, -1):
        body.ellipsoid((x * 0.019 + 0.004, 1.452, 0.58), (0.016, 0.012, 0.017), nose, k=0.008, rot=rotation(0, x * 0.4, 0))
        body.crease([(x * 0.03 + 0.004, 1.465, 0.574), (x * 0.036 + 0.004, 1.452, 0.58), (x * 0.03 + 0.004, 1.438, 0.588)], 0.005, 0.0024)
        body.sub(Ellipsoid((x * 0.012 + 0.007, 1.437, 0.592), (0.006, 0.004, 0.009)), k=0.003)
    for w, r in [((0.022, 1.5, 0.546), 0.0065), ((-0.014, 1.485, 0.565), 0.005), ((0.1, 1.468, 0.42), 0.006), ((-0.09, 1.585, 0.39), 0.007), ((0.05, 1.6, 0.36), 0.005)]:
        body.ellipsoid(w, (r, r * 0.8, r), A('wart', 'skin', SKIN, 'head'), k=0.004)
    # Mouth: upper lip, a long jaw with a jutting chin, lower lip, the slit between.
    body.limb([(0.068, 1.424, 0.438), (0, 1.428, 0.494), (-0.068, 1.424, 0.438)], radii=[(0, 0.0105, 0.011), (1, 0.0105, 0.011)], attr=A('lip', 'skin', SKIN, 'head'), k=0.014)
    body.limb([(0.088, 1.432, 0.33), (0.075, 1.405, 0.415), (0, 1.386, 0.462), (-0.075, 1.405, 0.415), (-0.088, 1.432, 0.33)],
              radii=[(0, 0.028, 0.03), (0.5, 0.03, 0.034), (1, 0.028, 0.03)], attr=J, k=0.03)
    body.ellipsoid((0, 1.41, 0.39), (0.07, 0.035, 0.07), J, k=0.03)
    body.ellipsoid((0, 1.381, 0.462), (0.03, 0.022, 0.024), J, k=0.02)
    body.limb([(0.06, 1.41, 0.442), (0, 1.407, 0.484), (-0.06, 1.41, 0.442)], radii=[(0, 0.01, 0.01), (1, 0.01, 0.01)], attr=A('lip', 'skin', SKIN, 'jaw'), k=0.012)
    body.sub(Limb([(0.071, 1.412, 0.44), (0, 1.418, 0.497), (-0.071, 1.412, 0.44)], radii=[(0, 0.0055, 0.006), (1, 0.0055, 0.006)]), k=0.006)
    # Forehead creases and the hooded fold over each eye.
    for k in range(3):
        body.crease([(-0.06, 1.592 + k * 0.014, 0.427 - k * 0.008), (0.06, 1.594 + k * 0.014, 0.427 - k * 0.008)], 0.006, 0.0025)
    # Eyes: wet eyeballs in the sockets, heavy upper lids, a thin lower lid.
    for x in (1, -1):
        e = 'eyeL' if x > 0 else 'eyeR'
        cx = x * 0.065
        body.ellipsoid((cx, 1.525, 0.452), (0.025, 0.019, 0.016), A(e, 'eye', hexcol('#d6c79a'), 'eyes', 'head'), k=0.002)
        body.limb([(cx - 0.029, 1.527, 0.451), (cx, 1.545, 0.468), (cx + 0.029, 1.53, 0.449)],
                  radii=[(0, 0.006, 0.007), (0.5, 0.0075, 0.0085), (1, 0.006, 0.007)], attr=A('lid', 'skin', SKIN, 'head'), k=0.004)
        body.limb([(cx - 0.026, 1.517, 0.452), (cx, 1.507, 0.462), (cx + 0.026, 1.518, 0.45)],
                  radii=[(0, 0.0035, 0.004), (1, 0.0035, 0.004)], attr=A('lid', 'skin', SKIN, 'head'), k=0.003)
        body.crease([(cx - 0.03, 1.548, 0.448), (cx, 1.556, 0.462), (cx + 0.03, 1.55, 0.446)], 0.005, 0.0022)
    # Ears: long leaves of skin thick with cartilage at the root, a rolled rim along the top, a ridge
    # and a bowl inside, thin enough at the edge for light to come through; a notch torn from the left.
    for x in (1, -1):
        s_ = 'L' if x > 0 else 'R'
        ear = A('ear', 'skin', SKIN, f'ear{s_}', f'ear2{s_}', 'head')
        e = Limb([(x * 0.12, 1.55, 0.27), (x * 0.3, 1.6, 0.19), (x * 0.46, 1.64, 0.1), (x * 0.6, 1.668, 0.025)],
                 radii=[(0, 0.05, 0.011), (0.3, 0.078, 0.0075), (0.7, 0.046, 0.006), (1, 0.006, 0.004)],
                 square=[(0, 2.2), (1, 2.0)], up=(x * 0.1, 0.4, 1.0))
        body.add(e, ear, k=0.02)
        # The rim: rolled along the upper edge, from root to tip.
        rim = []
        for i in range(0, len(e.S), 3):
            u = e.cum[i] / e.total
            ru = np.interp(u, [0, 0.3, 0.7, 1.0], [0.05, 0.078, 0.046, 0.006])
            side = e.B[i] if (e.B[i] @ np.array([0, 1.0, 0])) > 0 else -e.B[i]
            rim.append(e.S[i] + side * ru * 0.9 + e.N[i] * 0.003)
        body.limb(rim, radii=[(0, 0.007, 0.006), (0.7, 0.005, 0.0045), (1, 0.002, 0.002)], attr=ear, k=0.008)
        body.crease([(x * 0.16, 1.56, 0.272), (x * 0.3, 1.598, 0.208), (x * 0.43, 1.632, 0.128)], 0.012, -0.0025)
        body.crease([(x * 0.15, 1.575, 0.27), (x * 0.28, 1.614, 0.2), (x * 0.4, 1.645, 0.13)], 0.009, 0.002)
    body.sub(Ellipsoid((0.4, 1.598, 0.105), (0.03, 0.022, 0.03)), k=0.004)
    body.sub(Ellipsoid((0.52, 1.66, 0.04), (0.018, 0.016, 0.02)), k=0.003)

    # ── Arms: wiry, knobbed at the elbow, a ropey forearm narrowing to a wedge at the wrist. ──
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        sh, el, wr, hd = f'shoulder{s}', f'elbow{s}', f'wrist{s}', f'hand{s}'
        body.ellipsoid((x * 0.232, 1.272, 0.1), (0.056, 0.066, 0.06), A('arm', 'skin', SKIN, sh, 'chest'), k=0.035, relief=skin_relief)
        body.limb([(x * 0.235, 1.285, 0.1), (x * 0.3, 1.15, 0.125), (x * 0.355, 1.03, 0.14)],
                  radii=[(0, 0.045, 0.048), (0.4, 0.04, 0.045), (0.85, 0.03, 0.032), (1, 0.028, 0.03)],
                  offset=[(0, 0, 0), (0.45, 0, 0.008), (1, 0, 0)], square=[(0, 2.2), (1, 2.3)],
                  attr=A('arm', 'skin', SKIN, sh), k=0.03, relief=skin_relief)
        body.ellipsoid((x * 0.298, 1.165, 0.095), (0.03, 0.06, 0.028), A('arm', 'skin', SKIN, sh), k=0.025, rot=rotation(0, 0, x * 0.45))
        body.ellipsoid((x * 0.359, 1.024, 0.118), (0.024, 0.026, 0.022), A('elbow', 'skin', SKIN, el), k=0.01)
        body.limb([(x * 0.36, 1.02, 0.14), (x * 0.39, 0.9, 0.18), (x * 0.425, 0.775, 0.218)],
                  radii=[(0, 0.036, 0.032), (0.25, 0.037, 0.031), (0.7, 0.026, 0.02), (1, 0.022, 0.016)],
                  square=[(0, 2.2), (1, 2.9)], offset=[(0, 0, 0), (0.25, x * 0.006, 0), (1, 0, 0)],
                  attr=A('arm', 'skin', SKIN, el, wr), k=0.025, relief=skin_relief)
        body.ellipsoid((x * 0.437, 0.775, 0.205), (0.012, 0.012, 0.012), A('arm', 'skin', SKIN, wr), k=0.01)
        body.crease([(x * 0.345, 1.035, 0.165), (x * 0.36, 1.028, 0.168), (x * 0.375, 1.02, 0.166)], 0.008, 0.0025)
        # The hand: a broad palm, a padded thumb, long knuckled fingers curled toward the palm.
        D = V(0.077 * x, -0.92, 0.38); D /= np.linalg.norm(D)
        N = V(-x, 0, 0)
        Ac = V(0, 0.38, 0.92); Ac -= D * (Ac @ D); Ac /= np.linalg.norm(Ac)
        w0 = V(x * 0.428, 0.765, 0.222)
        pe = w0 + D * 0.1
        body.limb([w0, w0 + D * 0.05, pe], radii=[(0, 0.026, 0.013), (0.5, 0.038, 0.016), (1, 0.041, 0.014)], square=[(0, 3.0), (1, 3.2)],
                  up=N, attr=A('hand', 'skin', SKIN, hd, wr), k=0.012, relief=skin_relief)
        body.ellipsoid(w0 + D * 0.035 + Ac * 0.02 + N * 0.008, (0.019, 0.026, 0.014), A('hand', 'skin', SKIN, hd), k=0.012)
        for i, (off, sc) in enumerate([(0.03, 1.0), (0.0102, 1.08), (-0.0102, 1.0), (-0.029, 0.8)]):
            sc *= 1.22
            k0 = pe + Ac * off - D * 0.004
            p1 = k0 + D * 0.042 * sc + N * 0.004
            p2 = p1 + D * 0.03 * sc + N * 0.012 * sc
            p3 = p2 + D * 0.02 * sc + N * 0.016 * sc
            body.limb([k0, p1, p2, p3],
                      radii=[(0, 0.0128, 0.011), (0.2, 0.0098, 0.009), (0.44, 0.011, 0.0099), (0.6, 0.0086, 0.008),
                             (0.77, 0.0094, 0.0086), (0.9, 0.0075, 0.0069), (1, 0.0064, 0.006)],
                      square=[(0, 2.6), (1, 2.3)], up=N, attr=A('finger', 'skin', SKIN, hd), k=0.006)
            tipd = (p3 - p2) / np.linalg.norm(p3 - p2)
            for h in claw(p3 - tipd * 0.004, p3 + tipd * 0.014 + N * 0.016, 0.0062, curl=N * 0.003):
                gear.hull(h, A('claw', 'claw', CLAW, hd), k=0.0006)
        t0 = w0 + D * 0.035 + Ac * 0.033 + N * 0.011
        t1 = t0 + (Ac * 0.55 + D * 0.6 + N * 0.35) * 0.039
        t2 = t1 + (Ac * 0.2 + D * 0.7 + N * 0.6) * 0.029
        body.limb([t0, t1, t2], radii=[(0, 0.015, 0.013), (0.5, 0.0108, 0.0096), (0.65, 0.0112, 0.01), (1, 0.0076, 0.007)],
                  up=N, attr=A('finger', 'skin', SKIN, hd), k=0.008)
        td = (t2 - t1) / np.linalg.norm(t2 - t1)
        for h in claw(t2 - td * 0.004, t2 + td * 0.013 + N * 0.014, 0.007, curl=N * 0.003):
            gear.hull(h, A('claw', 'claw', CLAW, hd), k=0.0006)
        # Bramble spurs at the elbow, more of them on the right arm.
        spurs = [((x * 0.362, 1.03, 0.108), (x * 0.38, 1.075, 0.05))]
        if x < 0:
            spurs += [((-0.39, 0.95, 0.15), (-0.43, 0.97, 0.115)), ((-0.405, 0.88, 0.17), (-0.445, 0.885, 0.145)), ((-0.35, 1.08, 0.12), (-0.37, 1.12, 0.07))]
        for root, tip in spurs:
            for h in claw(root, tip, 0.008, curl=(0, 0.008, 0)):
                gear.hull(h, A('thorn', 'bark', THORN, el), k=0.001)

    # ── Legs: lean thighs, bony knees, flat-fronted shins over hard calves, long clawed feet. ──
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        th, kn, an, to = f'thigh{s}', f'knee{s}', f'ankle{s}', f'toe{s}'
        body.ellipsoid((x * 0.082, 0.84, -0.065), (0.066, 0.068, 0.056), A('leg', 'skin', SKIN, 'hips', th), k=0.04, relief=skin_relief)
        body.limb([(x * 0.125, 0.835, 0.0), (x * 0.14, 0.65, 0.06), (x * 0.15, 0.48, 0.1)],
                  radii=[(0, 0.068, 0.07), (0.35, 0.06, 0.064), (0.85, 0.042, 0.045), (1, 0.04, 0.042)],
                  offset=[(0, 0, 0), (0.4, 0, 0.01), (1, 0, 0)], attr=A('leg', 'skin', SKIN, th), k=0.04, relief=skin_relief)
        body.ellipsoid((x * 0.15, 0.468, 0.128), (0.026, 0.03, 0.016), A('knee', 'skin', SKIN, kn), k=0.012)
        body.limb([(x * 0.15, 0.465, 0.1), (x * 0.15, 0.3, 0.04), (x * 0.15, 0.13, -0.035)],
                  radii=[(0, 0.038, 0.04), (0.3, 0.036, 0.042), (0.8, 0.024, 0.026), (1, 0.022, 0.024)],
                  offset=[(0, 0, 0), (0.3, 0, -0.012), (1, 0, -0.004)], square=[(0, 2.4), (1, 2.6)],
                  attr=A('leg', 'skin', SKIN, kn, an), k=0.03, relief=skin_relief)
        body.carve_plane((x * 0.15, 0.3, 0.071), (0, 0.15, 1.0), Ellipsoid((x * 0.15, 0.3, 0.068), (0.04, 0.13, 0.03)), k=0.004)
        body.ellipsoid((x * 0.172, 0.12, -0.04), (0.012, 0.012, 0.012), A('leg', 'skin', SKIN, an), k=0.008)
        body.ellipsoid((x * 0.128, 0.128, -0.04), (0.011, 0.011, 0.011), A('leg', 'skin', SKIN, an), k=0.008)
        body.ellipsoid((x * 0.15, 0.062, -0.07), (0.024, 0.026, 0.03), A('foot', 'skin', SKIN, an), k=0.02)
        body.limb([(x * 0.15, 0.078, -0.05), (x * 0.15, 0.05, 0.04), (x * 0.15, 0.035, 0.115)],
                  radii=[(0, 0.028, 0.026), (0.5, 0.034, 0.02), (1, 0.04, 0.016)], square=[(0, 2.8), (1, 3.0)], up=(0, 1, 0),
                  attr=A('foot', 'skin', SKIN, an, to), k=0.02)
        for kk in (-1, 0, 1):
            t1 = V(x * (0.15 + kk * 0.024), 0.032, 0.115)
            t2 = V(x * (0.15 + kk * 0.03), 0.026, 0.165)
            t3 = V(x * (0.15 + kk * 0.034), 0.016, 0.2 - abs(kk) * 0.016)
            body.limb([t1, t2, t3], radii=[(0, 0.014, 0.011), (0.45, 0.0105, 0.0085), (0.55, 0.011, 0.009), (1, 0.0075, 0.006)],
                      square=[(0, 2.5), (1, 2.3)], up=(0, 1, 0), attr=A('toe', 'skin', SKIN, to), k=0.008)
            for h in claw(t3 - V(0, 0, 0.004), t3 + V(0, -0.008, 0.016), 0.0058, curl=(0, -0.003, 0)):
                gear.hull(h, A('claw', 'claw', CLAW, to), k=0.0006)

    # ── Spine knobs, each with a thorn growing out of it. ──
    for i in range(7):
        y = 1.36 - i * 0.075
        hit = body.cast((0, y, -0.6), (0, 0, 1), 0.9)
        if hit is None:
            continue
        p, n = hit
        body.ellipsoid(p + n * 0.003, (0.015, 0.013, 0.013), A('back', 'skin', SKIN, 'chest' if i < 4 else 'spine'), k=0.008)
        if i < 6:
            tip = p + n * (0.07 + (i % 2) * 0.025) + V(0, 0.035, 0)
            for h in claw(p - n * 0.004, tip, 0.012, curl=(0, 0.01, 0)):
                gear.hull(h, A('thorn', 'bark', THORN, 'chest' if i < 4 else 'spine'), k=0.001)

    # ── What it wears. ──
    sack = Relief(0.0012, 140.0, 0.35, 'fbm', 13)
    body.add(Drape((0, 0.905, 0.045), 0.3, (0.142, 0.162), (0.235, 0.235), folds=9, depth=0.14, sharp=0.6, thickness=0.007,
                   hem=0.05, tatter=7, seed=21, lean=(0, 0.02), relief=sack),
             A('kilt', 'cloth', SACK, 'hips', 'thighL', 'thighR'), k=0.0)
    body.add(Drape((0, 1.375, 0.115), 0.13, (0.085, 0.078), (0.205, 0.18), folds=7, depth=0.16, sharp=0.65, thickness=0.007,
                   hem=0.028, tatter=6, seed=8, lean=(0, -0.06), relief=sack),
             A('cowl', 'cloth', SACK, 'chest', 'neck', 'shoulderL', 'shoulderR'), k=0.0)
    # The hood, pushed back: a bunched roll of sacking lying across the shoulders behind the neck.
    body.limb([(0.12, 1.33, 0.02), (0.06, 1.37, -0.06), (0, 1.38, -0.085), (-0.06, 1.37, -0.06), (-0.12, 1.33, 0.02)],
              radii=[(0, 0.022, 0.018), (0.5, 0.045, 0.034), (1, 0.022, 0.018)], square=[(0, 2.0), (1, 2.0)],
              attr=A('cowl', 'cloth', SACK, 'chest', 'neck'), k=0.012, relief=Relief(0.004, 30.0, 0.5, 'fbm', 29))
    # Rope belt, knotted at the front, its ends hanging.
    path = []
    for i in range(40):
        a = (i / 39) * 2 * np.pi * 0.96 + 0.13
        path.append(V(np.sin(a) * 0.152, 0.9 + np.cos(a) * 0.006, 0.045 + np.cos(a) * 0.172))
    path = np.asarray(path)
    rope = A('rope', 'rope', ROPE, 'hips', 'spine')
    for strand in range(3):
        pts = []
        for i, p in enumerate(path):
            c = p - V(0, 0.9, 0.045); c[1] = 0
            out = c / np.linalg.norm(c)
            ph = i * 1.1 + strand * 2.094
            pts.append(p + (out * np.cos(ph) + V(0, 1, 0) * np.sin(ph)) * 0.0045)
        body.limb(pts, radii=[(0, 0.0048, 0.0048), (1, 0.0048, 0.0048)], attr=rope, k=0.002, samples=3)
    body.ellipsoid((0.03, 0.892, 0.212), (0.017, 0.015, 0.013), rope, k=0.004)
    for x0, ln in ((0.024, 0.13), (0.042, 0.095)):
        body.limb([(x0, 0.885, 0.214), (x0 + 0.008, 0.835, 0.226), (x0 + 0.004, 0.885 - ln, 0.22)], radii=[(0, 0.0058, 0.0058), (1, 0.0045, 0.0045)], attr=rope, k=0.004)
    # Bandage wraps on the forearms and shins.
    for x in (1, -1):
        s = 'L' if x > 0 else 'R'
        pts, ax = wrap_path((x * 0.37, 0.95, 0.165), (x * 0.42, 0.79, 0.215), 0.035, 0.024, 4.5, lift=0.002, seed=3 if x > 0 else 5)
        body.add(Limb(pts, radii=[(0, 0.013, 0.0019), (1, 0.012, 0.0019)], around=ax, samples=3), A('wrap', 'cloth', WRAP, f'elbow{s}', f'wrist{s}'), k=0.002)
        pts, ax = wrap_path((x * 0.15, 0.4, 0.075), (x * 0.15, 0.16, -0.025), 0.037, 0.025, 5.0, lift=0.002, seed=7 if x > 0 else 9)
        body.add(Limb(pts, radii=[(0, 0.014, 0.0019), (1, 0.013, 0.0019)], around=ax, samples=3), A('wrap', 'cloth', WRAP, f'knee{s}', f'ankle{s}'), k=0.002)

    # ── Small things, sculpted finer: teeth, tusks, earrings, the trinkets on its belt. ──
    tooth = A('tooth', 'tooth', hexcol('#d9cfac'), 'head')
    for i in range(7):
        x = (i / 6 - 0.5) * 0.078
        z = 0.49 - x * x * 7
        ln = 0.008 + ((i * 7) % 3) * 0.003
        lean = np.sin(i * 3) * 0.003
        gear.hull(claw((x, 1.43, z - 0.003), (x + lean, 1.43 - ln, z + 0.001), 0.0032, sides=4)[1], tooth, k=0.0004)
    for x in (1, -1):
        tusk = claw((x * 0.048, 1.405, 0.46), (x * 0.054, 1.488, 0.486), 0.0125, curl=(x * 0.006, 0, 0.004), sides=5)
        for h in tusk:
            gear.hull(h, A('tooth', 'tooth', hexcol('#e3d8ba'), 'jaw'), k=0.0008)
    # The right tusk is chipped.
    gear.carve_plane((-0.053, 1.47, 0.486), (0.3, 1.0, 0.2), Ellipsoid((-0.053, 1.48, 0.486), (0.02, 0.02, 0.02)), k=0.0006)
    for p in ((0.24, 1.588, 0.212), (0.29, 1.598, 0.196)):
        gear.add(Torus(p, (0.1, 0.4, 1.0), 0.011, 0.0022), A('brass', 'brass', BRASS, 'earL'), k=0.0)
    # A dead lantern stolen from the wood, a tiny skull, a bent spoon.
    lc = V(0.175, 0.83, 0.13)
    brass = A('brass', 'brass', BRASS, 'hips', 'thighL')
    gear.box(lc + V(0, 0.032, 0), (0.016, 0.004, 0.016), brass, k=0.001, round_=0.002)
    gear.box(lc - V(0, 0.03, 0), (0.019, 0.004, 0.019), brass, k=0.001, round_=0.002)
    for bx, bz in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        gear.limb([lc + V(bx * 0.014, 0.03, bz * 0.014), lc + V(bx * 0.016, -0.028, bz * 0.016)], radii=[(0, 0.0022, 0.0022), (1, 0.0022, 0.0022)], attr=brass, k=0.001)
    gear.add(Torus(lc + V(0, 0.045, 0), (1, 0, 0), 0.009, 0.0018), brass, k=0.0)
    gear.ellipsoid(lc, (0.012, 0.022, 0.012), A('glass', 'glow', hexcol('#3a2a1c'), 'hips', 'thighL'), k=0.0)
    sk = V(-0.05, 0.825, 0.205)
    bone = A('bone', 'bone', BONE, 'hips')
    gear.ellipsoid(sk, (0.017, 0.016, 0.019), bone, k=0.0)
    gear.limb([sk + V(0, -0.006, 0.008), sk + V(0, -0.012, 0.032)], radii=[(0, 0.011, 0.009), (1, 0.006, 0.005)], attr=bone, k=0.006)
    for x in (1, -1):
        gear.sub(Ellipsoid(sk + V(x * 0.007, 0.002, 0.016), (0.0055, 0.005, 0.006)), k=0.002)
    gear.limb([(-0.05, 0.905, 0.19), (-0.052, 0.87, 0.2), sk + V(0, 0.016, 0)], radii=[(0, 0.0016, 0.0016), (1, 0.0016, 0.0016)], attr=A('rope', 'rope', ROPE, 'hips'), k=0.001)
    sp = V(0.11, 0.86, 0.19)
    gear.limb([sp + V(0, 0.03, 0), sp + V(0.004, -0.01, 0.004), sp + V(0.002, -0.03, 0.012)], radii=[(0, 0.0028, 0.0012), (1, 0.0028, 0.0012)], up=(0, 0, 1), attr=brass, k=0.001)
    gear.ellipsoid(sp + V(0.002, -0.042, 0.014), (0.009, 0.013, 0.003), brass, k=0.002, rot=rotation(0.3, 0, 0))

    return AssetSpec(
        'goblin',
        [Part(body, cell=0.0025, faces=30000, topology='tri', detail_zones=('head', 'jaw', 'nose', 'lip', 'lid', 'eyeL', 'eyeR', 'wart', 'ear', 'hand', 'finger', 'toe', 'foot')),
         Part(gear, cell=0.0011, faces=4500, topology='tri')],
        paint, texture=1024, bake_size=2048, height=1.7, centre=0.85, skeleton=SKELETON,
        closeups=[('face', 18, 1.5, 0.55, 85, 0.0, 0.42), ('face-side', 80, 1.5, 0.6, 85, 0.0, 0.38),
                  ('hand', 40, 0.66, 0.42, 85, 0.44, 0.26), ('feet', 25, 0.1, 0.6, 70, 0.0, 0.05)],
        extrusion=0.009,
    )


def paint(m: Surface) -> Painted:
    P, N = m.V, m.N
    zone = m.zone
    col = srgb_to_linear(m.color)
    n = len(P)

    def z(*names):
        return np.isin(zone, names)

    skin = z('pelvis', 'belly', 'chest', 'back', 'neck', 'head', 'jaw', 'lip', 'nose', 'wart', 'lid', 'ear', 'arm', 'elbow',
             'hand', 'finger', 'leg', 'knee', 'foot', 'toe')
    # Skin: olive-ochre, mottled at two scales, lighter on the belly and throat, darker down the back,
    # warm where the blood is near (ears, nose, knuckles, elbows, knees, fingers, toes).
    mott = noise(P, 9.0, 3, 1)
    blotch = noise(P, 26.0, 2, 4)
    s = col * (0.82 + 0.3 * mott[:, None]) * (0.94 + 0.12 * blotch[:, None])
    front = np.clip(N[:, 2] * 0.6 - N[:, 1] * 0.5, 0, 1)
    s = mix(s, s * srgb_to_linear(np.array([1.22, 1.18, 0.95])), front * z('belly', 'chest', 'neck', 'jaw') * 0.6)
    s = mix(s, s * 0.7, np.clip(-N[:, 2], 0, 1) * z('back', 'chest', 'neck') * 0.5)
    warm = z('ear', 'nose', 'elbow', 'knee', 'finger', 'toe', 'lip') * 1.0
    s = mix(s, s * np.array([1.3, 0.92, 0.8]), warm * 0.35)
    s = mix(s, s * srgb_to_linear(np.array([1.25, 1.2, 0.85])), z('wart') * 0.6)
    # Cavities painted cool and deep; crests (knuckles, brow, cheekbones, shins) lighter and drier.
    crev = np.clip(-m.curv * 0.05, 0, 1)
    crest = np.clip(m.curv * 0.035, 0, 1)
    s = hue_shift_shadow(s, crev * 0.55 + (1 - m.ao) * 0.6, toward=(0.16, 0.12, 0.13))
    s = mix(s, s * 1.3 + 0.012, crest * 0.5)
    # Grime: dirt rising from the feet and on the hands.
    grime = (1 - smoothstep(0.05, 0.35, P[:, 1])) * 0.7 + z('hand', 'finger') * 0.35
    s = mix(s, srgb_to_linear(np.array([0.2, 0.16, 0.1])), np.clip(grime * (0.6 + 0.4 * noise(P, 18, 2, 9)), 0, 0.75))
    col = np.where(skin[:, None], s, col)

    # Mouth interior: deep red-brown where the mouth is carved and occluded.
    mouth = (np.abs(P[:, 1] - 1.418) < 0.012) & (P[:, 2] > 0.4) & (np.abs(P[:, 0]) < 0.075) & (m.ao < 0.6)
    col = np.where(mouth[:, None], srgb_to_linear(np.array([0.18, 0.05, 0.04])), col)

    # Thorns and claws: near-black at the root, drying lighter toward the tip.
    hard = z('thorn', 'claw')
    tipward = np.clip(m.curv * 0.02 + 0.3, 0, 1)
    hardcol = col * (0.8 + 0.6 * tipward[:, None]) * (0.9 + 0.2 * noise(P, 60, 2, 5)[:, None])
    col = np.where(hard[:, None], hardcol, col)
    teeth = z('tooth')
    col = np.where(teeth[:, None], mix(col, srgb_to_linear(np.array([0.5, 0.42, 0.28])), (1 - m.ao) * 0.8), col)

    # Eyes: cream sclera, an amber iris ring around a slit pupil; the iris carries the eyeshine.
    emit = np.zeros((n, 3))
    for x, e in ((0.065, 'eyeL'), (-0.065, 'eyeR')):
        sel = zone == e
        if not sel.any():
            continue
        q = P[sel] - np.array([x, 1.525, 0.452])
        rr = np.sqrt((q[:, 0] / 0.025) ** 2 + (q[:, 1] / 0.019) ** 2)
        front_ = q[:, 2] > 0.004
        iris = (rr < 0.62) & front_
        pupil = (np.abs(q[:, 0]) < 0.0032 + 0.002 * (1 - np.abs(q[:, 1]) / 0.019)) & (np.abs(q[:, 1]) < 0.0135) & front_
        c = np.tile(srgb_to_linear(np.array([0.84, 0.78, 0.6])), (sel.sum(), 1))
        c = mix(c, srgb_to_linear(np.array([0.62, 0.22, 0.16])), smoothstep(0.85, 1.0, rr) * 0.5)
        irisc = mix(srgb_to_linear(np.array([0.95, 0.66, 0.2])), srgb_to_linear(np.array([0.55, 0.26, 0.06])), np.clip(rr / 0.62, 0, 1))
        c = np.where(iris[:, None], irisc, c)
        c = np.where(pupil[:, None], 0.01, c)
        col[sel] = c
        em = np.zeros((sel.sum(), 3))
        em[iris & ~pupil] = 0.55
        emit[sel] = em

    # Cloth: sacking with a coarse weave, darker in the folds, filthy toward the torn hem, stained.
    cloth = z('kilt', 'cowl')
    weave = (np.sin(P[:, 0] * 900) * np.sin(P[:, 1] * 900 + P[:, 2] * 300)) * 0.5 + 0.5
    c = col * (0.86 + 0.14 * weave[:, None]) * (0.85 + 0.3 * noise(P, 7, 3, 11)[:, None])
    hemdirt = np.where(z('kilt'), smoothstep(0.82, 0.62, P[:, 1]), smoothstep(1.3, 1.24, P[:, 1]) * 0.5)
    c = mix(c, srgb_to_linear(np.array([0.17, 0.15, 0.1])), hemdirt * 0.6)
    stain = smoothstep(0.62, 0.78, noise(P, 4.5, 3, 15))
    c = mix(c, c * srgb_to_linear(np.array([0.7, 0.62, 0.5])), stain * 0.6)
    c = hue_shift_shadow(c, (1 - m.ao) * 0.7, toward=(0.12, 0.11, 0.1))
    col = np.where(cloth[:, None], c, col)
    wraps = z('wrap')
    c = col * (0.8 + 0.3 * noise(P, 30, 2, 17)[:, None])
    c = mix(c, srgb_to_linear(np.array([0.32, 0.24, 0.16])), smoothstep(0.5, 0.8, noise(P, 12, 3, 19)) * 0.55)
    col = np.where(wraps[:, None], hue_shift_shadow(c, (1 - m.ao) * 0.6), col)
    ropes = z('rope')
    col = np.where(ropes[:, None], hue_shift_shadow(col * (0.85 + 0.25 * noise(P, 50, 2, 21)[:, None]), (1 - m.ao) * 0.8), col)
    # Brass: tarnished dark in the recesses, rubbed bright on the edges.
    br = z('brass')
    c = mix(col * 0.55, col * 1.35, np.clip(0.5 + m.curv * 0.03, 0, 1))
    c = mix(c, srgb_to_linear(np.array([0.2, 0.26, 0.18])), (1 - m.ao) * 0.6)
    col = np.where(br[:, None], c, col)
    bonez = z('bone')
    col = np.where(bonez[:, None], mix(col, srgb_to_linear(np.array([0.38, 0.3, 0.2])), (1 - m.ao) * 0.9), col)
    glass = z('glass')
    emit[glass] = srgb_to_linear(np.array([0.12, 0.05, 0.02]))

    from arcane_art.paint import response
    rough, metal, fx = response(m.mat)
    ears = z('ear')
    edge = np.clip(1 - m.ao * 0.2, 0, 1)
    fx[ears, 1] = 0.6 * edge[ears]
    fx[ears, 2] = 0.7
    return Painted(albedo=np.clip(col, 0, 1), emit=emit, fx=fx)
