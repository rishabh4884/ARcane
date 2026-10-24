import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { aimAssistRadius, chooseRayTarget, EYE_HEIGHT, forestLayout, GUARDIAN, intersectObstacle, intersectTerrain, moveOnGround, pathX, screenPointAtDepth, seededRandom, SPAWN, SPELL_RANGE, terrainHeight, WORLD_RADIUS } from '../src/world/spatial.ts';

const ray = (origin: number[], direction: number[]) => new THREE.Ray(new THREE.Vector3(...origin), new THREE.Vector3(...direction).normalize());

describe('physical woodland layout', () => {
  it('uses deterministic scenery, not a different forest on every resize or visit', () => {
    expect(forestLayout()).toEqual(forestLayout());
    const a = seededRandom(123), b = seededRandom(123);
    expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b));
    expect(forestLayout().length).toBeGreaterThan(140);
  });

  it('keeps a walkable route and clearance around the player and guardian', () => {
    for (const tree of forestLayout()) {
      expect(Math.hypot(tree.x - SPAWN.x, tree.z - SPAWN.z)).toBeGreaterThan(6);
      expect(Math.hypot(tree.x - GUARDIAN.x, tree.z - GUARDIAN.z)).toBeGreaterThan(16);
      expect(Math.abs(tree.x - pathX(tree.z))).toBeGreaterThan(4);
    }
  });

  it('has real near, middle and distant populations, not a single Z layer', () => {
    const distances = forestLayout().map((site) => Math.hypot(site.x - SPAWN.x, site.z - SPAWN.z));
    expect(distances.some((d) => d < 15)).toBe(true);
    expect(distances.some((d) => d > 20 && d < 50)).toBe(true);
    expect(distances.some((d) => d > 80)).toBe(true);
  });

  it('grounds the clearing and changes smoothly through the hills', () => {
    expect(terrainHeight(0, -12)).toBeCloseTo(0);
    for (let x = -70; x < 70; x += 4) for (let z = -70; z < 70; z += 4) {
      expect(Math.abs(terrainHeight(x + 0.1, z) - terrainHeight(x, z))).toBeLessThan(0.06);
    }
  });
});

describe('navigation collision and grounding', () => {
  const tree = { x: 0, z: -12, radius: 1.2, height: 14 };

  it('cannot tunnel through a trunk even with a long movement step', () => {
    const p = new THREE.Vector3(0, 0, -7);
    moveOnGround(p, 0, -10, [tree]);
    expect(p.z).toBeCloseTo(-12 + 1.2 + 0.42, 5);
    expect(p.y).toBeCloseTo(terrainHeight(p.x, p.z) + EYE_HEIGHT);
  });

  it('slides around the edge rather than stopping all axes', () => {
    const p = new THREE.Vector3(-2.5, 0, -10);
    moveOnGround(p, 3, -3, [tree]);
    expect(Math.hypot(p.x, p.z + 12)).toBeGreaterThanOrEqual(1.61999);
    expect(p.x).toBeGreaterThan(-2.5);
  });

  it('constrains the map without teleporting the player across it', () => {
    const p = new THREE.Vector3(75, 0, 0);
    moveOnGround(p, 10, 0, []);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(WORLD_RADIUS);
    expect(p.y).toBeCloseTo(terrainHeight(p.x, p.z) + EYE_HEIGHT);
  });

  it('is stable when the player starts at a trunk centre', () => {
    const p = new THREE.Vector3(tree.x, 0, tree.z);
    moveOnGround(p, 0, 0, [tree]);
    expect(p.toArray().every(Number.isFinite)).toBe(true);
    expect(p.x).toBeCloseTo(1.62);
  });
});

describe('orientation-independent world aiming', () => {
  const trunk = { x: 0, z: -12, radius: 1, height: 10 };
  it('finds sideways, forward and vertical hits, including cylinder caps', () => {
    expect(intersectObstacle(ray([5, 2, -12], [-1, 0, 0]), trunk, 55)).toBeCloseTo(4);
    expect(intersectObstacle(ray([0, 2, 0], [0, 0, -1]), trunk, 55)).toBeCloseTo(11);
    expect(intersectObstacle(ray([0, 15, -12], [0, -1, 0]), trunk, 55)).toBeCloseTo(5);
    expect(intersectObstacle(ray([0, 2, -12], [0, 1, 0]), trunk, 55)).toBe(0);
  });

  it('rejects behind-camera, out-of-range and above-trunk obstacles', () => {
    expect(intersectObstacle(ray([0, 2, 0], [0, 0, 1]), trunk, 55)).toBeNull();
    expect(intersectObstacle(ray([0, 2, 0], [0, 0, -1]), trunk, 5)).toBeNull();
    expect(intersectObstacle(ray([0, 15, 0], [0, 0, -1]), trunk, 55)).toBeNull();
  });

  it('raycasts the same terrain used for walking, even looking straight down', () => {
    expect(intersectTerrain(ray([0, 5, -12], [0, -1, 0]), SPELL_RANGE)).toBeCloseTo(5, 2);
    expect(intersectTerrain(ray([0, 5, -12], [0, 1, 0]), SPELL_RANGE)).toBeNull();
    expect(intersectTerrain(ray([0, 5, -12], [1, 0, 0]), SPELL_RANGE)).toBeNull();
  });

  it('selects only the nearest in-range enemy in front of opaque terrain/trees', () => {
    const aim = ray([0, 2, 0], [1, 0, 0]);
    const intersect = (distance: number) => distance;
    expect(chooseRayTarget(aim, 55, 20, [30, 10, 15], intersect).enemy).toBe(10);
    expect(chooseRayTarget(aim, 55, 8, [30, 10, 15], intersect).enemy).toBeNull();
    expect(chooseRayTarget(aim, 55, null, [80, -5, NaN, Infinity], intersect).point.x).toBe(55);
    expect(chooseRayTarget(aim, 55, 8, [30, 10, 15], intersect).point.x).toBe(8);
  });

  it('widens hand aim with distance while capping the assist window', () => {
    expect(aimAssistRadius(1)).toBeCloseTo(0.38);
    expect(aimAssistRadius(20)).toBeGreaterThan(1.4);
    expect(aimAssistRadius(100)).toBe(1.6);
  });

  it('keeps screen markers on the camera-facing plane after a full turn and resize', () => {
    const camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.15, 240);
    camera.position.set(25, 4, -10);
    camera.rotation.set(0.4, Math.PI / 2, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    const point = new THREE.Vector3();
    screenPointAtDepth(camera, 0.8, 0.2, 7, point);
    expect(point.clone().applyMatrix4(camera.matrixWorldInverse).z).toBeCloseTo(-7);
    const screen = point.clone().project(camera);
    expect(screen.x).toBeCloseTo(0.6);
    expect(screen.y).toBeCloseTo(0.6);
    camera.aspect = 390 / 844; camera.updateProjectionMatrix();
    screenPointAtDepth(camera, 0.8, 0.2, 7, point);
    expect(point.clone().project(camera).x).toBeCloseTo(0.6);
    expect(point.clone().project(camera).y).toBeCloseTo(0.6);
  });
});
