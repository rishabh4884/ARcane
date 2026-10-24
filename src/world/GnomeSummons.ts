import * as THREE from 'three';
import { EYE_HEIGHT, moveOnGround, terrainHeight, type Obstacle } from './spatial.ts';

export const GNOME_LIFETIME = 10;
export const GNOME_ATTACK_RANGE = 35;
export const GNOME_RUN_SPEED = 6;
const SHOT_INTERVAL = 1.15;
const BOLT_SPEED = 27;

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
  side: number;
  phase: number;
  nextShot: number;
}

interface Bolt {
  group: THREE.Group;
  trail: THREE.Line;
  targetId: number;
  age: number;
}

/** A short-lived pair of illustrated woodland rangers; the forest remains fully 3D. */
export class GnomeSummons {
  readonly group = new THREE.Group();
  private readonly textures: THREE.Texture[];
  private readonly scouts: Scout[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly boltGeometry = new THREE.ConeGeometry(0.065, 0.24, 6);
  private readonly boltShaft = new THREE.CylinderGeometry(0.023, 0.035, 0.16, 6);
  private readonly boltMaterial = new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false });
  private readonly trailMaterial = new THREE.LineBasicMaterial({ color: '#ffc96f', transparent: true, opacity: 0.78, depthWrite: false, toneMapped: false });
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
      root.position.copy(origin).addScaledVector(forward, 5).addScaledVector(right, side * 1.7);
      root.position.y = terrainHeight(root.position.x, root.position.z);
      const auraMaterial = new THREE.SpriteMaterial({
        map: this.textures[i], color: '#f4c66e', transparent: true, opacity: 0.28,
        alphaTest: 0.025, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
      });
      const aura = new THREE.Sprite(auraMaterial);
      aura.scale.set(2.05, 3.08, 1);
      aura.position.y = 1.28;
      aura.renderOrder = 1;
      const material = new THREE.SpriteMaterial({ map: this.textures[i], transparent: true, alphaTest: 0.08, depthWrite: false, fog: true });
      const sprite = new THREE.Sprite(material);
      sprite.scale.set(1.72, 2.58, 1);
      sprite.position.y = 1.29;
      sprite.renderOrder = 2;
      const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#17332f', transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
      const shadow = new THREE.Mesh(this.shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(0.92, 0.42, 1);
      shadow.position.y = 0.025;
      root.add(shadow, aura, sprite);
      this.group.add(root);
      this.shadows.push(shadowMaterial);
      this.scouts.push({ root, sprite, aura, shadow, side, phase: i * Math.PI, nextShot: 0.35 + i * 0.52 });
    }
  }

  update(dt: number, canAttack: boolean, player: THREE.Vector3, targets: readonly GnomeTarget[], reducedMotion = false): void {
    if (this.disposed || this.scouts.length === 0) return;
    dt = Math.max(0, Math.min(dt, 0.05));
    this.elapsed += dt;
    this.age += dt;
    const fade = Math.min(1, Math.max(0, (GNOME_LIFETIME - this.age) / 0.8));
    if (this.age >= GNOME_LIFETIME) { this.clear(); return; }

    const live = targets.filter((target) => target.alive);
    for (const scout of this.scouts) {
      const preferred = live.find((target) => target.id === this.preferredTarget);
      const focus = preferred ?? live.reduce<GnomeTarget | null>((nearest, target) => {
        if (!nearest) return target;
        return target.position.distanceToSquared(this.focus) < nearest.position.distanceToSquared(this.focus) ? target : nearest;
      }, null);
      if (!focus) continue;

      const target = this.visibleTarget(scout.root.position, focus, live);
      const away = this.scratch.copy(focus.position).sub(player).setY(0);
      if (away.lengthSq() < 0.01) away.set(0, 0, -1);
      away.normalize();
      const flank = new THREE.Vector3(away.z, 0, -away.x).multiplyScalar(scout.side * 4.2);
      const desiredRange = target && target.id === focus.id ? 11 : 15;
      const destination = focus.position.clone().addScaledVector(away, desiredRange).add(flank);
      const offset = this.scratch.copy(destination).sub(scout.root.position).setY(0);
      const distance = offset.length();
      const moving = distance > 1.35;
      if (moving) {
        offset.normalize().multiplyScalar(Math.min(GNOME_RUN_SPEED * dt, distance));
        moveOnGround(scout.root.position, offset.x, offset.z, this.obstacles);
        scout.root.position.y -= EYE_HEIGHT;
      }
      const bob = reducedMotion ? 0 : (moving ? Math.abs(Math.sin(this.elapsed * 12 + scout.phase)) * 0.08 : Math.sin(this.elapsed * 2.2 + scout.phase) * 0.025);
      scout.sprite.position.y = 1.04 + bob;
      scout.sprite.material.rotation = moving && !reducedMotion ? Math.sin(this.elapsed * 12 + scout.phase) * 0.025 : 0;
      scout.sprite.material.opacity = fade;
      scout.aura.material.opacity = 0.28 * fade;
      (scout.shadow.material as THREE.MeshBasicMaterial).opacity = 0.26 * fade;

      scout.nextShot = Math.max(0, scout.nextShot - dt);
      if (canAttack && target && scout.nextShot === 0) {
        this.fire(scout, target);
        scout.nextShot = SHOT_INTERVAL;
      }
    }
    this.updateBolts(dt, targets);
  }

  clear(): void {
    for (const scout of this.scouts) {
      this.group.remove(scout.root);
      scout.root.traverse((object) => {
        if (object instanceof THREE.Sprite) object.material.dispose();
      });
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
    this.trailMaterial.dispose();
    this.shadowGeometry.dispose();
    this.group.removeFromParent();
  }

  private visibleTarget(position: THREE.Vector3, focus: GnomeTarget, live: readonly GnomeTarget[]): GnomeTarget | null {
    const candidates = live.map((target) => ({ target, distance: position.distanceTo(target.position) }))
      .filter(({ distance }) => distance <= GNOME_ATTACK_RANGE)
      .sort((a, b) => (a.target.id === focus.id ? -1 : b.target.id === focus.id ? 1 : a.distance - b.distance));
    for (const { target, distance } of candidates) {
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
    tip.position.y = 0.12;
    const shaft = new THREE.Mesh(this.boltShaft, this.boltMaterial);
    shaft.position.y = -0.04;
    group.add(tip, shaft);
    group.position.copy(scout.root.position);
    group.position.y += 0.9;
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([group.position, group.position]);
    const trail = new THREE.Line(lineGeometry, this.trailMaterial);
    this.group.add(group, trail);
    this.bolts.push({ group, trail, targetId: target.id, age: 0 });
  }

  private updateBolts(dt: number, targets: readonly GnomeTarget[]): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.age += dt;
      const target = targets.find((candidate) => candidate.id === bolt.targetId && candidate.alive);
      if (!target || bolt.age > 2.5) { this.removeBolt(bolt); this.bolts.splice(i, 1); continue; }
      this.hitPoint.copy(target.position);
      this.hitPoint.y += Math.min(target.height * 0.68, 2.4);
      const direction = this.scratch.copy(this.hitPoint).sub(bolt.group.position);
      const distance = direction.length();
      if (distance < 0.42) {
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
      const trailPositions = bolt.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      trailPositions.setXYZ(0, bolt.group.position.x, bolt.group.position.y, bolt.group.position.z);
      trailPositions.setXYZ(1, bolt.group.position.x - direction.x * 0.42, bolt.group.position.y - direction.y * 0.42, bolt.group.position.z - direction.z * 0.42);
      trailPositions.needsUpdate = true;
      bolt.trail.geometry.computeBoundingSphere();
    }
  }

  private removeBolt(bolt: Bolt): void {
    this.group.remove(bolt.group, bolt.trail);
    bolt.trail.geometry.dispose();
  }
}
