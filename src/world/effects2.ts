import * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';
import { HOLLOW_STAG } from './characters/bosses.ts';
import { animate, facingPlane, type SpellAnimation, type SpellContext } from './effects.ts';
import { Character } from './rig/Character.ts';
import { terrainHeight } from './spatial.ts';
import { Trail, WHITE, clamp01, easeOutBack, easeOutCubic, flareTexture, glowSprite, ringTexture } from './vfx.ts';

/**
 * THE NEWER SPELLS
 * ────────────────
 * Ember Lash, Thornsnare, Moonblade, Wisp Swarm and Sunflare, and the eight legendary spells taken
 * from the bosses. Multi-target spells receive the points and delays the Encounter resolved, so
 * each visible impact lands on the beat the damage does.
 */

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();

function below(ctx: SpellContext, depth: number, side: number): THREE.Vector3 {
  const cam = ctx.cameraPosition ?? new THREE.Vector3(0, 1.8, 10);
  const q = ctx.cameraQuaternion;
  const half = Math.tan(THREE.MathUtils.degToRad((ctx.fov ?? 64) / 2)) * depth;
  return cam.clone().add(new THREE.Vector3(side * half * 0.4, -half * 1.05, -depth).applyQuaternion(q));
}

function impactBurst(ctx: SpellContext, at: THREE.Vector3, color: THREE.Color, force = 1): void {
  ctx.particles?.burst(at, Math.round(20 * force), { speed: 3.5 * force, color: color.clone().lerp(WHITE, 0.4), size: 0.06, ttl: 0.6, gravity: 5, drag: 1.2, style: 'spark' });
  ctx.particles?.burst(at, Math.round(12 * force), { speed: 1.6 * force, color, size: 0.2 * force, sizeEnd: 0.02, ttl: 0.6, drag: 2.2, style: 'glow' });
  ctx.light?.(at, color, 7 * force, 0.4, 8);
}

/* ─────────────────────────────── EMBER LASH ─────────────────────────────── */

function emberLash(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const side = ctx.hand === 'left' ? -1 : 1;
  const start = ctx.cameraPosition ? below(ctx, 1.1, side) : origin.clone();
  // The whip curls out to the side and cracks down onto the target.
  const curl = new THREE.Vector3(side * 2.2, 1.6, 0).applyQuaternion(ctx.cameraQuaternion);
  const mid = start.clone().lerp(target, 0.45).add(curl);
  const curve = new THREE.QuadraticBezierCurve3(start, mid, target);
  const flight = THREE.MathUtils.clamp(start.distanceTo(target) / 38, 0.18, 0.5);
  const outer = new Trail(color, 0.32, 0.32, 40, 1.2);
  const inner = new Trail(new THREE.Color('#ffe2a8'), 0.12, 0.26, 40, 1);
  const head = glowSprite('#ffd08a', 0.55, undefined, 1);
  group.add(outer.mesh, inner.mesh, head);
  const flare = facingPlane(flareTexture(), '#ffb066', 2.2, ctx.cameraQuaternion);
  flare.position.copy(target);
  group.add(flare);
  const p = new THREE.Vector3();
  return animate(group, flight + 1.1, (_t, age, dt) => {
    const u = clamp01(age / flight);
    curve.getPoint(easeOutCubic(u), p);
    head.position.copy(p);
    head.visible = age < flight + 0.05;
    if (age < flight) {
      outer.push(p); inner.push(p);
      ctx.particles?.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5), vy: 0.8 + Math.random(), vz: (Math.random() - 0.5), color: Math.random() < 0.5 ? color : new THREE.Color('#ffd08a'), size: 0.12, sizeEnd: 0.01, ttl: 0.5, drag: 1.5, gravity: -1.5, style: 'glow' });
    }
    const fade = clamp01(1 - Math.max(0, age - flight) / 0.5);
    outer.opacity = inner.opacity = fade;
    outer.update(dt, ctx.cameraPosition); inner.update(dt, ctx.cameraPosition);
    const k = (age - flight) / 0.5;
    flare.visible = k >= 0;
    if (k >= 0) { flare.scale.setScalar(0.4 + easeOutCubic(k * 2) * 1.2); flare.material.opacity = clamp01(1 - k); }
  }, flight, () => {
    impactBurst(ctx, target, color, 1.2);
    ctx.particles?.burst(target, 24, { speed: 1.2, direction: UP, spread: 0.8, color: new THREE.Color('#ff8a3d'), size: 0.16, sizeEnd: 0.01, ttl: 1.1, drag: 1, gravity: -2, style: 'glow' });
    ctx.screen?.shake(0.12);
  }, () => { outer.dispose(); inner.dispose(); });
}

