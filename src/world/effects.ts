import * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';
import {
  Trail, WHITE, clamp01, disposeGroup, easeInOut, easeOutBack, easeOutCubic, energy, flareTexture, glowSprite,
  ringTexture, rng, type FxContext,
} from './vfx.ts';

export interface SpellAnimation {
  group: THREE.Group;
  /** Called once when this spell reaches its impact beat. */
  setImpactCallback(callback: () => void): void;
  /** Return false after the final frame. */
  update(dt: number): boolean;
  dispose(): void;
}

/** A borrowed point light from the world's fixed pool (adding lights would recompile shaders). */
export type LightFlash = (position: THREE.Vector3, color: THREE.Color, intensity: number, duration: number, distance?: number) => void;

export interface SpellContext extends FxContext {
  groundY: number;
  cameraQuaternion: THREE.Quaternion;
  lightningStart?: THREE.Vector3;
  /** Camera-space depth of the target: bolt widths scale with it to keep a constant on-screen thickness. */
  depth?: number;
  hand?: 'left' | 'right' | 'both';
  light?: LightFlash;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Build a short, spell-specific Three.js effect. All geometry is owned and disposed here. */
export function createSpellAnimation(
  kind: SpellEffect,
  origin: THREE.Vector3,
  target: THREE.Vector3,
  color: THREE.Color,
  detail?: string,
  context?: SpellContext,
): SpellAnimation {
  const ctx: SpellContext = context ?? { groundY: target.y - 1, cameraQuaternion: new THREE.Quaternion() };
  switch (kind) {
    case 'arrow': return arrow(origin, target, color, detail, ctx);
    case 'lightning': return lightning(target, color, ctx);
    case 'frost': return frost(target, color, ctx);
    case 'wind': return gale(origin, target, color, detail, ctx);
    case 'healing': return mend(origin, color, detail, ctx);
    case 'summon': return rise(target, color, ctx);
    case 'shield': return aegis(origin, color, ctx);
  }
}

function animate(
  group: THREE.Group,
  duration: number,
  tick: (t: number, age: number, dt: number) => void,
  impactAt = duration * 0.5,
  onImpact?: () => void,
  cleanup?: () => void,
): SpellAnimation {
  let age = 0;
  let impactCallback: (() => void) | undefined;
  let impacted = false;
  return {
    group,
    setImpactCallback(callback) { impactCallback = callback; },
    update(dt) {
      age += dt;
      if (!impacted && age >= impactAt) {
        impacted = true;
        onImpact?.();
        impactCallback?.();
      }
      tick(clamp01(age / duration), age, dt);
      return age < duration;
    },
    dispose() {
      cleanup?.();
      disposeGroup(group);
    },
  };
}

/** A camera-facing flat mesh (ring or flare) that the caller scales and fades. */
function facingPlane(texture: THREE.Texture, color: THREE.ColorRepresentation, size: number, quaternion?: THREE.Quaternion): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const material = energy(color, 0);
  material.map = texture;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  if (quaternion) mesh.quaternion.copy(quaternion);
  mesh.renderOrder = 7;
  return mesh;
}

/* ═══════════════════════════════ ARCANE ARROW ═══════════════════════════════ */

function arrowMesh(color: THREE.Color): { root: THREE.Group; materials: THREE.MeshBasicMaterial[]; halo: THREE.Sprite } {
  const root = new THREE.Group();
  const hot = color.clone().lerp(WHITE, 0.7);
  const materials: THREE.MeshBasicMaterial[] = [];
  const add = (geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial, y: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    materials.push(material);
    root.add(mesh);
    return mesh;
  };
  // A faceted energy head: an octahedron drawn out into a long diamond.
  const head = add(new THREE.OctahedronGeometry(1, 0), energy(hot, 1), 0.02);
  head.scale.set(0.07, 0.2, 0.07);
  const headGlow = add(new THREE.OctahedronGeometry(1, 0), energy(color, 0.45), 0.02);
  headGlow.scale.set(0.13, 0.3, 0.13);
  // Bright core shaft and a fainter sheath.
  add(new THREE.CylinderGeometry(0.011, 0.016, 0.95, 6), energy(hot, 0.95), -0.5);
  add(new THREE.CylinderGeometry(0.03, 0.026, 0.95, 8), energy(color, 0.28), -0.5);
  // Three vanes of light at the tail.
  const vane = new THREE.Shape();
  vane.moveTo(0, 0);
  vane.quadraticCurveTo(0.075, -0.05, 0.085, -0.2);
  vane.lineTo(0, -0.16);
  vane.closePath();
  for (let i = 0; i < 3; i++) {
    const fletch = add(new THREE.ShapeGeometry(vane), energy(color, 0.7), -0.8);
    fletch.rotation.y = (i / 3) * Math.PI * 2;
  }
  const halo = glowSprite(color, 0.75, undefined, 0.85);
  halo.position.y = 0.02;
  root.add(halo);
  return { root, materials, halo };
}

