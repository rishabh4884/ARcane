"""
BALROG -> MYSTIC  (Genshin-style Blender scene pass for lowpoly+balrog.blend)
Tested target: Blender 4.2 LTS (written to also work on 4.3 - 4.5).

HOW TO RUN
   1. Open lowpoly+balrog.blend in Blender.
  2. Go to the Scripting workspace > Text > Open > pick this file > Run Script (Alt+P).
  3. Press Space in the viewport to play the 10 s loop. Use Material Preview / Rendered view.

WHAT IT ADDS  (everything is prefixed "BM_" and lives in collection "Balrog_Mystic")
  - Anime/Genshin toon shading on the body (keeps your vertex colours; lava parts glow),
    cyan rim light, flowing arcane veins, ink outline, bloom, violet night sky
   - Optional pair of animated auxiliary wings (disabled for the already-winged source)
  - Glowing slit eyes (pulse + blink), fangs, jaw that opens, glowing maw
  - Rotating golden halo behind the head, rune circle under the feet, floating light motes
   - Gentle hover/bob + sway on the whole creature
   - Saves a separate lowpoly_balrog_mystic.blend; the source file is not overwritten
   - Blender scene output only: custom shaders/drivers are not a game-ready GLB export

GAME EXPORT (keeps the painted texture and original sculpt, adds a real skin and clips)
   blender --background --factory-startup --python balrog_mystic.py -- --game
   Outputs public/assets/boss/balrog-mystic.glb and balrog_mystic_game.blend.
   The game path deliberately excludes the viewport-only toon graph and guessed face.

IF SOMETHING LOOKS OFF (the script can't see your model, so parts are placed by bounding-box guesses)
  - Select  BM_Face_Anchor   -> move / rotate / scale it onto the head (eyes, mouth, halo follow)
  - Select  BM_Shoulder_L/R  -> move / scale them to the shoulders (wings follow)
  - Face on the back of the head?  set FLIP_FACING = True below and run again (it cleans up first)
   - The supplied source is Z-up and faces +X. Other models need explicit UP_AXIS/FACE_YAW.
"""
import os
import random

import bmesh
import bpy
from math import radians, pi, sin, cos, tau
from mathutils import Vector, Matrix, Euler, Quaternion

# ============================== CONFIG ==============================
UP_AXIS = 'Z'           # Explicit: longest dimension can be the wingspan, not height.
FACE_YAW = 90.0         # Rig front -Y -> source face +X; rig wingspan X -> source axis Y.
FLIP_FACING = False     # True if eyes/mouth/halo appear on the back of the head
DURATION = 240          # loop length in frames (10 s at 24 fps)
FPS = 24
ADD_WINGS = False       # The source sculpt already has wings; avoid overlaying a second pair.
ADD_FACE = False        # Preserve the sculpted face instead of guessed floating eyes/jaw.
ADD_AURA = True         # halo, rune circle, motes
ADD_OUTLINE = True      # inked outline around the body
MOTE_COUNT = 24
WING_PERIOD = 80        # frames per flap (must divide DURATION for a seamless loop)
SAVE_AS = "lowpoly_balrog_mystic.blend"   # saved next to the original; '' = don't save

# Palette
SHADOW = (0.30, 0.22, 0.58)       # toon shadow tint (violet, never black)
MIDTONE = (0.74, 0.66, 0.95)
LIGHTC = (1.0, 1.0, 1.0)
RIM = (0.30, 0.90, 1.00)          # cyan rim light
GOLD = (1.0, 0.72, 0.22)
EMBER = (1.0, 0.45, 0.08)
ARCANE = (0.55, 0.32, 1.0)
INK = (0.04, 0.0, 0.10)
BODY_BRIGHTEN = 1.8               # lift the source palette without clipping it to white
BODY_TINT = (0.34, 0.18, 0.62)
BODY_TINT_AMT = 0.28
CAM_LIGHT = Vector((-0.45, 0.55, 0.70)).normalized()   # light direction in camera space

PREFIX = "BM_"
COL_NAME = "Balrog_Mystic"
COL = None


# ============================== HELPERS ==============================
def S(x):
    return (x, x, x)


def rgba(c, a=1.0):
    return (c[0], c[1], c[2], a)


def ensure_object_mode():
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass


def find_body():
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith(PREFIX)]
    if not meshes:
        raise RuntimeError("No mesh found - open lowpoly_balrog.blend first.")
    return max(meshes, key=lambda o: len(o.data.vertices))


