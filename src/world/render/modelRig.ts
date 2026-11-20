import * as THREE from 'three';
import { hasModel, model } from './models.ts';

/**
 * A skinned GLB from the art pipeline, re-rigged for the game's own animation.
 *
 * The game animates bodies by bone name with every bone's rest orientation identity (rotations are
 * applied in the parent's frame), which is how the procedural bodies were built. A Blender armature
 * carries its own bone rolls, so the runtime rebuilds the skeleton from the joints' rest positions
 * alone and remaps the skin weights to it by name. Every existing `animate()` then drives an authored
 * model exactly as it drove the procedural one.
 */
export interface ModelBody {
  geometry: THREE.BufferGeometry;
  root: THREE.Bone;
  names: string[];
  /** The file's own material (its baked maps) and the pipeline's fx map. */
  material: THREE.Material;
  fx: THREE.Texture | null;
}

const CACHE = new Map<string, ModelBody>();

export function canUseModel(name: string | undefined): name is string {
  return !!name && hasModel(name);
}

export function modelBody(name: string): ModelBody {
  const cached = CACHE.get(name);
  if (cached) return cached;
  const data = model(name);
  let skinned: THREE.SkinnedMesh | null = null;
  data.gltf.scene.traverse((o) => { if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
  if (!skinned) throw new Error(`model ${name} has no skinned mesh`);
  const mesh = skinned as THREE.SkinnedMesh;
  data.gltf.scene.updateMatrixWorld(true);
  const source = mesh.skeleton.bones;
  const world = new Map<string, THREE.Vector3>();
  for (const b of source) world.set(b.name, b.getWorldPosition(new THREE.Vector3()));
  const top = source.find((b) => !(b.parent as THREE.Bone | null)?.isBone) ?? source[0];
  const names: string[] = [];
  let root: THREE.Bone | null = null;
  const make = (b: THREE.Bone, parent: THREE.Bone | null) => {
    const nb = new THREE.Bone();
    nb.name = b.name;
    const w = world.get(b.name)!;
    if (parent) { nb.position.copy(w).sub(world.get(parent.name)!); parent.add(nb); } else { nb.position.copy(w); root = nb; }
    names.push(b.name);
    for (const child of b.children) if ((child as THREE.Bone).isBone) make(child as THREE.Bone, nb);
  };
  make(top, null);
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  // Remap joint indices from the file's skin to the rebuilt skeleton's order.
  const index = new Map(names.map((n, i) => [n, i]));
  const map = source.map((b) => index.get(b.name) ?? 0);
  const si = geometry.attributes.skinIndex as THREE.BufferAttribute;
  const remapped = new Uint16Array(si.count * 4);
  for (let i = 0; i < si.count; i++) {
    remapped[i * 4] = map[si.getX(i)];
    remapped[i * 4 + 1] = map[si.getY(i)];
    remapped[i * 4 + 2] = map[si.getZ(i)];
    remapped[i * 4 + 3] = map[si.getW(i)];
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(remapped, 4));
  geometry.computeBoundingSphere();
  const body: ModelBody = { geometry, root: root!, names, material: mesh.material as THREE.Material, fx: data.fx };
  CACHE.set(name, body);
  return body;
}