function arrow(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, detail: string | undefined, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const power = clamp01((Number(detail?.match(/(\d+)%/)?.[1]) || 65) / 100);
  // Release from the bow hand: just below and beside the aim point, close to the player, so the
  // flight is seen in three-quarter view instead of as a dot shrinking along the aim ray.
  const launch = origin.clone();
  if (ctx.cameraPosition) {
    const forward = origin.clone().sub(ctx.cameraPosition).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.cameraQuaternion);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(ctx.cameraQuaternion);
    launch.copy(ctx.cameraPosition).addScaledVector(forward, 2.4)
      .addScaledVector(down, 0.32)
      .addScaledVector(right, ctx.hand === 'left' ? -0.3 : 0.3);
  }
  const to = target.clone();
  const distance = Math.max(0.5, launch.distanceTo(to));
  const lift = Math.min(2.4, distance * 0.05) * (1.15 - power * 0.55);
  const pathPoint = (u: number, out: THREE.Vector3) => out.copy(launch).lerp(to, u).addScaledVector(UP, 4 * lift * u * (1 - u));
  const flight = THREE.MathUtils.clamp(distance / (36 + power * 34), 0.16, 0.85);
  const duration = flight + 0.85;

  const { root, halo } = arrowMesh(color);
  root.scale.setScalar(0.95 + power * 0.55);
  group.add(root);
  const trail = new Trail(color, 0.12 * (0.7 + power * 0.7), 0.16 + power * 0.14, 40, 1.1);
  const filament = new Trail(WHITE, 0.03, 0.1, 24, 1);
  group.add(trail.mesh, filament.mesh);

  const launchFlare = facingPlane(flareTexture(), color.clone().lerp(WHITE, 0.35), 1.4, ctx.cameraQuaternion);
  const launchRing = facingPlane(ringTexture(), color, 1, ctx.cameraQuaternion);
  launchFlare.position.copy(launch);
  launchRing.position.copy(launch);
  const impactFlare = facingPlane(flareTexture(), color.clone().lerp(WHITE, 0.45), 2.6, ctx.cameraQuaternion);
  const impactRing = facingPlane(ringTexture(), color, 1, ctx.cameraQuaternion);
  impactFlare.position.copy(to);
  impactRing.position.copy(to);
  group.add(launchFlare, launchRing, impactFlare, impactRing);

  const head = new THREE.Vector3(), ahead = new THREE.Vector3(), tangent = new THREE.Vector3();
  const sideA = new THREE.Vector3(), sideB = new THREE.Vector3(), mote = new THREE.Vector3();
  const direction = to.clone().sub(launch).normalize();
  const moteColor = color.clone().lerp(WHITE, 0.25);
  const sparkColor = color.clone().lerp(WHITE, 0.55);

  ctx.particles?.burst(launch, 14, { speed: 2.2, color: moteColor, size: 0.07, ttl: 0.35, drag: 3, style: 'spark' });

  const onImpact = () => {
    const back = direction.clone().negate();
    ctx.particles?.burst(to, Math.round(28 + power * 34), { speed: 7 + power * 5, direction: back, spread: 1.1, color: sparkColor, size: 0.06, ttl: 0.55, gravity: 7, drag: 1.2, style: 'spark' });
    ctx.particles?.burst(to, 18, { speed: 2.4, color, size: 0.2, sizeEnd: 0.02, ttl: 0.6, drag: 2.5, style: 'glow' });
    ctx.particles?.burst(to, 10, { speed: 4.5, color: WHITE, size: 0.05, ttl: 0.35, gravity: 9, style: 'spark' });
    ctx.mist?.burst(to, 6, { speed: 0.9, color: new THREE.Color('#5d6b63'), size: 0.9, sizeEnd: 1.8, alpha: 0.32, ttl: 1.1, drag: 1.5, style: 'mist' });
    ctx.light?.(to, color, 9 + power * 6, 0.45, 9);
    ctx.screen?.shake(0.06 + power * 0.1);
  };

  return animate(group, duration, (_t, age, dt) => {
    const cam = ctx.cameraPosition;
    if (age < flight) {
      const u = 1 - Math.pow(1 - age / flight, 1.25);
      pathPoint(u, head);
      pathPoint(Math.min(1, u + 0.02), ahead);
      tangent.subVectors(ahead, head);
      if (tangent.lengthSq() < 1e-8) tangent.copy(direction);
      tangent.normalize();
      root.position.copy(head);
      root.quaternion.setFromUnitVectors(UP, tangent);
      trail.push(head);
      filament.push(head);
      // Motes spiral off the shaft and hang in the air behind it.
      sideA.set(tangent.y, -tangent.x, 0);
      if (sideA.lengthSq() < 1e-6) sideA.set(1, 0, 0);
      sideA.normalize();
      sideB.crossVectors(tangent, sideA);
      for (let k = 0; k < 3; k++) {
        const a = age * 38 + k * 2.094;
        mote.copy(head).addScaledVector(tangent, -0.3 - Math.random() * 0.4)
          .addScaledVector(sideA, Math.cos(a) * 0.07).addScaledVector(sideB, Math.sin(a) * 0.07);
        ctx.particles?.emit({
          x: mote.x, y: mote.y, z: mote.z,
          vx: (Math.random() - 0.5) * 0.4, vy: Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.4,
          color: moteColor, size: 0.06 + power * 0.04, ttl: 0.4 + Math.random() * 0.25, drag: 2, style: 'glow',
        });
      }
    } else {
      root.position.copy(to);
      const since = age - flight;
      // The head embeds for a beat, then the bolt of light shatters.
      root.visible = since < 0.07;
      halo.visible = root.visible;
    }
    const launchAge = age / 0.22;
    launchFlare.scale.setScalar(0.4 + easeOutCubic(launchAge) * 1.1);
    launchFlare.material.opacity = clamp01(1 - launchAge) * 0.9;
    launchRing.scale.setScalar(0.25 + easeOutCubic(age / 0.3) * 1.3);
    launchRing.material.opacity = clamp01(1 - age / 0.3) * 0.8;
    const impactAge = (age - flight) / 0.45;
    impactFlare.visible = impactRing.visible = impactAge >= 0;
    if (impactAge >= 0) {
      impactFlare.scale.setScalar(0.3 + easeOutCubic(impactAge * 2.5) * (0.8 + power * 0.6));
      impactFlare.material.opacity = clamp01(1 - impactAge * 2) * 1;
      impactRing.scale.setScalar(0.2 + easeOutCubic(impactAge) * (2.2 + power * 1.6));
      impactRing.material.opacity = clamp01(1 - impactAge) * 0.85;
    }
    const fade = clamp01(1 - Math.max(0, age - flight) / 0.6);
    trail.opacity = fade;
    filament.opacity = fade;
    trail.update(dt, cam);
    filament.update(dt, cam);
  }, flight, onImpact, () => { trail.dispose(); filament.dispose(); });
}

/* ═══════════════════════════════ LIGHTNING ═══════════════════════════════ */

