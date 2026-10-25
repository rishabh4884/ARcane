import * as THREE from 'three';
import { ImpactBurst, SpellGlint } from './effect-composition.ts';
import type { SpellEffect } from '../config/spells.ts';

export interface SpellAnimation {
  group: THREE.Group;
  /** Called once when this spell reaches its impact beat. */
  setImpactCallback(callback: () => void): void;
  /** Return false after the final frame. */
  update(dt: number): boolean;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const easeOut = (n: number) => 1 - Math.pow(1 - clamp01(n), 3);

/** Build a short, spell-specific Three.js effect. All geometry is owned and disposed here. */
export function createSpellAnimation(
  kind: SpellEffect,
  origin: THREE.Vector3,
  target: THREE.Vector3,
  color: THREE.Color,
  detail?: string,
  context?: { groundY: number; cameraQuaternion: THREE.Quaternion; camera?: THREE.Camera },
): SpellAnimation {
  switch (kind) {
    case 'arrow': return accent(arrow(origin,target,color,detail),target,color,56,.88,4.2,5.5);
    case 'lightning': return accent(lightning(target,color,context?.camera),target,color,88,.92,7.0,8.0);
    case 'frost': return accent(frost(target,color,context?.groundY),target,color,66,1.05,3.2,5.5);
    case 'wind': return accent(gale(origin,target,color,detail),target,color,58,.95,4.2,6.5);
    case 'healing': {
      const effect=mend(origin,color,detail);
      if(context)effect.group.quaternion.copy(context.cameraQuaternion);
      return accent(effect,origin,color,46,1.2,3.2,5);
    }
    case 'summon': return accent(rise(target,color,context?.groundY),target,color,64,1.15,4.0,7);
    case 'shield': {
      const effect=aegis(origin,color);
      if(context)effect.group.quaternion.copy(context.cameraQuaternion);
      return accent(effect,origin,color,46,1.1,3.0,6);
    }
}
}
function accent(effect:SpellAnimation,point:THREE.Vector3,color:THREE.Color,count:number,duration:number,intensity:number,radius:number):SpellAnimation {
  const burst=new ImpactBurst(point,color,count,duration),glint=new SpellGlint(color,intensity,radius);
  effect.group.updateMatrixWorld(true);
  const local=effect.group.worldToLocal(point.clone());burst.group.position.copy(local);burst.group.renderOrder=3;glint.position.copy(local);
  effect.group.add(burst.group,glint);
  const update=effect.update.bind(effect),dispose=effect.dispose.bind(effect);
  let age=0;
  effect.update=(dt)=>{age+=Math.max(0,dt);const active=update(dt);burst.update(dt);glint.pulse(Math.min(1,age/duration),Math.max(0,1-age/duration));return active||age<duration;};
  effect.dispose=()=>{burst.dispose();glint.dispose();dispose();};
  return effect;
}


function animate(
  group: THREE.Group,
  duration: number,
  tick: (t: number, age: number) => void,
  impactAt = duration * 0.5,
): SpellAnimation {
  let age = 0;
  let impactCallback: (() => void) | undefined;
  let impacted = false;
  return {
    group,
    setImpactCallback(callback) { impactCallback = callback; },
    update(dt) {
      age += dt;
      const t = clamp01(age / duration);
      tick(t, age);
      if (!impacted && age >= impactAt) {
        impacted = true;
        impactCallback?.();
      }
      return age < duration;
    },
    dispose() {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    },
  };
}

function glow(color: THREE.Color, opacity = 0.9): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function lineMaterial(color: THREE.Color, opacity = 0.9): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

function addLine(group: THREE.Group, points: THREE.Vector3[], material: THREE.LineBasicMaterial): THREE.Line {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  group.add(line);
  return line;
}

function arrow(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, detail?: string): SpellAnimation {
  const group = new THREE.Group();
  const direction = target.clone().sub(origin);
  if (direction.lengthSq() < 0.01) direction.set(0, 0, -1);
  direction.normalize();
  const power = clamp01((Number(detail?.match(/(\d+)%/)?.[1]) || 65) / 100);
  const arrowGroup = new THREE.Group();
  arrowGroup.quaternion.setFromUnitVectors(UP, direction.clone().addScaledVector(new THREE.Vector3(-direction.z, 0, direction.x).normalize(), 0.62).normalize());
  arrowGroup.scale.setScalar(1.1 + power * 0.42);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 1.08, 14), glow(color));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 16), glow(color.clone().lerp(new THREE.Color('#ffffff'), 0.58)));
  tip.position.y = 0.68;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 12), glow(color, 0.72));
  tail.position.y = -0.54;
  tail.rotation.z = Math.PI;
  arrowGroup.add(shaft, tip, tail);
  group.add(arrowGroup);
  const from = origin.clone();
  const to = target.clone();
  const side = new THREE.Vector3(-direction.z, 0, direction.x);
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  side.normalize();
  const pathPoint = (u: number, out: THREE.Vector3) => out.copy(from).lerp(to, u).addScaledVector(side, Math.sin(Math.PI * u) * 1.08);
  const arcMiddle = pathPoint(0.5, new THREE.Vector3());
  const trail = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, arcMiddle, to]), 64, 0.026, 10, false),
    glow(color, 0.5),
  );
  const trailIndexCount = trail.geometry.getIndex()?.count ?? 0;
  group.add(trail);
  const tangentBefore = new THREE.Vector3();
  const tangentAfter = new THREE.Vector3();
  const duration = 0.8 + (1 - power) * 0.35;
  return animate(group, duration, (t) => {
    const flight = easeOut(Math.min(1, t / 0.88));
    pathPoint(flight, arrowGroup.position);
    pathPoint(Math.min(1, flight + 0.012), tangentAfter);
    pathPoint(Math.max(0, flight - 0.012), tangentBefore);
    const tangent = tangentAfter.sub(tangentBefore).normalize();
    tangent.addScaledVector(side, 1.08).normalize();
    arrowGroup.quaternion.setFromUnitVectors(UP, tangent);
    trail.geometry.setDrawRange(0, Math.floor(trailIndexCount * flight));
    const fade = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1;
    (shaft.material as THREE.MeshBasicMaterial).opacity = fade;
    (tip.material as THREE.MeshBasicMaterial).opacity = fade;
    (tail.material as THREE.MeshBasicMaterial).opacity = fade * 0.72;
    (trail.material as THREE.MeshBasicMaterial).opacity = fade * 0.58;
  }, duration * 0.79);
}

