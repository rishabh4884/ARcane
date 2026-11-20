import * as THREE from 'three';
import { Body, instantiate } from './Body.ts';
import { figureMaterial, type FigureUniforms } from './figureMaterial.ts';
import { clamp, Rig, smooth, Spring, type Anim, type CreaturePose } from './Rig.ts';

/** A character, described as data plus two functions: how it is built and how it moves. */
export interface Design {
  kind: string;
  name: string;
  /** Standing height (m) and body radius (m) for hit boxes, spacing and the dissolve. */
  height: number;
  radius: number;
  /** Fastest it can turn (rad/s): big things turn slowly, which is part of how they feel big. */
  turnRate: number;
  /** Metres covered per full gait cycle (two steps), so feet do not slide. */
  stride: number;
  /** Ground speed (m/s) that counts as a full walk. */
  pace: number;
  eye: THREE.ColorRepresentation;
  /** Eye colour at the top of a wind-up. */
  eyeAngry: THREE.ColorRepresentation;
  /** Burning edge of the dissolve. */
  edge: THREE.ColorRepresentation;
  /** How high the ground mist climbs it (m). */
  mist?: number;
  /** Cloth hanging region: amplitude (m), top and bottom heights (model space), drag with speed. */
  cloth?: readonly [number, number, number, number?];
  /** Bone easing rates (per second); loose parts low, masses high. */
  stiffness?: Record<string, number>;
  /** Where ranged attacks leave from, and where arrows stick. */
  castBone?: string;
  coreBone?: string;
  build(body: Body): void;
  animate(a: Anim): void;
}

export interface CharacterInput {
  pose: CreaturePose;
  progress: number;
  attack?: string;
  /** World ground velocity (m/s). */
  velocity: THREE.Vector3;
  /** Yaw the body should turn toward (null = keep). */
  faceYaw: number | null;
  /** The point it watches (the caster's eyes, a target). */
  look: THREE.Vector3;
  groundY: number;
  reducedMotion?: boolean;
  /** Extra acting layered on top of the design's motion (cutscenes: waves, bows, reaching). */
  extra?: (a: Anim) => void;
}

const LOOK = new THREE.Vector3();
const BLOB_GEOMETRY = new THREE.PlaneGeometry(1, 1);
/** Each design is modelled, sculpted and baked once; every creature of that kind shares it. */
const BAKED = new WeakMap<Design, { geometry: THREE.BufferGeometry; root: THREE.Bone; names: string[] }>();
function baked(design: Design) {
  let b = BAKED.get(design);
  if (!b) { const body = new Body(); design.build(body); b = body.bake(); BAKED.set(design, b); }
  return b;
}
const TMP = new THREE.Vector3();

export class Character {
  /** Placed in the world by its owner (position = feet). Yaw is managed here. */
  readonly group = new THREE.Group();
  /** Vertical offset inside the group: emerging from the ground, hovering. */
  readonly lift = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly rig: Rig;
  readonly u: FigureUniforms;
  readonly bones: Record<string, THREE.Bone>;
  yaw = 0;
  /** Scripted values that win over the figure's own (cutscenes, spells made of light). */
  readonly overrides: { dissolve?: number; flash?: number; eyes?: number } = {};
  private phase = 0;
  private t = 0;
  private poseAge = 0;
  private lastPose: CreaturePose = 'idle';
  private hitAt = -100;
  private stillFor = 0;
  private life = 1;
  private moveAmount = 0;
  private emergeAge = 10;
  private emergeTime = 1.6;
  private turnRate = 0;
  private readonly prevVelocity = new THREE.Vector3();
  private readonly swayF = new Spring(36, 6);
  private readonly swayS = new Spring(36, 6);
  private readonly recoil = new Spring(140, 11);
  private readonly calmEye: THREE.Color;
  private readonly angryEye: THREE.Color;
  private first = true;
  private disposed = false;
  private blob: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;
  readonly seed: number;

