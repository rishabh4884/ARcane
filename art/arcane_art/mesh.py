"""
Field to mesh: evaluate a sculpt in a narrow band of blocks around its surface, store it in an OpenVDB
level set, and extract a quad mesh at millimetre resolution.
"""
from __future__ import annotations

import math
import time

import numpy as np
import openvdb

from .sdf import Sculpt


def mesh_sculpt(sculpt: Sculpt, cell: float, block: int = 16, band: int = 3, adaptivity: float = 0.0,
                log=print) -> tuple[np.ndarray, np.ndarray]:
    """Returns vertices (n, 3) in game coordinates and faces (m, 3|4) as a list of index arrays."""
    t0 = time.time()
    lo, hi = sculpt.bounds(pad=cell * (band + 2))
    dims = np.ceil((hi - lo) / cell).astype(int) + 1
    nb = np.ceil(dims / block).astype(int)
    bg = band * cell
    grid = openvdb.FloatGrid(bg)
    half_diag = math.sqrt(3) * block * cell / 2
    ax = np.arange(block) * cell
    evaluated = skipped = 0
    for bk in range(nb[2]):
        for bj in range(nb[1]):
            for bi in range(nb[0]):
                i0, j0, k0 = bi * block, bj * block, bk * block
                plo = lo + np.array([i0, j0, k0]) * cell
                phi = plo + block * cell
                centre = (plo + phi) / 2
                dc = sculpt.field(centre[None], plo - cell, phi + cell)[0]
                # Wholly inside or outside (with a generous margin for inexact distances): skip.
                if abs(dc) > half_diag * 1.6 + bg:
                    skipped += 1
                    continue
                X, Y, Z = np.meshgrid(plo[0] + ax, plo[1] + ax, plo[2] + ax, indexing='ij')
                P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
                d = sculpt.field(P, plo - cell, phi + cell)
                d = np.clip(d, -bg, bg).reshape(block, block, block).astype(np.float32)
                grid.copyFromArray(d, ijk=(i0, j0, k0), tolerance=0)
                evaluated += 1
    grid.signedFloodFill()
    pts, tris, quads = grid.convertToPolygons(isovalue=0.0, adaptivity=adaptivity)
    V = lo + np.asarray(pts, float) * cell
    faces = [*np.asarray(quads, np.int64).tolist(), *np.asarray(tris, np.int64).tolist()]
    log(f'[mesh] {sculpt.name}: cell {cell * 1000:.1f} mm, {evaluated} blocks evaluated, {skipped} skipped, '
        f'{len(V)} verts, {len(faces)} faces in {time.time() - t0:.1f}s')
    return V, faces
