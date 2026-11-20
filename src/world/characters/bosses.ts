import * as THREE from 'three';
import { ellipsoid, fbm3, lathe, tube, type Body, type V3 } from '../rig/Body.ts';
import type { Design } from '../rig/Character.ts';
import { biped, blink, bump, idleLife, lookAt, smooth, TAU, type Anim } from '../rig/Rig.ts';
import { flap, mothWing, pitchAbout, quadruped, serpent } from './creatures.ts';
import { Sculpt } from '../rig/Sculpt.ts';
import { BRAMBLE_GOBLIN } from './spirits.ts';

/**
 * THE ONES WHO RULE THE HUSHWOOD
 * ──────────────────────────────
 * Four sub-bosses and four final bosses. Each is built as one body on one skeleton, like every other
 * creature, and moves differently for each of its attacks so the caster can read what is coming:
 * a club raised overhead, a hoof pawing the ground, a bell lifted high, wings flared wide.
 * They grow larger and stranger toward the Throne.
 */

const Y = new THREE.Vector3(0, 1, 0);
/** Run the creature's ordinary motion without its own attack poses (bosses add their own). */
const calm = (a: Anim): Anim => ({ ...a, pose: a.pose === 'windup' || a.pose === 'strike' ? 'idle' : a.pose });

/* ═════════════════════════════ GORRIK THE BRAMBLECHIEF ═════════════════════════════ */

export const GORRIK: Design = {
  kind: 'gorrik', name: 'Gorrik', height: 3.1, radius: 0.95, turnRate: 3.2, stride: 1.8, pace: 1.6,
  eye: '#ffd27a', eyeAngry: '#ff3b1f', edge: '#ffb066', mist: 0.5,
  stiffness: { ...BRAMBLE_GOBLIN.stiffness, handR: 12, hips: 14 },
  castBone: 'handL', coreBone: 'chest',
  build(b: Body) {
    b.scale = 1.72;
    BRAMBLE_GOBLIN.build(b);
    // A crown of thorns, set with one stolen light.
    b.part(lathe([[0.165, 1.645], [0.172, 1.61], [0.165, 1.585]], { center: [0, 0, 0.31], segments: 20 }), { color: '#2e2117', surface: 'bark', bones: ['head'] });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU, x = Math.cos(a) * 0.17, z = 0.31 + Math.sin(a) * 0.17;
      b.part(tube([[x, 1.62, z], [x * 1.25, 1.74 + (i % 2) * 0.04, z + Math.sin(a) * 0.04]], [0.018, 0.002], { radial: 5 }), { color: '#2e2117', shade: '#8a7656', surface: 'bark', bones: ['head'] });
    }
    b.part(ellipsoid([0, 1.64, 0.485], [0.026, 0.026, 0.016]), { color: '#ffd27a', surface: 'glow', glow: 0.9, bones: ['head'] });
    // War paint under the eyes.
    for (const s of [1, -1]) b.part(tube([[0.05 * s, 1.5, 0.47], [0.11 * s, 1.47, 0.44]], [0.008], { radial: 4 }), { color: '#ff5a3a', surface: 'glow', glow: 0.55, bones: ['head'] });
    // A great bramble club in the right hand.
    b.part(tube([[-0.44, 0.66, 0.26], [-0.47, 0.42, 0.52], [-0.5, 0.22, 0.85], [-0.52, 0.12, 1.08]], [0.035, 0.055, 0.085, 0.1], { radial: 10, wobble: 0.22, seed: 4 }),
      { color: '#3b2b1e', shade: '#5c4532', surface: 'bark', bones: ['handR'] });
    for (let i = 0; i < 10; i++) {
      const u = 0.45 + (i / 9) * 0.5, a = i * 2.4;
      const c = new THREE.Vector3(-0.47 - u * 0.05, 0.42 - u * 0.3, 0.52 + u * 0.56);
      const o = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.6, 0.3).normalize().multiplyScalar(0.12);
      b.part(tube([[c.x, c.y, c.z], [c.x + o.x, c.y + o.y, c.z + o.z]], [0.02, 0.002], { radial: 5 }), { color: '#2a1e15', shade: '#b39c75', surface: 'bark', bones: ['handR'] });
    }
    // A cloak of matted fur over the back; skulls on the belt.
    b.part(lathe([[0.2, 1.36], [0.3, 1.28], [0.35, 1.0], [0.38, 0.72], [0.4, 0.55]], {
      segments: 26, center: [0, 0, 0.0],
      deform: (o, a, t) => { if (o.z > 0) o.multiplyScalar(0.62); if (t > 0.7) o.y += Math.sin(a * 9) * 0.04; o.multiplyScalar(1 + Math.sin(a * 13) * 0.04); },
    }), { color: '#3e342a', shade: '#1f1914', surface: 'fur', bones: ['chest', 'spine', 'hips'] });
    for (const x of [-0.16, 0.0, 0.16]) b.part(ellipsoid([x, 0.86, 0.29 - Math.abs(x) * 0.5], [0.04, 0.045, 0.035]), { color: '#d8cdb2', shade: '#8f7f62', surface: 'bone', bones: ['hips'] });
    b.scale = 1;
  },
  animate(a: Anim) {
    const r = a.rig;
    BRAMBLE_GOBLIN.animate(calm(a));
    r.rot('shoulderR', -0.25).rot('elbowR', -0.45);
    const p = a.progress, c = smooth(0, 0.7, p), hit = smooth(0, 0.35, p);
    if (a.pose === 'windup') {
      if (a.attack === 'club') { r.rot('shoulderR', -2.6 * c, 0, -0.2 * c).rot('elbowR', -0.9 * c).rot('shoulderL', -2.2 * c).rot('spine', -0.25 * c).rot('head', -0.2 * c); }
      else if (a.attack === 'stomp') { r.rot('thighR', -1.3 * c).rot('kneeR', 1.6 * c).rotPair('shoulder', -0.4 * c, 0, 1.0 * c).rot('spine', -0.2 * c).pos('hips', 0, 0.1 * c, 0); }
      else if (a.attack === 'rush') { r.rot('spine', 0.5 * c).rotPair('thigh', -0.6 * c).rotPair('knee', 0.9 * c).rot('shoulderR', -1.4 * c).pos('hips', 0, -0.25 * c, 0); }
      else { r.rotPair('shoulder', -1.2 * c, 0, 1.6 * c).rot('head', -0.55 * c).rot('jaw', 0.6 * c).rot('chest', -0.25 * c).scl('chest', 0.06 * c); }
    } else if (a.pose === 'strike') {
      if (a.attack === 'club') { r.rot('shoulderR', -2.6 + 2.5 * hit).rot('elbowR', -0.9 + 0.7 * hit).rot('shoulderL', -2.2 + 2.0 * hit).rot('spine', -0.25 + 0.85 * hit).pos('hips', 0, -0.25 * hit, 0.3 * hit); }
      else if (a.attack === 'stomp') { r.rot('thighR', -1.3 + 1.4 * hit).rot('kneeR', 1.6 - 1.3 * hit).rotPair('knee', 0.5 * hit).pos('hips', 0, -0.22 * hit, 0).rotPair('shoulder', 0, 0, 1.0 - 0.6 * hit); }
      else if (a.attack === 'rush') { r.rot('spine', 0.6).rot('shoulderR', -1.5).rot('head', -0.3); }
      else { r.rotPair('shoulder', -1.2, 0, 1.6).rot('head', -0.55 + Math.sin(a.t * 40) * 0.05).rot('jaw', 0.7); }
    }
  },
};

/* ═════════════════════════════════ THE FENWYRM ═════════════════════════════════ */

const TAIL = ['tail1', 'tail2', 'tail3', 'tail4', 'tail5'];

export const FENWYRM: Design = {
  kind: 'fenwyrm', name: 'The Fenwyrm', height: 2.6, radius: 1.0, turnRate: 1.8, stride: 3.2, pace: 1.6,
  eye: '#d8ff6a', eyeAngry: '#ff5a2a', edge: '#9fe8c0', mist: 0.45,
  stiffness: { head: 9, neck: 8, jaw: 16, tail4: 6, tail5: 5, frillL: 6, frillR: 6 },
  castBone: 'jaw', coreBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 0.42, 0])
      .bone('spine', 'hips', [0, 0.5, 1.1])
      .bone('chest', 'spine', [0, 0.92, 2.0])
      .bone('neck', 'chest', [0, 1.6, 2.55])
      .bone('head', 'neck', [0, 2.15, 2.85], [0, 2.15, 3.6])
      .bone('jaw', 'head', [0, 2.06, 2.95], [0, 1.98, 3.55])
      .bone('eyes', 'head', [0, 2.33, 3.3])
      .pairBone('frillL', 'head', [0.3, 2.25, 2.9], [0.7, 2.4, 2.6])
      .bone('tail1', 'hips', [0, 0.4, -1.1])
      .bone('tail2', 'tail1', [0, 0.36, -2.2])
      .bone('tail3', 'tail2', [0, 0.3, -3.2])
      .bone('tail4', 'tail3', [0, 0.24, -4.1])
      .bone('tail5', 'tail4', [0, 0.18, -4.9], [0, 0.12, -5.7]);
    const spine: V3[] = [[0, 2.12, 2.78], [0, 1.6, 2.55], [0, 0.92, 2.0], [0, 0.5, 1.1], [0, 0.42, 0], [0, 0.4, -1.1], [0, 0.36, -2.2], [0, 0.3, -3.2], [0, 0.24, -4.1], [0, 0.18, -4.9], [0, 0.12, -5.7]];
    b.part(tube(spine, [0.34, 0.38, 0.47, 0.5, 0.5, 0.46, 0.4, 0.32, 0.22, 0.12, 0.03], { radial: 16, segments: 90, flatten: { axis: [1, 0, 0], amount: 0.12 }, wobble: 0.05 }),
      { color: '#2f3d2c', shade: '#111710', surface: 'chitin', bones: ['head', 'neck', 'chest', 'spine', 'hips', ...TAIL], falloff: 3 });
    // A ridge of webbed fins down the back, glowing faintly at the tips.
    for (let i = 1; i < 26; i++) {
      const u = i / 26;
      const curve = new THREE.CatmullRomCurve3(spine.map((p) => new THREE.Vector3(...p)));
      const c = curve.getPointAt(u), t = curve.getTangentAt(u);
      const up = new THREE.Vector3().crossVectors(t, new THREE.Vector3(1, 0, 0)).normalize().multiplyScalar(-1);
      if (up.y < 0) up.negate();
      const r = [0.36, 0.42, 0.48, 0.5, 0.48, 0.42, 0.34, 0.26, 0.17, 0.08][Math.min(9, Math.floor(u * 10))];
      const h = 0.35 * (1 - u * 0.7);
      const base = c.clone().addScaledVector(up, r * 0.85);
      const tip = base.clone().addScaledVector(up, h).addScaledVector(t, -0.12);
      const bone = u < 0.12 ? 'neck' : u < 0.25 ? 'chest' : u < 0.37 ? 'spine' : u < 0.47 ? 'hips' : TAIL[Math.min(4, Math.floor((u - 0.47) / 0.106))];
      b.part(tube([[base.x, base.y, base.z], [tip.x, tip.y, tip.z]], [0.05, 0.004], { radial: 6, flatten: { axis: [1, 0, 0], amount: 0.75 } }),
        { color: '#223a33', shade: '#6fe0bf', surface: 'wing', bones: [bone] });
    }
    // The head: broad and flat, a heavy jaw, a fringe of barbels, frills at the cheeks.
    b.part(ellipsoid([0, 2.22, 3.05], [0.38, 0.27, 0.56], { deform: (d, p) => { if (d.y > 0) p.y *= 0.7; if (d.z > 0.3) p.x *= 1 - 0.3 * (d.z - 0.3); } }),
      { color: '#33432f', shade: '#151c13', surface: 'chitin', bones: ['head'] });
    b.part(ellipsoid([0, 2.04, 3.12], [0.32, 0.11, 0.46]), { color: '#3a4733', shade: '#1a2117', surface: 'chitin', bones: ['jaw'] });
    b.part(ellipsoid([0, 2.11, 3.18], [0.27, 0.05, 0.38]), { color: '#1c0d0a', surface: 'dark', bones: ['jaw', 'head'] });
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 2.2, x = Math.sin(a) * 0.26, z = 3.15 + Math.cos(a) * 0.38;
      b.part(tube([[x, 2.13, z], [x, 2.04, z + 0.01]], [0.016, 0.002], { radial: 4 }), { color: '#e4dcc4', surface: 'bone', bones: ['head'] });
    }
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.22 * s, 2.33, 3.3], [0.07, 0.05, 0.06]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
      b.part(ellipsoid([0.42 * s, 2.3, 2.78], [0.34, 0.03, 0.22], { deform: (d, p) => { p.applyAxisAngle(Y, -0.5 * s); p.y += Math.abs(d.x) * 0.1; } }),
        { color: '#2a4a3c', shade: '#7ff0c8', surface: 'wing', bones: [s > 0 ? 'frillL' : 'frillR'] });
      for (let k = 0; k < 3; k++) {
        b.part(tube([[0.12 * s + k * 0.03 * s, 2.02, 3.45 - k * 0.12], [0.16 * s + k * 0.05 * s, 1.75, 3.5 - k * 0.1], [0.14 * s + k * 0.05 * s, 1.5, 3.55 - k * 0.1]], [0.016, 0.01, 0.002], { radial: 4 }),
          { color: '#45563c', shade: '#1f281a', surface: 'hair', bones: ['jaw'] });
      }
    }
    // Weed and algae trailing from its flanks.
    for (const [z, x] of [[0.6, 0.45], [-0.6, -0.42], [-1.8, 0.36], [1.5, -0.42]] as const) {
      b.part(tube([[x, 0.6, z], [x * 1.2, 0.25, z - 0.2], [x * 1.25, 0.05, z - 0.45]], [0.04, 0.02, 0.003], { radial: 5, wobble: 0.3 }),
        { color: '#4b5a33', shade: '#232b18', surface: 'hair', bones: [z > 0.3 ? 'spine' : z > -0.5 ? 'hips' : 'tail1'] });
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    // S-curves run down the body: it always moves a little side to side, even when it holds still.
    serpent(a, ['spine', 'hips', ...TAIL], 0.26, 0.85);
    r.rot('chest', 0, -Math.sin(a.phase * TAU + 0.8) * 0.15 * a.life);
    r.rot('neck', 0, Math.sin(a.t * 0.7 + a.seed * 3) * 0.2 * a.life, Math.sin(a.t * 0.5) * 0.06);
    lookAt(a, 0.9, 0.7);
    blink(a, 6);
    r.rotPair('frill', Math.sin(a.t * 1.3) * 0.15, 0, Math.sin(a.t * 0.9) * 0.1);
    r.rot('jaw', 0.05 + Math.max(0, Math.sin(a.t * 0.8)) * 0.05);
    const p = a.progress, c = smooth(0, 0.7, p), hit = smooth(0, 0.3, p);
    if (a.pose === 'windup') {
      if (a.attack === 'lash') { r.rot('neck', 0.2 * c).rot('head', 0.3 * c); for (const [i, t] of TAIL.entries()) r.rot(t, 0, 0.35 * c * (i + 1) * 0.4); }
      else if (a.attack === 'brood') { r.rot('chest', -0.35 * c).rot('neck', -0.25 * c).rot('jaw', 0.6 * c).rotPair('frill', -0.4 * c, 0, 0.5 * c); }
      else { r.rot('neck', 0.35 * c).rot('head', -0.25 * c).rot('jaw', 0.55 * c).rotPair('frill', -0.3 * c, 0, 0.4 * c); }
    } else if (a.pose === 'strike') {
      if (a.attack === 'lash') { for (const [i, t] of TAIL.entries()) r.rot(t, 0, (0.35 - 0.9 * hit) * (i + 1) * 0.4); r.rot('chest', 0, 0.3 * hit); }
      else { r.rot('neck', 0.35 - 0.8 * hit).rot('head', -0.25 + 0.4 * hit).rot('jaw', 0.75).rotPair('frill', -0.4, 0, 0.5); }
    } else if (a.pose === 'stagger') r.rot('neck', 0.4 * bump(0, 1, p)).rot('head', -0.3 * bump(0, 1, p));
  },
};

