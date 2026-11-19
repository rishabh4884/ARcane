import * as THREE from 'three';
import type { ParticleSystem } from './particles.ts';
import { EYE_HEIGHT, moveOnGround, terrainHeight, type Obstacle } from './spatial.ts';
import { Trail } from './vfx.ts';

export const GNOME_LIFETIME = 10;
/** How far a gnome will look for a spirit to pelt. */
export const GNOME_ATTACK_RANGE = 35;
export const GNOME_RUN_SPEED = 6;
/** After a rock leaves the hand, the gnome waits this long before stooping for the next. */
const THROW_COOLDOWN = 0.45;
/** Ground tears open, the gnome bursts out, falls back and lands, then may move or throw. */
const EMERGE_TIME = 1.0;
const TEAR_AT = 0.3;
/** At the end of their time they sink back into the earth. */
const SINK_TIME = 0.7;
/**
 * One throw, in seconds: stoop and reach (0–0.22), close both hands on a rock (0.26), stand with
 * it at the chest (0.42), cock it back behind the head while the other arm sights (0.74), whip it
 * over (release at 0.84), and follow through until the arm swings down past the hip (1.2).
 */
const GRAB_AT = 0.24;
const RELEASE_AT = 0.84;
const ATTACK_TIME = 1.2;
/** Preferred throwing distance from the target; they hold here instead of charging past it. */
const THROW_RANGE = 7.5;
const ROCK_GRAVITY = 13;
const ROCK_RADIUS = 0.13;
/** Artwork frame (px) and its size in the world (m). */
const FRAME_W = 512;
const FRAME_H = 768;
const RIG_W = 1.72;
const RIG_H = 2.58;
/** The boots touch the ground here in the artwork. */
const FEET_PX = 705;
/** Artwork pixels rendered per texture pixel: the parts are small, so render them crisp. */
const TEXTURE_SCALE = 1.2;

type PartName =
  | 'legL_up' | 'legL_low' | 'legR_up' | 'legR_low'
  | 'armL_up' | 'armL_fore' | 'armL_hand' | 'armL_fingers'
  | 'torso' | 'head' | 'cap'
  | 'armR_up' | 'armR_fore' | 'armR_hand' | 'armR_fingers';

/**
 * The rig, back to front. Each part is cropped from its own `<g id>` in the gnome SVG: `rect` is
 * the crop in artwork pixels, `pivot` the joint it turns about, `parent` the part it hangs from.
 * The gnome faces screen-right; L is the throwing arm (it winds up behind the head, so it sits
 * between coat and head), R the arm that sights the target.
 */
const PARTS: ReadonlyArray<{ name: PartName; rect: [number, number, number, number]; pivot: [number, number]; parent: PartName | null }> = [
  { name: 'legL_up', rect: [140, 578, 120, 92], pivot: [212, 596], parent: null },
  { name: 'legL_low', rect: [108, 612, 152, 112], pivot: [208, 645], parent: 'legL_up' },
  { name: 'legR_up', rect: [262, 576, 100, 94], pivot: [310, 594], parent: null },
  { name: 'legR_low', rect: [262, 612, 196, 122], pivot: [316, 645], parent: 'legR_up' },
  { name: 'torso', rect: [60, 330, 396, 272], pivot: [256, 598], parent: null },
  { name: 'armL_up', rect: [130, 326, 72, 148], pivot: [166, 372], parent: 'torso' },
  { name: 'armL_fore', rect: [134, 428, 64, 100], pivot: [166, 448], parent: 'armL_up' },
  { name: 'armL_hand', rect: [138, 494, 80, 72], pivot: [166, 515], parent: 'armL_fore' },
  { name: 'armL_fingers', rect: [138, 532, 56, 52], pivot: [166, 542], parent: 'armL_hand' },
  { name: 'head', rect: [78, 112, 360, 330], pivot: [256, 405], parent: 'torso' },
  { name: 'cap', rect: [136, 16, 248, 258], pivot: [258, 240], parent: 'head' },
  { name: 'armR_up', rect: [310, 326, 72, 148], pivot: [346, 372], parent: 'torso' },
  { name: 'armR_fore', rect: [314, 428, 64, 100], pivot: [346, 448], parent: 'armR_up' },
  { name: 'armR_hand', rect: [294, 494, 80, 72], pivot: [346, 515], parent: 'armR_fore' },
  { name: 'armR_fingers', rect: [318, 532, 56, 52], pivot: [346, 542], parent: 'armR_hand' },
];
const PART_NAMES = PARTS.map((part) => part.name);

/**
 * One full-body pose in the gnome's own space (facing +x). Angles are radians, + turns
 * counter-clockwise: + swings an arm or leg forward; a negative lean tips the torso forward.
 */