/** Deterministic little PRNG so every bolt/ice-field is jagged but never flickers between frames. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Jagged path from `from` to `to`, kicked sideways along `side`; calmer at both ends. */
function jaggedPath(from: THREE.Vector3, to: THREE.Vector3, side: THREE.Vector3, steps: number, kick: number, random: () => number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  let drift = 0;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = from.clone().lerp(to, u);
    const taper = Math.sin(Math.PI * Math.min(1, u * 1.08)) * 0.9 + 0.1;
    drift = drift * 0.45 + (random() - 0.5) * kick * 2;
    if (i === 0 || i === steps) drift = 0;
    out.push(p.addScaledVector(side, drift * taper));
  }
  return out;
}

function lightning(target: THREE.Vector3, color: THREE.Color, camera?: THREE.Camera): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(target);
  const core = color.clone().lerp(new THREE.Color('#ffffff'), 0.78);
  const random = rng(Math.floor(target.x * 131 + target.z * 71 + 7919));

  // The bolt is anchored to the TOP EDGE of the screen: same view-depth as the target, just above the frame.
  const top = new THREE.Vector3(0, 6.5, 0);
  const side = new THREE.Vector3(1, 0, 0);
  let widthScale = 1;
  if (camera) {
    camera.updateMatrixWorld(true);
    const ndc = target.clone().project(camera);
    if (Number.isFinite(ndc.x) && Number.isFinite(ndc.y) && Number.isFinite(ndc.z)) {
      const world = new THREE.Vector3(THREE.MathUtils.clamp(ndc.x, -1.2, 1.2), 1.18, ndc.z).unproject(camera);
      top.copy(world).sub(target);
      side.set(1, 0, 0).applyQuaternion(camera.quaternion);
      widthScale = THREE.MathUtils.clamp(camera.position.distanceTo(target) / 9, 0.8, 3.2);
    }
  }
  if (top.y < 3) top.y = 3;
  const length = top.length();
  const steps = Math.max(12, Math.min(26, Math.round(length * 1.7)));
  const points = jaggedPath(top, new THREE.Vector3(0, 0, 0), side, steps, 0.2 * Math.min(2.2, 0.7 + length * 0.08), random);

  const mainRadius = 0.05 * widthScale;
  const mainSegments = addBoltSegments(group, points, mainRadius, core, 8);
  const halo = addBoltSegments(group, points, mainRadius * 3.4, color, 8);
  halo.forEach((segment) => { (segment.material as THREE.MeshBasicMaterial).opacity = 0.16; });

  // Forks leave the main channel and travel down-and-out, ending in a short crackle.
  const forkCount = Math.min(4, 2 + Math.floor(length / 9));
  const forks: THREE.Mesh[][] = [];
  const forkStart: number[] = [];
  for (let f = 0; f < forkCount; f++) {
    const at = Math.floor(steps * (0.25 + 0.6 * (f + random() * 0.6) / forkCount));
    const origin = points[Math.min(points.length - 2, at)];
    const dir = random() < 0.5 ? -1 : 1;
    const reach = (0.9 + random() * 1.5) * widthScale * 0.9;
    const end = origin.clone().addScaledVector(side, dir * reach).add(new THREE.Vector3(0, -(0.9 + random() * 1.6) * widthScale * 0.9, 0));
    const branch = jaggedPath(origin, end, side, 5, 0.1 * widthScale, random);
    forks.push(addBoltSegments(group, branch, mainRadius * 0.55, color, 6));
    forkStart.push(at / steps);
  }

  const duration = 0.78;
  const strikeTime = 0.13;
  return animate(group, duration, (_t, age) => {
    const strike = clamp01(age / strikeTime);
    mainSegments.forEach((segment, index) => {
      const on = strike * (mainSegments.length + 1) > index;
      segment.visible = on; halo[index].visible = on;
    });
    forks.forEach((segments, index) => {
      const delay = strikeTime * forkStart[index];
      segments.forEach((segment, i) => { segment.visible = age > delay + i * 0.018; });
    });
    // Two quick re-strikes of brightness (flicker), then a soft decay.
    const flicker = age < 0.16 ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(age * 38));
    const fade = age < 0.2 ? 1 : clamp01(1 - (age - 0.2) / 0.58);
    mainSegments.forEach((segment) => ((segment.material as THREE.MeshBasicMaterial).opacity = fade * flicker));
    halo.forEach((segment) => ((segment.material as THREE.MeshBasicMaterial).opacity = 0.17 * fade * flicker));
    forks.forEach((segments) => segments.forEach((segment) => ((segment.material as THREE.MeshBasicMaterial).opacity = fade * 0.75 * flicker)));
  }, strikeTime);
}

