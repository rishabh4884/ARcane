import * as THREE from 'three';
import { AUTHORED_WORLD, PAINTED_WORLD } from './authored.ts';
import { LANTERN_GLSL, SPELL_LIGHTS, type LanternUniform } from './LanternLighting.ts';
import { SPAWN, seededRandom, terrainHeight } from './spatial.ts';

/** Where the moon hangs: up and to the left of the casting view, above the canopy gap. */
export const MOON_DIRECTION = new THREE.Vector3(-0.34, 0.33, -0.88).normalize();

const NOISE_GLSL = `
  float aHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float aNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(aHash(i), aHash(i + vec2(1.0, 0.0)), f.x), mix(aHash(i + vec2(0.0, 1.0)), aHash(i + vec2(1.0, 1.0)), f.x), f.y); }
  float aFbm(vec2 p){ float n = 0.0, a = 0.55; for (int i = 0; i < 3; i++) { n += aNoise(p) * a; p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; } return n; }
`;

/**
 * Low mist that creeps over the forest floor around the casting ground and the spirits' feet.
 * Several terrain-following layers, each flowing at its own speed with domain-warped noise.
 */
export class GroundMist {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(lanterns: LanternUniform, time: { value: number }, motion: { value: number }) {
    this.group.name = 'Creeping ground mist';
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: time, uMotion: motion, uLanterns: lanterns, ...SPELL_LIGHTS },
      vertexShader: `
        uniform float uTime; uniform float uMotion; attribute float aLayer;
        varying vec3 vWorld; varying float vDepth; varying float vLayer;
        void main(){
          vec3 p = position;
          p.y += sin(p.x * 0.12 + uTime * 0.4 + aLayer * 2.0) * 0.12 * uMotion;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz; vLayer = aLayer;
          vec4 mv = viewMatrix * world; vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime; varying vec3 vWorld; varying float vDepth; varying float vLayer;
        ${LANTERN_GLSL}
        ${NOISE_GLSL}
        void main(){
          // Fade at the camera (no fog in the player's face) and far away (the fog banks take over).
          // Evaluated first so the noise below is skipped wherever the mist is invisible anyway.
          float near = smoothstep(2.5, 9.0, vDepth);
          float far = 1.0 - smoothstep(38.0, 62.0, vDepth);
          if (near * far < 0.01) discard;
          float speed = 0.09 + vLayer * 0.05;
          vec2 wind = vec2(uTime * speed, uTime * speed * 0.35);
          vec2 p = vWorld.xz * (0.11 - vLayer * 0.025) - wind;
          vec2 warp = vec2(aNoise(p * 0.8 + uTime * 0.03), aNoise(p * 0.8 + 5.2 - uTime * 0.025)) - 0.5;
          float mist = smoothstep(0.32, 0.85, aFbm(p + warp * 1.8));
          float alpha = mist * near * far * (0.2 - vLayer * 0.05);
          if (alpha < 0.004) discard;
          float lamp = lanternIllumination(vWorld);
          vec3 c = mix(vec3(0.17, 0.23, 0.24), vec3(0.3, 0.37, 0.4), mist * 0.6) + vec3(0.48, 0.27, 0.1) * lamp * 0.8 + spellIllumination(vWorld) * 0.3;
          gl_FragColor = vec4(c, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const layers = [0.18, 0.55, 1.05];
    layers.forEach((offset, layer) => {
      const geometry = new THREE.PlaneGeometry(96, 78, 48, 40);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, 0, -20);
      const p = geometry.getAttribute('position');
      const layerAttr = new Float32Array(p.count).fill(layer);
      for (let i = 0; i < p.count; i++) p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) + offset);
      geometry.setAttribute('aLayer', new THREE.BufferAttribute(layerAttr, 1));
      geometry.computeBoundingSphere();
      this.geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.renderOrder = 1;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    });
  }

  dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.material.dispose();
    this.group.removeFromParent();
  }
}

/**
 * A handful of soft fog wisps drifting through the middle distance in front of the player.
 * They move visibly, so the air itself feels alive, but stay faint enough never to hide a target.
 */
export class FogWisps {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;

  constructor(time: { value: number }, motion: { value: number }) {
    const random = seededRandom(0x51f7);
    const count = 18;
    const origins = new Float32Array(count * 4);
    const sizes = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const z = SPAWN.z - 6 - random() * 30;
      const x = (random() - 0.5) * 40;
      origins.set([x, terrainHeight(x, z) + 0.8 + random() * 2.6, z, random() * 100], i * 4);
      sizes.set([5 + random() * 8, 1.6 + random() * 2.2], i * 2);
    }
    const source = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(source.index);
    geometry.setAttribute('position', source.getAttribute('position'));
    geometry.setAttribute('uv', source.getAttribute('uv'));
    geometry.setAttribute('wOrigin', new THREE.InstancedBufferAttribute(origins, 4));
    geometry.setAttribute('wSize', new THREE.InstancedBufferAttribute(sizes, 2));
    geometry.instanceCount = count;
    source.dispose();
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: time, uMotion: motion },
      vertexShader: `
        attribute vec4 wOrigin; attribute vec2 wSize; uniform float uTime; uniform float uMotion;
        varying vec2 vUv; varying float vSeed; varying float vDepth; varying float vFade;
        void main(){
          vUv = uv; vSeed = wOrigin.w;
          vec3 center = wOrigin.xyz;
          // Each wisp crosses the clearing on the wind and wraps around, rising and sinking as it goes.
          float travel = mod(center.x + uTime * (0.35 + fract(vSeed) * 0.4) * uMotion + 24.0, 48.0) - 24.0;
          center.x = travel;
          center.y += sin(uTime * 0.2 + vSeed) * 0.35 * uMotion;
          vec4 mv = viewMatrix * vec4(center, 1.0);
          mv.xy += position.xy * wSize;
          vDepth = -mv.z;
          // Fade in and out at the ends of the loop so the wrap is invisible.
          vFade = (1.0 - smoothstep(17.0, 24.0, abs(travel)));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vDepth; varying float vFade;
        ${NOISE_GLSL}
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float body = 1.0 - smoothstep(0.2, 1.0, length(p * vec2(1.0, 1.6)));
          float wisp = smoothstep(0.35, 0.8, aFbm(vUv * vec2(3.0, 1.6) + vec2(uTime * 0.05, fract(vSeed) * 9.0)));
          float alpha = body * wisp * 0.11 * smoothstep(3.0, 8.0, vDepth) * vFade;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(vec3(0.33, 0.4, 0.43), alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.group.add(this.mesh);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.group.removeFromParent();
  }
}

/** Shafts of moonlight slanting down through the canopy into the clearing, slowly shimmering. */
export class MoonShafts {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry = new THREE.PlaneGeometry(1, 1, 1, 1);

