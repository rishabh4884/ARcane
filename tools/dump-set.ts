/**
 * Write the Hushed Edge's layout for the painted-set pipeline: the game camera, the moon, the ground
 * (heights and painted colours on its grid), and every tree and stone, exactly as the game places them.
 *
 *   npx vite-node tools/dump-set.ts
 */
import { writeFileSync } from 'node:fs';
import { MOON_DIRECTION } from '../src/world/Atmosphere.ts';
import { lanternSites } from '../src/world/LanternGrove.ts';
import { SCRIPTS } from '../src/cutscene/scripts.ts';
import { planShots } from '../src/world/paintedShots.ts';
import { EYE_HEIGHT, SPAWN, forestLayout, pathX, terrainHeight } from '../src/world/spatial.ts';
import { GROUND, gateSite, groundData, rockPlacements, treePlacements } from '../src/world/woodlandLayout.ts';

const sites = forestLayout();
const ground = groundData(sites);
const r = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const heights: number[] = [];
const colors: number[] = [];
for (let k = 0; k < ground.positions.length / 3; k++) {
  heights.push(r(ground.positions[k * 3 + 1]));
  colors.push(r(ground.colors[k * 3]), r(ground.colors[k * 3 + 1]), r(ground.colors[k * 3 + 2]));
}
const eye: [number, number, number] = [SPAWN.x, r(terrainHeight(SPAWN.x, SPAWN.z) + EYE_HEIGHT), SPAWN.z];
const layout = {
  camera: { position: eye, lookAt: [0, 1.2, -12], fov: 64 },
  // Cutscene shots the gameplay painting cannot hold get paintings of their own.
  shots: planShots(Object.values(SCRIPTS), { name: 'edge', position: eye, lookAt: [0, 1.2, -12], fov: 64 * 1.06, aspect: 2 }),
  moon: [r(MOON_DIRECTION.x), r(MOON_DIRECTION.y), r(MOON_DIRECTION.z)],
  ground: { size: GROUND.size, seg: GROUND.seg, heights, colors },
  trees: treePlacements(sites).map((t) => ({ ...t, x: r(t.x), y: r(t.y), z: r(t.z), scale: r(t.scale), yaw: r(t.yaw) })),
  rocks: rockPlacements(sites).map((s) => ({ x: r(s.x), y: r(s.y), z: r(s.z), scale: s.scale.map((v) => r(v)), rotation: s.rotation.map((v) => r(v)) })),
  lanterns: lanternSites().map((l) => ({ ...l, x: r(l.x), y: r(terrainHeight(l.x, l.z)), z: r(l.z) })),
  // The forgotten gate over the path's far bend, and the pool.
  gate: (({ x, y, z, yaw }) => ({ x: r(x), y: r(y), z, yaw: r(yaw) }))(gateSite()),
  pool: { x: 25, y: r(terrainHeight(25, -15) + 0.04), z: -15, rx: 7.6, rz: 4.56 },
  path: Array.from({ length: 61 }, (_, i) => { const z = 20 - i * 2; return [r(pathX(z)), z]; }),
};
writeFileSync('art/sets/edge_layout.json', JSON.stringify(layout));
console.log(`edge layout: ${layout.trees.length} trees, ${layout.rocks.length} rocks, ${layout.lanterns.length} lanterns, ${layout.shots.length} cutscene shots, ${heights.length} ground points`);