function addBoltSegments(group: THREE.Group, points: THREE.Vector3[], radius: number, color: THREE.Color, radial = 8): THREE.Mesh[] {
  return points.slice(1).map((end, index) => {
    const start = points[index];
    const direction = end.clone().sub(start);
    const length = Math.max(0.001, direction.length());
    // A touch of overlap hides the joints so the channel reads as one continuous, soft-edged bolt.
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius, length * 1.06, radial), glow(color));
    segment.position.copy(start).add(end).multiplyScalar(0.5);
    segment.quaternion.setFromUnitVectors(UP, direction.normalize());
    group.add(segment);
    return segment;
  });
}

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
    uniforms: { uOpacity: { value: 1 }, uDeep: { value: deep }, uLight: { value: light } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){ vH = uv.y; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uOpacity; uniform vec3 uDeep; uniform vec3 uLight; varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(1.0 - facing, 1.8);
        float core = pow(facing, 2.5) * (1.0 - vH);
        vec3 c = mix(uDeep, uLight, smoothstep(0.0, 1.0, vH * 0.85 + rim * 0.55)) * (0.5 + core * 0.55) + uLight * rim * 0.45;
        float a = (0.16 + rim * 0.55 + core * 0.22 + vH * 0.2) * uOpacity;
        gl_FragColor = vec4(c, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

function frost(target: THREE.Vector3, color: THREE.Color, groundY?: number): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(target);
  const random = rng(Math.floor(target.x * 97 + target.z * 53 + 1013));
  // Spikes erupt from the ground under the impact point (falls back to the old offset in headless use).
  const base = groundY === undefined ? -0.9 : THREE.MathUtils.clamp(groundY - target.y + 0.02, -3.5, -0.05);
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

  interface Thorn { mesh: THREE.Mesh; delay: number; height: number; width: number; }
  const thorns: Thorn[] = [];
  const addThorn = (x: number, z: number, height: number, width: number, lean: number, delay: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, base, z);
    const away = Math.atan2(z, x);
    mesh.rotation.set(Math.sin(away) * lean, random() * Math.PI, -Math.cos(away) * lean);
    mesh.scale.set(0.001, 0.001, 0.001);
    mesh.renderOrder = 3;
    group.add(mesh);
    thorns.push({ mesh, delay, height, width });
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

  const duration = 1.15;
  return animate(group, duration, (t, age) => {
    const open = easeOut(t / 0.2);
    (patch.material as THREE.ShaderMaterial).uniforms.uOpacity.value = clamp01(open) * clamp01(1 - Math.max(0, t - 0.55) / 0.45);
    patch.scale.setScalar(0.35 + easeOut(Math.min(1, t / 0.45)) * 1.45);
    const fade = clamp01(1 - Math.max(0, t - 0.62) / 0.38);
    material.uniforms.uOpacity.value = fade;
    thorns.forEach(({ mesh, delay, height, width }) => {
      const grow = easeOut((age - delay) / 0.3);
      // Slight overshoot-and-settle makes the burst feel like brittle crystal snapping up.
      const settle = 1 + Math.sin(clamp01((age - delay) / 0.45) * Math.PI) * 0.06;
      mesh.visible = grow > 0;
      mesh.scale.set(width * (0.35 + grow * 0.65), height * grow * settle, width * (0.35 + grow * 0.65));
    });
  }, 0.12);
}

function gale(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, detail?: string): SpellAnimation {
  const group = new THREE.Group();
  const sign = detail === 'left' ? -1 : 1;
  const ribbons: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const y = (i - 1) * 0.38;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.9, y - 0.1, 0),
      new THREE.Vector3(-0.85, y + 0.28, -0.15 - i * 0.1),
      new THREE.Vector3(0.35, y - 0.25, -0.3 - i * 0.1),
      new THREE.Vector3(1.8, y + 0.05, -0.48),
    ]);
    const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.022 + i * 0.006, 10, false), glow(color, 0.72 - i * 0.12));
    const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.085 + i * 0.012, 10, false), glow(color, 0.1));
    ribbon.add(halo);
    ribbons.push(ribbon);
    group.add(ribbon);
  }
  const direction = target.clone().sub(origin).normalize();
  const right = new THREE.Vector3().crossVectors(direction, UP).normalize();
  const from = origin.clone().addScaledVector(right, -sign * 1.9);
  const to = target.clone();
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  return animate(group, 1.05, (t) => {
    group.position.copy(from).lerp(to, easeOut(t));
    group.scale.set(0.8 + t * 0.3, 0.78 + Math.sin(t * Math.PI) * 0.3, 1);
    const opacity = clamp01(1 - Math.max(0, t - 0.62) / 0.38);
    ribbons.forEach((ribbon, index) => {
      (ribbon.material as THREE.MeshBasicMaterial).opacity = opacity * (0.78 - index * 0.12);
      ((ribbon.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = opacity * 0.12;
    });
  }, 0.7);
}

function mend(origin: THREE.Vector3, color: THREE.Color, detail?: string): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(origin);
  const direction = detail === 'ccw' ? -1 : 1;
  const pieces: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const points: THREE.Vector3[] = [];
    const start = 0.12;
    const end = Math.PI / 2 - 0.12;
    for (let s = 0; s <= 12; s++) {
      const angle = start + (end - start) * (s / 12);
      points.push(new THREE.Vector3(Math.cos(angle) * 0.62, Math.sin(angle) * 0.62, 0));
    }
    const segment = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, 0.016, 8, false), glow(color, 0.85));
    group.add(segment);
    segment.rotation.z = i * Math.PI / 2 + direction * 0.22;
    pieces.push(segment);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), glow(color, 0.58));
  group.add(core);
  return animate(group, 1.32, (t) => {
    pieces.forEach((piece, index) => {
      const targetAngle = index * Math.PI / 2;
      const initialAngle = targetAngle + direction * 0.22;
      piece.rotation.z = initialAngle + (targetAngle - initialAngle) * easeOut(t);
      (piece.material as THREE.MeshBasicMaterial).opacity = clamp01((t + index * 0.08) * 1.8) * (1 - t * 0.45);
    });
    core.scale.setScalar(0.72 + Math.sin(t * Math.PI) * 0.95);
    (core.material as THREE.MeshBasicMaterial).opacity = 0.72 - t * 0.38;
  });
}

