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

DIRECTIONS = {'edge': painter.Direction()}


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
    name = next((a for a in argv if not a.startswith('--') and argv[argv.index(a) - 1] not in ('--seed', '--shot')), 'edge')
    quick = '--quick' in argv
    seed = int(argv[argv.index('--seed') + 1]) if '--seed' in argv else 7
    build = os.path.join(ROOT, 'art', 'build', 'sets', name)
    public = os.path.join(ROOT, 'public', 'art', 'sets', name)
    layout = os.path.join(ROOT, 'art', 'sets', f'{name}_layout.json')
    direction = DIRECTIONS.get(name, painter.Direction())
    shots = '--shots' in argv or '--shot' in argv
    if not shots or '--main' in argv:
        paint_one(build, public, name, layout, direction, seed, quick)
    if shots:
        wanted = {argv[i + 1] for i, a in enumerate(argv) if a == '--shot'}
        root = os.path.join(build, 'shots')
        for shot in sorted(os.listdir(root)) if os.path.isdir(root) else []:
            if wanted and shot not in wanted:
                continue
            paint_one(os.path.join(root, shot), os.path.join(public, 'shots', shot), f'{name}-{shot}', layout, direction, seed + 1, quick, sheets=quick)
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
