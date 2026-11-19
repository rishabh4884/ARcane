import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Creature } from '../src/world/Creature.ts';

const overlays = (creature: Creature) => {
  const found: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  creature.group.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.arcaneOverlay && o.material.blending === THREE.AdditiveBlending) found.push(o as never); });
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
    const pupils = () => { const found: THREE.Mesh[] = []; creature.group.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.arcaneOverlay && o.material.blending === THREE.NormalBlending && o.renderOrder === 4) found.push(o); }); return found; };
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
});
