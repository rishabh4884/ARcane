import * as THREE from 'three';
import { KINDLER_HANDS } from '../cutscene/cast.ts';
import { DESIGNS } from '../world/characters/index.ts';
import { GNOME_DESIGNS } from '../world/GnomeSummons.ts';
import { Character, type Design } from '../world/rig/Character.ts';
import type { CreaturePose } from '../world/rig/Rig.ts';
import { terrainHeight } from '../world/spatial.ts';
import type { World } from '../world/World.ts';

/** Development-only: stage figures in front of the camera to judge models, shading and motion. */
export function inspector(world: World) {
  let figures: Character[] = [];
  let raf = 0;
  const all: Record<string, Design> = { ...DESIGNS, gnome: GNOME_DESIGNS.ember, moss: GNOME_DESIGNS.moss, hands: KINDLER_HANDS };
  const clear = () => { cancelAnimationFrame(raf); figures.forEach((f) => f.dispose()); figures = []; };
  const stage = () => {
    document.querySelectorAll<HTMLElement>('.g-screen').forEach((e) => { e.hidden = true; });
    document.body.className = 'is-cutscene';
    world.beginCinematic();
  };
  const run = (input: (f: Character, t: number) => { pose: CreaturePose; progress: number; velocity?: THREE.Vector3; attack?: string }) => {
    let last = performance.now();
    const start = last;
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const f of figures) {
        const i = input(f, (now - start) / 1000);
        f.update(dt, { pose: i.pose, progress: i.progress, attack: i.attack, velocity: i.velocity ?? new THREE.Vector3(), faceYaw: f.yaw, look: world.stage().camera.position, groundY: f.group.position.y });
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
  };
  return {
    /** Figures in a row, the camera framing them at `distance`. */
    show(kinds: string[], distance = 5, pose: CreaturePose = 'idle', attack = '') {
      clear(); stage();
      const cam = world.stage().camera;
      const z0 = 12;
      cam.position.set(0, terrainHeight(0, z0 + distance) + 1.6, z0 + distance);
      kinds.forEach((k, i) => {
        const f = new Character(all[k], 0.3 + i * 0.17);
        const x = (i - (kinds.length - 1) / 2) * Math.max(1.6, all[k].radius * 3.2);
        f.group.position.set(x, terrainHeight(x, z0), z0);
        f.setYaw(-x * 0.06);
        world.stage().scene.add(f.group);
        figures.push(f);
      });
      const tallest = Math.max(...kinds.map((k) => all[k].height));
      cam.lookAt(0, terrainHeight(0, z0) + tallest * 0.55, z0);
      cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      run((_f, t) => ({ pose, progress: pose === 'idle' ? 0 : (t % 3) / 3, attack }));
    },
    /** The caster's hands, raised, then opening. */
    hands() {
      clear(); stage();
      const cam = world.stage().camera;
      cam.position.set(0, terrainHeight(0, 16) + 1.7, 16); cam.lookAt(0, terrainHeight(0, 8) + 1.4, 8); cam.fov = 60; cam.updateProjectionMatrix();
      const f = new Character(KINDLER_HANDS, 0.4);
      cam.add(f.group); f.setYaw(Math.PI);
      figures.push(f);
      run((_f, t) => (t < 2 ? { pose: 'windup', progress: Math.min(1, t / 1.5) } : { pose: 'strike', progress: Math.min(1, (t - 2) / 1.5) }));
    },
    /** Turn every staged figure to a heading (radians; 0 faces the camera). */
    turn(yaw: number) { for (const f of figures) f.setYaw(yaw); },
    clear() { clear(); world.endCinematic(); },
  };
}
