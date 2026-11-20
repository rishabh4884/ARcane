import * as THREE from 'three';
import { ellipsoid, lathe, tube, type Body, type V3 } from '../rig/Body.ts';
import type { Design } from '../rig/Character.ts';
import { biped, blink, bump, clamp, idleLife, lookAt, smooth, TAU, type Anim } from '../rig/Rig.ts';

/**
 * THE WOODLAND SPIRITS
 * ────────────────────
 * The four kinds that first walk out of the Hushwood. Each is modelled as one continuous body on a
 * skeleton and animated procedurally from what it is doing: travelling (forward, backward or
 * side-stepping in either direction), turning, idling, winding up, striking, recovering, reeling
 * from a hit, frozen, or dying.
 */

const mirror = (p: V3): V3 => [-p[0], p[1], p[2]];

/* ═════════════════════════════ BRAMBLE GOBLIN ═════════════════════════════ */

const GOBLIN_SKIN = '#6f7a58', GOBLIN_SHADE = '#424a33', TUNIC = '#4d3c2b', MOSS = '#5a7238';

export const BRAMBLE_GOBLIN: Design = {
  kind: 'goblin', name: 'Bramble Goblin', height: 1.8, radius: 0.5, turnRate: 6.5, stride: 1.05, pace: 1.6,
  eye: '#d8f27a', eyeAngry: '#ff6a3a', edge: '#ffb066', mist: 0.4,
  stiffness: { earL: 8, earR: 8, ear2L: 5, ear2R: 5, jaw: 20, hips: 22, handL: 14, handR: 14 },
  castBone: 'handR', coreBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 0.82, 0])
      .bone('spine', 'hips', [0, 0.98, 0.02])
      .bone('chest', 'spine', [0, 1.18, 0.1])
      .bone('neck', 'chest', [0, 1.34, 0.2])
      .bone('head', 'neck', [0, 1.44, 0.26], [0, 1.62, 0.34])
      .bone('jaw', 'head', [0, 1.42, 0.32], [0, 1.37, 0.46])
      .bone('eyes', 'head', [0, 1.525, 0.45])
      .pairBone('earL', 'head', [0.15, 1.56, 0.25])
      .pairBone('ear2L', 'earL', [0.37, 1.62, 0.15], [0.6, 1.67, 0.03])
      .pairBone('shoulderL', 'chest', [0.24, 1.28, 0.1])
      .pairBone('elbowL', 'shoulderL', [0.36, 1.02, 0.14])
      .pairBone('wristL', 'elbowL', [0.42, 0.76, 0.22])
      .pairBone('handL', 'wristL', [0.44, 0.67, 0.26], [0.45, 0.55, 0.31])
      .pairBone('thighL', 'hips', [0.13, 0.8, 0])
      .pairBone('kneeL', 'thighL', [0.15, 0.46, 0.1])
      .pairBone('ankleL', 'kneeL', [0.15, 0.12, -0.04])
      .pairBone('toeL', 'ankleL', [0.15, 0.04, 0.12], [0.15, 0.03, 0.22]);
    // A hunched body: the back bulges, the belly sags.
    b.part(ellipsoid([0, 1.1, 0.06], [0.25, 0.31, 0.21], {
      deform: (d, p) => {
        if (d.z < 0) p.z -= 0.07 * Math.max(0, d.y + 0.4);
        if (d.z > 0 && d.y < 0) p.z += 0.05 * -d.y;
        p.x *= 1 + 0.06 * Math.sin(d.y * 4);
      },
    }), { color: GOBLIN_SKIN, shade: GOBLIN_SHADE, surface: 'skin', bones: ['spine', 'chest', 'hips', 'neck'] });
    // Ragged tunic, slumped at the hem.
    b.part(lathe([[0.235, 1.12], [0.27, 1.0], [0.295, 0.88], [0.315, 0.76], [0.335, 0.64], [0.33, 0.6]], {
      center: [0, 0, 0.04], scaleZ: 0.92, segments: 28,
      deform: (o, a, t) => {
        o.multiplyScalar(1 + Math.sin(a * 6 + 1) * 0.04);
        if (t > 0.7) o.y += (Math.sin(a * 7) * 0.035 + Math.sin(a * 17) * 0.018) * (t - 0.7) / 0.3;
      },
    }), { color: TUNIC, shade: '#2c2219', surface: 'cloth', bones: ['hips', 'spine', 'thighL', 'thighR'], falloff: 3 });
    b.part(lathe([[0.262, 0.92], [0.27, 0.885], [0.262, 0.85]], { center: [0, 0, 0.04], scaleZ: 0.93, segments: 28 }),
      { color: '#2b2018', surface: 'skin', bones: ['hips', 'spine'] });
    b.part(ellipsoid([0, 0.885, 0.3], [0.04, 0.035, 0.02]), { color: '#8d7a4f', surface: 'metal', bones: ['hips'] });
    // The head: a heavy brow, sunken temples, cheeks falling into a long jaw.
    b.part(ellipsoid([0, 1.5, 0.32], [0.17, 0.155, 0.18], {
      deform: (d, p) => {
        p.x *= 1 + 0.18 * Math.exp(-((d.y + 0.25) ** 2) / 0.05);
        if (d.z < -0.2) p.y += 0.02 * -d.z;
        p.x *= 1 - 0.1 * Math.exp(-((d.y - 0.35) ** 2) / 0.04) * Math.max(0, d.z);
      },
    }), { color: GOBLIN_SKIN, shade: GOBLIN_SHADE, surface: 'skin', bones: ['head'] });
    // The neck joins head to body: a thick sinewy column bent forward under the skull.
    b.part(tube([[0, 1.22, 0.06], [0, 1.34, 0.16], [0, 1.44, 0.26], [0, 1.5, 0.3]], [0.11, 0.085, 0.078, 0.08], { radial: 12 }),
      { color: GOBLIN_SKIN, shade: GOBLIN_SKIN, surface: 'skin', bones: ['chest', 'neck', 'head'] });
    for (const sx of [1, -1]) b.part(tube([[0.06 * sx, 1.27, 0.1], [0.05 * sx, 1.38, 0.2], [0.07 * sx, 1.46, 0.28]], [0.022, 0.02, 0.014], { radial: 6 }),
      { color: GOBLIN_SKIN, surface: 'skin', bones: ['chest', 'neck', 'head'] });
    b.part(tube([[-0.12, 1.575, 0.43], [0, 1.56, 0.475], [0.12, 1.575, 0.43]], [0.032, 0.042, 0.032], { radial: 8 }),
      { color: '#59634a', surface: 'skin', bones: ['head'] });
    b.part(tube([[0, 1.53, 0.47], [0, 1.5, 0.56], [0.012, 1.44, 0.625]], [0.046, 0.034, 0.016], { radial: 9, wobble: 0.08 }),
      { color: GOBLIN_SKIN, shade: '#7d6e55', surface: 'skin', bones: ['head'] });
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.07 * s, 1.525, 0.44], [0.052, 0.036, 0.03]), { color: '#100d0a', surface: 'dark', bones: ['head'] });
      b.part(ellipsoid([0.07 * s, 1.525, 0.462], [0.032, 0.024, 0.016]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
      b.part(ellipsoid([0.07 * s, 1.525, 0.477], [0.007, 0.019, 0.005]), { color: '#0a0805', surface: 'dark', bones: ['eyes'] });
      // Heavy upper lids half over the eyes: the goblin always looks like it is sizing you up.
      b.part(ellipsoid([0.07 * s, 1.543, 0.458], [0.044, 0.018, 0.03], { deform: (d, p) => { p.y -= Math.max(0, d.x * s) * 0.006; } }),
        { color: '#5d6649', surface: 'skin', bones: ['head'], relief: 0.5 });
      b.part(ellipsoid([0.014 * s, 1.445, 0.62], [0.008, 0.006, 0.006]), { color: '#120d0a', surface: 'dark', bones: ['head'] });
    }
    // Jaw, the dark slash of a mouth and two pale tusks.
    b.part(ellipsoid([0, 1.4, 0.38], [0.13, 0.055, 0.12]), { color: GOBLIN_SKIN, shade: GOBLIN_SHADE, surface: 'skin', bones: ['jaw'] });
    b.part(ellipsoid([0, 1.43, 0.45], [0.085, 0.018, 0.035]), { color: '#1a0e0b', surface: 'dark', bones: ['jaw', 'head'] });
    b.pair(tube([[0.05, 1.41, 0.47], [0.062, 1.462, 0.5], [0.05, 1.505, 0.49]], [0.017, 0.012, 0.002], { radial: 7 }),
      { color: '#e6dcc2', shade: '#b9a98a', surface: 'bone', bones: ['jaw'] });
    // Ears: long leaves of skin, thin enough for the moon to shine through their edges.
    b.pair(tube([[0.12, 1.55, 0.27], [0.3, 1.6, 0.19], [0.46, 1.64, 0.1], [0.62, 1.67, 0.02]], [0.07, 0.085, 0.05, 0.005], {
      radial: 12, segments: 22, flatten: { axis: [0.1, 0.4, 1], amount: 0.8 },
    }), { color: GOBLIN_SKIN, shade: '#8f6c5c', surface: 'skin', bones: ['earL', 'ear2L', 'head'] });
    // Arms with a bramble wound about the forearm.
    b.pair(tube([[0.2, 1.3, 0.09], [0.29, 1.16, 0.12], [0.36, 1.02, 0.14], [0.39, 0.9, 0.18], [0.42, 0.77, 0.22]], [0.085, 0.074, 0.05, 0.058, 0.04], { radial: 12, segments: 30 }),
      { color: GOBLIN_SKIN, shade: GOBLIN_SHADE, surface: 'skin', bones: ['shoulderL', 'elbowL', 'wristL', 'chest'] });
    // Knobbled elbows and knuckles.
    b.pair(ellipsoid([0.355, 1.02, 0.12], [0.04, 0.038, 0.035]), { color: GOBLIN_SKIN, surface: 'skin', bones: ['elbowL'] });
    const vine: V3[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10, a = u * TAU * 1.3;
      vine.push([0.365 + 0.055 * u + Math.cos(a) * 0.05, 0.98 - u * 0.2, 0.15 + 0.07 * u + Math.sin(a) * 0.05]);
    }
    b.part(tube(vine, [0.014, 0.016, 0.012], { radial: 6, segments: 48, wobble: 0.25 }), { color: '#35271a', surface: 'bark', bones: ['elbowL', 'wristL'] });
    b.pair(ellipsoid([0.44, 0.69, 0.25], [0.05, 0.062, 0.042]), { color: GOBLIN_SKIN, shade: GOBLIN_SHADE, surface: 'skin', bones: ['wristL', 'handL'] });
    for (const [dx, dz] of [[-0.03, 0.02], [0, 0.03], [0.03, 0.015]] as const) {
      b.pair(tube([[0.44 + dx, 0.66, 0.27 + dz], [0.45 + dx, 0.58, 0.31 + dz], [0.44 + dx, 0.52, 0.34 + dz]], [0.016, 0.012, 0.003], { radial: 6 }),
        { color: GOBLIN_SKIN, shade: '#ddd0b2', surface: 'skin', bones: ['handL'] });
    }
    // Bent, digitigrade legs and long feet.
    b.pair(tube([[0.13, 0.84, 0], [0.14, 0.65, 0.06], [0.15, 0.46, 0.1], [0.15, 0.3, 0.035], [0.15, 0.12, -0.04]], [0.095, 0.088, 0.058, 0.062, 0.042], { radial: 12, segments: 30 }),
      { color: GOBLIN_SKIN, shade: GOBLIN_SHADE, surface: 'skin', bones: ['thighL', 'kneeL', 'ankleL', 'hips'] });
    b.pair(tube([[0.15, 0.11, -0.07], [0.15, 0.05, 0.08], [0.15, 0.035, 0.2]], [0.052, 0.045, 0.016], { radial: 9 }),
      { color: GOBLIN_SKIN, shade: '#c9bb99', surface: 'skin', bones: ['ankleL', 'toeL'] });
    // Moss on the shoulders and thorns down the spine.
    b.pair(ellipsoid([0.19, 1.33, 0.08], [0.13, 0.065, 0.13], { deform: (d, p) => p.multiplyScalar(1 + Math.sin(d.x * 9 + d.z * 7) * 0.12) }),
      { color: MOSS, shade: '#33431f', surface: 'moss', bones: ['chest', 'shoulderL'] });
    for (let i = 0; i < 6; i++) {
      const y = 1.36 - i * 0.1, z = -0.1 - Math.sin((i / 5) * Math.PI) * 0.06;
      b.part(tube([[0, y, z], [0, y + 0.05, z - 0.09 - (i % 2) * 0.03]], [0.026, 0.002], { radial: 6 }),
        { color: '#3b2c1f', shade: '#8a7656', surface: 'bark', bones: [i < 3 ? 'chest' : 'spine'] });
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    const crouch = 0.25;
    // Always half-crouched, coiled.
    r.rot('spine', 0.25).rot('chest', 0.15).rot('neck', -0.25).rot('head', -0.12);
    r.rotPair('thigh', -crouch).rotPair('knee', crouch * 1.6).rotPair('ankle', -crouch * 0.6);
    r.pos('hips', 0, -0.06, 0);
    biped(a, { stride: 0.55, knee: 0.95, bob: 0.06, sway: 0.08, lean: 0.25, arm: 0.55, elbow: -0.45, crouch: 0.1, run: clamp(a.speed / 2.2) * 0.6 });
    idleLife(a, 1);
    lookAt(a, a.pose === 'walk' ? 0.6 : 1);
    blink(a, 3.4);
    // Twitchy: the head cocks, the ears flick, the fingers flex.
    const twitch = Math.sin(a.t * 0.9 + a.seed * 20) > 0.94 ? 1 : 0;
    r.rot('head', 0, 0, (Math.sin(a.t * 0.7 + a.seed * 3) * 0.12 + twitch * 0.18) * a.life);
    for (const s of ['L', 'R'] as const) {
      const sign = s === 'L' ? 1 : -1;
      const flick = Math.max(0, Math.sin(a.t * 3.1 + (s === 'L' ? 0 : 1.9) + a.seed * 11)) ** 12;
      r.rot(`ear${s}`, -a.swayF * 0.5 + flick * 0.3, 0, sign * (a.swayS * 0.5 - flick * 0.2) + sign * Math.sin(a.phase * TAU * 2) * 0.06 * a.move);
      r.rot(`ear2${s}`, -a.swayF * 0.8 - Math.cos(a.phase * TAU * 2) * 0.12 * a.move, 0, sign * a.swayS * 0.6);
      r.rot(`hand${s}`, Math.sin(a.t * 2.3 + (s === 'L' ? 0 : 2)) * 0.15 * a.life);
    }
    const p = a.progress;
    switch (a.pose) {
      case 'windup': {
        // Coils down, draws the right claw back past its ear, left hand out to sight; jaw opens.
        const c = smooth(0, 0.6, p), tremble = Math.sin(a.t * 40) * 0.03 * smooth(0.5, 1, p);
        r.rot('spine', 0.15 * c, -0.45 * c).rot('chest', 0, -0.25 * c).rot('head', -0.15 * c, 0.4 * c);
        r.rotPair('thigh', -0.35 * c).rotPair('knee', 0.6 * c).pos('hips', 0, -0.1 * c, -0.05 * c);
        r.rot('shoulderR', -2.5 * c + tremble, 0, -0.5 * c).rot('elbowR', -1.3 * c);
        r.rot('shoulderL', -1.1 * c, 0, 0.3 * c).rot('elbowL', -0.4 * c);
        r.rot('jaw', 0.35 * c + tremble * 2).rotPair('ear', 0.5 * c, 0, -0.4 * c);
        break;
      }
      case 'strike': {
        // A lunge and a downward rake across the body.
        const hit = smooth(0, 0.35, p), after = smooth(0.35, 1, p);
        r.pos('hips', 0, -0.1, 0.35 * hit - 0.1 * after);
        r.rot('spine', 0.5 * hit, 0.5 * hit - 0.45, 0).rot('head', 0.2 * hit);
        r.rot('shoulderR', -2.5 + 2.9 * hit, 0, -0.5 + 0.9 * hit).rot('elbowR', -1.3 + 1.1 * hit);
        r.rot('shoulderL', -0.6, 0, 0.6 * hit).rot('jaw', 0.4 - 0.2 * after);
        r.rot('thighL', -0.8 * hit).rot('kneeL', 0.6 * hit).rot('thighR', 0.4 * hit);
        break;
      }
      case 'recover': {
        // Panting, arms hanging, eyes still on the caster.
        const pant = Math.sin(a.t * 7) * 0.5 + 0.5;
        r.rot('chest', 0.1 * pant).rot('jaw', 0.12 + 0.08 * pant).rotPair('shoulder', 0.15, 0, -0.1);
        break;
      }
      case 'stagger':
        r.rot('spine', -0.45 * bump(0, 1, p)).rot('head', -0.5 * bump(0, 1, p)).rotPair('shoulder', -0.6 * bump(0, 1, p), 0, 0.5 * bump(0, 1, p));
        break;
    }
  },
};

