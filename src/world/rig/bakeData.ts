import * as THREE from 'three';

/** A baked body (shared geometry, a template skeleton, the bone order) as returned by Body.bake. */
export interface Baked { geometry: THREE.BufferGeometry; root: THREE.Bone; names: string[] }

type Typed = Float32Array | Uint16Array | Uint32Array | Int32Array | Uint8Array;
/** The same, as plain data and typed arrays: posted from a worker, kept in IndexedDB. */
export interface BakedData {
  attributes: Array<{ name: string; array: Typed; itemSize: number; normalized: boolean }>;
  index: Typed | null;
  bones: Array<{ name: string; parent: string | null; p: number[]; q: number[]; s: number[] }>;
  names: string[];
}

export function serializeBaked(b: Baked): BakedData {
  const attributes = Object.entries(b.geometry.attributes).map(([name, a]) => {
    const attr = a as THREE.BufferAttribute;
    return { name, array: attr.array as Typed, itemSize: attr.itemSize, normalized: attr.normalized };
  });
  const bones: BakedData['bones'] = [];
  b.root.traverse((o) => {
    if (!(o instanceof THREE.Bone)) return;
    bones.push({ name: o.name, parent: o.parent instanceof THREE.Bone ? o.parent.name : null, p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray() });
  });
  return { attributes, index: (b.geometry.getIndex()?.array as Typed) ?? null, bones, names: b.names };
}

export function deserializeBaked(d: BakedData): Baked {
  const geometry = new THREE.BufferGeometry();
  for (const a of d.attributes) geometry.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.itemSize, a.normalized));
  if (d.index) geometry.setIndex(new THREE.BufferAttribute(d.index, 1));
  geometry.computeBoundingSphere();
  const byName = new Map<string, THREE.Bone>();
  let root: THREE.Bone | null = null;
  for (const b of d.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.fromArray(b.p); bone.quaternion.fromArray(b.q); bone.scale.fromArray(b.s);
    byName.set(b.name, bone);
    if (b.parent) byName.get(b.parent)!.add(bone); else root = bone;
  }
  return { geometry, root: root!, names: d.names };
}

/** The buffers to transfer (not copy) when posting from a worker. */
export function transferables(d: BakedData): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  for (const a of d.attributes) out.add(a.array.buffer as ArrayBuffer);
  if (d.index) out.add(d.index.buffer as ArrayBuffer);
  return [...out];
}