function rise(target: THREE.Vector3, color: THREE.Color, groundY = 0): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(target).setY(groundY + 0.04);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.03, 12, 96), glow(color, 0.82));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.015;
  group.add(ring);
  const cracks = addLine(group, [
    new THREE.Vector3(-0.95, 0.035, 0), new THREE.Vector3(-0.38, 0.04, -0.26),
    new THREE.Vector3(0, 0.035, 0.08), new THREE.Vector3(0.4, 0.04, -0.24),
    new THREE.Vector3(0.96, 0.035, 0),
  ], lineMaterial(color, 0.84));
  const motes = Array.from({ length: 7 }, (_, index) => {
    const mote = new THREE.Mesh(new THREE.SphereGeometry(0.045 + (index % 3) * 0.012, 12, 9), glow(color, 0.9));
    const angle = index / 7 * Math.PI * 2;
    mote.position.set(Math.cos(angle) * (0.72 + index % 2 * 0.14), 0.08, Math.sin(angle) * (0.72 + index % 2 * 0.14));
    group.add(mote);
    return mote;
  });
  return animate(group, 1.45, (t) => {
    const spread = easeOut(Math.min(1, t * 1.65));
    ring.scale.setScalar(0.12 + spread * 1.4);
    (ring.material as THREE.MeshBasicMaterial).opacity = clamp01(1 - t * 0.82);
    (cracks.material as THREE.LineBasicMaterial).opacity = clamp01(1 - Math.max(0, t - 0.38) * 1.45);
    motes.forEach((mote, index) => {
      const angle = index / motes.length * Math.PI * 2 + t * 2.6;
      mote.position.set(Math.cos(angle) * (0.42 + spread * 0.9), 0.08 + Math.sin(t * 8 + index) * 0.34 + t * 0.75, Math.sin(angle) * (0.42 + spread * 0.9));
      mote.scale.setScalar(1 - t * 0.65);
      (mote.material as THREE.MeshBasicMaterial).opacity = clamp01(1 - t * 1.15);
    });
  });
}

