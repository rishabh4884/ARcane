import * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';

const ICE = new THREE.Color('#c5f3ff');
const FROST_GROWTH = 0.85;
const FROST_HOLD = 2.7;
const FROST_THAW = 0.8;
const HIT_TIME = 0.38;

interface FrostUniforms {
  progress: { value: number };
  minY: { value: number };
  maxY: { value: number };
  iceColor: { value: THREE.Color };
  hitColor: { value: THREE.Color };
  hit: { value: number };
}

interface MaterialState {
  mesh: THREE.Mesh;
  original: THREE.Material | THREE.Material[];
  owned: THREE.Material[];
  colors: Array<{ material: THREE.Material; base: THREE.Color }>;
  standards: Array<{ material: THREE.MeshStandardMaterial; roughness: number }>;
  uniforms: FrostUniforms[];
}

interface Crystal {
  mesh: THREE.Mesh;
  delay: number;
  length: number;
}

/** Generic, model-independent hit and frost reactions for any Three.js enemy root. */
export class EnemyCombat {
  private readonly reactionRoot = new THREE.Group();
  private readonly originalParent: THREE.Object3D | null;
  private readonly originalPosition: THREE.Vector3;
  private readonly localBounds = new THREE.Box3();
  private readonly materials: MaterialState[] = [];
  private readonly crystalGroup = new THREE.Group();
  private readonly crystalGeometry: THREE.ConeGeometry;
  private readonly crystalMaterial: THREE.MeshStandardMaterial;
  private readonly crystals: Crystal[] = [];
  private readonly iceColor = ICE.clone();
  private frostAge: number | null = null;
  private frostLevel = 0;
  private hitAge = HIT_TIME;
  private hitSide = 1;
  private disposed = false;

