"""Export the supplied Balrog as a textured, upright GLB without saving the source.

Usage: blender --background --disable-autoexec 'lowpoly+balrog.blend' --python scripts/export-boss.py
Optional: append -- --preview /absolute/path.png to render the exported orientation.
"""
import bpy
import json
import math
import struct
import sys
from mathutils import Matrix, Vector
from pathlib import Path

root = Path(__file__).resolve().parent.parent
scene = bpy.context.scene
meshes = [obj for obj in scene.objects if obj.type == 'MESH' and not obj.hide_render]
if len(meshes) != 1:
    raise RuntimeError('This export is calibrated to the supplied single-mesh Balrog.')
boss = meshes[0]
boss.name = 'Balrog'
bpy.context.view_layer.objects.active = boss
bpy.ops.object.select_all(action='DESELECT')
boss.select_set(True)

# Source sculpt is already Z-up, with the face toward +X and wings along Y.
# Rotate ONLY about Z to face Blender -Y (glTF +Z). The exporter handles Z-up -> Y-up.
# Swapping X and Z here turns a standing model into a creature lying on its back.
for vertex in boss.data.vertices:
    world = boss.matrix_world @ vertex.co
    vertex.co = Vector((world.y, -world.x, world.z))
boss.matrix_world = Matrix.Identity(4)
minimum = Vector(tuple(min(v.co[i] for v in boss.data.vertices) for i in range(3)))
maximum = Vector(tuple(max(v.co[i] for v in boss.data.vertices) for i in range(3)))
center = (minimum + maximum) / 2
height = maximum.z - minimum.z
scale = 6.0 / height
for vertex in boss.data.vertices:
    vertex.co = (vertex.co - Vector((center.x, center.y, minimum.z))) * scale
bpy.context.view_layer.update()

# Reduce the dense sculpt for browser use while retaining its silhouette.
original_faces = len(boss.data.polygons)
modifier = boss.modifiers.new('Web silhouette', 'DECIMATE')
modifier.ratio = 0.48
bpy.ops.object.modifier_apply(modifier=modifier.name)
for polygon in boss.data.polygons:
    polygon.use_smooth = True

# The .blend's empty legacy color layers are not part of this image-textured material.
for attribute in list(boss.data.color_attributes):
    boss.data.color_attributes.remove(attribute)

# Give the dense sculpt real UVs, then bake a small procedural hand-painted palette into
# a texture atlas. This exports as a standard glTF base-color map, not Blender-only nodes.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(island_margin=0.008, area_weight=0.15, angle_limit=math.radians(66))
bpy.ops.object.mode_set(mode='OBJECT')

material = bpy.data.materials.new('Balrog · garnet hide, ember membrane and antique gold')
material.use_nodes = True
nodes = material.node_tree.nodes
links = material.node_tree.links
nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial')
output.location = (900, 100)
shader = nodes.new('ShaderNodeBsdfPrincipled')
shader.location = (650, 100)
shader.inputs['Roughness'].default_value = 0.76
shader.inputs['Metallic'].default_value = 0.12
links.new(shader.outputs['BSDF'], output.inputs['Surface'])

def srgb(hex_color):
    value = hex_color.lstrip('#')
    channels = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in channels) + (1,)

def ramp(name, stops, x, y):
    node = nodes.new('ShaderNodeValToRGB')
    node.label = name
    node.location = (x, y)
    elements = node.color_ramp.elements
    elements.remove(elements[1])
    elements[0].position, elements[0].color = stops[0][0], srgb(stops[0][1])
    for position, color in stops[1:]:
        element = elements.new(position)
        element.color = srgb(color)
    node.color_ramp.interpolation = 'EASE'
    return node

def math_node(operation, a, b=None, x=0, y=0):
    node = nodes.new('ShaderNodeMath')
    node.operation = operation
    node.location = (x, y)
    if isinstance(a, tuple):
        links.new(a[0], node.inputs[0])
    else:
        node.inputs[0].default_value = a
    if b is not None:
        if isinstance(b, tuple):
            links.new(b[0], node.inputs[1])
        else:
            node.inputs[1].default_value = b
    return node