  constructor(readonly design: Design, seed = Math.random()) {
    this.seed = seed;
    const { material, u } = figureMaterial(new THREE.Color(design.edge));
    this.u = u;
    u.uHeight.value = design.height;
    u.uMist.value = design.mist ?? 0.5;
    const b = baked(design);
    const built = instantiate(b.geometry, b.root, b.names, material);
    this.mesh = built.mesh;
    this.bones = built.bones;
    this.mesh.name = design.name;
    this.rig = new Rig(this.bones, design.stiffness);
    this.calmEye = new THREE.Color(design.eye);
    this.angryEye = new THREE.Color(design.eyeAngry);
    u.uEyeColor.value.copy(this.calmEye);
    if (design.cloth) u.uCloth.value.set(design.cloth[0], design.cloth[1], design.cloth[2], 0);
    this.group.name = `${design.name} (figure)`;
    this.mesh.castShadow = design.kind !== 'hands';
    this.lift.add(this.mesh);
    this.group.add(this.lift);
    // A soft contact shadow pooled under the body: grounds it even where the moon's map does not reach.
    if (design.kind !== 'hands') {
      this.blob = new THREE.Mesh(BLOB_GEOMETRY, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uOpacity: { value: 0.55 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uOpacity; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.01, 0.015, 0.02, pow(max(0.0, 1.0 - d), 1.8) * uOpacity); }',
      }));
      this.blob.rotation.x = -Math.PI / 2;
      this.blob.position.y = 0.24;
      this.blob.scale.setScalar(design.radius * 3.2);
      this.blob.renderOrder = 2;
      this.group.add(this.blob);
    }
  }

  get kind(): string { return this.design.kind; }
  /** The bone stuck arrows and decorations ride on. */
  get core(): THREE.Object3D { return this.bones[this.design.coreBone ?? 'chest'] ?? this.bones.root; }
  /** 0 solid … 1 gone. */
  get fade(): number { return this.group.visible ? this.u.uDissolve.value : 1; }
  /** 0..1 how much the body is walking right now (for audio, footstep dust). */
  get gait(): number { return this.moveAmount; }

  castPoint(out: THREE.Vector3): THREE.Vector3 {
    const bone = this.bones[this.design.castBone ?? 'head'] ?? this.bones.root;
    this.group.updateMatrixWorld(true);
    return bone.getWorldPosition(out);
  }

  bonePoint(name: string, out: THREE.Vector3): THREE.Vector3 {
    const bone = this.bones[name] ?? this.bones.root;
    return bone.getWorldPosition(out);
  }

  /** Rise out of the ground (the wood awakening, a summoning). */
  awaken(seconds = 1.6): void {
    this.emergeAge = 0;
    this.emergeTime = seconds;
    this.hitAt = -100;
    this.u.uDissolve.value = 1;
    this.u.uFrost.value = 0;
    this.group.visible = true;
    this.first = true;
  }

  hit(power = 1): void {
    this.hitAt = this.t;
    this.recoil.kick(-3.5 * power);
  }

  /** Hold utterly still and stare for a few seconds (the hush). */
  still(seconds: number): void { this.stillFor = Math.max(this.stillFor, seconds); }

  setYaw(yaw: number): void { this.yaw = yaw; this.group.rotation.y = yaw; }

  update(dt: number, input: CharacterInput): void {
    if (this.disposed) return;
    const d = this.design;
    if (input.pose !== this.lastPose) { this.lastPose = input.pose; this.poseAge = 0; }
    const frozen = input.pose === 'frozen';
    const dead = input.pose === 'dead';
    const live = frozen ? 0 : 1;
    this.t += dt * live;
    this.poseAge += dt;
    this.emergeAge += dt;
    this.stillFor = Math.max(0, this.stillFor - dt);

    // Turn toward the wanted heading, never faster than the body can.
    const previousYaw = this.yaw;
    if (input.faceYaw !== null && !frozen && !dead) {
      let delta = (input.faceYaw - this.yaw + Math.PI) % (Math.PI * 2) - Math.PI;
      if (delta < -Math.PI) delta += Math.PI * 2;
      const step = clamp(delta * Math.min(1, dt * 7), -d.turnRate * dt, d.turnRate * dt);
      this.yaw += step;
    }
    this.group.rotation.y = this.yaw;
    const turn = dt > 0 ? (this.yaw - previousYaw) / dt : 0;
    this.turnRate += (turn - this.turnRate) * Math.min(1, dt * 10);

    // Travel, in the body's own frame.
    const v = input.velocity;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const speed = Math.hypot(v.x, v.z);
    const fwd = speed > 1e-3 ? (v.x * sin + v.z * cos) / speed : 1;
    const side = speed > 1e-3 ? (v.x * cos - v.z * sin) / speed : 0;
    const wantMove = clamp(speed / d.pace) + clamp(Math.abs(this.turnRate) * 0.35) * (1 - clamp(speed / d.pace));
    this.moveAmount += (wantMove - this.moveAmount) * Math.min(1, dt * 6);
    this.phase = (this.phase + (speed / d.stride + Math.abs(this.turnRate) * 0.1) * dt * live) % 1;
    if (dt > 0) {
      const ax = (v.x - this.prevVelocity.x) / dt, az = (v.z - this.prevVelocity.z) / dt;
      this.swayF.step(clamp(-(ax * sin + az * cos) * 0.05, -0.5, 0.5), dt);
      this.swayS.step(clamp(-(ax * cos - az * sin) * 0.05 + this.turnRate * 0.12, -0.6, 0.6), dt);
    }
    this.prevVelocity.copy(v);

    // Where the caster is, relative to the face.
    LOOK.copy(input.look).sub(this.group.position);
    const lx = LOOK.x * cos - LOOK.z * sin, lz = LOOK.x * sin + LOOK.z * cos;
    const lookYaw = Math.atan2(lx, lz);
    const lookPitch = Math.atan2(LOOK.y - d.height * 0.85, Math.hypot(lx, lz));

    const holding = this.stillFor > 0 && !dead && input.pose !== 'strike';
    this.life += ((holding ? 0 : 1) - this.life) * Math.min(1, dt * (holding ? 5 : 1.6));
    const hitAge = this.t - this.hitAt;
    const recoil = this.recoil.step(0, dt);

    if (!frozen) {
      const a: Anim = {
        rig: this.rig, t: this.t, dt, pose: input.pose, progress: input.progress, attack: input.attack ?? '', age: this.poseAge,
        phase: this.phase, move: this.moveAmount, fwd, side, speed, turn: this.turnRate,
        swayF: this.swayF.value, swayS: this.swayS.value, lookYaw, lookPitch,
        hit: Math.exp(-Math.max(0, hitAge) * 5), life: this.life, seed: this.seed, ground: input.groundY,
      };
      d.animate(a);
      input.extra?.(a);
      // Every body flinches from a blow, whatever it is.
      this.rig.rot('spine', recoil * 0.18).rot('chest', recoil * 0.22).rot('head', recoil * 0.3);
      if (dead) {
        const p = smooth(0, 0.7, input.progress);
        this.rig.rot('spine', p * 0.45).rot('chest', p * 0.35).rot('head', p * 0.5).pos('hips', 0, -p * d.height * 0.14, 0);
        this.rig.rotPair('knee', p * 0.9).rotPair('thigh', -p * 0.6).rotPair('shoulder', p * 0.3, 0, -p * 0.2);
      }
      if (this.first) { this.rig.snap(); this.first = false; }
      else this.rig.apply(dt, input.reducedMotion ? 0.6 : 1);
    } else {
      this.rig.hold();
    }

    // Emerging from the ground: rise and resolve out of the mist.
    const e = smooth(0, 1, this.emergeAge / this.emergeTime);
    this.lift.position.y = -(1 - e) * (1 - e) * d.height * 0.45;
    const u = this.u;
    u.uTime.value = this.t;
    u.uGroundY.value = input.groundY;
    u.uDissolve.value = dead ? smooth(0.15, 1, input.progress) : 1 - e;
    u.uFlash.value = Math.exp(-Math.max(0, hitAge) * 9) * (hitAge >= 0 ? 1 : 0);
    u.uFrost.value += ((frozen ? 1 : 0) - u.uFrost.value) * Math.min(1, dt * (frozen ? 8 : 2.5));
    const fury = input.pose === 'windup' ? smooth(0, 1, input.progress) : input.pose === 'strike' ? 1 : 0;
    u.uEyeColor.value.copy(this.calmEye).lerp(this.angryEye, fury);
    u.uEyes.value = (dead ? 1 - input.progress : 1) * (0.85 + fury * 0.9 + Math.sin(this.t * 2.3 + this.seed * 7) * 0.08);
    if (this.overrides.dissolve !== undefined) u.uDissolve.value = this.overrides.dissolve;
    if (this.overrides.flash !== undefined) u.uFlash.value = this.overrides.flash;
    if (this.overrides.eyes !== undefined) u.uEyes.value = this.overrides.eyes;
    if (d.cloth) u.uCloth.value.w = clamp(speed / d.pace) * (d.cloth[3] ?? 0.15) * Math.max(0, fwd);
    this.group.visible = !(dead && input.progress >= 1) && (this.overrides.dissolve ?? 0) < 0.999;
    // Half-dissolved figures stop casting: a ghost should not leave a solid shadow.
    this.mesh.castShadow = d.kind !== 'hands' && u.uDissolve.value < 0.5;
    if (this.blob) {
      const altitude = Math.max(0, this.lift.position.y);
      this.blob.material.uniforms.uOpacity.value = 0.55 * (1 - u.uDissolve.value) / (1 + altitude * 0.8);
      this.blob.scale.setScalar(d.radius * 3.2 * (1 + altitude * 0.15));
    }
  }

  /** World position of the figure's head top, for health bars and labels. */
  top(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.group.position).add(TMP.set(0, this.design.height, 0));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    // The baked geometry is shared by every creature of this kind and kept for the next.
    (this.mesh.material as THREE.Material).dispose();
    this.blob?.material.dispose();
    this.mesh.skeleton.dispose();
    this.group.removeFromParent();
  }
}
