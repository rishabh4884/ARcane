"""
Paint a set from the passes its layout gathered (art/set_build.py):

    python3 art/set_paint.py edge [--quick] [--seed 7] [--shots | --shot <name>…] [--main]

Writes public/art/sets/<set>/paint.webp and depth.png (16-bit metres across R and G, the farther of
each 2x2 block when halved, so edges never hide what stands behind them), and the same for every
cutscene shot under public/art/sets/<set>/shots/<name>/ with a shots.json manifest; review images go
to art/review/sets/.
"""
import json
import os
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

from arcane_art import painter  # noqa: E402

G, T, R, L, LA, GA, WA = painter.GROUND, painter.TRUNK, painter.ROCK, painter.LEAF, painter.LANTERN, painter.GATE, painter.WATER


def values(scale_shadow: float, scale_light: float) -> dict:
    base = painter.Direction().values
    return {k: (v[0] * scale_shadow, v[1] * scale_light) for k, v in base.items()}


# Each region of the wood, painted from the same layout in its own light (docs/ART_BIBLE.md, colour system).
DIRECTIONS = {
    'edge': painter.Direction(),
    # The Mirefen: heavy low mist over black water and reeds, sick olive and dead-wood bone.
    'fen': painter.Direction(
        deep=('#0c1716', '#12201f', '#1d2e2d', '#2a3d38'), air_near='#4a5e55', air_far='#7a8a7e',
        sky_zenith='#101a18', sky_mid='#2a3a34', sky_horizon='#6f7f72', moon_light='#c6d8c8', moon_disc='#e8ecd8',
        mist='#8a9a8c', mist_gain=1.7, mist_height=1.2, moss='#6b6b3e', lichen='#8a7a4a', birch='#c9c3b0',
        ground=('#4a4a2c', '#5a5236', '#1f2a22', '#4f4a3a'), night_grey='#a8b4a6', water=0.6, reeds=1.0, grass_gain=0.5,
        lamp_gain=0.7, values=values(0.95, 0.92)),
    # The Lantern Deeps: the canopy closed overhead, near-black teal, fungi glowing cold at the roots,
    # captive amber the warmest thing there is.
    'deeps': painter.Direction(
        deep=('#070d0f', '#0e1a1c', '#142426', '#1c3032'), air_near='#12201f', air_far='#24383a',
        sky_mode='veiled', stars=0.15, sky_zenith='#05090a', sky_mid='#0c1618', sky_horizon='#1c2c2e',
        moon_light='#8fb0c8', mist='#24383a', mist_gain=0.8, moss='#2e3f2a', lichen='#3a4a34', birch='#6a6458',
        ground=('#26301f', '#3a2e24', '#141c16', '#4a3828'), night_grey='#7f9aa0', fungi=1.0, lamp_gain=1.6, grass_gain=0.3,
        values=values(0.7, 0.62), frame_dark=0.6),
    # The Unlit Throne: ash and bone, iron and black root; the light stolen, the colour drained.
    'throne': painter.Direction(
        deep=('#141218', '#1a1820', '#26232e', '#332f3c'), air_near='#3a3842', air_far='#6a6672',
        sky_zenith='#141218', sky_mid='#2a2732', sky_horizon='#6a6672', moon_light='#d8dce6', moon_disc='#f2f2f0',
        mist='#7a7682', moss='#5a5850', lichen='#a9a4a0', birch='#d6cdb8',
        ground=('#3e3c38', '#4a4640', '#1c1b1e', '#55504a'), night_grey='#a8a6b0', night_take=0.75, grass_gain=0.4,
        lamp_gain=0.55),
    # Dawn, the freed wood: the same place transformed, warm low sun through the trees, blossom and
    # lantern-flowers in fresh moss.
    'dawn': painter.Direction(
        deep=('#22392f', '#2c4a3c', '#3d5a48', '#4f6e58'), air_near='#c9c0a0', air_far='#e8dcc0',
        sky_mode='sun', stars=0.0, sky_zenith='#8aa8a8', sky_mid='#c6c8b0', sky_horizon='#f0dcb4',
        moon_light='#ffd98a', moon_disc='#fff6dc', mist='#e8dcc0', mist_gain=0.7, moss='#7f9a4a', lichen='#a8b878',
        birch='#e0d8c8', ground=('#6a8240', '#7a5a3a', '#3e5232', '#8a6e4c'), night_take=0.08, flowers=1.0,
        grass_gain=1.3, lamp_gain=0.45, frame_dark=0.3,
        values={G: (0.22, 0.48), T: (0.2, 0.62), R: (0.24, 0.58), L: (0.22, 0.55), LA: (0.12, 0.45), GA: (0.2, 0.55), WA: (0.2, 0.45)}),
}


def save(path: str, rgb: np.ndarray, **kw) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)).save(path, **kw)