export type P2 = { x: number; y: number };

/**
 * Fractal midpoint displacement. Displacement is a fraction of each segment's own length, so a short
 * bolt is a scaled copy of a long one: never the fat, squashed zig-zag of fixed world-space jitter.
 */
export function boltPath(start: P2, end: P2, random: () => number, roughness: number, levels: number): P2[] {
  let points: P2[] = [start, end];
  let amount = Math.hypot(end.x - start.x, end.y - start.y) * roughness;
  for (let level = 0; level < levels; level++) {
    const next: P2[] = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      const offset = (random() * 2 - 1) * amount;
      next.push({ x: (a.x + b.x) / 2 - (dy / length) * offset, y: (a.y + b.y) / 2 + (dx / length) * offset }, b);
    }
    points = next;
    amount *= 0.52;
  }
  return points;
}

/** A flat ribbon in the camera plane (local XY) with mitred joints, so segments never overlap into lumps. */
function ribbonGeometry(points: readonly P2[], width: (u: number) => number): THREE.BufferGeometry {
  const n = points.length;
  const positions = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x, ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    const half = width(i / (n - 1)) * 0.5;
    const p = points[i];
    positions.set([p.x - ty * half, p.y + tx * half, 0, p.x + ty * half, p.y - tx * half, 0], i * 6);
    uv.set([i / (n - 1), 0, i / (n - 1), 1], i * 4);
    if (i < n - 1) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

function boltMaterial(color: THREE.Color, core: number, glow: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uIntensity: { value: 1 }, uCore: { value: core }, uGlow: { value: glow } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uColor; uniform float uIntensity; uniform float uCore; uniform float uGlow; varying vec2 vUv;
      void main(){
        float x = abs(vUv.y * 2.0 - 1.0);
        float core = (1.0 - smoothstep(0.0, 0.42, x)) * uCore;
        float glow = exp(-x * x * 3.5) * uGlow;
        vec3 c = mix(uColor * 1.6, vec3(1.25), core);
        gl_FragColor = vec4(c, (core + glow * 0.55) * uIntensity);
      }`,
  });
}

interface BoltVariant { group: THREE.Group; main: THREE.Mesh; mainHalo: THREE.Mesh; branches: THREE.Mesh[]; mainSegments: number }

function buildBolt(start: P2, end: P2, width: number, seed: number, coreMat: THREE.ShaderMaterial, haloMat: THREE.ShaderMaterial, branchMat: THREE.ShaderMaterial): BoltVariant {
  const random = rng(seed);
  const group = new THREE.Group();
  const mainPoints = boltPath(start, end, random, 0.2, 6);
  const taper = (u: number) => width * (0.75 + 0.25 * (1 - u)) * (0.85 + random() * 0.3);
  const main = new THREE.Mesh(ribbonGeometry(mainPoints, taper), coreMat);
  const mainHalo = new THREE.Mesh(ribbonGeometry(mainPoints, (u) => taper(u) * 7), haloMat);
  group.add(mainHalo, main);
  const branches: THREE.Mesh[] = [];
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const count = 3 + Math.floor(random() * 3);
  for (let b = 0; b < count; b++) {
    const at = Math.floor(mainPoints.length * (0.12 + random() * 0.62));
    const from = mainPoints[at], toward = mainPoints[Math.min(mainPoints.length - 1, at + 3)];
    const dir = Math.atan2(toward.y - from.y, toward.x - from.x) + (random() < 0.5 ? -1 : 1) * (0.35 + random() * 0.6);
    const reach = length * (0.1 + random() * 0.22);
    const tip = { x: from.x + Math.cos(dir) * reach, y: from.y + Math.sin(dir) * reach };
    const points = boltPath(from, tip, random, 0.24, 4);
    const branch = new THREE.Mesh(ribbonGeometry(points, (u) => width * 0.6 * (1 - u * 0.85)), branchMat);
    branch.userData.reveal = at / (mainPoints.length - 1);
    branches.push(branch);
    group.add(branch);
  }
  return { group, main, mainHalo, branches, mainSegments: mainPoints.length - 1 };
}

function lightning(target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(target);
  group.quaternion.copy(ctx.cameraQuaternion);
  const inverse = ctx.cameraQuaternion.clone().invert();
  const startLocal = ctx.lightningStart
    ? ctx.lightningStart.clone().sub(target).applyQuaternion(inverse)
    : new THREE.Vector3(0, 5.1, 0);
  // Constant on-screen thickness: width grows with the target's distance from the camera.
  const depth = Math.max(1.5, ctx.depth ?? 10);
  const width = THREE.MathUtils.clamp(depth * 0.0042, 0.018, 0.4);
  const light = color.clone().lerp(WHITE, 0.25);
  const coreMat = boltMaterial(light, 1, 0.6);
  const haloMat = boltMaterial(color, 0, 0.5);
  const branchMat = boltMaterial(light, 0.85, 0.5);
  const seed = Math.floor(Math.abs(target.x * 131 + target.z * 71 + target.y * 17)) + 7;
  const start = { x: startLocal.x, y: startLocal.y };
  const variants = [0, 1, 2].map((v) => buildBolt(start, { x: 0, y: 0 }, width, seed + v * 977, coreMat, haloMat, branchMat));
  for (const v of variants) { v.group.visible = false; group.add(v.group); }
  const boltLength = Math.hypot(start.x, start.y);

  // Electric crawl: short arcs licking out from the strike point.
  const crawlMat = boltMaterial(light, 0.9, 0.6);
  const crawlRandom = rng(seed + 31);
  const crawls: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + crawlRandom() * 0.8;
    const reach = Math.max(0.35, boltLength * (0.05 + crawlRandom() * 0.06));
    const points = boltPath({ x: 0, y: 0 }, { x: Math.cos(a) * reach, y: Math.sin(a) * reach * 0.45 }, crawlRandom, 0.3, 3);
    const mesh = new THREE.Mesh(ribbonGeometry(points, (u) => width * 0.5 * (1 - u)), crawlMat);
    mesh.visible = false;
    crawls.push(mesh);
    group.add(mesh);
  }
  const flare = facingPlane(flareTexture(), light, Math.max(2.2, width * 90));
  flare.material.depthTest = false;
  group.add(flare);

  // World-aligned ground pieces under the strike.
  const ground = new THREE.Group();
  ground.quaternion.copy(inverse);
  const groundDrop = THREE.MathUtils.clamp(ctx.groundY - target.y + 0.03, -6, 0);
  ground.position.copy(new THREE.Vector3(0, groundDrop, 0).applyQuaternion(inverse));
  group.add(ground);
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { uOpacity: { value: 0 }, uSeed: { value: crawlRandom() * 10 }, uGlow: { value: color.clone() }, uHeat: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform float uOpacity; uniform float uSeed; uniform vec3 uGlow; uniform float uHeat; varying vec2 vP;
      void main(){
        float r = length(vP), a = atan(vP.y, vP.x);
        float edge = 0.72 + 0.14 * sin(a * 7.0 + uSeed) + 0.08 * sin(a * 13.0 - uSeed * 1.7);
        float burn = 1.0 - smoothstep(edge * 0.35, edge, r);
        float cracks = pow(max(0.0, sin(a * 11.0 + sin(r * 9.0 + uSeed) * 1.4)), 30.0) * (1.0 - smoothstep(0.2, edge, r));
        vec3 c = mix(vec3(0.02, 0.025, 0.03), uGlow * 1.6, cracks * uHeat + (1.0 - smoothstep(0.0, 0.25, r)) * uHeat * 0.6);
        gl_FragColor = vec4(c, (burn * 0.62 + cracks * 0.5) * uOpacity);
      }`,
  }));
  scorch.rotation.x = -Math.PI / 2;
  scorch.scale.setScalar(THREE.MathUtils.clamp(width * 30, 0.9, 2.6));
  scorch.renderOrder = 2;
  const groundRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), (() => { const m = energy(light, 0); m.map = ringTexture(); return m; })());
  groundRing.rotation.x = -Math.PI / 2;
  groundRing.position.y = 0.04;
  ground.add(scorch, groundRing);

  const duration = 1.9;
  const impactAt = 0.15;
  const sparkColor = color.clone().lerp(WHITE, 0.6);
  const strikePoint = target.clone().add(new THREE.Vector3(0, groundDrop * 0.5, 0));
  const onImpact = () => {
    ctx.particles?.burst(target, 60, { speed: 9, color: sparkColor, size: 0.07, ttl: 0.7, gravity: 9, drag: 1.4, style: 'spark' });
    ctx.particles?.burst(target, 24, { speed: 1.4, direction: UP, spread: 0.9, color, size: 0.12, sizeEnd: 0.03, ttl: 1.6, gravity: -0.7, drag: 0.8, style: 'glow' });
    ctx.mist?.burst(strikePoint, 9, { speed: 1.3, direction: UP, spread: 1.2, color: new THREE.Color('#3a4446'), size: 1.1, sizeEnd: 2.6, alpha: 0.4, ttl: 1.8, drag: 1.2, gravity: -0.25, style: 'mist' });
    ctx.light?.(target, light, 22, 0.55, 16);
    ctx.screen?.flash(light, 0.32);
    ctx.screen?.shake(0.32);
  };

  // Brightness envelope: leader, a dark beat, the return stroke, a re-strike, then the fade.
  const pattern: Array<[number, number, number]> = [[0.15, 0, 1], [0.2, 0, 0.18], [0.3, 1, 1], [0.35, 1, 0.3], [0.44, 2, 1], [0.95, 2, -1]];
  return animate(group, duration, (_t, age) => {
    let variant = 2, intensity = 0;
    for (const [until, v, level] of pattern) {
      if (age < until) { variant = v; intensity = level < 0 ? clamp01(1 - (age - 0.44) / 0.51) : level; break; }
    }
    variants.forEach((v, i) => { v.group.visible = i === variant && intensity > 0.01; });
    const active = variants[variant];
    const leader = clamp01(age / impactAt);
    (active.main.geometry as THREE.BufferGeometry).setDrawRange(0, Math.ceil(active.mainSegments * leader) * 6);
    (active.mainHalo.geometry as THREE.BufferGeometry).setDrawRange(0, Math.ceil(active.mainSegments * leader) * 6);
    for (const branch of active.branches) branch.visible = leader >= branch.userData.reveal;
    coreMat.uniforms.uIntensity.value = intensity;
    haloMat.uniforms.uIntensity.value = intensity * 0.9;
    branchMat.uniforms.uIntensity.value = intensity * 0.85;
    const crawl = age > impactAt && age < impactAt + 0.55;
    crawlMat.uniforms.uIntensity.value = crawl ? clamp01(1 - (age - impactAt) / 0.55) : 0;
    for (const mesh of crawls) mesh.visible = crawl && Math.random() > 0.45;
    const flash = age >= impactAt ? clamp01(1 - (age - impactAt) / 0.35) : 0;
    flare.material.opacity = flash * Math.max(intensity, 0.3);
    flare.scale.setScalar(0.6 + flash * 0.6);
    const burned = age >= impactAt;
    (scorch.material as THREE.ShaderMaterial).uniforms.uOpacity.value = burned ? clamp01((age - impactAt) / 0.08) * clamp01((duration - age) / 0.6) : 0;
    (scorch.material as THREE.ShaderMaterial).uniforms.uHeat.value = burned ? clamp01(1 - (age - impactAt) / 1.1) : 1;
    const ringAge = (age - impactAt) / 0.5;
    groundRing.visible = ringAge >= 0 && ringAge <= 1;
    groundRing.scale.setScalar(0.3 + easeOutCubic(ringAge) * THREE.MathUtils.clamp(width * 110, 3, 8));
    groundRing.material.opacity = clamp01(1 - ringAge) * 0.7;
  }, impactAt, onImpact);
}

