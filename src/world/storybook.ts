import * as THREE from 'three';

/** Soft, broad colour masses; no albedo maps, brush patterns, grain or hard toon bands. */
export function storyMaterial(color: THREE.ColorRepresentation, parameters: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...parameters });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      float paintedLight = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
      float warmLight = smoothstep(0.08, 0.95, paintedLight);
      vec3 lightTint = mix(vec3(0.66, 0.83, 0.94), vec3(1.09, 1.035, 0.86), warmLight);
      outgoingLight *= lightTint;
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'storybook-soft-light-v1';
  return material;
}

/** Tapered swept forms: silhouettes are modelled, not painted onto straight cylinders. */
export function sweptShape(points: readonly THREE.Vector3[], radii: readonly number[], radial = 10, steps = 18): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([...points]);
  const frames = curve.computeFrenetFrames(steps, false);
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, center = curve.getPointAt(t);
    const ri = t * (radii.length - 1), index = Math.min(radii.length - 2, Math.floor(ri));
    const r = THREE.MathUtils.lerp(radii[index], radii[index + 1], ri - index);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2;
      const irregular = 1 + Math.sin(a * 3 + t * 2) * 0.045;
      const p = center.clone().addScaledVector(frames.normals[i], Math.cos(a) * r * irregular).addScaledVector(frames.binormals[i], Math.sin(a) * r * irregular);
      vertices.push(p.x, p.y, p.z); uv.push(j / radial, t);
      if (i < steps && j < radial) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        indices.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export function vectors(points: readonly (readonly number[])[]): THREE.Vector3[] {
  return points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
}

/** Explicit resource ownership for shared meshes; dispose each GPU object once. */
export class ArtResources {
  readonly geometries = new Set<THREE.BufferGeometry>();
  readonly materials = new Set<THREE.Material>();
  private disposed = false;
  geometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  material<T extends THREE.Material>(material: T): T { this.materials.add(material); return material; }
  paint(color: THREE.ColorRepresentation, parameters: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    return this.material(storyMaterial(color, parameters));
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }
}
