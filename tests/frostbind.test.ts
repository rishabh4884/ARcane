import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createSpellAnimation, type SpellContext } from '../src/world/effects.ts';

const target = new THREE.Vector3(2, 1.4, -12);
function cast(context: Partial<SpellContext> = {}) {
  return createSpellAnimation('frost', new THREE.Vector3(0, 1.8, 10), target, new THREE.Color('#86cbea'), undefined, {
    groundY: 0.2, cameraQuaternion: new THREE.Quaternion(), ...context,
  });
}

describe('drawn Frostbind', () => {
  it('holds growth drawings without delaying the combat impact beat', () => {
    const animation = cast();
    const hit = vi.fn();
    animation.setImpactCallback(hit);
    const crystal = animation.group.getObjectByName('Frostbind crystal')!;
    expect(crystal.visible).toBe(false);
    animation.update(0.09);
    expect(crystal.visible).toBe(true);
    const held = crystal.scale.clone();
    animation.update(0.02);
    expect(crystal.scale.equals(held)).toBe(true);
    expect(hit).not.toHaveBeenCalled();
    animation.update(0.02);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(crystal.scale.equals(held)).toBe(true);
    animation.update(0.04);
    expect(crystal.scale.y).toBeGreaterThan(held.y);
    expect(animation.update(1.33)).toBe(false);
    expect(hit).toHaveBeenCalledTimes(1);
    animation.dispose();
  });

  it('keeps the crystals rooted while the viewing direction changes', () => {
    const cameraQuaternion = new THREE.Quaternion();
    const animation = cast({ cameraQuaternion });
    animation.update(0.6);
    const crystal = animation.group.getObjectByName('Frostbind crystal')!;
    const foot = crystal.position.clone();
    const orientation = crystal.quaternion.clone();
    cameraQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.6);
    animation.update(0.01);
    expect(crystal.position.equals(foot)).toBe(true);
    expect(crystal.quaternion.angleTo(orientation)).toBeGreaterThan(1);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(crystal.quaternion);
    const cameraNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraQuaternion);
    expect(normal.dot(cameraNormal)).toBeCloseTo(1, 6);
    expect(target.y + foot.y).toBeCloseTo(0.22, 6);
    animation.dispose();
  });

  it('finishes and releases its geometry and paint after a skipped animation interval', () => {
    const animation = cast();
    const meshes: THREE.Mesh[] = [];
    animation.group.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
    const geometries = new Set(meshes.map((mesh) => mesh.geometry));
    const materials = new Set(meshes.flatMap((mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material]));
    const released = [...geometries, ...materials].map((resource) => {
      const listener = vi.fn();
      resource.addEventListener('dispose', listener);
      return listener;
    });
    expect(animation.update(3)).toBe(false);
    for (const mesh of meshes) {
      expect(mesh.position.toArray().every(Number.isFinite)).toBe(true);
      expect(mesh.scale.toArray().every((n) => Number.isFinite(n) && n >= 0)).toBe(true);
    }
    expect(animation.group.getObjectByName('Frostbind crystal')!.visible).toBe(false);
    animation.dispose();
    released.forEach((listener) => expect(listener).toHaveBeenCalled());
  });
});
