import * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';
import {
  Trail, WHITE, clamp01, disposeGroup, easeInOut, easeOutBack, easeOutCubic, energy, flareTexture, glowSprite,
  ringTexture, rng, type FxContext,
} from './vfx.ts';
import { createSpellAnimation2 } from './effects2.ts';
import { frostbind } from './fx/frostbind.ts';

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
  /** Vertical field of view of the casting camera (degrees). */
  fov?: number;
  light?: LightFlash;
  /**
   * Light the surrounding world (ground, trees, grass, fog, creatures) this frame. `slot` picks one
   * of the shared world lights; it fades within a few frames unless refreshed.
   */
  illuminate?: (slot: number, position: THREE.Vector3, color: THREE.Color, level: number, radius: number) => void;
  /** Multi-target spells: where each hit lands and when (seconds after the cast). */
  targets?: THREE.Vector3[];
  delays?: number[];
  /** Lane spells: the line they travel. */
  lane?: { from: THREE.Vector3; to: THREE.Vector3 };
  /** Arrow only: called at impact with the point and the tip direction the arrow should stick at. */
  onStick?: (point: THREE.Vector3, tipDirection: THREE.Vector3, scale: number) => void;
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
    case 'frost': return frostbind(target, color, ctx);
    case 'healing': return mend(origin, color, detail, ctx);
    case 'summon': return rise(target, color, ctx);
    case 'shield': return aegis(origin, color, ctx);
    default: return createSpellAnimation2(kind, origin, target, color, ctx) ?? aegis(origin, color, ctx);
  }
}

export function animate(
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
export function facingPlane(texture: THREE.Texture, color: THREE.ColorRepresentation, size: number, quaternion?: THREE.Quaternion): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const material = energy(color, 0);
  material.map = texture;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  if (quaternion) mesh.quaternion.copy(quaternion);
  mesh.renderOrder = 7;
  return mesh;
}

/* ═══════════════════════════════ ARCANE ARROW ═══════════════════════════════ */

let featherTextureCache: THREE.Texture | null = null;
/** A barred hawk feather painted once at high resolution: vane, rachis, barbs and a notched edge. */
function featherTexture(): THREE.Texture {
  if (featherTextureCache) return featherTextureCache;
  if (typeof document === 'undefined') return (featherTextureCache = new THREE.Texture());
  const w = 128, h = 512;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d')!;
  const random = rng(7);
  // The vane: rounded at the top, cut straight along the shaft side (x = 0), trimmed low at the back.
  const vane = new Path2D();
  vane.moveTo(4, 8);
  vane.bezierCurveTo(70, 10, 122, 90, 120, 210);
  vane.bezierCurveTo(118, 330, 96, 420, 60, 500);
  vane.lineTo(4, 504);
  vane.closePath();
  g.save(); g.clip(vane);
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#ece3cf'); base.addColorStop(0.35, '#c9b48e'); base.addColorStop(1, '#5b4632');
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  // Dark bars like a hawk's flight feather.
  for (let y = 40; y < h; y += 46 + random() * 10) {
    g.fillStyle = `rgba(48,32,22,${0.45 + random() * 0.25})`;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(50, y - 10, 90, y + 6, 128, y - 14); g.lineTo(128, y + 8); g.bezierCurveTo(90, y + 26, 50, y + 12, 0, y + 20); g.fill();
  }
  // Barbs: fine lines sweeping back from the shaft.
  g.lineWidth = 1;
  for (let y = 0; y < h + 40; y += 3) {
    g.strokeStyle = `rgba(${random() < 0.5 ? '255,248,230' : '30,22,16'},${0.08 + random() * 0.12})`;
    g.beginPath(); g.moveTo(6, y); g.quadraticCurveTo(60, y - 18, 128, y - 46); g.stroke();
  }
  g.restore();
  // Notches where the barbs have separated.
  g.globalCompositeOperation = 'destination-out';
  for (const y of [120, 260, 380]) { g.beginPath(); g.moveTo(130, y); g.lineTo(78 + random() * 14, y + 6); g.lineTo(130, y + 14); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  // The rachis.
  g.strokeStyle = '#efe6d2'; g.lineWidth = 5; g.beginPath(); g.moveTo(3, 0); g.lineTo(3, h); g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return (featherTextureCache = texture);
}

/** A leaf-shaped broadhead blade with swept-back barbs, centred on its axis, tip at +Y. */
function bladeShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.13);
  s.bezierCurveTo(0.018, 0.09, 0.034, 0.045, 0.036, 0.0);
  s.lineTo(0.046, -0.04);
  s.lineTo(0.016, -0.018);
  s.lineTo(0.009, -0.03);
  s.lineTo(-0.009, -0.03);
  s.lineTo(-0.016, -0.018);
  s.lineTo(-0.046, -0.04);
  s.lineTo(-0.036, 0.0);
  s.bezierCurveTo(-0.034, 0.045, -0.018, 0.09, 0, 0.13);
  return s;
}

