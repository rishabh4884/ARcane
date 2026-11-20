const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

/**
 * The authored 3D world (art pipeline assets) in place of the painted cut-outs. Opt-in with
 * `?world=authored`; kept for comparison while the painted sets replace it.
 */
export const AUTHORED_WORLD = params.get('world') === 'authored';

/**
 * Characters are drawn: ink and paint, animated on twos (see render/InkPaint.ts). `?look=3d` restores
 * the previous lit 3D rendering for comparison.
 */
export const DRAWN_LOOK = params.get('look') !== '3d';

/**
 * The wood is a painted set (see PaintedSet.ts): a background painting projected onto the ground,
 * trunks and stones it was painted from. `?world=cutout` restores the earlier illustrated cut-outs.
 */
export const PAINTED_WORLD = !AUTHORED_WORLD && params.get('world') !== 'cutout';
