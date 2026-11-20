import * as THREE from 'three';
import { animate, type SpellAnimation, type SpellContext } from '../effects.ts';
import { terrainHeight } from '../spatial.ts';
import { clamp01, easeOutCubic, glowSprite } from '../vfx.ts';
import { INK } from '../render/InkPaint.ts';

/**
 * EMBER LASH
 * ──────────
 * Fire as an effects animator draws it, in the same ink and paint as the cast: designed flame shapes
 * in flat bands (a deep red edge, orange, a pale-gold core) inside a dark ink line, redrawn on twos so
 * the flame boils like drawings rather than flowing like a simulation; smoke as cel-shaded puffs that
 * break apart instead of fading; the crack of the impact a starburst held for three drawings on ones.
 *
 *   anticipation  a coal of flame gathers at the casting hand, sparks drawn in toward it
 *   release       the coal flares and the lash uncoils from it
 *   travel        a whip of flame rolls out along a curve, licks peeling off its back edge,
 *                 a loop travelling down it toward the tip
 *   impact        the tip cracks (starburst); tongues of flame stand up and toss off flame bits;
 *                 the ground scorches; warm light flickers on everything near
 *   recovery      the tongues burn down to nothing, smoke puffs climb and break up, the scorch cools
 *
 * Fire rises and flickers; it never bursts outward like a firework.
 */

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Shared: noise, the drawing counter and the ink-and-paint banding of a shape field s (> 0 inside). */
const DRAWN = /* glsl */`
  uniform float uTime;
  uniform float uLine;
  uniform vec2 uResolution;
  float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
  // The drawing number: a new drawing twelve times a second.
  float drawingOf(float rate) { return floor(uTime * rate); }
  vec2 drawingSeed(float d) { return vec2(fh(vec2(d, 1.37)), fh(vec2(d, 7.91))) * 37.0; }
  // Colours are designed in sRGB, as paint is mixed; the frame is composed in linear light.
  vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
  vec4 inkFire(float s) {
    float px = max(fwidth(s), 1e-5);
    float dpx = s / px;
    float line = uLine * max(uResolution.y / 1080.0, 0.6);
    float outer = clamp(dpx + 0.5, 0.0, 1.0);
    float ink = outer * (1.0 - clamp(dpx - line + 0.5, 0.0, 1.0));
    float mid = smoothstep(0.24 - px, 0.24 + px, s);
    float core = smoothstep(0.56 - px, 0.56 + px, s);
    vec3 col = srgb(vec3(0.74, 0.16, 0.05));
    col = mix(col, srgb(vec3(0.99, 0.5, 0.12)), mid);
    col = mix(col, srgb(vec3(1.0, 0.88, 0.52)), core);
    col = mix(col, srgb(vec3(0.24, 0.05, 0.02)), ink);
    return vec4(col, outer);
  }`;

