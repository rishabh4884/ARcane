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

export interface PlannedShot extends PaintCamera { script: string; key: number; /** whose light it is painted in */ region: string }

/** Painted frames are wider than any screen and a little taller than the key's own view. */
export const SHOT_ASPECT = 2;
export const SHOT_FOV_PAD = 1.18;

const SCREEN_ASPECT = 16 / 9;

function basis(position: THREE.Vector3, lookAt: THREE.Vector3) {
  // Use the renderer's pole handling too: a canopy view looking straight up still has a full frame.
  const matrix = new THREE.Matrix4().lookAt(position, lookAt, new THREE.Vector3(0, 1, 0));
  const fwd = new THREE.Vector3().setFromMatrixColumn(matrix, 2).negate();
  const right = new THREE.Vector3().setFromMatrixColumn(matrix, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(matrix, 1);
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

/** The light a cutscene is in at time `t`: its mood, or the mood it turns to once it has turned. */
export function lightAt(script: Script, t: number): string {
  const to = script.toMood;
  return to && t >= to.at + to.seconds * 0.5 ? to.mood : script.mood;
}

/**
 * The paintings cutscenes need beyond the gameplay painting: one for each camera key the gameplay
 * painting cannot hold and no earlier painting of the same scene, in the same light, already holds.
 */
export function planShots(scripts: readonly Script[], gameplay: PaintCamera): PlannedShot[] {
  const out: PlannedShot[] = [];
  for (const script of scripts) {
    script.camera.forEach((key, i) => {
      const position = new THREE.Vector3(...key.p), lookAt = new THREE.Vector3(...key.l), fov = key.fov ?? 50;
      const region = lightAt(script, key.t);
      const own = out.filter((p) => p.script === script.id && p.region === region);
      if ((region === script.mood && covers(gameplay, position, lookAt, fov)) || own.some((p) => covers(p, position, lookAt, fov))) return;
      out.push({
        name: `${script.id}-${i}`, script: script.id, key: i, region,
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
  return Math.exp(viewLogScore(p, camera, eye, dir));
}

/** The same score in log space, so distant camera moves can still rank and blend their paintings. */
export function viewLogScore(p: PaintCamera, camera: THREE.PerspectiveCamera, eye = new THREE.Vector3(), dir = new THREE.Vector3()): number {
  camera.getWorldPosition(eye);
  camera.getWorldDirection(dir);
  const d = (eye.x - p.position[0]) ** 2 + (eye.y - p.position[1]) ** 2 + (eye.z - p.position[2]) ** 2;
  const dx = p.lookAt[0] - p.position[0], dy = p.lookAt[1] - p.position[1], dz = p.lookAt[2] - p.position[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  const turn = Math.acos(THREE.MathUtils.clamp((dir.x * dx + dir.y * dy + dir.z * dz) / length, -1, 1));
  return -d / 0.64 - (turn / 0.21) ** 2;
}
