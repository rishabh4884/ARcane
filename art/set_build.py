"""
Lay out a painted set and gather what its painter needs:

    blender -b --factory-startup -P art/set_build.py -- edge [--scale 0.5] [--proxies-only]

1. compose the place from art/sets/<set>_layout.json (written by `npx vite-node tools/dump-set.ts`)
2. render its passes through the game camera (setscene.py) into art/build/sets/<set>/ as .npy
3. write public/art/sets/<set>/meta.json (the paint camera) and proxies.glb (the simplified kinds the
   painting is projected onto in the game, and the gate and lanterns where they stand)

then paint it with `python3 art/set_paint.py <set>` (npm run set -- <set> does both).
"""
import importlib
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from arcane_art import bl, setscene  # noqa: E402
from arcane_art.pipeline import ROOT  # noqa: E402

TREE_KINDS = ['oak_edge_a', 'oak_edge_b', 'birch_edge_a', 'snag_edge_a']
DEPTH_MAX = 400.0


def compose(layout: dict, width: int, height: int) -> dict:
    bl.reset()
    setscene.ground_object(layout)
    makers = {}
    for kind in TREE_KINDS:
        def make(kind=kind):
            sp = importlib.import_module(f'assets.{kind}').spec()
            ob = setscene.sculpt_object(kind, sp, 2.6, sp.paint)
            setscene.tag(ob, 'trunk')
            return ob
        makers[kind] = make

    def make_rock():
        sp = importlib.import_module('assets.rock_edge_a').spec()
        ob = setscene.sculpt_object('rock_edge_a', sp, 2.0, sp.paint)
        setscene.tag(ob, 'rock')
        return ob
    makers['rock_edge_a'] = make_rock
    sources = [os.path.join(HERE, 'assets', f'{k}.py') for k in makers] + [os.path.join(HERE, 'assets', '_trees.py')]
    sources += [os.path.join(HERE, 'arcane_art', f) for f in ('sdf.py', 'paint.py', 'mesh.py')]
    protos = setscene.cached_prototypes(makers, os.path.join(ROOT, 'art', 'build', 'sets', 'prototypes.blend'), sources)
    for ob in protos.values():
        ob.hide_render = True
        ob.hide_viewport = True
    for i, t in enumerate(layout['trees']):
        setscene.place(protos[t['kind']], f"tree-{i}", t['x'], t['y'], t['z'], t['yaw'], t['scale'])
    for i, r in enumerate(layout['rocks']):
        o = setscene.place(protos['rock_edge_a'], f"rock-{i}", r['x'], r['y'], r['z'], r['rotation'][1], r['scale'])
        o.rotation_euler = (r['rotation'][0], -r['rotation'][2], r['rotation'][1])
    statics = []
    for site in layout.get('lanterns', []):
        statics += setscene.lantern_objects(site)
    if 'gate' in layout:
        g = layout['gate']
        statics.append(setscene.gate_object(g['x'], g['y'], g['z'], g['yaw']))
    if 'pool' in layout:
        setscene.pool_object(layout['pool'])
    rig = setscene.lights(layout)
    setscene.world()
    cam = setscene.game_camera(layout, width, height)
    return {'protos': protos, 'statics': statics, 'camera': cam, 'rig': rig}


def export_proxies(path: str, scene: dict) -> None:
    """Simplified kinds (trees and the stone, at the origin) and the statics (gate, lanterns) where they
    stand, for the game to project the painting onto."""
    objs = []
    for kind, proto in scene['protos'].items():
        proto.name = f'proto-{kind}'          # free the kind's own name for the proxy
        p = bl.duplicate(proto, kind)
        assert p.name == kind, p.name
        p.hide_render = False; p.hide_viewport = False
        bl.decimate(p, 2600 if kind != 'rock_edge_a' else 600)
        p.location = (0, 0, 0); p.rotation_euler = (0, 0, 0); p.scale = (1, 1, 1)
        objs.append(p)
    for s in scene['statics']:
        p = bl.duplicate(s, f'static-{s.name}')
        objs.append(p)
    for o in objs:
        o.data.materials.clear()
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_materials='NONE', export_vertex_color='NONE', export_normals=True, export_texcoords=False)


def main() -> None:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    name = next((a for a in argv if not a.startswith('--')), 'edge')
    scale = float(argv[argv.index('--scale') + 1]) if '--scale' in argv else 1.0
    W, H = int(3072 * scale), int(1536 * scale)
    layout = setscene.load(os.path.join(ROOT, 'art', 'sets', f'{name}_layout.json'))
    build = os.path.join(ROOT, 'art', 'build', 'sets', name)
    public = os.path.join(ROOT, 'public', 'art', 'sets', name)
    t0 = time.time()
    scene = compose(layout, W, H)
    if '--proxies-only' in argv:
        export_proxies(os.path.join(public, 'proxies.glb'), scene)
        print(f'[set] {name} proxies written in {time.time() - t0:.0f}s', flush=True)
        return
    exrs = setscene.render_passes(os.path.join(build, 'exr'), scene['rig'])
    for path in exrs:
        arr = setscene.read_exr(path)
        key = os.path.splitext(os.path.basename(path))[0]
        np.save(os.path.join(build, f'{key}.npy'), arr.astype(np.float32 if key in ('position', 'ids') else np.float16))
    export_proxies(os.path.join(public, 'proxies.glb'), scene)
    cam = scene['camera']
    c = layout['camera']
    pos = np.asarray(c['position'], float)
    meta = {'position': c['position'], 'lookAt': c['lookAt'], 'fov': math.degrees(cam.data.angle_y), 'aspect': W / H,
            'near': cam.data.clip_start, 'far': cam.data.clip_end, 'width': W, 'height': H, 'depthMax': DEPTH_MAX,
            'moon': layout['moon']}
    os.makedirs(public, exist_ok=True)
    with open(os.path.join(public, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    with open(os.path.join(build, 'meta.json'), 'w') as f:
        json.dump({**meta, 'layout': os.path.join('art', 'sets', f'{name}_layout.json'), 'camera_position': pos.tolist()}, f, indent=2)
    print(f'[set] {name} laid out and its passes rendered in {time.time() - t0:.0f}s', flush=True)


main()
