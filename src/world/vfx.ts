import * as THREE from 'three';
import type { ParticleSystem } from './particles.ts';

/** Screen-level feedback a spell may request: a brief flash and a camera shake. */
export interface ScreenFeedback {
  /** `full` washes the whole view (lightning); `edge` glows in from the borders (wards, healing). */
  flash(color: THREE.ColorRepresentation, strength: number, mode?: 'full' | 'edge'): void;
  shake(amount: number): void;
}

/** Everything an effect may draw into besides its own group. All optional for headless tests. */
export interface FxContext {
  particles?: ParticleSystem;
  mist?: ParticleSystem;
  screen?: ScreenFeedback;
  cameraPosition?: THREE.Vector3;
}

const NO_CAMERA = new THREE.Vector3(0, 1.8, 10);

/* ───────────────────────────── shared textures ───────────────────────────── */

let glowCache: THREE.Texture | null = null;
let ringCache: THREE.Texture | null = null;
let flareCache: THREE.Texture | null = null;

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft radial glow, created once and shared by every sprite (never disposed per effect). */
export function glowTexture(): THREE.Texture {
  glowCache ??= canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  return glowCache;
}

/** Thin soft ring for shockwaves. */
export function ringTexture(): THREE.Texture {
  ringCache ??= canvasTexture(256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    g.addColorStop(0.8, 'rgba(255,255,255,1)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  return ringCache;
}

/** Four-point star flare for impact and launch flashes. */
export function flareTexture(): THREE.Texture {
  flareCache ??= canvasTexture(256, (ctx, s) => {
    const c = s / 2;
    const g = ctx.createRadialGradient(c, c, 0, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.1, 'rgba(255,255,255,0.7)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    ctx.globalCompositeOperation = 'lighter';
    for (const angle of [0, Math.PI / 2]) {
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(angle);
      const ray = ctx.createLinearGradient(-c, 0, c, 0);
      ray.addColorStop(0, 'rgba(255,255,255,0)');
      ray.addColorStop(0.5, 'rgba(255,255,255,0.9)');
      ray.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.ellipse(0, 0, c, s * 0.018, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
  return flareCache;
}

/** A camera-facing additive sprite whose material is owned by the caller. */
export function glowSprite(color: THREE.ColorRepresentation, scale: number, texture = glowTexture(), opacity = 1): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  sprite.scale.setScalar(scale);
  sprite.renderOrder = 7;
  return sprite;
}

/** Additive unlit material for energy meshes. */
export function energy(color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

/** Dispose a group's meshes, lines and sprites, but never the shared cached textures. */
export function disposeGroup(group: THREE.Object3D): void {
  const shared = new Set([glowCache, ringCache, flareCache]);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    } else if (object instanceof THREE.Sprite) {
      const map = object.material.map;
      if (map && !shared.has(map) && !map.userData.shared) map.dispose();
      object.material.dispose();
    }
  });
}

/* ───────────────────────────── ribbon trails ───────────────────────────── */

const RIBBON_VERTEX = `
  attribute float aFade;
  varying vec2 vUv; varying float vFade;
  void main(){ vUv = uv; vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIBBON_FRAGMENT = `
  uniform vec3 uColor; uniform float uOpacity; uniform float uCore; uniform float uTime;
  varying vec2 vUv; varying float vFade;
  void main(){
    float across = abs(vUv.y * 2.0 - 1.0);
    float body = pow(1.0 - across, 1.6);
    float core = pow(1.0 - across, 9.0) * uCore;
    // Faint travelling striations keep long trails from reading as flat paint.
    float streak = 0.82 + 0.18 * sin(vUv.x * 38.0 - uTime * 22.0 + vUv.y * 3.0);
    vec3 c = mix(uColor, vec3(1.0), core);
    gl_FragColor = vec4(c * 1.35, (body * 0.75 + core) * vFade * uOpacity * streak);
  }`;

/**
 * A tapered, camera-facing light ribbon that follows a moving head. Points age out after
 * `lifetime` seconds, so the trail shortens naturally when its head stops.
 */
export class Trail {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly points: Array<{ p: THREE.Vector3; age: number }> = [];
  private readonly positions: Float32Array;
  private readonly fades: Float32Array;
  private readonly max: number;
  private readonly tangent = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private time = 0;

  constructor(
    color: THREE.ColorRepresentation,
    private readonly width = 0.1,
    private readonly lifetime = 0.25,
    max = 48,
    core = 1,
  ) {
    this.max = max;
    this.positions = new Float32Array(max * 2 * 3);
    this.fades = new Float32Array(max * 2);
    const uv = new Float32Array(max * 2 * 2);
    const index: number[] = [];
    for (let i = 0; i < max; i++) {
      uv.set([i / (max - 1), 0, i / (max - 1), 1], i * 4);
      if (i < max - 1) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aFade', new THREE.BufferAttribute(this.fades, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uCore: { value: core }, uTime: { value: 0 } },
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  set opacity(value: number) { this.mesh.material.uniforms.uOpacity.value = value; }

  /** Add the head's newest position (in the mesh's parent space). */
  push(point: THREE.Vector3): void {
    const head = this.points[0];
    if (head && head.p.distanceToSquared(point) < 1e-6) { head.age = 0; return; }
    this.points.unshift({ p: point.clone(), age: 0 });
    if (this.points.length > this.max) this.points.length = this.max;
  }

  /** Age the points and rebuild the strip facing `camera` (parent space). */
  update(dt: number, camera: THREE.Vector3 = NO_CAMERA): void {
    this.time += dt;
    this.mesh.material.uniforms.uTime.value = this.time;
    for (const point of this.points) point.age += dt;
    while (this.points.length && this.points[this.points.length - 1].age > this.lifetime) this.points.pop();
    const n = this.points.length;
    if (n < 2) { this.mesh.geometry.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const p = this.points[i].p;
      const a = this.points[Math.max(0, i - 1)].p, b = this.points[Math.min(n - 1, i + 1)].p;
      this.tangent.subVectors(a, b);
      if (this.tangent.lengthSq() < 1e-10) this.tangent.set(0, 1, 0);
      this.view.subVectors(camera, p);
      this.side.crossVectors(this.tangent, this.view);
      if (this.side.lengthSq() < 1e-10) this.side.set(1, 0, 0);
      const along = i / (n - 1);
      const life = 1 - this.points[i].age / this.lifetime;
      const w = this.width * (1 - along * 0.85) * (0.4 + 0.6 * Math.max(0, life));
      this.side.normalize().multiplyScalar(w * 0.5);
      this.positions.set([p.x + this.side.x, p.y + this.side.y, p.z + this.side.z, p.x - this.side.x, p.y - this.side.y, p.z - this.side.z], i * 6);
      const fade = Math.max(0, life) * (1 - along) ** 0.7;
      this.fades[i * 2] = fade;
      this.fades[i * 2 + 1] = fade;
    }
    const geometry = this.mesh.geometry;
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('aFade').needsUpdate = true;
    geometry.setDrawRange(0, (n - 1) * 6);
  }

  get empty(): boolean { return this.points.length < 2; }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/* ───────────────────────────── small helpers ───────────────────────────── */

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
export const easeOutCubic = (n: number): number => 1 - Math.pow(1 - clamp01(n), 3);
export const easeOutBack = (n: number): number => {
  const t = clamp01(n), c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
export const easeInOut = (n: number): number => { const t = clamp01(n); return t * t * (3 - 2 * t); };

/** Deterministic little PRNG so a bolt or ice field is jagged but never flickers between frames. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WHITE = new THREE.Color('#ffffff');
