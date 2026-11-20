"""
Blender helpers for the pipeline: objects from arrays, retopology, UVs, Cycles bakes, review renders,
GLB export. Game coordinates (Y up, facing +Z) are converted to Blender's (Z up, facing -Y) here, and
the glTF exporter converts them back.
"""
from __future__ import annotations

import math
import os
from typing import Iterable, Sequence

import bpy
import bmesh
import numpy as np
from mathutils import Vector


# ───────────────────────────── scene and objects ─────────────────────────────

def reset() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    scn.unit_settings.system = 'METRIC'
    scn.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scn.cycles.device = 'GPU'
    except Exception:
        scn.cycles.device = 'CPU'


def to_bl(V: np.ndarray) -> np.ndarray:
    """Game (x, y, z) → Blender (x, -z, y)."""
    return np.stack([V[:, 0], -V[:, 2], V[:, 1]], axis=1)


def from_bl(V: np.ndarray) -> np.ndarray:
    return np.stack([V[:, 0], V[:, 2], -V[:, 1]], axis=1)


def mesh_object(name: str, V_game: np.ndarray, faces: Sequence[Sequence[int]]) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata(to_bl(V_game).tolist(), [], [list(f) for f in faces])
    me.validate(clean_customdata=True)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def activate(ob: bpy.types.Object, *others: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action='DESELECT') if bpy.context.view_layer.objects.active else None
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in (*others, ob):
        o.select_set(True)
    bpy.context.view_layer.objects.active = ob


def verts_game(ob: bpy.types.Object) -> np.ndarray:
    me = ob.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    return from_bl(co.reshape(-1, 3))


def normals_game(ob: bpy.types.Object) -> np.ndarray:
    me = ob.data
    n = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('normal', n)
    return from_bl(n.reshape(-1, 3))


def clean(ob: bpy.types.Object, merge: float = 1e-6) -> None:
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def shade_smooth(ob: bpy.types.Object, angle: float | None = None) -> None:
    me = ob.data
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if angle is not None:
        activate(ob)
        bpy.ops.object.shade_auto_smooth(angle=angle)
    me.update()


def apply_modifiers(ob: bpy.types.Object) -> None:
    activate(ob)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def duplicate(ob: bpy.types.Object, name: str) -> bpy.types.Object:
    c = ob.copy()
    c.data = ob.data.copy()
    c.name = name
    bpy.context.scene.collection.objects.link(c)
    return c


# ───────────────────────────── retopology ─────────────────────────────

