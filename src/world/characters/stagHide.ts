import * as THREE from 'three';

/** The old hide rests over the sacrum, gathers against the haunches, then hangs in heavy folds.
 * Two deliberate losses are cut into the hem; no random holes through its load-bearing saddle.
 * A closed shell gives the lifted hems a painted underside instead of disappearing on a turn. */
export function stagHideGeometry(): THREE.BufferGeometry {
  const across = 40, along = 36, count = (across + 1) * (along + 1);
  const p: number[] = [], grad: number[] = [], idx: number[] = [];
  for (let side = 0; side < 2; side++) for (let j = 0; j <= along; j++) for (let i = 0; i <= across; i++) {
    const u = j / along, v = i / across * 2 - 1, w = Math.abs(v), sign = v < 0 ? -1 : 1;
    const shoulder = 0.34 + 0.07 * Math.sin(u * Math.PI);
    const a = Math.min(1, w / 0.66) * Math.PI / 2;
    const hanging = Math.max(0, (w - 0.58) / 0.42);
    const folds = Math.sin(u * Math.PI * 7 + sign * 0.6) * 0.035 + Math.sin(u * Math.PI * 3 - 0.4) * 0.025;
    // One long weathered lobe on the left, a shorter bitten-away rear corner on the right.
    const loss = 0.32 * Math.exp(-(((u - (v < 0 ? 0.30 : 0.78)) / 0.075) ** 2));
    const drop = (v < 0 ? 0.89 : 0.68) * (0.85 + 0.15 * Math.sin(u * Math.PI)) - loss;
    const curl = Math.sin(hanging * Math.PI) * 0.035 + Math.pow(hanging, 5) * 0.045;
    const x = Math.sin(a) * shoulder * sign + sign * (folds + curl) * hanging;
    const y = 2.29 - u * 0.06 - (1 - Math.cos(a)) * 0.19 - hanging * drop + folds * 0.3 * hanging;
    const z = 0.13 - u * 1.57 + Math.sin(v * Math.PI) * 0.018 * hanging;
    p.push(x - (side ? sign * 0.009 * w : 0), y - (side ? 0.012 * (1 - w * 0.6) : 0), z);
    grad.push(Math.min(1, 0.18 + hanging * 0.55 + (side ? 0.18 : 0) + Math.max(0, -folds) * 2));
  }
  for (let j = 0; j < along; j++) for (let i = 0; i < across; i++) {
    const a = j * (across + 1) + i, b = a + 1, d = a + across + 1, e = d + 1;
    idx.push(a, b, d, b, e, d, a + count, d + count, b + count, b + count, d + count, e + count);
  }
  const rim: number[] = [];
  for (let i = 0; i <= across; i++) rim.push(i);
  for (let j = 1; j <= along; j++) rim.push(j * (across + 1) + across);
  for (let i = across - 1; i >= 0; i--) rim.push(along * (across + 1) + i);
  for (let j = along - 1; j > 0; j--) rim.push(j * (across + 1));
  for (let i = 0; i < rim.length; i++) { const a = rim[i], b = rim[(i + 1) % rim.length]; idx.push(a, a + count, b, b, a + count, b + count); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('grad', new THREE.Float32BufferAttribute(grad, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