/* ═════════════════════════════════ ROOTBOUND ═════════════════════════════════ */

const BARK = '#4b3b2d', BARK_DARK = '#251c15', LICHEN = '#56683a';

export const ROOTBOUND: Design = {
  kind: 'root', name: 'Rootbound', height: 3.8, radius: 0.8, turnRate: 1.3, stride: 2.1, pace: 0.55,
  eye: '#ffb347', eyeAngry: '#ff4a1c', edge: '#ffa04a', mist: 0.6,
  stiffness: { crownL: 4, crownR: 4, crownM: 4, moss: 4, hips: 9, spine: 8, chest: 8, head: 7, shoulderL: 7, shoulderR: 7, elbowL: 8, elbowR: 8 },
  castBone: 'chest', coreBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 1.25, 0])
      .bone('spine', 'hips', [0, 1.9, 0])
      .bone('chest', 'spine', [0, 2.55, 0.05])
      .bone('head', 'chest', [0, 3.05, 0.06], [0, 3.35, 0.06])
      .bone('eyes', 'head', [0, 2.96, 0.5])
      .bone('moss', 'head', [0, 2.72, 0.48], [0, 2.2, 0.55])
      .bone('crownM', 'head', [0, 3.3, 0], [0, 3.9, -0.1])
      .pairBone('crownL', 'head', [0.25, 3.25, 0.02], [0.75, 3.75, -0.1])
      .pairBone('shoulderL', 'chest', [0.5, 2.72, 0])
      .pairBone('elbowL', 'shoulderL', [0.95, 2.1, 0.2])
      .pairBone('wristL', 'elbowL', [1.05, 1.45, 0.4])
      .pairBone('handL', 'wristL', [1.06, 1.3, 0.44], [1.02, 0.95, 0.52])
      .pairBone('thighL', 'hips', [0.3, 1.2, 0])
      .pairBone('kneeL', 'thighL', [0.4, 0.68, 0.12])
      .pairBone('ankleL', 'kneeL', [0.42, 0.14, 0])
      .pairBone('toeL', 'ankleL', [0.42, 0.06, 0.3], [0.42, 0.03, 0.55]);
    // The trunk: thick at the hips, gnarled, faintly twisted.
    b.part(lathe([[0.36, 3.3], [0.47, 3.1], [0.54, 2.8], [0.58, 2.4], [0.6, 2.0], [0.63, 1.6], [0.68, 1.25], [0.6, 1.05]], {
      segments: 30, scaleZ: 0.86, closeTop: true, closeBottom: true,
      deform: (o, a, t, y) => {
        o.multiplyScalar(1 + Math.sin(a * 7 + y * 2.3) * 0.05 + Math.sin(a * 3 - y * 4.1) * 0.04);
        o.applyAxisAngle(new THREE.Vector3(0, 1, 0), (y - 2) * 0.12);
        if (t < 0.12) o.y += Math.sin(a * 5) * 0.06;
      },
    }), { color: BARK, shade: BARK_DARK, surface: 'bark', bones: ['hips', 'spine', 'chest', 'head'], falloff: 3 });
    // The face is a hollow in the wood, lit faintly from deep inside.
    b.part(ellipsoid([0, 2.88, 0.43], [0.3, 0.36, 0.09], { deform: (d, p) => { p.y += Math.sin(d.x * 3) * 0.03; } }),
      { color: '#3a1d0c', surface: 'glow', glow: 0.22, bones: ['head', 'chest'] });
    b.part(tube([[0.3, 2.86, 0.42], [0.22, 3.18, 0.44], [0, 3.27, 0.47], [-0.22, 3.18, 0.44], [-0.3, 2.86, 0.42], [-0.2, 2.56, 0.44], [0, 2.5, 0.46], [0.2, 2.56, 0.44], [0.3, 2.86, 0.42]],
      [0.07, 0.08, 0.06, 0.08, 0.07, 0.09, 0.1, 0.09, 0.07], { radial: 8, segments: 48, wobble: 0.25, capStart: false, capEnd: false }),
    { color: '#5e4a37', shade: BARK, surface: 'bark', bones: ['head', 'chest'] });
    for (const s of [1, -1]) b.part(ellipsoid([0.13 * s, 2.96, 0.49], [0.055, 0.036, 0.02]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
    // A smaller hollow in the chest, and something small still watching from inside it.
    b.part(ellipsoid([0.14, 1.86, 0.5], [0.16, 0.21, 0.08]), { color: '#0c0806', surface: 'dark', bones: ['spine'] });
    for (const x of [0.105, 0.165]) b.part(ellipsoid([x, 1.9, 0.56], [0.012, 0.012, 0.008]), { color: '#cfe6ff', surface: 'glow', glow: 0.95, bones: ['spine'] });
    // Branch arms with twig fingers.
    b.pair(tube([[0.42, 2.78, 0], [0.95, 2.1, 0.2], [1.05, 1.45, 0.4]], [0.21, 0.15, 0.11], { radial: 12, wobble: 0.14, seed: 3 }),
      { color: BARK, shade: BARK_DARK, surface: 'bark', bones: ['shoulderL', 'elbowL', 'wristL', 'chest'] });
    for (const [dx, dz] of [[-0.09, 0.0], [-0.03, 0.06], [0.04, 0.06], [0.1, 0.0]] as const) {
      b.pair(tube([[1.05, 1.42, 0.42], [1.05 + dx, 1.2, 0.45 + dz], [1.02 + dx * 1.6, 0.98, 0.5 + dz * 1.6], [1.0 + dx * 1.8, 0.86, 0.55 + dz * 1.7]],
        [0.05, 0.032, 0.014, 0.003], { radial: 6, wobble: 0.2 }), { color: BARK, shade: '#3a2d22', surface: 'bark', bones: ['handL', 'wristL'] });
    }
    // Root legs that split into dragging root toes.
    b.pair(tube([[0.3, 1.3, 0], [0.4, 0.68, 0.12], [0.42, 0.16, 0]], [0.25, 0.2, 0.19], { radial: 12, wobble: 0.12, seed: 9 }),
      { color: BARK, shade: BARK_DARK, surface: 'bark', bones: ['thighL', 'kneeL', 'ankleL', 'hips'] });
    for (const [dx, dz] of [[-0.2, 0.35], [0.0, 0.45], [0.2, 0.32], [0.25, -0.2], [-0.2, -0.25]] as const) {
      b.pair(tube([[0.42, 0.22, 0], [0.42 + dx * 0.35, 0.07, dz * 0.35], [0.42 + dx * 0.75, 0.025, dz * 0.75], [0.42 + dx, 0.01, dz * 1.05]],
        [0.09, 0.055, 0.025, 0.004], { radial: 7, wobble: 0.2 }), { color: BARK, shade: '#2e241b', surface: 'bark', bones: ['ankleL', 'toeL'] });
    }
    // A crown of bare branches with a few dark leaves.
    const branch = (pts: V3[], bone: string) => b.part(tube(pts, [0.08, 0.05, 0.025, 0.005], { radial: 7, wobble: 0.15 }), { color: BARK, shade: '#3b2e23', surface: 'bark', bones: [bone, 'head'] });
    branch([[0, 3.25, 0], [0.05, 3.6, -0.05], [-0.05, 3.85, -0.12], [0.02, 4.05, -0.2]], 'crownM');
    for (const s of [1, -1]) {
      const side = s > 0 ? 'crownL' : 'crownR';
      branch([[0.2 * s, 3.2, 0.02], [0.45 * s, 3.45, 0.05], [0.7 * s, 3.7, -0.05], [0.85 * s, 3.95, -0.12]], side);
      branch([[0.35 * s, 3.1, 0.0], [0.6 * s, 3.2, 0.12], [0.8 * s, 3.25, 0.25], [0.95 * s, 3.4, 0.3]], side);
      for (const [x, y, z] of [[0.85, 3.95, -0.12], [0.95, 3.4, 0.3], [0.62, 3.7, -0.02]] as const) {
        b.part(ellipsoid([x * s, y, z], [0.09, 0.03, 0.06], { widthSegments: 10, heightSegments: 6 }), { color: '#566238', shade: '#2f3a1f', surface: 'leaf', bones: [side] });
      }
    }
    // Lichen, a bracket fungus and moss hanging from the chin of the hollow.
    for (const [x, y, z, r] of [[0.35, 2.75, 0.32, 0.18], [-0.42, 2.3, 0.2, 0.2], [0.2, 1.4, 0.48, 0.14], [-0.3, 3.15, 0.15, 0.16]] as const) {
      b.part(ellipsoid([x, y, z], [r, r * 0.5, r * 0.6], { widthSegments: 12, heightSegments: 8, deform: (d, p) => p.multiplyScalar(1 + Math.sin(d.x * 11 + d.y * 7) * 0.15) }),
        { color: LICHEN, shade: '#2f3a20', surface: 'moss', bones: [y > 2.5 ? 'chest' : 'spine'] });
    }
    b.part(ellipsoid([0.5, 2.1, 0.25], [0.18, 0.04, 0.12]), { color: '#b9a37c', shade: '#6b5a40', surface: 'stone', bones: ['spine'] });
    b.part(ellipsoid([0.52, 1.85, 0.2], [0.13, 0.03, 0.09]), { color: '#b9a37c', shade: '#6b5a40', surface: 'stone', bones: ['spine'] });
    for (let i = 0; i < 7; i++) {
      const x = -0.22 + i * 0.075, len = 0.35 + ((i * 37) % 5) * 0.08;
      b.part(tube([[x, 2.56, 0.46], [x * 1.05, 2.56 - len * 0.5, 0.5], [x * 1.1, 2.56 - len, 0.5]], [0.022, 0.014, 0.003], { radial: 5 }),
        { color: '#5d6a40', shade: '#2c3420', surface: 'hair', bones: ['moss'] });
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    biped(a, { stride: 0.34, knee: 0.5, bob: 0.07, sway: 0.11, lean: 0.08, arm: 0.28, elbow: -0.35 });
    idleLife(a, 0.6);
    lookAt(a, 0.5, 0.5);
    blink(a, 7);
    // Heavy: the whole trunk rolls with each step; the crown and moss follow late.
    r.rot('chest', 0, 0, Math.sin(a.phase * TAU) * 0.05 * a.move);
    r.rot('crownM', -a.swayF * 0.4 + Math.sin(a.t * 0.6) * 0.04, 0, a.swayS * 0.4);
    r.rotPair('crown', -a.swayF * 0.5 + Math.sin(a.t * 0.5 + 1) * 0.05, 0, a.swayS * 0.5 + Math.sin(a.phase * TAU) * 0.06 * a.move);
    r.rot('moss', -a.swayF * 1.2 + Math.sin(a.t * 0.8) * 0.06, 0, a.swayS * 1.2);
    r.rotPair('hand', Math.sin(a.t * 0.4 + a.seed) * 0.12);
    const p = a.progress;
    switch (a.pose) {
      case 'windup': {
        // Both branch-arms rise high overhead; the trunk leans back and creaks.
        const c = smooth(0, 0.7, p), creak = Math.sin(a.t * 23) * 0.015 * smooth(0.6, 1, p);
        r.rot('spine', -0.2 * c).rot('chest', -0.18 * c + creak).rot('head', -0.15 * c);
        r.rotPair('shoulder', -2.5 * c, 0, 0.25 * c).rotPair('elbow', -0.6 * c);
        r.rotPair('thigh', -0.2 * c).rotPair('knee', 0.35 * c);
        break;
      }
      case 'strike': {
        // Slam: both arms crash down in front, the trunk folds over them.
        const hit = smooth(0, 0.3, p), after = smooth(0.3, 1, p);
        r.rot('spine', -0.2 + 0.75 * hit - 0.2 * after).rot('chest', -0.18 + 0.4 * hit).rot('head', 0.3 * hit);
        r.rotPair('shoulder', -2.5 + 1.9 * hit, 0, 0.25).rotPair('elbow', -0.6 + 0.4 * hit);
        r.rotPair('thigh', -0.5 * hit).rotPair('knee', 0.6 * hit).pos('hips', 0, -0.25 * hit, 0.2 * hit);
        break;
      }
      case 'recover':
        r.rot('spine', 0.15 * (1 - smooth(0, 1, p))).rotPair('shoulder', -0.3 * (1 - smooth(0, 1, p)));
        break;
      case 'stagger':
        r.rot('spine', -0.2 * bump(0, 1, p)).rot('chest', -0.15 * bump(0, 1, p));
        break;
    }
  },
};

/* ═══════════════════════════════ ANTLERED HOLLOW ═══════════════════════════════ */

const SHROUD = '#2c2b30', SHROUD_DARK = '#121114', SKULL = '#dcd2bb';

export const ANTLERED_HOLLOW: Design = {
  kind: 'hollow', name: 'The Antlered Hollow', height: 5.4, radius: 0.65, turnRate: 1.6, stride: 1.6, pace: 0.7,
  eye: '#e6f0ff', eyeAngry: '#ff5f4a', edge: '#c9e2ff', mist: 0.9,
  cloth: [0.09, 3.2, 0.0, 0.3],
  stiffness: { mossL: 3, mossR: 3, antlerL: 10, antlerR: 10, head: 9, neck: 9, jaw: 12, hips: 10 },
  castBone: 'handR', coreBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 2.0, 0])
      .bone('spine', 'hips', [0, 2.8, 0])
      .bone('chest', 'spine', [0, 3.55, 0.05])
      .bone('neck', 'chest', [0, 4.02, 0.12])
      .bone('head', 'neck', [0, 4.3, 0.24], [0, 4.36, 0.62])
      .bone('jaw', 'head', [0, 4.24, 0.36], [0, 4.2, 0.72])
      .bone('eyes', 'head', [0, 4.38, 0.55])
      .pairBone('antlerL', 'head', [0.12, 4.47, 0.26])
      .pairBone('antler2L', 'antlerL', [0.5, 5.0, 0.05], [0.95, 5.3, -0.15])
      .pairBone('mossL', 'antler2L', [0.6, 5.0, 0.0], [0.62, 4.4, 0.05])
      .pairBone('shoulderL', 'chest', [0.42, 3.78, 0])
      .pairBone('elbowL', 'shoulderL', [0.62, 3.0, 0.2])
      .pairBone('wristL', 'elbowL', [0.66, 2.3, 0.42])
      .pairBone('handL', 'wristL', [0.66, 2.16, 0.46], [0.64, 1.6, 0.58])
      .pairBone('thighL', 'hips', [0.22, 1.95, 0])
      .pairBone('kneeL', 'thighL', [0.24, 1.05, 0.08])
      .pairBone('ankleL', 'kneeL', [0.24, 0.12, 0], [0.24, 0.02, 0.2]);
    // A floor-length shroud from a narrow collar to a tattered hem; it walks with hidden legs.
    b.part(lathe([[0.16, 4.12], [0.3, 4.0], [0.46, 3.8], [0.52, 3.45], [0.5, 3.0], [0.55, 2.5], [0.66, 1.8], [0.78, 1.1], [0.9, 0.5], [1.0, 0.05]], {
      segments: 34, scaleZ: 0.82,
      deform: (o, a, t) => {
        o.multiplyScalar(1 + Math.sin(a * 8 + t * 3) * 0.05 * t);
        if (t > 0.82) o.y += (Math.sin(a * 9) * 0.1 + Math.sin(a * 23 + 1) * 0.05) * (t - 0.82) / 0.18;
      },
    }), { color: SHROUD, shade: SHROUD_DARK, surface: 'cloth', bones: ['chest', 'spine', 'hips', 'thighL', 'thighR', 'kneeL', 'kneeR'], falloff: 3 });
    // A ribcage pressing through the cloth.
    for (let i = 0; i < 4; i++) {
      const y = 3.66 - i * 0.17 - (i % 2) * 0.02, w = 0.4 - i * 0.025;
      for (const s of [1, -1]) {
        const sag = s > 0 ? 0 : 0.03;
        b.part(tube([[0.03 * s, y, 0.41], [w * 0.55 * s, y - 0.04 - sag, 0.395], [w * s, y - 0.12 - sag, 0.22]], [0.016, 0.02, 0.008], { radial: 6, wobble: 0.2 }),
          { color: '#3d3a38', shade: '#242226', surface: 'cloth', bones: ['chest', 'spine'] });
      }
    }
    b.part(tube([[0, 3.78, 0.425], [0, 3.15, 0.41]], [0.022, 0.018], { radial: 6 }), { color: '#3d3a38', surface: 'cloth', bones: ['chest', 'spine'] });
    // A cowl about the collar and a vertebral neck.
    b.part(lathe([[0.15, 4.18], [0.28, 4.08], [0.42, 3.92], [0.47, 3.8]], { segments: 26, scaleZ: 0.85, deform: (o, a) => o.multiplyScalar(1 + Math.sin(a * 5) * 0.06) }),
      { color: '#38363b', shade: SHROUD, surface: 'cloth', bones: ['chest', 'neck'] });
    b.part(tube([[0, 3.95, 0.12], [0, 4.15, 0.18], [0, 4.3, 0.28]], [0.075, 0.065, 0.06], { radial: 8, wobble: 0.2, wobbleFrequency: 0 }),
      { color: '#a89d86', surface: 'bone', bones: ['neck', 'head'] });
    // The skull: a long deer skull, sockets sunk deep, stains weeping from them.
    b.part(ellipsoid([0, 4.34, 0.46], [0.145, 0.15, 0.32], {
      deform: (d, p) => {
        if (d.z > 0) { p.x *= 1 - 0.5 * d.z; p.y *= 1 - 0.38 * d.z; p.y -= 0.04 * d.z; }
        p.x *= 1 + 0.12 * Math.exp(-((d.z + 0.1) ** 2) / 0.05) * Math.max(0, d.y);
      },
    }), { color: SKULL, shade: '#8b7a60', surface: 'bone', bones: ['head'] });
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.1 * s, 4.39, 0.55], [0.058, 0.046, 0.045]), { color: '#0b0908', surface: 'dark', bones: ['head'] });
      b.part(ellipsoid([0.1 * s, 4.39, 0.585], [0.022, 0.022, 0.012]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
      b.part(tube([[0.105 * s, 4.35, 0.6], [0.11 * s, 4.26, 0.62], [0.1 * s, 4.18, 0.6]], [0.012, 0.009, 0.003], { radial: 5, flatten: { axis: [0, 0, 1], amount: 0.7 } }),
        { color: '#4a3020', surface: 'dark', bones: ['head'] });
    }
    b.part(ellipsoid([0, 4.21, 0.56], [0.085, 0.035, 0.22], { deform: (d, p) => { if (d.z > 0) p.x *= 1 - 0.4 * d.z; } }),
      { color: '#cfc4aa', shade: '#7d6d55', surface: 'bone', bones: ['jaw'] });
    // Antlers: dark, thin and branching.
    const antler = (pts: V3[], radii: number[], bones: string[]) => b.pair(tube(pts, radii, { radial: 7, wobble: 0.18, seed: pts.length }),
      { color: '#2e2620', shade: '#5c4c3c', surface: 'bark', bones });
    antler([[0.1, 4.45, 0.32], [0.32, 4.78, 0.22], [0.5, 5.02, 0.06], [0.74, 5.24, -0.08], [0.98, 5.32, -0.16]], [0.055, 0.045, 0.034, 0.022, 0.006], ['antlerL', 'antler2L']);
    antler([[0.2, 4.6, 0.28], [0.27, 4.72, 0.45], [0.3, 4.78, 0.6]], [0.03, 0.02, 0.004], ['antlerL']);
    antler([[0.33, 4.8, 0.2], [0.36, 5.05, 0.28], [0.38, 5.25, 0.34]], [0.03, 0.02, 0.004], ['antlerL', 'antler2L']);
    antler([[0.5, 5.02, 0.06], [0.54, 5.3, 0.1], [0.56, 5.55, 0.12]], [0.028, 0.018, 0.004], ['antler2L']);
    antler([[0.74, 5.24, -0.08], [0.8, 5.48, -0.04], [0.83, 5.7, -0.02]], [0.022, 0.014, 0.003], ['antler2L']);
    // Dead moss hanging from the tines.
    for (const [x, y, z, len] of [[0.36, 4.82, 0.2, 0.55], [0.52, 5.0, 0.06, 0.75], [0.7, 5.2, -0.06, 0.6], [0.6, 5.12, 0.0, 0.9]] as const) {
      b.pair(tube([[x, y, z], [x + 0.02, y - len * 0.5, z + 0.03], [x + 0.01, y - len, z + 0.02]], [0.03, 0.016, 0.003], { radial: 5, wobble: 0.3 }),
        { color: '#4c5438', shade: '#262b1c', surface: 'hair', bones: ['mossL'] });
    }
    // Sleeves to the wrist, then bare bone: long pale fingers.
    b.pair(tube([[0.4, 3.82, 0], [0.62, 3.0, 0.2], [0.66, 2.32, 0.42]], [0.15, 0.13, 0.17], { radial: 12, capEnd: false }),
      { color: SHROUD, shade: SHROUD_DARK, surface: 'cloth', bones: ['shoulderL', 'elbowL', 'wristL', 'chest'] });
    b.pair(tube([[0.66, 2.45, 0.38], [0.66, 2.2, 0.45]], [0.035, 0.03], { radial: 6 }), { color: '#bdb39c', surface: 'bone', bones: ['wristL', 'handL'] });
    b.pair(ellipsoid([0.66, 2.16, 0.46], [0.05, 0.075, 0.032]), { color: '#c8bfa8', shade: '#8a7f6a', surface: 'bone', bones: ['handL'] });
    for (const dx of [-0.045, -0.015, 0.015, 0.045]) {
      const len = 0.42 + (dx === -0.015 || dx === 0.015 ? 0.08 : 0);
      b.pair(tube([[0.66 + dx, 2.1, 0.47], [0.66 + dx * 1.4, 2.1 - len * 0.5, 0.53], [0.64 + dx * 1.7, 2.1 - len, 0.6]], [0.017, 0.013, 0.003], { radial: 6 }),
        { color: '#d1c7ae', shade: '#9a8e74', surface: 'bone', bones: ['handL'] });
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    biped(a, { stride: 0.22, knee: 0.35, bob: 0.03, sway: 0.04, lean: 0.06, arm: 0.06, elbow: -0.25 });
    idleLife(a, 0.7);
    lookAt(a, 0.8, 0.7);
    blink(a, 9);
    // Towering and patient: the head tilts slowly, the way a curious animal's does.
    r.rot('head', 0, 0, Math.sin(a.t * 0.35 + a.seed * 4) * 0.18 * a.life).rot('neck', 0.15);
    r.rotPair('hand', Math.sin(a.t * 0.8 + a.seed * 3) * 0.1);
    r.rotPair('moss', -a.swayF * 1.5 + Math.sin(a.t * 0.9) * 0.05, 0, a.swayS * 1.4 - a.turn * 0.2);
    const p = a.progress;
    switch (a.pose) {
      case 'windup': {
        // It rises to its full height and opens its arms wide; the jaw falls open.
        const c = smooth(0, 0.75, p);
        r.pos('hips', 0, 0.18 * c, -0.1 * c).rot('spine', -0.15 * c).rot('chest', -0.12 * c).rot('head', -0.25 * c);
        r.rotPair('shoulder', -0.9 * c, 0, 1.15 * c).rotPair('elbow', -0.5 * c).rotPair('hand', -0.4 * c);
        r.rot('jaw', 0.45 * c + Math.sin(a.t * 30) * 0.03 * smooth(0.6, 1, p));
        break;
      }
      case 'strike': {
        const hit = smooth(0, 0.35, p), after = smooth(0.35, 1, p);
        r.pos('hips', 0, 0.18 - 0.35 * hit, 0.3 * hit).rot('spine', 0.55 * hit).rot('chest', 0.3 * hit).rot('head', 0.35 * hit);
        r.rotPair('shoulder', -0.9 - 0.4 * hit, 0, 1.15 - 1.4 * hit).rotPair('elbow', -0.5 + 0.2 * hit);
        r.rot('jaw', 0.45 - 0.3 * after);
        break;
      }
      case 'recover':
        r.rot('head', 0, 0, 0.35 * smooth(0, 0.4, p) * (1 - smooth(0.6, 1, p)));
        break;
      case 'stagger':
        r.rot('chest', -0.25 * bump(0, 1, p)).rot('head', -0.3 * bump(0, 1, p));
        break;
    }
  },
};