/* ─────────────────────────────── THORNSNARE ─────────────────────────────── */

function thornsnare(target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const at = (ctx.targets?.[0] ?? target).clone();
  at.y = terrainHeight(at.x, at.z);
  const bark = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 0.85, emissive: color.clone().multiplyScalar(0.05) });
  const thorn = new THREE.MeshStandardMaterial({ color: '#2d2117', roughness: 0.7 });
  const roots: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const a0 = (i / 7) * Math.PI * 2, r0 = 1.3 + Math.random() * 0.6, h = 1.8 + Math.random() * 1.2;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const u = k / 10, a = a0 + u * 2.4 * (i % 2 ? 1 : -1), r = r0 * (1 - u * 0.7);
      pts.push(new THREE.Vector3(Math.cos(a) * r, u * h - 0.2, Math.sin(a) * r));
    }
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.09, 7);
    // Taper toward the tip.
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const ring = Math.floor(v / 8) / 40;
      const c = new THREE.CatmullRomCurve3(pts).getPoint(ring);
      tmp.fromBufferAttribute(pos, v).sub(c).multiplyScalar(1 - ring * 0.85).add(c);
      pos.setXYZ(v, tmp.x, tmp.y, tmp.z);
    }
    geometry.computeVertexNormals();
    const root = new THREE.Mesh(geometry, bark);
    root.position.copy(at);
    root.scale.set(1, 0.001, 1);
    for (let k = 1; k < 6; k++) {
      const c = new THREE.CatmullRomCurve3(pts).getPoint(k / 6);
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), thorn);
      s.position.copy(c);
      s.lookAt(c.clone().multiplyScalar(2));
      s.rotateX(Math.PI / 2);
      root.add(s);
    }
    roots.push(root);
    group.add(root);
  }
  const ring = facingPlane(ringTexture(), color, 1, undefined);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(at).setY(at.y + 0.05);
  group.add(ring);
  const life = 4.6;
  return animate(group, life, (_t, age) => {
    const grow = easeOutBack(clamp01((age - 0.35) / 0.45));
    const sink = clamp01((age - (life - 0.7)) / 0.7);
    roots.forEach((r, i) => {
      r.scale.set(1, Math.max(0.001, grow * (1 - sink) * (0.9 + 0.1 * Math.sin(age * 3 + i))), 1);
      r.rotation.y = Math.sin(age * 1.4 + i) * 0.05;
    });
    ring.scale.setScalar(0.5 + easeOutCubic(clamp01(age / 0.6)) * 3.2);
    ring.material.opacity = clamp01(1 - age / 0.9) * 0.8;
    if (Math.random() < 0.2 && age < life - 0.5) ctx.particles?.emit({ x: at.x + (Math.random() - 0.5) * 3, y: at.y + Math.random() * 2, z: at.z + (Math.random() - 0.5) * 3, vx: 0, vy: 0.3, vz: 0, color, size: 0.06, sizeEnd: 0.01, ttl: 1, drag: 1, style: 'glow' });
  }, 0.55, () => {
    ctx.mist?.burst(at.clone().setY(at.y + 0.3), 14, { speed: 2.2, direction: UP, spread: 2, color: new THREE.Color('#5d5040'), size: 0.9, sizeEnd: 2, alpha: 0.35, ttl: 1.3, drag: 1.6, style: 'mist' });
    ctx.particles?.burst(at, 30, { speed: 4, direction: UP, spread: 1.2, color: new THREE.Color('#6b5a44'), size: 0.06, ttl: 0.9, gravity: 9, drag: 0.6, style: 'spark' });
    ctx.screen?.shake(0.15);
  }, () => { bark.dispose(); thorn.dispose(); });
}

/* ─────────────────────────────── LANE SPELLS ─────────────────────────────── */

function crescentGeometry(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.absarc(0, 0, 1, Math.PI * 0.1, Math.PI * 0.9, false);
  s.absarc(0, -0.28, 0.82, Math.PI * 0.86, Math.PI * 0.14, true);
  return new THREE.ShapeGeometry(s, 24);
}

