import * as THREE from 'three';
import { hasModel, model } from './render/models.ts';
import { propMaterial, stylizedLights } from './render/StylizedMaterial.ts';
import { forestLayout, pathX, seededRandom, terrainHeight, type Obstacle, type TreeSite } from './spatial.ts';

/**
 * THE WOODLAND
 * ────────────
 * The wood as authored 3D: a ground that is one continuous landscape (worn path, trampled clearing,
 * leaf litter under the trees, moss at their roots, dark humus at the edges) lit and shadowed like
 * everything else, and the art pipeline's trees and stones standing where the wood's layout has always
 * put them — the same gaps, lanes and obstacles the game plays around. Near trees are drawn whole,
 * the far ring at a lighter level of detail with the same textures.
 */

export const WOODLAND_MODELS = ['oak_edge_a', 'rock_edge_a'];

const NEAR = 46;

export class Woodland {
  readonly group = new THREE.Group();
  readonly ground: THREE.Mesh;
  private readonly sites: TreeSite[];
  private populated = false;
  private readonly owned: Array<THREE.InstancedMesh | THREE.Mesh> = [];

  constructor(obstacles: Obstacle[]) {
    this.group.name = 'Woodland (authored)';
    this.sites = forestLayout();
    for (const t of this.sites) obstacles.push({ ...t, radius: t.scale * 0.66, height: t.scale * 12 });
    this.ground = this.makeGround();
    this.group.add(this.ground);
  }

  /** Stand the authored assets in the wood once their models are loaded. */
  populate(): void {
    if (this.populated) return;
    this.populated = true;
    if (hasModel('oak_edge_a')) this.placeTrees();
    if (hasModel('rock_edge_a')) this.placeRocks();
  }

