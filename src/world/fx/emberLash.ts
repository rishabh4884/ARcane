import * as THREE from 'three';
import { animate, type SpellAnimation, type SpellContext } from '../effects.ts';
import { terrainHeight } from '../spatial.ts';
import { clamp01, easeOutCubic, glowSprite } from '../vfx.ts';

/**
 * EMBER LASH
 * ──────────
 * Fire, staged so it reads before its colour does (docs/ART_BIBLE.md, effects language):
 *
 *   anticipation  embers spiral in and gather into a coal at the casting hand
 *   release       the coal flares and the lash uncoils from it
 *   travel        a whip of living flame rolls out along a curve toward its tip, a loop
 *                 travelling down it, shedding embers; white-yellow core, orange, a deep red edge
 *   impact        the tip cracks; flame tongues lick upward; the ground scorches; warm light flickers
 *   recovery      smoke curls up and drifts, embers rise and go out, the scorch cools
 *
 * Fire rises and flickers; it never bursts outward like a firework.
 */

const FLAME_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const NOISE = /* glsl */`
  float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
  float ffbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += fn(p) * a; p = p * 2.1 + vec2(3.1, 1.7); a *= 0.5; } return v; }
  vec3 fireRamp(float k) {
    // Deep red edge → orange → yellow → white-hot core.
    vec3 c = mix(vec3(0.45, 0.06, 0.02), vec3(1.0, 0.36, 0.06), smoothstep(0.0, 0.45, k));
    c = mix(c, vec3(1.0, 0.72, 0.25), smoothstep(0.45, 0.75, k));
    return mix(c, vec3(1.0, 0.95, 0.8), smoothstep(0.8, 1.0, k));
  }`;

/** The lash itself: a camera-facing ribbon of flame; uv.x runs hand → tip, uv.y across. */
function whipMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uFront: { value: 0 } },
    vertexShader: FLAME_VERT,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uFade; uniform float uFront;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        float across = abs(vUv.y - 0.5) * 2.0;
        // Licks of flame streaming back along the lash, ragged at the edge.
        float n = ffbm(vec2(vUv.x * 9.0 - uTime * 7.0, vUv.y * 2.5 + uTime * 0.7));
        float edge = 0.55 + 0.45 * n;
        float body = 1.0 - smoothstep(edge - 0.25, edge, across);
        float heat = (1.0 - across) * (0.45 + 0.7 * n);
        // The newest part (near the front) burns hottest.
        heat *= 0.75 + 0.5 * smoothstep(uFront - 0.35, uFront, vUv.x);
        vec3 col = fireRamp(clamp(heat, 0.0, 1.0));
        float alpha = body * uFade * smoothstep(0.0, 0.04, vUv.x);
        gl_FragColor = vec4(col * alpha * 1.25, alpha);
      }`,
  });
}

/** A tongue of flame standing up from the impact: a billboard with rising, flickering noise. */
function tongueMaterial(seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uLife: { value: 0 }, uSeed: { value: seed } },
    vertexShader: FLAME_VERT,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uLife; uniform float uSeed;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 p = vUv - vec2(0.5, 0.0);
        float rise = uTime * 2.4 + uSeed * 10.0;
        float n = ffbm(vec2(p.x * 4.0 + uSeed, vUv.y * 3.0 - rise));
        // A teardrop narrowing upward, broken into licks by the noise.
        float width = (0.42 - vUv.y * 0.38) * (0.7 + 0.6 * n);
        float shape = 1.0 - smoothstep(width - 0.08, width, abs(p.x + (n - 0.5) * 0.25 * vUv.y));
        shape *= smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.55 + n * 0.4, 1.0, vUv.y));
        float heat = clamp((1.0 - vUv.y) * 0.9 + n * 0.35 - abs(p.x) * 1.2, 0.0, 1.0);
        float alpha = shape * uLife;
        gl_FragColor = vec4(fireRamp(heat) * alpha * 1.4, alpha);
      }`,
  });
}

function scorchMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4,
    uniforms: { uHeat: { value: 0 }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: FLAME_VERT,
    fragmentShader: /* glsl */`
      uniform float uHeat; uniform float uOpacity; uniform float uTime;
      varying vec2 vUv;
      ${NOISE}
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float n = ffbm(vUv * 6.0);
        float burn = 1.0 - smoothstep(0.35 + n * 0.4, 0.95, r);
        // Embers glowing in the char while it is hot.
        float ember = step(0.86, fn(vUv * 40.0 + floor(uTime * 2.0) * 0.1)) * burn * uHeat;
        vec3 col = mix(vec3(0.02, 0.015, 0.01), vec3(1.0, 0.42, 0.08) * 1.6, ember);
        gl_FragColor = vec4(col, burn * 0.78 * uOpacity + ember * 0.5);
      }`,
  });
}