function laneOf(ctx: SpellContext, target: THREE.Vector3): { from: THREE.Vector3; dir: THREE.Vector3; length: number } {
  const from = ctx.lane?.from.clone() ?? (ctx.cameraPosition ?? new THREE.Vector3()).clone();
  const to = ctx.lane?.to.clone() ?? target.clone();
  const dir = to.clone().sub(from).setY(0);
  const length = Math.max(4, dir.length());
  return { from, dir: dir.normalize(), length };
}

function moonblade(target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const { from, dir, length } = laneOf(ctx, target);
  const blade = new THREE.Mesh(crescentGeometry(), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(0.55), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const glow = new THREE.Mesh(blade.geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fa8ff'), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  glow.scale.setScalar(1.35);
  blade.add(glow);
  blade.scale.setScalar(1.3);
  group.add(blade);
  const trail = new Trail(color, 0.5, 0.35, 40, 1);
  group.add(trail.mesh);
  const speed = 34, travel = Math.min(length, 48) / speed;
  const p = new THREE.Vector3();
  let hitIndex = 0;
  return animate(group, travel + 0.6, (_t, age, dt) => {
    const d = Math.min(age, travel) * speed;
    p.copy(from).addScaledVector(dir, d + 1.2);
    p.y = terrainHeight(p.x, p.z) + 1.25;
    blade.position.copy(p);
    // The crescent stands upright, edge-on to its flight, tilted as it spins slightly.
    blade.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    blade.rotateZ(Math.PI / 2 + Math.sin(age * 6) * 0.15);
    blade.scale.setScalar(0.9 + Math.min(1, age * 3) * 0.4);
    (blade.material as THREE.MeshBasicMaterial).opacity = 0.8 * clamp01(1 - Math.max(0, age - travel) / 0.4);
    trail.push(p);
    trail.update(dt, ctx.cameraPosition);
    trail.opacity = clamp01(1 - Math.max(0, age - travel) / 0.4);
    while (ctx.delays && hitIndex < ctx.delays.length && age >= ctx.delays[hitIndex]) { impactBurst(ctx, ctx.targets![hitIndex], color, 0.9); hitIndex++; }
    if (Math.random() < 0.6) ctx.particles?.emit({ x: p.x, y: p.y + (Math.random() - 0.5), z: p.z, vx: 0, vy: 0.2, vz: 0, color, size: 0.06, sizeEnd: 0.01, ttl: 0.6, drag: 1.5, style: 'glow' });
  }, 0.18, () => ctx.screen?.flash('#dfe8ff', 0.12), () => trail.dispose());
}

function earthshatter(target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const { from, dir, length } = laneOf(ctx, target);
  const reach = Math.min(length, 45);
  const rock = new THREE.MeshStandardMaterial({ color: '#5e5446', roughness: 0.95, flatShading: true, emissive: '#2a1206' });
  const shards: Array<{ mesh: THREE.Mesh; at: number; base: number }> = [];
  for (let d = 2; d < reach; d += 0.9) {
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.35 + Math.random() * 0.35, 0), rock);
      const p = from.clone().addScaledVector(dir, d).add(new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(s * (0.5 + Math.random() * 0.6)));
      p.y = terrainHeight(p.x, p.z) - 0.6;
      m.position.copy(p);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      group.add(m);
      shards.push({ mesh: m, at: d / 22, base: p.y });
    }
  }
  // A glowing seam that runs ahead of the shards.
  const seamGeometry = new THREE.PlaneGeometry(reach, 0.5, 40, 1);
  seamGeometry.translate(reach / 2, 0, 0);
  const seam = new THREE.Mesh(seamGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uFront: { value: 0 }, uFade: { value: 1 }, uColor: { value: color.clone() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uFront; uniform float uFade; uniform vec3 uColor; varying vec2 vUv;
      void main(){ if (vUv.x > uFront) discard; float e = 1.0 - abs(vUv.y * 2.0 - 1.0); float jag = 0.5 + 0.5 * sin(vUv.x * 140.0) * sin(vUv.x * 37.0);
        gl_FragColor = vec4(uColor * 1.8 + vec3(0.4, 0.2, 0.0), pow(e, 2.0 + jag * 2.0) * uFade); }`,
  }));
  seam.rotation.x = -Math.PI / 2;
  seam.rotation.z = Math.atan2(-dir.z, dir.x);
  seam.position.copy(from).setY(terrainHeight(from.x, from.z) + 0.08);
  group.add(seam);
  const life = reach / 22 + 1.6;
  return animate(group, life, (_t, age) => {
    const front = Math.min(1, (age * 22) / reach);
    (seam.material as THREE.ShaderMaterial).uniforms.uFront.value = front;
    (seam.material as THREE.ShaderMaterial).uniforms.uFade.value = clamp01(1 - (age - life + 0.8) / 0.8);
    for (const s of shards) {
      const k = age - s.at;
      const rise = k < 0 ? 0 : easeOutBack(clamp01(k / 0.25)) * (1 - clamp01((k - 0.9) / 0.6));
      s.mesh.position.y = s.base + rise * 1.1;
      if (k > 0 && k < 0.03) {
        ctx.particles?.burst(s.mesh.position.clone().setY(s.base + 0.6), 6, { speed: 3, direction: UP, spread: 1, color: new THREE.Color('#7a6a54'), size: 0.06, ttl: 0.7, gravity: 9, style: 'spark' });
        ctx.mist?.emit({ x: s.mesh.position.x, y: s.base + 0.7, z: s.mesh.position.z, vx: 0, vy: 0.6, vz: 0, color: new THREE.Color('#5d5040'), size: 0.9, sizeEnd: 2, alpha: 0.3, ttl: 1.2, drag: 1.5, style: 'mist' });
      }
    }
    if (age < reach / 22) ctx.screen?.shake(0.04);
  }, 0.18, () => { ctx.screen?.shake(0.35); ctx.screen?.flash('#d79a5b', 0.18); }, () => rock.dispose());
}

function spiritStag(target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const { from, dir, length } = laneOf(ctx, target);
  const reach = Math.min(length, 48);
  // The freed Hollow Stag, made of light, gallops down your aim.
  const stag = new Character(HOLLOW_STAG, 0.5);
  stag.u.uExposure.value = 2.6;
  stag.u.uFlashColor.value.set('#e8f4ff');
  stag.u.uEyeColor.value.set('#ffffff');
  stag.u.uMist.value = 0;
  group.add(stag.group);
  const yaw = Math.atan2(dir.x, dir.z);
  stag.setYaw(yaw);
  const velocity = dir.clone().multiplyScalar(18);
  const look = (ctx.cameraPosition ?? new THREE.Vector3()).clone();
  const start = from.clone().addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), ctx.hand === 'left' ? -1.6 : 1.6).addScaledVector(dir, -1);
  const travel = reach / 18;
  const trail = new Trail(color, 1.2, 0.6, 40, 1);
  group.add(trail.mesh);
  let hitIndex = 0;
  stag.awaken(0.35);
  return animate(group, travel + 1.0, (_t, age, dt) => {
    const d = Math.min(age, travel) * 18;
    const p = stag.group.position.copy(start).addScaledVector(dir, d);
    p.y = terrainHeight(p.x, p.z);
    stag.update(dt, { pose: 'strike', progress: 0.5, attack: 'charge', velocity: age < travel ? velocity : new THREE.Vector3(), faceYaw: yaw, look, groundY: p.y });
    stag.u.uFlash.value = 0.7 + Math.sin(age * 20) * 0.15;
    if (age > travel) stag.u.uDissolve.value = clamp01((age - travel) / 0.8);
    trail.push(tmp.copy(p).setY(p.y + 2.2));
    trail.update(dt, ctx.cameraPosition);
    trail.opacity = clamp01(1 - Math.max(0, age - travel) / 0.6);
    if (Math.random() < 0.9) ctx.particles?.emit({ x: p.x + (Math.random() - 0.5), y: p.y + Math.random() * 3, z: p.z + (Math.random() - 0.5), vx: -dir.x * 2, vy: 0.5, vz: -dir.z * 2, color: Math.random() < 0.5 ? color : new THREE.Color('#9fe8ff'), size: 0.1, sizeEnd: 0.01, ttl: 0.8, drag: 1.2, style: 'glow' });
    ctx.illuminate?.(1, tmp.copy(p).setY(p.y + 2), color, 1.4, 9);
    while (ctx.delays && hitIndex < ctx.delays.length && age >= ctx.delays[hitIndex]) { impactBurst(ctx, ctx.targets![hitIndex], color, 1.3); ctx.screen?.shake(0.12); hitIndex++; }
  }, 0.1, () => ctx.screen?.flash('#f2f7ff', 0.2), () => { trail.dispose(); stag.dispose(); });
}

function dawnbreak(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const { from, dir, length } = laneOf(ctx, target);
  const reach = Math.min(length, 60);
  const start = ctx.cameraPosition ? below(ctx, 1.4, ctx.hand === 'left' ? -1 : 1) : origin.clone();
  const end = from.clone().addScaledVector(dir, reach).setY(start.y + 1.5);
  const axis = end.clone().sub(start);
  const beamLength = axis.length();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, beamLength, 24, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float flow = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 30.0);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), edge * 0.8) * 1.6, edge * uAlpha * flow); }`,
  }));
  beam.position.copy(start).addScaledVector(axis, 0.5);
  beam.quaternion.setFromUnitVectors(UP, axis.clone().normalize());
  group.add(beam);
  const sun = facingPlane(flareTexture(), color, 6, ctx.cameraQuaternion);
  sun.position.copy(end);
  group.add(sun);
  let hitIndex = 0;
  return animate(group, 2.6, (_t, age) => {
    const on = clamp01(age / 0.15) * clamp01(1 - (age - 1.6) / 0.9);
    const m = beam.material as THREE.ShaderMaterial;
    m.uniforms.uAlpha.value = on;
    m.uniforms.uTime.value = age;
    beam.scale.set(0.45 + Math.sin(age * 30) * 0.03 + on * 0.25, 1, 0.45 + on * 0.25);
    sun.scale.setScalar(1 + on * 2.5 + Math.sin(age * 9) * 0.1);
    sun.material.opacity = on;
    ctx.illuminate?.(0, end, color, 3 * on, 30);
    ctx.illuminate?.(1, start.clone().lerp(end, 0.4), color, 2 * on, 18);
    while (ctx.delays && hitIndex < ctx.delays.length && age >= ctx.delays[hitIndex]) { impactBurst(ctx, ctx.targets![hitIndex], color, 1.4); hitIndex++; }
  }, 0.18, () => { ctx.screen?.flash('#ffe7a3', 0.4); ctx.screen?.shake(0.3); });
}

