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
    /** Close-up: aim the camera at height `y` on the staged figures from `distance`, with a narrow lens. */
    focus(y: number, distance = 3, fov = 30, side = 0) {
      const cam = world.stage().camera;
      const z0 = 12, g = terrainHeight(0, z0);
      cam.position.set(side, g + y + distance * 0.08, z0 + distance);
      cam.lookAt(0, g + y, z0);
      cam.fov = fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    },
    /**
     * The casting spot's own view of the wood (the view a painted set is painted from), with figures
     * standing at distance `at` metres up the path, walking toward the eye if `walk`.
     */
    spot(kinds: string[] = [], at = 14, walk = false) {
      clear(); stage();
      const cam = world.stage().camera;
      cam.position.set(0, terrainHeight(0, 17) + 1.85, 17); cam.lookAt(0, 1.2, -12); cam.fov = 64; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
      kinds.forEach((k, i) => {
        const f = new Character(all[k], 0.3 + i * 0.17);
        const z = 17 - at - i * 1.5, x = (i - (kinds.length - 1) / 2) * 2.2;
        f.group.position.set(x, terrainHeight(x, z), z);
        world.stage().scene.add(f.group);
        figures.push(f);
      });
      run((f) => {
        if (walk) { f.group.position.z += 0.016; f.group.position.y = terrainHeight(f.group.position.x, f.group.position.z); }
        return walk ? { pose: 'walk' as CreaturePose, progress: 0, velocity: new THREE.Vector3(0, 0, 1) } : { pose: 'idle' as CreaturePose, progress: 0 };
      });
    },
    /** Turn every staged figure to a heading (radians; 0 faces the camera). */
    turn(yaw: number) { for (const f of figures) f.setYaw(yaw); },
    clear() { clear(); world.endCinematic(); },
  };
}
