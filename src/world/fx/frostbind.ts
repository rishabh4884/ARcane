import * as THREE from 'three';
import { animate, type SpellAnimation, type SpellContext } from '../effects.ts';
import { INK } from '../render/InkPaint.ts';
import { clamp01, easeOutCubic, rng } from '../vfx.ts';

/** Frost grows in held drawings: opaque ice facets, a fine blue ink edge, then brittle pieces.
 * The silhouettes face the view, while their feet remain planted around the target in the wood. */
const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function crystalMaterial(color: THREE.Color): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, side: THREE.DoubleSide,
    uniforms: {
      uDeep: { value: color.clone().multiplyScalar(0.42).lerp(new THREE.Color('#31576e'), 0.45) },
      uMid: { value: color.clone().lerp(new THREE.Color('#b8dae3'), 0.25) },
      uLight: { value: color.clone().lerp(new THREE.Color('#edf8ed'), 0.65) },
      uInk: { value: new THREE.Color('#193945') },
      uBreak: { value: 0 }, uResolution: INK.uResolution,
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uLight; uniform vec3 uInk;
      uniform float uBreak; uniform vec2 uResolution; varying vec2 vUv;
      float edge(vec2 p, vec2 a, vec2 b) {
        vec2 v = b - a;
        return (v.x * (p.y - a.y) - v.y * (p.x - a.x)) / length(v);
      }
      void main() {
        vec2 p = vec2(vUv.x - 0.5, vUv.y);
        // Six cut edges, with a long off-centre point. No round cone or glass shading.
        float s = edge(p, vec2(-0.28, 0.0), vec2(0.27, 0.05));
        s = min(s, edge(p, vec2(0.27, 0.05), vec2(0.38, 0.62)));
        s = min(s, edge(p, vec2(0.38, 0.62), vec2(0.08, 1.0)));
        s = min(s, edge(p, vec2(0.08, 1.0), vec2(-0.30, 0.78)));
        s = min(s, edge(p, vec2(-0.30, 0.78), vec2(-0.46, 0.18)));
        s = min(s, edge(p, vec2(-0.46, 0.18), vec2(-0.28, 0.0)));
        // Four broad diagonal fractures release whole chips, never a translucent dissolve.
        float course = floor((p.y + p.x * 0.38) * 5.0);
        float released = uBreak * 6.0 - (4.0 - course);
        if (uBreak > 0.0 && released > 0.0) discard;
        float px = max(fwidth(s), 0.00001);
        float body = clamp(s / px + 0.5, 0.0, 1.0);
        if (body < 0.01) discard;
        float line = min(1.65 * max(uResolution.y / 1080.0, 0.6), 2.3);
        float ink = 1.0 - clamp(s / px - line + 0.5, 0.0, 1.0);
        float ridge = p.x - mix(-0.08, 0.08, p.y);
        float facet = smoothstep(-fwidth(ridge), fwidth(ridge), ridge);
        vec3 paint = mix(uMid, uDeep, facet);
        float crown = p.y - (0.66 + abs(p.x - 0.08) * 0.68);
        paint = mix(paint, uLight, smoothstep(-fwidth(crown), fwidth(crown), crown));
        // One quiet seam, not a bright specular rim or moving glint.
        float seam = 1.0 - smoothstep(0.0, max(fwidth(ridge), 0.00001), abs(ridge));
        paint = mix(paint, uDeep, seam * 0.38);
        gl_FragColor = vec4(mix(paint, uInk, ink), body);
        #include <colorspace_fragment>
      }`,
  });
}

function groundMaterial(color: THREE.Color, seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uReveal: { value: 0 }, uBreak: { value: 0 }, uSeed: { value: seed },
      uColor: { value: color.clone().multiplyScalar(0.35).lerp(new THREE.Color('#486b78'), 0.45) },
      uCrack: { value: color.clone().lerp(new THREE.Color('#d4e9e5'), 0.45) },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform float uReveal; uniform float uBreak; uniform float uSeed;
      uniform vec3 uColor; uniform vec3 uCrack; varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p), a = atan(p.y, p.x);
        float edge = 0.76 + 0.10 * sin(a * 5.0 + uSeed) + 0.06 * sin(a * 9.0 - uSeed);
        // Broad frost plates, clear enough to read against a painted floor.
        float reach = edge * uReveal * (1.0 - uBreak);
        float s = reach - r;
        float px = max(fwidth(s), 0.00001);
        float body = clamp(s / px + 0.5, 0.0, 1.0);
        if (body < 0.01) discard;
        float vein = abs(sin(a * 4.5 + sin(r * 5.0 + uSeed) * 0.45));
        float cracks = (1.0 - smoothstep(0.015, 0.045, vein)) * smoothstep(0.12, 0.3, r);
        float rim = 1.0 - clamp(s / px - 1.2, 0.0, 1.0);
        vec3 paint = mix(uColor, uCrack, max(cracks * 0.8, rim * 0.45));
        gl_FragColor = vec4(paint, body * 0.72);
        #include <colorspace_fragment>
      }`,
  });
}