function aegis(origin: THREE.Vector3, color: THREE.Color): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(origin);
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.05);
  shape.quadraticCurveTo(0.72, 0.8, 0.72, 0.22);
  shape.quadraticCurveTo(0.72, -0.62, 0, -1.02);
  shape.quadraticCurveTo(-0.72, -0.62, -0.72, 0.22);
  shape.quadraticCurveTo(-0.72, 0.8, 0, 1.05);
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), glow(color, 0.16));
  group.add(fill);
  const outlinePoints = shape.getPoints(44);
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePoints), lineMaterial(color, 0.95));
  group.add(outline);
  const seam = addLine(group, [
    new THREE.Vector3(0, 0.8, 0.01), new THREE.Vector3(0, -0.8, 0.01),
    new THREE.Vector3(-0.44, 0.27, 0.01), new THREE.Vector3(0, 0.02, 0.01), new THREE.Vector3(0.44, 0.27, 0.01),
  ], lineMaterial(color.clone().lerp(new THREE.Color('#ffffff'), 0.35), 0.78));
  return animate(group, 1.7, (t) => {
    const open = easeOut(Math.min(1, t / 0.28));
    group.scale.set(0.58 + open * 0.54, 0.58 + open * 0.54, 1);
    group.rotation.z = Math.sin(t * 2.5) * 0.025;
    const pulse = 0.72 + Math.sin(t * 7) * 0.13;
    const fade = t > 0.72 ? clamp01((1 - t) / 0.28) : 1;
    (fill.material as THREE.MeshBasicMaterial).opacity = pulse * 0.18 * fade;
    (outline.material as THREE.LineBasicMaterial).opacity = pulse * fade;
    (seam.material as THREE.LineBasicMaterial).opacity = pulse * 0.78 * fade;
  });
}
