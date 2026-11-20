"""
PAINT
=====
Colour and surface response are painted on the high mesh per vertex, then baked to the low mesh's
textures. An asset's paint recipe starts from the sculpt's blended colours and adds intent: zones,
flushes, wear on crests, dirt low and in crevices, markings. This module holds the material table
and the small tools recipes use.

Maps produced (all baked to the low mesh's UVs):
  albedo  RGB colour
  orm     R ambient occlusion · G roughness · B metalness
  fx      R sheen (cloth, fur, moss) · G translucency (membranes, thin leaves, ears) · B subsurface (skin)
  emit    RGB emitted light (eyes, captive light, runes)
"""
from __future__ import annotations

import numpy as np

from .sdf import fbm, ridged, value_noise

# How each material answers light: roughness, metalness, sheen, translucency, subsurface.
MATERIALS: dict[str, tuple[float, float, float, float, float]] = {
    'skin':     (0.62, 0.0, 0.05, 0.10, 0.55),
    'bark':     (0.92, 0.0, 0.00, 0.00, 0.00),
    'wood':     (0.80, 0.0, 0.00, 0.00, 0.00),
    'cloth':    (0.95, 0.0, 0.45, 0.05, 0.05),
    'leather':  (0.70, 0.0, 0.10, 0.00, 0.02),
    'rope':     (0.95, 0.0, 0.30, 0.00, 0.00),
    'bone':     (0.58, 0.0, 0.00, 0.05, 0.12),
    'horn':     (0.45, 0.0, 0.00, 0.05, 0.05),
    'claw':     (0.40, 0.0, 0.00, 0.05, 0.02),
    'tooth':    (0.38, 0.0, 0.00, 0.10, 0.10),
    'metal':    (0.38, 1.0, 0.00, 0.00, 0.00),
    'brass':    (0.32, 1.0, 0.00, 0.00, 0.00),
    'fur':      (0.90, 0.0, 0.65, 0.10, 0.10),
    'hair':     (0.55, 0.0, 0.40, 0.10, 0.05),
    'moss':     (0.95, 0.0, 0.55, 0.20, 0.10),
    'leaf':     (0.70, 0.0, 0.10, 0.55, 0.20),
    'stone':    (0.88, 0.0, 0.00, 0.00, 0.00),
    'membrane': (0.55, 0.0, 0.05, 0.75, 0.20),
    'chitin':   (0.34, 0.0, 0.00, 0.05, 0.02),
    'eye':      (0.08, 0.0, 0.00, 0.00, 0.00),
    'glow':     (0.50, 0.0, 0.00, 0.00, 0.00),
    'dark':     (0.80, 0.0, 0.00, 0.00, 0.00),
    'fungus':   (0.70, 0.0, 0.10, 0.35, 0.30),
}


def response(mats: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-vertex roughness, metalness and fx (sheen, translucency, subsurface) from material names."""
    n = len(mats)
    rough = np.zeros(n); metal = np.zeros(n); fx = np.zeros((n, 3))
    for name in np.unique(mats):
        r, m, sh, tr, ss = MATERIALS.get(str(name), MATERIALS['skin'])
        sel = mats == name
        rough[sel] = r; metal[sel] = m; fx[sel] = (sh, tr, ss)
    return rough, metal, fx


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def mix(a: np.ndarray, b, t: np.ndarray) -> np.ndarray:
    t = np.asarray(t, float)
    if t.ndim == 1:
        t = t[:, None]
    return a * (1 - t) + np.asarray(b, float) * t


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def hue_shift_shadow(col: np.ndarray, amount: np.ndarray, toward=(0.10, 0.16, 0.20)) -> np.ndarray:
    """Darken toward a cool tint rather than toward black: shadows painted, not crushed."""
    return mix(col, np.asarray(toward) * col.mean(axis=1, keepdims=True) * 1.4, np.clip(amount, 0, 1))


def noise(V: np.ndarray, freq: float, octaves: int = 3, seed: int = 0) -> np.ndarray:
    return fbm(V * freq, octaves, seed)


def ridges(V: np.ndarray, freq: float, seed: int = 0) -> np.ndarray:
    return ridged(V * freq, 3, seed)


def grain_noise(V: np.ndarray, axis: np.ndarray, freq: float, stretch: float, seed: int = 0) -> np.ndarray:
    """Noise stretched along an axis (bark fibre, fabric fall)."""
    a = np.asarray(axis, float)
    a = a / np.linalg.norm(a)
    along = V @ a
    Q = V + np.outer(along, a) * (1 / stretch - 1)
    return fbm(Q * freq, 3, seed)


def cell_spots(V: np.ndarray, freq: float, threshold: float, seed: int = 0) -> np.ndarray:
    """Sparse soft spots (warts, lichen dots, flecks): 1 inside a spot, 0 elsewhere."""
    n = value_noise(V * freq, seed)
    return smoothstep(threshold, threshold + 0.06, n)
