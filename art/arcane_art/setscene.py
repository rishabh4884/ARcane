"""
SET SCENE
=========
Compose a painted set's layout in Blender exactly as the game lays the place out (from
art/sets/<set>_layout.json, written by tools/dump-set.ts): the ground with its painted masks, every tree
and stone, the lanterns along the path, the forgotten gate at the path's end and the pool, lit by the
moon behind the treeline, the sky and the lanterns, seen through the game's own camera.

It does not render a picture to be filtered. It renders what a background painter would gather before
painting — each light on its own and the facts of the place — and the painter (painter.py, outside
Blender) designs the picture from them:

  albedo    local colour of everything (emission, anti-aliased)
  moon      white surfaces lit by the moon alone (its shadows, its rim on every edge facing it)
  sky       white surfaces lit by the sky alone (how open each place is to the sky)
  lamp      white surfaces lit by the lanterns alone (their warm pools)
  position  world position in game coordinates (metres)
  normal    world normal in game coordinates
  ids       class (sky, ground, trunk, stone, leaf, lantern, glass, gate, water) and a random per object
"""
from __future__ import annotations

import json
import math
import os
import time

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

from . import bl
from .mesh import mesh_sculpt

# Class ids, written as id / 10 into the ids pass.
CLASS = {'sky': 0, 'ground': 1, 'trunk': 2, 'rock': 3, 'leaf': 4, 'lantern': 5, 'glass': 6, 'gate': 7, 'water': 8}


def log(*a):
    print('[set]', *a, flush=True)