/* ═══════════════════════════════ FROST ═══════════════════════════════ */

/** One smooth, tapering thorn of ice: a lathe surface with a curved profile instead of a faceted cone. */
function iceThornGeometry(): THREE.LatheGeometry {
  const profile: THREE.Vector2[] = [];
  const rows = 14;
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const belly = Math.sin(Math.min(1, u * 1.9) * Math.PI * 0.5);
    const radius = Math.max(0.0015, 0.5 * (1 - Math.pow(u, 1.45)) * (0.55 + 0.45 * belly) * (u < 0.04 ? 0.8 + u * 5 : 1));
    profile.push(new THREE.Vector2(radius, u));
  }
  return new THREE.LatheGeometry(profile, 18);
}

function iceMaterial(deep: THREE.Color, light: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 1 }, uDeep: { value: deep }, uLight: { value: light }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){ vH = uv.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uDeep; uniform vec3 uLight; uniform float uTime; varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(1.0 - facing, 1.8);
        float core = pow(facing, 2.5) * (1.0 - vH);
        float glint = pow(max(0.0, sin(vH * 24.0 - uTime * 3.0)), 18.0) * rim;
        vec3 c = mix(uDeep, uLight, smoothstep(0.0, 1.0, vH * 0.85 + rim * 0.55)) * (0.5 + core * 0.55) + uLight * (rim * 0.45 + glint);
        float a = (0.16 + rim * 0.55 + core * 0.22 + vH * 0.2 + glint) * uOpacity;
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function frost(target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(target);
  const random = rng(Math.floor(target.x * 97 + target.z * 53 + 1013));
  // Spikes erupt from the ground under the impact point (falls back to an offset in headless use).
  const base = THREE.MathUtils.clamp(ctx.groundY - target.y + 0.02, -3.5, -0.05);
  const reach = 1 + Math.min(1.2, -base * 0.45);
  const deep = color.clone().multiplyScalar(0.55).lerp(new THREE.Color('#1d4f7a'), 0.4);
  const light = color.clone().lerp(new THREE.Color('#f2fbff'), 0.7);
  const material = iceMaterial(deep, light);
  const geometry = iceThornGeometry();

  // Soft frozen ground patch: feathered, irregular edge with fine radial cracks, not a hard ring.
  const patch = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: light.clone() }, uSeed: { value: random() * 20 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uOpacity; uniform vec3 uColor; uniform float uSeed; varying vec2 vP;
      void main(){
        float r = length(vP); float a = atan(vP.y, vP.x);
        float edge = 0.78 + 0.16 * sin(a * 5.0 + uSeed) + 0.07 * sin(a * 11.0 - uSeed * 2.0);
        float body = (1.0 - smoothstep(edge - 0.42, edge, r));
        float cracks = pow(max(0.0, sin(a * 9.0 + sin(r * 7.0 + uSeed) * 1.3)), 28.0) * smoothstep(0.08, 0.3, r) * (1.0 - smoothstep(0.45, edge, r));
        float frostGrain = 0.55 + 0.45 * sin(vP.x * 38.0 + uSeed) * sin(vP.y * 41.0 - uSeed);
        float alpha = (body * 0.17 * frostGrain + cracks * 0.5) * uOpacity;
        gl_FragColor = vec4(uColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = base + 0.03;
  patch.renderOrder = 2;
  group.add(patch);

  interface Thorn { mesh: THREE.Mesh; delay: number; height: number; width: number; tip: THREE.Vector3 }
  const thorns: Thorn[] = [];
  const addThorn = (x: number, z: number, height: number, width: number, lean: number, delay: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, base, z);
    const away = Math.atan2(z, x);
    mesh.rotation.set(Math.sin(away) * lean, random() * Math.PI, -Math.cos(away) * lean);
    mesh.scale.set(0.001, 0.001, 0.001);
    mesh.renderOrder = 3;
    group.add(mesh);
    const tip = new THREE.Vector3(0, 1, 0).applyEuler(mesh.rotation).multiplyScalar(height).add(mesh.position).add(target);
    thorns.push({ mesh, delay, height, width, tip });
  };
  // Central tall cluster, an irregular ring of mid thorns, then many tiny frost needles at the edge.
  addThorn(0, 0, (1.55 + random() * 0.3) * reach, 0.36, 0.04, 0);
  addThorn(0.18, 0.1, 1.05 * reach, 0.26, 0.28, 0.03);
  addThorn(-0.17, -0.08, 0.9 * reach, 0.24, -0.3, 0.05);
  const ringCount = 9;
  for (let i = 0; i < ringCount; i++) {
    const angle = (i + random() * 0.6) / ringCount * Math.PI * 2;
    const radius = 0.5 + random() * 0.38;
    addThorn(Math.cos(angle) * radius, Math.sin(angle) * radius, (0.55 + random() * 0.75) * reach, 0.15 + random() * 0.1, 0.18 + random() * 0.22, 0.05 + random() * 0.14);
  }
  for (let i = 0; i < 14; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 0.25 + random() * 1.15;
    addThorn(Math.cos(angle) * radius, Math.sin(angle) * radius, (0.18 + random() * 0.32) * reach, 0.06 + random() * 0.05, 0.25 + random() * 0.35, 0.1 + random() * 0.2);
  }

  const groundPoint = target.clone().setY(target.y + base + 0.1);
  const frostWhite = new THREE.Color('#e6f6ff');
  const onImpact = () => {
    ctx.mist?.burst(groundPoint, 14, { speed: 1.6, color: new THREE.Color('#cfe6f2'), size: 0.8, sizeEnd: 2.2, alpha: 0.36, ttl: 1.8, drag: 1.6, gravity: -0.1, style: 'mist' });
    ctx.particles?.burst(groundPoint, 30, { speed: 3.4, direction: UP, spread: 1.4, color: light, size: 0.06, ttl: 0.9, gravity: 3, drag: 1.2, style: 'spark' });
    ctx.light?.(target, light, 10, 0.8, 10);
    ctx.screen?.shake(0.08);
  };
  const duration = 1.5;
  let shattered = false;
  return animate(group, duration, (t, age, dt) => {
    material.uniforms.uTime.value = age;
    const open = easeOutCubic(t / 0.15);
    (patch.material as THREE.ShaderMaterial).uniforms.uOpacity.value = clamp01(open) * clamp01(1 - Math.max(0, t - 0.6) / 0.4);
    patch.scale.setScalar(0.35 + easeOutCubic(Math.min(1, t / 0.35)) * 1.45);
    const thaw = clamp01((age - 0.95) / 0.35);
    material.uniforms.uOpacity.value = 1 - thaw;
    thorns.forEach(({ mesh, delay, height, width, tip }) => {
      const grow = easeOutCubic((age - delay) / 0.26);
      // Slight overshoot-and-settle makes the burst feel like brittle crystal snapping up.
      const settle = 1 + Math.sin(clamp01((age - delay) / 0.4) * Math.PI) * 0.06;
      mesh.visible = grow > 0 && thaw < 1;
      const shrink = 1 - thaw * 0.6;
      mesh.scale.set(width * (0.35 + grow * 0.65) * shrink, height * grow * settle * shrink, width * (0.35 + grow * 0.65) * shrink);
      // Cold glints twinkle along the crystal while it stands.
      if (grow > 0.9 && thaw === 0 && Math.random() < dt * 4) {
        ctx.particles?.emit({ x: tip.x, y: tip.y, z: tip.z, vx: 0, vy: 0.1, vz: 0, color: frostWhite, size: 0.16, sizeEnd: 0.01, ttl: 0.35, style: 'spark' });
      }
    });
    if (!shattered && age >= 0.95) {
      shattered = true;
      // The ice breaks apart rather than simply fading.
      for (const thorn of thorns.slice(0, 12)) {
        const mid = thorn.tip.clone().lerp(groundPoint, 0.5);
        ctx.particles?.burst(mid, 5, { speed: 2.6, color: light, size: 0.07, ttl: 0.7, gravity: 8, drag: 0.6, style: 'spark' });
      }
      ctx.mist?.burst(groundPoint, 8, { speed: 0.8, color: new THREE.Color('#d8eef8'), size: 1, sizeEnd: 2, alpha: 0.25, ttl: 1.2, style: 'mist' });
    }
  }, 0.12, onImpact);
}

/* ═══════════════════════════════ GALE ═══════════════════════════════ */

function gale(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, detail: string | undefined, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const sign = detail === 'left' ? -1 : 1;
  const direction = target.clone().sub(origin);
  if (direction.lengthSq() < 0.01) direction.set(0, 0, -1);
  direction.normalize();
  const right = new THREE.Vector3().crossVectors(direction, UP);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, direction).normalize();
  const from = origin.clone().addScaledVector(right, -sign * 2.2);
  const to = target.clone();
  const random = rng(Math.floor(Math.abs(origin.x * 13 + target.z * 7)) + 3);
  interface Streak { trail: Trail; phase: number; radius: number; delay: number; turns: number }
  const pale = color.clone().lerp(WHITE, 0.4);
  const streaks: Streak[] = Array.from({ length: 7 }, (_, i) => {
    const trail = new Trail(i % 3 === 0 ? pale : color, 0.05 + random() * 0.07, 0.3, 40, i % 3 === 0 ? 1 : 0.4);
    group.add(trail.mesh);
    return { trail, phase: random() * Math.PI * 2, radius: 0.25 + random() * 0.55, delay: i * 0.035 + random() * 0.04, turns: (1.1 + random() * 0.8) * (i % 2 ? 1 : -1) };
  });
  const vortex = facingPlane(ringTexture(), pale, 1, ctx.cameraQuaternion);
  vortex.position.copy(to);
  group.add(vortex);
  const leafColors = [new THREE.Color('#9fb86f'), new THREE.Color('#c9b26a'), new THREE.Color('#6f9a6a')];
  const head = new THREE.Vector3();
  const flightTime = 0.62;
  const onImpact = () => {
    ctx.particles?.burst(to, 26, { speed: 3.4, color: pale, size: 0.1, sizeEnd: 0.02, ttl: 0.8, drag: 2, style: 'glow' });
    ctx.mist?.burst(to, 10, { speed: 2.2, color: new THREE.Color('#9fb0a6'), size: 0.8, sizeEnd: 2.4, alpha: 0.28, ttl: 1.1, drag: 2, style: 'mist' });
    ctx.light?.(to, color, 6, 0.4, 8);
    ctx.screen?.shake(0.07);
  };
  return animate(group, 1.35, (_t, age, dt) => {
    for (const s of streaks) {
      const u = (age - s.delay) / flightTime;
      if (u >= 0 && u <= 1) {
        const e = easeInOut(u);
        const a = s.phase + e * s.turns * Math.PI * 2;
        const r = s.radius * (1 - e * 0.55);
        head.copy(from).lerp(to, e).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r * 0.7);
        s.trail.push(head);
        if (Math.random() < 0.55) {
          // Leaves and grit caught in the wind.
          ctx.mist?.emit({
            x: head.x, y: head.y, z: head.z,
            vx: direction.x * 3 + (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.3) * 1.2, vz: direction.z * 3 + (Math.random() - 0.5) * 1.5,
            color: leafColors[Math.floor(Math.random() * 3)], size: 0.06 + Math.random() * 0.05, sizeEnd: 0.05, alpha: 0.9, ttl: 0.9, drag: 1.4, gravity: 1.2, style: 'spark',
          });
        }
      }
      s.trail.opacity = clamp01(1 - Math.max(0, age - 0.9) / 0.45);
      s.trail.update(dt, ctx.cameraPosition);
    }
    const v = (age - flightTime * 0.85) / 0.5;
    vortex.visible = v >= 0 && v <= 1;
    vortex.scale.setScalar(0.4 + easeOutCubic(v) * 3);
    vortex.material.opacity = clamp01(1 - v) * 0.7;
    vortex.rotation.z += dt * 6;
  }, flightTime, onImpact, () => streaks.forEach((s) => s.trail.dispose()));
}

