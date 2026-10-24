import * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';
import { CharacterAnimator } from './CharacterAnimator.ts';
import { makeGlowTexture } from './textures.ts';

const EMBER_COUNT = 90;
const EMBER_REACH = 5.4;
const MODEL_LIFT = 0.025;

interface BossShaderState {
  time: { value: number };
  breath: { value: number };
  hit: { value: number };
  hitSide: { value: number };
  frozen: { value: number };
}

/**
 * The supplied Balrog stands on a summoning plinth in the twilight field.
 * Uses imported skeletal clips when available, with procedural motion only as a
 * fallback for static models. Every spell briefly illuminates its hide.
 */
export class Boss {
  readonly group = new THREE.Group();
  private readonly figure = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly animator: CharacterAnimator;
  private readonly shaderStates: BossShaderState[] = [];
  private readonly stageBounds: THREE.Box3;
  private readonly pulseColor = new THREE.Color();
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly glowTexture: THREE.Texture;
  private readonly glowBase = new THREE.Color('#ff6a2e');
  private readonly embers: THREE.Points;
  private readonly emberPositions = new Float32Array(EMBER_COUNT * 3);
  private readonly emberSeeds = new Float32Array(EMBER_COUNT * 4);
  private time = 0;
  private pulse = 0;
  private frost = 0;
  private reactionAge = Number.POSITIVE_INFINITY;
  private reactionDuration = 0.6;
  private reactionStrength = 0;
  private reactionPitch = 0.7;
  private reactionSide = 1;
  private disposed = false;