/* ═════════════════════════════════ THE HOLLOW STAG ═════════════════════════════════ */

const BONE = '#d8ceb6', BONE_DARK = '#7d6f58', COLDFIRE = '#8fdcff';

export const HOLLOW_STAG: Design = {
  kind: 'stag', name: 'The Hollow Stag', height: 4.0, radius: 1.1, turnRate: 2.6, stride: 3.4, pace: 1.6,
  eye: '#a8e8ff', eyeAngry: '#ffffff', edge: '#9fe8ff', mist: 0.6,
  stiffness: { antlerL: 12, antlerR: 12, hide: 5, tail: 6 },
  castBone: 'head', coreBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 1.95, -0.9])
      .bone('spine', 'hips', [0, 2.05, 0])
      .bone('chest', 'spine', [0, 2.08, 0.8])
      .bone('neck', 'chest', [0, 2.6, 1.22])
      .bone('head', 'neck', [0, 3.02, 1.46], [0, 2.95, 2.0])
      .bone('jaw', 'head', [0, 2.92, 1.6], [0, 2.82, 2.0])
      .bone('eyes', 'head', [0, 3.08, 1.72])
      .bone('hide', 'hips', [0, 2.15, -0.55], [0, 1.4, -0.6])
      .bone('tail', 'hips', [0, 2.0, -1.3], [0, 1.7, -1.45])
      .pairBone('antlerL', 'head', [0.12, 3.18, 1.42])
      .pairBone('antler2L', 'antlerL', [0.6, 3.75, 1.1], [1.1, 4.1, 0.85])
      .pairBone('fthighL', 'chest', [0.32, 1.95, 0.9])
      .pairBone('fkneeL', 'fthighL', [0.34, 1.05, 0.96])
      .pairBone('fankleL', 'fkneeL', [0.34, 0.22, 0.9], [0.34, 0.02, 0.96])
      .pairBone('hthighL', 'hips', [0.32, 1.95, -0.9])
      .pairBone('hkneeL', 'hthighL', [0.34, 1.1, -1.12])
      .pairBone('hankleL', 'hkneeL', [0.34, 0.28, -0.92], [0.34, 0.02, -0.88]);
    const bone = { color: BONE, shade: BONE_DARK, surface: 'bone' as const, relief: 0.004, reliefFreq: 14 };
    const s = new Sculpt();
    // The skull: a long cranium, a muzzle that narrows to the nose, a ridge of nasal bone down its top,
    // cheek arches, deep orbits and the nasal opening carved out.
    s.blob([0, 3.06, 1.5], [0.13, 0.125, 0.17], { ...bone, bones: ['head'], blend: 0 });
    s.cone([0, 3.02, 1.6], [0, 2.9, 1.99], 0.105, 0.042, { ...bone, bones: ['head'], blend: 0.05 });
    s.cone([0, 3.11, 1.58], [0, 2.95, 1.96], 0.04, 0.02, { ...bone, bones: ['head'], blend: 0.03 });
    for (const x of [1, -1]) {
      s.cone([x * 0.11, 3.0, 1.66], [x * 0.115, 3.02, 1.42], 0.022, 0.018, { ...bone, bones: ['head'], blend: 0.025 });
      s.blob([x * 0.1, 3.1, 1.6], [0.05, 0.035, 0.05], { ...bone, bones: ['head'], blend: 0.03 });
      s.cone([x * 0.1, 3.14, 1.47], [x * 0.12, 3.2, 1.44], 0.035, 0.03, { ...bone, bones: ['head'], blend: 0.02 });
    }
    for (const x of [1, -1]) s.carveBlob([x * 0.098, 3.075, 1.635], [0.05, 0.042, 0.048], 0.015);
    s.carveCone([0, 2.92, 1.97], [0, 2.93, 1.9], 0.03, 0.02, 0.01);
    s.cone([0, 2.95, 1.36], [0, 2.86, 1.32], 0.05, 0.04, { ...bone, bones: ['head', 'neck'], blend: 0.02 });
    // The mandible, hinged at the back of the skull.
    for (const x of [1, -1]) {
      s.cone([x * 0.075, 3.0, 1.5], [x * 0.065, 2.86, 1.56], 0.022, 0.026, { ...bone, bones: ['jaw'], blend: 0.015 });
      s.cone([x * 0.065, 2.86, 1.56], [x * 0.028, 2.83, 1.94], 0.026, 0.016, { ...bone, bones: ['jaw'], blend: 0.015 });
    }
    // A curved neck of seven vertebrae, each with its spine; the back's vertebrae carry tall
    // spines at the withers that shorten toward the hips.
    const neck: V3[] = [[0, 2.28, 0.98], [0, 2.42, 1.08], [0, 2.56, 1.16], [0, 2.7, 1.22], [0, 2.82, 1.27], [0, 2.92, 1.31], [0, 2.98, 1.36]];
    // A ligament runs through the neck so the vertebrae read as one column.
    s.chain([[0, 2.24, 0.94], ...neck, [0, 3.02, 1.42]], [0.04, 0.042, 0.04, 0.038, 0.036, 0.036, 0.036, 0.038, 0.04], { ...bone, bones: ['neck', 'chest', 'head'], blend: 0.03 });
    neck.forEach((p, i) => {
      s.blob(p, [0.075, 0.06, 0.06], { ...bone, bones: ['neck', i < 2 ? 'chest' : 'head'], blend: 0.03 });
      s.cone(p, [p[0], p[1] + 0.07, p[2] - 0.05], 0.03, 0.012, { ...bone, bones: ['neck'], blend: 0.015 });
      for (const x of [1, -1]) s.cone(p, [x * 0.09, p[1] - 0.01, p[2] + 0.01], 0.022, 0.012, { ...bone, bones: ['neck'], blend: 0.012 });
    });
    for (let i = 0; i < 13; i++) {
      const t = i / 12, z = 0.92 - t * 1.9, y = 2.24 - t * 0.08 + Math.sin(t * Math.PI) * 0.04;
      s.blob([0, y, z], [0.06, 0.055, 0.07], { ...bone, bones: [t < 0.4 ? 'chest' : t < 0.8 ? 'spine' : 'hips'], blend: 0.03 });
      const tall = 0.36 * (1 - t) + 0.08;
      s.cone([0, y, z], [0, y + tall, z - 0.06], 0.026, 0.01, { ...bone, bones: [t < 0.4 ? 'chest' : t < 0.8 ? 'spine' : 'hips'], blend: 0.012 });
    }
    // Shoulder blades: flat plates over the front of the ribs.
    for (const x of [1, -1]) s.box([x * 0.3, 2.02, 0.86], [0.02, 0.24, 0.12], 0.015, { ...bone, bones: ['chest', x > 0 ? 'fthighL' : 'fthighR'], blend: 0.02 }, [0.25, 0, x * -0.18]);
    // The pelvis: wings of the ilium, the sacrum between them, the ischium behind.
    s.blob([0, 2.12, -0.95], [0.08, 0.05, 0.22], { ...bone, bones: ['hips'], blend: 0.04 });
    for (const x of [1, -1]) {
      s.box([x * 0.2, 2.06, -0.78], [0.1, 0.03, 0.12], 0.025, { ...bone, bones: ['hips'], blend: 0.04 }, [0.2, x * 0.3, x * 0.4]);
      s.cone([x * 0.2, 2.02, -0.85], [x * 0.17, 1.92, -1.22], 0.045, 0.035, { ...bone, bones: ['hips'], blend: 0.04 });
    }
    // Legs: long bones with knobbed joints, a deer's long cannon bones, the hind hock bending back,
    // fetlock, pastern and a split hoof.
    for (const x of [1, -1]) {
      const S = x > 0 ? 'L' : 'R';
      const f = (a: string) => `${a}${S}`;
      s.cone([x * 0.32, 1.86, 0.92], [x * 0.33, 1.42, 0.78], 0.06, 0.045, { ...bone, bones: [f('fthigh'), 'chest'], blend: 0.03 });
      s.blob([x * 0.33, 1.42, 0.78], [0.05, 0.055, 0.06], { ...bone, bones: [f('fthigh')], blend: 0.03 });
      s.cone([x * 0.33, 1.42, 0.8], [x * 0.34, 1.07, 0.95], 0.04, 0.034, { ...bone, bones: [f('fthigh'), f('fknee')], blend: 0.03 });
      s.blob([x * 0.34, 1.05, 0.96], [0.045, 0.05, 0.042], { ...bone, bones: [f('fknee')], blend: 0.025 });
      s.cone([x * 0.34, 1.02, 0.95], [x * 0.34, 0.27, 0.9], 0.027, 0.024, { ...bone, bones: [f('fknee'), f('fankle')], blend: 0.025 });
      s.blob([x * 0.34, 0.24, 0.9], [0.035, 0.038, 0.035], { ...bone, bones: [f('fankle')], blend: 0.02 });
      s.cone([x * 0.34, 0.22, 0.9], [x * 0.34, 0.1, 0.95], 0.025, 0.022, { ...bone, bones: [f('fankle')], blend: 0.015 });
      s.cone([x * 0.32, 1.95, -0.9], [x * 0.36, 1.44, -0.72], 0.07, 0.048, { ...bone, bones: [f('hthigh'), 'hips'], blend: 0.035 });
      s.blob([x * 0.36, 1.43, -0.72], [0.05, 0.055, 0.05], { ...bone, bones: [f('hthigh')], blend: 0.03 });
      s.cone([x * 0.36, 1.43, -0.73], [x * 0.34, 1.1, -1.1], 0.042, 0.032, { ...bone, bones: [f('hthigh'), f('hknee')], blend: 0.03 });
      s.cone([x * 0.34, 1.12, -1.11], [x * 0.34, 1.16, -1.22], 0.03, 0.02, { ...bone, bones: [f('hknee')], blend: 0.02 });
      s.blob([x * 0.34, 1.09, -1.11], [0.045, 0.05, 0.05], { ...bone, bones: [f('hknee')], blend: 0.025 });
      s.cone([x * 0.34, 1.06, -1.1], [x * 0.34, 0.31, -0.93], 0.027, 0.024, { ...bone, bones: [f('hknee'), f('hankle')], blend: 0.025 });
      s.blob([x * 0.34, 0.29, -0.92], [0.035, 0.038, 0.035], { ...bone, bones: [f('hankle')], blend: 0.02 });
      s.cone([x * 0.34, 0.27, -0.92], [x * 0.34, 0.12, -0.87], 0.025, 0.022, { ...bone, bones: [f('hankle')], blend: 0.015 });
    }
    // Antlers: a main beam that sweeps up, out and back, a brow tine forward over the face, bez and
    // trez tines rising from the beam, and a crown of tines at the top.
    const ant = { color: '#3a3128', shade: '#7c6b56', surface: 'bark' as const, relief: 0.012, reliefFreq: 16, stretch: 0.5 };
    for (const x of [1, -1]) {
      const A = x > 0 ? 'antlerL' : 'antlerR', A2 = x > 0 ? 'antler2L' : 'antler2R';
      const beam: V3[] = [[x * 0.11, 3.18, 1.45], [x * 0.3, 3.45, 1.32], [x * 0.52, 3.72, 1.14], [x * 0.78, 3.96, 0.96], [x * 1.0, 4.12, 0.86], [x * 1.12, 4.2, 0.84]];
      s.chain(beam, [0.06, 0.05, 0.042, 0.034, 0.026, 0.012], { ...ant, bones: [A, A2], blend: 0.025 });
      s.blob([x * 0.12, 3.19, 1.45], [0.07, 0.04, 0.07], { ...ant, bones: [A, 'head'], blend: 0.02 });
      s.chain([[x * 0.2, 3.3, 1.4], [x * 0.28, 3.38, 1.6], [x * 0.3, 3.48, 1.8]], [0.032, 0.022, 0.006], { ...ant, bones: [A], blend: 0.02 });
      s.chain([[x * 0.33, 3.48, 1.3], [x * 0.38, 3.7, 1.46], [x * 0.4, 3.9, 1.56]], [0.03, 0.02, 0.005], { ...ant, bones: [A, A2], blend: 0.018 });
      s.chain([[x * 0.55, 3.75, 1.12], [x * 0.56, 4.02, 1.24], [x * 0.58, 4.25, 1.3]], [0.028, 0.018, 0.005], { ...ant, bones: [A2], blend: 0.016 });
      s.chain([[x * 0.8, 3.98, 0.95], [x * 0.84, 4.25, 1.0], [x * 0.86, 4.46, 1.04]], [0.024, 0.016, 0.004], { ...ant, bones: [A2], blend: 0.014 });
      s.chain([[x * 1.0, 4.12, 0.86], [x * 1.16, 4.36, 0.92], [x * 1.25, 4.5, 0.96]], [0.02, 0.013, 0.004], { ...ant, bones: [A2], blend: 0.012 });
    }
    b.sculpted(s, 0.022);
    // The ribs (thin, separate bones) and the sternum they meet.
    for (let i = 0; i < 9; i++) {
      const z = 0.86 - i * 0.17, depth = 0.6 - Math.abs(i - 3) * 0.05, w = 0.44 - Math.abs(i - 3) * 0.025;
      for (const x of [1, -1]) {
        b.part(tube([[x * 0.05, 2.2, z], [x * w, 2.04, z + 0.03], [x * (w + 0.02), 1.78, z + 0.05], [x * w * 0.8, 2.2 - depth, z + 0.07], [x * 0.08, 2.2 - depth - 0.08, z + 0.09]], [0.028, 0.032, 0.028, 0.022, 0.016], { radial: 7, segments: 24 }),
          { color: BONE, shade: BONE_DARK, surface: 'bone', bones: [i < 4 ? 'chest' : 'spine'], relief: 0.4 });
      }
    }
    b.part(tube([[0, 1.42, 0.98], [0, 1.4, 0.6], [0, 1.48, 0.15]], [0.04, 0.035, 0.025], { radial: 8 }), { color: BONE, shade: BONE_DARK, surface: 'bone', bones: ['chest', 'spine'] });
    // A cold heart burning inside the cage, and teeth.
    b.part(ellipsoid([0, 1.88, 0.5], [0.1, 0.12, 0.1]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes', 'chest'] });
    for (const x of [1, -1]) b.part(ellipsoid([x * 0.098, 3.07, 1.66], [0.026, 0.026, 0.014]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
    for (let i = 0; i < 6; i++) for (const x of [1, -1]) b.part(tube([[x * (0.04 - i * 0.002), 2.9, 1.66 + i * 0.045], [x * (0.04 - i * 0.002), 2.86, 1.665 + i * 0.045]], [0.012, 0.004], { radial: 5 }), { color: '#e8dfc8', surface: 'bone', bones: ['jaw'] });
    // Tattered hide draped over the spine and haunches: a torn sheet, ragged at the hem, the bones
    // showing through its holes.
    {
      const cols = 26, rows = 30, pos: number[] = [], idx: number[] = [];
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const u = j / rows, v = i / cols, z = -1.32 + u * 1.25;
        const a = (v - 0.5) * Math.PI * 1.25;
        const r = 0.36 + Math.sin(u * Math.PI) * 0.1;
        const torn = Math.max(0, Math.abs(a) - 0.95) * (0.9 + 0.7 * fbm3(u * 6, v * 9, 1.7));
        pos.push(Math.sin(a) * r * (1 + torn * 0.2), 2.16 + Math.cos(a) * r - torn * 0.9 - (Math.abs(a) > 1 ? 0.1 : 0), z);
        if (i < cols && j < rows) {
          const k = j * (cols + 1) + i;
          if (fbm3(u * 7 + 3, v * 7, 2) > 0.62) continue;
          idx.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
        }
      }
      const sheet = new THREE.BufferGeometry();
      sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      sheet.setIndex(idx);
      sheet.computeVertexNormals();
      b.part(sheet, { color: '#4f4237', shade: '#221b15', surface: 'fur', bones: ['hips', 'hide', 'spine'], relief: 0.6 });
    }
    b.part(tube([[0, 2.02, -1.28], [0, 1.88, -1.4], [0, 1.7, -1.46]], [0.04, 0.03, 0.008], { radial: 6 }), { color: BONE, surface: 'bone', bones: ['tail'] });
    // Cold fire licking the antler tips, and split hooves.
    for (const x of [1, -1]) {
      const A2 = x > 0 ? 'antler2L' : 'antler2R', A = x > 0 ? 'antlerL' : 'antlerR';
      for (const [tip, bn] of [[[x * 0.3, 3.48, 1.8], A], [[x * 0.4, 3.9, 1.56], A], [[x * 0.58, 4.25, 1.3], A2], [[x * 0.86, 4.46, 1.04], A2], [[x * 1.25, 4.5, 0.96], A2]] as Array<[V3, string]>) {
        b.part(tube([[tip[0], tip[1] - 0.04, tip[2]], [tip[0] + 0.02, tip[1] + 0.16, tip[2]], [tip[0] - 0.02, tip[1] + 0.32, tip[2] + 0.02]], [0.045, 0.028, 0.002], { radial: 6, flatten: { axis: [0, 0, 1], amount: 0.6 } }),
          { color: COLDFIRE, surface: 'glow', glow: 0.85, bones: [bn] });
      }
      for (const [z, leg] of [[0.96, 'fankle'], [-0.86, 'hankle']] as const) {
        for (const dx of [-0.028, 0.028]) b.part(ellipsoid([x * 0.34 + dx, 0.05, z + 0.03], [0.026, 0.05, 0.055], { deform: (d, p) => { if (d.z > 0.3) p.y -= (d.z - 0.3) * 0.02; } }), { color: '#141112', surface: 'chitin', bones: [`${leg}${x > 0 ? 'L' : 'R'}`] });
      }
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    const charging = a.pose === 'strike' && a.attack === 'charge';
    quadruped(a, { stride: charging ? 0.8 : 0.42, knee: 0.9, bob: 0.07, gallop: charging ? 1 : 0 });
    idleLife(a, 0.6);
    lookAt(a, 0.7, 0.6);
    blink(a, 99);
    r.rot('neck', 0.1 + Math.sin(a.t * 0.4 + a.seed) * 0.06 * a.life).rot('hide', -a.swayF * 0.6 + Math.sin(a.t * 1.1) * 0.05, 0, a.swayS * 0.6);
    r.rot('tail', Math.sin(a.t * 1.7) * 0.15);
    const p = a.progress, c = smooth(0, 0.7, p), hit = smooth(0, 0.3, p);
    if (a.pose === 'windup') {
      if (a.attack === 'charge') { r.rot('spine', -0.3 * c).rot('chest', -0.25 * c).rotPair('fthigh', -0.9 * c).rotPair('fknee', -1.1 * c).pos('hips', 0, -0.2 * c, 0).rot('neck', -0.3 * c).rot('head', 0.2 * c); }
      else if (a.attack === 'antlers') { r.rot('neck', 0.35 * c, 0.6 * c).rot('head', 0.35 * c); }
      else if (a.attack === 'coldfire') { r.rot('neck', -0.4 * c).rot('head', -0.35 * c).rot('jaw', 0.3 * c); }
      else { r.rot('spine', -0.35 * c).rotPair('fthigh', -1.1 * c).rotPair('fknee', -1.3 * c).pos('hips', 0, -0.25 * c, 0); }
    } else if (a.pose === 'strike') {
      if (charging) r.rot('neck', 0.5).rot('head', 0.45);
      else if (a.attack === 'antlers') r.rot('neck', 0.35, 0.6 - 1.6 * hit).rot('head', 0.35, -0.3 * hit);
      else if (a.attack === 'bell') r.rot('spine', -0.35 + 0.5 * hit).rotPair('fthigh', -1.1 + 1.2 * hit).rotPair('fknee', -1.3 + 1.3 * hit).pos('hips', 0, -0.25 + 0.15 * hit, 0);
      else r.rot('neck', -0.4).rot('head', -0.35).rot('jaw', 0.4);
    } else if (a.pose === 'stagger') r.rot('neck', -0.3 * bump(0, 1, p)).pos('hips', 0, 0, -0.3 * bump(0, 1, p));
  },
};

/* ═════════════════════════════════ THE PALE HERALD ═════════════════════════════════ */

const PALE = '#cfc9bd', PALE_DARK = '#5e5a53';

export const PALE_HERALD: Design = {
  kind: 'herald', name: 'The Pale Herald', height: 4.3, radius: 0.7, turnRate: 2.2, stride: 3, pace: 0.8,
  eye: '#e8f4ff', eyeAngry: '#9fd0ff', edge: '#e8f0ff', mist: 0.3,
  cloth: [0.12, 2.6, 0.0, 0.35],
  stiffness: { bell: 3.5, staff: 10, tail1: 6, tail2: 4, head: 8 },
  castBone: 'handL', coreBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 2.0, 0])
      .bone('spine', 'hips', [0, 2.6, 0])
      .bone('chest', 'spine', [0, 3.2, 0.03])
      .bone('neck', 'chest', [0, 3.55, 0.05])
      .bone('head', 'neck', [0, 3.78, 0.08], [0, 4.0, 0.12])
      .bone('eyes', 'head', [0, 3.82, 0.24])
      .bone('tail1', 'hips', [0, 1.1, -0.05])
      .bone('tail2', 'tail1', [0, 0.4, -0.12], [0, 0.0, -0.2])
      .pairBone('shoulderL', 'chest', [0.32, 3.3, 0.02])
      .pairBone('elbowL', 'shoulderL', [0.5, 2.75, 0.12])
      .pairBone('wristL', 'elbowL', [0.55, 2.25, 0.3])
      .pairBone('handL', 'wristL', [0.56, 2.12, 0.33], [0.57, 1.96, 0.36])
      .bone('staff', 'handR', [-0.56, 2.2, 0.36], [-0.58, 4.6, 0.42])
      .bone('bell', 'staff', [-0.58, 4.55, 0.55], [-0.58, 4.1, 0.6]);
    // Robes the colour of bleached bone, falling to ribbons.
    b.part(lathe([[0.15, 3.62], [0.3, 3.48], [0.36, 3.2], [0.36, 2.8], [0.42, 2.2], [0.52, 1.5], [0.62, 0.8], [0.72, 0.2], [0.74, 0.08]], {
      segments: 32, scaleZ: 0.85,
      deform: (o, a, t) => { o.multiplyScalar(1 + Math.sin(a * 10 + t * 2) * 0.035); if (t > 0.75) o.y -= Math.max(0, Math.sin(a * 7)) ** 3 * 0.25 * (t - 0.75) / 0.25; },
    }), { color: PALE, shade: PALE_DARK, surface: 'cloth', bones: ['chest', 'spine', 'hips', 'tail1', 'tail2'], falloff: 3 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.3, x = Math.cos(a) * 0.32, z = Math.sin(a) * 0.28;
      b.part(tube([[x, 3.4, z], [x * 1.3, 2.6, z * 1.3], [x * 1.5, 1.7 + (i % 3) * 0.2, z * 1.5]], [0.03, 0.025, 0.004], { radial: 5, flatten: { axis: [x, 0, z], amount: 0.8 } }),
        { color: '#e2ddd2', shade: '#8f8a80', surface: 'cloth', bones: ['chest', 'spine', 'hips'] });
    }
    // A tall bell-shaped hood ringed with little bells; under it, a blank porcelain mask.
    b.part(lathe([[0.02, 4.55], [0.08, 4.4], [0.14, 4.15], [0.22, 3.95], [0.27, 3.78], [0.24, 3.62]], { segments: 24, closeTop: true, center: [0, 0, 0.04] }),
      { color: '#bdb6a8', shade: PALE_DARK, surface: 'cloth', bones: ['head'] });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, x = Math.cos(a) * 0.27, z = 0.04 + Math.sin(a) * 0.27;
      b.part(lathe([[0.004, 3.78], [0.02, 3.76], [0.03, 3.72], [0.033, 3.7]], { center: [x, 0, z], segments: 8, closeTop: true }), { color: '#9a8a5c', surface: 'metal', bones: ['head'] });
    }
    b.part(ellipsoid([0, 3.8, 0.13], [0.15, 0.2, 0.12], { deform: (d, p) => { if (d.z < 0) p.z *= 0.4; if (d.y < -0.5) p.x *= 0.8; } }),
      { color: '#f3efe6', shade: '#b9b2a4', surface: 'bone', bones: ['head'] });
    for (const s of [1, -1]) {
      b.part(tube([[0.03 * s, 3.85, 0.245], [0.1 * s, 3.84, 0.23]], [0.008], { radial: 4 }), { color: '#08080a', surface: 'dark', bones: ['head'] });
      b.part(ellipsoid([0.065 * s, 3.848, 0.245], [0.008, 0.006, 0.004]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
    }
    b.part(tube([[0, 3.7, 0.245], [0, 3.62, 0.2]], [0.004], { radial: 4 }), { color: '#6a655c', surface: 'dark', bones: ['head'] });
    // Long thin arms in long sleeves; grey hands.
    b.pair(tube([[0.3, 3.34, 0.02], [0.5, 2.75, 0.12], [0.55, 2.28, 0.3]], [0.1, 0.09, 0.12], { radial: 10, capEnd: false }),
      { color: PALE, shade: '#7a756c', surface: 'cloth', bones: ['shoulderL', 'elbowL', 'wristL', 'chest'] });
    b.pair(ellipsoid([0.56, 2.14, 0.33], [0.04, 0.06, 0.03]), { color: '#9d978b', surface: 'bone', bones: ['handL'] });
    for (const dx of [-0.025, 0, 0.025]) b.pair(tube([[0.56 + dx, 2.1, 0.35], [0.56 + dx * 1.4, 1.96, 0.4], [0.56 + dx * 1.6, 1.86, 0.42]], [0.011, 0.008, 0.002], { radial: 5 }), { color: '#a8a295', surface: 'bone', bones: ['handL'] });
    // The staff and its great bell.
    b.part(tube([[-0.56, 1.2, 0.34], [-0.57, 3.0, 0.38], [-0.58, 4.62, 0.42]], [0.03, 0.028, 0.025], { radial: 7, wobble: 0.1 }), { color: '#3b3229', surface: 'bark', bones: ['staff'] });
    b.part(tube([[-0.58, 4.62, 0.42], [-0.58, 4.66, 0.5], [-0.58, 4.58, 0.56]], [0.022, 0.02, 0.015], { radial: 6 }), { color: '#3b3229', surface: 'bark', bones: ['staff'] });
    b.part(lathe([[0.02, 4.56], [0.09, 4.52], [0.13, 4.4], [0.16, 4.22], [0.21, 4.12], [0.215, 4.1]], { center: [-0.58, 0, 0.58], segments: 22, closeTop: true }),
      { color: '#8f7d50', shade: '#4a3e24', surface: 'metal', bones: ['bell'] });
    b.part(ellipsoid([-0.58, 4.12, 0.58], [0.15, 0.02, 0.15]), { color: '#0b0a08', surface: 'dark', bones: ['bell'] });
    b.part(ellipsoid([-0.58, 4.08, 0.58], [0.035, 0.05, 0.035]), { color: '#d8e8ff', surface: 'glow', glow: 0.6, bones: ['bell'] });
  },
  animate(a: Anim) {
    const r = a.rig;
    r.pos('hips', 0, 0.15 + Math.sin(a.t * 0.9 + a.seed * 4) * 0.06 * a.life, 0);
    r.rot('spine', 0.1 * a.fwd * a.move, 0, -0.15 * a.side * a.move - a.turn * 0.04);
    r.rot('tail1', 0.25 * a.fwd * a.move - a.swayF * 0.4, 0, 0.3 * a.side * a.move + a.swayS * 0.4).rot('tail2', 0.25 * a.fwd * a.move - a.swayF * 0.5, 0, 0.3 * a.side * a.move + a.swayS * 0.5);
    idleLife(a, 0.6);
    lookAt(a, 1, 0.7);
    blink(a, 99);
    // It tilts its blank face, slowly, as if listening.
    r.rot('head', 0, 0, Math.sin(a.t * 0.3 + a.seed * 3) * 0.25 * a.life);
    r.rot('shoulderR', -0.35).rot('elbowR', -0.5).rot('staff', 0.08);
    r.rot('bell', -a.swayF * 1.4 + Math.sin(a.t * 1.2) * 0.06, 0, a.swayS * 1.4);
    const p = a.progress, c = smooth(0, 0.7, p), hit = smooth(0, 0.3, p);
    if (a.pose === 'windup') {
      if (a.attack === 'toll') { r.rot('shoulderR', -1.9 * c).rot('elbowR', -0.3 * c).rot('spine', -0.15 * c).rot('head', -0.3 * c).rot('bell', 0.9 * c); }
      else if (a.attack === 'palefire') { r.rot('shoulderL', -1.5 * c, 0, 0.2 * c).rot('elbowL', -0.2 * c).rot('handL', -0.9 * c); }
      else if (a.attack === 'step') { r.rot('spine', 0.5 * c).rot('head', 0.4 * c).rotPair('shoulder', 0.2 * c, 0, -0.2 * c); }
      else { r.rotPair('shoulder', -1.0 * c, 0, 1.3 * c).rot('head', -0.4 * c); }
    } else if (a.pose === 'strike') {
      if (a.attack === 'toll') r.rot('shoulderR', -1.9 + 1.7 * hit).rot('spine', -0.15 + 0.4 * hit).rot('bell', 0.9 - 2.4 * hit);
      else if (a.attack === 'palefire') r.rot('shoulderL', -1.6, 0, 0.2).rot('handL', -0.9 + 0.5 * hit);
      else if (a.attack !== 'step') r.rotPair('shoulder', -1.0, 0, 1.3);
    }
  },
};

/* ═════════════════════════════════ THE MOTH MATRON ═════════════════════════════════ */

export const MOTH_MATRON: Design = {
  kind: 'matron', name: 'The Moth Matron', height: 5.2, radius: 1.3, turnRate: 1.8, stride: 3, pace: 0.9,
  eye: '#d4b0ff', eyeAngry: '#ff7ae0', edge: '#e2c8ff', mist: 0,
  cloth: [0.14, 2.2, 0.0, 0.3],
  stiffness: { wingL: 9, wingR: 9, hwingL: 7, hwingR: 7, antL: 5, antR: 5, ant2L: 3.5, ant2R: 3.5, tail1: 5, tail2: 3.5, cage: 8 },
  castBone: 'cage', coreBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 1.9, 0])
      .bone('spine', 'hips', [0, 2.6, 0])
      .bone('chest', 'spine', [0, 3.3, 0.05])
      .bone('neck', 'chest', [0, 3.8, 0.1])
      .bone('head', 'neck', [0, 4.08, 0.16], [0, 4.4, 0.18])
      .bone('eyes', 'head', [0, 4.12, 0.38])
      .pairBone('antL', 'head', [0.08, 4.3, 0.28])
      .pairBone('ant2L', 'antL', [0.45, 4.85, 0.5], [0.8, 5.2, 0.55])
      .pairBone('wingL', 'chest', [0.18, 3.55, -0.2], [3.4, 4.5, -0.3])
      .pairBone('hwingL', 'chest', [0.16, 3.1, -0.22], [2.4, 2.1, -0.7])
      .pairBone('shoulderL', 'chest', [0.38, 3.45, 0.05])
      .pairBone('elbowL', 'shoulderL', [0.72, 2.9, 0.35])
      .pairBone('wristL', 'elbowL', [0.78, 2.35, 0.62])
      .pairBone('handL', 'wristL', [0.78, 2.22, 0.68], [0.78, 1.9, 0.78])
      .pairBone('shoulder2L', 'chest', [0.3, 3.05, 0.12])
      .pairBone('elbow2L', 'shoulder2L', [0.5, 2.7, 0.42])
      .pairBone('hand2L', 'elbow2L', [0.28, 2.55, 0.62], [0.18, 2.5, 0.7])
      .bone('cage', 'chest', [0, 2.55, 0.72])
      .bone('tail1', 'hips', [0, 1.1, -0.05])
      .bone('tail2', 'tail1', [0, 0.45, -0.15], [0, 0.0, -0.3]);
    // A long dress of dust, thinning to nothing.
    b.part(lathe([[0.2, 3.0], [0.3, 2.6], [0.36, 2.1], [0.5, 1.6], [0.62, 1.1], [0.66, 0.6], [0.55, 0.2], [0.35, 0.02]], {
      segments: 30, scaleZ: 0.8,
      deform: (o, a, t) => { o.multiplyScalar(1 + Math.sin(a * 6 + t * 3) * 0.08 * t); if (t > 0.6) o.y -= Math.max(0, Math.sin(a * 5 + 1)) ** 2 * 0.35 * (t - 0.6); },
    }), { color: '#6b6470', shade: '#18161c', surface: 'cloth', bones: ['spine', 'hips', 'tail1', 'tail2'], falloff: 3 });
    // A slender furred body and a moth's head under a long veil.
    b.part(ellipsoid([0, 3.3, 0.05], [0.3, 0.42, 0.26]), { color: '#b8ad9a', shade: '#5c5446', surface: 'fur', bones: ['chest', 'spine'] });
    b.part(ellipsoid([0, 4.1, 0.2], [0.2, 0.22, 0.2]), { color: '#a59a87', shade: '#544b3e', surface: 'fur', bones: ['head'] });
    // A long furred neck carries the head up out of the shoulders.
    b.part(tube([[0, 3.55, 0.04], [0, 3.8, 0.1], [0, 4.0, 0.16]], [0.17, 0.11, 0.1], { radial: 12 }), { color: '#b0a590', shade: '#6a604f', surface: 'fur', bones: ['chest', 'neck', 'head'] });
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.11 * s, 4.12, 0.33], [0.1, 0.12, 0.09]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
      b.part(tube([[0.06 * s, 4.28, 0.28], [0.3 * s, 4.62, 0.42], [0.55 * s, 4.95, 0.52], [0.8 * s, 5.2, 0.55]], [0.012, 0.01, 0.008, 0.003], { radial: 4 }), { color: '#3a332b', surface: 'fur', bones: [s > 0 ? 'antL' : 'antR', s > 0 ? 'ant2L' : 'ant2R'] });
      b.part(ellipsoid([0.45 * s, 4.82, 0.48], [0.38, 0.018, 0.13], { deform: (_d, p) => p.applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.85 * s) }),
        { color: '#8a7d68', shade: '#4a4236', surface: 'wing', bones: [s > 0 ? 'ant2L' : 'ant2R'] });
    }
    b.part(lathe([[0.18, 4.26], [0.24, 4.15], [0.28, 3.95], [0.33, 3.75], [0.4, 3.55], [0.42, 3.45]], {
      segments: 26, center: [0, 0, 0.17],
      deform: (o, a, t) => { if (o.z < 0) o.multiplyScalar(0.9); if (t > 0.6) o.y += Math.sin(a * 7) * 0.04; },
    }), { color: '#cfc8bc', shade: '#6e685f', surface: 'cloth', bones: ['head', 'neck'] });
    b.part(lathe([[0.2, 4.3], [0.215, 4.27], [0.2, 4.24]], { center: [0, 0, 0.17], segments: 20 }), { color: '#3a2e24', surface: 'bark', bones: ['head'] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.5;
      b.part(ellipsoid([Math.cos(a) * 0.21, 4.31, 0.17 + Math.sin(a) * 0.21], [0.03, 0.025, 0.03]), { color: '#5a4d6a', surface: 'leaf', bones: ['head'] });
    }
    // Four thin arms; the lower two cradle a cage of ribs full of stolen lights.
    for (const [sh, el, wr, hand, sb, eb, hb] of [
      [[0.36, 3.48, 0.05], [0.72, 2.9, 0.35], [0.78, 2.32, 0.64], [0.78, 2.18, 0.7], 'shoulderL', 'elbowL', 'handL'],
      [[0.28, 3.08, 0.12], [0.5, 2.7, 0.42], [0.3, 2.56, 0.62], [0.24, 2.52, 0.66], 'shoulder2L', 'elbow2L', 'hand2L'],
    ] as Array<[V3, V3, V3, V3, string, string, string]>) {
      b.pair(tube([sh, el, wr], [0.06, 0.045, 0.035], { radial: 8 }), { color: '#2b2630', shade: '#4a4252', surface: 'chitin', bones: [sb, eb, hb, 'chest'] });
      for (const dx of [-0.03, 0, 0.03]) b.pair(tube([[hand[0] + dx, hand[1], hand[2]], [hand[0] + dx * 1.5, hand[1] - 0.18, hand[2] + 0.06], [hand[0] + dx * 1.7, hand[1] - 0.32, hand[2] + 0.1]], [0.014, 0.01, 0.002], { radial: 4 }),
        { color: '#2b2630', surface: 'chitin', bones: [hb] });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const pts: V3[] = [];
      for (let k = 0; k <= 8; k++) { const t = (k / 8) * Math.PI; pts.push([Math.cos(a) * Math.sin(t) * 0.34, 2.55 + Math.cos(t) * 0.36, 0.72 + Math.sin(a) * Math.sin(t) * 0.34]); }
      b.part(tube(pts, [0.018], { radial: 5, segments: 24 }), { color: '#d0c6ad', shade: '#7d7058', surface: 'bone', bones: ['cage'] });
    }
    for (const [x, y, z, c] of [[0.08, 2.6, 0.75, '#ffd27a'], [-0.1, 2.48, 0.68, '#9fe8ff'], [0.0, 2.7, 0.62, '#ffb3e6'], [-0.05, 2.5, 0.85, '#d4ff9a'], [0.12, 2.42, 0.66, '#ffffff']] as const) {
      b.part(ellipsoid([x, y, z], [0.055, 0.055, 0.055]), { color: c, surface: 'glow', glow: 0.95, bones: ['cage'] });
    }
    // Vast wings with staring eyes.
    b.pair(mothWing([0.18, 3.55, -0.2], 3.3, 1.7, 0.1, true), { color: '#6f6555', shade: '#26221d', surface: 'wing', bones: ['wingL'] });
    b.pair(mothWing([0.16, 3.1, -0.22], 2.4, 1.4, 0.6, false), { color: '#5a5145', shade: '#201c18', surface: 'wing', bones: ['hwingL'] });
    for (const [x, y, z, r0] of [[2.0, 3.72, -0.05, 0.42], [1.25, 2.68, -0.45, 0.3]] as const) {
      const bone = y > 3.2 ? 'wingL' : 'hwingL';
      const root: V3 = bone === 'wingL' ? [0.18, 3.55, -0.2] : [0.16, 3.1, -0.22];
      const spot = (r: V3, dy: number) => pitchAbout(ellipsoid([x, y + dy, z], r), root, -0.95);
      b.pair(spot([r0, 0.014, r0 * 0.8], 0.02), { color: '#16130f', surface: 'wing', bones: [bone] });
      b.pair(spot([r0 * 0.62, 0.014, r0 * 0.5], 0.035), { color: '#d8c8a2', surface: 'wing', bones: [bone] });
      b.pair(spot([r0 * 0.25, 0.014, r0 * 0.22], 0.05), { color: '#c9a8ff', surface: 'glow', glow: 0.7, bones: [bone] });
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    const p = a.progress, c = smooth(0, 0.7, p), hit = smooth(0, 0.3, p);
    const flaring = a.pose === 'windup' && (a.attack === 'brood' || a.attack === 'dust');
    flap(a, flaring ? 7 : a.pose === 'strike' && a.attack === 'dust' ? 10 : 3.2, flaring ? 0.85 : 0.45);
    r.pos('hips', 0, Math.sin(a.t * 3.2) * 0.12 + 0.2, 0).rot('hips', -0.12 * a.fwd * a.move, 0, -0.25 * a.side * a.move);
    r.rot('tail1', 0.3 * a.fwd * a.move + Math.sin(a.t * 1.1) * 0.06 - a.swayF * 0.4, 0, a.swayS * 0.4).rot('tail2', 0.3 * a.fwd * a.move + Math.sin(a.t * 1.1 - 0.7) * 0.09 - a.swayF * 0.5);
    r.rotPair('ant', Math.sin(a.t * 0.9) * 0.08 - a.swayF * 0.3, 0, Math.sin(a.t * 0.7) * 0.06).rotPair('ant2', Math.sin(a.t * 0.9 - 0.6) * 0.1);
    idleLife(a, 0.6);
    lookAt(a, 0.9, 0.7);
    blink(a, 99);
    r.rot('head', 0, 0, Math.sin(a.t * 0.4 + a.seed * 2) * 0.2 * a.life);
    // The lower arms always cradle the cage; the upper arms drift as if conducting.
    r.rotPair('shoulder2', -0.3, 0, 0).rotPair('elbow2', -0.6).rot('cage', 0, a.t * 0.2);
    r.rotPair('shoulder', -0.2 + Math.sin(a.t * 0.6) * 0.1, 0, 0.25).rotPair('elbow', -0.4);
    if (a.pose === 'windup') {
      if (a.attack === 'embrace') r.rotPair('shoulder', -1.4 * c, 0, 0.9 * c).rotPair('elbow', -0.2 * c).rot('chest', -0.2 * c);
      else if (a.attack === 'children') r.rotPair('shoulder2', -1.5 * c).rot('cage', 0, 0, 0).pos('cage', 0, 0.4 * c, 0).rot('head', -0.4 * c);
      else if (a.attack === 'dust') r.rotPair('shoulder', -0.4 * c, 0, 1.4 * c).rot('chest', -0.25 * c);
      else r.rotPair('shoulder', -1.0 * c, 0, 1.2 * c).rot('head', -0.3 * c);
    } else if (a.pose === 'strike') {
      if (a.attack === 'embrace') r.rotPair('shoulder', -1.4 + 0.6 * hit, 0, 0.9 - 1.1 * hit).rot('chest', -0.2 + 0.5 * hit).pos('hips', 0, -0.5 * hit, 0.6 * hit);
      else if (a.attack === 'dust') r.rotPair('shoulder', -0.4, 0, 1.4 - 1.2 * hit).rotPair('wing', -0.5 * hit, 0, 0);
      else r.rotPair('shoulder', -1.0, 0, 1.2);
    }
  },
};

