import * as THREE from 'three';

/** Sprite look. Glow: hot core, soft halo. Spark: tight bright point. Mist: broad, soft, dim. */
export type ParticleStyle = 'glow' | 'spark' | 'mist';
const STYLE_ID: Record<ParticleStyle, number> = { glow: 0, spark: 1, mist: 2 };

export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  color: THREE.Color;
  /** World-space diameter at birth (metres). */
  size: number;
  /** Lifetime in seconds. */
  ttl: number;
  /** Diameter at death; defaults to `size * 0.2`. */
  sizeEnd?: number;
  /** Peak opacity, 0..1. */
  alpha?: number;
  /** Fraction of velocity lost per second (0 = none). */
  drag?: number;
  /** Downward acceleration in m/s². Negative rises. */
  gravity?: number;
  style?: ParticleStyle;
  /** Seconds of fade-in at birth. */
  fadeIn?: number;
}

const STRIDE = 16;
// Per-particle CPU record layout.
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, TTL = 7, S0 = 8, S1 = 9, ALPHA = 10, DRAG = 11, GRAV = 12, STYLE = 13, FADE = 14, SEED = 15;

/**
 * Pooled GPU particles: one draw call, sizes in world units, swap-remove compaction so only live
 * particles are uploaded and drawn. Sized for a few thousand concurrent sparks on integrated GPUs.
 */
export class ParticleSystem {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly capacity: number;
  private readonly data: Float32Array;
  private readonly colors: Float32Array;
  private readonly position: THREE.BufferAttribute;
  private readonly color: THREE.BufferAttribute;
  private readonly look: THREE.BufferAttribute;
  private count = 0;
  private disposed = false;

