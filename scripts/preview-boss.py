"""Render orthographic inspection views without modifying the source .blend."""
import bpy
from mathutils import Vector
from pathlib import Path

scene = bpy.context.scene
mesh = next(obj for obj in scene.objects if obj.type == 'MESH')
corners = [mesh.matrix_world @ Vector(c) for c in mesh.bound_box]
low = Vector(tuple(min(p[i] for p in corners) for i in range(3)))
high = Vector(tuple(max(p[i] for p in corners) for i in range(3)))
center = (low + high) / 2
span = max(high - low)
print('BOUNDS', list(low), list(high), flush=True)

mat = bpy.data.materials.new('Inspection clay')
mat.use_nodes = True
mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (0.34, 0.37, 0.42, 1)
mat.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value = 0.7
mesh.data.materials.clear()
mesh.data.materials.append(mat)

for obj in list(scene.objects):
    if obj.type in {'LIGHT', 'CAMERA'}: bpy.data.objects.remove(obj, do_unlink=True)

camera_data = bpy.data.cameras.new('Inspection camera')
camera = bpy.data.objects.new('Inspection camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = 'ORTHO'
camera_data.ortho_scale = span * 1.15
camera_data.clip_end = span * 10
scene.render.engine = 'CYCLES'
scene.cycles.samples = 12
scene.cycles.use_denoising = True
scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
scene.world.use_nodes = True
scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (0.06, 0.065, 0.09, 1)
scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = 0.8
scene.view_settings.view_transform = 'AgX'

sun_data = bpy.data.lights.new('Inspection key', 'SUN')
sun_data.energy = 3
sun = bpy.data.objects.new('Inspection key', sun_data)
scene.collection.objects.link(sun)

out = Path('/tmp/opencode/arcane-boss-previews')
out.mkdir(exist_ok=True)
for name, direction, up in [
    ('from-positive-y', (0, 1, 0), 'Y'),
    ('from-negative-y', (0, -1, 0), 'Y'),
    ('from-positive-z', (0, 0, 1), 'Y'),
    ('from-negative-z', (0, 0, -1), 'Y'),
]:
    camera.location = center + Vector(direction) * span * 2
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', up).to_euler()
    sun.rotation_euler = camera.rotation_euler.copy()
    scene.render.filepath = str(out / (name + '.png'))
    bpy.ops.render.render(write_still=True)