export function frostbind(target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  group.name = 'Frostbind';
  group.position.copy(target);
  const random = rng(Math.floor(target.x * 97 + target.z * 53 + 1013));
  const base = THREE.MathUtils.clamp(ctx.groundY - target.y + 0.02, -3.5, -0.05);
  const reach = 1 + Math.min(1.2, -base * 0.45);
  const light = color.clone().lerp(new THREE.Color('#edf8ed'), 0.65);
  const material = crystalMaterial(color);
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, 0.5, 0);

  const patch = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), groundMaterial(color, random() * 20));
  patch.name = 'Frostbind ground';
  patch.rotation.x = -Math.PI / 2;
  patch.position.y = base + 0.03;
  patch.renderOrder = 2;
  group.add(patch);

  interface Crystal { mesh: THREE.Mesh; delay: number; height: number; width: number; lean: number; tip: THREE.Vector3 }
  const crystals: Crystal[] = [];
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(ctx.cameraQuaternion);
  let yaw = Math.atan2(facing.x, facing.z);
  const addCrystal = (x: number, z: number, height: number, width: number, lean: number, delay: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Frostbind crystal';
    mesh.position.set(x, base, z);
    mesh.rotation.set(0, yaw, lean, 'YXZ');
    mesh.visible = false;
    mesh.scale.setScalar(0.001);
    group.add(mesh);
    crystals.push({ mesh, delay, height, width, lean, tip: new THREE.Vector3() });
  };
  addCrystal(0, 0, (1.55 + random() * 0.3) * reach, 0.36, -0.04, 0);
  addCrystal(0.18, 0.1, 1.05 * reach, 0.26, -0.28, 0.03);
  addCrystal(-0.17, -0.08, 0.9 * reach, 0.24, 0.3, 0.05);
  for (let i = 0; i < 9; i++) {
    const angle = (i + random() * 0.6) / 9 * Math.PI * 2;
    const radius = 0.5 + random() * 0.38;
    addCrystal(Math.cos(angle) * radius, Math.sin(angle) * radius,
      (0.55 + random() * 0.75) * reach, 0.15 + random() * 0.1,
      -Math.cos(angle - yaw) * (0.18 + random() * 0.22), 0.05 + random() * 0.14);
  }
  for (let i = 0; i < 14; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 0.25 + random() * 1.15;
    addCrystal(Math.cos(angle) * radius, Math.sin(angle) * radius,
      (0.18 + random() * 0.32) * reach, 0.06 + random() * 0.05,
      -Math.cos(angle - yaw) * (0.25 + random() * 0.35), 0.1 + random() * 0.2);
  }

  const groundPoint = target.clone().setY(target.y + base + 0.1);
  const up = new THREE.Vector3(0, 1, 0);
  const shardPoint = new THREE.Vector3();
  const onImpact = () => {
    ctx.mist?.burst(groundPoint, 14, { speed: 0.8, direction: up, spread: 1.4, color: new THREE.Color('#a8c4d0'), size: 0.8, sizeEnd: 2.2, alpha: 0.3, ttl: 1.8, drag: 1.8, gravity: 0.35, style: 'mist' });
    ctx.particles?.burst(groundPoint, 24, { speed: 3.4, direction: up, spread: 1.4, color: light, size: 0.06, ttl: 0.9, gravity: 3, drag: 1.2, style: 'spark' });
    ctx.light?.(target, light, 10, 0.8, 10);
    ctx.screen?.shake(0.08);
  };
  let shattered = false;
  return animate(group, 1.5, (t, age, dt) => {
    const drawingAge = Math.floor(age * 12) / 12;
    const thaw = clamp01((drawingAge - 0.95) / 0.35);
    material.uniforms.uBreak.value = thaw;
    patch.material.uniforms.uReveal.value = clamp01(easeOutCubic(t / 0.15));
    patch.material.uniforms.uBreak.value = clamp01((drawingAge - 0.95) / 0.55);
    patch.scale.setScalar(0.35 + easeOutCubic(Math.min(1, drawingAge / 0.525)) * 1.45);
    facing.set(0, 0, 1).applyQuaternion(ctx.cameraQuaternion);
    yaw = Math.atan2(facing.x, facing.z);
    for (const crystal of crystals) {
      const { mesh, delay, height, width, lean, tip } = crystal;
      const grow = easeOutCubic((drawingAge - delay) / 0.26);
      const settle = 1 + Math.sin(clamp01((drawingAge - delay) / 0.4) * Math.PI) * 0.06;
      mesh.visible = grow > 0 && thaw < 1;
      mesh.rotation.set(0, yaw, lean, 'YXZ');
      const shrink = 1 - thaw * 0.2;
      mesh.scale.set(width * (0.35 + grow * 0.65) * shrink, height * grow * settle * shrink, 1);
      tip.set(0.08 * mesh.scale.x, mesh.scale.y, 0).applyEuler(mesh.rotation).add(mesh.position).add(target);
      if (grow > 0.9 && thaw === 0 && random() < dt * 1.5) {
        ctx.particles?.emit({ x: tip.x, y: tip.y, z: tip.z, vx: 0, vy: 0.1, vz: 0, color: light, size: 0.1, sizeEnd: 0.01, ttl: 0.25, style: 'spark' });
      }
    }
    if (!shattered && age >= 0.95) {
      shattered = true;
      for (let i = 0; i < 12; i++) {
        shardPoint.copy(crystals[i].tip).lerp(groundPoint, 0.5);
        ctx.particles?.burst(shardPoint, 5, { speed: 2.6, color: light, size: 0.07, ttl: 0.7, gravity: 8, drag: 0.6, style: 'spark' });
      }
      ctx.mist?.burst(groundPoint, 8, { speed: 0.45, color: new THREE.Color('#bad1dc'), size: 1, sizeEnd: 2, alpha: 0.22, ttl: 1.2, gravity: 0.2, drag: 1.6, style: 'mist' });
    }
  }, 0.12, onImpact);
}