def cleanup(body):
    """Remove everything a previous run created so the script can be re-run."""
    saved_matrix = body.get('BM_SourceMatrix')
    if saved_matrix is None:
        body['BM_SourceMatrix'] = [value for row in body.matrix_world for value in row]
    else:
        rest = Matrix([saved_matrix[i:i + 4] for i in range(0, 16, 4)])
    if body.parent and body.parent.name.startswith(PREFIX):
        mw = body.matrix_world.copy()
        body.parent = None
        body.matrix_world = mw
    if saved_matrix is not None:
        body.matrix_world = rest
    for m in list(body.modifiers):
        if m.name.startswith(PREFIX):
            body.modifiers.remove(m)
    for o in [o for o in bpy.data.objects if o.name.startswith(PREFIX)]:
        bpy.data.objects.remove(o, do_unlink=True)
    # Remove generated slots left on the unprefixed body by previous runs.
    for i in reversed(range(len(body.data.materials))):
        mat = body.data.materials[i]
        if mat and mat.name.startswith(PREFIX):
            body.data.materials.pop(index=i)
    for coll in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions):
        for d in [d for d in coll if d.name.startswith(PREFIX) and d.users == 0]:
            coll.remove(d)
    bpy.context.view_layer.update()


def get_collection():
    col = bpy.data.collections.get(COL_NAME)
    if col is None:
        col = bpy.data.collections.new(COL_NAME)
        bpy.context.scene.collection.children.link(col)
    return col


def add_obj(name, data=None, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    o = bpy.data.objects.new(PREFIX + name, data)
    COL.objects.link(o)
    o.parent = parent
    o.location = loc
    o.rotation_euler = rot
    o.scale = scale
    return o


def add_empty(name, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1),
              display='PLAIN_AXES', size=1.0):
    o = add_obj(name, None, parent, loc, rot, scale)
    o.empty_display_type = display
    o.empty_display_size = size
    return o


