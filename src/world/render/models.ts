import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * THE MODEL LIBRARY
 * ─────────────────
 * Assets authored by the art pipeline (art/, built in Blender) arrive as GLB files with their baked
 * textures, plus an `fx` map (sheen, translucency, subsurface) beside each. They are loaded once,
 * cached, and handed out by name; characters and scenery share the geometry and textures.
 */

export interface ModelData {
  name: string;
  gltf: GLTF;
  /** R sheen · G translucency · B subsurface. */
  fx: THREE.Texture | null;
}

const BASE = `${import.meta.env.BASE_URL ?? '/'}art/`;
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const pending = new Map<string, Promise<ModelData>>();
const ready = new Map<string, ModelData>();

export function loadModel(name: string): Promise<ModelData> {
  let p = pending.get(name);
  if (!p) {
    p = (async () => {
      const [gltf, fx] = await Promise.all([
        loader.loadAsync(`${BASE}${name}.glb`),
        textureLoader.loadAsync(`${BASE}${name}.fx.webp`).catch(() => null),
      ]);
      if (fx) { fx.flipY = false; fx.colorSpace = THREE.NoColorSpace; }
      const data = { name, gltf, fx };
      ready.set(name, data);
      return data;
    })();
    pending.set(name, p);
  }
  return p;
}

/** A model already loaded (throws if it was not preloaded). */
export function model(name: string): ModelData {
  const m = ready.get(name);
  if (!m) throw new Error(`model ${name} was not preloaded`);
  return m;
}

export function hasModel(name: string): boolean { return ready.has(name); }

export async function preloadModels(names: readonly string[], onProgress?: (fraction: number, name: string) => void): Promise<void> {
  let done = 0;
  await Promise.all(names.map(async (n) => {
    try { await loadModel(n); } catch (error) { console.warn(`[arcane] model ${n} failed to load`, error); }
    onProgress?.(++done / names.length, n);
  }));
}

/** The first mesh (skinned or not) in a model, with its standard material from the file. */
export function primaryMesh(data: ModelData): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  data.gltf.scene.traverse((o) => { if (!found && (o as THREE.Mesh).isMesh) found = o as THREE.Mesh; });
  if (!found) throw new Error(`model ${data.name} has no mesh`);
  return found;
}