/* ═════════════════════════════════ GRAEL THE ROOTWARDEN ═════════════════════════════════ */

const OLD_BARK = '#463627', OLD_DARK = '#1f1710', OLD_MOSS = '#4e6233';

export const GRAEL: Design = {
  kind: 'grael', name: 'Grael', height: 7.6, radius: 1.9, turnRate: 0.9, stride: 3.6, pace: 0.45,
  eye: '#9fff8a', eyeAngry: '#ffcf4a', edge: '#ffd27a', mist: 0.9,
  stiffness: { hips: 6, spine: 5.5, chest: 5.5, head: 5, beard: 3, crownL: 3, crownR: 3, shoulderL: 5, shoulderR: 5, elbowL: 5.5, elbowR: 5.5, handL: 6, handR: 6 },
  castBone: 'handR', coreBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 2.6, -0.4])
      .bone('spine', 'hips', [0, 3.6, 0])
      .bone('chest', 'spine', [0, 4.6, 0.35])
      .bone('neck', 'chest', [0, 5.3, 0.8])
      .bone('head', 'neck', [0, 5.55, 1.15], [0, 6.2, 1.3])
      .bone('eyes', 'head', [0, 5.72, 1.62])
      .bone('beard', 'head', [0, 5.3, 1.55], [0, 4.2, 1.7])
      .pairBone('crownL', 'head', [0.35, 6.1, 1.0], [1.3, 7.4, 0.6])
      .pairBone('shoulderL', 'chest', [1.35, 5.0, 0.25])
      .pairBone('elbowL', 'shoulderL', [1.95, 3.3, 0.8])
      .pairBone('wristL', 'elbowL', [2.05, 1.35, 1.2])
      .pairBone('handL', 'wristL', [2.05, 0.75, 1.3], [2.0, 0.05, 1.45])
      .pairBone('thighL', 'hips', [0.75, 2.5, -0.4])
      .pairBone('kneeL', 'thighL', [0.85, 1.4, -0.05])
      .pairBone('ankleL', 'kneeL', [0.9, 0.25, -0.25])
      .pairBone('toeL', 'ankleL', [0.9, 0.1, 0.4], [0.9, 0.05, 0.9]);
    // A hunched mountain of a trunk, broad at the shoulders.
    b.part(lathe([[0.7, 5.6], [1.15, 5.25], [1.35, 4.8], [1.3, 4.1], [1.15, 3.4], [1.05, 2.8], [1.0, 2.3], [0.85, 2.0]], {
      segments: 34, scaleZ: 0.82, closeTop: true, closeBottom: true, center: [0, 0, 0.1],
      deform: (o, a, t, y) => {
        o.multiplyScalar(1 + Math.sin(a * 7 + y * 1.7) * 0.06 + Math.sin(a * 3 - y * 2.9) * 0.05);
        o.z += (y - 3) * 0.12;
        o.applyAxisAngle(Y, (y - 3.5) * 0.08);
      },
    }), { color: OLD_BARK, shade: OLD_DARK, surface: 'bark', bones: ['hips', 'spine', 'chest', 'neck'], falloff: 3 });
    // In its chest, a cage of roots around the Star-Heart.
    b.part(ellipsoid([0, 4.35, 1.18], [0.62, 0.72, 0.2]), { color: '#0d0905', surface: 'dark', bones: ['chest', 'spine'] });
    b.part(ellipsoid([0, 4.35, 1.22], [0.34, 0.34, 0.3]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes', 'chest'] });
    for (let i = 0; i < 6; i++) {
      const x = -0.5 + i * 0.2;
      b.part(tube([[x, 5.05, 1.05], [x * 1.15, 4.5, 1.45], [x * 1.05, 4.0, 1.42], [x * 0.8, 3.6, 1.1]], [0.07, 0.08, 0.07, 0.05], { radial: 7, wobble: 0.25 }),
        { color: '#3c2d20', shade: OLD_BARK, surface: 'bark', bones: ['chest', 'spine'] });
    }
    // A low old head between the shoulders: a face of bark, deep eyes, a long beard of moss.
    b.part(ellipsoid([0, 5.65, 1.25], [0.55, 0.5, 0.48], { deform: (d, p) => { if (d.z > 0.2 && d.y > -0.1 && d.y < 0.45) p.z -= 0.12 * (1 - Math.abs(d.x)); p.y += Math.max(0, d.y) * 0.15; } }),
      { color: '#4f3d2c', shade: OLD_DARK, surface: 'bark', bones: ['head'] });
    b.part(tube([[-0.42, 5.88, 1.55], [0, 5.82, 1.72], [0.42, 5.88, 1.55]], [0.1, 0.13, 0.1], { radial: 8, wobble: 0.25 }), { color: '#5a4632', surface: 'bark', bones: ['head'] });
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.2 * s, 5.72, 1.6], [0.11, 0.07, 0.06]), { color: '#0a0705', surface: 'dark', bones: ['head'] });
      b.part(ellipsoid([0.2 * s, 5.72, 1.63], [0.06, 0.04, 0.03]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
    }
    for (let i = 0; i < 9; i++) {
      const x = -0.4 + i * 0.1, len = 1.0 + Math.sin(i * 1.7) * 0.3 + (i === 4 ? 0.4 : 0);
      b.part(tube([[x, 5.42, 1.6], [x * 1.1, 5.42 - len * 0.5, 1.72], [x * 0.9, 5.42 - len, 1.66]], [0.06, 0.04, 0.006], { radial: 6, wobble: 0.3 }),
        { color: OLD_MOSS, shade: '#232c17', surface: 'hair', bones: ['beard'] });
    }
    // A crown of bare branches, a few dead leaves, two lanterns that no longer burn.
    for (const s of [1, -1]) {
      const side = s > 0 ? 'crownL' : 'crownR';
      for (const [pts, r0] of [
        [[[0.3 * s, 6.0, 1.05], [0.7 * s, 6.6, 0.9], [1.05 * s, 7.1, 0.7], [1.4 * s, 7.45, 0.55]], 0.16],
        [[[0.4 * s, 6.0, 1.0], [0.95 * s, 6.25, 1.2], [1.45 * s, 6.5, 1.3], [1.8 * s, 6.9, 1.25]], 0.12],
        [[[0.1 * s, 6.1, 1.0], [0.2 * s, 6.8, 0.85], [0.15 * s, 7.4, 0.7], [0.3 * s, 7.9, 0.6]], 0.11],
      ] as Array<[V3[], number]>) {
        b.part(tube(pts, [r0, r0 * 0.6, r0 * 0.3, 0.01], { radial: 7, wobble: 0.2 }), { color: OLD_BARK, shade: '#3a2c1f', surface: 'bark', bones: [side, 'head'] });
      }
      b.part(tube([[1.8 * s, 6.9, 1.25], [1.8 * s, 6.55, 1.25]], [0.01], { radial: 4 }), { color: '#2a241c', surface: 'metal', bones: [side] });
      b.part(lathe([[0.02, 6.55], [0.1, 6.5], [0.12, 6.35], [0.1, 6.22], [0.03, 6.2]], { center: [1.8 * s, 0, 1.25], segments: 10, closeTop: true, closeBottom: true }), { color: '#3a3128', surface: 'metal', bones: [side] });
    }
    // Arms long enough to walk on, knuckles of root.
    b.pair(tube([[1.1, 5.1, 0.2], [1.95, 3.3, 0.8], [2.05, 1.35, 1.2]], [0.5, 0.36, 0.3], { radial: 14, wobble: 0.15, seed: 7 }),
      { color: OLD_BARK, shade: OLD_DARK, surface: 'bark', bones: ['shoulderL', 'elbowL', 'wristL', 'chest'] });
    b.pair(ellipsoid([2.05, 0.85, 1.3], [0.32, 0.42, 0.3]), { color: OLD_BARK, shade: OLD_DARK, surface: 'bark', bones: ['handL', 'wristL'] });
    for (const [dx, dz] of [[-0.2, 0.25], [0, 0.32], [0.2, 0.25], [0.28, -0.05]] as const) {
      b.pair(tube([[2.05 + dx * 0.6, 0.7, 1.3 + dz * 0.6], [2.05 + dx, 0.35, 1.32 + dz], [2.0 + dx * 1.2, 0.06, 1.35 + dz * 1.3]], [0.12, 0.09, 0.03], { radial: 7, wobble: 0.2 }),
        { color: OLD_BARK, shade: '#2b2118', surface: 'bark', bones: ['handL'] });
    }
    // Boulders of moss on the shoulders.
    b.pair(ellipsoid([1.0, 5.35, 0.15], [0.62, 0.38, 0.55], { deform: (d, p) => p.multiplyScalar(1 + Math.sin(d.x * 9 + d.z * 6) * 0.1) }), { color: OLD_MOSS, shade: '#26301a', surface: 'moss', bones: ['chest', 'shoulderL'] });
    b.pair(ellipsoid([1.35, 5.45, 0.0], [0.35, 0.3, 0.32]), { color: '#6f6a5c', shade: '#3a3830', surface: 'stone', bones: ['shoulderL'] });
    // Short, thick root legs.
    b.pair(tube([[0.7, 2.6, -0.4], [0.85, 1.4, -0.05], [0.9, 0.3, -0.25]], [0.52, 0.44, 0.4], { radial: 12, wobble: 0.15 }),
      { color: OLD_BARK, shade: OLD_DARK, surface: 'bark', bones: ['thighL', 'kneeL', 'ankleL', 'hips'] });
    for (const [dx, dz] of [[-0.35, 0.7], [0.05, 0.85], [0.4, 0.6], [0.4, -0.5]] as const) {
      b.pair(tube([[0.9, 0.35, -0.25], [0.9 + dx * 0.5, 0.1, -0.25 + dz * 0.5], [0.9 + dx, 0.02, -0.25 + dz]], [0.18, 0.1, 0.015], { radial: 7, wobble: 0.2 }),
        { color: OLD_BARK, shade: '#2b2118', surface: 'bark', bones: ['ankleL', 'toeL'] });
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    // It walks on its knuckles: the arms carry the body forward between the short legs' steps.
    biped(a, { stride: 0.25, knee: 0.35, bob: 0.12, sway: 0.08, lean: 0.06, arm: 0, elbow: -0.15 });
    const ph = a.phase * TAU, w = a.move * a.life;
    r.rot('shoulderL', -Math.sin(ph + Math.PI / 2) * 0.28 * a.fwd * w).rot('shoulderR', -Math.sin(ph - Math.PI / 2) * 0.28 * a.fwd * w);
    r.rot('chest', 0, 0, Math.sin(ph) * 0.06 * w).rot('spine', 0.12);
    idleLife(a, 0.5);
    lookAt(a, 0.5, 0.45);
    blink(a, 11);
    r.rot('beard', -a.swayF * 1.0 + Math.sin(a.t * 0.6) * 0.05, 0, a.swayS * 1.0).rotPair('crown', Math.sin(a.t * 0.4) * 0.03 - a.swayF * 0.3, 0, a.swayS * 0.3);
    const p = a.progress, c = smooth(0, 0.7, p), hit = smooth(0, 0.3, p);
    if (a.pose === 'windup') {
      if (a.attack === 'quake') r.rotPair('shoulder', -2.4 * c, 0, 0.2 * c).rotPair('elbow', -0.6 * c).rot('spine', -0.22 * c).rot('head', -0.2 * c).pos('hips', 0, 0.2 * c, 0);
      else if (a.attack === 'roots') r.rot('shoulderR', -1.2 * c).rot('elbowR', -0.8 * c).rot('spine', 0.25 * c, -0.3 * c);
      else if (a.attack === 'boulder') r.rot('shoulderR', -2.7 * c, 0, -0.3 * c).rot('elbowR', -1.2 * c).rot('spine', -0.15 * c, 0.4 * c);
      else r.rotPair('shoulder', -1.6 * c, 0, 0.8 * c).rot('head', -0.3 * c).rot('chest', -0.2 * c).scl('chest', 0.05 * c);
    } else if (a.pose === 'strike') {
      if (a.attack === 'quake') r.rotPair('shoulder', -2.4 + 2.6 * hit, 0, 0.2).rotPair('elbow', -0.6 + 0.5 * hit).rot('spine', -0.22 + 0.6 * hit).pos('hips', 0, 0.2 - 0.5 * hit, 0.3 * hit);
      else if (a.attack === 'roots') r.rot('shoulderR', -1.2 + 1.1 * hit).rot('elbowR', -0.8 + 0.6 * hit).rot('spine', 0.25 + 0.2 * hit, -0.3);
      else if (a.attack === 'boulder') r.rot('shoulderR', -2.7 + 2.2 * hit).rot('elbowR', -1.2 + 1.0 * hit).rot('spine', -0.15 + 0.45 * hit, 0.4 - 0.8 * hit);
      else r.rotPair('shoulder', -1.6, 0, 0.8);
    }
  },
};

