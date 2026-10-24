import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EnemyCombat } from '../src/world/EnemyCombat.ts';

describe('model-independent enemy reactions', () => {
  it('preserves character shader hooks when cloning and composes frost after skinning', () => {
    const material = new THREE.MeshStandardMaterial();
    material.onBeforeCompile = vi.fn((shader) => { shader.uniforms.characterBreath = { value: 1 }; });
    material.customProgramCacheKey = () => 'test-character-rim';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material);
    const enemy = new EnemyCombat(mesh);
    const live = mesh.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>\n#include <project_vertex>',
      fragmentShader: '#include <common>\n#include <color_fragment>',
    };
    live.onBeforeCompile(shader as never, {} as never);
    expect(material.onBeforeCompile).toHaveBeenCalledOnce();
    expect(shader.uniforms.characterBreath).toBeDefined();
    expect(shader.uniforms.arcaneImpactFlash).toBeDefined();
    expect(shader.vertexShader.indexOf('vArcaneWorldY =')).toBeGreaterThan(shader.vertexShader.indexOf('skinning_vertex'));
    expect(live.customProgramCacheKey()).toContain('test-character-rim');
    enemy.dispose();
  });

  it('isolates model materials and coats a target in frost before restoring it', () => {
    const root = new THREE.Group();
    const original = new THREE.MeshStandardMaterial({ color: '#7b4636', roughness: 0.8 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), original);
    root.add(mesh);

    const combat = new EnemyCombat(root);
    expect(mesh.material).not.toBe(original);
    expect(combat.impact('frost', new THREE.Vector3(0, 1, 0), new THREE.Color('#8bdcff'))).toBe(true);
    expect(combat.frostAmount).toBe(0);
    combat.update(0.45);
    expect(combat.frostAmount).toBeGreaterThan(0.3);
    combat.update(0.55);
    expect(combat.frozen).toBe(true);
    expect(root.children.some((child) => child !== mesh)).toBe(true);

    combat.update(4.5);
    expect(combat.frostAmount).toBe(0);
    combat.dispose();
    expect(mesh.material).toBe(original);
  });

  it('does not treat healing or shielding as enemy hits', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()));
    const combat = new EnemyCombat(root);

    expect(combat.impact('healing', new THREE.Vector3(), new THREE.Color('#ff91c8'))).toBe(false);
    expect(combat.impact('shield', new THREE.Vector3(), new THREE.Color('#c6d9ff'))).toBe(false);
    combat.dispose();
  });

  it('provides world-space broad-phase ray hits for different enemy sizes and positions', () => {
    const root = new THREE.Group();
    root.position.z = -6;
    root.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), new THREE.MeshStandardMaterial()));
    const combat = new EnemyCombat(root);
    const point = new THREE.Vector3();
    const distance = combat.intersectRay(
      new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)),
      point,
    );

    expect(distance).toBeCloseTo(5.5, 1);
    expect(point.z).toBeCloseTo(-5.5, 1);
    combat.dispose();
  });
});
