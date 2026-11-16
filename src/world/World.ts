import * as THREE from 'three';
import type { SpellDef } from '../config/spells.ts';
import type { HandSide } from '../tracking/types.ts';
import { ScreenFX } from '../ui/ScreenFX.ts';
import { Encounter } from './Encounter.ts';
import { EnemyCombat } from './EnemyCombat.ts';
import { createSpellAnimation, type SpellAnimation } from './effects.ts';
import { GameEvents } from './events.ts';
import { ParticleSystem } from './particles.ts';
import { PostFX } from './PostFX.ts';
import { makeLabelTexture } from './textures.ts';
import { ForestEnvironment } from './ForestEnvironment.ts';
import { FrameBudget } from './FrameBudget.ts';
import { CasterView, worldInputBlocked } from './CasterView.ts';
import { aimAssistRadius, SPELL_RANGE, chooseRayTarget, screenPointAtDepth, terrainHeight } from './spatial.ts';
import type { ScreenFeedback } from './vfx.ts';

interface FloatingLabel {
  sprite: THREE.Sprite;
  age: number;
}

interface Wisp {
  side: HandSide;
  /** A deliberately quiet aim marker, one per detected hand. */
  marker: THREE.Group;
  material: THREE.LineBasicMaterial;
  ring: THREE.ShaderMaterial;
  cursor: { x: number; y: number } | null;
  charge: number;
  chargeColor: THREE.Color;
  /** Resting colour; the left wisp is a touch cooler so the two hands read apart. */
  baseTint: THREE.Color;
  target: THREE.Vector3;
  idlePhase: number;
  trailClock: number;
}

interface PooledLight { light: THREE.PointLight; age: number; duration: number; peak: number }

const CURSOR_DEPTH = 7;
const LABEL_LIFETIME = 1.8;
const SIDES: HandSide[] = ['left', 'right'];
const LEFT_TINT = '#b9dcff';
const RIGHT_TINT = '#d9ccff';
const LIGHT_POOL = 3;

/** A stationary gesture-controlled clearing with living scenery and approaching spirits. */
export class World {
  /** Presentation hooks: audio and UI listen here. */
  readonly events = new GameEvents();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(64, 1, 0.15, 240);
  private readonly environment: ForestEnvironment;
  private readonly controls: CasterView;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly budget = new FrameBudget(Math.min(window.devicePixelRatio || 1, 1.5), 1.5);
  private readonly particles: ParticleSystem;
  private readonly mist: ParticleSystem;
  private readonly post: PostFX;
  private readonly screenFx: ScreenFX;
  private readonly feedback: ScreenFeedback;
  private readonly lights: PooledLight[] = [];
  private readonly wisps: Record<HandSide, Wisp>;
  private readonly labels: FloatingLabel[] = [];
  private readonly spellAnimations: SpellAnimation[] = [];
  private readonly enemies: EnemyCombat[] = [];
  private readonly container: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly scratch = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly basePosition = new THREE.Vector3();
  private readonly baseQuaternion = new THREE.Quaternion();
  private readonly shakeEuler = new THREE.Euler();
  private readonly shakeQuaternion = new THREE.Quaternion();

  private idleTime = 0;
  private trauma = 0;
  private slowSamples = 0;
  private raf = 0;
  private running = false;
  private disposed = false;
  private readonly encounter: Encounter;

  constructor(container: HTMLElement) {
    this.container = container;
    const pixelRatio = this.budget.ratio;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setClearColor('#83bdb5');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // The illustrated world is authored untonemapped; the post grade rolls off only the highlights.
    this.renderer.toneMapping = THREE.NoToneMapping;
    // Scene shadows are painted into the artwork; no mesh casts a real-time shadow.
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);
    this.screenFx = new ScreenFX(container);
    this.feedback = this.screenFx.feedback((amount) => this.shake(amount));
    this.environment = new ForestEnvironment(this.scene);
    this.controls = new CasterView(this.camera, this.renderer.domElement);