def mesh_from(name, verts, faces, mats=None):
    me = bpy.data.meshes.new(PREFIX + name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    if mats:
        for p, mi in zip(me.polygons, mats):
            p.material_index = mi
    return me


def ico_mesh(name, subdiv=2, radius=1.0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    me = bpy.data.meshes.new(PREFIX + name)
    bm.to_mesh(me)
    bm.free()
    return me


def drive(target, path, index, expr, variables=()):
    """Add a simple-expression driver (works without 'auto-run Python')."""
    fc = target.driver_add(path, index) if index is not None else target.driver_add(path)
    for m in list(fc.modifiers):
        fc.modifiers.remove(m)
    d = fc.driver
    d.type = 'SCRIPTED'
    d.expression = expr
    for vname, obj, ttype in variables:
        v = d.variables.new()
        v.name = vname
        v.type = 'TRANSFORMS'
        t = v.targets[0]
        t.id = obj
        t.transform_type = ttype
        t.transform_space = 'LOCAL_SPACE'
    return fc


# ============================== SHADER HELPERS ==============================
def new_mat(name):
    m = bpy.data.materials.new(PREFIX + name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    return m, nt


def node(nt, idname, loc=(0, 0), **props):
    n = nt.nodes.new(idname)
    n.location = loc
    for k, v in props.items():
        setattr(n, k, v)
    return n


def M(nt, op, a=None, b=None, c=None, clamp=False):
    """Math node; a/b/c are floats or output sockets. Returns the output socket."""
    n = node(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
    for i, v in enumerate((a, b, c)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def ramp(nt, fac, stops, interp='LINEAR'):
    n = node(nt, 'ShaderNodeValToRGB')
    cr = n.color_ramp
    cr.interpolation = interp
    while len(cr.elements) < len(stops):
        cr.elements.new(1.0)
    for e, (pos, col) in zip(cr.elements, stops):
        e.position = pos
        e.color = rgba(col) if len(col) == 3 else col
    nt.links.new(fac, n.inputs[0])
    return n.outputs[0]


def emission(nt, color, strength):
    """color: rgb tuple or socket; strength: float or socket. Returns the node."""
    n = node(nt, 'ShaderNodeEmission')
    if isinstance(color, tuple):
        n.inputs['Color'].default_value = rgba(color)
    else:
        nt.links.new(color, n.inputs['Color'])
    if isinstance(strength, (int, float)):
        n.inputs['Strength'].default_value = strength
    else:
        nt.links.new(strength, n.inputs['Strength'])
    return n


def add_shaders(nt, a, b):
    n = node(nt, 'ShaderNodeAddShader')
    nt.links.new(a, n.inputs[0])
    nt.links.new(b, n.inputs[1])
    return n.outputs[0]


def mix_rgb(nt, blend, fac, c1, c2):
    n = node(nt, 'ShaderNodeMixRGB', blend_type=blend)
    if isinstance(fac, (int, float)):
        n.inputs[0].default_value = fac
    else:
        nt.links.new(fac, n.inputs[0])
    for i, c in ((1, c1), (2, c2)):
        if isinstance(c, tuple):
            n.inputs[i].default_value = rgba(c)
        else:
            nt.links.new(c, n.inputs[i])
    return n.outputs[0]


def vein_pattern(nt, scale, coord='Object'):
    """Thin glowing 'ley-line' curves from animated noise. Returns scalar socket 0..1."""
    tc = node(nt, 'ShaderNodeTexCoord')
    nz = node(nt, 'ShaderNodeTexNoise', noise_dimensions='4D')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 3.0
    nz.inputs['Roughness'].default_value = 0.55
    nt.links.new(tc.outputs[coord], nz.inputs['Vector'])
    drive(nz.inputs['W'], 'default_value', None, "0.9*sin(frame*%.6f)" % (tau / DURATION))
    d = M(nt, 'ABSOLUTE', M(nt, 'SUBTRACT', nz.outputs['Fac'], 0.5))
    return M(nt, 'ADD', ramp(nt, d, [(0.0, (1, 1, 1)), (0.03, (0, 0, 0))]), 0.0)


def make_toon(name, base=None, vcol=None, brighten=1.0, tint=None, tint_amt=0.0,
              rim=RIM, veins=None, vein_scale=1.0, vein_strength=3.0, lava=False):
    m, nt = new_mat(name)
    out = node(nt, 'ShaderNodeOutputMaterial')
    geo = node(nt, 'ShaderNodeNewGeometry')
    vt = node(nt, 'ShaderNodeVectorTransform', vector_type='NORMAL',
              convert_from='WORLD', convert_to='CAMERA')
    nt.links.new(geo.outputs['Normal'], vt.inputs[0])
    dot = node(nt, 'ShaderNodeVectorMath', operation='DOT_PRODUCT')
    dot.inputs[1].default_value = CAM_LIGHT
    nt.links.new(vt.outputs[0], dot.inputs[0])
    lam = M(nt, 'MULTIPLY_ADD', dot.outputs['Value'], 0.5, 0.5)
    shade = ramp(nt, lam, [(0.0, SHADOW), (0.44, MIDTONE), (0.74, LIGHTC)], 'CONSTANT')

    if vcol:
        orig = node(nt, 'ShaderNodeAttribute', attribute_name=vcol,
                    attribute_type='GEOMETRY').outputs['Color']
    else:
        c = node(nt, 'ShaderNodeRGB')
        c.outputs[0].default_value = rgba(base or (0.1, 0.1, 0.1))
        orig = c.outputs[0]
    col = orig
    if brighten != 1.0:
        col = mix_rgb(nt, 'MULTIPLY', 1.0, col, (brighten, brighten, brighten))
    if tint and tint_amt > 0:
        col = mix_rgb(nt, 'MIX', tint_amt, col, tint)
    toon = mix_rgb(nt, 'MULTIPLY', 1.0, col, shade)
    result = emission(nt, toon, 1.0).outputs[0]

    fres = node(nt, 'ShaderNodeLayerWeight')
    fres.inputs['Blend'].default_value = 0.35
    rim_c = ramp(nt, fres.outputs['Fresnel'], [(0.0, (0, 0, 0)), (0.58, rim)], 'CONSTANT')
    result = add_shaders(nt, result, emission(nt, rim_c, 0.65).outputs[0])

    lava_mask = None
    if lava and vcol:
        bw = node(nt, 'ShaderNodeRGBToBW')
        nt.links.new(orig, bw.inputs[0])
        lava_mask = ramp(nt, bw.outputs[0], [(0.10, (0, 0, 0)), (0.28, (1, 1, 1))])
        lava_col = mix_rgb(nt, 'MULTIPLY', 1.0, orig, lava_mask)
        result = add_shaders(nt, result, emission(nt, lava_col, 1.1).outputs[0])

    if veins:
        v = vein_pattern(nt, vein_scale)
        if lava_mask is not None:
            v = M(nt, 'MULTIPLY', v, M(nt, 'SUBTRACT', 1.0, lava_mask, clamp=True))
        result = add_shaders(nt, result,
                             emission(nt, veins, M(nt, 'MULTIPLY', v, vein_strength)).outputs[0])
    nt.links.new(result, out.inputs[0])
    return m


def make_emit(name, color, strength):
    m, nt = new_mat(name)
    out = node(nt, 'ShaderNodeOutputMaterial')
    em = emission(nt, color, strength)
    nt.links.new(em.outputs[0], out.inputs[0])
    return m, em


def set_blended(m):
    try:
        m.surface_render_method = 'BLENDED'
    except Exception:
        try:
            m.blend_method = 'BLEND'
        except Exception:
            pass
    m.use_backface_culling = False


def make_membrane():
    m, nt = new_mat('WingMembrane')
    out = node(nt, 'ShaderNodeOutputMaterial')
    tc = node(nt, 'ShaderNodeTexCoord')
    sep = node(nt, 'ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    t = M(nt, 'MULTIPLY', M(nt, 'ABSOLUTE', sep.outputs['X']), 1 / 1.34, clamp=True)
    col = ramp(nt, t, [(0.0, (0.22, 0.08, 0.60)), (0.5, (0.18, 0.42, 1.0)), (1.0, (0.35, 1.0, 1.0))])
    veins = vein_pattern(nt, 3.0)
    shader = add_shaders(nt, emission(nt, col, 1.0).outputs[0],
                         emission(nt, GOLD, M(nt, 'MULTIPLY', veins, 1.2)).outputs[0])
    alpha = M(nt, 'MAXIMUM', M(nt, 'MULTIPLY_ADD', t, -0.45, 0.82), veins)
    tr = node(nt, 'ShaderNodeBsdfTransparent')
    mx = node(nt, 'ShaderNodeMixShader')
    nt.links.new(alpha, mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(shader, mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs[0])
    set_blended(m)
    return m


def make_circle_mat():
    """Procedural rune circle: rings + tick marks + soft ground glow."""
    m, nt = new_mat('RuneCircle')
    out = node(nt, 'ShaderNodeOutputMaterial')
    tc = node(nt, 'ShaderNodeTexCoord')
    r = node(nt, 'ShaderNodeVectorMath', operation='LENGTH')
    nt.links.new(tc.outputs['Object'], r.inputs[0])
    r = r.outputs['Value']
    sep = node(nt, 'ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])

    def soft(dist, w):  # 1 inside |dist|<w, soft edge
        return M(nt, 'MULTIPLY', M(nt, 'SUBTRACT', w, dist), 1.0 / (0.35 * w), clamp=True)

    masks = [soft(M(nt, 'ABSOLUTE', M(nt, 'SUBTRACT', r, r0)), w)
             for r0, w in ((0.97, 0.014), (0.90, 0.007), (0.62, 0.009), (0.30, 0.007))]
    ang = M(nt, 'ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
    cyc = M(nt, 'FRACT', M(nt, 'MULTIPLY', ang, 36 / tau))
    tick = soft(M(nt, 'ABSOLUTE', M(nt, 'SUBTRACT', cyc, 0.5)), 0.07)
    band = soft(M(nt, 'ABSOLUTE', M(nt, 'SUBTRACT', r, 0.76)), 0.14)
    masks.append(M(nt, 'MULTIPLY', tick, band))
    mask = masks[0]
    for k in masks[1:]:
        mask = M(nt, 'MAXIMUM', mask, k)
    glow = M(nt, 'MULTIPLY', M(nt, 'POWER', M(nt, 'SUBTRACT', 1.0, r, clamp=True), 2.5), 0.35)
    col = mix_rgb(nt, 'MIX', mask, (0.35, 0.15, 0.9), GOLD)
    em = emission(nt, col, 1.25)
    tr = node(nt, 'ShaderNodeBsdfTransparent')
    mx = node(nt, 'ShaderNodeMixShader')
    nt.links.new(M(nt, 'MAXIMUM', mask, glow), mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(em.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs[0])
    set_blended(m)
    return m


# ============================== BODY / FRAME ==============================
def detect_body_color(body):
    me = body.data
    try:
        if len(me.color_attributes):
            attr = me.color_attributes.active_color or me.color_attributes[0]
            return None, attr.name
    except Exception:
        pass
    for slot in body.material_slots:
        mt = slot.material
        if mt and mt.use_nodes:
            for n in mt.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    return tuple(n.inputs['Base Color'].default_value)[:3], None
    return (0.12, 0.06, 0.15), None


def compute_frame(body):
    """Rig frame: +Z up along the model's long axis, -Y = face direction."""
    mw = body.matrix_world
    corners = [mw @ Vector(c) for c in body.bound_box]
    ext = [max(c[i] for c in corners) - min(c[i] for c in corners) for i in range(3)]
    up = ext.index(max(ext)) if UP_AXIS == 'AUTO' else 'XYZ'.index(UP_AXIS)
    R3 = [Euler((0, radians(90), 0)), Euler((radians(-90), 0, 0)), Euler((0, 0, 0))][up].to_matrix()
    if up == 2:
        R3 = Matrix.Rotation(radians(FACE_YAW), 3, 'Z') @ R3
    if FLIP_FACING:
        R3 = R3 @ Matrix.Rotation(pi, 3, 'Z')
    inv = R3.inverted()
    pts = [inv @ c for c in corners]
    mn = Vector([min(p[i] for p in pts) for i in range(3)])
    mx = Vector([max(p[i] for p in pts) for i in range(3)])
    root_loc = R3 @ Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    return R3, root_loc, mx.x - mn.x, mx.y - mn.y, mx.z - mn.z, max(ext)


# ============================== WINGS ==============================
def wing_geometry(s):
    """Pure geometry for one wing in unit space (S=shoulder at origin, +X outward * s).
    Returns verts, weight dicts, faces, material indices (0 = bone, 1 = membrane), bone specs."""
    def X(v):
        return Vector((v[0] * s, v[1], v[2]))

    P = {'S': X((0, 0, 0)), 'E': X((0.42, -0.12, 0.34)), 'W': X((0.78, -0.04, 0.74)),
         'T1': X((1.34, 0.10, 0.66)), 'T2': X((1.24, 0.56, 0.16)),
         'T3': X((0.94, 0.84, -0.32)), 'T4': X((0.54, 0.80, -0.70)), 'B': X((0.06, 0.50, -0.72))}
    for i in range(1, 5):
        m = P['W'].lerp(P['T%d' % i], 0.5)
        m.z -= 0.04
        P['M%d' % i] = m
    for i in range(1, 4):
        P['C%d' % i] = P['T%d' % i].lerp(P['T%d' % (i + 1)], 0.5).lerp(P['W'], 0.20)
    P['C4'] = P['T4'].lerp(P['B'], 0.5).lerp(P['W'], 0.15)

    Wt = {'S': {'arm': 1}, 'E': {'arm': .5, 'forearm': .5}, 'W': {'forearm': 1}, 'B': {'root': 1},
          'C4': {'f4b': .5, 'root': .5}}
    for i in range(1, 5):
        Wt['M%d' % i] = {'f%da' % i: .5, 'f%db' % i: .5}
        Wt['T%d' % i] = {'f%db' % i: 1}
    for i in range(1, 4):
        Wt['C%d' % i] = {'f%db' % i: .5, 'f%db' % (i + 1): .5}

    names = list(P.keys())
    idx = {n: i for i, n in enumerate(names)}
    verts = [P[n] for n in names]
    wl = [dict(Wt[n]) for n in names]

    tris = [('S', 'E', 'W'), ('S', 'W', 'B'), ('W', 'M1', 'M2'), ('W', 'M2', 'M3'),
            ('W', 'M3', 'M4'), ('W', 'M4', 'B')]
    for i in range(1, 4):
        tris += [('M%d' % i, 'T%d' % i, 'C%d' % i), ('M%d' % i, 'C%d' % i, 'M%d' % (i + 1)),
                 ('C%d' % i, 'T%d' % (i + 1), 'M%d' % (i + 1))]
    tris += [('M4', 'T4', 'C4'), ('M4', 'C4', 'B')]
    tris = [(idx[a], idx[b], idx[c]) for a, b, c in tris]

    for _ in range(2):  # two levels of midpoint subdivision so the membrane bends smoothly
        cache, new = {}, []

        def mid(a, b):
            k = (min(a, b), max(a, b))
            if k not in cache:
                verts.append((verts[a] + verts[b]) * 0.5)
                w = {}
                for src in (wl[a], wl[b]):
                    for kk, vv in src.items():
                        w[kk] = w.get(kk, 0) + vv * 0.5
                wl.append(w)
                cache[k] = len(verts) - 1
            return cache[k]
        for a, b, c in tris:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            new += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
        tris = new

    faces = list(tris)
    mats = [1] * len(faces)

    def tube(p0, p1, r0, r1, w0, w1, seg=6):
        a = (p1 - p0).normalized()
        h = Vector((0, 0, 1)) if abs(a.z) < 0.9 else Vector((1, 0, 0))
        u = a.cross(h).normalized()
        v = a.cross(u)
        base = len(verts)
        for p, r, w in ((p0, r0, w0), (p1, r1, w1)):
            for k in range(seg):
                ang = tau * k / seg
                verts.append(p + (u * cos(ang) + v * sin(ang)) * r)
                wl.append(dict(w))
        for k in range(seg):
            k2 = (k + 1) % seg
            faces.append((base + k, base + k2, base + seg + k2, base + seg + k))
            mats.append(0)

    tube(P['S'], P['E'], .030, .024, Wt['S'], Wt['E'])
    tube(P['E'], P['W'], .024, .018, Wt['E'], Wt['W'])
    for i in range(1, 5):
        tube(P['W'], P['M%d' % i], .016, .011, Wt['W'], Wt['M%d' % i])
        tube(P['M%d' % i], P['T%d' % i], .011, .004, Wt['M%d' % i], Wt['T%d' % i])
    tube(P['W'], P['W'] + Vector((0.04 * s, -0.14, 0.17)), .03, .002, Wt['W'], Wt['W'])

    specs = [('root', P['S'], P['S'] + Vector((0.02 * s, 0.25, -0.35)), None),
             ('arm', P['S'], P['E'], 'root'), ('forearm', P['E'], P['W'], 'arm')]
    for i in range(1, 5):
        specs.append(('f%da' % i, P['W'], P['M%d' % i], 'forearm'))
        specs.append(('f%db' % i, P['M%d' % i], P['T%d' % i], 'f%da' % i))
    return verts, wl, faces, mats, specs


def build_wing(s, name, parent, mat_bone, mat_mem):
    verts, wl, faces, mats, specs = wing_geometry(s)
    arm_data = bpy.data.armatures.new(PREFIX + name + '_Armature')
    arm_data.display_type = 'STICK'
    arm_obj = add_obj(name + '_Rig', arm_data, parent)

    bpy.context.view_layer.update()
    bpy.context.view_layer.objects.active = arm_obj
    arm_obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm_data.edit_bones
    made = {}
    for bname, head, tail, par in specs:
        b = eb.new(bname)
        b.head, b.tail = head, tail
        if par:
            b.parent = made[par]
            if (b.head - made[par].tail).length < 1e-6:
                b.use_connect = True
        made[bname] = b
    bpy.ops.object.mode_set(mode='OBJECT')

    me = mesh_from(name + '_Mesh', verts, faces, mats)
    me.materials.append(mat_bone)
    me.materials.append(mat_mem)
    wing = add_obj(name, me, arm_obj)
    groups = {n: wing.vertex_groups.new(name=n) for n, _, _, _ in specs}
    for i, w in enumerate(wl):
        for bn, val in w.items():
            groups[bn].add([i], val, 'REPLACE')
    mod = wing.modifiers.new(PREFIX + 'Armature', 'ARMATURE')
    mod.object = arm_obj
    return arm_obj, wing


def animate_wing(arm_obj, s):
    """Slow majestic flap with overlapping action: arm leads, forearm and fingers lag."""
    P = WING_PERIOD
    steps = int(8 * DURATION / P)
    pbs = arm_obj.pose.bones
    # (bone, flap amp deg, flap phase frames, flap offset deg, sweep amp deg, sweep phase)
    spec = [('arm', 30, 0, 0, 5, 20), ('forearm', 24, 7, -6, 6, 27)]
    for i in range(1, 5):
        spec.append(('f%da' % i, 14, 13 + i, 0, 5, 33 + i))
        spec.append(('f%db' % i, 20, 20 + i * 1.5, 0, 6, 40 + i))
    for bname, fa, fp, fo, na, nph in spec:
        pb = pbs[bname]
        pb.rotation_mode = 'QUATERNION'
        rest = pb.bone.matrix_local.to_3x3()
        rinv = rest.inverted()
        for k in range(steps + 1):
            t = k * P / 8.0
            flap = radians(fo + fa * cos(tau * (t - fp) / P))
            sweep = radians(na * cos(tau * (t - nph) / P))
            R = (Quaternion((0, 0, 1), s * sweep).to_matrix()
                 @ Quaternion((0, 1, 0), -s * flap).to_matrix())
            pb.rotation_quaternion = (rinv @ R @ rest).to_quaternion()
            pb.keyframe_insert('rotation_quaternion', frame=1 + t)
    if arm_obj.animation_data and arm_obj.animation_data.action:
        arm_obj.animation_data.action.name = PREFIX + arm_obj.name + '_Flap'


# ============================== FACE ==============================
def fang_row(name, up, y0, z0):
    bm = bmesh.new()
    for x in (-0.44, -0.30, -0.15, 0.0, 0.15, 0.30, 0.44):
        canine = abs(abs(x) - 0.30) < 0.01
        d = 0.30 if canine else 0.15
        r = 0.065 if canine else 0.045
        y = y0 + 0.9 * x * x
        if up:
            mat = Matrix.Translation((x, y, z0 - d / 2)) @ Matrix.Rotation(pi, 4, 'X')
        else:
            mat = Matrix.Translation((x, y, z0 + d / 2))
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=5,
                              radius1=r, radius2=0.0, depth=d, matrix=mat)
    me = bpy.data.meshes.new(PREFIX + name)
    bm.to_mesh(me)
    bm.free()
    return me


def build_face(face):
    eye_m, eye_em = make_emit('Eye', (1.0, 0.55, 0.12), 5.0)
    drive(eye_em.inputs['Strength'], 'default_value', None,
          "4.5+2.2*sin(frame*%.6f)" % (tau / 40))
    slit_m, _ = make_emit('Slit', (0.02, 0.0, 0.03), 1.0)
    eye_mesh = ico_mesh('Eye', 2)
    eye_mesh.materials.append(eye_m)
    slit_mesh = ico_mesh('Slit', 1)
    slit_mesh.materials.append(slit_m)
    eyes = []
    for sx, nm in ((-1, 'L'), (1, 'R')):
        eye = add_empty('Eye_' + nm, face, loc=(sx * 0.40, -0.82, 0.24),
                        rot=(0, -sx * radians(16), 0), display='SPHERE', size=0.05)
        add_obj('Eyeball_' + nm, eye_mesh, eye, scale=(0.22, 0.10, 0.13))
        add_obj('Pupil_' + nm, slit_mesh, eye, loc=(0, -0.08, 0), scale=(0.022, 0.05, 0.10))
        eyes.append(eye)
    for eye in eyes:  # blinks
        for f in (1, 58, 61, 64, 164, 167, 170, DURATION):
            eye.scale[2] = 0.07 if f in (61, 167) else 1.0
            eye.keyframe_insert('scale', index=2, frame=f)

    fang_m = make_toon('Fang', base=(0.92, 0.86, 0.70), rim=RIM)
    jaw = add_empty('Jaw', face, loc=(0, -0.30, -0.32), display='ARROWS', size=0.2)
    up_me = fang_row('FangsUpper', True, -0.80, -0.30)
    up_me.materials.append(fang_m)
    add_obj('FangsUpper', up_me, face)
    lo_me = fang_row('FangsLower', False, -0.48, -0.02)
    lo_me.materials.append(fang_m)
    add_obj('FangsLower', lo_me, jaw)

    maw_m, maw_em = make_emit('Maw', EMBER, 1.0)
    maw_me = ico_mesh('Maw', 2)
    maw_me.materials.append(maw_m)
    add_obj('Maw', maw_me, face, loc=(0, -0.72, -0.30), scale=(0.50, 0.20, 0.12))
    for base in range(0, DURATION, 120):  # roar cycle: closed -> open -> hold -> close
        for off, deg in ((0, 0), (40, 0), (58, 24), (78, 24), (98, 0), (120, 0)):
            jaw.rotation_euler[0] = radians(deg)
            jaw.keyframe_insert('rotation_euler', index=0, frame=1 + base + off)
    drive(maw_em.inputs['Strength'], 'default_value', None, "0.6+jx*16",
          [('jx', jaw, 'ROT_X')])


# ============================== AURA ==============================
def ring_mesh(R, r, seg=64, tube=6, spikes=12):
    verts, faces = [], []
    for i in range(seg):
        a = tau * i / seg
        for j in range(tube):
            b = tau * j / tube
            rad = R + r * cos(b)
            verts.append((rad * cos(a), rad * sin(a), r * sin(b)))
    for i in range(seg):
        i2 = (i + 1) % seg
        for j in range(tube):
            j2 = (j + 1) % tube
            faces.append((i * tube + j, i2 * tube + j, i2 * tube + j2, i * tube + j2))
    me = mesh_from('Halo', verts, faces)
    bm = bmesh.new()
    bm.from_mesh(me)
    d = 0.45
    for k in range(spikes):
        a = tau * k / spikes
        mat = (Matrix.Rotation(a, 4, 'Z') @ Matrix.Translation((R + r + d / 2, 0, 0))
               @ Matrix.Rotation(radians(90), 4, 'Y'))
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=4,
                              radius1=0.09, radius2=0.0, depth=d, matrix=mat)
    bm.to_mesh(me)
    bm.free()
    return me


def build_aura(root, hover, face, W, D, H):
    gold_m, gold_em = make_emit('Gold', GOLD, 1.6)
    drive(gold_em.inputs['Strength'], 'default_value', None,
          "1.4+0.4*sin(frame*%.6f)" % (tau * 2 / DURATION))
    spin = add_empty('HaloSpin', face, loc=(0, 0.95, 0.20), rot=(radians(90), 0, 0))
    halo_me = ring_mesh(2.1, 0.04)
    halo_me.materials.append(gold_m)
    halo = add_obj('Halo', halo_me, spin)
    drive(halo, 'rotation_euler', 2, "frame*%.6f" % (tau / DURATION))

    R = 0.48 * max(W, D)
    circ_me = mesh_from('RuneCircle', [(-1, -1, 0), (1, -1, 0), (1, 1, 0), (-1, 1, 0)], [(0, 1, 2, 3)])
    circ_me.materials.append(make_circle_mat())
    circ = add_obj('RuneCircle', circ_me, root, loc=(0, 0, 0.012 * H), scale=S(R))
    drive(circ, 'rotation_euler', 2, "frame*%.6f" % (tau / DURATION))

    random.seed(7)
    mote_me = ico_mesh('Mote', 1)
    mats = [make_emit('MoteCyan', RIM, 2.4)[0], make_emit('MoteGold', GOLD, 2.4)[0]]
    for k in range(MOTE_COUNT):
        orbit = add_empty('MoteOrbit%02d' % k, hover)
        ph = random.uniform(0, tau)
        spd = random.choice((1, 1, 2, -1))
        drive(orbit, 'rotation_euler', 2, "%.4f+frame*%.6f" % (ph, tau * spd / DURATION))
        z0 = random.uniform(0.04, 0.98) * H
        me = mote_me.copy()
        me.materials.append(mats[k % 2])
        mote = add_obj('Mote%02d' % k, me, orbit,
                       loc=(random.uniform(0.28, 0.70) * H, 0, z0),
                       scale=S(random.uniform(0.004, 0.010) * H))
        drive(mote, 'location', 2, "%.3f+%.3f*sin(frame*%.6f+%.3f)" % (
            z0, random.uniform(0.02, 0.06) * H,
            tau * random.choice((1, 2, 3)) / DURATION, random.uniform(0, tau)))


# ============================== SCENE ==============================
def setup_world(scene):
    w = scene.world or bpy.data.worlds.new("World")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = node(nt, 'ShaderNodeOutputWorld')
    bg = node(nt, 'ShaderNodeBackground')
    tc = node(nt, 'ShaderNodeTexCoord')
    sep = node(nt, 'ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    z = M(nt, 'MULTIPLY_ADD', sep.outputs['Z'], 0.5, 0.5, clamp=True)
    col = ramp(nt, z, [(0.0, (0.01, 0.01, 0.05)), (0.45, (0.16, 0.07, 0.36)), (1.0, (0.01, 0.03, 0.14))])
    nt.links.new(col, bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 1.0
    nt.links.new(bg.outputs[0], out.inputs[0])


def setup_bloom(scene):
    try:
        scene.use_nodes = True
        nt = scene.node_tree
        nt.nodes.clear()
        rl = nt.nodes.new('CompositorNodeRLayers')
        gl = nt.nodes.new('CompositorNodeGlare')
        cp = nt.nodes.new('CompositorNodeComposite')
        try:
            gl.glare_type = 'BLOOM'
        except Exception:
            gl.glare_type = 'FOG_GLOW'
        try:
            gl.threshold = 1.35
        except Exception:
            pass
        try:
            gl.mix = -0.88
        except Exception:
            pass
        gl.location, cp.location = (300, 0), (600, 0)
        nt.links.new(rl.outputs[0], gl.inputs[0])
        nt.links.new(gl.outputs[0], cp.inputs[0])
    except Exception as e:
        print("[balrog_mystic] Couldn't build the bloom compositor (%s). "
              "Enable Compositing > Use Nodes and add a Glare node manually." % e)


def main():
    global COL
    ensure_object_mode()
    scene = bpy.context.scene
    body = find_body()
    base, vcol = detect_body_color(body)
    cleanup(body)
    COL = get_collection()

    R3, root_loc, W, D, H, maxext = compute_frame(body)
    print("[balrog_mystic] body=%s  size W=%.1f D=%.1f H=%.1f  vertex colour=%s"
          % (body.name, W, D, H, vcol))

    root = add_empty('Root', None, root_loc, R3.to_euler(), display='ARROWS', size=0.06 * H)
    hover = add_empty('Hover', root)
    bpy.context.view_layer.update()
    body.parent = hover
    body.matrix_parent_inverse = hover.matrix_world.inverted()

    # --- body look
    toon = make_toon('BodyToon', base=base, vcol=vcol, brighten=BODY_BRIGHTEN, tint=BODY_TINT,
                     tint_amt=BODY_TINT_AMT, rim=RIM, veins=ARCANE,
                      vein_scale=5.0 / max(max(body.dimensions), 1e-6), vein_strength=0.85,
                     lava=bool(vcol))
    body.data.materials.clear()
    body.data.materials.append(toon)
    if ADD_OUTLINE:
        ink, ink_nt = new_mat('Outline')
        out = node(ink_nt, 'ShaderNodeOutputMaterial')
        ink_nt.links.new(emission(ink_nt, INK, 1.0).outputs[0], out.inputs[0])
        ink.use_backface_culling = True
        body.data.materials.append(ink)
        mod = body.modifiers.new(PREFIX + 'Outline', 'SOLIDIFY')
        mod.thickness = 0.0012 * H / max(body.scale)
        mod.offset = 1.0
        mod.use_flip_normals = True
        mod.use_even_offset = True
        mod.material_offset = 1

    # --- hover / sway
    drive(hover, 'location', 2, "%.4f*sin(frame*%.6f)" % (0.012 * H, tau / 120))
    drive(hover, 'rotation_euler', 1, "0.025*sin(frame*%.6f)" % (tau / DURATION))
    drive(hover, 'rotation_euler', 0, "0.012*sin(frame*%.6f+1.2)" % (tau / 120))

    # --- anchors (move these if parts don't line up with your model)
    face = add_empty('Face_Anchor', hover, loc=(0, -0.20 * D, 0.60 * H), scale=S(0.065 * H),
                     display='SPHERE', size=1.0)

    if ADD_WINGS:
        mat_bone = make_toon('WingBone', base=(0.05, 0.035, 0.09), rim=GOLD, veins=GOLD,
                             vein_scale=2.0, vein_strength=1.5)
        mat_mem = make_membrane()
        for s, nm in ((1, 'R'), (-1, 'L')):
            anchor = add_empty('Shoulder_' + nm, hover, loc=(s * 0.20 * W, 0.06 * D, 0.74 * H),
                               scale=S(0.5 * H), display='ARROWS', size=0.12)
            arm_obj, _ = build_wing(s, 'Wing_' + nm, anchor, mat_bone, mat_mem)
            animate_wing(arm_obj, s)
    if ADD_FACE:
        build_face(face)
    if ADD_AURA:
        build_aura(root, hover, face, W, D, H)

    # --- render look
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            continue
    try:
        scene.view_settings.view_transform = 'Standard'
    except Exception:
        pass
    setup_world(scene)
    setup_bloom(scene)
    scene.render.fps = FPS
    scene.frame_start, scene.frame_end, scene.frame_current = 1, DURATION, 1

    ensure_object_mode()
    if SAVE_AS and bpy.data.filepath:
        try:
            bpy.ops.wm.save_as_mainfile(
                filepath=os.path.join(os.path.dirname(bpy.data.filepath), SAVE_AS))
        except Exception as e:
            print("[balrog_mystic] Couldn't save a copy:", e)
    print("[balrog_mystic] Done. Press Space to preview. Tweak BM_Face_Anchor / BM_Shoulder_L/R if needed.")


if __name__ == '__main__':
    import sys
    if '--game' in sys.argv:
        from pathlib import Path
        import runpy
        # Blender toon nodes/drivers are not glTF materials/clips. Use the explicit
        # game export path rather than silently exporting broken white materials.
        runpy.run_path(str(Path(__file__).resolve().parent / 'scripts/export-mystic.py'), run_name='__main__')
    else:
        main()