/**
 * The Arcane Arrow: a dark ash shaft wound with a faint rune spiral, a forged cross broadhead whose
 * edges carry the spell's light, barred feather fletching set at a slight helical angle, and a
 * glowing nock. +Y is the tip direction and the point sits at the origin.
 */
export function createArrowMesh(color: THREE.Color): { root: THREE.Group; materials: THREE.Material[]; halo: THREE.Sprite } {
  const root = new THREE.Group();
  root.name = 'Arcane arrow';
  const materials: THREE.Material[] = [];
  const hot = color.clone().lerp(WHITE, 0.6);
  const keep = <M extends THREE.Material>(m: M): M => { m.transparent = true; materials.push(m); return m; };
  const L = 0.86;
  // Shaft: ash wood, lit by the scene so it reads as an object, not a glow.
  const wood = keep(new THREE.MeshStandardMaterial({ color: '#6b4a2f', roughness: 0.62, metalness: 0.0, emissive: '#1b120b' }));
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0125, L, 10, 1), wood);
  shaft.position.y = -0.16 - L / 2;
  root.add(shaft);
  // A rune band spirals down the first half of the shaft.
  const helix: THREE.Vector3[] = [];
  for (let i = 0; i <= 64; i++) { const u = i / 64; const a = u * Math.PI * 7; helix.push(new THREE.Vector3(Math.cos(a) * 0.0128, -0.17 - u * 0.42, Math.sin(a) * 0.0128)); }
  const runeMaterial = keep(new THREE.MeshBasicMaterial({ color: hot, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.45 }));
  root.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 96, 0.0014, 4), runeMaterial));
  // Ferrule binding the head.
  const brass = keep(new THREE.MeshStandardMaterial({ color: '#a07a3c', roughness: 0.35, metalness: 0.85, emissive: '#2a1a08' }));
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0115, 0.05, 10), brass);
  ferrule.position.y = -0.145;
  root.add(ferrule);
  // Cross broadhead: two forged blades, dark steel with a bright honed edge.
  const steel = keep(new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.32, metalness: 0.45, emissive: color.clone().multiplyScalar(0.12) }));
  const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape(), { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.003, bevelSegments: 1, curveSegments: 10 });
  bladeGeometry.translate(0, -0.13, -0.002);
  const edgeMaterial = keep(new THREE.MeshBasicMaterial({ color: hot, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32, side: THREE.DoubleSide }));
  const edgeGeometry = new THREE.ShapeGeometry(bladeShape(), 10);
  edgeGeometry.translate(0, -0.13, 0);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(bladeGeometry, steel);
    blade.rotation.y = i * Math.PI / 2;
    root.add(blade);
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edge.rotation.y = i * Math.PI / 2;
    edge.scale.set(1.09, 1.03, 1);
    edge.position.y = 0.004;
    root.add(edge);
  }
  // Fletching: three barred feathers, each with a slight helical set so the arrow spins true.
  const feather = keep(new THREE.MeshStandardMaterial({ map: featherTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 }));
  const vaneGeometry = new THREE.PlaneGeometry(0.05, 0.2, 1, 6);
  vaneGeometry.translate(0.025 + 0.011, 0, 0);
  // A gentle curl: the vane bows out along its length.
  const vp = vaneGeometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < vp.count; i++) { const y = vp.getY(i); vp.setZ(i, Math.sin((y / 0.2 + 0.5) * Math.PI) * 0.006); }
  vaneGeometry.computeVertexNormals();
  for (let i = 0; i < 3; i++) {
    const holder = new THREE.Object3D();
    holder.rotation.y = (i / 3) * Math.PI * 2;
    holder.position.y = -0.16 - L + 0.15;
    const vane = new THREE.Mesh(vaneGeometry, feather);
    vane.rotation.y = 0.08;
    holder.add(vane);
    root.add(holder);
  }
  // Nock: a dark horn notch holding a small ember of the spell.
  const horn = keep(new THREE.MeshStandardMaterial({ color: '#241b17', roughness: 0.4, metalness: 0.1 }));
  const nock = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.011, 0.03, 10), horn);
  nock.position.y = -0.16 - L - 0.005;
  root.add(nock);
  const ember = glowSprite(color, 0.07, undefined, 0.9);
  ember.position.y = -0.16 - L - 0.02;
  materials.push(ember.material);
  root.add(ember);
  const halo = glowSprite(color, 0.26, undefined, 0.55);
  halo.position.y = -0.03;
  materials.push(halo.material);
  root.add(halo);
  return { root, materials, halo };
}

