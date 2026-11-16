import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ParticleSystem } from '../src/world/particles.ts';
import { Trail, rng } from '../src/world/vfx.ts';
import { boltPath } from '../src/world/effects.ts';

describe('ParticleSystem', () => {
  it('emits, ages and compacts dead particles out of the draw range', () => {
    const ps = new ParticleSystem(100);
    const color = new THREE.Color('#fff');
    for (let i = 0; i < 10; i++) ps.emit({ x: 0, y: 0, z: 0, vx: 1, vy: 0, vz: 0, color, size: 0.1, ttl: i < 5 ? 0.1 : 1 });
    ps.update(0.05);
    expect(ps.live).toBe(10);
    ps.update(0.1);
    expect(ps.live).toBe(5);
    expect(ps.points.geometry.drawRange.count).toBe(5);
    ps.dispose();
  });

  it('never exceeds its capacity', () => {
    const ps = new ParticleSystem(20);
    ps.burst(new THREE.Vector3(), 80, { speed: 2, color: new THREE.Color('#f00'), size: 0.1, ttl: 1 });
    expect(ps.live).toBe(20);
    ps.dispose();
  });
});

describe('Trail', () => {
  it('builds a strip while moving and empties after its lifetime', () => {
    const trail = new Trail('#fff', 0.1, 0.2);
    for (let i = 0; i < 6; i++) { trail.push(new THREE.Vector3(i * 0.2, 0, 0)); trail.update(0.016); }
    expect(trail.mesh.geometry.drawRange.count).toBeGreaterThan(0);
    trail.update(0.5);
    expect(trail.empty).toBe(true);
    trail.dispose();
  });
});

describe('lightning bolt shape', () => {
  const deviation = (length: number) => {
    const points = boltPath({ x: 0, y: length }, { x: 0, y: 0 }, rng(9), 0.2, 6);
    return Math.max(...points.map((p) => Math.abs(p.x))) / length;
  };
  it('is scale-invariant, so a near (short) bolt is never a fat squashed zig-zag', () => {
    expect(deviation(1.5)).toBeCloseTo(deviation(30), 6);
    expect(deviation(1.5)).toBeLessThan(0.45);
  });
});