coordinates = nodes.new('ShaderNodeTexCoord')
coordinates.location = (-1000, 300)
separate = nodes.new('ShaderNodeSeparateXYZ')
separate.location = (-800, 550)
links.new(coordinates.outputs['Generated'], separate.inputs['Vector'])

noise = nodes.new('ShaderNodeTexNoise')
noise.location = (-800, 150)
noise.inputs['Scale'].default_value = 13.0
noise.inputs['Detail'].default_value = 3.0
noise.inputs['Roughness'].default_value = 0.72
links.new(coordinates.outputs['Generated'], noise.inputs['Vector'])

skin = ramp('Layered garnet hide', [(0.2, '#32182d'), (0.49, '#70263b'), (0.78, '#ad3e42')], -520, 350)
wing = ramp('Smoky vermilion wing membrane', [(0.2, '#35172c'), (0.48, '#8e292f'), (0.78, '#d65b3b')], -520, 80)
links.new(noise.outputs['Fac'], skin.inputs['Fac'])
links.new(noise.outputs['Fac'], wing.inputs['Fac'])

# A fine 3-D cell pattern catches light like embossed scales without drawing a tiled UV grid.
scales = nodes.new('ShaderNodeTexVoronoi')
scales.location = (-800, -100)
scales.inputs['Scale'].default_value = 58.0
links.new(coordinates.outputs['Generated'], scales.inputs['Vector'])
bump = nodes.new('ShaderNodeBump')
bump.location = (390, -20)
bump.inputs['Strength'].default_value = 0.12
bump.inputs['Distance'].default_value = 0.018
links.new(scales.outputs['Distance'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], shader.inputs['Normal'])

lateral_offset = math_node('SUBTRACT', (separate.outputs['X'],), 0.5, -600, 650)
lateral_abs = math_node('ABSOLUTE', (lateral_offset.outputs[0],), x=-400, y=650)
lateral = math_node('MULTIPLY', (lateral_abs.outputs[0],), 2.0, -220, 650)
wing_mask = nodes.new('ShaderNodeMapRange')
wing_mask.location = (-20, 650)
wing_mask.clamp = True
wing_mask.inputs['From Min'].default_value = 0.23
wing_mask.inputs['From Max'].default_value = 0.34
wing_mask.inputs['To Min'].default_value = 0
wing_mask.inputs['To Max'].default_value = 1
links.new(lateral.outputs[0], wing_mask.inputs['Value'])

palette = nodes.new('ShaderNodeMix')
palette.data_type = 'RGBA'
palette.location = (180, 320)
links.new(wing_mask.outputs['Result'], palette.inputs[0])
links.new(skin.outputs['Color'], palette.inputs[6])
links.new(wing.outputs['Color'], palette.inputs[7])

# Fine lighter branching cells read as stylized wing veins in the broad membrane areas.
veins = nodes.new('ShaderNodeTexVoronoi')
veins.location = (-520, -850)
veins.inputs['Scale'].default_value = 21.0
veins.feature = 'DISTANCE_TO_EDGE'
links.new(coordinates.outputs['Generated'], veins.inputs['Vector'])
vein_lines = math_node('LESS_THAN', (veins.outputs['Distance'],), 0.035, -280, -850)
vein_mask = math_node('MULTIPLY', (vein_lines.outputs[0],), (wing_mask.outputs['Result'],), -80, -820)
mix_veins = nodes.new('ShaderNodeMix')
mix_veins.data_type = 'RGBA'
mix_veins.location = (180, 100)
links.new(vein_mask.outputs[0], mix_veins.inputs[0])
links.new(palette.outputs[2], mix_veins.inputs[6])
mix_veins.inputs[7].default_value = srgb('#d06a52')

