"""A slender birch at the wood's edge: pale peeling bark, dark bands, a thin crown held high (see _trees.py)."""
from arcane_art.sdf import Relief
from assets._trees import TreeDesign, build


def spec():
    return build(TreeDesign(
        'birch_edge_a', seed=37, height=11.0, base=0.32, top=0.12, lean=(0.5, 0.2), bends=3, twist=0.3, square=2.1, roots=4,
        root_reach=(0.6, 1.1),
        limbs=[(6.5, 0.8, 1.6, 1.0, 0.07), (7.6, 2.9, 1.4, 1.1, 0.06), (8.4, 4.6, 1.3, 1.2, 0.055), (9.1, 1.9, 1.1, 1.0, 0.05)],
        crown=[((0.5, 10.6, 0.1), (1.5, 1.7, 1.4)), ((1.3, 8.9, 0.5), (1.0, 1.2, 1.0)), ((-0.6, 9.6, -0.4), (1.1, 1.3, 1.0)),
               ((0.9, 11.9, -0.3), (0.9, 1.0, 0.8))],
        bark='#c3bba9', bark_shade='#5a554c', leaf='#55663a', paint='birch',
        plates=Relief(0.008, 3.0, 0.4, 'fbm', 4), trunk_cell=0.008, faces=9000, crown_cell=0.035, crown_faces=3500,
    ))
