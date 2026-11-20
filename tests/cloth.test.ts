import { describe, expect, it } from 'vitest';
import { BodyProxy, drape, RadialHull, union } from '../src/world/rig/Cloth.ts';

describe('draped cloth', () => {
  const body = new BodyProxy().ellipsoid([0, 1.2, 0], [0.3, 0.5, 0.25]).capsule([0.15, 0.8, 0], [0.15, 0.05, 0], 0.1).capsule([-0.15, 0.8, 0], [-0.15, 0.05, 0], 0.1);
  const skirt = drape({
    cols: 32, rows: 24, closed: true, profile: [[0.4, 1.3], [0.5, 0.8], [0.7, 0.1]], extra: 0.1,
    sew: (u, _v, p) => { const a = u * Math.PI * 2; p.set(Math.sin(a) * 0.3, 1.3, Math.cos(a) * 0.26); },
    collider: body, thickness: 0.02, folds: 6, foldDepth: 0.05, steps: 60,
    color: '#333', surface: 'fabric', bones: ['hips'],
  });
  const pos = skirt.geometry.attributes.position;

  it('settles to finite positions, above the ground and off the body', () => {
    let inside = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(0);
      if (body.distance(x, y, z) < -0.01) inside++;
    }
    expect(inside / pos.count).toBeLessThan(0.02);
  });

  it('stays sewn where it was pinned and falls into folds below', () => {
    const top = skirt.at(0, 0);
    expect(top[1]).toBeCloseTo(1.3, 3);
    // The hem hangs lower than it started and has gathered radially (not a perfect circle).
    const radii = skirt.hem.map((p) => Math.hypot(p[0], p[2]));
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
    const spread = Math.sqrt(radii.reduce((a, r) => a + (r - mean) ** 2, 0) / radii.length);
    expect(spread / mean).toBeGreaterThan(0.01);
  });

  it('gives the next layer a hull to lie on', () => {
    const hull = new RadialHull(skirt.geometry, 0, 0, 1, 0.02);
    const both = union(body, hull);
    expect(both.distance(0, 0.5, 0)).toBeLessThan(0);
    expect(both.distance(2, 0.5, 0)).toBeGreaterThan(0);
    expect(skirt.colors.length).toBe(pos.count * 3);
    expect(skirt.bones.every((b) => b[0] === 'hips')).toBe(true);
  });
});