    this.particles = new ParticleSystem(5000, pixelRatio);
    this.mist = new ParticleSystem(1500, pixelRatio, THREE.NormalBlending);
    this.scene.add(this.particles.points, this.mist.points);
    // A fixed pool of spell lights: adding or removing lights would recompile every lit shader.
    for (let i = 0; i < LIGHT_POOL; i++) {
      const light = new THREE.PointLight('#ffffff', 0, 10, 2);
      this.scene.add(light);
      this.lights.push({ light, age: 1, duration: 1, peak: 0 });
    }

    this.encounter = new Encounter(this.scene, this.camera, this.environment.obstacles,
      (ray, range) => this.environment.intersect(ray, range), () => this.controls.reset(),
      { particles: this.particles, mist: this.mist, events: this.events });
    this.renderer.domElement.dataset.world = 'ready';

    const params = new URLSearchParams(window.location.search);
    this.post = new PostFX(this.renderer, this.scene, this.camera, params.get('post') !== '0');

    this.wisps = {
      left: this.makeWisp('left'),
      right: this.makeWisp('right'),
    };

    this.events.on((event) => {
      if (event.type === 'player-hurt') {
        this.screenFx.hurt(Math.min(1, event.amount / 25));
        this.shake(0.45);
      } else if (event.type === 'player-blocked') {
        this.screenFx.edge('#c6d9ff', 0.35);
        this.shake(0.18);
      } else if (event.type === 'enemy-death') {
        this.releaseSpirit(event.position, event.height);
      }
    });

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
      const elapsed = this.clock.getDelta();
      const ratio = this.budget.sample(elapsed);
      if (ratio !== null) {
        this.renderer.setPixelRatio(ratio);
        this.resize();
        // Still slow at the lowest resolution: drop bloom before dropping frames.
        if (ratio <= 0.56 && this.post.enabled && ++this.slowSamples >= 2) this.post.setEnabled(false);
      }
      // Bounded substeps preserve seconds of gameplay at variable render rates.
      const time = Math.min(elapsed, 0.15);
      const steps = Math.max(1, Math.ceil(time / 0.05));
      for (let i = 0; i < steps; i++) this.frame(time / steps, i === steps - 1, time);
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
    this.encounter.dispose();
    this.environment.dispose();
    for (const label of this.labels) {
      this.scene.remove(label.sprite);
      label.sprite.material.map?.dispose();
      label.sprite.material.dispose();
    }
    this.labels.length = 0;
    for (const side of SIDES) {
      this.wisps[side].marker.traverse((object) => {
        if (object instanceof THREE.Line || object instanceof THREE.Mesh) object.geometry.dispose();
      });
      this.wisps[side].material.dispose();
      this.wisps[side].ring.dispose();
      this.scene.remove(this.wisps[side].marker);
    }
    this.particles.dispose();
    this.mist.dispose();
    for (const pooled of this.lights) pooled.light.dispose();
    for (const animation of this.spellAnimations) {
      this.scene.remove(animation.group);
      animation.dispose();
    }
    this.spellAnimations.length = 0;
    for (const enemy of this.enemies) enemy.dispose();
    this.enemies.length = 0;
    this.post.dispose();
    this.screenFx.dispose();
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

  /** Remaining per-spell recovery (seconds) and its full length, for the HUD. */
  cooldowns(): Record<string, { remaining: number; total: number }> {
    return this.encounter.cooldowns();
  }