/** The point just under the bottom edge of the view at `depth` metres, toward the casting hand. */
function belowView(ctx: SpellContext, depth: number, side: number, out: THREE.Vector3): THREE.Vector3 {
  const cam = ctx.cameraPosition!;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.cameraQuaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ctx.cameraQuaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.cameraQuaternion);
  const half = Math.tan(THREE.MathUtils.degToRad((ctx.fov ?? 64) / 2)) * depth;
  return out.copy(cam).addScaledVector(forward, depth).addScaledVector(up, -half * 1.12).addScaledVector(right, side * half * 0.35);
}

function arrow(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, detail: string | undefined, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  const power = clamp01((Number(detail?.match(/(\d+)%/)?.[1]) || 65) / 100);
  const side = ctx.hand === 'left' ? -1 : 1;
  // Loosed from the bow below the frame: the shot rises out of the bottom edge of the screen and
  // its trail begins there, the way an arrow leaves an archer's hands, never from mid-field.
  const launch = origin.clone();
  if (ctx.cameraPosition) belowView(ctx, 0.9, side, launch);
  const to = target.clone();
  const distance = Math.max(0.5, launch.distanceTo(to));
  // A real arrow's lob: enough arc that its flight (and the angle it lands at) reads on screen.
  const lift = Math.min(2.6, distance * 0.06) * (1.15 - power * 0.45);
  const pathPoint = (u: number, out: THREE.Vector3) => out.copy(launch).lerp(to, u).addScaledVector(UP, 4 * lift * u * (1 - u));
  const flight = THREE.MathUtils.clamp(distance / (26 + power * 24), 0.24, 1);
  const duration = flight + 1.0;
  const streak = arrowStreak(pathPoint, color, ctx.cameraPosition, power);
  group.add(streak.mesh);

  const { root, halo } = createArrowMesh(color);
  const arrowScale = 1.25 + power * 0.35;
  root.scale.setScalar(arrowScale);
  group.add(root);
  // A fine core of light and two filaments winding around the flight line.
  const trail = new Trail(color.clone().lerp(WHITE, 0.25), 0.035 * (0.8 + power * 0.5), 0.2 + power * 0.12, 40, 1.4);
  const twinA = new Trail(color, 0.016, 0.34, 46, 1);
  const twinB = new Trail(color.clone().lerp(WHITE, 0.4), 0.012, 0.3, 46, 1);
  group.add(trail.mesh, twinA.mesh, twinB.mesh);

  const impactFlare = facingPlane(flareTexture(), color.clone().lerp(WHITE, 0.45), 2.2, ctx.cameraQuaternion);
  const impactRing = facingPlane(ringTexture(), color, 1, ctx.cameraQuaternion);
  impactFlare.position.copy(to);
  impactRing.position.copy(to);
  group.add(impactFlare, impactRing);

  const head = new THREE.Vector3(), ahead = new THREE.Vector3(), tangent = new THREE.Vector3();
  const sideA = new THREE.Vector3(), sideB = new THREE.Vector3(), wind = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  const direction = to.clone().sub(launch).normalize();
  const moteColor = color.clone().lerp(WHITE, 0.25);
  const sparkColor = color.clone().lerp(WHITE, 0.55);
  let roll = Math.random() * Math.PI * 2;

  const onImpact = () => {
    if (ctx.onStick) {
      // Stick along the arrow's actual flight direction at the moment it lands.
      const tip = pathPoint(1, new THREE.Vector3()).sub(pathPoint(0.985, new THREE.Vector3())).normalize();
      ctx.onStick(to.clone(), tip, arrowScale);
    }
    const back = direction.clone().negate();
    ctx.particles?.burst(to, Math.round(24 + power * 30), { speed: 6 + power * 5, direction: back, spread: 1.0, color: sparkColor, size: 0.05, ttl: 0.5, gravity: 7, drag: 1.2, style: 'spark' });
    ctx.particles?.burst(to, 12, { speed: 1.8, color, size: 0.16, sizeEnd: 0.02, ttl: 0.55, drag: 2.5, style: 'glow' });
    // Splinters of wood and feather down.
    ctx.particles?.burst(to, 8, { speed: 2.6, direction: back, spread: 1.4, color: new THREE.Color('#d8c7a4'), size: 0.035, ttl: 0.9, gravity: 5, drag: 1.4, style: 'spark' });
    ctx.mist?.burst(to, 5, { speed: 0.8, color: new THREE.Color('#5d6b63'), size: 0.8, sizeEnd: 1.6, alpha: 0.28, ttl: 1.0, drag: 1.5, style: 'mist' });
    ctx.light?.(to, color, 8 + power * 6, 0.4, 8);
    ctx.screen?.shake(0.05 + power * 0.08);
  };

  return animate(group, duration, (_t, age, dt) => {
    const cam = ctx.cameraPosition;
    const headU = age < flight ? 1 - Math.pow(1 - age / flight, 1.18) : 1;
    streak.update(headU, clamp01(1 - Math.max(0, age - flight) / 0.7));
    if (age < flight) {
      const u = headU;
      pathPoint(u, head);
      pathPoint(Math.min(1, u + 0.02), ahead);
      tangent.subVectors(ahead, head);
      if (tangent.lengthSq() < 1e-8) tangent.copy(direction);
      tangent.normalize();
      root.position.copy(head);
      // Feathers set on a helix spin the arrow about its own axis as it flies.
      roll += dt * (16 + power * 10);
      root.quaternion.setFromUnitVectors(UP, tangent).multiply(spin.setFromAxisAngle(UP, roll));
      // Right under the eye the arrow would fill the frame; it reaches full size a few metres out.
      const near = cam ? THREE.MathUtils.clamp(head.distanceTo(cam) / 3.2, 0.35, 1) : 1;
      root.scale.setScalar(arrowScale * near);
      trail.push(head);
      sideA.set(tangent.y, -tangent.x, 0);
      if (sideA.lengthSq() < 1e-6) sideA.set(1, 0, 0);
      sideA.normalize();
      sideB.crossVectors(tangent, sideA);
      const a = roll * 0.9;
      const r = 0.045 * near;
      wind.copy(head).addScaledVector(sideA, Math.cos(a) * r).addScaledVector(sideB, Math.sin(a) * r);
      twinA.push(wind);
      wind.copy(head).addScaledVector(sideA, Math.cos(a + Math.PI) * r).addScaledVector(sideB, Math.sin(a + Math.PI) * r);
      twinB.push(wind);
      // A few motes shed from the fletching hang in the air behind it.
      if (Math.random() < 0.75) {
        wind.copy(head).addScaledVector(tangent, -0.8 * arrowScale * near);
        ctx.particles?.emit({
          x: wind.x, y: wind.y, z: wind.z,
          vx: (Math.random() - 0.5) * 0.3, vy: Math.random() * 0.25, vz: (Math.random() - 0.5) * 0.3,
          color: moteColor, size: 0.035 + power * 0.03, ttl: 0.35 + Math.random() * 0.3, drag: 2, style: 'glow',
        });
      }
    } else {
      root.position.copy(to);
      const since = age - flight;
      // When the world keeps a stuck arrow, it takes over at once; otherwise the head embeds for a
      // beat before the shot burns out.
      root.visible = !ctx.onStick && since < 0.07;
      halo.visible = root.visible;
    }
    const impactAge = (age - flight) / 0.45;
    impactFlare.visible = impactRing.visible = impactAge >= 0;
    if (impactAge >= 0) {
      impactFlare.scale.setScalar(0.25 + easeOutCubic(impactAge * 2.5) * (0.6 + power * 0.5));
      impactFlare.material.opacity = clamp01(1 - impactAge * 2) * 0.9;
      impactRing.scale.setScalar(0.2 + easeOutCubic(impactAge) * (1.6 + power * 1.2));
      impactRing.material.opacity = clamp01(1 - impactAge) * 0.7;
    }
    const fade = clamp01(1 - Math.max(0, age - flight) / 0.6);
    trail.opacity = fade;
    twinA.opacity = twinB.opacity = fade * 0.8;
    trail.update(dt, cam);
    twinA.update(dt, cam);
    twinB.update(dt, cam);
  }, flight, onImpact, () => { trail.dispose(); twinA.dispose(); twinB.dispose(); });
}