/** The lash: a camera-facing ribbon; uv.x runs hand → tip, uv.y across. */
function whipMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uLine: { value: 2.6 }, uResolution: INK.uResolution, uBurn: { value: 0 }, uFront: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform float uBurn; uniform float uFront;
      varying vec2 vUv;
      ${DRAWN}
      void main() {
        float d = drawingOf(12.0);
        vec2 sd = drawingSeed(d);
        float x = vUv.x;
        float across = abs(vUv.y - 0.5) * 2.0;
        // A ragged edge, redrawn every drawing; licks peel back off one side like teeth of flame.
        float edge = 0.6 + 0.24 * fn(vec2(x * 7.0, 0.0) + sd) + 0.1 * fn(vec2(x * 19.0, 3.0) + sd * 1.7);
        float k = x * 8.0 + fn(vec2(x * 3.0, 9.0) + sd) * 0.8;
        float t = fract(k);
        float tooth = (1.0 - t) * smoothstep(0.0, 0.18, t) * (0.55 + 0.6 * fh(vec2(floor(k), sd.x)));
        edge += tooth * 0.6 * step(0.5, vUv.y);
        float s = (edge - across) / edge;
        // The newest flame, near the front, burns biggest and hottest.
        s = s * (0.82 + 0.38 * smoothstep(uFront - 0.3, uFront, x)) * smoothstep(0.0, 0.05, x);
        // Burning out: the shape erodes away in pieces, never fades.
        s -= uBurn * (0.55 + 0.6 * fn(vec2(x * 11.0, 5.0) + sd));
        vec4 c = inkFire(s);
        if (c.a < 0.01) discard;
        gl_FragColor = c;
        #include <colorspace_fragment>
      }`,
  });
}

/** A tongue of flame standing up: a teardrop splitting into licks at the top, tossing off flame bits. */
function tongueMaterial(seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uLine: { value: 2.4 }, uResolution: INK.uResolution, uLife: { value: 0 }, uSeed: { value: seed } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform float uLife; uniform float uSeed;
      varying vec2 vUv;
      ${DRAWN}
      void main() {
        float d = drawingOf(12.0);
        vec2 sd = drawingSeed(d + uSeed * 13.0);
        float y = vUv.y;
        float x = vUv.x - 0.5;
        // Leaning and redrawn: each drawing bends the tongue a little differently.
        float bend = (fn(vec2(y * 2.5, uSeed * 7.0) + sd) - 0.5) * 0.42 * y;
        float w = 0.44 * pow(max(1.0 - y, 0.0), 0.85) * (0.5 + 0.5 * smoothstep(0.0, 0.22, y));
        float s = (w - abs(x - bend)) / 0.44;
        // The top splits into licks.
        float split = fn(vec2(x * 7.0 + uSeed, y * 2.2) + sd);
        s -= smoothstep(0.42, 0.95, y) * split * 0.42;
        // Flame bits tossed off the top, climbing and shrinking from drawing to drawing.
        for (int i = 0; i < 2; i++) {
          float fi = float(i);
          float ph = fract(d * 0.19 + fi * 0.5 + uSeed);
          vec2 c = vec2(bend + (fh(vec2(fi, uSeed + floor(d * 0.19 + fi * 0.5))) - 0.5) * 0.3, 0.72 + ph * 0.26);
          float r = 0.075 * (1.0 - ph);
          vec2 q = vUv - vec2(0.5, 0.0) - c; q.y *= 0.7;
          s = max(s, (r - length(q)) / 0.12 * step(0.01, r));
        }
        // Life: the tongue swells up, then burns down to nothing.
        s = s * (0.45 + 0.55 * uLife) - (1.0 - uLife) * 0.5;
        vec4 col = inkFire(s);
        if (col.a < 0.01) discard;
        gl_FragColor = col;
        #include <colorspace_fragment>
      }`,
  });
}

/** The crack of the impact: a starburst redrawn on ones, held for three drawings. */
function burstMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uLine: { value: 2.6 }, uResolution: INK.uResolution, uLife: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform float uLife;
      varying vec2 vUv;
      ${DRAWN}
      void main() {
        float d = drawingOf(24.0);
        vec2 sd = drawingSeed(d);
        vec2 p = (vUv - 0.5) * 2.0;
        float a = atan(p.y, p.x);
        float r = length(p);
        float spikes = 9.0;
        float k = a / 6.28318 * spikes + sd.x;
        float t = abs(fract(k) - 0.5) * 2.0;
        float reach = mix(0.95, 0.42, t) * (0.75 + 0.35 * fh(vec2(floor(k), sd.y)));
        float s = (reach * uLife - r) / 0.6;
        vec4 col = inkFire(s * 1.3);
        if (col.a < 0.01) discard;
        gl_FragColor = col;
        #include <colorspace_fragment>
      }`,
  });
}

/** Smoke as drawn puffs: a cluster of round lobes in two tones of smoke with an ink line, lit from the
 * fire below while it burns; growing, climbing, and breaking apart from drawing to drawing. */
function puffMaterial(seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uLine: { value: 2.2 }, uResolution: INK.uResolution, uAge: { value: 0 }, uSeed: { value: seed }, uWarm: { value: 1 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform float uAge; uniform float uSeed; uniform float uWarm;
      varying vec2 vUv;
      ${DRAWN}
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float s = -1.0;
        vec2 lit = vec2(0.0);
        for (int i = 0; i < 5; i++) {
          float fi = float(i);
          vec2 c = vec2(fh(vec2(fi, uSeed)) - 0.5, fh(vec2(uSeed, fi)) - 0.5) * 0.9;
          float r = 0.32 + 0.22 * fh(vec2(fi + 3.0, uSeed));
          // Breaking up: lobes shrink apart as the puff ages.
          c *= 1.0 + uAge * 0.7;
          r *= 1.0 - uAge * (0.55 + 0.4 * fh(vec2(fi, uSeed + 9.0)));
          float si = (r - length(p - c)) / 0.5;
          if (si > s) { s = si; lit = (p - c) / max(r, 0.01); }
        }
        float px = max(fwidth(s), 1e-5);
        float dpx = s / px;
        float body = clamp(dpx + 0.5, 0.0, 1.0);
        float ink = body * (1.0 - clamp(dpx - uLine * max(uResolution.y / 1080.0, 0.6) + 0.5, 0.0, 1.0));
        // Two tones: the side toward the fire (below) and the moon (up and left) lighter.
        float side = dot(normalize(lit + vec2(0.0, 1e-4)), normalize(vec2(-0.5, 0.6)));
        float light = smoothstep(-0.1 - px, -0.1 + px, side);
        vec3 shade = mix(srgb(vec3(0.24, 0.23, 0.23)), srgb(vec3(0.42, 0.41, 0.4)), light);
        float under = smoothstep(0.0, -0.6, lit.y) * uWarm;
        shade = mix(shade, srgb(vec3(0.62, 0.3, 0.12)), under * 0.55);
        vec3 col = mix(shade, srgb(vec3(0.1, 0.09, 0.09)), ink);
        if (body < 0.01) discard;
        gl_FragColor = vec4(col, body * 0.92);
        #include <colorspace_fragment>
      }`,
  });
}