  /** A spell is released by a tracked hand; no movement or number-key controls. */
  cast(spell: SpellDef, from?: HandSide | 'both', detail?: string): boolean {
    if (this.disposed || worldInputBlocked()) return false;
    const pan = this.panFor(from);
    if (!this.encounter.cast(spell.effect)) {
      this.events.emit({ type: 'cast-refused', effect: spell.effect, pan });
      return false;
    }
    this.camera.updateMatrixWorld(true);
    this.scene.updateMatrixWorld(true);
    const color = new THREE.Color(spell.color);
    const origin = this.castOrigin(from).clone();
    const { point: target, enemy } = this.selectSpellTarget(origin);
    const effectTarget = spell.effect === 'summon' ? origin : target;
    const targetNdc = effectTarget.clone().project(this.camera);
    const cameraTarget = effectTarget.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const lightningStart = new THREE.Vector3();
    if (spell.effect === 'lightning' && -cameraTarget.z > 0) {
      screenPointAtDepth(this.camera, THREE.MathUtils.clamp((targetNdc.x + 1) * 0.5, 0.01, 0.99), 0.015, -cameraTarget.z, lightningStart);
    }
    const animation = createSpellAnimation(spell.effect, origin, effectTarget, color, detail, {
      groundY: terrainHeight(effectTarget.x, effectTarget.z),
      cameraQuaternion: this.camera.quaternion,
      cameraPosition: this.camera.position,
      lightningStart: spell.effect === 'lightning' ? lightningStart : undefined,
      depth: Math.max(0.5, -cameraTarget.z),
      hand: from,
      particles: this.particles,
      mist: this.mist,
      screen: this.reducedMotion.matches ? { flash: (c, s, m) => this.feedback.flash(c, s * 0.4, m), shake: () => undefined } : this.feedback,
      light: (position, lightColor, intensity, duration, distance) => this.flashLight(position, lightColor, intensity, duration, distance),
    });
    if (spell.effect === 'summon') this.encounter.summon(origin, target, enemy);
    const impactPan = THREE.MathUtils.clamp(targetNdc.x, -1, 1);
    const announceImpact = () => this.events.emit({ type: 'spell-impact', effect: spell.effect, position: effectTarget.clone(), pan: impactPan });
    if (enemy && spell.effect !== 'summon') {
      const hit = this.encounter.hasEnemy(enemy)
        ? this.encounter.impactCallback(enemy, spell.effect, target, color)
        : () => { enemy.impact(spell.effect, target, color); };
      animation.setImpactCallback(() => { announceImpact(); hit(); });
    } else {
      animation.setImpactCallback(announceImpact);
    }
    this.scene.add(animation.group);
    this.spellAnimations.push(animation);
    this.spawnLabel(spell.name, spell.color, origin);
    this.events.emit({ type: 'cast', effect: spell.effect, position: origin.clone(), pan, detail });
    return true;
  }

  /** Register an already-placed enemy model. The returned function unregisters its reactions. */
  registerEnemy(root: THREE.Object3D): () => void {
    const enemy = this.addEnemy(root);
    return () => this.removeEnemy(enemy);
  }