/**
 * A fine thread of light along the arrow's whole flight path, revealed behind the head and
 * lingering a moment after it lands. It rises from below the frame, is brightest just behind the
 * arrow and frays into flickering beads further back. Width tracks distance from the camera, so the
 * thread keeps a steady on-screen thickness even where the path runs into the screen.
 */
function arrowStreak(pathPoint: (u: number, out: THREE.Vector3) => THREE.Vector3, color: THREE.Color, camera: THREE.Vector3 | undefined, power: number) {
  const samples = 96;
  const positions = new Float32Array(samples * 2 * 3);
  const uv = new Float32Array(samples * 2 * 2);
  const index: number[] = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3(), tangent = new THREE.Vector3(), side = new THREE.Vector3(), view = new THREE.Vector3();
  const eye = camera ?? new THREE.Vector3(0, 1.8, 10);
  for (let i = 0; i < samples; i++) {
    const u = i / (samples - 1);
    pathPoint(u, p);
    pathPoint(Math.min(1, u + 0.01), q);
    tangent.subVectors(q, p);
    if (i === samples - 1) tangent.subVectors(p, pathPoint(0.99, q));
    view.subVectors(eye, p);
    side.crossVectors(tangent, view);
    if (side.lengthSq() < 1e-10) side.set(1, 0, 0);
    const half = Math.max(0.006, view.length() * 0.0026) * (0.8 + power * 0.4);
    side.normalize().multiplyScalar(half);
    positions.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
    uv.set([u, 0, u, 1], i * 4);
    if (i < samples - 1) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: color.clone() }, uHead: { value: 0 }, uFade: { value: 1 }, uLength: { value: 0.4 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uColor; uniform float uHead; uniform float uFade; uniform float uLength; uniform float uTime; varying vec2 vUv;
      void main(){
        if (vUv.x > uHead) discard;
        float across = abs(vUv.y * 2.0 - 1.0);
        float core = 1.0 - smoothstep(0.0, 0.45, across);
        float body = 1.0 - smoothstep(0.2, 1.0, across);
        float behind = clamp((uHead - vUv.x) / uLength, 0.0, 1.0);
        float near = pow(1.0 - behind, 2.2);
        // Further back the thread frays into drifting beads of light.
        float beads = smoothstep(0.55, 1.0, sin(vUv.x * 260.0 - uTime * 9.0) * 0.5 + 0.5) * (1.0 - near) * 0.45;
        float alpha = (near * (core + body * 0.35) + core * (0.06 + beads)) * uFade;
        vec3 c = mix(uColor * 1.3, vec3(1.15), core * near * 0.75);
        gl_FragColor = vec4(c, alpha);
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  return {
    mesh,
    update(head: number, fade: number) {
      material.uniforms.uHead.value = head;
      material.uniforms.uFade.value = fade;
      material.uniforms.uTime.value += 1 / 60;
    },
  };
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

  // The strike lights its surroundings: a pool around the impact and a wash along the bolt.
  const groundGlow = target.clone().setY(Math.max(target.y, ctx.groundY) + 1.6);
  const boltTop = ctx.lightningStart ? ctx.lightningStart.clone() : target.clone().add(new THREE.Vector3(0, 5.1, 0));
  const boltGlow = target.clone().lerp(boltTop, 0.4);
  const worldLight = color.clone().lerp(WHITE, 0.55);

  // Brightness envelope: leader, a dark beat, the return stroke, a re-strike, then the fade.
  const pattern: Array<[number, number, number]> = [[0.15, 0, 1], [0.2, 0, 0.18], [0.3, 1, 1], [0.35, 1, 0.3], [0.44, 2, 1], [0.95, 2, -1]];
  return animate(group, duration, (_t, age) => {
    let variant = 2, intensity = 0;
    for (const [until, v, level] of pattern) {
      if (age < until) { variant = v; intensity = level < 0 ? clamp01(1 - (age - 0.44) / 0.51) : level; break; }
    }
    variants.forEach((v, i) => { v.group.visible = i === variant && intensity > 0.01; });
    const leaderLight = age < impactAt ? 0.35 + 0.65 * (age / impactAt) : 1;
    ctx.illuminate?.(0, groundGlow, worldLight, intensity * leaderLight * 1.7, 15);
    ctx.illuminate?.(1, boltGlow, worldLight, intensity * leaderLight * 0.75, 22);
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
    vertexShader: `varying vec2 vUv; varying float vFacing;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; uniform float uTime; varying vec2 vUv; varying float vFacing;
      void main(){
        float fall = pow(1.0 - vUv.y, 1.6);
        float bands = 0.7 + 0.3 * sin(vUv.y * 22.0 - uTime * 9.0 + sin(vUv.x * 37.7) * 0.6);
        float edge = 0.55 + 0.45 * pow(abs(sin(vUv.x * 3.14159 * 6.0 + uTime)), 0.5);
        // A column of light, not a glass tube: it thins away where its surface turns from the eye.
        float soft = smoothstep(0.08, 0.7, vFacing);
        gl_FragColor = vec4(mix(uColor * 1.5, vec3(1.2), fall * 0.4), fall * bands * edge * soft * uOpacity * 0.55);
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

let glyphCache: THREE.Texture[] | null = null;

/** Six hand-inked runes (straight staves and branches, like old carved futhark), drawn once. */
function runeGlyphs(): THREE.Texture[] {
  if (glyphCache) return glyphCache;
  const shapes: Array<Array<[number, number, number, number]>> = [
    [[0.5, 0.1, 0.5, 0.9], [0.5, 0.25, 0.8, 0.45], [0.5, 0.45, 0.8, 0.65]],
    [[0.5, 0.1, 0.5, 0.9], [0.5, 0.45, 0.2, 0.15], [0.5, 0.45, 0.8, 0.15]],
    [[0.3, 0.1, 0.3, 0.9], [0.3, 0.1, 0.75, 0.35], [0.75, 0.35, 0.3, 0.55], [0.3, 0.55, 0.75, 0.9]],
    [[0.5, 0.1, 0.2, 0.5], [0.2, 0.5, 0.5, 0.9], [0.5, 0.9, 0.8, 0.5], [0.8, 0.5, 0.5, 0.1]],
    [[0.25, 0.1, 0.25, 0.9], [0.75, 0.1, 0.75, 0.9], [0.25, 0.3, 0.75, 0.7], [0.75, 0.3, 0.25, 0.7]],
    [[0.5, 0.1, 0.5, 0.9], [0.2, 0.3, 0.8, 0.3], [0.2, 0.3, 0.35, 0.1], [0.8, 0.3, 0.65, 0.1]],
  ];
  glyphCache = shapes.map((strokes) => {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    if (g) {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const [width, alpha] of [[22, 0.18], [12, 0.45], [5, 1]] as const) {
        g.strokeStyle = `rgba(255,255,255,${alpha})`;
        g.lineWidth = width;
        g.beginPath();
        for (const [x1, y1, x2, y2] of strokes) { g.moveTo(x1 * 128, y1 * 128); g.lineTo(x2 * 128, y2 * 128); }
        g.stroke();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData.shared = true;
    return texture;
  });
  return glyphCache;
}

/**
 * Aegis: an old-world ward. A golden magic circle of turning runes unfolds before the caster, a
 * soft veil of pearly light hangs behind it, and six carved runes orbit and pulse as it holds.
 */
function aegis(origin: THREE.Vector3, color: THREE.Color, ctx: SpellContext): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(origin);
  group.quaternion.copy(ctx.cameraQuaternion);
  const gold = new THREE.Color('#ffd98a');
  const ward = color.clone().lerp(gold, 0.45);
  const pale = color.clone().lerp(WHITE, 0.5);

  // The veil: a gently curved sheet of flowing, pearly light with a bright, soft rim. No grid.
  const geometry = new THREE.CircleGeometry(1.7, 64);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, (x * x + y * y) * 0.11); }
  const veilMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: pale.clone() }, uGold: { value: gold.clone() }, uTime: { value: 0 }, uReveal: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy / 1.7; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uColor; uniform vec3 uGold; uniform float uTime; uniform float uReveal; uniform float uOpacity; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){
        float r = length(vP);
        float reveal = 1.0 - smoothstep(uReveal - 0.15, uReveal, r);
        // Slow ribbons of light drifting upward through the veil, like aurora behind glass.
        vec2 q = vec2(vP.x * 2.2, vP.y * 1.4 - uTime * 0.25);
        float flow = n(q + vec2(n(q * 1.7 + uTime * 0.2) * 1.5, 0.0));
        float ribbons = smoothstep(0.45, 0.9, flow) * 0.55;
        float rim = smoothstep(0.78, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
        float body = 0.08 + ribbons * 0.35;
        vec3 c = mix(uColor, uGold, rim * 0.5 + ribbons * 0.25);
        gl_FragColor = vec4(c * 1.2, (body + rim * 0.75) * reveal * uOpacity);
      }`,
  });
  const veil = new THREE.Mesh(geometry, veilMat);
  veil.position.z = -0.05;
  veil.renderOrder = 5;
  group.add(veil);

  const circleMat = runeMaterial(ward, 5.3);
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), circleMat);
  circle.renderOrder = 6;
  group.add(circle);

  const glyphs = runeGlyphs().map((texture, i) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: gold, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sprite.scale.setScalar(0.42);
    sprite.renderOrder = 7;
    sprite.userData.phase = (i / 6) * Math.PI * 2;
    group.add(sprite);
    return sprite;
  });
  const bloom = glowSprite(gold, 3.4, undefined, 0);
  group.add(bloom);
  const mote = new THREE.Vector3();
  const onImpact = () => {
    ctx.particles?.burst(origin, 26, { speed: 2.2, color: gold, size: 0.08, sizeEnd: 0.01, ttl: 0.9, drag: 2.2, style: 'glow' });
    ctx.screen?.flash(ward, 0.18, 'edge');
    ctx.light?.(origin, ward, 8, 1.2, 10);
  };
  return animate(group, 2.2, (t, age, dt) => {
    const open = easeOutBack(age / 0.45);
    const fade = t > 0.72 ? clamp01((1 - t) / 0.28) : 1;
    circle.scale.setScalar(0.25 + open * 0.75);
    circle.rotation.z = age * 0.35;
    circleMat.uniforms.uTime.value = age;
    circleMat.uniforms.uReveal.value = clamp01(age / 0.4);
    circleMat.uniforms.uOpacity.value = fade * (0.9 + 0.1 * Math.sin(age * 5));
    veilMat.uniforms.uTime.value = age;
    veilMat.uniforms.uReveal.value = easeOutCubic(age / 0.5) * 1.15;
    veilMat.uniforms.uOpacity.value = fade;
    bloom.material.opacity = clamp01(1 - age / 0.5) * 0.45;
    glyphs.forEach((sprite, i) => {
      const a = sprite.userData.phase + age * 0.7;
      const radius = 1.15 * open;
      sprite.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0.05);
      const appear = clamp01((age - 0.2 - i * 0.06) / 0.25);
      sprite.material.opacity = appear * fade * (0.65 + 0.35 * Math.sin(age * 4 + i));
    });
    // Motes of warding light drift up from the circle's rim.
    if (t < 0.85 && Math.random() < dt * 35) {
      const a = Math.random() * Math.PI * 2;
      mote.set(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 0).applyQuaternion(ctx.cameraQuaternion).add(origin);
      ctx.particles?.emit({ x: mote.x, y: mote.y, z: mote.z, vx: 0, vy: 0.6 + Math.random() * 0.6, vz: 0, color: Math.random() < 0.5 ? gold : pale, size: 0.07, sizeEnd: 0.01, ttl: 1, drag: 0.5, style: 'glow', fadeIn: 0.15 });
    }
  }, 0.2, onImpact);
}
