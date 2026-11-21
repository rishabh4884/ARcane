"""Completion checks for resumable set builds; no Blender dependency."""
import json
import os
import tempfile
from pathlib import Path


PASS_NAMES = ('albedo', 'position', 'normal', 'ids', 'lamp', 'moon', 'sky')


def read_meta(directory: str | Path) -> dict | None:
    try:
        meta = json.loads((Path(directory) / 'meta.json').read_text())
        required = ('name', 'script', 'key', 'position', 'lookAt', 'fov', 'aspect',
                    'width', 'height', 'depthMax', 'moon')
        if not isinstance(meta, dict) or any(k not in meta for k in required):
            return None
        if not isinstance(meta['width'], int) or not isinstance(meta['height'], int):
            return None
        return meta if meta['width'] > 0 and meta['height'] > 0 else None
    except (OSError, ValueError):
        return None


def passes_complete(directory: str | Path) -> bool:
    """A moon pass alone is not a finished render. Check the final metadata and every array."""
    import numpy as np

    meta = read_meta(directory)
    if meta is None:
        return False
    try:
        for name in PASS_NAMES:
            # Mapping checks the payload length too, without reading hundreds of MB into RAM.
            data = np.load(Path(directory) / f'{name}.npy', mmap_mode='r', allow_pickle=False)
            if data.shape != (meta['height'], meta['width'], 3):
                return False
        return True
    except (OSError, ValueError, EOFError):
        return False


def painting_complete(directory: str | Path) -> bool:
    """Only publish a shot when both its painting and packed depth can be decoded."""
    from PIL import Image

    meta = read_meta(directory)
    if meta is None:
        return False
    width, height = meta['width'], meta['height']
    depth_size = (width // 2, height // 2) if width > 2000 else (width, height)
    try:
        for name, size in (('paint.webp', (width, height)), ('depth.png', depth_size)):
            with Image.open(Path(directory) / name) as image:
                image.load()
                if image.size != size or image.mode != 'RGB':
                    return False
        return True
    except (OSError, ValueError, EOFError):
        return False


def write_json_atomic(path: str | Path, value, indent: int = 2) -> None:
    """Readers see the previous complete manifest or the next one, never half-written JSON."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix=f'.{path.name}.',
                                         suffix='.tmp', delete=False) as file:
            temporary = file.name
            json.dump(value, file, indent=indent)
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