def load(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def tag(ob: bpy.types.Object, klass: str) -> None:
    ob['klass'] = CLASS[klass]
    ob.color = (CLASS[klass] / 10, 0, 0, 1)


# ───────────────────────────── the place ─────────────────────────────

def ground_object(layout: dict) -> bpy.types.Object:
    g = layout['ground']
    size, seg = g['size'], g['seg']
    n = seg + 1
    xs = np.linspace(-size / 2, size / 2, n)
    X, Z = np.meshgrid(xs, xs)
    H = np.asarray(g['heights'], float).reshape(n, n)
    V = np.stack([X.ravel(), H.ravel(), Z.ravel()], axis=1)
    faces = []
    for j in range(seg):
        for i in range(seg):
            a = j * n + i
            faces.append((a, a + n, a + n + 1, a + 1))
    ob = bl.mesh_object('ground', V, faces)
    bl.shade_smooth(ob)
    cols = np.asarray(g['colors'], float).reshape(-1, 3)
    bl.set_vertex_colors(ob, 'albedo', cols)
    bl.set_vertex_colors(ob, 'leaf', np.zeros((len(cols), 3)))
    tag(ob, 'ground')
    return ob


def sculpt_object(name: str, spec, cell_scale: float, paint) -> bpy.types.Object:
    """Mesh an asset's sculpt parts coarsely and paint them (a layout for painting, not a game asset)."""
    from .pipeline import Surface
    objs = []
    for part in spec.parts:
        V, F = mesh_sculpt(part.sculpt, part.cell * cell_scale, log=lambda *a: None)
        ob = bl.mesh_object(f'{name}-{part.sculpt.name}', V, F)
        bl.clean(ob, merge=part.cell * cell_scale * 0.05)
        bl.shade_smooth(ob)
        Vg = bl.verts_game(ob)
        attrs = part.sculpt.attributes(Vg)
        s = Surface(V=Vg, N=bl.normals_game(ob), color=attrs['color'], mat=attrs['mat'], zone=attrs['zone'], bones=attrs['bones'],
                    curv=bl.curvature(ob), ao=np.ones(len(Vg)))
        p = paint(s)
        bl.set_vertex_colors(ob, 'albedo', np.clip(p.albedo, 0, 1))
        leaf = (attrs['zone'] == 'leaf').astype(float)
        bl.set_vertex_colors(ob, 'leaf', np.stack([leaf, leaf, leaf], axis=1))
        objs.append(ob)
    if len(objs) > 1:
        bl.activate(objs[0], *objs[1:])
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def cached_prototypes(kinds: dict, cache: str, sources: list[str]) -> dict:
    """The coarse prototypes (minutes to mesh) are kept in a .blend until their asset sources change."""
    stamp = max(os.path.getmtime(s) for s in sources)
    meta = cache + '.json'
    if os.path.exists(cache) and os.path.exists(meta) and json.load(open(meta)).get('stamp') == stamp:
        with bpy.data.libraries.load(cache, link=False) as (src, dst):
            dst.objects = [n for n in src.objects if n in kinds]
        out = {}
        for ob in dst.objects:
            bpy.context.scene.collection.objects.link(ob)
            out[ob.name] = ob
        if set(out) == set(kinds):
            log(f'prototypes from cache ({len(out)})')
            return out
        for ob in out.values():
            bpy.data.objects.remove(ob)
    out = {}
    for name, make in kinds.items():
        t = time.time()
        out[name] = make()
        out[name].name = name
        log(f'{name} prototype in {time.time() - t:.0f}s, {len(out[name].data.polygons)} faces')
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    bpy.data.libraries.write(cache, set(out.values()), fake_user=True)
    json.dump({'stamp': stamp}, open(meta, 'w'))
    return out


def place(proto: bpy.types.Object, name: str, x: float, y: float, z: float, yaw: float, scale) -> bpy.types.Object:
    o = bpy.data.objects.new(name, proto.data)
    bpy.context.scene.collection.objects.link(o)
    o.location = (x, -z, y)
    o.rotation_euler = (0, 0, yaw)
    s = scale if isinstance(scale, (list, tuple)) else (scale, scale, scale)
    o.scale = (s[0], s[2], s[1])
    o['klass'] = proto.get('klass', CLASS['trunk'])
    o.color = (o['klass'] / 10, 0, 0, 1)
    return o


def _bm_object(name: str, bm: bmesh.types.BMesh, colors: list, klass: str) -> bpy.types.Object:
    """A bmesh built in game coordinates → an object with per-face colours as point colours."""
    me = bpy.data.meshes.new(name)
    for v in bm.verts:
        x, y, z = v.co
        v.co = (x, -z, y)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    cols = np.asarray(colors, float)
    # colours per vertex: every vertex takes the colour of the piece it was made with
    bl.set_vertex_colors(ob, 'albedo', cols)
    bl.set_vertex_colors(ob, 'leaf', np.zeros((len(cols), 3)))
    tag(ob, klass)
    return ob


def _box(bm, centre, size, rot=(0.0, 0.0, 0.0)):
    r = Matrix.Rotation(rot[1], 4, 'Y') @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Rotation(rot[2], 4, 'Z')
    m = Matrix.Translation(Vector(centre)) @ r @ Matrix.Diagonal((*size, 1.0))
    return bmesh.ops.create_cube(bm, size=1.0, matrix=m)['verts']


def _tube(bm, a, b, r0, r1, segments=8):
    a, b = Vector(a), Vector(b)
    d = b - a
    rot = d.to_track_quat('Y', 'Z').to_matrix().to_4x4()
    m = Matrix.Translation((a + b) / 2) @ rot
    return bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r0, radius2=r1, depth=d.length, matrix=m @ Matrix.Rotation(-math.pi / 2, 4, 'X'))['verts']