/* ═══════════════════════════════ RUNE SIGILS ═══════════════════════════════ */

function runeMaterial(color: THREE.Color, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uOpacity: { value: 0 }, uReveal: { value: 0 }, uSeed: { value: seed } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uReveal; uniform float uSeed; varying vec2 vUv;
      float ring(float r, float c, float w){ return (1.0 - smoothstep(0.0, w, abs(r - c))); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
        float a = atan(p.y, p.x);
        float rot = uTime * 0.55, counter = -uTime * 0.9;
        float m = ring(r, 0.93, 0.016) + ring(r, 0.8, 0.01) * 0.8 + ring(r, 0.44, 0.012) * 0.7 + ring(r, 0.2, 0.01) * 0.5;
        float cells = 28.0;
        float cell = floor(fract((a + rot) / 6.2831853) * cells);
        float within = fract(fract((a + rot) / 6.2831853) * cells);
        float glyph = step(0.42, fract(sin(cell * 12.9898 + uSeed) * 43758.5453));
        float strokeA = (1.0 - smoothstep(0.0, 0.1, abs(within - 0.5))) * step(0.82, r) * step(r, 0.91);
        float strokeB = step(0.25, within) * step(within, 0.75) * ring(r, 0.865, 0.008);
        float runes = (strokeA * glyph + strokeB * (1.0 - glyph)) * 0.95;
        // Inner hexagram that turns against the outer ring.
        float hexR = cos(3.14159 / 6.0) / cos(mod(a + counter, 3.14159 / 3.0) - 3.14159 / 6.0);
        float hexA = ring(r * hexR, 0.62, 0.012);
        float hexB = 0.0;
        { float a2 = a + counter + 3.14159 / 6.0; float h2 = cos(3.14159 / 6.0) / cos(mod(a2, 3.14159 / 3.0) - 3.14159 / 6.0); hexB = ring(r * h2, 0.62, 0.012); }
        float spokes = (1.0 - smoothstep(0.0, 0.012, abs(sin(3.0 * (a + counter))) * r)) * step(0.2, r) * step(r, 0.44);
        float sweep = step(fract((a + 3.14159) / 6.2831853), uReveal);
        float shape = (m + runes + (hexA + hexB) * 0.75 + spokes * 0.6) * sweep;
        float glow = exp(-r * r * 3.0) * 0.12;
        vec3 c = mix(uColor * 1.5, vec3(1.2), clamp(shape - 0.6, 0.0, 1.0));
        gl_FragColor = vec4(c, (shape + glow) * uOpacity);
      }`,
  });
}

function mend(origin: THREE.Vector3, color: THREE.Color, detail: string | undefined, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(origin);
  group.quaternion.copy(ctx.cameraQuaternion);
  const spin = detail === 'ccw' ? -1 : 1;
  const sigilMat = runeMaterial(color.clone().lerp(WHITE, 0.15), 3.1);
  const sigil = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), sigilMat);
  sigil.renderOrder = 6;
  group.add(sigil);
  const bloom = glowSprite(color, 2.4, undefined, 0);
  group.add(bloom);
  const below = -1.4;
  const world = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const petal = color.clone().lerp(WHITE, 0.35);
  const onImpact = () => {
    ctx.screen?.flash(color, 0.2, 'edge');
    ctx.light?.(origin, color, 7, 1.1, 10);
  };
  return animate(group, 1.8, (t, age, dt) => {
    const open = easeOutBack(t / 0.28);
    sigil.scale.setScalar(0.3 + open * 0.75);
    sigil.rotation.z = spin * age * 0.8;
    sigilMat.uniforms.uTime.value = age * spin;
    sigilMat.uniforms.uReveal.value = clamp01(t / 0.3);
    const fade = t > 0.7 ? clamp01((1 - t) / 0.3) : 1;
    sigilMat.uniforms.uOpacity.value = fade;
    bloom.material.opacity = Math.sin(clamp01(t) * Math.PI) * 0.35;
    // Healing motes rise in a spiral up through the sigil.
    if (t < 0.85) {
      for (let k = 0; k < 3; k++) {
        if (Math.random() > dt * 60) continue;
        const a = age * 5 * spin + k * 2.1 + Math.random() * 0.4;
        world.set(Math.cos(a) * 0.95, below + Math.random() * 0.4, Math.sin(a) * 0.25).applyQuaternion(ctx.cameraQuaternion).add(origin);
        velocity.set(-Math.sin(a) * 0.6 * spin, 1.8 + Math.random(), 0).applyQuaternion(ctx.cameraQuaternion);
        ctx.particles?.emit({ x: world.x, y: world.y, z: world.z, vx: velocity.x, vy: velocity.y, vz: velocity.z, color: k === 0 ? petal : color, size: 0.09 + Math.random() * 0.06, sizeEnd: 0.02, ttl: 1.1, drag: 0.6, style: 'glow', fadeIn: 0.15 });
      }
    }
  }, 0.55, onImpact);
}

function rise(target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(target).setY(ctx.groundY + 0.05);
  const circleMat = runeMaterial(color, 7.7);
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), circleMat);
  circle.rotation.x = -Math.PI / 2;
  circle.renderOrder = 3;
  group.add(circle);
  const pillarMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec2 vUv;
      void main(){
        float fall = pow(1.0 - vUv.y, 1.6);
        float bands = 0.7 + 0.3 * sin(vUv.y * 22.0 - uTime * 9.0 + sin(vUv.x * 37.7) * 0.6);
        float edge = 0.55 + 0.45 * pow(abs(sin(vUv.x * 3.14159 * 6.0 + uTime)), 0.5);
        gl_FragColor = vec4(mix(uColor * 1.5, vec3(1.2), fall * 0.4), fall * bands * edge * uOpacity * 0.55);
      }`,
  });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 7, 40, 1, true), pillarMat);
  pillar.position.y = 3.5;
  pillar.renderOrder = 5;
  group.add(pillar);
  const center = group.position.clone();
  const gold = color.clone().lerp(WHITE, 0.3);
  const onImpact = () => {
    ctx.mist?.burst(center, 16, { speed: 3, direction: new THREE.Vector3(0, 0.25, 0), spread: 2.2, color: new THREE.Color('#6d6650'), size: 0.9, sizeEnd: 2.4, alpha: 0.38, ttl: 1.6, drag: 2, style: 'mist' });
    ctx.mist?.burst(center, 16, { speed: 5, direction: UP, spread: 1.4, color: new THREE.Color('#3b3427'), size: 0.12, sizeEnd: 0.1, alpha: 0.95, ttl: 0.9, gravity: 11, style: 'spark' });
    ctx.light?.(center.clone().setY(center.y + 1.5), color, 12, 1.2, 12);
    ctx.screen?.shake(0.16);
  };
  return animate(group, 2, (t, age, dt) => {
    circleMat.uniforms.uTime.value = age;
    circleMat.uniforms.uReveal.value = clamp01(t / 0.25);
    circleMat.uniforms.uOpacity.value = t > 0.7 ? clamp01((1 - t) / 0.3) : clamp01(t / 0.08);
    circle.scale.setScalar(0.4 + easeOutBack(t / 0.3) * 0.6);
    const beam = clamp01((age - 0.3) / 0.25);
    pillarMat.uniforms.uTime.value = age;
    pillarMat.uniforms.uOpacity.value = beam * clamp01(1 - (age - 0.75) / 0.9);
    pillar.scale.set(1 - beam * 0.25, 0.2 + easeOutCubic(beam) * 0.8, 1 - beam * 0.25);
    if (age < 1.5 && Math.random() < dt * 40) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 1.3;
      ctx.particles?.emit({
        x: center.x + Math.cos(a) * r, y: center.y + 0.1, z: center.z + Math.sin(a) * r,
        vx: 0, vy: 1.4 + Math.random() * 2, vz: 0, color: gold, size: 0.1, sizeEnd: 0.02, ttl: 1.3, drag: 0.4, style: 'glow', fadeIn: 0.1,
      });
    }
  }, 0.3, onImpact);
}

