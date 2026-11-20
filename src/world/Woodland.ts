import * as THREE from 'three';
import { hasModel, model } from './render/models.ts';
import { propMaterial, stylizedLights } from './render/StylizedMaterial.ts';
import { forestLayout, type Obstacle, type TreeSite } from './spatial.ts';
import { groundData, rockPlacements, TREE_KINDS, treePlacements, type TreePlacement } from './woodlandLayout.ts';

/**
 * THE WOODLAND
 * ────────────
 * The wood as authored 3D: a ground that is one continuous landscape (worn path, trampled clearing,
 * leaf litter under the trees, moss at their roots, dark humus at the edges) lit and shadowed like
 * everything else, and the art pipeline's trees and stones standing where the wood's layout has always
 * put them — the same gaps, lanes and obstacles the game plays around. Near trees are drawn whole,
 * the far ring at a lighter level of detail with the same textures.
 */

export const WOODLAND_MODELS = ['oak_edge_a', 'oak_edge_b', 'birch_edge_a', 'snag_edge_a', 'rock_edge_a'];


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
    this.placeTrees();
    if (hasModel('rock_edge_a')) this.placeRocks();
  }

  private makeGround(): THREE.Mesh {
    const data = groundData(this.sites);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
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
          float lf = leaves(gp * 6.5) * clump;
          vec3 leafCol = mix(vec3(0.3, 0.16, 0.07), vec3(0.38, 0.27, 0.12), gh(floor(gp * 6.5)));
          diffuseColor.rgb = mix(diffuseColor.rgb, leafCol, lf * 0.55);
          float twig = 1.0 - smoothstep(0.0, 0.03, abs(gn(gp * vec2(9.0, 1.3)) - 0.5));
          diffuseColor.rgb *= 1.0 - twig * 0.25 * clump;`);
    };
    m.customProgramCacheKey = () => 'woodland-ground-v1';
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.name = 'Ground';
    return mesh;
  }

  /**
   * The wood's species where the layout puts trees: oaks hold the clearing, birches stand pale in
   * groups along the edge where the moon finds them, a few dead snags tell what the dark has done.
   * Each species and level of detail is split into sectors around the clearing so what is behind the
   * eye is culled; only the nearest trees cast the moon's shadows.
   */
  private placeTrees(): void {
    const species = TREE_KINDS.filter(hasModel);
    if (!species.length) return;
    type Lod = 0 | 1 | 2;
    const buckets = new Map<string, TreePlacement[]>();
    for (const t of treePlacements(this.sites, hasModel)) {
      const key = `${t.kind}|${t.lod}|${t.sector}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(t);
    }
    const materials = new Map<string, THREE.Material>();
    const dummy = new THREE.Object3D();
    for (const [key, items] of buckets) {
      const [kind, lodS] = key.split('|');
      const lod = Number(lodS) as Lod;
      const data = model(kind);
      const meshes: THREE.Mesh[] = [];
      data.gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      const named = (suffix: string) => meshes.find((m) => m.name.endsWith(suffix));
      const full = meshes.find((m) => !m.name.includes('lod')) ?? meshes[0];
      const geometry = (lod === 0 ? full : lod === 1 ? named('lod1') ?? full : named('lod2') ?? named('lod1') ?? full).geometry;
      let material = materials.get(kind);
      if (!material) { material = propMaterial(full.material as THREE.Material, data.fx); materials.set(kind, material); }
      const inst = new THREE.InstancedMesh(geometry, material, items.length);
      items.forEach(({ x, y, z, scale, yaw }, i) => {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.computeBoundingSphere();
      inst.frustumCulled = true;
      inst.castShadow = lod === 0;
      inst.receiveShadow = lod < 2;
      inst.name = key;
      this.group.add(inst);
      this.owned.push(inst);
    }
  }

  private placeRocks(): void {
    const data = model('rock_edge_a');
    let mesh: THREE.Mesh | null = null;
    data.gltf.scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    if (!mesh) return;
    const m = mesh as THREE.Mesh;
    const material = propMaterial(m.material as THREE.Material, data.fx);
    const spots = rockPlacements(this.sites);
    const inst = new THREE.InstancedMesh(m.geometry, material, spots.length);
    const dummy = new THREE.Object3D();
    spots.forEach((r, i) => {
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.set(...r.rotation);
      dummy.scale.set(...r.scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    });
    inst.computeBoundingSphere();
    inst.castShadow = true; inst.receiveShadow = true; inst.frustumCulled = true;
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
