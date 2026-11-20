"""
The asset pipeline, end to end:

  sculpt (numpy SDF) → high mesh (OpenVDB) → attributes → AO (Cycles) → paint (recipe)
  → low mesh (voxel remesh + Quadriflow + projection) → UVs → bakes (normal, albedo, ORM, fx, emit)
  → [rig + skin] → GLB → review renders
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Callable

import bpy
import numpy as np

from . import bl
from .mesh import mesh_sculpt
from .paint import response
from .sdf import Sculpt

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'art')
REVIEW = os.path.join(ROOT, 'art', 'review')
BUILD = os.path.join(ROOT, 'art', 'build')


@dataclass
class Surface:
    """Everything a paint recipe can read about the high mesh, per vertex (game coordinates)."""
    V: np.ndarray
    N: np.ndarray
    color: np.ndarray
    mat: np.ndarray
    zone: np.ndarray
    bones: list
    curv: np.ndarray
    ao: np.ndarray


@dataclass
class Painted:
    albedo: np.ndarray                 # (n, 3) linear
    rough: np.ndarray | None = None    # (n,)
    metal: np.ndarray | None = None
    fx: np.ndarray | None = None       # (n, 3)
    emit: np.ndarray | None = None     # (n, 3) linear


@dataclass
class Part:
    """One sculpted piece of an asset, meshed at its own resolution and retopologised to its own budget."""
    sculpt: Sculpt
    cell: float
    faces: int
    voxel: float | None = None   # remesh voxel before Quadriflow (defaults to 2.5 × cell)


@dataclass
class AssetSpec:
    name: str
    parts: list[Part]
    paint: Callable[[Surface], Painted]
    texture: int = 1024
    bake_size: int = 2048
    height: float = 1.0            # for review framing
    centre: float = 0.5
    rig: Callable | None = None    # (low objects) -> armature, after which meshes are skinned
    review_shots: list = field(default_factory=lambda: [('front', 0, 1.0), ('three-quarter', 35, 1.0), ('side', 90, 1.0), ('back', 180, 1.0)])
    closeups: list = field(default_factory=list)  # (name, yaw, look_y, dist, lens)
    extrusion: float = 0.007


def log(*a):
    print('[art]', *a, flush=True)


def ao_vertex_colors(high: bpy.types.Object, samples: int = 24) -> np.ndarray:
    """Ambient occlusion per vertex of the high mesh, baked by Cycles."""
    scn = bpy.context.scene
    me = high.data
    attr = me.color_attributes.new('ao', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = attr
    mat = bpy.data.materials.new('ao-white'); mat.use_nodes = True
    me.materials.clear(); me.materials.append(mat)
    scn.cycles.samples = samples
    scn.render.bake.target = 'VERTEX_COLORS'
    scn.render.bake.use_selected_to_active = False
    bl.activate(high)
    bpy.ops.object.bake(type='AO')
    scn.render.bake.target = 'IMAGE_TEXTURES'
    return bl.get_vertex_colors(high, 'ao')[:, 0].astype(float)


def build_high(part: Part) -> tuple[bpy.types.Object, dict]:
    V, F = mesh_sculpt(part.sculpt, part.cell, log=log)
    high = bl.mesh_object(f'{part.sculpt.name}-high', V, F)
    bl.clean(high, merge=part.cell * 0.05)
    bl.shade_smooth(high)
    Vg = bl.verts_game(high)
    t = time.time()
    attrs = part.sculpt.attributes(Vg)
    log(f'attributes for {len(Vg)} verts in {time.time() - t:.1f}s')
    return high, attrs


def paint_high(high: bpy.types.Object, attrs: dict, recipe: Callable[[Surface], Painted]) -> None:
    t = time.time()
    ao = ao_vertex_colors(high)
    curv = bl.curvature(high)
    s = Surface(V=bl.verts_game(high), N=bl.normals_game(high), color=attrs['color'], mat=attrs['mat'],
                zone=attrs['zone'], bones=attrs['bones'], curv=curv, ao=ao)
    p = recipe(s)
    rough, metal, fx = response(s.mat)
    if p.rough is not None: rough = p.rough
    if p.metal is not None: metal = p.metal
    if p.fx is not None: fx = p.fx
    emit = p.emit if p.emit is not None else np.zeros((len(s.V), 3))
    bl.set_vertex_colors(high, 'albedo', np.clip(p.albedo, 0, 1))
    bl.set_vertex_colors(high, 'orm', np.stack([np.clip(ao, 0, 1), np.clip(rough, 0, 1), np.clip(metal, 0, 1)], axis=1))
    bl.set_vertex_colors(high, 'fx', np.clip(fx, 0, 1))
    bl.set_vertex_colors(high, 'emit', np.clip(emit, 0, 1))
    log(f'painted in {time.time() - t:.1f}s')


def bake_maps(spec: AssetSpec, low: bpy.types.Object, high: bpy.types.Object) -> dict:
    t = time.time()
    size = spec.bake_size
    maps = {}
    img = bl.new_image(f'{spec.name}-normal', size, data=True)
    bl.bake(low, high, 'NORMAL', img, extrusion=spec.extrusion, samples=1)
    maps['normal'] = img
    for key, data in (('albedo', False), ('orm', True), ('fx', True), ('emit', False)):
        high.data.materials.clear()
        high.data.materials.append(bl.emission_from_attribute(f'emit-{key}', key))
        img = bl.new_image(f'{spec.name}-{key}', size, data=data)
        bl.bake(low, high, 'EMIT', img, extrusion=spec.extrusion, samples=1)
        maps[key] = img
    log(f'baked maps at {size}px in {time.time() - t:.1f}s')
    return maps


def finish_maps(spec: AssetSpec, maps: dict) -> dict:
    """Write each bake at the shipping size to disk and load it back as a file image, so the exporter
    encodes exactly these pixels (generated float images do not survive export reliably)."""
    out = {}
    folder = os.path.join(BUILD, spec.name, 'final')
    for key, img in maps.items():
        data = img.colorspace_settings.name == 'Non-Color'
        if img.size[0] != spec.texture:
            img.scale(spec.texture, spec.texture)
        path = os.path.join(folder, f'{key}.png')
        bl.save_image(img, path, 'PNG')
        loaded = bpy.data.images.load(path, check_existing=False)
        loaded.name = f'{spec.name}-{key}'
        loaded.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
        out[key] = loaded
    return out


def build(spec: AssetSpec, review: bool = True) -> str:
    t0 = time.time()
    bl.reset()
    lows, highs = [], []
    for i, part in enumerate(spec.parts):
        high, attrs = build_high(part)
        paint_high(high, attrs, spec.paint)
        low = bl.retopo(high, f'{spec.name}-{part.sculpt.name}', part.faces, part.voxel or part.cell * 2.5)
        log(f'low {low.name}: {len(low.data.polygons)} faces')
        lows.append(low); highs.append(high)
    # Join the parts into one low mesh for one texture set; keep highs together for baking.
    if len(lows) > 1:
        bl.activate(lows[0], *lows[1:]); bpy.ops.object.join()
        bl.activate(highs[0], *highs[1:]); bpy.ops.object.join()
    low, high = lows[0], highs[0]
    low.name = spec.name
    bl.unwrap(low)
    maps = bake_maps(spec, low, high)
    maps = finish_maps(spec, maps)
    fx_path = os.path.join(MODELS, f'{spec.name}.fx.webp')
    bl.save_image(maps['fx'], fx_path, 'WEBP', 90)
    mat = bl.pbr_material(f'{spec.name}-material', maps['albedo'], maps['normal'], maps['orm'], maps['emit'])
    low.data.materials.clear(); low.data.materials.append(mat)
    objects = [low]
    armature = None
    if spec.rig is not None:
        armature = spec.rig(low)
        objects = [armature, low]
    high.hide_render = True
    glb = os.path.join(MODELS, f'{spec.name}.glb')
    bl.export_glb(glb, objects, skins=armature is not None)
    meta = dict(name=spec.name, faces=len(low.data.polygons), verts=len(low.data.vertices), texture=spec.texture,
                built=time.strftime('%Y-%m-%d %H:%M'))
    with open(os.path.join(MODELS, f'{spec.name}.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    log(f'exported {glb} ({os.path.getsize(glb) / 1024:.0f} KB) {meta}')
    if review:
        render_review(spec, glb)
    log(f'{spec.name} built in {time.time() - t0:.0f}s')
    return glb


def render_review(spec: AssetSpec, glb: str) -> None:
    """Re-import the shipped GLB into an empty studio and render it: review what the game receives."""
    out = os.path.join(REVIEW, spec.name)
    os.makedirs(out, exist_ok=True)
    bl.reset()
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bl.review_scene(spec.height, spec.centre)
    h = spec.height
    for name, yaw, scale in spec.review_shots:
        bl.review_shot(os.path.join(out, f'{name}.jpg'), yaw, h * 3.2 * scale, spec.centre)
    for name, yaw, look_y, dist, lens in spec.closeups:
        bl.review_shot(os.path.join(out, f'{name}.jpg'), yaw, dist, look_y, lens)
    # Silhouette: the figure in flat black on white.
    sil = bpy.data.materials.new('silhouette'); sil.use_nodes = True
    nt = sil.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (0, 0, 0, 1)
    nt.links.new(e.outputs['Emission'], o.inputs['Surface'])
    for m in meshes:
        m.data.materials.clear(); m.data.materials.append(sil)
    scn = bpy.context.scene
    world = scn.world.node_tree.nodes['Background']
    world.inputs['Color'].default_value = (1, 1, 1, 1); world.inputs['Strength'].default_value = 1.0
    for o2 in scn.objects:
        if o2.type == 'LIGHT' or (o2.type == 'MESH' and o2 not in meshes):
            o2.hide_render = True
    bl.review_shot(os.path.join(out, 'silhouette.jpg'), 20, h * 3.2, spec.centre, res=600)
    log(f'review renders in {out}')