/** The scorch: a hard-edged char with an ink rim, embers winking in it while it is hot. */
function scorchMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4,
    uniforms: { uTime: { value: 0 }, uLine: { value: 2 }, uResolution: INK.uResolution, uHeat: { value: 0 }, uSpread: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform float uHeat; uniform float uSpread;
      varying vec2 vUv;
      ${DRAWN}
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float edge = (0.55 + 0.35 * fn(p * 2.6 + 4.0) + 0.12 * fn(p * 7.0)) * uSpread;
        float s = (edge - r) / 0.4;
        float px = max(fwidth(s), 1e-5);
        float body = clamp(s / px + 0.5, 0.0, 1.0);
        if (body < 0.01) discard;
        float rim = body * (1.0 - clamp(s / px - uLine * max(uResolution.y / 1080.0, 0.6) + 0.5, 0.0, 1.0));
        vec3 col = mix(srgb(vec3(0.06, 0.045, 0.035)), srgb(vec3(0.02, 0.015, 0.012)), rim);
        // Embers: hard little coals that wink on and off from drawing to drawing as the char cools.
        float d = drawingOf(8.0);
        vec2 cell = floor(vUv * 26.0);
        float coal = step(0.9 - uHeat * 0.12, fh(cell + d * 0.013)) * step(length(fract(vUv * 26.0) - 0.5), 0.28) * step(0.25, s);
        col = mix(col, mix(srgb(vec3(0.85, 0.25, 0.05)), srgb(vec3(1.0, 0.7, 0.3)), fh(cell)), coal * uHeat);
        gl_FragColor = vec4(col, body * 0.86);
        #include <colorspace_fragment>
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

interface Puff { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; born: number; life: number; size: number; vx: number; vz: number; rise: number; base: THREE.Vector3 }

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
  const total = strike + 2.2;
  const materials: THREE.ShaderMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const own = <T extends THREE.ShaderMaterial>(m: T) => { materials.push(m); return m; };
  const billboard = (w: number, h: number, mat: THREE.ShaderMaterial, anchorBottom = true) => {
    const g = new THREE.PlaneGeometry(w, h);
    if (anchorBottom) g.translate(0, h / 2, 0);
    geometries.push(g);
    const m = new THREE.Mesh(g, mat);
    m.quaternion.copy(camQ);
    m.frustumCulled = false;
    return m;
  };

  // A soft warm glow behind the drawings: the light the fire throws, not the fire itself.
  const glow = glowSprite('#ff9a40', 0.05, undefined, 0);
  glow.position.copy(hand);
  group.add(glow);
  // The coal: a small drawn flame at the hand.
  const coalMat = own(tongueMaterial(0.71));
  const coal = billboard(0.32, 0.42, coalMat);
  coal.position.copy(hand).addScaledVector(camUp, -0.12);
  coal.renderOrder = 9;
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
  geometries.push(geometry);
  const whipMat = own(whipMaterial());
  const whip = new THREE.Mesh(geometry, whipMat);
  whip.frustumCulled = false;
  whip.renderOrder = 8;
  group.add(whip);
  // The crack.
  const burstMat = own(burstMaterial());
  const burst = billboard(2.2, 2.2, burstMat, false);
  burst.position.copy(target).setY(target.y + 0.6);
  burst.visible = false;
  burst.renderOrder = 11;
  group.add(burst);
  // Flame tongues, a scorch on the ground.
  const tongues: Array<{ mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; h: number; delay: number }> = [];
  for (let i = 0; i < 6; i++) {
    const mat = own(tongueMaterial(i * 0.37 + 0.11));
    const h = 1.2 + Math.random() * 1.2;
    const mesh = billboard(0.95, 1, mat);
    const a = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
    mesh.position.copy(target).add(new THREE.Vector3(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42));
    mesh.position.y = terrainHeight(mesh.position.x, mesh.position.z) - 0.04;
    mesh.visible = false;
    mesh.renderOrder = 10 + (i % 2);
    group.add(mesh);
    tongues.push({ mesh, h, delay: Math.random() * 0.1 });
  }
  const scorchMat = own(scorchMaterial());
  const scorchGeo = new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2);
  geometries.push(scorchGeo);
  const scorch = new THREE.Mesh(scorchGeo, scorchMat);
  scorch.position.set(target.x, terrainHeight(target.x, target.z) + 0.04, target.z);
  scorch.visible = false;
  group.add(scorch);
  // Smoke puffs, drawn.
  const puffs: Puff[] = [];
  let nextPuff = 0;

  const p = new THREE.Vector3(), tan = new THREE.Vector3(), sideV = new THREE.Vector3(), view = new THREE.Vector3(), wave = new THREE.Vector3();
  const cam = ctx.cameraPosition ?? new THREE.Vector3(0, 1.8, 10);
  let time = 0;
  let lastDrawing = -1;
  return animate(group, total, (_t, age, dt) => {
    time += dt;
    for (const m of materials) m.uniforms.uTime.value = time;
    // Motion is drawn on twos (strikes on ones): positions and sizes move a drawing at a time.
    const drawing = Math.floor(time * 12);
    const newDrawing = drawing !== lastDrawing;
    lastDrawing = drawing;
    // ── Anticipation: sparks drawn in to the hand; the coal swells. ──
    if (age < gather) {
      const k = age / gather;
      coal.visible = true;
      coalMat.uniforms.uLife.value = 0.3 + k * 0.7;
      if (newDrawing) coal.scale.setScalar(0.5 + k * 0.7);
      glow.material.opacity = k * 0.5;
      glow.scale.setScalar(0.3 + k * 0.6);
      if (newDrawing) {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.4;
          const from = hand.clone().addScaledVector(camRight, Math.cos(a) * r).addScaledVector(camUp, Math.sin(a) * r * 0.7);
          const v = hand.clone().sub(from).multiplyScalar(3.2);
          ctx.particles?.emit({ x: from.x, y: from.y, z: from.z, vx: v.x, vy: v.y, vz: v.z, color: Math.random() < 0.5 ? EMBER : EMBER_DEEP, size: 0.05, sizeEnd: 0.01, ttl: 0.3, drag: 0.5, style: 'spark' });
        }
      }
    } else {
      const k = clamp01((age - gather) / 0.16);
      coalMat.uniforms.uLife.value = 1 - k;
      coal.visible = k < 1;
      glow.material.opacity = 0.5 * (1 - k);
    }
    // ── Release and travel: the lash uncoils, a loop running down it toward the tip. ──
    const front = clamp01((age - gather) / flight);
    const ease = easeOutCubic(front);
    const burn = age < strike ? 0 : clamp01((age - strike) / 0.4);
    whipMat.uniforms.uFront.value = ease;
    whipMat.uniforms.uBurn.value = burn;
    whip.visible = age >= gather && burn < 1;
    if (whip.visible && (newDrawing || age < strike)) {
      for (let i = 0; i <= SEGMENTS; i++) {
        const s = (i / SEGMENTS) * Math.max(ease, 0.02);
        curve.getPoint(s, p);
        curve.getTangent(s, tan);
        view.copy(cam).sub(p).normalize();
        sideV.crossVectors(tan, view).normalize();
        const loop = Math.sin((s * 2.2 - age * 4.5) * Math.PI * 2) * 0.35 * (1 - s) * (1 - front * 0.6);
        wave.copy(sideV).multiplyScalar(loop);
        p.add(wave);
        const near = p.distanceTo(cam);
        const width = THREE.MathUtils.clamp(near * 0.045, 0.05, 0.34) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, s * 1.5 + 0.12))) * (1 - s * 0.45);
        positions.set([p.x + sideV.x * width, p.y + sideV.y * width, p.z + sideV.z * width, p.x - sideV.x * width, p.y - sideV.y * width, p.z - sideV.z * width], i * 6);
        if (newDrawing && i % 9 === 0 && Math.random() < 0.3 && age < strike + 0.15) {
          ctx.particles?.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.6, vy: 0.5 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.6, color: Math.random() < 0.6 ? EMBER : EMBER_DEEP, size: 0.04, sizeEnd: 0.005, ttl: 0.6, drag: 1.4, gravity: -1.2, style: 'spark' });
        }
      }
      geometry.attributes.position.needsUpdate = true;
    }
    // ── Impact and recovery. ──
    const since = age - strike;
    if (since >= 0) {
      // The starburst: three drawings on ones, growing.
      const bk = since * 24;
      burst.visible = bk < 3;
      burstMat.uniforms.uLife.value = 0.55 + Math.floor(bk) * 0.22;
      burst.scale.setScalar(0.8 + Math.floor(bk) * 0.25);
      glow.position.copy(target).setY(target.y + 0.7);
      glow.material.opacity = 0.65 * clamp01(1 - since / 1.6);
      glow.scale.setScalar(2.6 + Math.sin(time * 19) * 0.15);
      scorch.visible = true;
      scorchMat.uniforms.uSpread.value = 0.6 + 0.4 * clamp01(since / 0.2);
      scorchMat.uniforms.uHeat.value = clamp01(1 - since / 1.9);
      for (const t of tongues) {
        const k = since - t.delay;
        t.mesh.visible = k > 0 && k < 1.5;
        if (!t.mesh.visible) continue;
        const life = k < 0.12 ? k / 0.12 : clamp01(1 - (k - 0.12) / 1.25);
        t.mesh.material.uniforms.uLife.value = life;
        if (newDrawing) t.mesh.scale.set(0.9 + Math.random() * 0.2, t.h * (0.5 + 0.5 * Math.min(1, k / 0.16)) * (0.55 + 0.45 * life), 1);
      }
      // Smoke climbs from the burning, puff by puff.
      if (since > 0.15 && since < 1.6 && time >= nextPuff) {
        nextPuff = time + 0.16 + Math.random() * 0.1;
        const mat = own(puffMaterial(Math.random() * 50));
        const size = 0.95 + Math.random() * 0.55;
        const mesh = billboard(1, 1, mat, false);
        const base = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 0.7));
        mesh.position.copy(base);
        mesh.renderOrder = 7;
        group.add(mesh);
        puffs.push({ mesh, born: time, life: 1.6 + Math.random() * 0.8, size, vx: (Math.random() - 0.5) * 0.25, vz: (Math.random() - 0.5) * 0.25, rise: 0.6 + Math.random() * 0.4, base });
      }
      if (since < 1.2 && Math.random() < 0.45) {
        ctx.particles?.emit({ x: target.x + (Math.random() - 0.5) * 0.6, y: target.y + Math.random() * 0.5, z: target.z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 0.4, vy: 0.9 + Math.random() * 1.1, vz: (Math.random() - 0.5) * 0.4, color: Math.random() < 0.5 ? EMBER : EMBER_DEEP, size: 0.035, sizeEnd: 0.004, ttl: 1.0, drag: 0.8, gravity: -0.6, style: 'spark' });
      }
      // The fire's light flickers, then dies down.
      if (since < 1.2 && Math.random() < 0.25) ctx.light?.(target.clone().setY(target.y + 0.8), EMBER, 4 + Math.random() * 3 * (1 - since), 0.18, 7);
    }
    for (const pf of puffs) {
      const a = (time - pf.born) / pf.life;
      pf.mesh.visible = a < 1;
      if (!pf.mesh.visible || !newDrawing) continue;
      pf.mesh.material.uniforms.uAge.value = a;
      pf.mesh.material.uniforms.uWarm.value = clamp01(1 - since / 1.4);
      const k = time - pf.born;
      pf.mesh.position.set(pf.base.x + pf.vx * k, pf.base.y + pf.rise * k, pf.base.z + pf.vz * k);
      pf.mesh.scale.setScalar(pf.size * (0.6 + a * 1.1));
    }
  }, strike, () => {
    // The crack: a hard snap at the tip, a shove of heat, a shake.
    ctx.particles?.burst(target, 18, { speed: 4.5, color: new THREE.Color('#ffe6b0'), size: 0.045, ttl: 0.3, drag: 2.5, gravity: 3, style: 'spark' });
    ctx.light?.(target.clone().setY(target.y + 0.6), new THREE.Color('#ffc070'), 9, 0.35, 9);
    ctx.screen?.shake(0.14);
  }, () => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    glow.material.dispose();
  });
}