interface Pose {
  lean: number; crouch: number; head: number;
  hipL: number; kneeL: number; hipR: number; kneeR: number;
  shoulderL: number; elbowL: number; wristL: number; gripL: number;
  shoulderR: number; elbowR: number; wristR: number; gripR: number;
}
const POSE_KEYS = ['lean', 'crouch', 'head', 'hipL', 'kneeL', 'hipR', 'kneeR', 'shoulderL', 'elbowL', 'wristL', 'gripL', 'shoulderR', 'elbowR', 'wristR', 'gripR'] as const;
const REST: Pose = { lean: 0, crouch: 0, head: 0, hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, shoulderL: -0.3, elbowL: 0.18, wristL: 0, gripL: 0.35, shoulderR: 0.3, elbowR: 0.18, wristR: 0, gripR: 0.35 };
const pose = (overrides: Partial<Pose>): Pose => ({ ...REST, ...overrides });
/**
 * The throw. The throwing arm keeps turning the same way through the whole swing (back, up, over
 * the top, forward and down past the hip), so its last key sits a full turn on from rest.
 */
const THROW: ReadonlyArray<[number, Pose]> = [
  [0, REST],
  [0.2, pose({ lean: -0.62, crouch: 0.34, head: -0.18, hipL: 0.55, kneeL: -1.0, hipR: 0.62, kneeR: -1.05, shoulderL: 0.62, elbowL: 0.12, wristL: 0.2, gripL: -0.25, shoulderR: 0.78, elbowR: 0.05, wristR: 0.2, gripR: -0.25 })],
  [GRAB_AT, pose({ lean: -0.64, crouch: 0.36, head: -0.2, hipL: 0.56, kneeL: -1.02, hipR: 0.64, kneeR: -1.08, shoulderL: 0.64, elbowL: 0.14, wristL: 0.2, gripL: 1, shoulderR: 0.8, elbowR: 0.08, wristR: 0.2, gripR: 1 })],
  [0.42, pose({ lean: 0.06, crouch: 0.02, head: 0.05, shoulderL: 0.25, elbowL: 1.45, wristL: 0.3, gripL: 1, shoulderR: 0.55, elbowR: 1.3, wristR: 0.2, gripR: 0.7 })],
  [0.74, pose({ lean: 0.24, crouch: 0.07, head: 0.14, hipL: -0.22, kneeL: -0.18, hipR: 0.28, kneeR: -0.12, shoulderL: -2.0, elbowL: -1.3, wristL: -0.45, gripL: 1, shoulderR: 1.75, elbowR: -0.08, wristR: 0.15, gripR: -0.3 })],
  [RELEASE_AT, pose({ lean: -0.36, crouch: 0.12, head: -0.1, hipL: -0.36, kneeL: -0.25, hipR: 0.38, kneeR: -0.3, shoulderL: -4.0, elbowL: -0.12, wristL: -0.6, gripL: 0.15, shoulderR: 0.4, elbowR: 0.95, wristR: 0, gripR: 0.6 })],
  [0.98, pose({ lean: -0.5, crouch: 0.16, head: -0.12, hipL: -0.3, kneeL: -0.3, hipR: 0.36, kneeR: -0.36, shoulderL: -5.05, elbowL: 0.25, wristL: -0.2, gripL: 0, shoulderR: -0.2, elbowR: 1.0, wristR: 0, gripR: 0.5 })],
  [ATTACK_TIME, pose({ shoulderL: REST.shoulderL - Math.PI * 2 })],
];

export interface GnomeTarget {
  id: number;
  position: THREE.Vector3;
  height: number;
  alive: boolean;
}

interface Rig {
  root: THREE.Group;
  parts: Record<PartName, THREE.Group>;
  rest: Record<PartName, THREE.Vector3>;
  materials: THREE.MeshBasicMaterial[];
}

interface Scout {
  root: THREE.Group;
  rig: Rig;
  shadow: THREE.Mesh;
  tear: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  side: number;
  phase: number;
  nextThrow: number;
  emerge: number;
  tore: boolean;
  attack: number;
  attackTarget: GnomeTarget | null;
  facing: number;
  run: number;
  stride: number;
  glance: number;
  nextGlance: number;
  /** The rock being picked up or carried, before it is thrown. */
  rock: THREE.Mesh | null;
  cap: number;
  capVelocity: number;
  lastHead: number;
  lastRise: number;
}

interface Rock {
  mesh: THREE.Mesh;
  trail: Trail;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  targetId: number;
  age: number;
}

/** Map artwork pixels to rig space (origin at the feet, +y up). */
const rigPoint = (px: number, py: number) => new THREE.Vector3((px / FRAME_W - 0.5) * RIG_W, ((FEET_PX - py) / FRAME_H) * RIG_H, 0);

/** Render each `<g id>` of the gnome SVG into its own tightly cropped canvas. */
async function renderParts(url: string): Promise<Record<PartName, HTMLCanvasElement>> {
  const source = await (await fetch(url)).text();
  const defs = source.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? '';
  const out = {} as Record<PartName, HTMLCanvasElement>;
  await Promise.all(PARTS.map(async ({ name, rect: [x, y, w, h] }) => {
    const group = source.match(new RegExp(`<g id="${name}"[\\s\\S]*?<!--end ${name}-->`))?.[0] ?? '';
    const width = Math.round(w * TEXTURE_SCALE), height = Math.round(h * TEXTURE_SCALE);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${w} ${h}">${defs}${group}</svg>`;
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
      out[name] = canvas;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }));
  return out;
}

