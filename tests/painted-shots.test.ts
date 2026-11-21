import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CameraKey, Script } from '../src/cutscene/Cutscene.ts';
import { SCRIPTS } from '../src/cutscene/scripts.ts';
import { covers, lightAt, planShots, viewLogScore, viewScore, type PaintCamera } from '../src/world/paintedShots.ts';

const gameplay: PaintCamera = {
  name: 'edge', position: [0, 2, 0], lookAt: [0, 2, -10], fov: 64, aspect: 2,
};
const key = (t = 0, x = 0): CameraKey => ({ t, p: [x, 2, -3], l: [x, 2, -10], fov: 50 });
const script = (camera: CameraKey[], overrides: Partial<Script> = {}): Script => ({
  id: 'scene', duration: 20, mood: 'edge', camera, lines: [], build() {}, tick() {}, ...overrides,
});
const at = (painting: PaintCamera): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9);
  camera.position.fromArray(painting.position);
  camera.lookAt(new THREE.Vector3(...painting.lookAt));
  camera.updateMatrixWorld(true);
  return camera;
};

describe('painted frame coverage', () => {
  it('requires the whole visible frame and nearby viewpoint to fit the painting', () => {
    const position = new THREE.Vector3(...gameplay.position), lookAt = new THREE.Vector3(...gameplay.lookAt);
    expect(covers(gameplay, position, lookAt, 50)).toBe(true);
    expect(covers(gameplay, position, lookAt, 70)).toBe(false);
    expect(covers(gameplay, position, lookAt, 50, 3)).toBe(false);
    expect(covers(gameplay, position.clone().add(new THREE.Vector3(0.8, 0, 0)), lookAt, 50)).toBe(false);
    expect(covers(gameplay, position, new THREE.Vector3(0, 2, 10), 50)).toBe(false);
  });

  it.each([1, -1])('keeps a valid frame when looking vertically (%s)', (direction) => {
    const painting: PaintCamera = { ...gameplay, position: [0, 0, 0], lookAt: [0, direction, 0] };
    const position = new THREE.Vector3(), lookAt = new THREE.Vector3(...painting.lookAt);
    expect(covers(painting, position, lookAt, 50)).toBe(true);
    expect(covers(painting, position, lookAt, 80)).toBe(false);
    expect(covers(painting, position, lookAt, 50, 3)).toBe(false);
  });
});

describe('cutscene painting plans', () => {
  it('reuses gameplay and same-scene paintings, but gives a distant view its own frame', () => {
    const scene = script([
      { t: 0, p: gameplay.position, l: gameplay.lookAt, fov: 50 },
      key(1), key(2), key(3, 2),
    ]);
    const shots = planShots([scene], gameplay);
    expect(shots.map((p) => p.name)).toEqual(['scene-1', 'scene-3']);
    for (const shot of shots) {
      const camera = scene.camera[shot.key];
      expect(covers(shot, new THREE.Vector3(...camera.p), new THREE.Vector3(...camera.l), camera.fov!)).toBe(true);
    }
  });

  it('does not borrow a shot from another scene whose paintings will not be loaded', () => {
    const shots = planShots([script([key()]), script([key()], { id: 'other' })], gameplay);
    expect(shots.map((p) => p.name)).toEqual(['scene-0', 'other-0']);
  });

  it('paints the same viewpoint again when its light changes, including the gameplay view', () => {
    const scene = script([
      { t: 0, p: gameplay.position, l: gameplay.lookAt, fov: 50 },
      key(2), key(12),
      { t: 14, p: gameplay.position, l: gameplay.lookAt, fov: 50 },
    ], { toMood: { mood: 'dawn', at: 8, seconds: 4 } });
    expect(planShots([scene], gameplay).map(({ name, region }) => ({ name, region }))).toEqual([
      { name: 'scene-1', region: 'edge' },
      { name: 'scene-2', region: 'dawn' },
      { name: 'scene-3', region: 'dawn' },
    ]);
  });

  it('changes the planned light at the transition midpoint', () => {
    const scene = script([], { mood: 'throne', toMood: { mood: 'dawn', at: 11, seconds: 8 } });
    expect(lightAt(scene, 14.99)).toBe('throne');
    expect(lightAt(scene, 15)).toBe('dawn');
    expect(lightAt(script([]), 100)).toBe('edge');
    expect(lightAt(script([], { toMood: { mood: 'dawn', at: 2, seconds: 0 } }), 2)).toBe('dawn');
  });

  it('covers every campaign camera key with a painting in its own scene and light', () => {
    const meta = JSON.parse(readFileSync(new URL('../public/art/sets/edge/meta.json', import.meta.url), 'utf8'));
    const base: PaintCamera = { ...meta, name: 'edge' };
    const scenes = Object.values(SCRIPTS), shots = planShots(scenes, base);
    expect(new Set(shots.map((p) => p.name)).size).toBe(shots.length);
    for (const scene of scenes) {
      for (const camera of scene.camera) {
        const region = lightAt(scene, camera.t);
        const candidates = shots.filter((p) => p.script === scene.id && p.region === region);
        if (region === scene.mood) candidates.push({ ...base, script: scene.id, key: -1, region });
        expect(candidates.some((p) => covers(p, new THREE.Vector3(...camera.p), new THREE.Vector3(...camera.l), camera.fov ?? 50)),
          `${scene.id} at ${camera.t}s has no painting in ${region} light`).toBe(true);
      }
    }
    expect(shots.filter((p) => p.script === 'ending').map((p) => p.region)).toEqual([
      'throne', 'throne', 'dawn', 'dawn', 'dawn', 'dawn',
    ]);
  });
});

