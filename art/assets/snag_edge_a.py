"""A dead snag: its crown long gone, its top snapped, bare limbs and a hollow (see _trees.py)."""
from assets._trees import TreeDesign, build


def spec():
    return build(TreeDesign(
        'snag_edge_a', seed=53, height=6.4, base=0.72, top=0.2, lean=(-0.5, 0.3), bends=3, twist=1.4, square=2.5, roots=6,
        limbs=[(3.6, 1.1, 2.0, 0.9, 0.12), (4.6, 3.8, 1.6, 1.3, 0.1), (5.4, 5.4, 1.2, 0.8, 0.08)],
        broken=(6.0, 0.6), hollow=(-0.3, 2.2, 0.45), bark='#4e4740', paint='dead', crown=[], faces=9000,
    ))