  /** Add camera trauma (0..1); shake falls off quadratically and decays in about half a second. */
  shake(amount: number): void {
    if (this.reducedMotion.matches) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /* ─────────────────────────────── internals ─────────────────────────────── */

  private flashLight(position: THREE.Vector3, color: THREE.Color, intensity: number, duration: number, distance = 10): void {
    // Reuse the dimmest (or oldest) pooled light.
    let pick = this.lights[0];
    for (const pooled of this.lights) {
      const level = pooled.age >= pooled.duration ? -1 : pooled.peak * (1 - pooled.age / pooled.duration);
      const pickLevel = pick.age >= pick.duration ? -1 : pick.peak * (1 - pick.age / pick.duration);
      if (level < pickLevel) pick = pooled;
    }
    pick.light.position.copy(position);
    pick.light.color.copy(color);
    pick.light.distance = distance;
    pick.peak = intensity;
    pick.age = 0;
    pick.duration = Math.max(0.05, duration);
  }

  private releaseSpirit(position: THREE.Vector3, height: number): void {
    const color = new THREE.Color('#bfe6d8');
    const ember = new THREE.Color('#f0c27a');
    const center = position.clone().setY(position.y + height * 0.5);
    this.particles.burst(center, 46, { speed: 1.1, direction: new THREE.Vector3(0, 1, 0), spread: 1.6, radius: height * 0.3, color, size: 0.14, sizeEnd: 0.02, ttl: 2.4, gravity: -0.9, drag: 0.7, style: 'glow', fadeIn: 0.2 });
    this.particles.burst(center, 20, { speed: 0.7, radius: height * 0.35, color: ember, size: 0.08, ttl: 1.8, gravity: -0.5, drag: 0.5, style: 'spark' });
    this.mist.burst(position.clone().setY(position.y + 0.4), 10, { speed: 0.9, color: new THREE.Color('#5f6e69'), size: 1.4, sizeEnd: 3, alpha: 0.3, ttl: 2.2, drag: 1.2, gravity: -0.2, style: 'mist' });
    this.flashLight(center, color, 6, 1.2, 9);
  }

  private makeWisp(side: HandSide): Wisp {
    const tint = side === 'left' ? LEFT_TINT : RIGHT_TINT;
    const material = new THREE.LineBasicMaterial({ color: tint, transparent: true, opacity: 0, depthTest: false });
    const marker = new THREE.Group();
    const crossGeometry = new THREE.BufferGeometry();
    crossGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.62, 0, 0, -0.24, 0, 0,
      0.24, 0, 0, 0.62, 0, 0,
      0, -0.62, 0, 0, -0.24, 0,
      0, 0.24, 0, 0, 0.62, 0,
    ], 3));
    const cross = new THREE.LineSegments(crossGeometry, material);
    cross.renderOrder = 9;
    marker.add(cross);
    // A soft ring whose arc fills as a sign charges: the hold timer lives where the hand is.
    const ring = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uProgress: { value: 0 }, uOpacity: { value: 0 }, uBase: { value: new THREE.Color(tint) }, uCharge: { value: new THREE.Color('#ffffff') }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uProgress; uniform float uOpacity; uniform vec3 uBase; uniform vec3 uCharge; uniform float uTime; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p);
          float angle = fract(atan(p.x, p.y) / 6.2831853 + 1.0);
          float base = smoothstep(0.035, 0.0, abs(r - 0.62)) * 0.55;
          float arcMask = step(angle, uProgress) * step(0.001, uProgress);
          float arc = smoothstep(0.07, 0.0, abs(r - 0.62)) * arcMask;
          float glow = exp(-pow((r - 0.62) / 0.16, 2.0)) * arcMask * 0.55;
          float full = step(0.999, uProgress) * (0.5 + 0.5 * sin(uTime * 18.0));
          float inner = exp(-r * r * 22.0) * 0.5;
          vec3 c = mix(uBase, uCharge, step(0.001, uProgress));
          float a = (base + arc * 1.2 + glow + full * glow + inner) * uOpacity;
          gl_FragColor = vec4(c * (1.0 + arc * 0.6), a);
        }`,
    });
    const ringMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), ring);
    ringMesh.renderOrder = 9;
    marker.add(ringMesh);
    marker.scale.setScalar(0.72);
    this.scene.add(marker);
    return {
      side,
      marker,
      material,
      ring,
      cursor: null,
      charge: 0,
      chargeColor: new THREE.Color('#ffffff'),
      baseTint: new THREE.Color(tint),
      target: new THREE.Vector3(),
      idlePhase: side === 'left' ? 1.7 : 0,
      trailClock: 0,
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
    enemy.dispose();
  }

  private spawnLabel(text: string, color: string, origin: THREE.Vector3): void {
    const material = new THREE.SpriteMaterial({
      map: makeLabelTexture(text, color),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.6, 0.65, 1);
    sprite.renderOrder = 10;
    this.camera.getWorldDirection(this.scratch);
    sprite.position.copy(origin).addScaledVector(this.scratch, 5);
    sprite.position.y += 0.9;
    this.scene.add(sprite);
    this.labels.push({ sprite, age: 0 });
  }

  private panFor(from?: HandSide | 'both'): number {
    const cursor = from === 'left' ? this.wisps.left.cursor : from === 'right' ? this.wisps.right.cursor : null;
    return cursor ? THREE.MathUtils.clamp(cursor.x * 2 - 1, -1, 1) : 0;
  }

  private castOrigin(from?: HandSide | 'both'): THREE.Vector3 {
    const l = this.wisps.left;
    const r = this.wisps.right;
    // Aim from the newest tracked cursor, not the decorative marker easing toward it.
    // Fast strikes otherwise land behind the hand by one or more animation frames.
    if (from === 'left' && l.cursor) return this.cursorToWorld(l.cursor, this.mid);
    if (from === 'right' && r.cursor) return this.cursorToWorld(r.cursor, this.mid);
    if (from === 'both' && l.cursor && r.cursor) {
      this.cursorToWorld(l.cursor, this.mid);
      this.cursorToWorld(r.cursor, this.scratch);
      return this.mid.add(this.scratch).multiplyScalar(0.5);
    }
    if (from && l.cursor) return this.cursorToWorld(l.cursor, this.mid);
    if (from && r.cursor) return this.cursorToWorld(r.cursor, this.mid);
    // No hand (or a numeric demo): always use the present camera, never a stale cursor.
    screenPointAtDepth(this.camera, 0.5, 0.5, 2, this.mid);
    return this.mid;
  }

  private selectSpellTarget(origin: THREE.Vector3): { point: THREE.Vector3; enemy: EnemyCombat | null } {
    const ray = new THREE.Ray(this.camera.position.clone(), origin.clone().sub(this.camera.position).normalize());
    return chooseRayTarget(ray, SPELL_RANGE, this.environment.intersect(ray, SPELL_RANGE), [...this.enemies, ...this.encounter.reactions()],
      (enemy, aim, point) => this.encounter.hasEnemy(enemy)
        ? this.encounter.intersectEnemy(enemy, aim, point)
        : enemy.intersectRay(aim, point, aimAssistRadius(enemy.root.getWorldPosition(this.scratch).distanceTo(aim.origin))));
  }

  private cursorToWorld(c: { x: number; y: number }, out: THREE.Vector3): THREE.Vector3 {
    screenPointAtDepth(this.camera, c.x, c.y, CURSOR_DEPTH, out);
    return out;
  }

  private frame(dt: number, render = true, renderDt = dt): void {
    const t = this.clock.elapsedTime;
    this.idleTime += dt;
    this.environment.update(dt, this.camera, this.reducedMotion.matches);
    const paused = worldInputBlocked();
    this.encounter.update(dt, paused, this.reducedMotion.matches);
    const simulationDt = paused ? 0 : dt;
    const anyHand = SIDES.some((side) => this.wisps[side].cursor !== null);
    for (const side of SIDES) this.updateWisp(this.wisps[side], dt, t, anyHand);

    for (let i = this.labels.length - 1; i >= 0; i--) {
      const l = this.labels[i];
      l.age += dt;
      const u = l.age / LABEL_LIFETIME;
      l.sprite.position.y += dt * 0.4;
      // Ease in, hold, then dissolve upward.
      l.sprite.material.opacity = Math.min(1, l.age / 0.12) * Math.max(0, 1 - Math.max(0, u - 0.45) / 0.55);
      if (u >= 1) {
        this.scene.remove(l.sprite);
        l.sprite.material.map?.dispose();
        l.sprite.material.dispose();
        this.labels.splice(i, 1);
      }
    }

    for (let i = this.spellAnimations.length - 1; i >= 0; i--) {
      const animation = this.spellAnimations[i];
      if (animation.update(simulationDt)) continue;
      this.scene.remove(animation.group);
      animation.dispose();
      this.spellAnimations.splice(i, 1);
    }

    for (const pooled of this.lights) {
      pooled.age += dt;
      const u = pooled.age / pooled.duration;
      pooled.light.intensity = u >= 1 ? 0 : pooled.peak * Math.pow(1 - u, 1.6) * Math.min(1, u * 12 + 0.25);
    }

    this.particles.update(simulationDt || dt * 0.25);
    this.mist.update(simulationDt || dt * 0.25);
    for (const enemy of this.enemies) enemy.update(simulationDt);
    this.screenFx.setWard(this.encounter.player.shield / 45);
    if (render) this.render(renderDt);
  }

  private render(dt: number): void {
    // Shake is applied only for the draw, so aiming and targeting always use the steady view.
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const shaking = this.trauma > 0.001;
    if (shaking) {
      const k = this.trauma * this.trauma;
      const time = this.clock.elapsedTime * 38;
      this.basePosition.copy(this.camera.position);
      this.baseQuaternion.copy(this.camera.quaternion);
      this.shakeEuler.set(
        Math.sin(time * 1.1) * 0.016 * k,
        Math.sin(time * 0.9 + 1.7) * 0.02 * k,
        Math.sin(time * 1.3 + 3.1) * 0.012 * k,
      );
      this.camera.quaternion.multiply(this.shakeQuaternion.setFromEuler(this.shakeEuler));
      this.camera.position.y += Math.sin(time * 1.7 + 0.4) * 0.03 * k;
      this.camera.updateMatrixWorld(true);
    }
    this.post.render(dt, this.scene, this.camera);
    if (shaking) {
      this.camera.position.copy(this.basePosition);
      this.camera.quaternion.copy(this.baseQuaternion);
      this.camera.updateMatrixWorld(true);
    }
  }

  /**
   * One crosshair per hand. A tracked hand pulls its crosshair to the palm. When a hand drops
   * out, its marker fades in place rather than drifting or jumping.
   */
  private updateWisp(w: Wisp, dt: number, t: number, anyHand: boolean): void {
    void anyHand;
    const has = w.cursor !== null;
    if (has) {
      this.cursorToWorld(w.cursor!, w.target);
    }
    // LandmarkSmoother already filters the camera signal. Keep only a short render-side
    // interpolation so 30fps input looks fluid at 60fps without stacking another long lag.
    const before = this.scratch.copy(w.marker.position);
    w.marker.position.lerp(w.target, 1 - Math.exp(-dt * (has ? 32 : 2)));
    const speed = before.distanceTo(w.marker.position) / Math.max(dt, 1e-4);

    w.marker.quaternion.copy(this.camera.quaternion);
    w.marker.scale.setScalar(0.72 + w.charge * 0.22);
    const goal = has ? 0.95 : 0;
    w.material.opacity += (goal - w.material.opacity) * (1 - Math.exp(-dt * 6));
    w.material.color.copy(w.baseTint).lerp(w.chargeColor, w.charge);
    w.ring.uniforms.uOpacity.value = w.material.opacity;
    w.ring.uniforms.uProgress.value = w.charge;
    w.ring.uniforms.uCharge.value.copy(w.chargeColor);
    w.ring.uniforms.uTime.value = t;

    // A faint trail lets a moving marker read clearly without becoming a cloudy cursor.
    if (w.material.opacity < 0.05) return;
    w.trailClock += dt * (has ? 40 + Math.min(speed, 12) * 12 : 10) * (0.5 + w.charge);
    const p = w.marker.position;
    while (w.trailClock >= 1) {
      w.trailClock -= 1;
      this.particles.emit({
        x: p.x + (Math.random() - 0.5) * 0.12,
        y: p.y + (Math.random() - 0.5) * 0.12,
        z: p.z,
        vx: (Math.random() - 0.5) * 0.3,
        vy: Math.random() * 0.35,
        vz: (Math.random() - 0.5) * 0.3,
        color: w.material.color,
        size: 0.05 + w.charge * 0.07,
        sizeEnd: 0.005,
        alpha: 0.55 * w.material.opacity,
        ttl: 0.55,
        drag: 1.5,
        style: w.charge > 0.05 ? 'glow' : 'spark',
      });
    }
  }

  private resize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const ratio = this.renderer.getPixelRatio();
    this.post?.setSize(w, h, ratio);
    this.particles.setProjection(h, this.camera.fov, ratio);
    this.mist.setProjection(h, this.camera.fov, ratio);
  };
}