def lantern_objects(site: dict) -> list[bpy.types.Object]:
    """A path lantern as the game hangs it: a crooked post, an arm, a caged lamp with a lit pane."""
    s = site['scale']
    bm = bmesh.new()
    cols = []
    timber, bronze = (0.09, 0.07, 0.05), (0.13, 0.1, 0.06)

    def add(verts, c):
        cols.extend([c] * len(verts))
    add(_tube(bm, (0, -0.1, 0), (0.04, 1.6, 0), 0.16, 0.12, 9), timber)
    add(_tube(bm, (0.04, 1.6, 0), (0.12, 3.2, 0.02), 0.12, 0.085, 9), timber)
    add(_tube(bm, (0.12, 3.2, 0.02), (0.15, 4.6, 0), 0.085, 0.06, 9), timber)
    add(_tube(bm, (0.08, 4.14, 0), (0.6, 4.3, 0), 0.075, 0.06, 7), timber)
    add(_tube(bm, (0.6, 4.3, 0), (1.08, 4.1, 0), 0.06, 0.035, 7), timber)
    add(_tube(bm, (0.92, 4.1, 0), (0.92, 3.68, 0), 0.012, 0.012, 5), bronze)
    add(_tube(bm, (0.92, 3.64, 0), (0.92, 3.92, 0), 0.34, 0.02, 9), bronze)    # the hood
    add(_box(bm, (0.92, 2.95, 0), (0.5, 0.05, 0.43)), bronze)                  # the base
    for sx in (-1, 1):
        for sz in (-1, 1):
            add(_box(bm, (0.92 + sx * 0.23, 3.3, sz * 0.19), (0.04, 0.72, 0.04)), bronze)
    post = _bm_object(f"lantern-{site['index']}", bm, cols, 'lantern')
    bm = bmesh.new()
    v = _box(bm, (0.92, 3.3, 0), (0.42, 0.62, 0.36))
    glass = _bm_object(f"lantern-glass-{site['index']}", bm, [(1.0, 0.62, 0.25)] * len(v), 'glass')
    glass.visible_shadow = False    # the flame's light passes through its own panes
    for o in (post, glass):
        o.location = (site['x'], -site['z'], site['y'])
        o.scale = (s, s, s)
    return [post, glass]


def gate_object(x: float, y: float, z: float, yaw: float, seed: int = 5, scale: float = 1.45) -> bpy.types.Object:
    """The forgotten gate: an arch of rough-cut blocks on two piers, its right shoulder fallen, moss on
    every top, two blocks lying where they dropped."""
    rng = np.random.default_rng(seed)
    bm = bmesh.new()
    cols = []
    stone = np.array([0.2, 0.21, 0.19])

    def block(centre, size, rot):
        tint = stone * (0.8 + rng.random() * 0.4) + np.array([0.02, 0.015, 0.0]) * rng.random()
        v = _box(bm, centre, size, rot)
        cols.extend([tuple(tint)] * len(v))
    span, pier_h = 2.95, 3.5
    for side in (-1, 1):
        h = 0.0
        while h < pier_h - 0.1:
            bh = 0.62 + rng.random() * 0.22
            j = lambda k: (rng.random() - 0.5) * k  # noqa: E731
            block((side * span + j(0.1), h + bh / 2, j(0.08)), (1.0 + j(0.16), bh, 0.95 + j(0.12)), (j(0.04), j(0.12), j(0.05)))
            h += bh + 0.015
    n = 11
    for i in range(n):
        a = math.pi * (i + 0.5) / n
        if i in (1, 2):         # the fallen shoulder
            continue
        r = span + 0.02 * (rng.random() - 0.5)
        c = (math.cos(a) * r, pier_h + math.sin(a) * r, (rng.random() - 0.5) * 0.06)
        size = (0.92 if i != n // 2 else 1.05, 0.78 if i != n // 2 else 0.95, 0.92)
        block(c, size, (0, (rng.random() - 0.5) * 0.06, a - math.pi / 2 + (rng.random() - 0.5) * 0.05))
    block((span + 1.6, 0.36, 1.1), (0.95, 0.72, 0.88), (0.3, 0.6, 0.25))
    block((span + 0.4, 0.3, 2.0), (0.9, 0.6, 0.9), (-0.1, 1.2, -0.35))
    ob = _bm_object('gate', bm, cols, 'gate')
    # Moss on what faces up.
    me = ob.data
    nrm = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('normal', nrm)
    up = nrm.reshape(-1, 3)[:, 2]
    c = bl.get_vertex_colors(ob, 'albedo')[:, :3]
    moss = np.array([0.075, 0.1, 0.035])
    c = c * (1 - np.clip(up * 1.4 - 0.4, 0, 1)[:, None]) + moss * np.clip(up * 1.4 - 0.4, 0, 1)[:, None]
    bl.set_vertex_colors(ob, 'albedo', c)
    ob.location = (x, -z, y)
    ob.rotation_euler = (0, 0, yaw)
    ob.scale = (scale, scale, scale)
    return ob


def pool_object(p: dict) -> bpy.types.Object:
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=1.0, fill_type='NGON', location=(p['x'], -p['z'], p['y']))
    ob = bpy.context.active_object
    ob.name = 'pool'
    ob.scale = (p['rx'], p['rz'], 1)
    bl.set_vertex_colors(ob, 'albedo', np.tile([[0.02, 0.04, 0.045]], (len(ob.data.vertices), 1)))
    bl.set_vertex_colors(ob, 'leaf', np.zeros((len(ob.data.vertices), 3)))
    tag(ob, 'water')
    return ob


