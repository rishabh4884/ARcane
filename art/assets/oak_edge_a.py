"""An old oak of the Hushed Edge, the kind that frames the clearing (see _trees.py)."""
from assets._trees import TreeDesign, build


def spec():
    return build(TreeDesign(
        'oak_edge_a', seed=11, height=7.8, base=0.95, top=0.3, lean=(0.3, -0.15), twist=0.9,
        limbs=[(4.6, 0.4, 3.4, 1.0, 0.22), (5.4, 2.5, 3.0, 1.2, 0.2), (6.2, 4.3, 2.8, 1.3, 0.19), (7.0, 1.4, 2.2, 1.4, 0.16), (3.9, 3.4, 2.6, 0.6, 0.18)],
        crown=[((0.3, 9.6, 0.0), (3.4, 2.1, 3.0)), ((2.9, 8.2, 0.8), (2.0, 1.4, 1.8)), ((-2.6, 8.6, -0.5), (2.1, 1.5, 1.9)),
               ((-0.8, 11.0, 0.9), (1.8, 1.3, 1.6)), ((1.8, 7.0, -2.1), (1.3, 1.0, 1.2)), ((-1.0, 7.4, 2.3), (1.2, 0.9, 1.1))],
        hollow=(0.48, 1.5, 0.36),
    ))
