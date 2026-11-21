import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { petalGeometry, fieldFlowerGeometry } from '../src/cutscene/botany.ts';
import { flowerField } from '../src/cutscene/cast.ts';
import { stagHideGeometry } from '../src/world/characters/stagHide.ts';
import { drawn } from '../src/world/render/DrawnProp.ts';
import { createCreatureProjectile, animateCreatureProjectile, type ProjectileStyle } from '../src/world/fx/creatureProjectiles.ts';

function closedShell(g: THREE.BufferGeometry) {
  const edges = new Map<string, number>();
  const ids = g.index!;
  for (let i = 0; i < ids.count; i += 3) for (let j = 0; j < 3; j++) {
    const a = ids.getX(i + j), b = ids.getX(i + (j + 1) % 3);
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  expect([...edges.values()].every((n) => n === 2)).toBe(true);
  for (const name of ['position', 'normal']) expect(Array.from(g.attributes[name].array).every(Number.isFinite)).toBe(true);
  g.computeBoundingBox();
}

describe('sculpted living props', () => {
  it('closes petal rims and hide hems instead of leaving backface holes', () => {
    const petal = petalGeometry(0.22, 0.075), hide = stagHideGeometry();
    closedShell(petal); closedShell(hide);
    expect(petal.boundingBox!.max.y).toBeCloseTo(0.22);
    expect(hide.boundingBox!.max.y).toBeCloseTo(2.29);
    expect(hide.boundingBox!.min.y).toBeLessThan(1.4);
    expect(hide.boundingBox!.min.y).toBeGreaterThan(1);
    petal.dispose(); hide.dispose();
  });
  it('gives field flowers depth and keeps their planted roots fixed while they sway', () => {
    const geometry = fieldFlowerGeometry(); geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.z - geometry.boundingBox!.min.z).toBeGreaterThan(0.1);
    const ground = vi.fn(() => 2.1), field = flowerField(new THREE.Vector3(), 2, 8, ground);
    field.set(1, 0);
    const before = new THREE.Matrix4(), after = new THREE.Matrix4();
    field.mesh.getMatrixAt(0, before);
    field.set(1, 3); field.mesh.getMatrixAt(0, after);
    expect(new THREE.Vector3().setFromMatrixPosition(after)).toEqual(new THREE.Vector3().setFromMatrixPosition(before));
    expect(after.equals(before)).toBe(false);
    expect(ground).toHaveBeenCalledTimes(8);
    geometry.dispose(); field.mesh.geometry.dispose(); (field.mesh.material as THREE.Material).dispose();
  });
  it('keeps animated flower colour and emission alive after ink conversion', () => {
    const source = new THREE.MeshStandardMaterial({ color: '#fff0c0', emissive: '#907030', emissiveIntensity: 0.1 });
    const mesh = drawn(new THREE.Mesh(new THREE.BoxGeometry(), source));
    source.color.set('#aabbcc'); source.emissiveIntensity = 0.8; source.opacity = 0.4;
    const paint = mesh.material as unknown as THREE.ShaderMaterial;
    paint.onBeforeRender(null!, null!, null!, mesh.geometry, mesh, null!);
    expect(paint.uniforms.uColor.value.equals(source.color)).toBe(true);
    expect(paint.uniforms.uEmissive.value.equals(source.emissive.clone().multiplyScalar(0.8))).toBe(true);
    expect(paint.uniforms.uOpacity.value).toBe(0.4);
    mesh.geometry.dispose(); paint.dispose();
  });
});

describe('creature attack drawings', () => {
  const styles: ProjectileStyle[] = ['ember','bile','boulder','lantern','moth','pale','cold','star','wisp'];
  it.each(styles)('%s owns finite geometry and survives its complete flight animation', (style) => {
    const group = createCreatureProjectile(style, new THREE.Color('#9fb4c8'));
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    group.traverse((o) => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => materials.add(m)); } });
    expect(geometries.size).toBeGreaterThan(0);
    for (const g of geometries) expect(Array.from(g.attributes.position.array).every(Number.isFinite)).toBe(true);
    for (let t = 0; t <= 5; t += 1 / 30) {
      group.lookAt(1, 0, 4); animateCreatureProjectile(group, style, t); group.updateMatrixWorld(true);
      group.traverse((o) => expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
    }
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose();
  });
  it('articulates moth wings and lantern cages independently of the flight path', () => {
    const moth = createCreatureProjectile('moth', new THREE.Color('white'));
    animateCreatureProjectile(moth, 'moth', 0.1);
    expect(Math.abs(moth.getObjectByName('wingL')!.rotation.y)).toBeGreaterThan(0.1);
    const lantern = createCreatureProjectile('lantern', new THREE.Color('white'));
    animateCreatureProjectile(lantern, 'lantern', 0.2);
    expect(Math.abs(lantern.getObjectByName('swinging cage')!.rotation.z)).toBeGreaterThan(0.1);
    expect(lantern.position.length()).toBe(0);
  });
});