/* ─────────────────────────────── SEEKERS AND FALLS ─────────────────────────────── */

function wispSwarm(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  // With nothing to hunt, the wisps still fly out toward the aim and burst there.
  const targets = ctx.targets?.length ? ctx.targets : [0, 1, 2, 3].map((i) => target.clone().add(new THREE.Vector3((i - 1.5) * 1.2, (i % 2) * 0.8, 0)));
  const delays = ctx.targets?.length ? ctx.delays ?? [] : [0.8, 0.9, 1.0, 1.1];
  const wisps = targets.map((to, i) => {
    const head = glowSprite(color.clone().lerp(WHITE, 0.3), 0.42, undefined, 1);
    const trail = new Trail(color, 0.1, 0.5, 36, 1);
    group.add(head, trail.mesh);
    const start = origin.clone();
    const swirl = new THREE.Vector3(Math.cos(i * 1.6) * 1.6, 1.2 + (i % 2) * 0.8, Math.sin(i * 1.6) * 1.6 - 1.2);
    const curve = new THREE.CubicBezierCurve3(start, start.clone().add(swirl), to.clone().add(new THREE.Vector3(0, 3, 0)), to);
    return { head, trail, curve, delay: delays[i] ?? 0.9, done: false, to };
  });
  const p = new THREE.Vector3();
  const life = Math.max(1.2, ...wisps.map((w) => w.delay)) + 0.8;
  return animate(group, life, (_t, age, dt) => {
    for (const w of wisps) {
      const u = clamp01(age / w.delay);
      w.curve.getPoint(u * u * (3 - 2 * u), p);
      w.head.position.copy(p);
      w.head.visible = u < 1;
      if (u < 1) w.trail.push(p);
      w.trail.update(dt, ctx.cameraPosition);
      w.trail.opacity = clamp01(1 - Math.max(0, age - w.delay) / 0.4);
      if (!w.done && u >= 1) { w.done = true; impactBurst(ctx, w.to, color, 0.8); }
    }
  }, 0.2, undefined, () => wisps.forEach((w) => w.trail.dispose()));
}