/* ═══════════════════════════════ LANTERN WRAITH ═══════════════════════════════ */

const ROBE = '#3c404b', ROBE_DARK = '#0c0e13';

export const LANTERN_WRAITH: Design = {
  kind: 'wraith', name: 'Lantern Wraith', height: 3.0, radius: 0.5, turnRate: 2.4, stride: 3, pace: 0.6,
  eye: '#bfe3ff', eyeAngry: '#ffd27a', edge: '#ffcf8a', mist: 0.2,
  cloth: [0.13, 1.9, 0.0, 0.4],
  stiffness: { lantern: 3.5, chain: 5, tail1: 6, tail2: 4, tail3: 3, head: 8 },
  castBone: 'cast', coreBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 1.45, 0])
      .bone('spine', 'hips', [0, 1.9, 0])
      .bone('chest', 'spine', [0, 2.33, 0.03])
      .bone('neck', 'chest', [0, 2.58, 0.06])
      .bone('head', 'neck', [0, 2.78, 0.1], [0, 2.98, 0.14])
      .bone('eyes', 'head', [0, 2.78, 0.3])
      .bone('tail1', 'hips', [0, 1.0, -0.02])
      .bone('tail2', 'tail1', [0, 0.6, -0.06])
      .bone('tail3', 'tail2', [0, 0.3, -0.1], [0, 0.0, -0.16])
      .pairBone('shoulderL', 'chest', [0.29, 2.44, 0.02])
      .pairBone('elbowL', 'shoulderL', [0.47, 2.05, 0.16])
      .pairBone('wristL', 'elbowL', [0.52, 1.74, 0.3])
      .pairBone('handL', 'wristL', [0.53, 1.64, 0.33], [0.54, 1.5, 0.37])
      .bone('chain', 'handL', [0.53, 1.6, 0.37], [0.53, 1.42, 0.38])
      .bone('lantern', 'chain', [0.53, 1.42, 0.38], [0.53, 1.12, 0.38])
      .bone('cast', 'handR', [-0.55, 1.6, 0.44]);
    // A long robe narrowing into tattered wisps where the legs should be.
    b.part(lathe([[0.16, 2.64], [0.3, 2.52], [0.36, 2.28], [0.38, 1.92], [0.42, 1.5], [0.46, 1.1], [0.5, 0.72], [0.54, 0.42], [0.55, 0.3]], {
      segments: 36, scaleZ: 0.85,
      deform: (o, a, t, y) => {
        o.multiplyScalar(1 + Math.sin(a * 9 + y * 3) * 0.04 + Math.sin(a * 4 + y * 1.3) * 0.05 * t);
        // Rags: long tongues of cloth hang from the hem, short notches between them.
        if (t > 0.7) o.y -= Math.max(0, Math.sin(a * 6 + 0.5)) ** 2 * 0.32 * (t - 0.7) / 0.3 - Math.max(0, Math.sin(a * 13 + 2)) * 0.06 * (t - 0.7) / 0.3;
      },
    }), { color: ROBE, shade: ROBE_DARK, surface: 'cloth', bones: ['chest', 'spine', 'hips', 'tail1', 'tail2', 'tail3'], falloff: 3 });
    for (const [x, z, len] of [[0.3, 0.2, 0.55], [-0.34, 0.12, 0.5], [0.08, -0.38, 0.7], [-0.26, -0.3, 0.6], [0.4, -0.18, 0.45]] as const) {
      b.part(tube([[x, 0.6, z], [x * 1.1, 0.35, z - 0.06], [x * 1.18, 0.6 - len, z - 0.18]], [0.09, 0.05, 0.004], { radial: 6, flatten: { axis: [x, 0, z], amount: 0.75 } }),
        { color: '#262931', shade: ROBE_DARK, surface: 'cloth', bones: ['tail2', 'tail3'] });
    }
    // The hood opens onto nothing; two cold lights hang in the dark.
    b.part(ellipsoid([0, 2.8, 0.06], [0.215, 0.25, 0.235], {
      deform: (d, p) => { if (d.y > 0.4) { p.z -= (d.y - 0.4) * 0.22; p.y += (d.y - 0.4) * 0.14; } },
    }), { color: '#454955', shade: ROBE, surface: 'cloth', bones: ['head'] });
    b.part(ellipsoid([0, 2.76, 0.22], [0.15, 0.175, 0.09]), { color: '#020203', surface: 'dark', bones: ['head'] });
    b.part(tube([[0.15, 2.76, 0.27], [0.11, 2.93, 0.28], [0, 2.97, 0.29], [-0.11, 2.93, 0.28], [-0.15, 2.76, 0.27], [-0.12, 2.6, 0.27], [0, 2.56, 0.28], [0.12, 2.6, 0.27], [0.15, 2.76, 0.27]],
      [0.03], { radial: 6, segments: 40, capStart: false, capEnd: false }), { color: '#555a66', surface: 'cloth', bones: ['head'] });
    for (const s of [1, -1]) b.part(ellipsoid([0.058 * s, 2.79, 0.29], [0.022, 0.015, 0.008]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
    // Sleeves and grey, bony hands.
    b.pair(tube([[0.27, 2.48, 0.02], [0.47, 2.05, 0.16], [0.52, 1.76, 0.3]], [0.1, 0.09, 0.125], { radial: 11, capEnd: false }),
      { color: ROBE, shade: '#20232b', surface: 'cloth', bones: ['shoulderL', 'elbowL', 'wristL', 'chest'] });
    b.pair(ellipsoid([0.53, 1.66, 0.33], [0.04, 0.055, 0.028]), { color: '#a8a296', shade: '#6e695f', surface: 'bone', bones: ['handL'] });
    for (const dx of [-0.03, -0.01, 0.01, 0.03]) {
      b.pair(tube([[0.53 + dx, 1.62, 0.35], [0.53 + dx * 1.3, 1.52, 0.4], [0.53 + dx * 1.5, 1.44, 0.43]], [0.012, 0.009, 0.002], { radial: 5 }),
        { color: '#b3ada0', surface: 'bone', bones: ['handL'] });
    }
    // The lantern on its chain; its warmth catches the front of the robe from below.
    b.part(tube([[0.53, 1.62, 0.37], [0.53, 1.44, 0.38]], [0.008], { radial: 4 }), { color: '#3d352a', surface: 'metal', bones: ['chain'] });
    b.part(lathe([[0.012, 1.45], [0.045, 1.43], [0.08, 1.38], [0.09, 1.355]], { center: [0.53, 0, 0.38], closeTop: true, closeBottom: true, segments: 12 }),
      { color: '#3b3229', surface: 'metal', bones: ['lantern'] });
    b.part(lathe([[0.085, 1.16], [0.07, 1.13], [0.03, 1.115]], { center: [0.53, 0, 0.38], closeTop: true, closeBottom: true, segments: 12 }),
      { color: '#3b3229', surface: 'metal', bones: ['lantern'] });
    b.part(ellipsoid([0.53, 1.26, 0.38], [0.062, 0.095, 0.062]), { color: '#ffb257', surface: 'glow', glow: 0.85, bones: ['lantern'] });
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + 0.4, x = 0.53 + Math.cos(a) * 0.072, z = 0.38 + Math.sin(a) * 0.072;
      b.part(tube([[x, 1.36, z], [x, 1.16, z]], [0.006], { radial: 4 }), { color: '#2e271f', surface: 'metal', bones: ['lantern'] });
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    // It floats: no steps, a slow bob, a lean into its drift, and the robe trailing behind.
    r.pos('hips', 0, Math.sin(a.t * 1.15 + a.seed * 6) * 0.08 * (0.3 + 0.7 * a.life) + 0.12, 0);
    r.rot('spine', 0.18 * a.fwd * a.move + a.swayF * 0.2, 0, -0.22 * a.side * a.move - a.turn * 0.05);
    r.rot('tail1', 0.35 * a.fwd * a.move - a.swayF * 0.4 + Math.sin(a.t * 1.3) * 0.05, 0, 0.35 * a.side * a.move + a.swayS * 0.5);
    r.rot('tail2', 0.3 * a.fwd * a.move - a.swayF * 0.5 + Math.sin(a.t * 1.3 - 0.8) * 0.08, 0, 0.3 * a.side * a.move + a.swayS * 0.6);
    r.rot('tail3', 0.3 * a.fwd * a.move - a.swayF * 0.6 + Math.sin(a.t * 1.3 - 1.6) * 0.1, 0, 0.3 * a.side * a.move + a.swayS * 0.8);
    idleLife(a, 0.8);
    lookAt(a, 1, 0.8);
    blink(a, 6);
    r.rot('head', 0, 0, Math.sin(a.t * 0.5 + a.seed * 5) * 0.12 * a.life);
    // The lantern arm held out; the lantern swings like a pendulum and lags every move.
    r.rot('shoulderL', -0.55, 0, 0.15).rot('elbowL', -0.7);
    r.rot('lantern', -a.swayF * 1.6 + Math.sin(a.t * 1.7) * 0.08, 0, a.swayS * 1.6 + Math.sin(a.t * 1.3 + 1) * 0.06);
    r.rot('chain', -a.swayF * 0.6, 0, a.swayS * 0.6);
    r.rot('shoulderR', 0.05, 0, -0.08).rot('elbowR', -0.3);
    const p = a.progress;
    switch (a.pose) {
      case 'windup': {
        // The free hand rises palm-up and gathers an ember; the figure draws back from it.
        const c = smooth(0, 0.6, p);
        r.rot('shoulderR', -1.35 * c, 0, -0.25 * c).rot('elbowR', -0.8 * c).rot('handR', -0.6 * c);
        r.rot('spine', -0.14 * c, 0.3 * c).rot('head', 0.1 * c, -0.2 * c);
        break;
      }
      case 'strike': {
        // It throws the ember: the arm drives forward and opens.
        const hit = smooth(0, 0.3, p);
        r.rot('shoulderR', -1.35 - 0.3 * hit, 0, -0.25).rot('elbowR', -0.8 + 0.75 * hit).rot('handR', -0.6 + 0.8 * hit);
        r.rot('spine', -0.14 + 0.35 * hit, 0.3 - 0.45 * hit).rot('head', 0.15 * hit);
        break;
      }
      case 'stagger':
        r.rot('spine', -0.3 * bump(0, 1, p)).rot('tail1', -0.4 * bump(0, 1, p));
        break;
    }
  },
};

export const SPIRIT_DESIGNS = { goblin: BRAMBLE_GOBLIN, root: ROOTBOUND, hollow: ANTLERED_HOLLOW, wraith: LANTERN_WRAITH } as const;
export { mirror };