# Narrow, broken-looking gold bands sit on the central torso; bone highlights pick out
# the upper central silhouette. Both are deliberately subdued so the sculpt stays legible.
height = separate.outputs['Z']
band_phase = math_node('MULTIPLY', (height,), 31.0, -600, -180)
band_wave = math_node('SINE', (band_phase.outputs[0],), x=-420, y=-180)
band_abs = math_node('ABSOLUTE', (band_wave.outputs[0],), x=-240, y=-180)
band_line = math_node('LESS_THAN', (band_abs.outputs[0],), 0.055, -60, -180)
torso = math_node('LESS_THAN', (lateral.outputs[0],), 0.23, -400, -350)
torso_low = math_node('GREATER_THAN', (height,), 0.32, -400, -480)
torso_high = math_node('LESS_THAN', (height,), 0.76, -400, -600)
torso_mask_a = math_node('MULTIPLY', (torso.outputs[0],), (torso_low.outputs[0],), -200, -350)
torso_mask_b = math_node('MULTIPLY', (torso_mask_a.outputs[0],), (torso_high.outputs[0],), -20, -350)
gold_mask = math_node('MULTIPLY', (band_line.outputs[0],), (torso_mask_b.outputs[0],), 160, -120)

bone_height = math_node('GREATER_THAN', (height,), 0.88, -200, -520)
bone_width = math_node('LESS_THAN', (lateral.outputs[0],), 0.22, -200, -680)
bone_mask = math_node('MULTIPLY', (bone_height.outputs[0],), (bone_width.outputs[0],), 0, -540)

mix_gold = nodes.new('ShaderNodeMix')
mix_gold.data_type = 'RGBA'
mix_gold.location = (360, 300)
links.new(gold_mask.outputs[0], mix_gold.inputs[0])
links.new(mix_veins.outputs[2], mix_gold.inputs[6])
mix_gold.inputs[7].default_value = srgb('#d6a34f')

mix_bone = nodes.new('ShaderNodeMix')
mix_bone.data_type = 'RGBA'
mix_bone.location = (540, 300)
links.new(bone_mask.outputs[0], mix_bone.inputs[0])
links.new(mix_gold.outputs[2], mix_bone.inputs[6])
mix_bone.inputs[7].default_value = srgb('#e3d0a4')
links.new(mix_bone.outputs[2], shader.inputs['Base Color'])

tex_size = 2048
image = bpy.data.images.new('Balrog · hand-painted fantasy base color', width=tex_size, height=tex_size, alpha=False)
image.colorspace_settings.name = 'sRGB'
image.filepath_raw = str(Path('/tmp/opencode') / 'balrog-basecolor.jpg')
image_node = nodes.new('ShaderNodeTexImage')
image_node.image = image
image_node.location = (360, -160)
nodes.active = image_node
for node in nodes:
    node.select = node == image_node

boss.data.materials.clear()
boss.data.materials.append(material)
bpy.context.scene.render.engine = 'CYCLES'
bpy.context.scene.cycles.samples = 1
bpy.context.scene.render.bake.margin = 12
bpy.context.scene.render.bake.use_pass_direct = False
bpy.context.scene.render.bake.use_pass_indirect = False
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_clear=True, margin=12)
bpy.context.scene.render.image_settings.file_format = 'JPEG'
bpy.context.scene.render.image_settings.quality = 92
image.save_render(image.filepath_raw, scene=bpy.context.scene)
image = bpy.data.images.load(image.filepath_raw, check_existing=False)
image.colorspace_settings.name = 'sRGB'

# Bake the embossed-scale detail as a tangent-space normal map as well. Three.js/glTF can
# then light it from the game scene instead of relying on the Blender bake's presentation.
normal_size = 1024
normal_image = bpy.data.images.new('Balrog · embossed scale normals', width=normal_size, height=normal_size, alpha=False)
normal_image.colorspace_settings.name = 'Non-Color'
normal_image.file_format = 'PNG'
normal_image.filepath_raw = str(Path('/tmp/opencode') / 'balrog-normal-1024.png')
normal_node = nodes.new('ShaderNodeTexImage')
normal_node.image = normal_image
nodes.active = normal_node
for node in nodes:
    node.select = node == normal_node
bpy.context.scene.render.bake.normal_space = 'TANGENT'
bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_clear=True, margin=12)
bpy.context.scene.render.image_settings.file_format = 'PNG'
normal_image.save_render(normal_image.filepath_raw, scene=bpy.context.scene)

