"""
RIG
===
A skeleton spec becomes a Blender armature whose joint names are exactly the ones the game's
animation code drives, and the low mesh is skinned to it.

Weights come from what the sculpt knows: every sculpted form carries the bones it belongs to, so a
low-mesh vertex only considers the bones of the forms nearest it (an arm never binds to the torso
across the armpit gap, a thigh never to the other thigh). Among those, weight falls off with distance
to each bone's segment, then diffuses across the mesh so joints bend smoothly. At most four
influences per vertex, normalised.

Skeleton spec: a list of (name, parent | None, head (x, y, z), tail (x, y, z) | None) in game
coordinates (metres, Y up, facing +Z). The first bone must be 'root' at the origin.
"""
from __future__ import annotations

from typing import Sequence

import bpy
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

from . import bl

Bone = tuple  # (name, parent, head, tail)


def mirror(spec: Sequence[Bone]) -> list[Bone]:
    """Expand bones whose name ends in 'L' (at +x) with their right-side mirrors."""
    out: list[Bone] = []
    def swap(n: str | None) -> str | None:
        if n is None:
            return None
        return n[:-1] + 'R' if n.endswith('L') else n
    for name, parent, head, tail in spec:
        out.append((name, parent, head, tail))
        if name.endswith('L'):
            h = (-head[0], head[1], head[2])
            t = None if tail is None else (-tail[0], tail[1], tail[2])
            out.append((swap(name), swap(parent) if parent and parent.endswith('L') else parent, h, t))
    return out


def tails(spec: Sequence[Bone]) -> list[Bone]:
    """Fill missing tails: toward the only child, else a short stub continuing from the parent."""
    heads = {n: np.asarray(h, float) for n, _, h, _ in spec}
    children: dict[str, list[str]] = {}
    for n, p, _, _ in spec:
        if p:
            children.setdefault(p, []).append(n)
    out = []
    for n, p, h, t in spec:
        if t is None:
            kids = children.get(n, [])
            if len(kids) == 1 and np.linalg.norm(heads[kids[0]] - heads[n]) > 1e-4:
                t = tuple(heads[kids[0]])
            else:
                d = heads[n] - heads[p] if p else np.array([0, 0.1, 0])
                ln = np.linalg.norm(d)
                d = d / ln * min(max(ln * 0.5, 0.02), 0.1) if ln > 1e-6 else np.array([0, 0.05, 0])
                t = tuple(heads[n] + d)
        out.append((n, p, h, t))
    return out


def build_armature(spec: Sequence[Bone], name: str = 'Armature') -> bpy.types.Object:
    data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(arm)
    bl.activate(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = data.edit_bones
    for n, p, h, t in spec:
        b = eb.new(n)
        b.head = Vector(bl.to_bl(np.asarray([h], float))[0])
        b.tail = Vector(bl.to_bl(np.asarray([t], float))[0])
        if p:
            b.parent = eb[p]
            b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def segment_distance(P: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ab = b - a
    l2 = max(float(ab @ ab), 1e-12)
    t = np.clip(((P - a) @ ab) / l2, 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def skin(low: bpy.types.Object, arm: bpy.types.Object, spec: Sequence[Bone], hints_V: np.ndarray, hints_bones: list,
         power: float = 4.0, smooth_iters: int = 8, alpha: float = 0.55, k: int = 6) -> None:
    names = [n for n, _, _, _ in spec]
    index = {n: i for i, n in enumerate(names)}
    V = bl.verts_game(low)
    nV, nB = len(V), len(names)
    # Candidate bones per low vertex, from the sculpted forms around it.
    kd = KDTree(len(hints_V))
    for i, p in enumerate(hints_V):
        kd.insert(p, i)
    kd.balance()
    cand = np.zeros((nV, nB), bool)
    for v in range(nV):
        for _, i, _ in kd.find_n(V[v], k):
            for b in hints_bones[i]:
                if b in index:
                    cand[v, index[b]] = True
    # Distance falloff to each candidate bone's segment.
    D = np.empty((nV, nB))
    for j, (_, _, h, t) in enumerate(spec):
        D[:, j] = segment_distance(V, np.asarray(h, float), np.asarray(t, float))
    W = np.where(cand, 1.0 / (D + 0.006) ** power, 0.0)
    none = ~cand.any(axis=1)
    if none.any():
        # Orphans (no hint): the two nearest bones.
        nearest = np.argsort(D[none], axis=1)[:, :2]
        for row, (i, js) in enumerate(zip(np.where(none)[0], nearest)):
            W[i, js] = 1.0 / (D[i, js] + 0.006) ** power
    W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-12)
    # Diffuse across the mesh: smooth transitions at the joints.
    a, b = bl.mesh_neighbors(low)
    cnt = np.zeros(nV); np.add.at(cnt, a, 1); np.add.at(cnt, b, 1)
    allowed = cand | none[:, None]
    for _ in range(smooth_iters):
        acc = np.zeros_like(W)
        np.add.at(acc, a, W[b]); np.add.at(acc, b, W[a])
        W = (1 - alpha) * W + alpha * acc / np.maximum(cnt, 1)[:, None]
        # Diffusion may carry a bone across a gap it should not reach: keep it near its forms.
        grown = allowed.copy()
        np.logical_or.at(grown, a, allowed[b]); np.logical_or.at(grown, b, allowed[a])
        W = np.where(grown, W, 0.0)
        W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-12)
    # Four influences at most.
    order = np.argsort(-W, axis=1)
    keep = np.zeros_like(W, bool)
    rows = np.arange(nV)[:, None]
    keep[rows, order[:, :4]] = True
    W = np.where(keep & (W > 0.01), W, 0.0)
    W /= np.maximum(W.sum(axis=1, keepdims=True), 1e-12)
    # Into vertex groups.
    low.vertex_groups.clear()
    groups = [low.vertex_groups.new(name=n) for n in names]
    for j, g in enumerate(groups):
        idx = np.nonzero(W[:, j])[0]
        for i in idx:
            g.add([int(i)], float(W[i, j]), 'REPLACE')
    mod = low.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    low.parent = arm
    print(f'[rig] skinned {nV} verts to {nB} bones; orphans {int(none.sum())}', flush=True)