function below(ctx: SpellContext, depth: number, side: number): THREE.Vector3 {
  const cam = ctx.cameraPosition ?? new THREE.Vector3(0, 1.8, 10);
  const half = Math.tan(THREE.MathUtils.degToRad((ctx.fov ?? 64) / 2)) * depth;
  return cam.clone().add(new THREE.Vector3(side * half * 0.45, -half * 0.9, -depth).applyQuaternion(ctx.cameraQuaternion));
}

const SEGMENTS = 56;
const EMBER = new THREE.Color('#ffb04a');
const EMBER_DEEP = new THREE.Color('#ff5a1a');
const SMOKE = new THREE.Color('#2b2724');

export function emberLash(origin: THREE.Vector3, target: THREE.Vector3, _color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const side = ctx.hand === 'left' ? -1 : 1;
  const hand = ctx.cameraPosition ? below(ctx, 1.15, side) : origin.clone();
  const camQ = ctx.cameraQuaternion;
  const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ);
  const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camQ);
  // The lash curls out to the casting side and up, then cracks down onto the target.
  const c1 = hand.clone().lerp(target, 0.3).addScaledVector(camRight, side * 2.4).addScaledVector(camUp, 1.6);
  const c2 = hand.clone().lerp(target, 0.72).addScaledVector(camRight, side * 0.6).addScaledVector(camUp, 2.2);
  const curve = new THREE.CubicBezierCurve3(hand, c1, c2, target);
  const gather = 0.26;
  const flight = THREE.MathUtils.clamp(hand.distanceTo(target) / 40, 0.22, 0.48);
  const strike = gather + flight;
  const total = strike + 1.8;

  // The coal gathering at the hand.
  const coal = glowSprite('#ffb04a', 0.05, undefined, 0);
  coal.position.copy(hand);
  group.add(coal);
  // The whip ribbon.
  const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  const uvs = new Float32Array((SEGMENTS + 1) * 2 * 2);
  const index: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    uvs.set([i / SEGMENTS, 0, i / SEGMENTS, 1], i * 4);
    if (i < SEGMENTS) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  const whipMat = whipMaterial();
  const whip = new THREE.Mesh(geometry, whipMat);
  whip.frustumCulled = false;
  whip.renderOrder = 8;
  group.add(whip);
  // Flame tongues, a scorch on the ground.
  const tongues: Array<{ mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; h: number; delay: number }> = [];
  for (let i = 0; i < 7; i++) {
    const mat = tongueMaterial(i * 0.37);
    const h = 1.4 + Math.random() * 1.1;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 1).translate(0, 0.5, 0), mat);
    mesh.quaternion.copy(camQ);
    const a = (i / 7) * Math.PI * 2;
    mesh.position.copy(target).add(new THREE.Vector3(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4));
    mesh.position.y = terrainHeight(mesh.position.x, mesh.position.z) + 0.02;
    mesh.visible = false;
    mesh.renderOrder = 9;
    group.add(mesh);
    tongues.push({ mesh, h, delay: Math.random() * 0.12 });
  }
  const scorchMat = scorchMaterial();
  const scorch = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), scorchMat);
  scorch.position.set(target.x, terrainHeight(target.x, target.z) + 0.04, target.z);
  scorch.visible = false;
  group.add(scorch);

  const p = new THREE.Vector3(), tan = new THREE.Vector3(), sideV = new THREE.Vector3(), view = new THREE.Vector3(), wave = new THREE.Vector3();
  const cam = ctx.cameraPosition ?? new THREE.Vector3(0, 1.8, 10);
  let time = 0;
  return animate(group, total, (_t, age, dt) => {
    time += dt;
    whipMat.uniforms.uTime.value = time;
    // ── Anticipation: embers spiral in to the hand; the coal swells. ──
    if (age < gather) {
      const k = age / gather;
      coal.material.opacity = k;
      coal.scale.setScalar(0.08 + k * 0.32);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.4;
        const from = hand.clone().addScaledVector(camRight, Math.cos(a) * r).addScaledVector(camUp, Math.sin(a) * r * 0.7);
        const v = hand.clone().sub(from).multiplyScalar(3.2);
        ctx.particles?.emit({ x: from.x, y: from.y, z: from.z, vx: v.x, vy: v.y, vz: v.z, color: Math.random() < 0.5 ? EMBER : EMBER_DEEP, size: 0.05, sizeEnd: 0.01, ttl: 0.3, drag: 0.5, style: 'spark' });
      }
    } else {
      coal.material.opacity = clamp01(1 - (age - gather) / 0.18);
      coal.scale.setScalar(0.4 + (age - gather) * 2.5);
    }
    // ── Release and travel: the lash uncoils, a loop running down it toward the tip. ──
    const front = clamp01((age - gather) / flight);
    const ease = easeOutCubic(front);
    const fade = age < strike ? 1 : clamp01(1 - (age - strike) / 0.35);
    whipMat.uniforms.uFront.value = ease;
    whipMat.uniforms.uFade.value = fade;
    whip.visible = age >= gather && fade > 0;
    if (whip.visible) {
      for (let i = 0; i <= SEGMENTS; i++) {
        const s = (i / SEGMENTS) * Math.max(ease, 0.02);
        curve.getPoint(s, p);
        curve.getTangent(s, tan);
        view.copy(cam).sub(p).normalize();
        sideV.crossVectors(tan, view).normalize();
        // A travelling loop: the wave rides out along the lash and dies at the tip.
        const loop = Math.sin((s * 2.2 - age * 4.5) * Math.PI * 2) * 0.35 * (1 - s) * (1 - front * 0.6);
        wave.copy(sideV).multiplyScalar(loop);
        p.add(wave);
        const width = (0.34 - s * 0.26) * (age < strike ? 1 : 1 - (age - strike) / 0.35 * 0.5);
        positions.set([p.x + sideV.x * width, p.y + sideV.y * width, p.z + sideV.z * width, p.x - sideV.x * width, p.y - sideV.y * width, p.z - sideV.z * width], i * 6);
        // Shed embers from the burning lash.
        if (i % 9 === 0 && Math.random() < 0.35 && age < strike + 0.15) {
          ctx.particles?.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.5 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.6, color: Math.random() < 0.6 ? EMBER : EMBER_DEEP, size: 0.045, sizeEnd: 0.005, ttl: 0.7, drag: 1.4, gravity: -1.2, style: 'spark' });
        }
      }
      geometry.attributes.position.needsUpdate = true;
    }
    // ── Impact and recovery: tongues of flame lick up, then sink; smoke; the scorch cools. ──
    const since = age - strike;
    if (since >= 0) {
      scorch.visible = true;
      scorchMat.uniforms.uTime.value = time;
      scorchMat.uniforms.uOpacity.value = clamp01(since / 0.15) * clamp01(1 - (since - 1.2) / 0.6);
      scorchMat.uniforms.uHeat.value = clamp01(1 - since / 1.6);
      for (const t of tongues) {
        const k = since - t.delay;
        t.mesh.visible = k > 0 && k < 1.3;
        if (!t.mesh.visible) continue;
        const life = k < 0.15 ? k / 0.15 : clamp01(1 - (k - 0.15) / 1.0);
        t.mesh.material.uniforms.uTime.value = time;
        t.mesh.material.uniforms.uLife.value = life;
        t.mesh.scale.set(1, t.h * (0.4 + 0.6 * Math.min(1, k / 0.2)) * (0.6 + 0.4 * life), 1);
      }
      if (since < 1.2 && Math.random() < 0.5) {
        const sx = target.x + (Math.random() - 0.5) * 0.8, sz = target.z + (Math.random() - 0.5) * 0.8;
        const sy = terrainHeight(sx, sz) + 0.4 + Math.random() * 0.5;
        ctx.mist?.emit({ x: sx, y: sy, z: sz, vx: (Math.random() - 0.5) * 0.25, vy: 0.55 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.25, color: SMOKE, size: 0.4, sizeEnd: 1.5, ttl: 2.0, drag: 0.6, gravity: -0.15, style: 'mist' });
      }
      if (since < 1.4 && Math.random() < 0.6) {
        ctx.particles?.emit({ x: target.x + (Math.random() - 0.5) * 0.6, y: target.y + Math.random() * 0.5, z: target.z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 0.4, vy: 0.9 + Math.random() * 1.1, vz: (Math.random() - 0.5) * 0.4, color: Math.random() < 0.5 ? EMBER : EMBER_DEEP, size: 0.04, sizeEnd: 0.004, ttl: 1.2, drag: 0.8, gravity: -0.6, style: 'spark' });
      }
      // The fire's light flickers, then dies down.
      if (since < 1.1 && Math.random() < 0.25) ctx.light?.(target.clone().setY(target.y + 0.8), EMBER, 4 + Math.random() * 3 * (1 - since), 0.18, 7);
    }
  }, strike, () => {
    // The crack: a hard white-orange snap at the tip, a shove of heat, a shake.
    ctx.particles?.burst(target, 26, { speed: 4.5, color: new THREE.Color('#ffe6b0'), size: 0.05, ttl: 0.35, drag: 2.5, gravity: 3, style: 'spark' });
    ctx.particles?.burst(target, 10, { speed: 1.2, direction: new THREE.Vector3(0, 1, 0), spread: 0.6, color: EMBER, size: 0.3, sizeEnd: 0.05, ttl: 0.45, drag: 2, style: 'glow' });
    ctx.light?.(target.clone().setY(target.y + 0.6), new THREE.Color('#ffc070'), 9, 0.35, 9);
    ctx.screen?.shake(0.14);
  }, () => {
    geometry.dispose(); whipMat.dispose(); scorchMat.dispose(); scorch.geometry.dispose();
    for (const t of tongues) { t.mesh.geometry.dispose(); t.mesh.material.dispose(); }
  });
}