def voxel_remesh(ob: bpy.types.Object, voxel: float, adaptivity: float = 0.0) -> None:
    m = ob.modifiers.new('remesh', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    m.adaptivity = adaptivity
    apply_modifiers(ob)


def quadriflow(ob: bpy.types.Object, faces: int, seed: int = 0) -> bool:
    activate(ob)
    try:
        before = len(ob.data.polygons)
        r = bpy.ops.object.quadriflow_remesh(target_faces=faces, use_mesh_symmetry=False, use_preserve_sharp=True,
                                             use_preserve_boundary=True, smooth_normals=False, seed=seed, mode='FACES')
        print(f'[topo] quadriflow {r} {before} -> {len(ob.data.polygons)} faces', flush=True)
        return 'FINISHED' in r and len(ob.data.polygons) > faces * 0.3 and len(ob.data.polygons) != before
    except Exception as e:  # noqa: BLE001
        print('[topo] quadriflow failed:', e)
        return False


def decimate(ob: bpy.types.Object, faces: int, detail: np.ndarray | None = None) -> None:
    """Quadric decimation to about `faces` triangles; vertices weighted in `detail` (0..1) are spared."""
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    ratio = min(1.0, faces / max(1, tris))
    m = ob.modifiers.new('decimate', 'DECIMATE')
    m.ratio = ratio
    m.use_collapse_triangulate = True
    if detail is not None and len(detail) == len(ob.data.vertices):
        # The group marks where decimation may act; inverted, the detail zones are decimated a quarter
        # as hard as the rest, so faces and hands keep their triangles.
        g = ob.vertex_groups.new(name='detail')
        for i in np.nonzero(detail > 0.5)[0]:
            g.add([int(i)], 0.75, 'REPLACE')
        m.vertex_group = 'detail'
        m.invert_vertex_group = True
        m.vertex_group_factor = 1.0
    apply_modifiers(ob)
    if 'detail' in ob.vertex_groups:
        ob.vertex_groups.remove(ob.vertex_groups['detail'])


def shrinkwrap(ob: bpy.types.Object, target: bpy.types.Object, offset: float = 0.0) -> None:
    m = ob.modifiers.new('wrap', 'SHRINKWRAP')
    m.target = target
    m.wrap_method = 'NEAREST_SURFACEPOINT'
    m.offset = offset
    apply_modifiers(ob)


def smooth(ob: bpy.types.Object, factor: float = 0.5, repeat: int = 2) -> None:
    m = ob.modifiers.new('smooth', 'CORRECTIVE_SMOOTH')
    m.factor = factor
    m.iterations = repeat
    m.smooth_type = 'LENGTH_WEIGHTED'
    m.use_only_smooth = True
    apply_modifiers(ob)


def retopo(high: bpy.types.Object, name: str, faces: int, voxel: float | None = None) -> bpy.types.Object:
    """A clean low mesh from the high sculpt: Quadriflow (on the sculpt itself, so thin ears and
    fingers survive; through a voxel remesh only if that fails), projected back onto the high."""
    low = duplicate(high, name)
    for m in list(low.data.materials):
        low.data.materials.clear()
    ok = quadriflow(low, faces)
    if not ok and voxel:
        low.data = high.data.copy()
        voxel_remesh(low, voxel)
        clean(low, merge=voxel * 0.05)
        ok = quadriflow(low, faces)
    if not ok:
        print('[topo] falling back to decimation', flush=True)
        low.data = high.data.copy()
        decimate(low, faces * 2)
    shrinkwrap(low, high)
    clean(low, merge=1e-6)
    shade_smooth(low)
    return low


# ───────────────────────────── UVs ─────────────────────────────

def unwrap(ob: bpy.types.Object, margin: float = 0.004, angle: float = 66.0) -> None:
    activate(ob)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle), island_margin=margin, area_weight=0.0, correct_aspect=True,
                             scale_to_bounds=False)
    try:
        bpy.ops.uv.pack_islands(margin=margin, rotate=True, shape_method='CONCAVE')
    except TypeError:
        bpy.ops.uv.pack_islands(margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')


# ───────────────────────────── vertex data ─────────────────────────────

def set_vertex_colors(ob: bpy.types.Object, name: str, rgba: np.ndarray) -> None:
    """Per-vertex colour attribute (linear floats, point domain)."""
    me = ob.data
    if name in me.color_attributes:
        me.color_attributes.remove(me.color_attributes[name])
    attr = me.color_attributes.new(name, 'FLOAT_COLOR', 'POINT')
    data = np.ones((len(me.vertices), 4), np.float32)
    data[:, :rgba.shape[1]] = rgba
    attr.data.foreach_set('color', data.ravel())


def get_vertex_colors(ob: bpy.types.Object, name: str) -> np.ndarray:
    attr = ob.data.color_attributes[name]
    data = np.empty(len(attr.data) * 4, np.float32)
    attr.data.foreach_get('color', data)
    return data.reshape(-1, 4)


def mesh_neighbors(ob: bpy.types.Object) -> tuple[np.ndarray, np.ndarray]:
    me = ob.data
    e = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', e)
    e = e.reshape(-1, 2)
    return e[:, 0], e[:, 1]


def curvature(ob: bpy.types.Object, rings: int = 3) -> np.ndarray:
    """Mean-curvature-like measure per vertex: + on convex crests, − in crevices, smoothed over rings."""
    V = verts_game(ob); N = normals_game(ob)
    a, b = mesh_neighbors(ob)
    d = V[b] - V[a]
    l2 = np.maximum(np.sum(d * d, axis=1), 1e-12)
    ka = np.sum((N[b] - N[a]) * d, axis=1) / l2
    k = np.zeros(len(V)); cnt = np.zeros(len(V))
    np.add.at(k, a, ka); np.add.at(k, b, ka); np.add.at(cnt, a, 1); np.add.at(cnt, b, 1)
    k /= np.maximum(cnt, 1)
    for _ in range(rings):
        s = np.zeros(len(V)); np.add.at(s, a, k[b]); np.add.at(s, b, k[a])
        k = (k + s / np.maximum(cnt, 1)) / 2
    return k


# ───────────────────────────── materials and baking ─────────────────────────────

def emission_from_attribute(name: str, attr: str) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = attr
    nt.links.new(ca.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat


def new_image(name: str, size: int, data: bool) -> bpy.types.Image:
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    return img


def bake_target_material(ob: bpy.types.Object, img: bpy.types.Image) -> bpy.types.Material:
    mat = bpy.data.materials.new(f'bake-{img.name}')
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return mat


def bake(low: bpy.types.Object, high: bpy.types.Object | None, kind: str, img: bpy.types.Image, extrusion: float = 0.01,
         samples: int = 16, margin: int = 8) -> None:
    """Bake `kind` ('NORMAL', 'EMIT', 'AO') from high onto low's UVs into img."""
    scn = bpy.context.scene
    scn.cycles.samples = samples
    scn.render.bake.margin = margin
    scn.render.bake.margin_type = 'EXTEND'
    bake_target_material(low, img)
    if high is not None:
        activate(low, high)
        scn.render.bake.use_selected_to_active = True
        scn.render.bake.cage_extrusion = extrusion
        scn.render.bake.max_ray_distance = extrusion * 1.2
    else:
        activate(low)
        scn.render.bake.use_selected_to_active = False
    kw = dict(type=kind, margin=margin)
    if kind == 'NORMAL':
        kw.update(normal_space='TANGENT')
    bpy.ops.object.bake(**kw)


def save_image(img: bpy.types.Image, path: str, fmt: str = 'PNG', quality: int = 92) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scn = bpy.context.scene
    s = scn.render.image_settings
    s.file_format = fmt
    s.quality = quality
    s.color_mode = 'RGB'
    s.color_depth = '8'
    # Data maps are written as stored; colour maps through the view transform would be graded, so
    # write both raw.
    s.color_management = 'OVERRIDE'
    s.view_settings.view_transform = 'Standard'
    s.view_settings.look = 'None'
    img.save_render(path, scene=scn)


def images_to_array(img: bpy.types.Image) -> np.ndarray:
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def array_to_image(name: str, arr: np.ndarray, data: bool) -> bpy.types.Image:
    h, w = arr.shape[:2]
    img = new_image(name, w, data)
    rgba = np.ones((h, w, 4), np.float32)
    rgba[..., :arr.shape[2]] = arr
    img.pixels.foreach_set(rgba.ravel())
    return img


# ───────────────────────────── export material ─────────────────────────────

def pbr_material(name: str, albedo: bpy.types.Image, normal: bpy.types.Image, orm: bpy.types.Image,
                 emissive: bpy.types.Image | None = None) -> bpy.types.Material:
    """A glTF-exportable material: base colour, tangent normal, occlusion/roughness/metalness, emission."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    t_alb = nt.nodes.new('ShaderNodeTexImage'); t_alb.image = albedo
    nt.links.new(t_alb.outputs['Color'], bsdf.inputs['Base Color'])
    t_nrm = nt.nodes.new('ShaderNodeTexImage'); t_nrm.image = normal; normal.colorspace_settings.name = 'Non-Color'
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(t_nrm.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    t_orm = nt.nodes.new('ShaderNodeTexImage'); t_orm.image = orm; orm.colorspace_settings.name = 'Non-Color'
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(t_orm.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    # Occlusion through the glTF output group the exporter understands.
    try:
        grp = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        if 'Occlusion' not in [s.name for s in grp.interface.items_tree]:
            grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = grp
        nt.links.new(sep.outputs['Red'], g.inputs['Occlusion'])
    except Exception as e:  # noqa: BLE001
        print('[export] occlusion socket unavailable:', e)
    if emissive is not None:
        t_em = nt.nodes.new('ShaderNodeTexImage'); t_em.image = emissive
        nt.links.new(t_em.outputs['Color'], bsdf.inputs['Emission Color'])
        bsdf.inputs['Emission Strength'].default_value = 1.0
    return mat


def export_glb(path: str, objects: Iterable[bpy.types.Object], skins: bool = False, morphs: bool = False) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    objs = list(objects)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_skins=skins, export_morph=morphs, export_morph_normal=morphs, export_animations=False,
        export_tangents=True, export_image_format='WEBP', export_image_quality=90, export_vertex_color='NONE',
        export_attributes=True,
    )


# ───────────────────────────── review renders ─────────────────────────────

def review_scene(target_height: float, centre_y: float) -> None:
    """A neutral studio: grey sweep, soft key, fill and rim; no fog, no bloom, no grade."""
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    scn.cycles.samples = 48
    scn.cycles.use_denoising = True
    scn.render.film_transparent = False
    scn.view_settings.view_transform = 'AgX'
    scn.view_settings.look = 'None'
    world = bpy.data.worlds.new('studio'); scn.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.32, 0.33, 0.34, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    floor = bpy.context.active_object
    fm = bpy.data.materials.new('floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.36, 0.36, 0.36, 1)
    fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    floor.data.materials.append(fm)
    s = target_height
    for name, loc, energy, size, col in [
        ('key', (-1.6 * s, -2.2 * s, 2.2 * s), 160, 1.2 * s, (1.0, 0.97, 0.92)),
        ('fill', (2.4 * s, -1.6 * s, 1.0 * s), 45, 2.0 * s, (0.9, 0.95, 1.0)),
        ('rim', (0.6 * s, 2.6 * s, 2.0 * s), 110, 0.8 * s, (1.0, 1.0, 1.0)),
    ]:
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy * s * s; ld.size = size; ld.color = col
        lo = bpy.data.objects.new(name, ld); scn.collection.objects.link(lo); lo.location = loc
        d = Vector((0, 0, centre_y)) - lo.location
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam = bpy.data.cameras.new('cam'); cam.lens = 70
    co = bpy.data.objects.new('cam', cam); scn.collection.objects.link(co); scn.camera = co


def review_shot(path: str, yaw_deg: float, dist: float, look_y: float, lens: float = 70, res: int = 900, look_x: float = 0.0,
                look_z: float = 0.0) -> None:
    """Look at the game-space point (look_x, look_y, look_z) from `dist` at a yaw (0 = in front)."""
    scn = bpy.context.scene
    co = scn.camera
    co.data.lens = lens
    a = math.radians(yaw_deg)
    # Game +Z (the figure's front) is Blender -Y.
    tx, ty, tz = look_x, -look_z, look_y
    co.location = (tx + math.sin(a) * dist, ty - math.cos(a) * dist, tz + dist * 0.06)
    d = Vector((tx, ty, tz)) - co.location
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scn.render.resolution_x = res; scn.render.resolution_y = res
    scn.render.image_settings.file_format = 'JPEG'
    scn.render.image_settings.quality = 88
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
