import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A cupped petal with a narrow attachment, rolled lip and a soft central fold.
 * +Y points from the calyx to its tip; the two skins join around the rim. */
export function petalGeometry(length: number, width: number, curl = 0.08, rows = 12, cols = 8): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const top = new THREE.Color('#fff1d4'), fold = new THREE.Color('#a89e85');
  const n = (rows + 1) * (cols + 1);
  for (let side = 0; side < 2; side++) for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const u = r / rows, v = c / cols * 2 - 1;
    const span = width * (0.045 + 0.955 * Math.pow(Math.sin(Math.PI * u), 0.7));
    positions.push(v * span * (1 + 0.07 * Math.sin(u * 5 + v)), u * length,
      curl * (u * u + v * v * Math.sin(Math.PI * u) * 0.65) - 0.018 * Math.sin(Math.PI * u) * (1 - v * v) + (side ? -0.0025 : 0.0025));
    const paint = top.clone().lerp(fold, (side ? 0.34 : 0.08) + Math.abs(v) * 0.1 + (1 - u) * 0.18);
    colors.push(paint.r, paint.g, paint.b);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
    indices.push(a, b, d, b, e, d, a + n, d + n, b + n, b + n, d + n, e + n);
  }
  const rim: number[] = [];
  for (let c = 0; c <= cols; c++) rim.push(c);
  for (let r = 1; r <= rows; r++) rim.push(r * (cols + 1) + cols);
  for (let c = cols - 1; c >= 0; c--) rim.push(rows * (cols + 1) + c);
  for (let r = rows - 1; r > 0; r--) rim.push(r * (cols + 1));
  for (let i = 0; i < rim.length; i++) { const a = rim[i], b = rim[(i + 1) % rim.length]; indices.push(a, a + n, b, b, a + n, b + n); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

/** A small complete woodland bloom, including its stem, cup and five overlapping petals. */
export function fieldFlowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.007, 0.012, 0.18, 5, 2).translate(0, 0.09, 0);
  stem.deleteAttribute('uv');
  const green = new THREE.Color('#526140');
  stem.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({length:stem.attributes.position.count}, () => [green.r, green.g, green.b]).flat(), 3));
  parts.push(stem);
  for (let i = 0; i < 5; i++) {
    const g = petalGeometry(0.11, 0.045, 0.025, 5, 3);
    g.rotateX(1.05 + (i % 2) * 0.13).rotateY(i * Math.PI * 2 / 5).translate(0, 0.18, 0);
    parts.push(g);
  }
  const cup = new THREE.SphereGeometry(0.024, 7, 4).scale(1, 0.5, 1).translate(0, 0.185, 0);
  cup.deleteAttribute('uv');
  const ochre = new THREE.Color('#b99848');
  cup.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({length:cup.attributes.position.count}, () => [ochre.r, ochre.g, ochre.b]).flat(), 3));
  parts.push(cup);
  const geometry = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return geometry;
}