  constructor(time: { value: number }, motion: { value: number }) {
    this.geometry.translate(0, 0.5, 0);
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: time, uMotion: motion, uSeed: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying float vDepth; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: `
        uniform float uTime; uniform float uMotion; uniform float uSeed; varying vec2 vUv; varying float vDepth;
        ${NOISE_GLSL}
        void main(){
          float across = 1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5));
          float down = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
          float shimmer = 0.55 + 0.45 * aNoise(vec2(vUv.x * 6.0 + uSeed, vUv.y * 2.0 - uTime * 0.08 * uMotion));
          float dust = pow(aNoise(vUv * vec2(40.0, 90.0) + vec2(uSeed, -uTime * 0.6 * uMotion)), 14.0) * 2.0;
          float pulse = 0.75 + 0.25 * sin(uTime * 0.23 + uSeed * 3.0);
          float alpha = across * across * down * (shimmer * 0.055 + dust * 0.08) * pulse * smoothstep(4.0, 12.0, vDepth);
          gl_FragColor = vec4(vec3(0.62, 0.74, 0.86), alpha);
        }`,
    });
    const random = seededRandom(0x700d);
    // In the authored world light comes down only where the canopy opens over the clearing.
    const sites = AUTHORED_WORLD || PAINTED_WORLD ? [[2.5, -11], [-4, -19]] : [[-7, -6], [2.5, -10], [9, -17], [-3, -20], [-12, -25]];
    for (const [x, z] of sites) {
      const material = this.material.clone();
      material.uniforms.uTime = time;
      material.uniforms.uMotion = motion;
      material.uniforms.uSeed.value = random() * 50;
      const shaft = new THREE.Mesh(this.geometry, material);
      const height = 22 + random() * 8;
      shaft.scale.set(1.6 + random() * 2.4, height, 1);
      shaft.position.set(x, terrainHeight(x, z) - 0.5, z);
      // Lean toward the moon, and turn broadside to the casting view.
      shaft.rotation.set(0, Math.atan2(x - SPAWN.x, z - SPAWN.z) + Math.PI, 0, 'YXZ');
      shaft.rotateZ(-MOON_DIRECTION.x * 0.55);
      shaft.renderOrder = 4;
      this.group.add(shaft);
    }
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose(); });
    this.material.dispose();
    this.geometry.dispose();
    this.group.removeFromParent();
  }
}