# ───────────────────────────── camera and light ─────────────────────────────

def game_camera(layout: dict, width: int, height: int, fov_pad: float = 1.06) -> bpy.types.Object:
    c = layout['camera']
    cam = bpy.data.cameras.new('game')
    cam.sensor_fit = 'VERTICAL'
    cam.angle_y = math.radians(c['fov'] * fov_pad)
    cam.clip_start = 0.15
    cam.clip_end = 400
    co = bpy.data.objects.new('game', cam)
    bpy.context.scene.collection.objects.link(co)
    p = c['position']; t = c['lookAt']
    co.location = (p[0], -p[2], p[1])
    d = Vector((t[0], -t[2], t[1])) - co.location
    co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scn = bpy.context.scene
    scn.camera = co
    scn.render.resolution_x = width
    scn.render.resolution_y = height
    scn.render.resolution_percentage = 100
    return co


def lights(layout: dict) -> dict:
    """The moon (a sun behind the treeline) and a point light in every lantern. Each light gets its own
    pass, so their strengths here only need to be in proportion within one light."""
    m = Vector(layout['moon'])
    moon_dir = Vector((m.x, -m.z, m.y)).normalized()  # toward the moon, Blender space
    ld = bpy.data.lights.new('moon', 'SUN')
    ld.energy = 3.0
    ld.angle = math.radians(1.4)
    moon = bpy.data.objects.new('moon', ld)
    bpy.context.scene.collection.objects.link(moon)
    moon.rotation_euler = (-moon_dir).to_track_quat('-Z', 'Y').to_euler()
    lamps = []
    for site in layout.get('lanterns', []):
        s = site['scale']
        pl = bpy.data.lights.new(f"lamp-{site['index']}", 'POINT')
        pl.energy = 220 * site['strength'] * s
        pl.shadow_soft_size = 0.18 * s
        lo = bpy.data.objects.new(pl.name, pl)
        bpy.context.scene.collection.objects.link(lo)
        lo.location = (site['x'] + site['arm'] * s, -site['z'], site['y'] + site['lampHeight'] * s)
        lamps.append(lo)
    return {'moon': moon, 'lamps': lamps}


def world(strength: float = 1.0) -> None:
    w = bpy.data.worlds.new('sky')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (1, 1, 1, 1)
    bg.inputs['Strength'].default_value = strength


# ───────────────────────────── passes ─────────────────────────────

def _override(make_surface) -> bpy.types.Material:
    over = bpy.data.materials.new('override')
    over.use_nodes = True
    nt = over.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(make_surface(nt), out.inputs['Surface'])
    return over


def _emission(make_color):
    def surface(nt):
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(make_color(nt), em.inputs['Color'])
        return em.outputs['Emission']
    return surface


def _white_diffuse(nt):
    """White matte everywhere; leaves let a little light through, glass glows faintly from within."""
    dif = nt.nodes.new('ShaderNodeBsdfDiffuse')
    dif.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
    tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
    tr.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
    lf = nt.nodes.new('ShaderNodeVertexColor'); lf.layer_name = 'leaf'
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(lf.outputs['Color'], sep.inputs['Color'])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 0.4
    nt.links.new(sep.outputs['Red'], mul.inputs[0])
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(mul.outputs['Value'], mix.inputs['Fac'])
    nt.links.new(dif.outputs['BSDF'], mix.inputs[1])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[2])
    return mix.outputs['Shader']