  constructor(model: THREE.Object3D, glowTexture?: THREE.Texture, clips: readonly THREE.AnimationClip[] = []) {
    this.model = model;
    this.animator = new CharacterAnimator(model, clips);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    if (![size.x, size.y, size.z].every(Number.isFinite) || size.x <= 0 || size.y <= 0) {
      throw new Error('The boss model has no usable bounds.');
    }
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
    model.position.y += MODEL_LIFT;
    this.figure.add(model);
    this.group.add(this.figure);
    this.group.name = 'Balrog stage';

    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const source = object.material;
      // A single material must stay single: an array without geometry groups draws nothing.
      const prepare = (material: THREE.Material) => {
        const next = material instanceof THREE.MeshStandardMaterial
          ? material.clone()
          : new THREE.MeshStandardMaterial({ color: '#4c3433', roughness: 0.8 });
        next.userData.arcaneBaseEmission = next.emissive.toArray();
        next.userData.arcaneBaseIntensity = next.emissive.getHex() === 0 ? 0 : next.emissiveIntensity;
        // A restrained ember rim keeps the dark sculpt legible against the night.
        next.onBeforeCompile = (shader) => {
          const time = { value: this.time };
          const state: BossShaderState = {
            time,
            breath: { value: 1 },
            hit: { value: 0 },
            hitSide: { value: 1 },
            frozen: { value: 0 },
          };
          this.shaderStates.push(state);
          shader.uniforms.arcaneWingTime = time;
          shader.uniforms.arcaneBreath = state.breath;
          shader.uniforms.arcaneHit = state.hit;
          shader.uniforms.arcaneHitSide = state.hitSide;
          shader.uniforms.arcaneFrozen = state.frozen;
          if (!this.animator.available) shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            uniform float arcaneWingTime;
            uniform float arcaneBreath;
            uniform float arcaneHit;
            uniform float arcaneHitSide;
            uniform float arcaneFrozen;`,
          );
          if (!this.animator.available) shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float arcaneWingWeight = smoothstep(2.5, 5.7, abs(position.x));
            float arcaneWingPhase = arcaneWingTime * 1.1 + abs(position.x) * 0.38;
            float arcaneWingBeat = sin(arcaneWingPhase) * arcaneWingWeight * arcaneBreath * 0.17;
            float arcaneWingFlinch = arcaneHit * arcaneWingWeight * sign(position.x) * arcaneHitSide * 0.42;
            float arcaneWingTuck = arcaneFrozen * arcaneWingWeight * 0.18;
            float arcaneChest = (1.0 - smoothstep(0.45, 1.8, abs(position.x)))
              * smoothstep(0.85, 1.45, position.y) * (1.0 - smoothstep(4.1, 5.15, position.y));
            float arcaneBreathing = sin(arcaneWingTime * 1.25 + position.y * 0.5) * arcaneChest * arcaneBreath;
            transformed.y += arcaneWingBeat + arcaneWingFlinch - arcaneWingTuck + arcaneBreathing * 0.035;
            transformed.z += cos(arcaneWingPhase) * arcaneWingWeight * arcaneBreath * 0.085
              - arcaneHit * arcaneWingWeight * 0.18 + arcaneBreathing * 0.075;`,
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            float arcaneRim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.8);
            totalEmissiveRadiance += vec3(0.32, 0.065, 0.018) * arcaneRim * 0.32;`,
          );
        };
        next.customProgramCacheKey = () => `arcane-boss-reactions-v4-${this.animator.available ? 'rigged' : 'fallback'}`;
        return next;
      };
      if (Array.isArray(source)) {
        object.material = source.map(prepare);
        for (const material of source) material.dispose();
      } else {
        object.material = prepare(source);
        source.dispose();
      }
    });

    const step = new THREE.Mesh(
      new THREE.CylinderGeometry(3.7, 4.1, 0.28, 64),
      new THREE.MeshStandardMaterial({ color: '#1d1726', roughness: 0.96, metalness: 0.04 }),
    );
    step.position.y = -0.46;
    this.group.add(step);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(3.15, 3.5, 0.3, 64),
      new THREE.MeshStandardMaterial({ color: '#2a2032', roughness: 0.9, metalness: 0.06 }),
    );
    platform.position.y = -0.15;
    this.group.add(platform);

    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: '#b76543',
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.22, 0.016, 4, 128), this.ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.006;
    this.group.add(ring);

    this.glowTexture = glowTexture ?? makeGlowTexture();
    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: this.glowTexture,
      color: this.glowBase,
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 7.4), this.glowMaterial);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.012;
    this.group.add(glow);

    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute('position', new THREE.BufferAttribute(this.emberPositions, 3));
    for (let i = 0; i < EMBER_COUNT; i += 1) {
      this.emberSeeds[i * 4] = Math.random() * Math.PI * 2;
      this.emberSeeds[i * 4 + 1] = 0.25 + Math.random() * 3.2;
      this.emberSeeds[i * 4 + 2] = 0.2 + Math.random() * 0.55;
      this.emberSeeds[i * 4 + 3] = Math.random() * EMBER_REACH;
    }
    this.embers = new THREE.Points(
      emberGeometry,
      new THREE.PointsMaterial({
        map: this.glowTexture,
        color: '#ff7b3d',
        size: 0.13,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
    this.updateEmbers();

    // One warm uplight for the wings, one cold rim from the night side.
    const emberLight = new THREE.PointLight(0xff6a30, 18, 20, 2);
    emberLight.position.set(0, 1.6, 3.2);
    this.group.add(emberLight);
    const moonRim = new THREE.PointLight(0x7fa4ff, 34, 22, 2);
    moonRim.position.set(-3.4, 5.2, -3);
    this.group.add(moonRim);

    // Include the plinth and room for the small procedural motion, not just a torso box.
    this.stageBounds = new THREE.Box3().setFromObject(this.group).expandByScalar(this.animator.available ? 0.48 : 0.16);
    this.group.position.z = -9;
  }

  /** Fit real projected corners: perspective depth, camera pitch and the spell dock all matter. */
  fit(camera: THREE.PerspectiveCamera): void {
    fitBossStage(this.group, this.stageBounds, camera);
  }

  flash(color: string): void {
    this.pulseColor.set(color);
    this.pulse = 1;
  }

  /** Start a readable, spell-specific recoil at the model's actual impact point. */
  react(effect: SpellEffect, point: THREE.Vector3): void {
    if (effect === 'healing' || effect === 'shield') return;
    this.group.updateWorldMatrix(true, false);
    const local = this.group.worldToLocal(point.clone());
    this.reactionSide = local.x < 0 ? 1 : -1;
    this.animator.impact(effect, this.reactionSide);
    this.reactionAge = 0;
    switch (effect) {
      case 'arrow':
        this.reactionDuration = 0.62;
        this.reactionStrength = 0.82;
        this.reactionPitch = 0.72;
        break;
      case 'lightning':
        this.reactionDuration = 0.9;
        this.reactionStrength = 1.2;
        this.reactionPitch = -1.05;
        break;
      case 'frost':
        this.reactionDuration = 0.7;
        this.reactionStrength = 0.52;
        this.reactionPitch = 0.35;
        break;
      case 'wind':
        this.reactionDuration = 0.76;
        this.reactionStrength = 0.95;
        this.reactionPitch = 0.4;
        break;
      case 'summon':
        this.reactionDuration = 0.82;
        this.reactionStrength = 1.05;
        this.reactionPitch = -0.78;
        break;
    }
  }

  /** Driven by the generic enemy status so the pose and surface frost stay synchronized. */
  setFrostAmount(amount: number): void {
    this.frost = THREE.MathUtils.clamp(amount, 0, 1);
    this.animator.setFrostAmount(this.frost);
  }

  update(dt: number): void {
    this.time += dt;
    this.pulse = Math.max(0, this.pulse - dt * 2.6);
    this.reactionAge += dt;
    this.animator.update(dt);

    // A layered alert idle: breathing, weight shift, head/chest sway, and independent
    // wing flex. The animation pivots at the feet and never tips the standing sculpt over.
    const activeIdle = 1 - this.frost * 0.98;
    const breath = Math.sin(this.time * 1.15);
    const slowSway = Math.sin(this.time * 0.58 + 0.7);
    const hitAge = Math.min(this.reactionAge, this.reactionDuration);
    const recoil = this.reactionAge < this.reactionDuration
      ? (1 - Math.exp(-hitAge * 20)) * Math.exp(-hitAge * 4.2)
        * this.reactionStrength * (1 - this.frost * 0.8)
      : 0;
    const lightningTremor = this.reactionAge < 0.38 && recoil > 0 && this.reactionPitch < -0.9
      ? Math.sin(this.time * 43) * Math.exp(-this.reactionAge * 7) * 0.018
      : 0;
    if (!this.animator.available) {
      this.figure.scale.set(
        1 + breath * activeIdle * 0.008,
        1 + breath * activeIdle * 0.012,
        1 + breath * activeIdle * 0.009,
      );
      this.figure.position.set(
        slowSway * activeIdle * 0.035 + this.reactionSide * recoil * 0.12,
        0,
        Math.sin(this.time * 0.72) * activeIdle * 0.025 + recoil * 0.075,
      );
      this.figure.rotation.set(
        slowSway * activeIdle * 0.018 + recoil * this.reactionPitch * 0.095,
        Math.sin(this.time * 0.34) * activeIdle * 0.025 + recoil * this.reactionSide * 0.035,
        Math.sin(this.time * 0.83) * activeIdle * 0.014 - recoil * this.reactionSide * 0.085 + lightningTremor,
      );
    }
    for (const state of this.shaderStates) {
      state.time.value = this.time;
      state.breath.value = activeIdle;
      state.hit.value = recoil;
      state.hitSide.value = this.reactionSide;
      state.frozen.value = this.frost;
    }

    const flash = this.pulse * this.pulse;
    // EnemyCombat may clone these materials for per-instance frost. Update the live
    // materials on the model, rather than stale pre-clone references.
    this.model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const base = material.userData.arcaneBaseEmission as number[] | undefined;
        if (base) material.emissive.fromArray(base);
        else material.emissive.set('#000000');
        if (material.emissive.getHex() === 0 && flash > 0) material.emissive.copy(this.pulseColor);
        else material.emissive.lerp(this.pulseColor, flash);
        material.emissiveIntensity = Math.max(Number(material.userData.arcaneBaseIntensity ?? 0), flash * 0.7);
      }
    });
    this.ringMaterial.color.copy(this.glowBase).lerp(this.pulseColor, flash * 0.6);
    this.ringMaterial.opacity = 0.42 + flash * 0.3;
    this.glowMaterial.color.copy(this.glowBase).lerp(this.pulseColor, flash * 0.5);
    this.glowMaterial.opacity = 0.18 + flash * 0.32;
    this.updateEmbers();
  }

  private updateEmbers(): void {
    const material = this.embers.material as THREE.PointsMaterial;
    material.color.set('#ff7b3d').lerp(this.pulseColor, this.pulse * 0.6);
    for (let i = 0; i < EMBER_COUNT; i += 1) {
      const angle = this.emberSeeds[i * 4];
      const radius = this.emberSeeds[i * 4 + 1];
      const speed = this.emberSeeds[i * 4 + 2];
      const phase = this.emberSeeds[i * 4 + 3];
      const y = (phase + this.time * speed) % EMBER_REACH;
      const drift = angle + this.time * 0.08 + y * 0.18;
      const taper = 1 - y / (EMBER_REACH * 1.7);
      this.emberPositions[i * 3] = Math.cos(drift) * radius * taper;
      this.emberPositions[i * 3 + 1] = y;
      this.emberPositions[i * 3 + 2] = Math.sin(drift) * radius * taper;
    }
    (this.embers.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animator.dispose();
    disposeModel(this.group);
    this.group.removeFromParent();
  }
}

/** A camera-space envelope leaves room for the HUD and prevents wing/plinth cropping. */
export function fitBossStage(group: THREE.Group, bounds: THREE.Box3, camera: THREE.PerspectiveCamera): void {
  camera.updateMatrixWorld(true);
  const center = bounds.getCenter(new THREE.Vector3());
  const heroX = camera.aspect > 1.15 ? Math.min(0.16, (camera.aspect - 1.15) * 0.25) : 0;
  const anchor = new THREE.Vector3(heroX, 0.06, 0.5).unproject(camera);
  const direction = anchor.sub(camera.position).normalize();
  const distance = (-9 - camera.position.z) / direction.z;
  anchor.copy(direction).multiplyScalar(distance).add(camera.position);
  const corner = new THREE.Vector3();

  const apply = (scale: number): void => {
    group.scale.setScalar(scale);
    group.position.copy(anchor).addScaledVector(center, -scale);
    group.updateMatrixWorld(true);
  };
  const fits = (): boolean => {
    for (let i = 0; i < 8; i++) {
      corner.set(
        i & 1 ? bounds.max.x : bounds.min.x,
        i & 2 ? bounds.max.y : bounds.min.y,
        i & 4 ? bounds.max.z : bounds.min.z,
      ).applyMatrix4(group.matrixWorld).project(camera);
      if (corner.x < -0.88 || corner.x > 0.88 || corner.y < -0.68 || corner.y > 0.83 || corner.z >= 1) return false;
    }
    return true;
  };
  let low = 0;
  let high = 1.6;
  for (let i = 0; i < 24; i++) {
    const scale = (low + high) / 2;
    apply(scale);
    if (fits()) low = scale;
    else high = scale;
  }
  apply(low);
}

/** Clean up late loads as well as scene-owned meshes. Textures may be shared by materials. */
export function disposeModel(model: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}
