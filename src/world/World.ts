import * as THREE from 'three';
import type { SpellDef } from '../config/spells.ts';
import type { HandSide } from '../tracking/types.ts';
import { Boss, disposeModel } from './Boss.ts';
import { EnemyCombat } from './EnemyCombat.ts';
import { createSpellAnimation, type SpellAnimation } from './effects.ts';
import { ParticleSystem } from './particles.ts';
import { makeLabelTexture } from './textures.ts';
import { ForestEnvironment } from './ForestEnvironment.ts';
import { ExplorationControls } from './ExplorationControls.ts';
import { GUARDIAN, SPELL_RANGE, chooseRayTarget, screenPointAtDepth, terrainHeight } from './spatial.ts';

interface FloatingLabel {
  sprite: THREE.Sprite;
  age: number;
}

interface Wisp {
  side: HandSide;
  /** A deliberately quiet aim marker, one per detected hand. */
  marker: THREE.Group;
  material: THREE.LineBasicMaterial;
  cursor: { x: number; y: number } | null;
  charge: number;
  chargeColor: THREE.Color;
  /** Resting colour; the left wisp is a touch cooler so the two hands read apart. */
  baseTint: THREE.Color;
  target: THREE.Vector3;
  idlePhase: number;
}

const CURSOR_DEPTH = 7;
const LABEL_LIFETIME = 2.2;
const SIDES: HandSide[] = ['left', 'right'];
const LEFT_TINT = '#b9dcff';
const RIGHT_TINT = '#d9ccff';

/** A living, walkable forest. Hand tracking and spells share one physical world. */
export class World {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(64, 1, 0.15, 240);
  private readonly environment: ForestEnvironment;
  private readonly controls: ExplorationControls;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly particles: ParticleSystem;
  private readonly wisps: Record<HandSide, Wisp>;
  private readonly labels: FloatingLabel[] = [];
  private readonly spellAnimations: SpellAnimation[] = [];
  private readonly enemies: EnemyCombat[] = [];
  private readonly container: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly scratch = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();

  private idleTime = 0;
  private raf = 0;
  private running = false;
  private disposed = false;
  private boss: Boss | null = null;
  private bossEnemy: EnemyCombat | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setClearColor('#83bdb5');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.environment = new ForestEnvironment(this.scene);
    const obstacles = [...this.environment.obstacles, { ...GUARDIAN, radius: 3.1, height: 6 }];
    this.controls = new ExplorationControls(this.camera, this.renderer.domElement, obstacles);

    this.particles = new ParticleSystem(6000, pixelRatio);
    this.scene.add(this.particles.points);

    void this.loadBoss();

