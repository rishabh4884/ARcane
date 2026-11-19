import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Creature } from '../src/world/Creature.ts';

const overlays = (creature: Creature) => {
  const found: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  creature.group.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.eye && o.material.blending === THREE.AdditiveBlending) found.push(o as never); });
  return found;
};

describe('creature expressions', () => {
  it('glares red and opens its jaw during a wind-up', () => {
    const creature = new Creature('goblin');
    creature.animate(1, 'idle', 0, 0.1);
    const calm = overlays(creature)[1].material.color.clone();
    for (let i = 0; i < 20; i++) creature.animate(1 + i * 0.05, 'windup', i / 20, 0.05);
    const angry = overlays(creature)[1].material.color;
    expect(angry.r / Math.max(angry.g, 1e-3)).toBeGreaterThan(calm.r / Math.max(calm.g, 1e-3));
    creature.dispose();
  });

  it('has two glowing eyes and rises out of the ground when the wood awakens', () => {
    const creature = new Creature('wraith');
    expect(overlays(creature).length).toBe(6); // halo + iris + glint per eye
    creature.awaken();
    creature.animate(0, 'idle', 0, 0.001);
    expect(creature.group.visible).toBe(false);
    for (let i = 0; i < 40; i++) creature.animate(i * 0.05, 'idle', 0, 0.05);
    expect(creature.group.visible).toBe(true);
    creature.dispose();
  });

  it('dilates its pupils as it fixes on you and shrinks them to a pinprick when struck', () => {
    const creature = new Creature('goblin');
    const pupils = () => { const found: THREE.Mesh[] = []; creature.group.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.eye && o.material.blending === THREE.NormalBlending) found.push(o); }); return found; };
    expect(pupils()).toHaveLength(2);
    for (let i = 0; i < 20; i++) creature.animate(1 + i * 0.05, 'idle', 0, 0.05);
    const calm = pupils()[0].scale.x;
    for (let i = 0; i < 40; i++) creature.animate(2 + i * 0.05, 'windup', i / 40, 0.05);
    const fixed = pupils()[0].scale.x;
    expect(fixed).toBeGreaterThan(calm * 1.5);
    creature.hit();
    for (let i = 0; i < 6; i++) creature.animate(4 + i * 0.05, 'stagger', i / 6, 0.05);
    expect(pupils()[0].scale.x).toBeLessThan(calm);
    creature.dispose();
  });

  it('has jointed arms: elbows, wrists and separate talons that close on the strike', () => {
    for (const kind of ['goblin', 'root', 'hollow', 'wraith'] as const) {
      const creature = new Creature(kind);
      const talons: THREE.Object3D[] = [];
      creature.group.traverse((o) => { if (o.name === 'talon') talons.push(o); });
      expect(talons.length).toBeGreaterThanOrEqual(6);
      for (let i = 0; i < 30; i++) creature.animate(1 + i * 0.05, 'idle', 0, 0.05);
      const restCurl = talons[0].rotation.x;
      for (let i = 0; i < 40; i++) creature.animate(3 + i * 0.05, 'windup', i / 40, 0.05);
      for (let i = 0; i < 9; i++) creature.animate(5 + i * 0.05, 'strike', i / 8, 0.05);
      if (kind !== 'wraith') expect(talons[0].rotation.x).toBeLessThan(restCurl - 0.3);
      const point = creature.castPoint(new THREE.Vector3());
      expect(Number.isFinite(point.x) && point.y > 0).toBe(true);
      creature.dispose();
    }
  });

  it('stops dead now and then while walking, and reports it so it does not slide', () => {
    const creature = new Creature('goblin');
    let stopped = false;
    for (let i = 0; i < 400; i++) { creature.animate(i * 0.05, 'walk', 0, 0.05); if (i > 20 && creature.gait < 0.1) stopped = true; }
    expect(stopped).toBe(true);
    expect(creature.gait).toBeGreaterThanOrEqual(0);
    creature.dispose();
  });
});
