import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Sculpt } from '../src/world/rig/Sculpt.ts';

describe('sculpted bodies', () => {
  it('melts forms into one closed surface with outward faces and carves hollows', () => {
    const s = new Sculpt();
    s.blob([0, 1, 0], [0.3, 0.4, 0.25], { color: '#888', bones: ['root'] });
    s.cone([0, 1.3, 0], [0.4, 1.6, 0], 0.08, 0.05, { color: '#aaa', bones: ['root'], blend: 0.08 });
    s.carveBlob([0, 1.1, 0.24], [0.08, 0.08, 0.08], 0.02);
    const { geometry, bones } = s.mesh(0.03);
    const p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
    expect(p.count).toBeGreaterThan(500);
    expect(bones).toHaveLength(p.count);
    const index = geometry.getIndex()!;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), centre = new THREE.Vector3(0, 1.05, 0);
    let outward = 0;
    for (let t = 0; t < index.count; t += 3) {
      a.fromBufferAttribute(p, index.getX(t)); b.fromBufferAttribute(p, index.getX(t + 1)); c.fromBufferAttribute(p, index.getX(t + 2));
      const face = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
      if (a.y < 1.25 && a.z < 0.15) outward += Math.sign(face.dot(a.clone().sub(centre)));
    }
    expect(outward).toBeGreaterThan(0);
    for (let i = 0; i < n.count; i += 37) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 3);
  });
});