/**
 * Pairs of eyes in the dark between distant trees. Each pair opens for a few seconds, blinks,
 * and is gone again: entirely shader-timed, nothing on the CPU.
 */
export class Watchers {
  readonly group = new THREE.Group();
  private readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor(time: { value: number }) {
    const random = seededRandom(0xe7e5);
    const pairs = 16;
    const positions: number[] = [];
    const seeds: number[] = [];
    const tints: number[] = [];
    const palette = [[1, 0.62, 0.25], [0.85, 1, 0.45], [1, 0.32, 0.22], [0.6, 0.95, 1]];
    for (let i = 0; i < pairs; i++) {
      const angle = -Math.PI / 2 + (random() - 0.5) * Math.PI * 1.25;
      const radius = 30 + random() * 26;
      const x = SPAWN.x + Math.cos(angle) * radius;
      const z = SPAWN.z + Math.sin(angle) * radius;
      const y = terrainHeight(x, z) + 1.1 + random() * 1.8;
      const gap = 0.16 + random() * 0.1;
      const seed = random() * 100;
      const tint = palette[Math.floor(random() * palette.length)];
      for (const side of [-1, 1]) {
        positions.push(x + side * gap, y, z);
        seeds.push(seed);
        tints.push(...tint);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.setAttribute('aTint', new THREE.Float32BufferAttribute(tints, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: time },
      vertexShader: `
        attribute float aSeed; attribute vec3 aTint; uniform float uTime;
        varying float vAlpha; varying vec3 vTint;
        void main(){
          vTint = aTint;
          float period = 18.0 + fract(aSeed * 7.13) * 22.0;
          float phase = fract((uTime + aSeed * 13.0) / period);
          float open = smoothstep(0.0, 0.04, phase) * (1.0 - smoothstep(0.24, 0.3, phase));
          float blinkAt = fract(aSeed * 3.7) * 0.18 + 0.04;
          float blink = smoothstep(0.0, 0.006, abs(phase - blinkAt));
          vAlpha = open * blink;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(150.0 / -mv.z, 2.0, 6.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha; varying vec3 vTint;
        void main(){
          vec2 p = gl_PointCoord - 0.5; p.y *= 1.9;
          float d = length(p) * 2.0;
          if (d > 1.0 || vAlpha < 0.01) discard;
          gl_FragColor = vec4(vTint * 1.4, exp(-d * d * 5.0) * vAlpha * 0.85);
        }`,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.group.add(this.points);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.group.removeFromParent();
  }
}