/* ═════════════════════════════════ THE LANTERN WIDOW ═════════════════════════════════ */

const LEGS = [1, 2, 3, 4];
const CHITIN = '#211c26', CHITIN_LIGHT = '#4a4058';

export const LANTERN_WIDOW: Design = {
  kind: 'widow', name: 'The Lantern Widow', height: 4.6, radius: 1.9, turnRate: 2.6, stride: 2.2, pace: 1.7,
  eye: '#ffcf7a', eyeAngry: '#ff6a3a', edge: '#ffcf8a', mist: 0.5,
  stiffness: { lan1L: 3.5, lan1R: 3.5, lan2L: 3, lan2R: 3, abd: 7, head: 9 },
  castBone: 'handL', coreBone: 'spine',
  build(b: Body) {
    b.bone('hips', 'root', [0, 1.9, -0.3])
      .bone('abd', 'hips', [0, 2.05, -1.3], [0, 1.9, -2.3])
      .bone('spine', 'hips', [0, 2.45, 0.3])
      .bone('chest', 'spine', [0, 3.1, 0.45])
      .bone('neck', 'chest', [0, 3.55, 0.5])
      .bone('head', 'neck', [0, 3.82, 0.55], [0, 4.1, 0.6])
      .bone('eyes', 'head', [0, 3.86, 0.75])
      .pairBone('shoulderL', 'chest', [0.35, 3.25, 0.45])
      .pairBone('elbowL', 'shoulderL', [0.62, 2.78, 0.75])
      .pairBone('handL', 'elbowL', [0.68, 2.35, 0.98], [0.7, 2.2, 1.05])
      .pairBone('lan1L', 'abd', [0.42, 1.55, -1.1], [0.42, 1.0, -1.1])
      .pairBone('lan2L', 'abd', [0.3, 1.5, -1.8], [0.3, 0.95, -1.8]);
    for (const k of LEGS) {
      const z = 0.55 - k * 0.38, spread = 1.15 + (k === 1 || k === 4 ? 0.35 : 0);
      b.pairBone(`leg${k}L`, 'hips', [0.35, 1.95, z])
        .pairBone(`knee${k}L`, `leg${k}L`, [0.35 + spread, 3.0, z + (k - 2.5) * 0.25])
        .pairBone(`foot${k}L`, `knee${k}L`, [0.35 + spread * 1.9, 0.05, z + (k - 2.5) * 0.65], [0.35 + spread * 2.0, -0.05, z + (k - 2.5) * 0.7]);
    }
    // A great abdomen draped like a mourning gown, marked with dim lantern shapes.
    b.part(ellipsoid([0, 2.05, -1.35], [0.85, 0.75, 1.1], { deform: (d, p) => { if (d.y < -0.3) p.y *= 0.8; p.multiplyScalar(1 + Math.sin(d.x * 7 + d.z * 5) * 0.03); } }),
      { color: '#2c2533', shade: '#0e0b12', surface: 'cloth', bones: ['abd', 'hips'] });
    for (const [x, z] of [[0, -0.9], [0.28, -1.4], [-0.28, -1.4], [0, -1.95]] as const) {
      b.part(ellipsoid([x, 2.75 - Math.abs(z + 1.35) * 0.25, z], [0.11, 0.03, 0.16]), { color: '#ffcf7a', surface: 'glow', glow: 0.45, bones: ['abd'] });
    }
    b.part(ellipsoid([0, 1.95, 0.05], [0.55, 0.42, 0.6]), { color: CHITIN, shade: '#0d0b10', surface: 'chitin', bones: ['hips', 'spine'] });
    // A wraith's upper body, hooded and veiled, rising from the front.
    b.part(lathe([[0.15, 3.5], [0.3, 3.35], [0.36, 3.05], [0.36, 2.7], [0.42, 2.35], [0.5, 2.1]], { segments: 26, scaleZ: 0.85, center: [0, 0, 0.4] }),
      { color: '#3a3342', shade: '#16121b', surface: 'cloth', bones: ['chest', 'spine'] });
    b.part(ellipsoid([0, 3.85, 0.5], [0.22, 0.27, 0.24], { deform: (d, p) => { if (d.y > 0.4) { p.z -= (d.y - 0.4) * 0.25; p.y += (d.y - 0.4) * 0.2; } } }),
      { color: '#3e3647', shade: '#1b1620', surface: 'cloth', bones: ['head'] });
    b.part(ellipsoid([0, 3.82, 0.66], [0.15, 0.19, 0.1]), { color: '#e6e0d4', shade: '#8f887b', surface: 'bone', bones: ['head'] });
    b.part(tube([[0.02, 3.95, 0.76], [-0.03, 3.8, 0.765], [0.01, 3.66, 0.75]], [0.004], { radial: 4 }), { color: '#ffcf7a', surface: 'glow', glow: 0.8, bones: ['head'] });
    for (const s of [1, -1]) b.part(ellipsoid([0.06 * s, 3.86, 0.755], [0.022, 0.014, 0.008]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
    b.part(lathe([[0.2, 3.75], [0.26, 3.5], [0.3, 3.2]], { center: [0, 0, 0.62], segments: 20, deform: (o) => { if (o.z < 0) o.multiplyScalar(0.3); } }),
      { color: '#4a4152', shade: '#221d28', surface: 'cloth', bones: ['head', 'neck'] });
    b.pair(tube([[0.32, 3.28, 0.45], [0.62, 2.78, 0.75], [0.68, 2.38, 0.98]], [0.08, 0.07, 0.09], { radial: 9, capEnd: false }), { color: '#3a3342', shade: '#16121b', surface: 'cloth', bones: ['shoulderL', 'elbowL', 'handL', 'chest'] });
    for (const dx of [-0.025, 0, 0.025]) b.pair(tube([[0.68 + dx, 2.32, 1.0], [0.69 + dx * 1.4, 2.18, 1.06], [0.7 + dx * 1.6, 2.06, 1.1]], [0.012, 0.009, 0.002], { radial: 4 }), { color: '#cfc8ba', surface: 'bone', bones: ['handL'] });
    // Eight long legs, knees high above the body, each with a little lantern at the knee.
    for (const k of LEGS) {
      const z = 0.55 - k * 0.38, spread = 1.15 + (k === 1 || k === 4 ? 0.35 : 0);
      const knee: V3 = [0.35 + spread, 3.0, z + (k - 2.5) * 0.25], foot: V3 = [0.35 + spread * 1.9, 0.05, z + (k - 2.5) * 0.65];
      b.pair(tube([[0.35, 1.95, z], knee, foot], [0.09, 0.06, 0.012], { radial: 8, segments: 24 }), { color: CHITIN, shade: CHITIN_LIGHT, surface: 'chitin', bones: [`leg${k}L`, `knee${k}L`, `foot${k}L`], falloff: 6 });
      b.pair(ellipsoid([knee[0], knee[1] + 0.02, knee[2]], [0.09, 0.08, 0.09]), { color: CHITIN_LIGHT, surface: 'chitin', bones: [`knee${k}L`] });
      b.pair(ellipsoid([knee[0], knee[1] - 0.12, knee[2]], [0.045, 0.06, 0.045]), { color: '#ffb257', surface: 'glow', glow: 0.8, bones: [`knee${k}L`] });
    }
    // Lanterns hanging from the gown on chains.
    for (const [bone, x, z] of [['lan1L', 0.42, -1.1], ['lan2L', 0.3, -1.8]] as const) {
      b.pair(tube([[x, 1.55, z], [x, 1.15, z]], [0.008], { radial: 4 }), { color: '#3a3128', surface: 'metal', bones: [bone] });
      b.pair(lathe([[0.02, 1.16], [0.07, 1.13], [0.1, 1.05], [0.1, 0.92], [0.07, 0.86], [0.02, 0.84]], { center: [x, 0, z], segments: 10, closeTop: true, closeBottom: true }), { color: '#3a3128', surface: 'metal', bones: [bone] });
      b.pair(ellipsoid([x, 0.99, z], [0.075, 0.1, 0.075]), { color: '#ffc36a', surface: 'glow', glow: 0.9, bones: [bone] });
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    // A spider's gait: two alternating sets of four legs; it skitters sideways as easily as forward.
    const w = a.move * a.life, ph = a.phase * TAU;
    for (const k of LEGS) {
      for (const s of ['L', 'R'] as const) {
        const set = (k + (s === 'L' ? 0 : 1)) % 2;
        const phi = ph + set * Math.PI;
        const lift = Math.max(0, Math.cos(phi)), swing = Math.sin(phi);
        r.rot(`leg${k}${s}`, -swing * 0.3 * a.fwd * w, swing * 0.35 * (s === 'L' ? 1 : -1) * a.fwd * w, (s === 'L' ? 1 : -1) * (lift * 0.25 * w + swing * 0.25 * a.side * (s === 'L' ? 1 : -1) * w));
        r.rot(`knee${k}${s}`, 0, 0, (s === 'L' ? -1 : 1) * lift * 0.2 * w);
      }
    }
    r.pos('hips', 0, Math.sin(ph * 2) * 0.05 * w + Math.sin(a.t * 0.8) * 0.04, 0).rot('hips', 0, 0, -0.08 * a.side * w);
    r.rot('abd', Math.sin(a.t * 0.7) * 0.05 - a.swayF * 0.3, 0, a.swayS * 0.3);
    r.rotPair('lan1', -a.swayF * 1.4 + Math.sin(a.t * 1.6) * 0.08, 0, a.swayS * 1.4 + Math.sin(a.t * 1.2) * 0.06).rotPair('lan2', -a.swayF * 1.5 + Math.sin(a.t * 1.6 - 1) * 0.08, 0, a.swayS * 1.5);
    idleLife(a, 0.6);
    lookAt(a, 1, 0.8);
    blink(a, 99);
    r.rot('head', 0, 0, Math.sin(a.t * 0.45 + a.seed * 3) * 0.22 * a.life);
    r.rotPair('shoulder', -0.25, 0, 0.1).rotPair('elbow', -0.5);
    const p = a.progress, c = smooth(0, 0.7, p), hit = smooth(0, 0.3, p);
    if (a.pose === 'windup') {
      if (a.attack === 'stab') r.rot('leg1L', -0.6 * c, 0, 0.6 * c).rot('leg1R', -0.6 * c, 0, -0.6 * c).rot('spine', -0.25 * c);
      else if (a.attack === 'pounce') r.pos('hips', 0, -0.5 * c, -0.2 * c).rot('spine', 0.2 * c);
      else if (a.attack === 'lanterns') r.rotPair('shoulder', -1.6 * c, 0, 0.5 * c).rotPair('elbow', -0.4 * c).rot('spine', -0.2 * c);
      else r.rotPair('shoulder', -0.9 * c, 0, 1.3 * c).rot('head', -0.35 * c);
    } else if (a.pose === 'strike') {
      if (a.attack === 'stab') r.rot('leg1L', -0.6 + 1.0 * hit, 0, 0.6 - 0.9 * hit).rot('leg1R', -0.6 + 1.0 * hit, 0, -0.6 + 0.9 * hit).rot('spine', -0.25 + 0.5 * hit);
      else if (a.attack === 'pounce') r.pos('hips', 0, -0.5 + bump(0, 0.7, p) * 1.6, 0.4 * hit);
      else if (a.attack === 'lanterns') r.rotPair('shoulder', -1.6 + 0.6 * hit, 0, 0.5).rotPair('elbow', -0.4 + 0.4 * hit);
    }
  },
};

/* ═════════════════════════════════ THE UNLIT KING ═════════════════════════════════ */

const NIGHT = '#15131b', NIGHT_EDGE = '#2c2836', KING_BARK = '#2b2119';

export const UNLIT_KING: Design = {
  kind: 'king', name: 'The Unlit King', height: 9.2, radius: 2.3, turnRate: 0.8, stride: 4.4, pace: 0.5,
  eye: '#ffe7a3', eyeAngry: '#ffffff', edge: '#ffe7a3', mist: 1.2,
  cloth: [0.22, 5.8, 0.0, 0.4],
  stiffness: { hips: 5, spine: 5, chest: 5, neck: 5, head: 4.5, antlerL: 5, antlerR: 5, cape1: 3, cape2: 2.5, shoulderL: 5, shoulderR: 5, elbowL: 5.5, elbowR: 5.5 },
  castBone: 'handR', coreBone: 'chest',
  build(b: Body) { buildRegal(b, KING_LOOK); },
  animate: kingAnimate,
};

interface RegalLook { cloak: string; cloakDark: string; edge: string; mask: string; crown: 'lanterns' | 'leaves'; stars: boolean }
const KING_LOOK: RegalLook = { cloak: NIGHT, cloakDark: '#07060a', edge: NIGHT_EDGE, mask: KING_BARK, crown: 'lanterns', stars: true };
/** The Warden as he was: green and gold, a crown of leaves, the same antlers. */
export const WARDEN_LOOK: RegalLook = { cloak: '#35523a', cloakDark: '#16241a', edge: '#5f7f52', mask: '#6b5038', crown: 'leaves', stars: false };

export function buildRegal(b: Body, look: RegalLook): void {
    const NIGHT = look.cloak, NIGHT_EDGE = look.edge, KING_BARK = look.mask;
    b.bone('hips', 'root', [0, 4.1, 0])
      .bone('spine', 'hips', [0, 5.4, 0])
      .bone('chest', 'spine', [0, 6.6, 0.1])
      .bone('neck', 'chest', [0, 7.4, 0.2])
      .bone('head', 'neck', [0, 7.85, 0.3], [0, 8.6, 0.35])
      .bone('eyes', 'head', [0, 8.1, 0.82])
      .pairBone('antlerL', 'head', [0.3, 8.6, 0.25])
      .bone('cape1', 'chest', [0, 5.2, -0.7])
      .bone('cape2', 'cape1', [0, 2.6, -1.1], [0, 0.0, -1.5])
      .pairBone('shoulderL', 'chest', [1.0, 7.0, 0.05])
      .pairBone('elbowL', 'shoulderL', [1.5, 5.4, 0.4])
      .pairBone('wristL', 'elbowL', [1.62, 3.8, 0.85])
      .pairBone('handL', 'wristL', [1.62, 3.5, 0.95], [1.6, 2.5, 1.15])
      .pairBone('thighL', 'hips', [0.5, 4.0, 0])
      .pairBone('kneeL', 'thighL', [0.58, 2.1, 0.2])
      .pairBone('ankleL', 'kneeL', [0.6, 0.25, 0], [0.6, 0.05, 0.6]);
    // A cloak of night from the shoulders to the ground, flecked with the ghosts of stars.
    b.part(lathe([[0.45, 7.5], [0.95, 7.2], [1.15, 6.6], [1.1, 5.8], [1.2, 4.6], [1.5, 3.2], [1.85, 1.8], [2.2, 0.5], [2.3, 0.05]], {
      segments: 40, scaleZ: 0.78,
      deform: (o, a, t) => {
        o.multiplyScalar(1 + Math.sin(a * 8 + t * 4) * 0.05 * t);
        // The front parts over the chest, opening onto the heart.
        if (o.z > 0 && t < 0.5) o.x *= 1 + 0.25 * (1 - t * 2) * Math.sign(o.x) * 0.3;
        if (t > 0.85) o.y -= Math.max(0, Math.sin(a * 6)) ** 2 * 0.3;
      },
    }), { color: NIGHT, shade: look.cloakDark, surface: 'cloth', bones: ['chest', 'spine', 'hips', 'thighL', 'thighR', 'kneeL', 'kneeR', 'cape1'], falloff: 3 });
    b.part(lathe([[0.4, 7.45], [1.0, 7.15], [1.45, 6.4], [1.6, 4.2], [1.9, 2.2], [2.1, 0.4]], {
      segments: 32, scaleZ: 0.7, center: [0, 0, -0.35],
      deform: (o, a, t) => { if (o.z > -0.1) o.multiplyScalar(0.55); if (t > 0.8) o.y -= Math.max(0, Math.sin(a * 5 + 1)) * 0.3; },
    }), { color: '#1b1822', shade: '#08070b', surface: 'cloth', bones: ['chest', 'cape1', 'cape2'], falloff: 2.5 });
    const random = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    for (let i = 0; i < (look.stars ? 70 : 0); i++) {
      const t = random(i), a = random(i + 100) * TAU, y = 7.2 - t * 6.8;
      const r0 = (1.0 + t * 1.25) * 1.01;
      b.part(ellipsoid([Math.cos(a) * r0, y, Math.sin(a) * r0 * 0.78], [0.025, 0.025, 0.025], { widthSegments: 6, heightSegments: 4 }),
        { color: random(i + 7) > 0.5 ? '#bcd2ff' : '#ffe7c4', surface: 'glow', glow: 0.5 + random(i + 3) * 0.4, bones: [y > 5.5 ? 'chest' : y > 3.5 ? 'hips' : 'cape1'] });
    }
    // A mantle of dead feathers and antler-shards across the shoulders.
    for (let i = 0; i < 14; i++) {
      const a = (i / 13 - 0.5) * 2.6, x = Math.sin(a) * 1.05, z = Math.cos(a) * 0.55 - 0.35;
      b.part(tube([[x * 0.9, 7.35, z * 0.9], [x * 1.25, 7.25, z * 1.2], [x * 1.45, 6.85, z * 1.3]], [0.09, 0.06, 0.005], { radial: 6, flatten: { axis: [0, 1, 0], amount: 0.5 } }),
        { color: '#2d2834', shade: '#5a5068', surface: 'fur', bones: ['chest'] });
    }
    // The heart: a mass of every swallowed light, behind a cage of roots.
    b.part(ellipsoid([0, 6.3, 0.72], [0.62, 0.7, 0.3]), { color: '#08060a', surface: 'dark', bones: ['chest'] });
    b.part(ellipsoid([0, 6.3, 0.82], [0.42, 0.46, 0.3]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes', 'chest'] });
    for (let i = 0; i < 7; i++) {
      const x = -0.54 + i * 0.18;
      b.part(tube([[x, 7.0, 0.6], [x * 1.2, 6.5, 1.08], [x * 1.1, 6.0, 1.06], [x * 0.7, 5.55, 0.75]], [0.06, 0.07, 0.06, 0.04], { radial: 6, wobble: 0.3 }),
        { color: KING_BARK, shade: '#4a3a2b', surface: 'bark', bones: ['chest'] });
    }
    // A long mask of bark, two hollows full of stolen light, a crack that leaks it.
    b.part(ellipsoid([0, 7.95, 0.5], [0.42, 0.62, 0.42], { deform: (d, p) => { if (d.y < 0) { p.x *= 1 + d.y * 0.45; p.y *= 1.35; } if (d.z > 0.3 && d.y > -0.1 && d.y < 0.4) p.z -= 0.08; } }),
      { color: KING_BARK, shade: '#120d09', surface: 'bark', bones: ['head'] });
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.15 * s, 8.1, 0.84], [0.1, 0.075, 0.06]), { color: '#050406', surface: 'dark', bones: ['head'] });
      b.part(ellipsoid([0.15 * s, 8.1, 0.87], [0.05, 0.04, 0.03]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
    }
    b.part(tube([[0.02, 8.5, 0.86], [-0.05, 8.2, 0.9], [0.04, 7.9, 0.9], [-0.02, 7.55, 0.84]], [0.012, 0.016, 0.012, 0.004], { radial: 5 }), { color: '#ffe7a3', surface: 'glow', glow: 0.85, bones: ['head'] });
    // Antlers wide as the trees, and a crown of lanterns gone dark.
    const antler = (pts: V3[], radii: number[], bones: string[]) => b.pair(tube(pts, radii, { radial: 8, wobble: 0.18, seed: pts.length * 3 }), { color: '#211a14', shade: '#4d3e30', surface: 'bark', bones });
    antler([[0.25, 8.45, 0.35], [0.8, 9.0, 0.2], [1.5, 9.4, 0.0], [2.3, 9.7, -0.2], [3.0, 9.8, -0.35]], [0.14, 0.11, 0.08, 0.05, 0.01], ['antlerL']);
    antler([[0.65, 8.9, 0.22], [0.75, 9.5, 0.4], [0.8, 10.0, 0.5]], [0.07, 0.05, 0.008], ['antlerL']);
    antler([[1.3, 9.3, 0.05], [1.4, 9.95, 0.15], [1.45, 10.4, 0.22]], [0.06, 0.04, 0.008], ['antlerL']);
    antler([[2.0, 9.6, -0.12], [2.2, 10.1, 0.0], [2.3, 10.45, 0.05]], [0.05, 0.03, 0.006], ['antlerL']);
    antler([[2.5, 9.72, -0.25], [2.9, 9.4, -0.1], [3.2, 9.3, 0.05]], [0.04, 0.025, 0.005], ['antlerL']);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.2, x = Math.cos(a) * 0.42, z = 0.42 + Math.sin(a) * 0.4, y = 8.62 + Math.sin(a * 2) * 0.05;
      if (look.crown === 'leaves') {
        b.part(ellipsoid([x, y + 0.08, z], [0.16, 0.05, 0.09], { deform: (_d, p) => p.applyAxisAngle(Y, -a) }), { color: '#7fae5a', shade: '#3f6a2e', surface: 'leaf', bones: ['head'] });
        continue;
      }
      b.part(tube([[x, y, z], [x, y + 0.2, z]], [0.012], { radial: 4 }), { color: '#3a3128', surface: 'metal', bones: ['head'] });
      b.part(lathe([[0.02, y + 0.38], [0.07, y + 0.34], [0.09, y + 0.27], [0.09, y + 0.2], [0.03, y + 0.18]], { center: [x, 0, z], segments: 10, closeTop: true, closeBottom: true }), { color: '#3a3128', shade: '#1a1612', surface: 'metal', bones: ['head'] });
      b.part(ellipsoid([x, y + 0.28, z], [0.045, 0.05, 0.045]), { color: '#ff9a4a', surface: 'glow', glow: 0.25, bones: ['head'] });
    }
    // Sleeves of night, and hands like the roots of an old tree.
    b.pair(tube([[0.95, 7.05, 0.05], [1.5, 5.4, 0.4], [1.62, 3.9, 0.85]], [0.42, 0.36, 0.45], { radial: 14, capEnd: false }),
      { color: NIGHT, shade: NIGHT_EDGE, surface: 'cloth', bones: ['shoulderL', 'elbowL', 'wristL', 'chest'] });
    b.pair(ellipsoid([1.62, 3.55, 0.95], [0.18, 0.26, 0.14]), { color: KING_BARK, shade: '#120d09', surface: 'bark', bones: ['handL', 'wristL'] });
    for (const [dx, dz, len] of [[-0.12, 0.08, 1.2], [-0.04, 0.12, 1.35], [0.05, 0.12, 1.3], [0.13, 0.06, 1.1], [0.16, -0.08, 0.8]] as const) {
      b.pair(tube([[1.62 + dx, 3.4, 0.97 + dz], [1.62 + dx * 1.6, 3.4 - len * 0.5, 1.02 + dz * 1.5], [1.6 + dx * 2, 3.4 - len, 1.1 + dz * 2]], [0.05, 0.035, 0.006], { radial: 6, wobble: 0.25 }),
        { color: KING_BARK, shade: '#4a3a2b', surface: 'bark', bones: ['handL'] });
    }
}

function kingAnimate(a: Anim): void {
    const r = a.rig;
    biped(a, { stride: 0.22, knee: 0.3, bob: 0.08, sway: 0.05, lean: 0.04, arm: 0.12, elbow: -0.3 });
    // Heavy, slow breaths that make the heart flare.
    const breath = Math.sin(a.t * 0.8);
    r.scl('chest', breath * 0.02, breath * 0.015, breath * 0.025).rot('chest', breath * 0.02);
    r.rot('cape1', 0.1 * a.fwd * a.move - a.swayF * 0.4 + Math.sin(a.t * 0.5) * 0.03, 0, a.swayS * 0.4).rot('cape2', 0.12 * a.fwd * a.move - a.swayF * 0.5 + Math.sin(a.t * 0.5 - 0.7) * 0.04, 0, a.swayS * 0.5);
    lookAt(a, 0.7, 0.4);
    blink(a, 99);
    r.rot('head', 0.1, 0, Math.sin(a.t * 0.25 + a.seed) * 0.1 * a.life);
    const p = a.progress, c = smooth(0, 0.7, p), hit = smooth(0, 0.3, p);
    if (a.pose === 'windup') {
      if (a.attack === 'hands') r.rot('shoulderR', -1.8 * c, 0, -0.3 * c).rot('elbowR', -0.6 * c).rot('handR', -0.6 * c).rot('spine', -0.08 * c, 0.2 * c);
      else if (a.attack === 'darkstars') r.rotPair('shoulder', -2.7 * c, 0, 0.35 * c).rotPair('elbow', -0.3 * c).rot('head', -0.4 * c).rot('chest', -0.15 * c);
      else if (a.attack === 'devour') r.rotPair('shoulder', -0.8 * c, 0, 1.4 * c).rot('chest', -0.2 * c).scl('chest', 0.08 * c).rot('head', -0.25 * c);
      else if (a.attack === 'crush') r.rotPair('shoulder', -2.5 * c).rotPair('elbow', -1.0 * c).rot('spine', -0.15 * c);
      else r.rot('shoulderL', -1.4 * c, 0, 0.2 * c).rot('elbowL', -0.2 * c).rot('head', 0.15 * c);
    } else if (a.pose === 'strike') {
      if (a.attack === 'hands') r.rot('shoulderR', -1.8 + 1.5 * hit, 0, -0.3).rot('elbowR', -0.6 + 0.3 * hit).rot('handR', -0.6 + 1.0 * hit).rot('spine', -0.08 + 0.25 * hit, 0.2);
      else if (a.attack === 'darkstars') r.rotPair('shoulder', -2.7, 0, 0.35 + 0.4 * hit).rot('head', -0.45);
      else if (a.attack === 'devour') r.rotPair('shoulder', -0.8, 0, 1.4).scl('chest', 0.1).rot('head', -0.3);
      else if (a.attack === 'crush') r.rotPair('shoulder', -2.5 + 2.4 * hit).rotPair('elbow', -1.0 + 0.8 * hit).rot('spine', -0.15 + 0.45 * hit).pos('hips', 0, -0.5 * hit, 0.4 * hit);
      else r.rot('shoulderL', -1.4, 0, 0.2);
    }
}

export const BOSS_DESIGNS = { gorrik: GORRIK, fenwyrm: FENWYRM, stag: HOLLOW_STAG, herald: PALE_HERALD, matron: MOTH_MATRON, grael: GRAEL, widow: LANTERN_WIDOW, king: UNLIT_KING } as const;
