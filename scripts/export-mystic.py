"""Build a skinned, glTF-compatible Mystic from the existing painted game sculpt.

blender --background --factory-startup --python balrog_mystic.py -- --game
Preserves balrog.glb and lowpoly+balrog.blend. Writes a separate GLB and editable rig.
The regional skin weights are calibrated to this sculpt, not a universal auto-rigger.
"""
import bpy
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'public/assets/boss/balrog-mystic.glb'
SOURCE = ROOT / 'public/assets/boss/balrog.glb'
BLEND = ROOT / 'balrog_mystic_game.blend'


def smooth(lo, hi, value):
    t = max(0.0, min(1.0, (value - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


def build():
    # Only in-memory startup objects are removed; source files are never changed.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=str(SOURCE))
    body = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
    body.name = 'Mystic_Body'
    world = body.matrix_world.copy()
    for vertex in body.data.vertices:
        vertex.co = world @ vertex.co
    body.parent = None
    body.matrix_world.identity()
    material = body.data.materials[0]
    material.name = 'Mystic painted hide'
    principled = material.node_tree.nodes.get('Principled BSDF')
    principled.inputs['Roughness'].default_value = 0.72
    principled.inputs['Metallic'].default_value = 0.08

    armature = bpy.data.armatures.new('Mystic skeleton')
    rig = bpy.data.objects.new('Mystic_Rig', armature)
    bpy.context.scene.collection.objects.link(rig)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    specs = [
        ('Root', (0, 0, 0), (0, 0, 1), None),
        ('Pelvis', (0, 0, 1.7), (0, 0, 2.6), 'Root'),
        ('Spine', (0, 0, 2.6), (0, 0, 3.6), 'Pelvis'),
        ('Chest', (0, 0, 3.6), (0, 0, 4.4), 'Spine'),
        ('Head', (0, -0.25, 3.7), (0, -1.0, 3.5), 'Chest'),
        ('Tail', (0, 0.35, 1.8), (0, 1.4, 1.0), 'Pelvis'),
    ]
    for side, sign in [('L', -1), ('R', 1)]:
        specs.extend([
            (f'Wing_{side}', (sign * 1.1, 0.15, 4.05), (sign * 3.0, 0.2, 4.6), 'Chest'),
            (f'WingTip_{side}', (sign * 3.0, 0.2, 4.6), (sign * 5.0, 0.1, 4.2), f'Wing_{side}'),
            (f'Arm_{side}', (sign * 0.85, -0.1, 3.35), (sign * 1.15, -0.45, 2.3), 'Chest'),
            (f'Forearm_{side}', (sign * 1.15, -0.45, 2.3), (sign * 1.0, -0.9, 1.25), f'Arm_{side}'),
            (f'Leg_{side}', (sign * 0.6, 0, 2.1), (sign * 0.8, 0, 1.0), 'Root'),
            (f'Foot_{side}', (sign * 0.8, 0, 1.0), (sign * 0.85, -0.55, 0.2), f'Leg_{side}'),
        ])
    for name, head, tail, parent in specs:
        bone = armature.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        if parent:
            bone.parent = armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    groups = {name: body.vertex_groups.new(name=name) for name, *_ in specs}

    # Smooth regions on the EXISTING mesh. No duplicate wings or bone-heat failures on
    # the joined sculpt. The lower legs remain Root-bound to keep the feet planted.
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        lateral = abs(x)
        side = 'L' if x < 0 else 'R'
        weights = {}
        remaining = 1.0
        wing = smooth(1.3, 2.4, lateral) * smooth(2.0, 3.0, z)
        tip = smooth(2.7, 4.6, lateral)
        weights[f'Wing_{side}'] = wing * (1 - tip)
        weights[f'WingTip_{side}'] = wing * tip
        remaining -= wing
        arm = smooth(0.7, 1.12, lateral) * (1 - smooth(2.8, 3.4, z)) * smooth(0.55, 1.35, z)
        arm *= 1 - smooth(0.15, 0.85, y)
        forearm = 1 - smooth(1.7, 2.8, z)
        weights[f'Arm_{side}'] = remaining * arm * (1 - forearm)
        weights[f'Forearm_{side}'] = remaining * arm * forearm
        remaining *= 1 - arm
        tail = smooth(0.55, 1.4, y) * (1 - smooth(1.9, 2.8, z))
        weights['Tail'] = remaining * tail
        remaining *= 1 - tail
        head = (1 - smooth(0.55, 1.05, lateral)) * (1 - smooth(-0.75, -0.12, y))
        head *= smooth(2.8, 3.3, z) * (1 - smooth(4.2, 4.8, z))
        weights['Head'] = remaining * head
        remaining *= 1 - head
        torso = smooth(1.4, 2.7, z)
        chest = smooth(3.1, 4.0, z)
        spine = smooth(2.3, 3.3, z)
        weights['Chest'] = remaining * torso * chest
        weights['Spine'] = remaining * torso * (1 - chest) * spine
        weights['Pelvis'] = remaining * torso * (1 - chest) * (1 - spine)
        weights['Root'] = remaining * (1 - torso)
        active = sorted(((name, w) for name, w in weights.items() if w > 0.00001), key=lambda item: -item[1])[:4]
        total = sum(w for _, w in active)
        for name, weight in active:
            groups[name].add([vertex.index], weight / total, 'REPLACE')
    modifier = body.modifiers.new('Mystic skin', 'ARMATURE')
    modifier.object = rig
    body.parent = rig

    # Standard glTF geometry/emission, not a scene-sized unsupported glow disc.
    gold = bpy.data.materials.new('Mystic antique-gold halo')
    gold.use_nodes = True
    shader = gold.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (0.65, 0.32, 0.065, 1)
    shader.inputs['Metallic'].default_value = 0.65
    shader.inputs['Roughness'].default_value = 0.3
    shader.inputs['Emission Color'].default_value = (1, 0.55, 0.1, 1)
    shader.inputs['Emission Strength'].default_value = 0.5
    bpy.ops.mesh.primitive_torus_add(major_radius=0.86, minor_radius=0.014, major_segments=80, minor_segments=6,
                                    location=(0, 0.6, 4.0), rotation=(math.pi / 2, 0, 0))
    halo = bpy.context.object
    halo.name = 'Mystic_Halo'
    halo.data.materials.append(gold)
    # Bind it to the chest without the implicit bone-parent tail offset.
    halo_group = halo.vertex_groups.new(name='Chest')
    halo_group.add(list(range(len(halo.data.vertices))), 1.0, 'REPLACE')
    halo_skin = halo.modifiers.new('Halo chest attachment', 'ARMATURE')
    halo_skin.object = rig
    halo.parent = rig
    create_clips(rig)
    bpy.context.scene.frame_set(1)
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for obj in (body, rig, halo):
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    candidate = OUTPUT.with_name('balrog-mystic.candidate.glb')
    bpy.ops.export_scene.gltf(
        filepath=str(candidate), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_cameras=False, export_lights=False, export_materials='EXPORT',
        export_skins=True, export_apply=False, export_extras=True,
    )
    data = candidate.read_bytes()
    length = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    assert gltf.get('skins'), 'Rig did not survive export'
    assert {'Idle', 'Hit_Left', 'Hit_Right', 'Shock', 'Gust', 'Stagger', 'Freeze', 'Break_Free'} <= {a['name'] for a in gltf.get('animations', [])}
    assert any('baseColorTexture' in m.get('pbrMetallicRoughness', {}) for m in gltf['materials']), 'Painted texture lost'
    assert len(data) < 8_000_000, 'Unexpectedly large game export'
    candidate.replace(OUTPUT)
    # Pack imported textures so sharing this blend never relies on a local temp path.
    bpy.ops.file.pack_all()
    rig.animation_data.action = bpy.data.actions['Idle']
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print(f'MYSTIC_GAME_EXPORT: {len(data):,} bytes; {len(gltf["skins"][0]["joints"])} joints; '
          f'{len(gltf["animations"])} clips; {OUTPUT}', flush=True)


def create_clips(rig):
    scene = bpy.context.scene
    scene.render.fps = 30
    clips = [('Idle', 120), ('Hit_Left', 24), ('Hit_Right', 24), ('Shock', 30),
             ('Gust', 30), ('Stagger', 33), ('Freeze', 30), ('Break_Free', 36)]
    rig.animation_data_create()
    for name, end in clips:
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        for frame in range(1, end + 1, 2):
            key_pose(rig, name, frame, end)
        key_pose(rig, name, end, end)
        for curve in action.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = 'LINEAR'
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, action)
        track.mute = True
    rig.animation_data.action = None
    scene.frame_start, scene.frame_end = 1, 120


def key_pose(rig, name, frame, end):
    t = (frame - 1) / (end - 1)
    rotations = {}
    if name == 'Idle':
        phase = t * math.tau
        rotations['Spine'] = (0.012 * math.sin(phase), 0.008 * math.sin(phase), 0)
        rotations['Chest'] = (0.018 * math.sin(phase + 0.3), 0, 0.012 * math.sin(phase))
        rotations['Head'] = (0.02 * math.sin(phase + 0.6), 0.025 * math.sin(phase), 0)
        rotations['Tail'] = (0, 0.025 * math.sin(phase + 1), 0)
        for side, sign in [('L', -1), ('R', 1)]:
            rotations[f'Wing_{side}'] = (0.08 * math.sin(phase), 0.045 * math.sin(phase + 0.4) * sign, 0)
            rotations[f'WingTip_{side}'] = (0.09 * math.sin(phase - 0.65), 0, 0)
            rotations[f'Arm_{side}'] = (0.02 * math.sin(phase + 0.5), 0, 0.012 * sign * math.sin(phase))
    else:
        envelope = math.sin(min(t / 0.22, 1) * math.pi / 2) * (1 - t) ** 2
        sign = -1 if name == 'Hit_Left' else 1
        if name in ('Hit_Left', 'Hit_Right'):
            rotations['Chest'] = (0.06 * envelope, 0.12 * sign * envelope, 0.08 * sign * envelope)
            rotations['Head'] = (-0.09 * envelope, -0.1 * sign * envelope, 0)
        elif name == 'Shock':
            shake = math.sin(t * math.tau * 6) * (1 - t) ** 2
            rotations['Chest'] = (-0.12 * envelope, 0.018 * shake, 0.035 * shake)
            rotations['Head'] = (0.12 * envelope, 0, 0.04 * shake)
        elif name in ('Gust', 'Stagger'):
            rotations['Spine'] = ((0.11 if name == 'Gust' else -0.08) * envelope, 0, 0)
            rotations['Chest'] = (0.08 * envelope, 0.045 * envelope, 0)
            rotations['Head'] = (-0.1 * envelope, 0, 0)
        elif name == 'Freeze':
            envelope = smooth(0, 1, t)
            rotations['Chest'] = (0.035 * envelope, 0, 0)
            rotations['Head'] = (0.07 * envelope, 0, 0)
        elif name == 'Break_Free':
            rotations['Chest'] = (-0.1 * envelope, 0, 0)
            rotations['Head'] = (-0.09 * envelope, 0, 0)
        for side, wing_sign in [('L', -1), ('R', 1)]:
            rotations[f'Wing_{side}'] = ((-0.12 if name == 'Break_Free' else 0.12) * envelope, wing_sign * 0.08 * envelope, 0)
            rotations[f'WingTip_{side}'] = (0.14 * envelope, 0, 0)
            rotations[f'Arm_{side}'] = (0.09 * envelope, 0, wing_sign * 0.05 * envelope)
            rotations[f'Forearm_{side}'] = (-0.06 * envelope, 0, 0)
    for bone in rig.pose.bones:
        bone.rotation_mode = 'XYZ'
        bone.rotation_euler = rotations.get(bone.name, (0, 0, 0))
        bone.keyframe_insert('rotation_euler', frame=frame, group=bone.name)


if __name__ == '__main__':
    build()
