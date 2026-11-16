import * as THREE from 'three';
import type { ParticleSystem } from './particles.ts';
import { EYE_HEIGHT, moveOnGround, terrainHeight, type Obstacle } from './spatial.ts';
import { Trail, glowSprite } from './vfx.ts';

export const GNOME_LIFETIME = 10;
export const GNOME_ATTACK_RANGE = 35;
export const GNOME_RUN_SPEED = 6;
const SHOT_INTERVAL = 1.15;
const BOLT_SPEED = 17;
/** Ground tears open, the gnome bursts out, falls back and lands, then may move or shoot. */
const EMERGE_TIME = 1.0;
const TEAR_AT = 0.3;
/** At the end of their time they sink back into the earth. */
const SINK_TIME = 0.7;
/** Attack beats: raise and sight, loose the bolt, recoil, then a dip to reload. */
const ATTACK_TIME = 0.95;
const RELEASE_AT = 0.28;
/** Preferred shooting distance from the target; they hold here instead of charging past it. */
const SHOOT_RANGE = 8.5;
/** Artwork frame (px) and its size in the world (m). */
const FRAME_W = 512;
const FRAME_H = 768;
const RIG_W = 1.72;
const RIG_H = 2.58;
/** The boots touch the ground here in the artwork. */
const FEET_PX = 705;

type PartName = 'legL' | 'legR' | 'torso' | 'arms' | 'head' | 'bow';
const PART_ORDER: PartName[] = ['legL', 'legR', 'torso', 'arms', 'head', 'bow'];
/** Pivot of each part in artwork pixels: hips, waist, shoulders, neck. The bow rides on the arms. */
const PIVOTS: Record<PartName, [number, number]> = {
  legL: [210, 595], legR: [305, 595], torso: [256, 650], arms: [256, 420], head: [250, 430], bow: [256, 420],
};
/** The crossbow tip in the artwork (the gnomes face screen-right). */
const MUZZLE_PX: [number, number] = [441, 457];

export interface GnomeTarget {
  id: number;
  position: THREE.Vector3;
  height: number;
  alive: boolean;
}

interface Rig {
  root: THREE.Group;
  parts: Record<PartName, THREE.Group>;
  muzzle: THREE.Object3D;
  materials: THREE.MeshBasicMaterial[];
}

interface Scout {
  root: THREE.Group;
  rig: Rig;
  shadow: THREE.Mesh;
  tear: THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  side: number;
  phase: number;
  nextShot: number;
  emerge: number;
  tore: boolean;
  attack: number;
  attackTarget: GnomeTarget | null;
  facing: number;
  run: number;
  recoil: number;
  glance: number;
  nextGlance: number;
}

interface Bolt {
  group: THREE.Group;
  trail: Trail;
  targetId: number;
  age: number;
}

/** Map artwork pixels to rig space (origin at the feet, +y up). */
const rigPoint = (px: number, py: number) => new THREE.Vector3((px / FRAME_W - 0.5) * RIG_W, ((FEET_PX - py) / FRAME_H) * RIG_H, 0);

/**
 * Split a gnome SVG into rig parts by its own section comments, and render each part as a full,
 * aligned frame so the pieces layer perfectly and can pivot without visible seams.
 */
async function renderParts(url: string): Promise<Record<PartName, HTMLCanvasElement>> {
  const source = await (await fetch(url)).text();
  const open = source.match(/<svg[^>]*>/)?.[0] ?? `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_W}" height="${FRAME_H}" viewBox="0 0 ${FRAME_W} ${FRAME_H}">`;
  const defs = source.match(/<defs>[\s\S]*?<\/defs>/)?.[0] ?? '';
  const pieces = source.replace(/<\/svg>\s*$/, '').split(/<!--\s*([\s\S]*?)\s*-->/);
  const groups: Record<'legs' | 'torso' | 'arms' | 'head' | 'bow', string[]> = { legs: [], torso: [], arms: [], head: [], bow: [] };
  for (let i = 1; i < pieces.length; i += 2) {
    const name = pieces[i].toLowerCase();
    const body = pieces[i + 1] ?? '';
    const key = /face|head|cap/.test(name) ? 'head'
      : /crossbow|\bbow\b/.test(name) ? 'bow'
        : /boot|trouser|legging/.test(name) ? 'legs'
          : /coat|belt|charm/.test(name) ? 'torso'
            : /\barms?\b/.test(name) ? 'arms' : 'torso';
    groups[key].push(body);
  }
  const clip = '<clipPath id="gL"><rect x="-50" y="-50" width="306" height="950"/></clipPath><clipPath id="gR"><rect x="256" y="-50" width="320" height="950"/></clipPath>';
  const svgs: Record<PartName, string> = {
    legL: `${open}${defs}<defs>${clip}</defs><g clip-path="url(#gL)">${groups.legs.join('')}</g></svg>`,
    legR: `${open}${defs}<defs>${clip}</defs><g clip-path="url(#gR)">${groups.legs.join('')}</g></svg>`,
    torso: `${open}${defs}${groups.torso.join('')}</svg>`,
    arms: `${open}${defs}${groups.arms.join('')}</svg>`,
    head: `${open}${defs}${groups.head.join('')}</svg>`,
    bow: `${open}${defs}${groups.bow.join('')}</svg>`,
  };
  const out = {} as Record<PartName, HTMLCanvasElement>;
  await Promise.all(PART_ORDER.map(async (part) => {
    const blob = new Blob([svgs[part]], { type: 'image/svg+xml' });
    const objectUrl = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      canvas.height = 576;
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      out[part] = canvas;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }));
  return out;
}