  private makeGround(): THREE.Mesh {
    const size = 220, seg = 220;
    const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(p.count * 3);
    const humus = new THREE.Color('#1c2219'), litter = new THREE.Color('#4a3c2a'), soil = new THREE.Color('#5c4d3a');
    const moss = new THREE.Color('#2f3f22'), trampled = new THREE.Color('#463b2c'), grassy = new THREE.Color('#2c3a24');
    const c = new THREE.Color();
    const rnd = seededRandom(771);
    const roots = this.sites.map((s) => [s.x, s.z, s.scale] as const);
    const noise = (x: number, z: number, f: number) => Math.sin(x * f + Math.sin(z * f * 0.7) * 1.3) * 0.5 + Math.sin(z * f * 1.3 + Math.sin(x * f * 0.6 + 2.0)) * 0.5;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      // A little relief beyond the gameplay terrain: roots and hummocks near trees, never in the lanes.
      let near = 99;
      for (const [tx, tz, s] of roots) { const d = Math.hypot(x - tx, z - tz) / (s * 2.2); if (d < near) near = d; }
      const bump = Math.max(0, 1 - near) * 0.35 * (0.6 + 0.4 * noise(x, z, 1.9));
      p.setY(i, terrainHeight(x, z) + bump);
      // Paint with intent: worn path, the trampled clearing, litter under the canopy, moss at roots,
      // grassy patches in the open, dark humus where the wood closes in.
      const path = 1 - THREE.MathUtils.smoothstep(Math.abs(x - pathX(z)), 0.9, 2.6);
      const clearing = 1 - THREE.MathUtils.smoothstep(Math.hypot(x, z + 12), 8, 17);
      const edge = THREE.MathUtils.smoothstep(Math.hypot(x, z + 8), 22, 48);
      const patch = noise(x, z, 0.21) * 0.5 + 0.5;
      c.copy(grassy).lerp(litter, THREE.MathUtils.smoothstep(0.35, 0.75, patch));
      c.lerp(humus, edge * 0.8);
      c.lerp(moss, Math.max(0, 1 - near * 0.9) * 0.85);
      c.lerp(trampled, clearing * 0.7);
      c.lerp(soil, path * 0.75);
      const v = 0.85 + rnd() * 0.15;
      c.toArray(col, i * 3);
      col[i * 3] *= v; col[i * 3 + 1] *= v; col[i * 3 + 2] *= v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          vec3 stylFx = vec3(0.12, 0.0, 0.0);
          varying vec3 vGround;
          float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }
          float gfbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += gn(p) * a; p = p * 2.07 + vec2(1.7, 9.2); a *= 0.5; } return v; }
          // Fallen leaves: scattered soft ovals, warm, in clusters.
          float leaves(vec2 p){ vec2 c = floor(p), f = fract(p); float best = 0.0;
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 o = vec2(float(x), float(y));
              vec2 r = o + vec2(gh(c + o), gh(c + o + 7.0)) - f; float a = gh(c + o + 3.0) * 6.28;
              vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * r; float d = length(q * vec2(1.0, 2.2));
              best = max(best, (1.0 - smoothstep(0.18, 0.26, d)) * step(0.55, gh(c + o + 11.0))); }
            return best; }`)
        .replace('#include <lights_physical_pars_fragment>', stylizedLights())
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 gp = vGround.xz;
          float grain = gfbm(gp * 3.1);
          diffuseColor.rgb *= 0.82 + 0.36 * grain;
          float clump = smoothstep(0.42, 0.7, gfbm(gp * 0.37 + 4.0));
          float lf = leaves(gp * 2.4) * clump;
          vec3 leafCol = mix(vec3(0.33, 0.17, 0.07), vec3(0.42, 0.29, 0.12), gh(floor(gp * 2.4)));
          diffuseColor.rgb = mix(diffuseColor.rgb, leafCol, lf * 0.75);
          float twig = 1.0 - smoothstep(0.0, 0.03, abs(gn(gp * vec2(9.0, 1.3)) - 0.5));
          diffuseColor.rgb *= 1.0 - twig * 0.25 * clump;`);
    };
    m.customProgramCacheKey = () => 'woodland-ground-v1';
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.name = 'Ground';
    return mesh;
  }

  private placeTrees(): void {
    const data = model('oak_edge_a');
    const meshes: Record<string, THREE.Mesh> = {};
    data.gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes[o.name] = o as THREE.Mesh; });
    const full = Object.values(meshes).find((m) => !m.name.includes('lod'))!;
    const lod = Object.values(meshes).find((m) => m.name.includes('lod')) ?? full;
    const material = propMaterial(full.material as THREE.Material, data.fx);
    const rnd = seededRandom(4471);
    const near = this.sites.filter((s) => Math.hypot(s.x, s.z) < NEAR);
    const far = this.sites.filter((s) => Math.hypot(s.x, s.z) >= NEAR);
    const dummy = new THREE.Object3D();
    const place = (sites: TreeSite[], geometry: THREE.BufferGeometry, shadows: boolean) => {
      const inst = new THREE.InstancedMesh(geometry, material, sites.length);
      sites.forEach((s, i) => {
        const scale = 0.75 + s.scale * 0.35;
        dummy.position.set(s.x, terrainHeight(s.x, s.z) - 0.05, s.z);
        dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.castShadow = shadows; inst.receiveShadow = true;
      inst.frustumCulled = false;
      this.group.add(inst);
      this.owned.push(inst);
    };
    place(near, full.geometry, true);
    place(far, lod.geometry, false);
  }

  private placeRocks(): void {
    const data = model('rock_edge_a');
    let mesh: THREE.Mesh | null = null;
    data.gltf.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    if (!mesh) return;
    const m = mesh as THREE.Mesh;
    const material = propMaterial(m.material as THREE.Material, data.fx);
    const rnd = seededRandom(9932);
    const spots: Array<[number, number, number]> = [];
    // Stones gather: a few clusters near trees and at the clearing's edge, none in the lanes.
    for (let i = 0; i < 400 && spots.length < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 12 + rnd() * 50;
      const x = Math.sin(a) * r, z = Math.cos(a) * r - 10;
      if (Math.abs(x - pathX(z)) < 4 || Math.hypot(x, z + 12) < 11 || Math.hypot(x, z - 17) < 7) continue;
      if (this.sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.scale * 1.6)) continue;
      const cluster = rnd() < 0.6 ? 1 + Math.floor(rnd() * 3) : 1;
      for (let k = 0; k < cluster; k++) spots.push([x + (rnd() - 0.5) * 2.4, z + (rnd() - 0.5) * 2.4, 0.5 + rnd() * (k ? 0.5 : 1.1)]);
    }
    const inst = new THREE.InstancedMesh(m.geometry, material, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach(([x, z, s], i) => {
      dummy.position.set(x, terrainHeight(x, z) - 0.12 * s, z);
      dummy.rotation.set((rnd() - 0.5) * 0.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.2);
      dummy.scale.set(s, s * (0.8 + rnd() * 0.4), s);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = false;
    this.group.add(inst);
    this.owned.push(inst);
  }

  dispose(): void {
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    for (const m of this.owned) (m.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
