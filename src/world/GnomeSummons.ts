import * as THREE from 'three';
import type { ParticleSystem } from './particles.ts';
import { EYE_HEIGHT, moveOnGround, terrainHeight, type Obstacle } from './spatial.ts';
import { Trail, glowSprite } from './vfx.ts';

export const GNOME_LIFETIME = 10;
export const GNOME_ATTACK_RANGE = 35;
export const GNOME_RUN_SPEED = 6;
const SHOT_INTERVAL = 1.15;
const BOLT_SPEED = 17;
/** Seconds spent climbing out of the summoning circle before a gnome may move or shoot. */
const EMERGE_TIME = 0.75;
/** Attack beats: brace and aim, loose the bolt, recoil and settle. */
const ATTACK_TIME = 0.55;
const RELEASE_AT = 0.26;
/** Preferred shooting distance from the target; they hold here instead of charging past it. */
const SHOOT_RANGE = 8.5;
const SPRITE_W = 1.72;
const SPRITE_H = 2.58;
const SPRITE_Y = 1.04;
/** The crossbow tip in the gnome artwork (it faces screen-right), relative to the sprite centre. */
const MUZZLE = new THREE.Vector2(0.6, -0.21);

export interface GnomeTarget {
  id: number;
  position: THREE.Vector3;
  height: number;
  alive: boolean;
}

interface Scout {
  root: THREE.Group;
  sprite: THREE.Sprite;
  aura: THREE.Sprite;
  shadow: THREE.Mesh;
  texture: THREE.Texture;
  side: number;
  phase: number;
  nextShot: number;
  emerge: number;
  attack: number;
  attackTarget: GnomeTarget | null;
  facing: number;
  lean: number;
}

interface Bolt {
  group: THREE.Group;
  trail: Trail;
  targetId: number;
  age: number;
}

