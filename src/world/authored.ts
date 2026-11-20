/**
 * The authored 3D world (art pipeline assets) in place of the painted cut-outs. Opt-in with
 * `?world=authored` while its assets are being built; it becomes the default once the Edge is finished.
 */
export const AUTHORED_WORLD = typeof location !== 'undefined' && new URLSearchParams(location.search).get('world') === 'authored';