def contact(ps: painter.Passes) -> np.ndarray:
    """The passes side by side, for review."""
    def g(a, lo=0.0, hi=1.0):
        a = np.clip((a - lo) / (hi - lo), 0, 1)
        return np.stack([a, a, a], -1)
    tiles = [painter.to_srgb(np.clip(ps.albedo * 4, 0, 1)), g(ps.moon, 0, 1.2), g(ps.sky), g(ps.lamp, 0, 2),
             g(np.log1p(ps.depth) / np.log1p(400)), np.stack([(ps.K % 3) / 2, ((ps.K // 3) % 3) / 2, (ps.K == 4) * 1.0], -1)]
    small = [t[::4, ::4] for t in tiles]
    return np.concatenate([np.concatenate(small[:3], 1), np.concatenate(small[3:], 1)], 0)


def paint_one(build: str, public: str, review: str, layout: str, direction, seed: int, quick: bool, sheets: bool = True) -> None:
    t0 = time.time()
    ps = painter.load_passes(build, layout)
    print(f'[paint] {review}: passes {ps.W}x{ps.H}, moon at {ps.moon_px[0]:.0f},{ps.moon_px[1]:.0f}', flush=True)
    rev = os.path.join(ROOT, 'art', 'review', 'sets')
    if sheets:
        save(os.path.join(rev, f'{review}-passes.jpg'), contact(ps), quality=85)
    out, D = painter.paint(ps, direction, seed=seed, quick=quick)
    if sheets:
        save(os.path.join(rev, f'{review}-design.jpg'), D, quality=88)
    save(os.path.join(rev, f'{review}.jpg'), out, quality=90)
    if quick:
        return
    save(os.path.join(public, 'paint.webp'), out, quality=92, method=6)
    depth = ps.depth
    if ps.W > 2000:
        h, w = depth.shape
        depth = depth[:h // 2 * 2, :w // 2 * 2].reshape(h // 2, 2, w // 2, 2).max(axis=(1, 3))
    d16 = np.clip(depth / ps.meta['depthMax'], 0, 1) * 65535
    rgb = np.stack([np.floor(d16 / 256), d16 % 256, np.zeros_like(d16)], -1).astype(np.uint8)
    Image.fromarray(rgb).save(os.path.join(public, 'depth.png'), optimize=True)
    print(f'[paint] {review} painted in {time.time() - t0:.0f}s', flush=True)


def main() -> None:
    argv = sys.argv[1:]
    name = next((a for a in argv if not a.startswith('--') and argv[argv.index(a) - 1] not in ('--seed', '--shot', '--region')), 'edge')
    quick = '--quick' in argv
    seed = int(argv[argv.index('--seed') + 1]) if '--seed' in argv else 7
    build = os.path.join(ROOT, 'art', 'build', 'sets', name)
    public = os.path.join(ROOT, 'public', 'art', 'sets', name)
    layout = os.path.join(ROOT, 'art', 'sets', f'{name}_layout.json')
    direction = DIRECTIONS.get(name, painter.Direction())
    shots = '--shots' in argv or '--shot' in argv
    regions = [argv[i + 1] for i, a in enumerate(argv) if a == '--region']
    if '--regions' in argv:
        regions = [k for k in DIRECTIONS if k != name]
    for region in regions:
        # A region painted in its own light from the same view: only the painting differs.
        out = os.path.join(public, 'regions', region)
        paint_one(build, out, f'{name}-{region}', layout, DIRECTIONS[region], seed + 2, quick, sheets=False)
        if not quick and os.path.exists(os.path.join(out, 'depth.png')):
            os.remove(os.path.join(out, 'depth.png'))      # the depth is the gameplay painting's
    if regions and not shots and '--main' not in argv:
        return
    if not shots or '--main' in argv:
        paint_one(build, public, name, layout, direction, seed, quick)
    if shots:
        wanted = {argv[i + 1] for i, a in enumerate(argv) if a == '--shot'}
        planned = {sh['name']: sh for sh in json.load(open(layout)).get('shots', [])}
        root = os.path.join(build, 'shots')
        part = argv[argv.index('--part') + 1] if '--part' in argv else '0/1'
        mine, parts = (int(v) for v in part.split('/'))
        order = [sh['name'] for sh in json.load(open(layout)).get('shots', [])]
        for shot in sorted(os.listdir(root)) if os.path.isdir(root) else []:
            if wanted and shot not in wanted:
                continue
            if shot in order and order.index(shot) % parts != mine:
                continue        # another painter's share
            if shot not in planned or not os.path.exists(os.path.join(root, shot, 'meta.json')):
                continue        # not rendered yet, or still rendering (its meta is written last)
            if '--missing' in argv and os.path.exists(os.path.join(public, 'shots', shot, 'paint.webp')):
                continue
            # Each shot in the light of its moment: a scene that turns paints its later keys in the new light.
            light = DIRECTIONS.get(planned[shot].get('region', name), direction)
            paint_one(os.path.join(root, shot), os.path.join(public, 'shots', shot), f'{name}-{shot}', layout, light, seed + 1, quick, sheets=quick)
        # The manifest: every painted shot, for the game to find a cutscene's backgrounds.
        manifest = []
        pub = os.path.join(public, 'shots')
        for shot in sorted(os.listdir(pub)) if os.path.isdir(pub) else []:
            meta_path = os.path.join(pub, shot, 'meta.json')
            if os.path.exists(os.path.join(pub, shot, 'paint.webp')) and os.path.exists(meta_path):
                m = json.load(open(meta_path))
                manifest.append({k: m[k] for k in ('name', 'script', 'key', 'position', 'lookAt', 'fov', 'aspect')})
        with open(os.path.join(public, 'shots.json'), 'w') as f:
            json.dump(manifest, f, indent=1)


main()