/** A short-lived pair of illustrated woodland rangers who climb out of the circle and shoot. */
export class GnomeSummons {
  readonly group = new THREE.Group();
  private readonly textures: THREE.Texture[];
  private readonly scouts: Scout[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly boltGeometry = new THREE.ConeGeometry(0.075, 0.28, 6);
  private readonly boltShaft = new THREE.CylinderGeometry(0.025, 0.038, 0.22, 6);
  private readonly boltMaterial = new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false });
  private readonly sparkColor = new THREE.Color('#ffd98f');
  private readonly portalColor = new THREE.Color('#ffd166');
  private camera = new THREE.Vector3();
  private readonly shadowGeometry = new THREE.CircleGeometry(0.5, 24);
  private readonly shadows: THREE.MeshBasicMaterial[] = [];
  private readonly ray = new THREE.Ray();
  private readonly scratch = new THREE.Vector3();
  private readonly hitPoint = new THREE.Vector3();
  private readonly obstacles: readonly Obstacle[];
  private readonly intersectEnvironment: (ray: THREE.Ray, range: number) => number | null;
  private age = 0;
  private elapsed = 0;
  private preferredTarget: number | null = null;
  private focus = new THREE.Vector3();
  private disposed = false;

  constructor(
    obstacles: readonly Obstacle[],
    intersectEnvironment: (ray: THREE.Ray, range: number) => number | null,
    private readonly onHit: (targetId: number, point: THREE.Vector3) => void,
    private readonly particles?: ParticleSystem,
  ) {
    this.obstacles = obstacles;
    this.intersectEnvironment = intersectEnvironment;
    this.group.name = 'Rise · woodland gnome rangers';
    this.textures = ['gnome-moss.svg', 'gnome-ember.svg'].map((file) => {
      if (typeof document === 'undefined') return new THREE.Texture();
      const texture = new THREE.TextureLoader().load(new URL(`assets/summons/${file}`, document.baseURI).href);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 2;
      return texture;
    });
  }

  /** `origin` is the centre of the summoning circle on the ground; the pair climbs out of it. */
  summon(origin: THREE.Vector3, focus: THREE.Vector3, preferredTarget: number | null = null): void {
    if (this.disposed) return;
    this.clear();
    this.age = 0;
    this.elapsed = 0;
    this.preferredTarget = preferredTarget;
    this.focus.copy(focus);
    const forward = this.scratch.copy(focus).sub(origin).setY(0);
    if (forward.lengthSq() < 0.01) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const root = new THREE.Group();
      // Inside the ring, not metres away from it.
      root.position.copy(origin).addScaledVector(right, side * 0.75);
      root.position.y = terrainHeight(root.position.x, root.position.z);
      const texture = this.textures[i];
      const auraMaterial = new THREE.SpriteMaterial({
        map: texture, color: '#f4c66e', transparent: true, opacity: 0.28,
        alphaTest: 0.025, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      });
      const aura = new THREE.Sprite(auraMaterial);
      aura.scale.set(2.05, 3.08, 1);
      aura.position.y = SPRITE_Y - 2.4;
      aura.renderOrder = 1;
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.08, depthWrite: false, fog: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(SPRITE_W, SPRITE_H, 1);
      sprite.position.y = SPRITE_Y - 2.4;
      sprite.renderOrder = 2;
      const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#17332f', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const shadow = new THREE.Mesh(this.shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(0.92, 0.42, 1);
      shadow.position.y = 0.025;
      root.add(shadow, aura, sprite);
      this.group.add(root);
      this.shadows.push(shadowMaterial);
      this.scouts.push({
        root, sprite, aura, shadow, texture, side, phase: i * Math.PI,
        nextShot: 0.15 + i * 0.4, emerge: -i * 0.12, attack: -1, attackTarget: null, facing: side, lean: 0,
      });
    }
  }

  update(dt: number, canAttack: boolean, player: THREE.Vector3, targets: readonly GnomeTarget[], reducedMotion = false): void {
    if (this.disposed || this.scouts.length === 0) return;
    dt = Math.max(0, Math.min(dt, 0.05));
    this.camera.copy(player);
    this.elapsed += dt;
    this.age += dt;
    const fade = Math.min(1, Math.max(0, (GNOME_LIFETIME - this.age) / 0.8));
    if (this.age >= GNOME_LIFETIME) { this.clear(); return; }

    const live = targets.filter((target) => target.alive);
    for (const scout of this.scouts) {
      scout.emerge += dt;
      const emerged = scout.emerge >= EMERGE_TIME;
      const rise = THREE.MathUtils.smoothstep(scout.emerge, 0, EMERGE_TIME);
      if (!emerged) {
        // Climbing out of the circle: golden motes stream up around them.
        if (Math.random() < dt * 30) {
          const p = scout.root.position;
          this.particles?.emit({
            x: p.x + (Math.random() - 0.5) * 0.7, y: p.y + 0.05, z: p.z + (Math.random() - 0.5) * 0.7,
            vx: 0, vy: 1.6 + Math.random() * 1.4, vz: 0, color: this.portalColor, size: 0.08, sizeEnd: 0.01, ttl: 0.8, drag: 0.5, style: 'glow',
          });
        }
      }

      const preferred = live.find((target) => target.id === this.preferredTarget);
      const focus = preferred ?? live.reduce<GnomeTarget | null>((nearest, target) => {
        if (!nearest) return target;
        return target.position.distanceToSquared(this.focus) < nearest.position.distanceToSquared(this.focus) ? target : nearest;
      }, null);

      let moving = false;
      const target = focus ? this.visibleTarget(scout.root.position, focus, live) : null;
      if (focus && emerged && scout.attack < 0) {
        // Hold a firing position between the caster and the spirit, flanking to either side.
        const toward = this.scratch.copy(focus.position).sub(player).setY(0);
        if (toward.lengthSq() < 0.01) toward.set(0, 0, -1);
        toward.normalize();
        const flank = new THREE.Vector3(toward.z, 0, -toward.x).multiplyScalar(scout.side * 2.6);
        const range = target && target.id === focus.id ? SHOOT_RANGE : 4.5;
        const destination = focus.position.clone().addScaledVector(toward, -range).add(flank);
        const offset = destination.sub(scout.root.position).setY(0);
        const distance = offset.length();
        // Already in range and in sight: plant your feet and shoot rather than keep running.
        const inRange = target && scout.root.position.distanceTo(target.position) <= SHOOT_RANGE + 3;
        moving = distance > 1.2 && !inRange;
        if (moving) {
          offset.normalize().multiplyScalar(Math.min(GNOME_RUN_SPEED * dt, distance));
          moveOnGround(scout.root.position, offset.x, offset.z, this.obstacles);
          scout.root.position.y -= EYE_HEIGHT;
        }
      }

      // Face whichever way they are shooting (or running), as seen from the caster.
      const lookAt = scout.attackTarget?.position ?? target?.position ?? focus?.position;
      if (lookAt) {
        const screenRight = new THREE.Vector3().subVectors(scout.root.position, player).setY(0).normalize();
        const rightVec = new THREE.Vector3(-screenRight.z, 0, screenRight.x);
        const across = this.scratch.copy(lookAt).sub(scout.root.position).dot(rightVec);
        if (Math.abs(across) > 0.3) scout.facing = across > 0 ? 1 : -1;
      }
      scout.texture.repeat.x = scout.facing;
      scout.texture.offset.x = scout.facing < 0 ? 1 : 0;

      scout.nextShot = Math.max(0, scout.nextShot - dt);
      if (emerged && scout.attack < 0 && canAttack && target && scout.nextShot === 0 && !moving) {
        scout.attack = 0;
        scout.attackTarget = target;
      }

      let squash = 0;
      let lean = 0;
      let flash = 0;
      if (scout.attack >= 0) {
        const before = scout.attack;
        scout.attack += dt;
        const a = scout.attack;
        if (a < RELEASE_AT) {
          // Brace: sink a little and lean into the aim as the crossbow comes up.
          const k = THREE.MathUtils.smoothstep(a, 0, RELEASE_AT);
          squash = 0.07 * k;
          lean = 0.09 * k;
        } else {
          // Loose: the recoil kicks them back, then they settle.
          const k = Math.exp(-(a - RELEASE_AT) * 9);
          squash = -0.06 * k;
          lean = -0.18 * k;
          flash = k;
        }
        if (before < RELEASE_AT && a >= RELEASE_AT && scout.attackTarget?.alive) {
          this.fire(scout, scout.attackTarget);
          scout.nextShot = SHOT_INTERVAL;
        }
        if (a >= ATTACK_TIME) { scout.attack = -1; scout.attackTarget = null; }
      }
      scout.lean += (lean - scout.lean) * (1 - Math.exp(-dt * 25));

      const bob = reducedMotion ? 0 : (moving ? Math.abs(Math.sin(this.elapsed * 12 + scout.phase)) * 0.08 : Math.sin(this.elapsed * 2.2 + scout.phase) * 0.025);
      const climb = (1 - rise) * -2.4;
      scout.sprite.position.y = SPRITE_Y + bob + climb - squash * SPRITE_H * 0.5;
      scout.aura.position.y = scout.sprite.position.y + 0.24;
      scout.sprite.scale.set(SPRITE_W * (1 + squash * 0.6), SPRITE_H * (1 - squash), 1);
      const runTilt = moving && !reducedMotion ? Math.sin(this.elapsed * 12 + scout.phase) * 0.03 : 0;
      // Positive lean tips the top toward the facing direction (sprite rotation is counter-clockwise).
      scout.sprite.material.rotation = runTilt - scout.lean * scout.facing;
      scout.aura.material.rotation = scout.sprite.material.rotation;
      scout.sprite.material.opacity = fade * Math.min(1, rise * 1.6);
      scout.aura.material.opacity = (0.28 + flash * 0.5 + (1 - rise) * 0.4) * fade;
      (scout.shadow.material as THREE.MeshBasicMaterial).opacity = 0.26 * fade * rise;
    }
    this.updateBolts(dt, targets);
  }

  clear(): void {
    for (const scout of this.scouts) {
      this.group.remove(scout.root);
      scout.root.traverse((object) => {
        if (object instanceof THREE.Sprite) object.material.dispose();
      });
      scout.texture.repeat.x = 1;
      scout.texture.offset.x = 0;
    }
    this.scouts.length = 0;
    for (const bolt of this.bolts) this.removeBolt(bolt);
    this.bolts.length = 0;
    this.shadows.splice(0).forEach((material) => material.dispose());
    this.preferredTarget = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.textures.forEach((texture) => texture.dispose());
    this.boltGeometry.dispose();
    this.boltShaft.dispose();
    this.boltMaterial.dispose();
    this.shadowGeometry.dispose();
    this.group.removeFromParent();
  }

  private visibleTarget(position: THREE.Vector3, focus: GnomeTarget, live: readonly GnomeTarget[]): GnomeTarget | null {
    const candidates = live.map((target) => ({ target, distance: position.distanceTo(target.position) }))
      .filter(({ distance }) => distance <= GNOME_ATTACK_RANGE)
      .sort((a, b) => (a.target.id === focus.id ? -1 : b.target.id === focus.id ? 1 : a.distance - b.distance));
    for (const { target } of candidates) {
      const from = position.clone(); from.y += 1.25;
      const to = target.position.clone(); to.y += Math.min(target.height * 0.68, 2.4);
      const direction = to.sub(from);
      const lineDistance = direction.length();
      this.ray.set(from, direction.normalize());
      const blocker = this.intersectEnvironment(this.ray, lineDistance);
      if (blocker === null || blocker >= lineDistance - 0.35) return target;
    }
    return null;
  }

  private fire(scout: Scout, target: GnomeTarget): void {
    const group = new THREE.Group();
    const tip = new THREE.Mesh(this.boltGeometry, this.boltMaterial);
    tip.position.y = 0.14;
    const shaft = new THREE.Mesh(this.boltShaft, this.boltMaterial);
    shaft.position.y = -0.05;
    const halo = glowSprite('#ffcf7a', 0.85, undefined, 0.9);
    group.add(tip, shaft, halo);
    // Loose the bolt from the crossbow tip, on whichever side the gnome is facing.
    const across = new THREE.Vector3().subVectors(scout.root.position, this.camera).setY(0).normalize();
    const right = new THREE.Vector3(-across.z, 0, across.x);
    group.position.copy(scout.root.position).addScaledVector(right, MUZZLE.x * scout.facing);
    group.position.y += SPRITE_Y + MUZZLE.y;
    const trail = new Trail('#ffc96f', 0.14, 0.24, 28, 1);
    this.group.add(group, trail.mesh);
    this.particles?.burst(group.position, 14, { speed: 2.2, color: this.sparkColor, size: 0.07, ttl: 0.35, drag: 3, style: 'spark' });
    this.bolts.push({ group, trail, targetId: target.id, age: 0 });
  }

  private updateBolts(dt: number, targets: readonly GnomeTarget[]): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.age += dt;
      const target = targets.find((candidate) => candidate.id === bolt.targetId && candidate.alive);
      if (!target || bolt.age > 3) { this.removeBolt(bolt); this.bolts.splice(i, 1); continue; }
      this.hitPoint.copy(target.position);
      this.hitPoint.y += Math.min(target.height * 0.6, 2.4);
      const direction = this.scratch.copy(this.hitPoint).sub(bolt.group.position);
      const distance = direction.length();
      if (distance < 0.42) {
        this.particles?.burst(this.hitPoint, 24, { speed: 3.8, color: this.sparkColor, size: 0.07, ttl: 0.5, gravity: 6, drag: 1.2, style: 'spark' });
        this.onHit(target.id, this.hitPoint.clone());
        this.removeBolt(bolt); this.bolts.splice(i, 1); continue;
      }
      direction.normalize();
      const step = Math.min(BOLT_SPEED * dt, distance);
      this.ray.set(bolt.group.position, direction);
      const blocker = this.intersectEnvironment(this.ray, step);
      if (blocker !== null && blocker < step - 0.04) { this.removeBolt(bolt); this.bolts.splice(i, 1); continue; }
      bolt.group.position.addScaledVector(direction, step);
      bolt.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
      bolt.trail.push(bolt.group.position);
      bolt.trail.update(dt, this.camera);
    }
  }

  private removeBolt(bolt: Bolt): void {
    this.group.remove(bolt.group);
    bolt.group.traverse((object) => { if (object instanceof THREE.Sprite) object.material.dispose(); });
    bolt.trail.dispose();
  }
}