function starfall(color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const targets = ctx.targets ?? [];
  const delays = ctx.delays ?? [];
  const stars = targets.map((to, i) => {
    const from = to.clone().add(new THREE.Vector3(-6 + Math.random() * 3, 26, -8));
    const head = glowSprite(color.clone().lerp(WHITE, 0.5), 1.1, undefined, 1);
    const trail = new Trail(color, 0.45, 0.6, 30, 1);
    group.add(head, trail.mesh);
    return { from, to, head, trail, at: delays[i] ?? 1, done: false };
  });
  // A few that fall wide, for the sky's sake.
  for (let i = 0; i < 6; i++) {
    const to = new THREE.Vector3((Math.random() - 0.5) * 40, 0, -10 - Math.random() * 30);
    to.y = terrainHeight(to.x, to.z);
    const head = glowSprite(color, 0.8, undefined, 0.8);
    const trail = new Trail(color, 0.3, 0.5, 24, 1);
    group.add(head, trail.mesh);
    stars.push({ from: to.clone().add(new THREE.Vector3(-5, 26, -8)), to, head, trail, at: 0.7 + Math.random() * 1.6, done: false });
  }
  const p = new THREE.Vector3();
  const life = Math.max(1.5, ...stars.map((s) => s.at)) + 1;
  return animate(group, life, (_t, age, dt) => {
    for (const s of stars) {
      const u = clamp01((age - (s.at - 0.7)) / 0.7);
      p.copy(s.from).lerp(s.to, u * u);
      s.head.position.copy(p);
      s.head.visible = u > 0 && u < 1;
      if (u > 0 && u < 1) s.trail.push(p);
      s.trail.update(dt, ctx.cameraPosition);
      if (!s.done && u >= 1) {
        s.done = true;
        impactBurst(ctx, s.to, color, 1.3);
        ctx.mist?.burst(s.to.clone(), 6, { speed: 1.5, color: new THREE.Color('#5d5a66'), size: 1, sizeEnd: 2.2, alpha: 0.3, ttl: 1.2, drag: 1.4, style: 'mist' });
        ctx.screen?.shake(0.08);
      }
    }
  }, 0.2, () => ctx.screen?.flash('#ffd9f2', 0.15), () => stars.forEach((s) => s.trail.dispose()));
}