    this.wisps = {
      left: this.makeWisp('left'),
      right: this.makeWisp('right'),
    };

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.clock.start();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.frame(Math.min(this.clock.getDelta(), 0.05));
    };
    loop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.environment.dispose();
    for (const label of this.labels) {
      this.scene.remove(label.sprite);
      label.sprite.material.map?.dispose();
      label.sprite.material.dispose();
    }
    this.labels.length = 0;
    for (const side of SIDES) {
      this.wisps[side].marker.traverse((object) => {
        if (object instanceof THREE.Line) object.geometry.dispose();
      });
      this.wisps[side].material.dispose();
      this.scene.remove(this.wisps[side].marker);
    }
    this.particles.dispose();
    for (const animation of this.spellAnimations) {
      this.scene.remove(animation.group);
      animation.dispose();
    }
    this.spellAnimations.length = 0;
    for (const enemy of this.enemies) enemy.dispose();
    this.enemies.length = 0;
    this.bossEnemy = null;
    this.boss?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /** Palm positions on screen (0..1). Missing sides fade out in place so the marker never jumps. */
  setCursors(cursors: Partial<Record<HandSide, { x: number; y: number } | null>>): void {
    for (const side of SIDES) this.wisps[side].cursor = cursors[side] ?? null;
  }

  /** 0..1 build-up while a hand shape is being held; tints the matching marker. */
  setCharge(progress: number, color?: string, side?: HandSide | 'both'): void {
    for (const s of SIDES) this.wisps[s].charge = 0;
    const targets: HandSide[] = side === 'left' || side === 'right' ? [side] : SIDES;
    for (const s of targets) {
      this.wisps[s].charge = progress;
      if (color) this.wisps[s].chargeColor.set(color);
    }
  }

  /** Charge each hand separately (one or two tracked hands can hold different signs at once). */
  setCharges(charges: Partial<Record<HandSide, { progress: number; color?: string } | null>>): void {
    for (const s of SIDES) {
      const c = charges[s];
      this.wisps[s].charge = c?.progress ?? 0;
      if (c?.color) this.wisps[s].chargeColor.set(c.color);
    }
  }

  /** Numeric demos aim through the crosshair; hand casts follow their own marker. */
  cast(spell: SpellDef, from?: HandSide | 'both', detail?: string): void {
    if (this.disposed) return;
    this.camera.updateMatrixWorld(true);
    this.scene.updateMatrixWorld(true);
    const color = new THREE.Color(spell.color);
    const origin = this.castOrigin(from).clone();
    const { point: target, enemy } = this.selectSpellTarget(origin);
    const animation = createSpellAnimation(spell.effect, origin, target, color, detail, {
      groundY: terrainHeight(target.x, target.z),
      cameraQuaternion: this.camera.quaternion,
    });
    animation.setImpactCallback(() => {
      if (!enemy?.impact(spell.effect, target, color)) return;
      if (enemy === this.bossEnemy) {
        this.boss?.react(spell.effect, target);
        this.boss?.flash(spell.color);
      }
    });
    this.scene.add(animation.group);
    this.spellAnimations.push(animation);
    this.spawnLabel(spell.name, spell.color, origin);
  }

  /** Register an already-placed enemy model. The returned function unregisters its reactions. */
  registerEnemy(root: THREE.Object3D): () => void {
    const enemy = this.addEnemy(root);
    return () => this.removeEnemy(enemy);
  }

  /* ─────────────────────────────── internals ─────────────────────────────── */


  private async loadBoss(): Promise<void> {
    const canvas = this.renderer.domElement;
    canvas.dataset.boss = 'loading';
    try {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      if (this.disposed) return;
      const url = new URL('assets/boss/balrog-mystic.glb', document.baseURI).href;
      const model = await new GLTFLoader().loadAsync(url);
      if (this.disposed) {
        disposeModel(model.scene);
        return;
      }
      this.boss = new Boss(model.scene, undefined, model.animations);
      this.bossEnemy = this.addEnemy(model.scene);
      // Stable metre-scale placement: resizing or walking must never refit the enemy.
      this.boss.group.position.set(GUARDIAN.x, terrainHeight(GUARDIAN.x, GUARDIAN.z) + 0.02, GUARDIAN.z);
      this.boss.group.scale.setScalar(1);
      model.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      this.scene.add(this.boss.group);
      this.scene.updateMatrixWorld(true);
      canvas.dataset.boss = 'ready';
    } catch (error) {
      if (this.disposed) return;
      canvas.dataset.boss = 'error';
      // Loading a scenery asset must never block the Begin button or hand tracking.
      console.warn('[arcane] Balrog could not load; casting remains available.', error);
    }
  }

  private makeWisp(side: HandSide): Wisp {
    const material = new THREE.LineBasicMaterial({
      color: side === 'left' ? LEFT_TINT : RIGHT_TINT,
      transparent: true,
      opacity: 0,
    });
    const marker = new THREE.Group();
    const ring: number[] = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      ring.push(Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0);
    }
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
    marker.add(new THREE.LineLoop(ringGeometry, material));
    const crossGeometry = new THREE.BufferGeometry();
    crossGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.65, 0, 0, -0.19, 0, 0,
      0.19, 0, 0, 0.65, 0, 0,
      0, -0.65, 0, 0, -0.19, 0,
      0, 0.19, 0, 0, 0.65, 0,
    ], 3));
    marker.add(new THREE.LineSegments(crossGeometry, material));
    marker.scale.setScalar(0.72);
    this.scene.add(marker);
    return {
      side,
      marker,
      material,
      cursor: null,
      charge: 0,
      chargeColor: new THREE.Color('#ffffff'),
      baseTint: new THREE.Color(side === 'left' ? LEFT_TINT : RIGHT_TINT),
      target: new THREE.Vector3(),
      idlePhase: side === 'left' ? 1.7 : 0,
    };
  }

  private addEnemy(root: THREE.Object3D): EnemyCombat {
    const enemy = new EnemyCombat(root);
    this.enemies.push(enemy);
    return enemy;
  }

  private removeEnemy(enemy: EnemyCombat): void {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    this.enemies.splice(index, 1);
    if (this.bossEnemy === enemy) this.bossEnemy = null;
    enemy.dispose();
  }

  private spawnLabel(text: string, color: string, origin: THREE.Vector3): void {
    const material = new THREE.SpriteMaterial({
      map: makeLabelTexture(text, color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3.6, 0.9, 1);
    this.camera.getWorldDirection(this.scratch);
    sprite.position.copy(origin).addScaledVector(this.scratch, 5);
    sprite.position.y += 0.7;
    this.scene.add(sprite);
    this.labels.push({ sprite, age: 0 });
  }

  private castOrigin(from?: HandSide | 'both'): THREE.Vector3 {
    const l = this.wisps.left;
    const r = this.wisps.right;
    if (from === 'left' && l.cursor) return l.marker.position;
    if (from === 'right' && r.cursor) return r.marker.position;
    if (from === 'both' && l.cursor && r.cursor) return this.mid.copy(l.marker.position).add(r.marker.position).multiplyScalar(0.5);
    if (from && l.cursor) return l.marker.position;
    if (from && r.cursor) return r.marker.position;
    // No hand (or a numeric demo): always use the present camera, never a stale cursor.
    screenPointAtDepth(this.camera, 0.5, 0.5, 2, this.mid);
    return this.mid;
  }

  private selectSpellTarget(origin: THREE.Vector3): { point: THREE.Vector3; enemy: EnemyCombat | null } {
    const ray = new THREE.Ray(this.camera.position.clone(), origin.clone().sub(this.camera.position).normalize());
    return chooseRayTarget(ray, SPELL_RANGE, this.environment.intersect(ray, SPELL_RANGE), this.enemies,
      (enemy, aim, point) => enemy.intersectRay(aim, point));
  }

  private cursorToWorld(c: { x: number; y: number }, out: THREE.Vector3): THREE.Vector3 {
    screenPointAtDepth(this.camera, c.x, c.y, CURSOR_DEPTH, out);
    return out;
  }

  private frame(dt: number): void {
    const t = this.clock.elapsedTime;
    this.idleTime += dt;
    this.controls.update(dt);
    this.environment.update(dt, this.camera, this.reducedMotion.matches);
    const anyHand = SIDES.some((side) => this.wisps[side].cursor !== null);
    for (const side of SIDES) this.updateWisp(this.wisps[side], dt, t, anyHand);

    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.age += dt;
      const u = l.age / LABEL_LIFETIME;
      l.sprite.position.y += dt * 0.55;
      l.sprite.material.opacity = Math.max(0, 1 - u * u);
      if (u >= 1) {
        this.scene.remove(l.sprite);
        l.sprite.material.map?.dispose();
        l.sprite.material.dispose();
        this.labels.splice(i, 1);
      }
    }

    for (let i = this.spellAnimations.length - 1; i >= 0; i--) {
      const animation = this.spellAnimations[i];
      if (animation.update(dt)) continue;
      this.scene.remove(animation.group);
      animation.dispose();
      this.spellAnimations.splice(i, 1);
    }

    this.particles.update(dt);
    for (const enemy of this.enemies) enemy.update(dt);
    if (this.bossEnemy) this.boss?.setFrostAmount(this.bossEnemy.frostAmount);
    this.boss?.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * One crosshair per hand. A tracked hand pulls its crosshair to the palm. When a hand drops
   * out, its marker fades in place rather than drifting or jumping.
   */
  private updateWisp(w: Wisp, dt: number, t: number, anyHand: boolean): void {
    const has = w.cursor !== null;
    if (has) {
      this.cursorToWorld(w.cursor!, w.target);
    }
    // LandmarkSmoother already filters the camera signal. Keep only a short render-side
    // interpolation so 30fps input looks fluid at 60fps without stacking another long lag.
    w.marker.position.lerp(w.target, 1 - Math.exp(-dt * (has ? 32 : 2)));

    w.marker.quaternion.copy(this.camera.quaternion);
    w.marker.scale.setScalar(0.72 + w.charge * 0.38);
    const goal = has ? 0.95 : 0;
    w.material.opacity += (goal - w.material.opacity) * (1 - Math.exp(-dt * 6));
    w.material.color.copy(w.baseTint).lerp(w.chargeColor, w.charge);

    // A faint trail lets a moving marker read clearly without becoming a cloudy cursor.
    if (w.material.opacity < 0.05) return;
    const p = w.marker.position;
    for (let i = 0; i < (has ? 2 : 1); i++) {
      this.particles.emit({
        x: p.x + (Math.random() - 0.5) * 0.2,
        y: p.y + (Math.random() - 0.5) * 0.2,
        z: p.z,
        vx: (Math.random() - 0.5) * 0.5,
        vy: Math.random() * 0.4,
        vz: (Math.random() - 0.5) * 0.5,
        color: w.material.color,
        size: 0.14 + w.charge * 0.2,
        ttl: 0.7,
      });
    }
  }

  private resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
}
