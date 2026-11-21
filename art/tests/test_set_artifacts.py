"""Run with: python3 -m unittest discover -s art/tests"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from arcane_art.set_artifacts import PASS_NAMES, painting_complete, passes_complete, write_json_atomic


class InterruptedSetBuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.meta = dict(name='intro-0', script='intro', key=0, position=[0, 1, 2],
                         lookAt=[0, 1, -2], fov=60, aspect=2, width=8, height=4,
                         depthMax=400, moon=[0, 1, 0])
        write_json_atomic(self.root / 'meta.json', self.meta)

    def write_passes(self):
        for name in PASS_NAMES:
            np.save(self.root / f'{name}.npy', np.zeros((4, 8, 3), dtype=np.float32))

    def test_resume_does_not_treat_first_light_pass_as_finished(self):
        np.save(self.root / 'moon.npy', np.zeros((4, 8, 3), dtype=np.float32))
        self.assertFalse(passes_complete(self.root))
        self.write_passes()
        self.assertTrue(passes_complete(self.root))

    def test_render_needs_final_metadata_and_untruncated_arrays(self):
        self.write_passes()
        (self.root / 'meta.json').unlink()
        self.assertFalse(passes_complete(self.root))
        write_json_atomic(self.root / 'meta.json', self.meta)
        with (self.root / 'sky.npy').open('r+b') as file:
            file.truncate(150)
        self.assertFalse(passes_complete(self.root))

    def test_half_painted_shot_is_not_published(self):
        Image.new('RGB', (8, 4)).save(self.root / 'paint.webp')
        self.assertFalse(painting_complete(self.root))
        Image.new('RGB', (8, 4)).save(self.root / 'depth.png')
        self.assertTrue(painting_complete(self.root))
        (self.root / 'paint.webp').write_bytes(b'RIFF')
        self.assertFalse(painting_complete(self.root))

    def test_large_painting_needs_half_resolution_packed_depth(self):
        self.meta.update(width=2002, height=4)
        write_json_atomic(self.root / 'meta.json', self.meta)
        Image.new('RGB', (2002, 4)).save(self.root / 'paint.webp')
        Image.new('RGB', (2002, 4)).save(self.root / 'depth.png')
        self.assertFalse(painting_complete(self.root))
        Image.new('RGB', (1001, 2)).save(self.root / 'depth.png')
        self.assertTrue(painting_complete(self.root))

    def test_failed_manifest_write_keeps_previous_complete_manifest(self):
        path = self.root / 'shots.json'
        write_json_atomic(path, [{'name': 'intro-0'}])
        with self.assertRaises(TypeError):
            write_json_atomic(path, [{'unfinished': object()}])
        self.assertEqual(json.loads(path.read_text()), [{'name': 'intro-0'}])
        self.assertEqual(list(self.root.glob('.*.tmp')), [])


if __name__ == '__main__':
    unittest.main()
