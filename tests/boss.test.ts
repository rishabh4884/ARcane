import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Boss, fitBossStage, disposeModel } from '../src/world/Boss.ts';
import { EnemyCombat } from '../src/world/EnemyCombat.ts';

describe('Balrog world model', () => {
  it('exports the Mystic with a real skin, painted materials and eight baked bone clips', () => {
    const buffer = readFileSync(new URL('../public/assets/boss/balrog-mystic.glb', import.meta.url));
    const length = buffer.readUInt32LE(12);
    const asset = JSON.parse(buffer.toString('utf8', 20, 20 + length));
    expect(buffer.length).toBeLessThan(8_000_000);
    expect(asset.skins[0].joints.length).toBe(18);
    expect(asset.animations.map((clip: { name: string }) => clip.name)).toEqual(expect.arrayContaining([
      'Idle', 'Hit_Left', 'Hit_Right', 'Shock', 'Gust', 'Stagger', 'Freeze', 'Break_Free',
    ]));
    const bodyNode = asset.nodes.find((node: { skin?: number }) => node.skin !== undefined);
    const primitive = asset.meshes[bodyNode.mesh].primitives[0];
    expect(primitive.attributes.JOINTS_0).toBeDefined();
    expect(primitive.attributes.WEIGHTS_0).toBeDefined();
    const material = asset.materials[primitive.material];
    expect(material.pbrMetallicRoughness.baseColorTexture).toBeDefined();
    expect(material.normalTexture).toBeDefined();
    for (const clip of asset.animations) {
      expect(clip.channels.length).toBeGreaterThan(0);
      expect(clip.channels.some((channel: { target: { node: number } }) => asset.skins[0].joints.includes(channel.target.node))).toBe(true);
    }
  });

  it('exports the standing sculpt with UVs and an embedded hand-painted fantasy texture', () => {
    const buffer = readFileSync(new URL('../public/assets/boss/balrog.glb', import.meta.url));
    expect(buffer.toString('ascii', 0, 4)).toBe('glTF');
    const jsonLength = buffer.readUInt32LE(12);
    const asset = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
    const primitive = asset.meshes[0].primitives[0];
    const positions = asset.accessors[primitive.attributes.POSITION];
    const size = positions.max.map((max: number, index: number) => max - positions.min[index]);
    // Calibrated to the provided source, not just an arbitrary 'six units tall' assertion:
    // the incorrect X/Z swap produced a 12.3-wide, 6.8-deep figure on its back.
    expect(size[0]).toBeCloseTo(10.91, 1);
    expect(size[1]).toBeCloseTo(6, 1);
    expect(size[2]).toBeCloseTo(5.33, 1);
    expect(primitive.attributes.TEXCOORD_0).toBeDefined();
    expect(Object.keys(primitive.attributes).filter((name: string) => name.startsWith('COLOR_'))).toEqual([]);
    const material = asset.materials[asset.meshes[0].primitives[0].material];
    const textureIndex = material.pbrMetallicRoughness.baseColorTexture.index;
    const texture = asset.textures[textureIndex];
    const image = asset.images[texture.source];
    expect(image.mimeType).toBe('image/jpeg');
    expect(image.bufferView).toBeTypeOf('number');
    const binaryStart = 20 + jsonLength + 8;
    const imageView = asset.bufferViews[image.bufferView];
    const jpegStart = binaryStart + (imageView.byteOffset ?? 0);
    expect(buffer.readUInt16BE(jpegStart)).toBe(0xffd8);
    const normalIndex = material.normalTexture.index;
    expect(asset.textures[normalIndex]).toBeDefined();
    const normalImage = asset.images[asset.textures[normalIndex].source];
    expect(normalImage.mimeType).toBe('image/png');
    const normalView = asset.bufferViews[normalImage.bufferView];
    const normalStart = binaryStart + (normalView.byteOffset ?? 0);
    expect(buffer.readUInt8(normalStart)).toBe(0x89);
    expect(buffer.toString('ascii', normalStart + 1, normalStart + 8)).toBe('PNG\r\n\x1a\n');
  });

  it.each([[16, 9], [1366, 768], [390, 844], [844, 390], [1, 1]])(
    'keeps every projected wing/plinth corner clear of the frame and dock at %i:%i', (width, height) => {
      const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 200);
      camera.position.set(0, 0.6, 7);
      camera.lookAt(0, 0.1, -4);
      const group = new THREE.Group();
      const bounds = new THREE.Box3(new THREE.Vector3(-5.6, -0.8, -4.3), new THREE.Vector3(5.6, 6.3, 4.3));
      fitBossStage(group, bounds, camera);
      expect(group.scale.x).toBeGreaterThan(0);
      for (let i = 0; i < 8; i++) {
        const corner = new THREE.Vector3(
          i & 1 ? bounds.max.x : bounds.min.x,
          i & 2 ? bounds.max.y : bounds.min.y,
          i & 4 ? bounds.max.z : bounds.min.z,
        ).applyMatrix4(group.matrixWorld).project(camera);
        expect(corner.x).toBeGreaterThanOrEqual(-0.88);
        expect(corner.x).toBeLessThanOrEqual(0.88);
        expect(corner.y).toBeGreaterThanOrEqual(-0.68);
        expect(corner.y).toBeLessThanOrEqual(0.83);
      }
      const scale = group.scale.x;
      const position = group.position.clone();
      fitBossStage(group, bounds, camera);
      expect(group.scale.x).toBeCloseTo(scale, 6);
      expect(group.position.distanceTo(position)).toBeLessThan(1e-6);
    },
  );

  it('does not rotate a standing sculpt onto its back during idle motion', () => {
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 1), new THREE.MeshStandardMaterial());
    const boss = new Boss(model, new THREE.Texture());
    boss.update(2);
    boss.group.updateMatrixWorld(true);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(model.matrixWorld);
    expect(up.dot(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(0.999);
    boss.dispose();
  });

  it('gives left and right spell impacts distinct recoil and lets frost suppress the idle', () => {
    const model = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 1), new THREE.MeshStandardMaterial());
    const boss = new Boss(model, new THREE.Texture());
    boss.react('arrow', new THREE.Vector3(-1, 3, -9));
    boss.update(0.06);
    const leftImpactRoll = model.parent!.rotation.z;

    boss.react('lightning', new THREE.Vector3(1, 3, -9));
    boss.update(0.06);
    const rightImpactRoll = model.parent!.rotation.z;
    expect(leftImpactRoll * rightImpactRoll).toBeLessThan(0);

    boss.setFrostAmount(1);
    boss.update(0.2);
    const frozenRotation = model.parent!.rotation.clone();
    boss.update(0.2);
    expect(Math.hypot(
      model.parent!.rotation.x - frozenRotation.x,
      model.parent!.rotation.y - frozenRotation.y,
      model.parent!.rotation.z - frozenRotation.z,
    )).toBeLessThan(0.01);
    boss.dispose();
  });

  it('flashes the live per-enemy material instance after enemy material isolation', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 1), new THREE.MeshStandardMaterial());
    root.add(mesh);
    const boss = new Boss(root, new THREE.Texture());
    const enemy = new EnemyCombat(root);

    boss.flash('#ff6347');
    boss.update(0.05);
    const liveMaterial = mesh.material as THREE.MeshStandardMaterial;
    expect(liveMaterial.emissiveIntensity).toBeGreaterThan(0);
    expect(liveMaterial.emissive.getHex()).toBe(new THREE.Color('#ff6347').getHex());

    enemy.dispose();
    boss.dispose();
  });

  it('preserves a single glTF material, prepares it for spell flashes, and disposes it safely', () => {
    const geometry = new THREE.BoxGeometry(2, 3, 1);
    const material = new THREE.MeshStandardMaterial({ color: '#fff' });
    const model = new THREE.Mesh(geometry, material);
    const boss = new Boss(model, new THREE.Texture());

    expect(model.material).not.toBeInstanceOf(Array);
    const prepared = model.material as THREE.MeshStandardMaterial;
    expect(prepared.onBeforeCompile).not.toBe(material.onBeforeCompile);
    expect(boss.group.position.z).toBe(-9);

    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <emissivemap_fragment>',
    };
    prepared.onBeforeCompile(shader as never, {} as never);
    expect(shader.vertexShader).toContain('arcaneWingFlinch');
    expect(shader.vertexShader).toContain('arcaneBreathing');

    boss.flash('#51ddff');
    boss.update(0.1);
    expect((model.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);

    expect(() => boss.dispose()).not.toThrow();
    expect(() => boss.dispose()).not.toThrow();
  });

  it('disposes a model loaded after its world has been destroyed', () => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    expect(() => disposeModel(group)).not.toThrow();
  });
});