/** A short-lived pair of illustrated woodland rangers who tear out of the ground and shoot. */
export class GnomeSummons {
  readonly group = new THREE.Group();
  /** One texture per variant per part; images arrive asynchronously. */
  private readonly textures: Array<Record<PartName, THREE.Texture>>;
  private readonly scouts: Scout[] = [];
  private readonly bolts: Bolt[] = [];
  private readonly partGeometry = new THREE.PlaneGeometry(RIG_W, RIG_H);
  private readonly tearGeometry = new THREE.CircleGeometry(1, 40);
  private readonly boltGeometry = new THREE.ConeGeometry(0.075, 0.28, 6);
  private readonly boltShaft = new THREE.CylinderGeometry(0.025, 0.038, 0.22, 6);
  private readonly boltMaterial = new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false });
  private readonly sparkColor = new THREE.Color('#ffd98f');
  private readonly portalColor = new THREE.Color('#ffd166');
  private readonly dirt = [new THREE.Color('#3b2f22'), new THREE.Color('#57442c'), new THREE.Color('#2a2a1f')];
  private camera = new THREE.Vector3();
  private readonly shadowGeometry = new THREE.CircleGeometry(0.5, 24);
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
    private readonly mist?: ParticleSystem,
  ) {
    this.obstacles = obstacles;
    this.intersectEnvironment = intersectEnvironment;
    this.group.name = 'Rise · woodland gnome rangers';
    this.partGeometry.translate(0, RIG_H / 2 - ((FRAME_H - FEET_PX) / FRAME_H) * RIG_H, 0);
    this.textures = ['gnome-moss.svg', 'gnome-ember.svg'].map((file) => {
      const set = Object.fromEntries(PART_ORDER.map((part) => {
        const texture = new THREE.Texture();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 2;
        return [part, texture];
      })) as Record<PartName, THREE.Texture>;
      if (typeof document !== 'undefined' && typeof fetch !== 'undefined') {
        const url = new URL(`assets/summons/${file}`, document.baseURI).href;
        renderParts(url).then((canvases) => {
          for (const part of PART_ORDER) { set[part].image = canvases[part]; set[part].needsUpdate = true; }
        }).catch((error: unknown) => {
          // Fall back to the whole illustration on one part so the summon still appears.
          console.warn('[arcane] gnome rig parts unavailable; using the flat illustration', error);
          new THREE.ImageLoader().load(url, (image) => { set.torso.image = image; set.torso.needsUpdate = true; });
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
        nextShot: 0.15 + i * 0.4, emerge: -i * 0.15, tore: false, attack: -1, attackTarget: null,
        facing: side, run: 0, recoil: 0, glance: 0, nextGlance: 1 + i,
      });
    }
  }

  update(dt: number, canAttack: boolean, player: THREE.Vector3, targets: readonly GnomeTarget[], reducedMotion = false): void {
    if (this.disposed || this.scouts.length === 0) return;
    dt = Math.max(0, Math.min(dt, 0.05));
    this.camera.copy(player);
    this.elapsed += dt;
    this.age += dt;
    if (this.age >= GNOME_LIFETIME) { this.clear(); return; }
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
      scout.run += ((moving ? 1 : 0) - scout.run) * (1 - Math.exp(-dt * 10));

      // Face whichever way they are shooting (or running), as seen from the caster.
      const lookAt = scout.attackTarget?.position ?? target?.position ?? focus?.position;
      if (lookAt) {
        const view = new THREE.Vector3().subVectors(scout.root.position, player).setY(0).normalize();
        const screenRight = new THREE.Vector3(-view.z, 0, view.x);
        const across = this.scratch.copy(lookAt).sub(scout.root.position).dot(screenRight);
        if (Math.abs(across) > 0.3) scout.facing = across > 0 ? 1 : -1;
      }

      scout.nextShot = Math.max(0, scout.nextShot - dt);
      if (emerged && scout.attack < 0 && canAttack && target && scout.nextShot === 0 && !moving) {
        scout.attack = 0;
        scout.attackTarget = target;
      }
      if (scout.attack >= 0) {
        const before = scout.attack;
        scout.attack += dt;
        if (before < RELEASE_AT && scout.attack >= RELEASE_AT && scout.attackTarget?.alive) {
          this.fire(scout, scout.attackTarget);
          scout.nextShot = SHOT_INTERVAL;
          scout.recoil = 1;
        }
        if (scout.attack >= ATTACK_TIME) { scout.attack = -1; scout.attackTarget = null; }
      }
      scout.recoil *= Math.exp(-dt * 8);
      this.pose(scout, dt, sinking, reducedMotion);
    }
    this.updateBolts(dt, targets);
  }

  clear(): void {
    for (const scout of this.scouts) {
      this.group.remove(scout.root);
      (scout.shadow.material as THREE.Material).dispose();
      scout.tear.material.dispose();
      for (const material of scout.rig.materials) material.dispose();
    }
    this.scouts.length = 0;
    for (const bolt of this.bolts) this.removeBolt(bolt);
    this.bolts.length = 0;
    this.preferredTarget = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    for (const set of this.textures) for (const part of PART_ORDER) set[part].dispose();
    this.partGeometry.dispose();
    this.tearGeometry.dispose();
    this.boltGeometry.dispose();
    this.boltShaft.dispose();
    this.boltMaterial.dispose();
    this.shadowGeometry.dispose();
    this.group.removeFromParent();
  }

  /* ─────────────────────────────── rig ─────────────────────────────── */

  private buildRig(variant: number): Rig {
    const root = new THREE.Group();
    const materials: THREE.MeshBasicMaterial[] = [];
    const parts = {} as Record<PartName, THREE.Group>;
    const pivots = Object.fromEntries(PART_ORDER.map((part) => [part, rigPoint(...PIVOTS[part])])) as Record<PartName, THREE.Vector3>;
    const parentOf: Record<PartName, PartName | null> = { legL: null, legR: null, torso: null, arms: 'torso', head: 'torso', bow: 'arms' };
    PART_ORDER.forEach((part, layer) => {
      const pivot = new THREE.Group();
      const parent = parentOf[part];
      pivot.position.copy(pivots[part]).sub(parent ? pivots[parent] : new THREE.Vector3());
      const material = new THREE.MeshBasicMaterial({ map: this.textures[variant][part], alphaTest: 0.35, side: THREE.DoubleSide, fog: true, toneMapped: false, transparent: true, depthWrite: true });
      materials.push(material);
      const mesh = new THREE.Mesh(this.partGeometry, material);
      // The plane is authored around the feet; shift it so this part turns about its own joint.
      mesh.position.copy(pivots[part]).negate();
      mesh.position.z = layer * 0.012;
      mesh.renderOrder = 3 + layer;
      pivot.add(mesh);
      parts[part] = pivot;
    });
    for (const part of PART_ORDER) (parentOf[part] ? parts[parentOf[part]!] : root).add(parts[part]);
    const muzzle = new THREE.Object3D();
    muzzle.position.copy(rigPoint(...MUZZLE_PX)).sub(pivots.arms);
    muzzle.position.z = 0.1;
    parts.arms.add(muzzle);
    return { root, parts, muzzle, materials };
  }

  /** Procedural, deliberately cartoonish body language. */
  private pose(scout: Scout, dt: number, sinking: number, reducedMotion: boolean): void {
    const { rig } = scout;
    const p = rig.parts;
    const t = this.elapsed;
    const motion = reducedMotion ? 0 : 1;

    // Billboard toward the caster around the vertical axis, mirrored to face the action.
    const dx = this.camera.x - scout.root.position.x, dz = this.camera.z - scout.root.position.z;
    rig.root.rotation.y = Math.atan2(dx, dz);
    rig.root.scale.x = scout.facing;

    // Emerging: hidden under the torn ground, then bursting up, arms first, and landing.
    const e = scout.emerge;
    let rise = 0, reach = 0, squash = 0;
    if (e < TEAR_AT) rise = -2.7;
    else if (e < 0.62) { const k = (e - TEAR_AT) / (0.62 - TEAR_AT); rise = -2.7 + (2.7 + 0.5) * (1 - Math.pow(1 - k, 3)); reach = 1; }
    else if (e < 0.82) { const k = (e - 0.62) / 0.2; rise = 0.5 * (1 - k * k); reach = 1 - k; }
    else if (e < EMERGE_TIME) { const k = (e - 0.82) / (EMERGE_TIME - 0.82); squash = Math.sin(k * Math.PI) * 0.16; }
    rise -= sinking * 2.7;

    const run = scout.run * motion;
    const stride = Math.sin(t * 13 + scout.phase);
    const a = scout.attack;
    const aiming = a >= 0 && a < RELEASE_AT ? THREE.MathUtils.smoothstep(a, 0, RELEASE_AT) : a >= RELEASE_AT ? 1 - THREE.MathUtils.smoothstep(a, RELEASE_AT + 0.15, ATTACK_TIME) : 0;
    const reload = a >= RELEASE_AT + 0.25 ? Math.sin(THREE.MathUtils.clamp((a - RELEASE_AT - 0.25) / (ATTACK_TIME - RELEASE_AT - 0.25), 0, 1) * Math.PI) : 0;
    const recoil = scout.recoil;
    const breathe = Math.sin(t * 2.4 + scout.phase) * motion;

    // Glance around now and then while idle.
    if (t > scout.nextGlance) { scout.glance = (Math.random() - 0.5) * 0.3; scout.nextGlance = t + 1.5 + Math.random() * 2.5; }
    const idle = (1 - run) * (1 - aiming);

    rig.root.position.y = rise + Math.abs(stride) * 0.07 * run;
    rig.root.scale.y = 1 - squash + recoil * 0.03;
    rig.root.scale.x = scout.facing * (1 + squash * 0.7);

    // Legs stride when running, brace apart to shoot, kick under them while climbing out.
    p.legL.rotation.z = stride * 0.55 * run + aiming * 0.12 + reach * 0.25;
    p.legR.rotation.z = -stride * 0.55 * run - aiming * 0.12 - reach * 0.25;
    // Torso leans into a run, into the aim, then rocks back on the recoil; it breathes at rest.
    p.torso.rotation.z = -0.14 * run - 0.05 * aiming + 0.17 * recoil + Math.sin(t * 13 * 2) * 0.02 * run;
    p.torso.scale.y = 1 + breathe * 0.018 * idle;
    // Arms: pump when running, lift the crossbow to sight, kick up on release, dip to reload,
    // and reach up overhead while hauling themselves out of the ground.
    p.arms.rotation.z = stride * 0.14 * run + 0.13 * aiming + 0.45 * recoil - 0.38 * reload + 1.15 * reach + breathe * 0.03 * idle;
    p.arms.position.y = (rigPoint(...PIVOTS.arms).y - rigPoint(...PIVOTS.torso).y) - reload * 0.05;
    // Head: bob against the stride, dip to sight, jolt on the shot, glance about when idle.
    p.head.rotation.z = -Math.abs(stride) * 0.05 * run - 0.07 * aiming + 0.14 * recoil + scout.glance * idle + reach * 0.2;

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

  private fire(scout: Scout, target: GnomeTarget): void {
    const group = new THREE.Group();
    const tip = new THREE.Mesh(this.boltGeometry, this.boltMaterial);
    tip.position.y = 0.14;
    const shaft = new THREE.Mesh(this.boltShaft, this.boltMaterial);
    shaft.position.y = -0.05;
    const halo = glowSprite('#ffcf7a', 0.85, undefined, 0.9);
    group.add(tip, shaft, halo);
    // Loose the bolt from the crossbow tip as the rig currently holds it.
    scout.rig.root.updateWorldMatrix(true, true);
    scout.rig.muzzle.getWorldPosition(group.position);
    const trail = new Trail('#ffc96f', 0.14, 0.24, 28, 1);
    this.group.add(group, trail.mesh);
    this.particles?.burst(group.position, 16, { speed: 2.4, color: this.sparkColor, size: 0.07, ttl: 0.35, drag: 3, style: 'spark' });
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