def _render(path: str, material: bpy.types.Material, samples: int, denoise: bool, exr: bool,
            world_strength: float, lights_on: set, all_lights: list) -> None:
    scn = bpy.context.scene
    meshes = {o.data for o in scn.objects if o.type == 'MESH'}
    saved = {me: list(me.materials) for me in meshes}
    for me in meshes:
        me.materials.clear(); me.materials.append(material)
    for lo in all_lights:
        lo.hide_render = lo.name not in lights_on
    scn.world.node_tree.nodes['Background'].inputs['Strength'].default_value = world_strength
    scn.cycles.samples = samples
    scn.cycles.use_denoising = denoise
    scn.cycles.filter_width = 1.5 if samples > 1 else 0.01
    scn.render.film_transparent = False
    scn.view_settings.view_transform = 'Standard'
    scn.view_settings.look = 'None'
    s = scn.render.image_settings
    s.file_format = 'OPEN_EXR'; s.color_depth = '32'; s.color_mode = 'RGB'; s.exr_codec = 'ZIP'
    scn.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    log(f'{os.path.basename(path)} in {time.time() - t:.0f}s')
    for me, mats in saved.items():
        me.materials.clear()
        for m in mats:
            me.materials.append(m)


def render_passes(out: str, rig: dict, samples: int = 64) -> list[str]:
    os.makedirs(out, exist_ok=True)
    scn = bpy.context.scene
    scn.render.engine = 'CYCLES'
    scn.cycles.max_bounces = 4
    scn.cycles.diffuse_bounces = 2
    moon = rig['moon']
    lamps = rig['lamps']
    every = [moon, *lamps]
    names = []

    def albedo(nt):
        ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'albedo'
        return ca.outputs['Color']

    def position(nt):
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        return geo.outputs['Position']

    def normal(nt):
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        return geo.outputs['Normal']

    def ids(nt):
        info = nt.nodes.new('ShaderNodeObjectInfo')
        lf = nt.nodes.new('ShaderNodeVertexColor'); lf.layer_name = 'leaf'
        sep_l = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(lf.outputs['Color'], sep_l.inputs['Color'])
        sep_o = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(info.outputs['Color'], sep_o.inputs['Color'])
        # class: the object's, or leaf where the leaf mask says so
        step = nt.nodes.new('ShaderNodeMath'); step.operation = 'GREATER_THAN'; step.inputs[1].default_value = 0.5
        nt.links.new(sep_l.outputs['Red'], step.inputs[0])
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'FLOAT'
        nt.links.new(step.outputs['Value'], mix.inputs['Factor'])
        nt.links.new(sep_o.outputs['Red'], mix.inputs['A'])
        mix.inputs['B'].default_value = CLASS['leaf'] / 10
        comb = nt.nodes.new('ShaderNodeCombineColor')
        nt.links.new(mix.outputs['Result'], comb.inputs['Red'])
        nt.links.new(info.outputs['Random'], comb.inputs['Green'])
        return comb.outputs['Color']

    plan = [
        ('albedo', _override(_emission(albedo)), 16, False, 0.0, set()),
        ('position', _override(_emission(position)), 1, False, 0.0, set()),
        ('normal', _override(_emission(normal)), 1, False, 0.0, set()),
        ('ids', _override(_emission(ids)), 1, False, 0.0, set()),
        ('moon', _override(_white_diffuse), samples, True, 0.0, {moon.name}),
        ('sky', _override(_white_diffuse), samples, True, 1.0, set()),
        ('lamp', _override(_white_diffuse), samples, True, 0.0, {lo.name for lo in lamps}),
    ]
    for name, mat, spp, dn, ws, on in plan:
        path = os.path.join(out, f'{name}.exr')
        _render(path, mat, spp, dn, True, ws, on, every)
        names.append(path)
    return names


def read_exr(path: str) -> np.ndarray:
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1, :, :3]  # top row first