  constructor(capacity = 6000, pixelRatio = 1, blending: THREE.Blending = THREE.AdditiveBlending) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * STRIDE);
    this.colors = new Float32Array(capacity * 3);
    const geometry = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.color = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.look = new THREE.BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('color', this.color);
    geometry.setAttribute('look', this.look);
    geometry.setDrawRange(0, 0);
    const additive = blending === THREE.AdditiveBlending;
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending,
      vertexColors: true,
      uniforms: {
        uProjScale: { value: 600 * pixelRatio },
      },
      vertexShader: `
        attribute vec4 look; // size, alpha, style, seed
        uniform float uProjScale;
        varying vec3 vColor; varying float vAlpha; varying float vStyle; varying float vSeed;
        void main(){
          vColor = color; vAlpha = look.y; vStyle = look.z; vSeed = look.w;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float depth = max(0.05, -mv.z);
          gl_PointSize = clamp(look.x * uProjScale / depth, 0.0, 96.0);
          // Sub-pixel points flicker; fade them instead of rendering a shimmering pixel.
          vAlpha *= smoothstep(0.0, 1.5, gl_PointSize);
          gl_PointSize = max(gl_PointSize, 1.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha; varying float vStyle; varying float vSeed;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float a;
          vec3 c = vColor;
          if (vStyle < 0.5) {
            float core = exp(-d * d * 18.0);
            float halo = exp(-d * d * 3.2);
            a = core * 0.9 + halo * 0.45;
            c = mix(vColor, vec3(1.0), core * 0.55);
          } else if (vStyle < 1.5) {
            float core = exp(-d * d * 40.0);
            a = core + exp(-d * d * 7.0) * 0.25;
            c = mix(vColor, vec3(1.0), core * 0.7);
          } else {
            float soft = 1.0 - smoothstep(0.0, 1.0, d);
            a = soft * soft * (0.75 + 0.25 * sin(vSeed * 6.2831 + d * 4.0));
          }
          gl_FragColor = vec4(c * ${additive ? '1.4' : '1.0'}, a * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 4;
    this.points.name = additive ? 'Spell particles' : 'Mist particles';
  }

  get live(): number { return this.count; }

  /** Pixel ratio and viewport height feed the world-unit point size. */
  setProjection(viewportHeight: number, fovDegrees: number, pixelRatio: number): void {
    const scale = (viewportHeight * pixelRatio * 0.5) / Math.tan(THREE.MathUtils.degToRad(fovDegrees) / 2);
    this.points.material.uniforms.uProjScale.value = scale;
  }

  emit(p: Particle): void {
    if (this.disposed || !(p.ttl > 0)) return;
    // Pool full: recycle the oldest-looking slot rather than dropping the newest effect.
    const index = this.count < this.capacity ? this.count++ : Math.floor(Math.random() * this.capacity);
    const o = index * STRIDE, d = this.data;
    d[o + PX] = p.x; d[o + PY] = p.y; d[o + PZ] = p.z;
    d[o + VX] = p.vx; d[o + VY] = p.vy; d[o + VZ] = p.vz;
    d[o + AGE] = 0; d[o + TTL] = p.ttl;
    d[o + S0] = p.size; d[o + S1] = p.sizeEnd ?? p.size * 0.2;
    d[o + ALPHA] = p.alpha ?? 1; d[o + DRAG] = p.drag ?? 0; d[o + GRAV] = p.gravity ?? 0;
    d[o + STYLE] = STYLE_ID[p.style ?? 'glow']; d[o + FADE] = p.fadeIn ?? 0.04; d[o + SEED] = Math.random();
    this.colors[index * 3] = p.color.r; this.colors[index * 3 + 1] = p.color.g; this.colors[index * 3 + 2] = p.color.b;
  }

  /** Radial burst helper. `spread` 0..1 narrows the cone around `direction` (default: sphere). */
  burst(
    origin: THREE.Vector3,
    count: number,
    options: Omit<Particle, 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz'> & { speed: number; speedJitter?: number; direction?: THREE.Vector3; spread?: number; radius?: number; sizeJitter?: number },
  ): void {
    const dir = options.direction;
    const spread = options.spread ?? 1;
    for (let i = 0; i < count; i++) {
      let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
      const len = Math.hypot(x, y, z) || 1;
      x /= len; y /= len; z /= len;
      if (dir) {
        x = dir.x + x * spread; y = dir.y + y * spread; z = dir.z + z * spread;
        const l2 = Math.hypot(x, y, z) || 1;
        x /= l2; y /= l2; z /= l2;
      }
      const speed = options.speed * (1 - (options.speedJitter ?? 0.6) * Math.random());
      const r = (options.radius ?? 0) * Math.random();
      const sj = 1 + (Math.random() - 0.5) * (options.sizeJitter ?? 0.6);
      this.emit({
        ...options,
        x: origin.x + x * r, y: origin.y + y * r, z: origin.z + z * r,
        vx: x * speed, vy: y * speed, vz: z * speed,
        size: options.size * sj,
        sizeEnd: options.sizeEnd === undefined ? undefined : options.sizeEnd * sj,
        ttl: options.ttl * (0.65 + Math.random() * 0.7),
      });
    }
  }

  update(dt: number): void {
    if (this.disposed) return;
    const d = this.data;
    const pos = this.position.array as Float32Array;
    const col = this.color.array as Float32Array;
    const look = this.look.array as Float32Array;
    let i = 0;
    while (i < this.count) {
      const o = i * STRIDE;
      d[o + AGE] += dt;
      if (d[o + AGE] >= d[o + TTL]) {
        // Swap-remove keeps live particles packed at the front of every buffer.
        const last = --this.count;
        if (i !== last) {
          d.copyWithin(o, last * STRIDE, last * STRIDE + STRIDE);
          this.colors[i * 3] = this.colors[last * 3];
          this.colors[i * 3 + 1] = this.colors[last * 3 + 1];
          this.colors[i * 3 + 2] = this.colors[last * 3 + 2];
        }
        continue;
      }
      const damp = Math.max(0, 1 - d[o + DRAG] * dt);
      d[o + VX] *= damp; d[o + VY] = d[o + VY] * damp - d[o + GRAV] * dt; d[o + VZ] *= damp;
      d[o + PX] += d[o + VX] * dt; d[o + PY] += d[o + VY] * dt; d[o + PZ] += d[o + VZ] * dt;
      const u = d[o + AGE] / d[o + TTL];
      const fadeIn = d[o + FADE] > 0 ? Math.min(1, d[o + AGE] / d[o + FADE]) : 1;
      const fadeOut = 1 - u * u;
      pos[i * 3] = d[o + PX]; pos[i * 3 + 1] = d[o + PY]; pos[i * 3 + 2] = d[o + PZ];
      col[i * 3] = this.colors[i * 3]; col[i * 3 + 1] = this.colors[i * 3 + 1]; col[i * 3 + 2] = this.colors[i * 3 + 2];
      look[i * 4] = d[o + S0] + (d[o + S1] - d[o + S0]) * u;
      look[i * 4 + 1] = d[o + ALPHA] * fadeIn * fadeOut;
      look[i * 4 + 2] = d[o + STYLE];
      look[i * 4 + 3] = d[o + SEED];
      i++;
    }
    this.points.geometry.setDrawRange(0, this.count);
    if (this.count > 0) {
      this.position.clearUpdateRanges(); this.position.addUpdateRange(0, this.count * 3); this.position.needsUpdate = true;
      this.color.clearUpdateRanges(); this.color.addUpdateRange(0, this.count * 3); this.color.needsUpdate = true;
      this.look.clearUpdateRanges(); this.look.addUpdateRange(0, this.count * 4); this.look.needsUpdate = true;
    }
  }

  clear(): void {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