describe('painting choice', () => {
  it('retains the nearest painting when distant views underflow to zero in linear space', () => {
    const camera = at(gameplay);
    camera.position.x = 100;
    camera.updateMatrixWorld(true);
    const nearer: PaintCamera = { ...gameplay, position: [2, 2, 0], lookAt: [2, 2, -10] };
    expect(viewScore(gameplay, camera)).toBe(0);
    expect(viewScore(nearer, camera)).toBe(0);
    expect(viewLogScore(nearer, camera)).toBeGreaterThan(viewLogScore(gameplay, camera));
    expect(Number.isFinite(viewLogScore(nearer, camera))).toBe(true);
  });

  it('prefers a painting at the eye and facing the view over distant or turned paintings', () => {
    const camera = at(gameplay);
    const nearby: PaintCamera = { ...gameplay, position: [0.3, 2, 0], lookAt: [0.3, 2, -10] };
    const distant: PaintCamera = { ...gameplay, position: [2, 2, 0], lookAt: [2, 2, -10] };
    const turned: PaintCamera = { ...gameplay, lookAt: [2, 2, -10] };
    const backwards: PaintCamera = { ...gameplay, lookAt: [0, 2, 10] };
    expect(viewScore(gameplay, camera)).toBeCloseTo(1);
    expect(viewScore(gameplay, camera)).toBeGreaterThan(viewScore(nearby, camera));
    expect(viewScore(nearby, camera)).toBeGreaterThan(viewScore(distant, camera));
    expect(viewScore(gameplay, camera)).toBeGreaterThan(viewScore(turned, camera));
    expect(viewScore(backwards, camera)).toBeLessThan(1e-20);
  });

  it('gives equal weight halfway between matching views and transfers weight as the eye moves', () => {
    const left: PaintCamera = { ...gameplay, position: [-0.4, 2, 0], lookAt: [-0.4, 2, -10] };
    const right: PaintCamera = { ...gameplay, position: [0.4, 2, 0], lookAt: [0.4, 2, -10] };
    const camera = at(gameplay);
    expect(viewScore(left, camera)).toBeCloseTo(viewScore(right, camera));
    camera.position.x = 0.2;
    camera.updateMatrixWorld(true);
    expect(viewScore(right, camera)).toBeGreaterThan(viewScore(left, camera));
  });

  it('scores the world camera pose when it belongs to a transformed parent', () => {
    const camera = new THREE.PerspectiveCamera(50, 16 / 9), parent = new THREE.Group();
    parent.position.set(4, 3, 2);
    parent.rotation.y = Math.PI / 2;
    parent.add(camera);
    parent.updateMatrixWorld(true);
    const painting: PaintCamera = { ...gameplay, position: [4, 3, 2], lookAt: [3, 3, 2] };
    expect(viewScore(painting, camera)).toBeCloseTo(1);
  });
});