/* ─────────────────────────────── AROUND THE CASTER ─────────────────────────────── */

function sunflare(origin: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const at = origin.clone();
  const core = facingPlane(flareTexture(), color, 3, ctx.cameraQuaternion);
  const ring = facingPlane(ringTexture(), color, 1, ctx.cameraQuaternion);
  core.position.copy(at); ring.position.copy(at);
  group.add(core, ring);
  const rays: THREE.Sprite[] = [];
  for (let i = 0; i < 10; i++) { const s = glowSprite(color, 0.4, undefined, 0.9); s.position.copy(at); group.add(s); rays.push(s); }
  return animate(group, 1.3, (_t, age) => {
    const gather = clamp01(age / 0.25), burst = clamp01((age - 0.25) / 1.0);
    core.scale.setScalar(0.2 + gather * 0.8 + easeOutCubic(burst) * 4);
    core.material.opacity = burst > 0 ? 1 - burst : gather;
    ring.scale.setScalar(0.5 + easeOutCubic(burst) * 14);
    ring.material.opacity = (1 - burst) * 0.8;
    rays.forEach((s, i) => {
      const a = (i / rays.length) * Math.PI * 2;
      s.position.copy(at).add(new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyQuaternion(ctx.cameraQuaternion).multiplyScalar(easeOutCubic(burst) * 6));
      s.material.opacity = 1 - burst;
    });
    ctx.illuminate?.(0, at, color, 3 * (1 - burst) * gather, 40);
  }, 0.25, () => { ctx.screen?.flash('#fff6d0', 0.55); ctx.particles?.burst(at, 40, { speed: 6, color, size: 0.08, ttl: 0.8, drag: 1.2, style: 'spark' }); });
}