  constructor(readonly root: THREE.Object3D) {
    this.originalParent = root.parent;
    if (this.originalParent) this.originalParent.add(this.reactionRoot);
    this.reactionRoot.add(root);
    this.reactionRoot.name = `${root.name || 'Enemy'} reactions`;
    this.originalPosition = this.reactionRoot.position.clone();
    root.updateWorldMatrix(true, true);
    const worldBounds = new THREE.Box3().setFromObject(root);
    if (!worldBounds.isEmpty()) {
      const inverse = root.matrixWorld.clone().invert();
      for (let i = 0; i < 8; i++) {
        const corner = new THREE.Vector3(
          i & 1 ? worldBounds.max.x : worldBounds.min.x,
          i & 2 ? worldBounds.max.y : worldBounds.min.y,
          i & 4 ? worldBounds.max.z : worldBounds.min.z,
        ).applyMatrix4(inverse);
        this.localBounds.expandByPoint(corner);
      }
    } else {
      this.localBounds.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
    }

    this.installMaterials();
    this.crystalGeometry = new THREE.ConeGeometry(0.5, 1, 5);
    this.crystalGeometry.translate(0, 0.5, 0);
    this.crystalMaterial = new THREE.MeshStandardMaterial({
      color: ICE,
      emissive: '#63c8ff',
      emissiveIntensity: 0.28,
      roughness: 0.24,
      metalness: 0.08,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    this.buildCrystals();
    root.add(this.crystalGroup);
  }

  get frostAmount(): number { return this.frostLevel; }
  get frozen(): boolean { return this.frostAge !== null && this.frostLevel > 0.95; }

  /** Approximate broad-phase targeting; caller should choose the nearest hit. */
  intersectRay(ray: THREE.Ray, point: THREE.Vector3): number | null {
    this.root.updateWorldMatrix(true, true);
    const hit = ray.intersectBox(new THREE.Box3().setFromObject(this.root), point);
    return hit ? hit.distanceTo(ray.origin) : null;
  }

  /** Returns false for defensive spells, which should not hurt or stagger the target. */
  impact(effect: SpellEffect, point: THREE.Vector3, color: THREE.Color): boolean {
    if (this.disposed) return false;
    if (effect === 'healing' || effect === 'shield') return false;
    if (effect === 'frost') {
      this.iceColor.copy(color).lerp(ICE, 0.72);
      this.frostAge = this.frostAge === null ? 0 : Math.min(this.frostAge, FROST_GROWTH);
    }

    this.root.updateWorldMatrix(true, false);
    const localPoint = this.root.worldToLocal(point.clone());
    const centerX = (this.localBounds.min.x + this.localBounds.max.x) * 0.5;
    this.hitSide = localPoint.x < centerX ? 1 : -1;
    this.hitAge = 0;
    for (const state of this.materials) {
      for (const uniforms of state.uniforms) uniforms.hitColor.value.copy(color);
    }
    return true;
  }

  update(dt: number): void {
    if (this.disposed) return;
    if (this.frostAge !== null) {
      this.frostAge += dt;
      if (this.frostAge < FROST_GROWTH) {
        this.frostLevel = smooth(this.frostAge / FROST_GROWTH);
      } else if (this.frostAge < FROST_GROWTH + FROST_HOLD) {
        this.frostLevel = 1;
      } else if (this.frostAge < FROST_GROWTH + FROST_HOLD + FROST_THAW) {
        this.frostLevel = 1 - smooth((this.frostAge - FROST_GROWTH - FROST_HOLD) / FROST_THAW);
      } else {
        this.frostAge = null;
        this.frostLevel = 0;
      }
    }

    this.hitAge = Math.min(HIT_TIME, this.hitAge + dt);
    const hitT = this.hitAge / HIT_TIME;
    const recoil = hitT < 1 ? Math.sin(hitT * Math.PI) * Math.exp(-1.8 * hitT) * (1 - this.frostLevel) : 0;
    const width = Math.max(this.localBounds.max.x - this.localBounds.min.x, 0.1);
    const height = Math.max(this.localBounds.max.y - this.localBounds.min.y, 0.1);
    this.reactionRoot.position.copy(this.originalPosition);
    this.reactionRoot.position.x += this.hitSide * width * 0.024 * recoil;
    this.reactionRoot.position.y += height * 0.008 * recoil;

    this.root.updateWorldMatrix(true, true);
    const worldBounds = this.localBounds.clone().applyMatrix4(this.root.matrixWorld);
    const impactStrength = this.hitAge < HIT_TIME ? Math.exp(-this.hitAge * 12) : 0;
    for (const state of this.materials) {
      for (const uniforms of state.uniforms) {
        uniforms.progress.value = this.frostLevel;
        uniforms.minY.value = worldBounds.min.y;
        uniforms.maxY.value = Math.max(worldBounds.max.y, worldBounds.min.y + 0.001);
        uniforms.iceColor.value.copy(this.iceColor);
        uniforms.hit.value = impactStrength;
      }
      for (const { material, base } of state.colors) {
        const color = materialColor(material);
        if (color) color.copy(base).lerp(this.iceColor, this.frostLevel * 0.72);
        const hit = materialColor(material);
        if (hit && impactStrength > 0 && !(material instanceof THREE.MeshStandardMaterial)) {
          hit.lerp(new THREE.Color('#ffffff'), impactStrength * 0.48);
        }
      }
      for (const { material, roughness } of state.standards) {
        material.roughness = THREE.MathUtils.lerp(roughness, 0.24, this.frostLevel);
      }
    }

    for (const [index, crystal] of this.crystals.entries()) {
      const grow = smooth((this.frostLevel - crystal.delay) / 0.42);
      crystal.mesh.scale.y = crystal.length * grow;
      (crystal.mesh.material as THREE.MeshStandardMaterial).opacity = 0.82 * this.frostLevel;
      crystal.mesh.visible = this.frostLevel > 0.01;
      if (index % 2 === 0) crystal.mesh.rotation.z = Math.sin(this.frostAge ?? 0) * 0.025;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.crystalGroup.removeFromParent();
    this.crystalGeometry.dispose();
    this.crystalMaterial.dispose();
    this.reactionRoot.remove(this.root);
    this.originalParent?.add(this.root);
    this.reactionRoot.removeFromParent();
    for (const state of this.materials) {
      state.mesh.material = state.original;
      for (const material of state.owned) material.dispose();
    }
    this.materials.length = 0;
  }

  private installMaterials(): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const original = object.material;
      const sources = Array.isArray(original) ? original : [original];
      const owned = sources.map((source) => {
        const clone = source.clone();
        // Material.clone() intentionally drops compile hooks. Preserve the character's
        // rim/animation hooks before composing frost on the per-instance material.
        clone.onBeforeCompile = source.onBeforeCompile;
        clone.customProgramCacheKey = source.customProgramCacheKey;
        return clone;
      });
      object.material = Array.isArray(original) ? owned : owned[0];
      const state: MaterialState = { mesh: object, original, owned, colors: [], standards: [], uniforms: [] };
      for (const material of owned) {
        const color = materialColor(material);
        if (color) state.colors.push({ material, base: color.clone() });
        if (material instanceof THREE.MeshStandardMaterial) {
          state.standards.push({ material, roughness: material.roughness });
          this.patchFrostShader(material, state);
        }
      }
      this.materials.push(state);
    });
  }

