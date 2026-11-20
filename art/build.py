"""
Build art assets headlessly:

    blender -b --factory-startup -P art/build.py -- <asset> [<asset> ...] [--no-review]

Each asset is a module in art/assets/ exposing `spec()` → AssetSpec.
"""
import importlib
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from arcane_art.pipeline import build  # noqa: E402


def main() -> None:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    review = '--no-review' not in argv
    names = [a for a in argv if not a.startswith('--')]
    if names == ['all']:
        names = sorted(f[:-3] for f in os.listdir(os.path.join(HERE, 'assets')) if f.endswith('.py') and not f.startswith('_'))
    failed = []
    for name in names:
        try:
            mod = importlib.import_module(f'assets.{name}')
            build(mod.spec(), review=review)
        except Exception:  # noqa: BLE001
            traceback.print_exc()
            failed.append(name)
    if failed:
        print('[art] FAILED:', ', '.join(failed), flush=True)
        sys.exit(1)


main()