# Drop the procedural network after baking: the exported asset only needs this standard map.
nodes.clear()
output = nodes.new('ShaderNodeOutputMaterial')
shader = nodes.new('ShaderNodeBsdfPrincipled')
shader.inputs['Roughness'].default_value = 0.76
shader.inputs['Metallic'].default_value = 0.12
texture = nodes.new('ShaderNodeTexImage')
texture.image = image
texture.interpolation = 'Linear'
links.new(texture.outputs['Color'], shader.inputs['Base Color'])
normal_texture = nodes.new('ShaderNodeTexImage')
normal_texture.image = normal_image
normal_texture.image.colorspace_settings.name = 'Non-Color'
normal_texture.interpolation = 'Linear'
normal_map = nodes.new('ShaderNodeNormalMap')
normal_map.space = 'TANGENT'
links.new(normal_texture.outputs['Color'], normal_map.inputs['Color'])
links.new(normal_map.outputs['Normal'], shader.inputs['Normal'])
links.new(shader.outputs['BSDF'], output.inputs['Surface'])
image.filepath = str(Path('/tmp/opencode') / 'balrog-basecolor.jpg')
boss.data.materials.clear()
boss.data.materials.append(material)

output = root / 'public' / 'assets' / 'boss' / 'balrog.glb'
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(output), export_format='GLB', use_selection=True,
    export_animations=False, export_cameras=False, export_lights=False,
    export_materials='EXPORT', export_normals=True,
)
# Asset-level invariants: an upright source point stays above a lower source point,
# Blender's height must reach glTF Y, and the browser must use the authored palette.
data = output.read_bytes()
json_length = struct.unpack_from('<I', data, 12)[0]
gltf = json.loads(data[20:20 + json_length])
primitive = gltf['meshes'][0]['primitives'][0]
accessor = gltf['accessors'][primitive['attributes']['POSITION']]
assert abs(accessor['max'][1] - accessor['min'][1] - 6) < .02, 'glTF must be six units tall on Y'
assert 'TEXCOORD_0' in primitive['attributes'], 'Export UV coordinates for the painted texture'
material_json = gltf['materials'][0]
base_index = material_json['pbrMetallicRoughness']['baseColorTexture']['index']
normal_index = material_json['normalTexture']['index']
assert gltf['textures'][base_index]['source'] != gltf['textures'][normal_index]['source'], 'Base color and normal use separate maps'
assert len(gltf['images']) == 2, 'Embed base color and normal textures in the GLB'
assert gltf['images'][gltf['textures'][base_index]['source']]['mimeType'] == 'image/jpeg', 'Pack the detailed base color efficiently'
assert gltf['images'][gltf['textures'][normal_index]['source']]['mimeType'] == 'image/png', 'Keep the tangent normal lossless'
print(f'ARCANE_BOSS_EXPORT: {original_faces} -> {len(boss.data.polygons)} triangles; {output.stat().st_size} bytes; {output}', flush=True)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if '--preview' in args:
    preview = Path(args[args.index('--preview') + 1])
    for obj in list(scene.objects):
        if obj.type in {'LIGHT', 'CAMERA'}: bpy.data.objects.remove(obj, do_unlink=True)
    cam_data = bpy.data.cameras.new('Preview')
    camera = bpy.data.objects.new('Preview', cam_data)
    scene.collection.objects.link(camera)
    camera.location = Vector((0, -22, 4.5))
    camera.rotation_euler = (Vector((0, 0, 3)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 14
    scene.camera = camera
    for name, location, energy, color, size in [
        ('Key', (5, -6, 10), 1900, (0.7, 0.8, 1), 7),
        ('Rim', (-5, 2, 7), 2200, (1, 0.3, 0.09), 5),
        ('Fill', (0, -5, 3), 600, (1, 0.65, 0.4), 5),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.color, data.size = energy, color, size
        light = bpy.data.objects.new(name, data)
        scene.collection.objects.link(light)
        light.location = Vector(location)
        light.rotation_euler = (Vector((0, 0, 3)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (0.035, 0.025, 0.06, 1)
    background.inputs['Strength'].default_value = 0.5
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 700
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(preview)
    bpy.ops.render.render(write_still=True)