  private patchFrostShader(material: THREE.MeshStandardMaterial, state: MaterialState): void {
    const uniforms: FrostUniforms = {
      progress: { value: 0 },
      minY: { value: this.localBounds.min.y },
      maxY: { value: Math.max(this.localBounds.max.y, this.localBounds.min.y + 0.001) },
      iceColor: { value: this.iceColor.clone() },
      hitColor: { value: new THREE.Color('#ffffff') },
      hit: { value: 0 },
    };
    state.uniforms.push(uniforms);
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      shader.uniforms.arcaneFrostProgress = uniforms.progress;
      shader.uniforms.arcaneFrostMinY = uniforms.minY;
      shader.uniforms.arcaneFrostMaxY = uniforms.maxY;
      shader.uniforms.arcaneIceColor = uniforms.iceColor;
      shader.uniforms.arcaneHitColor = uniforms.hitColor;
      shader.uniforms.arcaneImpactFlash = uniforms.hit;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nvarying float vArcaneWorldY;',
      ).replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvArcaneWorldY = (modelMatrix * vec4(transformed, 1.0)).y;',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        varying float vArcaneWorldY;
        uniform float arcaneFrostProgress;
        uniform float arcaneFrostMinY;
        uniform float arcaneFrostMaxY;
        uniform vec3 arcaneIceColor;
        uniform vec3 arcaneHitColor;
        uniform float arcaneImpactFlash;`,
      ).replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float arcaneHeight = clamp((vArcaneWorldY - arcaneFrostMinY) / max(arcaneFrostMaxY - arcaneFrostMinY, 0.001), 0.0, 1.0);
        float arcaneFront = arcaneFrostProgress * 1.14 - 0.02;
        float arcaneCoverage = smoothstep(0.0, 0.12, arcaneFront - arcaneHeight);
        float arcaneEdge = (1.0 - smoothstep(0.0, 0.055, abs(arcaneFront - arcaneHeight))) * step(0.01, arcaneFrostProgress);
        diffuseColor.rgb = mix(diffuseColor.rgb, arcaneIceColor, arcaneCoverage * 0.78);
        diffuseColor.rgb += arcaneIceColor * arcaneEdge * 0.42;
        diffuseColor.rgb = mix(diffuseColor.rgb, arcaneHitColor, arcaneImpactFlash * 0.58);`,
      );
    };
    material.customProgramCacheKey = () => `${previousKey()}|arcane-enemy-reaction-v1`;
    material.needsUpdate = true;
  }

  private buildCrystals(): void {
    const width = this.localBounds.max.x - this.localBounds.min.x;
    const depth = this.localBounds.max.z - this.localBounds.min.z;
    const height = this.localBounds.max.y - this.localBounds.min.y;
    if (!(width > 0 && depth > 0 && height > 0)) return;
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.399963229728653;
      const yFraction = 0.12 + ((i * 5) % 7) * 0.105;
      const radius = 0.5 + (i % 3) * 0.12;
      const length = height * (0.07 + (i % 3) * 0.025);
      const mesh = new THREE.Mesh(this.crystalGeometry, this.crystalMaterial);
      mesh.position.set(
        (this.localBounds.min.x + this.localBounds.max.x) * 0.5 + Math.cos(angle) * width * 0.34,
        this.localBounds.min.y + height * yFraction,
        (this.localBounds.min.z + this.localBounds.max.z) * 0.5 + Math.sin(angle) * depth * 0.34,
      );
      mesh.scale.set(width * 0.035 * radius, 0.001, depth * 0.035 * radius);
      mesh.rotation.z = (i % 2 ? 1 : -1) * 0.12;
      mesh.visible = false;
      this.crystalGroup.add(mesh);
      this.crystals.push({ mesh, delay: (i % 4) * 0.1, length });
    }
  }
}

function materialColor(material: THREE.Material): THREE.Color | undefined {
  const color = (material as THREE.Material & { color?: THREE.Color }).color;
  return color instanceof THREE.Color ? color : undefined;
}

function smooth(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
