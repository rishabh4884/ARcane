"""Read-only Blender scene inspection; run with --disable-autoexec --background."""
import bpy
import json


objects = []
for obj in bpy.data.objects:
    item = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "visible": not obj.hide_render,
        "location": list(obj.location),
        "rotation": list(obj.rotation_euler),
        "dimensions": list(obj.dimensions),
    }
    if obj.type == 'MESH':
        item.update({
            "vertices": len(obj.data.vertices),
            "polygons": len(obj.data.polygons),
            "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            "uv_layers": [uv.name for uv in obj.data.uv_layers],
            "modifiers": [{"name": m.name, "type": m.type} for m in obj.modifiers],
        })
    if obj.type == 'ARMATURE':
        item['bones'] = [b.name for b in obj.data.bones]
    objects.append(item)

materials = []
for material in bpy.data.materials:
    materials.append({
        "name": material.name,
        "color": list(material.diffuse_color),
        "nodes": [{"name": n.name, "type": n.type} for n in material.node_tree.nodes] if material.node_tree else [],
    })

print('ARCANE_SCENE_REPORT=' + json.dumps({
    "objects": objects,
    "materials": materials,
    "actions": [{"name": a.name, "frames": list(a.frame_range)} for a in bpy.data.actions],
    "images": [{"name": i.name, "packed": bool(i.packed_file), "filepath": i.filepath} for i in bpy.data.images],
    "frames": [bpy.context.scene.frame_start, bpy.context.scene.frame_end],
}, indent=2))