/* ═══════════════════════════════ AEGIS ═══════════════════════════════ */

function aegis(origin: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(origin);
  group.quaternion.copy(ctx.cameraQuaternion);
  // A curved ward: a plane bent so its rim wraps toward the caster.
  const geometry = new THREE.PlaneGeometry(3.4, 3.6, 32, 32);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, (x * x + y * y) * 0.12);
  }
  geometry.computeVertexNormals();
  const wardMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uTime: { value: 0 }, uReveal: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime; uniform float uReveal; uniform float uOpacity; varying vec2 vUv;
      float hexDist(vec2 p){
        const vec2 s = vec2(1.0, 1.7320508);
        vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
        vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
        vec2 g = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
        g = abs(g);
        return 0.5 - max(dot(g, s * 0.5), g.x);
      }
      void main(){
        vec2 p = (vUv - 0.5) * vec2(1.0, 1.06) * 2.0;
        // Heater-shield outline: rounded top, tapering to a point at the bottom.
        float taper = mix(1.0, 0.18, (1.0 - smoothstep(-1.0, 0.0, p.y)));
        float shield = length(vec2(p.x / max(taper, 0.05), max(p.y, 0.0) * 1.05));
        float outside = max(shield, -p.y * 1.0);
        if (outside > 1.0) discard;
        float r = length(p);
        float reveal = (1.0 - smoothstep(uReveal - 0.12, uReveal, r));
        float rim = smoothstep(0.78, 1.0, outside);
        float hexes = (1.0 - smoothstep(0.0, 0.07, hexDist(p * 6.5 + vec2(0.0, uTime * 0.12))));
        float ripple = (1.0 - smoothstep(0.0, 0.08, abs(r - fract(uTime * 0.7) * 1.4))) * (1.0 - r);
        float shimmer = 0.6 + 0.4 * sin(uTime * 4.0 + p.y * 9.0 + p.x * 4.0);
        float alpha = (0.07 + hexes * 0.32 * shimmer + rim * 0.9 + ripple * 0.5) * reveal * uOpacity;
        float front = smoothstep(uReveal - 0.12, uReveal, r) * step(r, uReveal) * 1.5;
        vec3 c = mix(uColor * 1.4, vec3(1.15), rim * 0.6 + front);
        gl_FragColor = vec4(c, alpha + front * uOpacity * 0.6);
      }`,
  });
  const ward = new THREE.Mesh(geometry, wardMat);
  ward.renderOrder = 6;
  group.add(ward);
  const core = glowSprite(color, 3.2, undefined, 0);
  group.add(core);
  const pale = color.clone().lerp(WHITE, 0.4);
  const onImpact = () => {
    ctx.particles?.burst(origin, 28, { speed: 2.6, color: pale, size: 0.08, sizeEnd: 0.01, ttl: 0.7, drag: 2.5, style: 'spark' });
    ctx.screen?.flash(color, 0.18, 'edge');
    ctx.light?.(origin, color, 8, 1.2, 10);
  };
  return animate(group, 2.1, (t, age) => {
    wardMat.uniforms.uTime.value = age;
    wardMat.uniforms.uReveal.value = easeOutCubic(age / 0.38) * 1.6;
    const fade = t > 0.72 ? clamp01((1 - t) / 0.28) : 1;
    wardMat.uniforms.uOpacity.value = fade * (0.85 + 0.15 * Math.sin(age * 9));
    const breathe = 1 + Math.sin(age * 2.4) * 0.015;
    ward.scale.set(breathe, breathe, 1);
    core.material.opacity = clamp01(1 - age / 0.4) * 0.6;
  }, 0.2, onImpact);
}
