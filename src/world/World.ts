import * as THREE from 'three';
import type { SpellDef } from '../config/spells.ts';
import type { HandSide } from '../tracking/types.ts';
import { emitEffect } from './effects.ts';
import { ParticleSystem } from './particles.ts';
import { makeLabelTexture } from './textures.ts';

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

/**
 * The virtual world. A quiet twilight field of stars; your hand becomes a
 * wisp of light, and every cast spell is painted from it into the distance.
 *
 * This is the placeholder world for the first release: replace the scenery in
 * `buildScenery()` and the per-spell look in `effects.ts`. The hand-to-world plumbing
 * (`setCursors`, `setCharge`, `cast`) is what the rest of the app relies on.
 */
export class World {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  private readonly particles: ParticleSystem;
  private readonly wisps: Record<HandSide, Wisp>;
  private readonly labels: FloatingLabel[] = [];
  private readonly container: HTMLElement;
  private readonly clock = new THREE.Clock();
  private readonly scratch = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();

  private idleTime = 0;
  private raf = 0;
  private running = false;

  constructor(container: HTMLElement) {
    this.container = container;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setClearColor(0x0e0b1f);
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.FogExp2(0x0e0b1f, 0.032);
    this.camera.position.set(0, 0.6, CURSOR_DEPTH);
    this.camera.lookAt(0, 0.1, -4);

    this.particles = new ParticleSystem(6000, pixelRatio);
    this.scene.add(this.particles.points);

    this.buildScenery();

    this.wisps = {
      left: this.makeWisp('left'),
      right: this.makeWisp('right'),
    };

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  start(): void {
    if (this.running) return;
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
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.particles.dispose();
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

  /** Releases a spell from the marker that cast it, or from between both hands. */
  cast(spell: SpellDef, from?: HandSide | 'both'): void {
    const color = new THREE.Color(spell.color);
    const origin = this.castOrigin(from);
    emitEffect(spell.effect, this.particles, origin, color);
    this.spawnLabel(spell.name, spell.color, origin);
  }

  /* ─────────────────────────────── internals ─────────────────────────────── */

  private buildScenery(): void {
    const stars = new Float32Array(1400 * 3);
    for (let i = 0; i < 1400; i++) {
      const r = 60 + Math.random() * 60;
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2 - 0.15;
      stars.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r - 20], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    this.scene.add(
      new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd9ccff, size: 0.35, transparent: true, opacity: 0.8, fog: false })),
    );
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

  private spawnLabel(text: string, color: string, origin: THREE.Vector3): void {
    const material = new THREE.SpriteMaterial({
      map: makeLabelTexture(text, color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3.6, 0.9, 1);
    sprite.position.copy(origin).add(this.scratch.set(0, 1, 0));
    this.scene.add(sprite);
    this.labels.push({ sprite, age: 0 });
  }

  private castOrigin(from?: HandSide | 'both'): THREE.Vector3 {
    if (from === 'left') return this.wisps.left.marker.position;
    if (from === 'right') return this.wisps.right.marker.position;
    const l = this.wisps.left;
    const r = this.wisps.right;
    if (from === 'both' || (l.cursor && r.cursor)) {
      return this.mid.copy(l.marker.position).add(r.marker.position).multiplyScalar(0.5);
    }
    if (l.cursor) return l.marker.position;
    return r.marker.position;
  }

  private cursorToWorld(c: { x: number; y: number }, out: THREE.Vector3): THREE.Vector3 {
    out.set(c.x * 2 - 1, -(c.y * 2 - 1), 0.5).unproject(this.camera);
    out.sub(this.camera.position).normalize();
    return out.multiplyScalar(CURSOR_DEPTH).add(this.camera.position);
  }

  private frame(dt: number): void {
    const t = this.clock.elapsedTime;
    this.idleTime += dt;

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

    this.particles.update(dt);
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
    w.marker.position.lerp(w.target, 1 - Math.exp(-dt * (has ? 16 : 2)));

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