function moonveil(origin: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const cam = (ctx.cameraPosition ?? origin).clone();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(2.6, 40, 24), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    uniforms: { uColor: { value: color.clone() }, uAlpha: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec3 vN; varying vec3 vP;
      void main(){ float bands = 0.5 + 0.5 * sin(vP.y * 9.0 + uTime * 1.5 + sin(vP.x * 4.0 + uTime) * 1.5);
        float edge = 1.0 - abs(vN.z);
        gl_FragColor = vec4(uColor * 1.2, (0.05 + 0.18 * bands * edge) * uAlpha); }`,
  }));
  shell.position.copy(cam);
  group.add(shell);
  const life = 7;
  return animate(group, life, (_t, age) => {
    const on = clamp01(age / 0.4) * clamp01((life - age) / 0.8);
    const m = shell.material as THREE.ShaderMaterial;
    m.uniforms.uAlpha.value = on;
    m.uniforms.uTime.value = age;
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2, y = (Math.random() - 0.3) * 2;
      const p = cam.clone().add(new THREE.Vector3(Math.cos(a) * 2.4, y, Math.sin(a) * 2.4));
      ctx.particles?.emit({ x: p.x, y: p.y, z: p.z, vx: -Math.sin(a) * 0.4, vy: 0.15, vz: Math.cos(a) * 0.4, color, size: 0.05, sizeEnd: 0.01, ttl: 1.6, drag: 0.5, style: 'glow' });
    }
  }, 0.1, () => ctx.screen?.flash('#cbb8ff', 0.25));
}

function verdantBloom(origin: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const cam = (ctx.cameraPosition ?? origin).clone();
  const ground = cam.clone().setY(terrainHeight(cam.x, cam.z));
  // Flowers open across the ground in front of the caster.
  const petal = new THREE.MeshBasicMaterial({ color: '#ffd6f0', transparent: true });
  const petal2 = new THREE.MeshBasicMaterial({ color: '#fff3a8', transparent: true });
  const stem = new THREE.MeshBasicMaterial({ color: '#5f9a4a', transparent: true });
  const flowers: Array<{ g: THREE.Group; at: number }> = [];
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.cameraQuaternion).setY(0).normalize();
  for (let i = 0; i < 40; i++) {
    const g = new THREE.Group();
    const d = 1.5 + Math.random() * 9, a = (Math.random() - 0.5) * 1.6;
    const p = ground.clone().addScaledVector(forward.clone().applyAxisAngle(UP, a), d);
    p.y = terrainHeight(p.x, p.z);
    g.position.copy(p);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.3, 4), stem); s.position.y = 0.15; g.add(s);
    const mat = i % 3 ? petal : petal2;
    for (let k = 0; k < 5; k++) {
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.05, 6), mat);
      leaf.position.set(Math.cos(k * 1.256) * 0.05, 0.31, Math.sin(k * 1.256) * 0.05);
      leaf.rotation.x = -Math.PI / 2 + 0.5;
      leaf.rotation.z = k * 1.256;
      g.add(leaf);
    }
    g.scale.setScalar(0.001);
    group.add(g);
    flowers.push({ g, at: 0.2 + d * 0.08 });
  }
  const ring = facingPlane(ringTexture(), color, 1, undefined);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(ground).setY(ground.y + 0.1);
  group.add(ring);
  return animate(group, 4.5, (_t, age) => {
    for (const f of flowers) f.g.scale.setScalar(Math.max(0.001, easeOutBack(clamp01((age - f.at) / 0.5)) * clamp01((4.5 - age) / 0.8) * 2.2));
    ring.scale.setScalar(1 + easeOutCubic(clamp01(age / 1.2)) * 14);
    ring.material.opacity = clamp01(1 - age / 1.2) * 0.7;
    if (Math.random() < 0.8) {
      const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2;
      ctx.particles?.emit({ x: cam.x + Math.cos(a) * r, y: ground.y + 0.2, z: cam.z + Math.sin(a) * r - 1.5, vx: 0, vy: 1 + Math.random(), vz: 0, color: Math.random() < 0.5 ? color : new THREE.Color('#ffd6f0'), size: 0.07, sizeEnd: 0.01, ttl: 1.6, drag: 0.6, style: 'glow' });
    }
  }, 0.3, () => ctx.screen?.flash('#bfffb0', 0.25), () => { petal.dispose(); petal2.dispose(); stem.dispose(); });
}

function tidecaller(color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const cam = (ctx.cameraPosition ?? new THREE.Vector3()).clone();
  const q = ctx.cameraQuaternion;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q).setY(0).normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q).setY(0).normalize();
  // A serpent of water swims across the field from one side to the other, rearing as it goes.
  const body = new Trail(color, 1.6, 0.9, 60, 1.2);
  const foam = new Trail(new THREE.Color('#e8fbff'), 0.5, 0.7, 60, 1);
  const head = glowSprite('#bff4ff', 1.8, undefined, 1);
  group.add(body.mesh, foam.mesh, head);
  const p = new THREE.Vector3();
  let hitIndex = 0;
  return animate(group, 3.2, (_t, age, dt) => {
    const u = clamp01(age / 2.4);
    const across = -26 + u * 52;
    p.copy(cam).addScaledVector(forward, 16 + Math.sin(u * Math.PI * 3) * 6).addScaledVector(right, across);
    p.y = terrainHeight(p.x, p.z) + 1.2 + Math.abs(Math.sin(u * Math.PI * 4)) * 2.2;
    head.position.copy(p);
    head.visible = u < 1;
    if (u < 1) { body.push(p); foam.push(tmp.copy(p).setY(p.y + 0.5)); }
    body.update(dt, cam); foam.update(dt, cam);
    body.opacity = foam.opacity = clamp01((3.2 - age) / 0.8);
    if (u < 1) for (let i = 0; i < 3; i++) ctx.particles?.emit({ x: p.x + (Math.random() - 0.5) * 1.5, y: p.y, z: p.z + (Math.random() - 0.5) * 1.5, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 2, color: Math.random() < 0.6 ? color : new THREE.Color('#e8fbff'), size: 0.08, ttl: 0.8, gravity: 7, drag: 0.5, style: 'spark' });
    ctx.illuminate?.(1, p, color, 1.2, 12);
    while (ctx.delays && hitIndex < ctx.delays.length && age >= ctx.delays[hitIndex]) { impactBurst(ctx, ctx.targets![hitIndex], color, 1.2); hitIndex++; }
  }, 0.4, () => ctx.screen?.flash('#5fd0e8', 0.2), () => { body.dispose(); foam.dispose(); });
}

function stillness(color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const cam = (ctx.cameraPosition ?? new THREE.Vector3()).clone();
  const ground = cam.clone().setY(terrainHeight(cam.x, cam.z) + 0.15);
  const rings = [0, 0.25, 0.5].map(() => {
    const r = facingPlane(ringTexture(), color, 1, undefined);
    r.rotation.x = -Math.PI / 2;
    r.position.copy(ground);
    group.add(r);
    return r;
  });
  return animate(group, 2.4, (_t, age) => {
    rings.forEach((r, i) => {
      const k = clamp01((age - i * 0.25) / 1.8);
      r.scale.setScalar(1 + easeOutCubic(k) * 70);
      r.material.opacity = (1 - k) * 0.6;
    });
  }, 0.1, () => {
    ctx.screen?.flash('#dfe9ec', 0.35);
    ctx.particles?.burst(cam.clone().add(new THREE.Vector3(0, 0, -3).applyQuaternion(ctx.cameraQuaternion)), 60, { speed: 0.3, radius: 5, color, size: 0.05, ttl: 3, drag: 4, style: 'glow' });
  });
}

/** Route a newer spell to its animation. */
export function createSpellAnimation2(kind: SpellEffect, origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation | null {
  switch (kind) {
    case 'fire': return emberLash(origin, target, color, ctx);
    case 'roots': return thornsnare(target, color, ctx);
    case 'blade': return moonblade(target, color, ctx);
    case 'wisps': return wispSwarm(origin, target, color, ctx);
    case 'flare': return sunflare(origin, color, ctx);
    case 'quake': return earthshatter(target, color, ctx);
    case 'veil': return moonveil(origin, color, ctx);
    case 'tide': return tidecaller(color, ctx);
    case 'bloom': return verdantBloom(origin, color, ctx);
    case 'stag': return spiritStag(target, color, ctx);
    case 'starfall': return starfall(color, ctx);
    case 'stillness': return stillness(color, ctx);
    case 'dawn': return dawnbreak(origin, target, color, ctx);
    default: return null;
  }
}
