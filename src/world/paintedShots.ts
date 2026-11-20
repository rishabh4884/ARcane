import * as THREE from 'three';
import type { Script } from '../cutscene/Cutscene.ts';

/**
 * SHOTS FOR A PAINTED SET
 * ───────────────────────
 * A series paints a background for every shot. The wood's gameplay view has its painting; a cutscene's
 * camera keys that stray from it (lying on the ground looking up at the canopy, crouching by Tuck) get
 * paintings of their own, made by the same pipeline from the key's own camera. This decides which keys
 * need one: a key is covered when a painting already made stands within a step of it and its whole
 * frame falls inside that painting's frame.
 */

export interface PaintCamera { name: string; position: [number, number, number]; lookAt: [number, number, number]; fov: number; aspect: number }

export interface PlannedShot extends PaintCamera { script: string; key: number }

/** Painted frames are wider than any screen and a little taller than the key's own view. */
export const SHOT_ASPECT = 2;
export const SHOT_FOV_PAD = 1.18;

const SCREEN_ASPECT = 16 / 9;

function basis(position: THREE.Vector3, lookAt: THREE.Vector3) {
  const fwd = lookAt.clone().sub(position).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd);
  return { fwd, right, up };
}

/** Does painting `p` hold the whole frame of a camera at `position` looking at `lookAt` with `fov`? */
export function covers(p: PaintCamera, position: THREE.Vector3, lookAt: THREE.Vector3, fov: number, aspect = SCREEN_ASPECT): boolean {
  const pp = new THREE.Vector3(...p.position);
  if (pp.distanceTo(position) > 0.7) return false;
  const pb = basis(pp, new THREE.Vector3(...p.lookAt));
  const kb = basis(position, lookAt);
  const tv = Math.tan(THREE.MathUtils.degToRad(fov) / 2), th = tv * aspect;
  const ptv = Math.tan(THREE.MathUtils.degToRad(p.fov) / 2) * 0.97, pth = ptv * p.aspect;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const d = kb.fwd.clone().addScaledVector(kb.right, sx * th).addScaledVector(kb.up, sy * tv).normalize();
    const z = d.dot(pb.fwd);
    if (z <= 0.05) return false;
    if (Math.abs(d.dot(pb.right) / z) > pth || Math.abs(d.dot(pb.up) / z) > ptv) return false;
  }
  return true;
}

/** The paintings a region's cutscenes need beyond its gameplay painting. */
export function planShots(scripts: readonly Script[], region: string, gameplay: PaintCamera): PlannedShot[] {
  const out: PlannedShot[] = [];
  for (const script of scripts) {
    if ((script.region ?? 'edge') !== region) continue;
    script.camera.forEach((key, i) => {
      const position = new THREE.Vector3(...key.p), lookAt = new THREE.Vector3(...key.l), fov = key.fov ?? 50;
      if ([gameplay, ...out].some((p) => covers(p, position, lookAt, fov))) return;
      out.push({
        name: `${script.id}-${i}`, script: script.id, key: i,
        position: key.p.map((v) => Math.round(v * 1000) / 1000) as [number, number, number],
        lookAt: key.l.map((v) => Math.round(v * 1000) / 1000) as [number, number, number],
        fov: Math.round(fov * SHOT_FOV_PAD * 100) / 100, aspect: SHOT_ASPECT,
      });
    });
  }
  return out;
}

/**
 * How well a painting serves the current camera: 1 standing at its eye looking its way, falling off
 * with distance and turn. Used to choose (and blend) the paintings to project.
 */
export function viewScore(p: PaintCamera, camera: THREE.PerspectiveCamera, eye = new THREE.Vector3(), dir = new THREE.Vector3()): number {
  camera.getWorldPosition(eye);
  camera.getWorldDirection(dir);
  const d = eye.distanceToSquared(new THREE.Vector3(...p.position));
  const pd = new THREE.Vector3(...p.lookAt).sub(new THREE.Vector3(...p.position)).normalize();
  const turn = Math.acos(THREE.MathUtils.clamp(dir.dot(pd), -1, 1));
  return Math.exp(-d / 0.64) * Math.exp(-((turn / 0.21) ** 2));
}