/** A craggy, faceted stone with its light baked in, so it reads in the dark wood. */
function rockGeometry(seed: number): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(ROCK_RADIUS, 1);
  const position = geometry.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    // Displace by direction so shared corners move together and the stone stays closed.
    const n = v.clone().normalize();
    const bump = 1 + 0.22 * Math.sin(n.x * 5.1 + seed) * Math.cos(n.y * 4.3 - seed * 0.7) + 0.12 * Math.sin(n.z * 9 + seed * 2);
    v.copy(n).multiplyScalar(ROCK_RADIUS * bump);
    v.y *= 0.78;
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);
  const light = new THREE.Vector3(-0.4, 0.85, 0.35).normalize();
  const stone = new THREE.Color('#857f70'), shade = new THREE.Color('#2f2d29'), moss = new THREE.Color('#5d7448');
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(normal, i);
    const lit = THREE.MathUtils.clamp(v.dot(light) * 0.6 + 0.45, 0, 1);
    c.copy(shade).lerp(stone, lit);
    if (v.y > 0.55 && Math.sin(i * 12.9898 + seed) > 0.2) c.lerp(moss, 0.55);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** A short-lived pair of illustrated woodland gnomes who tear out of the ground and pelt spirits with rocks. */
export class GnomeSummons {
  readonly group = new THREE.Group();
  /** One texture per variant per part; images arrive asynchronously. */
  private readonly textures: Array<Record<PartName, THREE.Texture>>;
  private readonly geometries: Record<PartName, THREE.PlaneGeometry>;
  private readonly scouts: Scout[] = [];
  private readonly rocks: Rock[] = [];
  private readonly tearGeometry = new THREE.CircleGeometry(1, 40);
  private readonly rockGeometries = [rockGeometry(1.3), rockGeometry(4.1), rockGeometry(7.7)];
  private readonly rockMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true });
  private readonly dust = new THREE.Color('#8a7b62');
  private readonly portalColor = new THREE.Color('#ffd166');
  private readonly dirt = [new THREE.Color('#3b2f22'), new THREE.Color('#57442c'), new THREE.Color('#2a2a1f')];
  private readonly stone = [new THREE.Color('#7d776a'), new THREE.Color('#5c574d'), new THREE.Color('#a39b88')];
  private camera = new THREE.Vector3();
  private readonly shadowGeometry = new THREE.CircleGeometry(0.5, 24);
  private readonly ray = new THREE.Ray();
  private readonly scratch = new THREE.Vector3();
  private readonly hitPoint = new THREE.Vector3();
  private readonly obstacles: readonly Obstacle[];
  private readonly intersectEnvironment: (ray: THREE.Ray, range: number) => number | null;
  private readonly current: Pose = { ...REST };
  /** Where a carried stone sits in the throwing hand: between the palm and the closing fingers. */
  private readonly grip = rigPoint(166, 540).sub(rigPoint(166, 515)).setZ(0.01);
  private age = 0;
  private elapsed = 0;
  private rockCount = 0;
  private preferredTarget: number | null = null;
  private focus = new THREE.Vector3();
  private disposed = false;

  constructor(
    obstacles: readonly Obstacle[],
    intersectEnvironment: (ray: THREE.Ray, range: number) => number | null,
    private readonly onHit: (targetId: number, point: THREE.Vector3) => void,
    private readonly particles?: ParticleSystem,
    private readonly mist?: ParticleSystem,
  ) {
    this.obstacles = obstacles;
    this.intersectEnvironment = intersectEnvironment;
    this.group.name = 'Rise · woodland gnomes';
    // Each part's plane is its crop, shifted so its own joint sits at the origin.
    this.geometries = Object.fromEntries(PARTS.map(({ name, rect: [x, y, w, h], pivot }) => {
      const geometry = new THREE.PlaneGeometry((w / FRAME_W) * RIG_W, (h / FRAME_H) * RIG_H);
      const center = rigPoint(x + w / 2, y + h / 2).sub(rigPoint(...pivot));
      geometry.translate(center.x, center.y, 0);
      return [name, geometry];
    })) as Record<PartName, THREE.PlaneGeometry>;
    this.textures = ['gnome-moss.svg', 'gnome-ember.svg'].map((file) => {
      const set = Object.fromEntries(PART_NAMES.map((part) => {
        const texture = new THREE.Texture();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 2;
        return [part, texture];
      })) as Record<PartName, THREE.Texture>;
      if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
        const url = new URL(`assets/summons/${file}`, document.baseURI).href;
        renderParts(url).then((canvases) => {
          for (const part of PART_NAMES) { set[part].image = canvases[part]; set[part].needsUpdate = true; }
        }).catch((error: unknown) => {
          console.warn('[arcane] gnome rig parts unavailable', error);
        });
      }
      return set;
    });
  }

  /** `origin` is the centre of the summoning circle on the ground; the pair tears out of it. */
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
      root.position.copy(origin).addScaledVector(right, side * 0.75);
      root.position.y = terrainHeight(root.position.x, root.position.z);
      const rig = this.buildRig(i);
      const shadowMaterial = new THREE.MeshBasicMaterial({ color: '#17332f', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const shadow = new THREE.Mesh(this.shadowGeometry, shadowMaterial);
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set(0.92, 0.42, 1);
      shadow.position.y = 0.025;
      const tear = new THREE.Mesh(this.tearGeometry, this.tearMaterial());
      tear.rotation.x = -Math.PI / 2;
      tear.position.y = 0.03;
      tear.renderOrder = 2;
      root.add(tear, shadow, rig.root);
      this.group.add(root);
      this.scouts.push({
        root, rig, shadow, tear, side, phase: i * Math.PI,
        nextThrow: 0.1 + i * 0.45, emerge: -i * 0.15, tore: false, attack: -1, attackTarget: null,
        facing: side, run: 0, stride: i * Math.PI, glance: 0, nextGlance: 1 + i, rock: null,
        cap: 0, capVelocity: 0, lastHead: 0, lastRise: 0,
      });
    }
  }

  update(dt: number, canAttack: boolean, player: THREE.Vector3, targets: readonly GnomeTarget[], reducedMotion = false): void {
    if (this.disposed) return;
    dt = Math.max(0, Math.min(dt, 0.05));
    this.camera.copy(player);
    // Rocks already in the air keep flying after the gnomes have gone.
    this.updateRocks(dt, targets);
    if (this.scouts.length === 0) return;
    this.elapsed += dt;
    this.age += dt;
    if (this.age >= GNOME_LIFETIME) { this.clearScouts(); return; }
    const sinking = THREE.MathUtils.smoothstep(this.age, GNOME_LIFETIME - SINK_TIME, GNOME_LIFETIME);

    const live = targets.filter((target) => target.alive);
    for (const scout of this.scouts) {
      scout.emerge += dt;
      const emerged = scout.emerge >= EMERGE_TIME && sinking === 0;
      this.animateTear(scout, dt);

      const preferred = live.find((target) => target.id === this.preferredTarget);
      const focus = preferred ?? live.reduce<GnomeTarget | null>((nearest, target) => {
        if (!nearest) return target;
        return target.position.distanceToSquared(this.focus) < nearest.position.distanceToSquared(this.focus) ? target : nearest;
      }, null);

      let moving = false;
      const target = focus ? this.visibleTarget(scout.root.position, focus, live) : null;
      if (focus && emerged && scout.attack < 0) {
        // Hold a throwing position between the caster and the spirit, flanking to either side.
        const toward = this.scratch.copy(focus.position).sub(player).setY(0);
        if (toward.lengthSq() < 0.01) toward.set(0, 0, -1);
        toward.normalize();
        const flank = new THREE.Vector3(toward.z, 0, -toward.x).multiplyScalar(scout.side * 2.4);
        const range = target && target.id === focus.id ? THROW_RANGE : 4.5;
        const destination = focus.position.clone().addScaledVector(toward, -range).add(flank);
        const offset = destination.sub(scout.root.position).setY(0);
        const distance = offset.length();
        // Already in range and in sight: plant your feet and throw rather than keep running.
        const inRange = target && scout.root.position.distanceTo(target.position) <= THROW_RANGE + 3;
        moving = distance > 1.2 && !inRange;
        if (moving) {
          offset.normalize().multiplyScalar(Math.min(GNOME_RUN_SPEED * dt, distance));
          moveOnGround(scout.root.position, offset.x, offset.z, this.obstacles);
          scout.root.position.y -= EYE_HEIGHT;
        }
      }
      scout.run += ((moving ? 1 : 0) - scout.run) * (1 - Math.exp(-dt * 10));
      scout.stride += dt * 12 * scout.run;

      // Face whichever way they are throwing (or running), as seen from the caster.
      const lookAt = scout.attackTarget?.position ?? target?.position ?? focus?.position;
      if (lookAt && scout.attack < 0.5) {
        const view = new THREE.Vector3().subVectors(scout.root.position, player).setY(0).normalize();
        const screenRight = new THREE.Vector3(-view.z, 0, view.x);
        const across = this.scratch.copy(lookAt).sub(scout.root.position).dot(screenRight);
        if (Math.abs(across) > 0.3) scout.facing = across > 0 ? 1 : -1;
      }

      scout.nextThrow = Math.max(0, scout.nextThrow - dt);
      if (emerged && scout.attack < 0 && canAttack && target && scout.nextThrow === 0 && !moving) {
        scout.attack = 0;
        scout.attackTarget = target;
      }
      if (scout.attack >= 0) {
        const before = scout.attack;
        scout.attack += dt;
        if (before < 0.02 && scout.attack >= 0.02) this.layRock(scout);
        if (before < GRAB_AT && scout.attack >= GRAB_AT) this.grabRock(scout);
        if (before < RELEASE_AT && scout.attack >= RELEASE_AT) {
          if (scout.attackTarget?.alive) this.hurl(scout, scout.attackTarget);
          else this.dropRock(scout);
          scout.nextThrow = THROW_COOLDOWN;
        }
        if (scout.attack >= ATTACK_TIME || sinking > 0) {
          if (sinking > 0) this.dropRock(scout);
          scout.attack = -1;
          scout.attackTarget = null;
        }
      }
      this.pose(scout, dt, sinking, reducedMotion);
    }
  }

  clear(): void {
    this.clearScouts();
    for (const rock of this.rocks) this.removeRock(rock);
    this.rocks.length = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    for (const set of this.textures) for (const part of PART_NAMES) set[part].dispose();
    for (const part of PART_NAMES) this.geometries[part].dispose();
    this.tearGeometry.dispose();
    for (const geometry of this.rockGeometries) geometry.dispose();
    this.rockMaterial.dispose();
    this.shadowGeometry.dispose();
    this.group.removeFromParent();
  }

  private clearScouts(): void {
    for (const scout of this.scouts) {
      this.group.remove(scout.root);
      (scout.shadow.material as THREE.Material).dispose();
      scout.tear.material.dispose();
      for (const material of scout.rig.materials) material.dispose();
    }
    this.scouts.length = 0;
    this.preferredTarget = null;
  }

  /* ─────────────────────────────── rig ─────────────────────────────── */

  private buildRig(variant: number): Rig {
    const root = new THREE.Group();
    const materials: THREE.MeshBasicMaterial[] = [];
    const parts = {} as Record<PartName, THREE.Group>;
    const rest = {} as Record<PartName, THREE.Vector3>;
    PARTS.forEach(({ name, pivot, parent }, layer) => {
      const joint = new THREE.Group();
      joint.name = name;
      joint.position.copy(rigPoint(...pivot)).sub(parent ? rigPoint(...PARTS.find((p) => p.name === parent)!.pivot) : new THREE.Vector3());
      rest[name] = joint.position.clone();
      const material = new THREE.MeshBasicMaterial({ map: this.textures[variant][name], alphaTest: 0.35, side: THREE.DoubleSide, fog: true, toneMapped: false, transparent: true, depthWrite: true });
      materials.push(material);
      const mesh = new THREE.Mesh(this.geometries[name], material);
      // Later parts sit a hair in front. Joints carry no depth, so this is each part's own layer.
      mesh.position.z = layer * 0.012;
      mesh.renderOrder = 3 + layer;
      joint.add(mesh);
      parts[name] = joint;
    });
    for (const { name, parent } of PARTS) (parent ? parts[parent] : root).add(parts[name]);
    return { root, parts, rest, materials };
  }

  /**
   * Procedural, deliberately cartoonish body language. A base pose (idle breathing, a run cycle,
   * the climb out of the ground) is overridden by the throw while one is under way.
   */
  private pose(scout: Scout, dt: number, sinking: number, reducedMotion: boolean): void {
    const { rig } = scout;
    const p = rig.parts;
    const t = this.elapsed;
    const motion = reducedMotion ? 0 : 1;

    // Billboard toward the caster around the vertical axis, mirrored to face the action.
    const dx = this.camera.x - scout.root.position.x, dz = this.camera.z - scout.root.position.z;
    rig.root.rotation.y = Math.atan2(dx, dz);

    // Emerging: hidden under the torn ground, then bursting up, arms first, and landing.
    const e = scout.emerge;
    let rise = 0, reach = 0, squash = 0;
    if (e < TEAR_AT) rise = -2.7;
    else if (e < 0.62) { const k = (e - TEAR_AT) / (0.62 - TEAR_AT); rise = -2.7 + (2.7 + 0.5) * (1 - Math.pow(1 - k, 3)); reach = 1; }
    else if (e < 0.82) { const k = (e - 0.62) / 0.2; rise = 0.5 * (1 - k * k); reach = 1 - k; }
    else if (e < EMERGE_TIME) { const k = (e - 0.82) / (EMERGE_TIME - 0.82); squash = Math.sin(k * Math.PI) * 0.16; }
    rise -= sinking * 2.7;

    // Base: breathing at rest, a stomping run, arms flung overhead while clambering out.
    const run = scout.run * motion;
    const s = Math.sin(scout.stride), c = Math.cos(scout.stride);
    const breathe = Math.sin(t * 2.4 + scout.phase) * motion;
    if (t > scout.nextGlance) { scout.glance = (Math.random() - 0.5) * 0.28; scout.nextGlance = t + 1.5 + Math.random() * 2.5; }
    const base = this.current;
    Object.assign(base, REST);
    base.lean = -0.2 * run + breathe * 0.015;
    base.head = scout.glance * (1 - run) + 0.1 * run;
    base.hipL = s * 0.7 * run; base.hipR = -s * 0.7 * run;
    base.kneeL = (-Math.max(0, -c) * 1.1 - 0.1) * run; base.kneeR = (-Math.max(0, c) * 1.1 - 0.1) * run;
    base.shoulderL += -s * 0.75 * run + breathe * 0.04; base.shoulderR += s * 0.75 * run - breathe * 0.04;
    base.elbowL += 0.9 * run; base.elbowR += 0.9 * run;
    base.gripL += 0.5 * run; base.gripR += 0.5 * run;
    if (reach > 0) {
      base.shoulderL = THREE.MathUtils.lerp(base.shoulderL, -2.75, reach); base.shoulderR = THREE.MathUtils.lerp(base.shoulderR, 2.75, reach);
      base.elbowL *= 1 - reach; base.elbowR *= 1 - reach; base.gripL = -0.3 * reach; base.gripR = -0.3 * reach;
      base.hipL = 0.25 * reach; base.kneeL = -0.6 * reach; base.hipR = -0.15 * reach; base.kneeR = -0.4 * reach;
    }

    // The throw takes over from the base pose (eased in over its first tenth of a second).
    const a = scout.attack;
    if (a >= 0) {
      const throwPose = sampleThrow(a);
      const w = THREE.MathUtils.smoothstep(a, 0, 0.1);
      for (const key of POSE_KEYS) base[key] = w >= 1 ? throwPose[key] : THREE.MathUtils.lerp(base[key], throwPose[key], w);
    }

    const bob = Math.abs(Math.sin(scout.stride)) * 0.08 * run;
    rig.root.position.y = rise + bob - base.crouch * 0.55;
    rig.root.scale.set(scout.facing * (1 + squash * 0.7), 1 - squash, 1);

    p.torso.rotation.z = base.lean;
    p.torso.scale.y = 1 + breathe * 0.015 * (1 - run);
    p.head.rotation.z = base.head - base.lean * 0.35;
    p.legL_up.rotation.z = base.hipL - base.lean * 0.2; p.legL_low.rotation.z = base.kneeL;
    p.legR_up.rotation.z = base.hipR - base.lean * 0.2; p.legR_low.rotation.z = base.kneeR;
    p.armL_up.rotation.z = base.shoulderL; p.armL_fore.rotation.z = base.elbowL; p.armL_hand.rotation.z = base.wristL;
    p.armR_up.rotation.z = base.shoulderR; p.armR_fore.rotation.z = base.elbowR; p.armR_hand.rotation.z = base.wristR;
    // Fingers close by curling toward the viewer (they foreshorten) and spread a little when open.
    for (const [fingers, grip] of [[p.armL_fingers, base.gripL], [p.armR_fingers, base.gripR]] as const) {
      fingers.scale.set(1 + Math.max(0, -grip) * 0.35, 1 - Math.max(0, grip) * 0.5, 1);
      fingers.rotation.z = -grip * 0.25;
    }
    // The floppy cap lags the head and bounces on landings and steps.
    const headTurn = p.head.rotation.z + p.torso.rotation.z;
    const headVelocity = dt > 0 ? (headTurn - scout.lastHead) / dt : 0;
    const riseVelocity = dt > 0 ? (rig.root.position.y - scout.lastRise) / dt : 0;
    scout.lastHead = headTurn; scout.lastRise = rig.root.position.y;
    if (dt > 0 && motion) {
      scout.capVelocity += (-scout.cap * 90 - scout.capVelocity * 7 - headVelocity * 4 + THREE.MathUtils.clamp(riseVelocity, -8, 8) * 0.6) * dt;
      scout.cap = THREE.MathUtils.clamp(scout.cap + scout.capVelocity * dt, -0.35, 0.35);
    }
    p.cap.rotation.z = scout.cap * motion;

    // A held rock settles into the throwing hand's grip.
    if (scout.rock && scout.rock.parent === p.armL_hand) {
      scout.rock.position.lerp(this.grip, 1 - Math.exp(-dt * 22));
    }

    const fade = 1 - sinking;
    for (const material of rig.materials) material.opacity = fade;
    rig.root.visible = rise > -2.65;
    (scout.shadow.material as THREE.MeshBasicMaterial).opacity = 0.26 * THREE.MathUtils.clamp((rise + 1) / 1, 0, 1) * fade;
  }

  /** The ground splits with glowing cracks, bursts with dirt as the gnome comes through, then heals. */
  private tearMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      uniforms: { uOpen: { value: 0 }, uGlow: { value: 1 }, uOpacity: { value: 0 }, uSeed: { value: Math.random() * 10 }, uColor: { value: this.portalColor.clone() } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uOpen; uniform float uGlow; uniform float uOpacity; uniform float uSeed; uniform vec3 uColor; varying vec2 vP;
        void main(){
          float r = length(vP), a = atan(vP.y, vP.x);
          // Jagged cracks racing outward, plus a dark split hole at the centre.
          float jag = sin(a * 7.0 + uSeed + sin(r * 11.0 + uSeed) * 0.9);
          float crack = (1.0 - smoothstep(0.0, 0.08, abs(fract(a * 6.0 / 6.2831853 + sin(r * 9.0 + uSeed) * 0.12) - 0.5) * r * 4.0))
                      * step(r, uOpen) * (1.0 - smoothstep(0.75, 1.0, r));
          float hole = 1.0 - smoothstep(0.15 * uOpen, 0.42 * uOpen + 0.02, r + jag * 0.04);
          vec3 c = mix(vec3(0.03, 0.025, 0.02), uColor * 1.8, crack * uGlow + hole * uGlow * 0.5);
          float alpha = max(hole * 0.92, crack * 0.95) * uOpacity;
          gl_FragColor = vec4(c, alpha);
        }`,
    });
  }

  private animateTear(scout: Scout, dt: number): void {
    const e = scout.emerge;
    const m = scout.tear.material.uniforms;
    m.uOpen.value = THREE.MathUtils.clamp(e / TEAR_AT, 0, 1) * (1 - THREE.MathUtils.smoothstep(e, 1.4, 2.4));
    m.uGlow.value = 1 - THREE.MathUtils.smoothstep(e, 0.5, 1.6);
    m.uOpacity.value = e < 0 ? 0 : 1 - THREE.MathUtils.smoothstep(e, 1.8, 2.6);
    scout.tear.visible = e >= 0 && e < 2.7;
    const p = scout.root.position;
    // Rumbling grit while the ground splits.
    if (e >= 0 && e < TEAR_AT && Math.random() < dt * 40) {
      this.mist?.emit({ x: p.x + (Math.random() - 0.5) * 0.8, y: p.y + 0.05, z: p.z + (Math.random() - 0.5) * 0.8, vx: 0, vy: 0.6 + Math.random(), vz: 0, color: this.dirt[0], size: 0.05, sizeEnd: 0.04, alpha: 0.9, ttl: 0.4, gravity: 6, style: 'spark' });
      this.particles?.emit({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + 0.05, z: p.z + (Math.random() - 0.5) * 0.5, vx: 0, vy: 1.2, vz: 0, color: this.portalColor, size: 0.07, sizeEnd: 0.01, ttl: 0.5, style: 'glow' });
    }
    if (!scout.tore && e >= TEAR_AT) {
      // The burst: clods of earth flung up, a dust cloud, sparks of the circle's light.
      scout.tore = true;
      const at = p.clone().setY(p.y + 0.15);
      for (let i = 0; i < 26; i++) {
        this.mist?.emit({
          x: at.x, y: at.y, z: at.z,
          vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 4,
          color: this.dirt[i % this.dirt.length], size: 0.08 + Math.random() * 0.08, sizeEnd: 0.07, alpha: 1, ttl: 0.9, gravity: 11, drag: 0.3, style: 'spark',
        });
      }
      this.mist?.burst(at, 10, { speed: 1.8, direction: new THREE.Vector3(0, 0.4, 0), spread: 2, color: new THREE.Color('#6b5d48'), size: 0.8, sizeEnd: 2, alpha: 0.4, ttl: 1.3, drag: 2, style: 'mist' });
      this.particles?.burst(at, 18, { speed: 3, direction: new THREE.Vector3(0, 1, 0), spread: 0.8, color: this.portalColor, size: 0.09, sizeEnd: 0.01, ttl: 0.7, drag: 1.5, style: 'spark' });
    }
  }

  /* ─────────────────────────────── combat ─────────────────────────────── */

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

  /** A loose stone at the gnome's toes, where both hands will reach for it. */
  private layRock(scout: Scout): void {
    const rock = new THREE.Mesh(this.rockGeometries[this.rockCount++ % this.rockGeometries.length], this.rockMaterial);
    rock.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    rock.position.copy(rigPoint(300, FEET_PX)).setY(ROCK_RADIUS * 0.7).setZ(0.25);
    rock.renderOrder = 20;
    scout.rig.root.add(rock);
    scout.rock = rock;
    const at = scout.root.position.clone().setY(scout.root.position.y + 0.1);
    this.mist?.burst(at, 4, { speed: 0.5, direction: new THREE.Vector3(0, 0.5, 0), spread: 1, color: this.dust, size: 0.35, sizeEnd: 0.8, alpha: 0.2, ttl: 0.7, drag: 2, style: 'mist' });
  }

  private grabRock(scout: Scout): void {
    if (!scout.rock) this.layRock(scout);
    scout.rig.root.updateWorldMatrix(true, true);
    scout.rig.parts.armL_hand.attach(scout.rock!);
    const at = scout.root.position.clone().setY(scout.root.position.y + 0.08);
    for (let i = 0; i < 6; i++) this.mist?.emit({ x: at.x, y: at.y, z: at.z, vx: (Math.random() - 0.5) * 1.4, vy: 0.8 + Math.random(), vz: (Math.random() - 0.5) * 1.4, color: this.dirt[i % 3], size: 0.05, sizeEnd: 0.04, alpha: 0.9, ttl: 0.5, gravity: 8, style: 'spark' });
  }

  private dropRock(scout: Scout): void {
    scout.rock?.removeFromParent();
    scout.rock = null;
  }

  /**
   * Let fly: the stone leaves the hand where the swing has carried it, on a true ballistic arc
   * timed to come down on the spirit's body.
   */
  private hurl(scout: Scout, target: GnomeTarget): void {
    if (!scout.rock) this.layRock(scout);
    const mesh = scout.rock!;
    scout.rock = null;
    scout.rig.root.updateWorldMatrix(true, true);
    this.group.attach(mesh);
    const start = mesh.position;
    const aim = target.position.clone();
    aim.y += Math.min(target.height * 0.55, 2.2);
    const distance = aim.distanceTo(start);
    const flight = THREE.MathUtils.clamp(distance / 12, 0.4, 0.95);
    const velocity = aim.sub(start).divideScalar(flight);
    velocity.y += 0.5 * ROCK_GRAVITY * flight;
    const trail = new Trail('#b9ab8c', 0.09, 0.2, 24, 0.35);
    this.group.add(trail.mesh);
    const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(14);
    this.rocks.push({ mesh, trail, velocity, spin, targetId: target.id, age: 0 });
    this.mist?.burst(start, 4, { speed: 0.6, color: this.dust, size: 0.25, sizeEnd: 0.6, alpha: 0.25, ttl: 0.5, drag: 2, style: 'mist' });
  }

  private updateRocks(dt: number, targets: readonly GnomeTarget[]): void {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i];
      rock.age += dt;
      const p = rock.mesh.position;
      const from = this.scratch.copy(p);
      rock.velocity.y -= ROCK_GRAVITY * dt;
      const step = rock.velocity.length() * dt;
      // Scenery in the way: it cracks against the bark or stone.
      if (step > 1e-5) {
        this.ray.set(from, rock.velocity.clone().normalize());
        const blocker = this.intersectEnvironment(this.ray, step);
        if (blocker !== null && blocker < step) {
          this.ray.at(blocker, p);
          this.shatter(p, 0.7);
          this.removeRock(rock); this.rocks.splice(i, 1); continue;
        }
      }
      p.addScaledVector(rock.velocity, dt);
      rock.mesh.rotation.x += rock.spin.x * dt; rock.mesh.rotation.y += rock.spin.y * dt; rock.mesh.rotation.z += rock.spin.z * dt;
      rock.trail.push(p);
      rock.trail.update(dt, this.camera);
      // Any living spirit it passes through takes the blow, not only the one it was thrown at.
      const struck = targets.find((target) => target.alive
        && Math.hypot(p.x - target.position.x, p.z - target.position.z) < 0.8
        && p.y > target.position.y + 0.1 && p.y < target.position.y + target.height);
      if (struck) {
        this.hitPoint.copy(p);
        this.shatter(this.hitPoint, 1);
        this.onHit(struck.id, this.hitPoint.clone());
        this.removeRock(rock); this.rocks.splice(i, 1); continue;
      }
      if (p.y < terrainHeight(p.x, p.z) + ROCK_RADIUS * 0.5 || rock.age > 3) {
        if (rock.age <= 3) this.shatter(p.setY(terrainHeight(p.x, p.z) + 0.05), 0.6);
        this.removeRock(rock); this.rocks.splice(i, 1);
      }
    }
  }

  /** Chips of stone, a puff of grit and a few sparks where the rock breaks. */
  private shatter(at: THREE.Vector3, force: number): void {
    for (let i = 0; i < 14; i++) {
      this.mist?.emit({
        x: at.x, y: at.y, z: at.z,
        vx: (Math.random() - 0.5) * 5 * force, vy: (1 + Math.random() * 3) * force, vz: (Math.random() - 0.5) * 5 * force,
        color: this.stone[i % this.stone.length], size: 0.05 + Math.random() * 0.06, sizeEnd: 0.05, alpha: 1, ttl: 0.8, gravity: 12, drag: 0.4, style: 'spark',
      });
    }
    this.mist?.burst(at, 6, { speed: 1.4 * force, color: this.dust, size: 0.5, sizeEnd: 1.4, alpha: 0.3, ttl: 0.9, drag: 2.2, style: 'mist' });
    this.particles?.burst(at, 8, { speed: 3 * force, color: this.portalColor, size: 0.05, sizeEnd: 0.01, ttl: 0.3, drag: 2, style: 'spark' });
  }

  private removeRock(rock: Rock): void {
    rock.mesh.removeFromParent();
    this.group.remove(rock.trail.mesh);
    rock.trail.dispose();
  }
}

/** The throw's pose at `a` seconds: smooth in and out of each key. */
function sampleThrow(a: number): Pose {
  let i = 0;
  while (i < THROW.length - 2 && a > THROW[i + 1][0]) i++;
  const [t0, p0] = THROW[i], [t1, p1] = THROW[i + 1];
  const k = THREE.MathUtils.smoothstep(a, t0, t1);
  const out = { ...p0 };
  for (const key of POSE_KEYS) out[key] = p0[key] + (p1[key] - p0[key]) * k;
  return out;
}
