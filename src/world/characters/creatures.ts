import * as THREE from 'three';
import { ellipsoid, lathe, tube, type Body, type V3 } from '../rig/Body.ts';
import type { Design } from '../rig/Character.ts';
import { biped, blink, bump, clamp, idleLife, lookAt, smooth, TAU, type Anim } from '../rig/Rig.ts';

/**
 * NEW SPIRITS OF THE DEEPER WOOD
 * ──────────────────────────────
 * Mosslings (small, quick, many), Thornbacks (bramble boars that charge in straight lines) and
 * Gloom Moths (fliers that sway from side to side and dive). Plus the shared motion for bodies with
 * four legs, long coiling bodies, and wings.
 */

/** Four legs: a trot at walking pace (diagonal pairs), a bounding gallop when charging. */
export function quadruped(a: Anim, o: { stride: number; knee: number; bob: number; gallop?: number }): void {
  const r = a.rig, w = a.move * a.life, ph = a.phase * TAU, gal = o.gallop ?? 0;
  const legs: Array<[string, number]> = [['fL', 0], ['hR', 0], ['fR', Math.PI], ['hL', Math.PI]];
  for (const [leg, off] of legs) {
    // A gallop pairs the front legs and the hind legs instead of the diagonals.
    const offset = gal > 0.5 ? (leg[0] === 'f' ? 0 : Math.PI * 0.7) + (leg.endsWith('R') ? 0.35 : 0) : off;
    const phi = ph + offset;
    const swing = Math.sin(phi), lift = Math.max(0, Math.cos(phi));
    const front = leg[0] === 'f';
    const side = leg.slice(1);
    r.rot(`${leg[0]}thigh${side}`, (-swing * o.stride * a.fwd - lift * 0.3) * w, 0, swing * o.stride * 0.6 * a.side * w);
    r.rot(`${leg[0]}knee${side}`, (front ? -1 : 1) * lift * o.knee * w);
    r.rot(`${leg[0]}ankle${side}`, (front ? 1 : -1) * lift * o.knee * 0.6 * w);
  }
  r.pos('hips', 0, (Math.abs(Math.cos(ph)) - 0.5) * o.bob * w * (1 + gal), 0);
  r.rot('spine', Math.sin(ph * (gal > 0.5 ? 1 : 2)) * 0.05 * w * (1 + gal * 2), Math.sin(ph) * 0.06 * w, -a.turn * 0.05 + a.swayS * 0.15);
  r.rot('chest', -Math.sin(ph * (gal > 0.5 ? 1 : 2)) * 0.04 * w * (1 + gal * 2));
}

/** A long body: a travelling wave runs from head to tail, so it moves in S-curves, side to side. */
export function serpent(a: Anim, chain: readonly string[], amplitude: number, wavelength = 0.9): void {
  const ph = a.phase * TAU;
  const w = 0.25 + 0.75 * a.move;
  chain.forEach((bone, i) => {
    a.rig.rot(bone, 0, Math.sin(ph - i * wavelength) * amplitude * w * a.life + a.side * 0.05 * i * a.move, 0);
  });
}

/** Wings beat: a fast down-stroke, a slower recovery, the hind pair following a beat behind. */
export function flap(a: Anim, rate: number, lift: number, fold = 0): void {
  const t = a.t * rate;
  const beat = Math.sin(t) * 0.75 + Math.sin(t * 2) * 0.15;
  a.rig.rotPair('wing', 0, 0.12 * fold, (beat * lift + 0.15) * (1 - fold) - fold * 0.9);
  a.rig.rotPair('hwing', 0, 0.1 * fold, (Math.sin(t - 0.6) * 0.75 * lift + 0.05) * (1 - fold) - fold * 0.7);
}

/* ═════════════════════════════════ MOSSLING ═════════════════════════════════ */

export const MOSSLING: Design = {
  kind: 'mossling', name: 'Mossling', height: 0.85, radius: 0.32, turnRate: 9, stride: 0.75, pace: 2.4,
  eye: '#e6ff8a', eyeAngry: '#ff7a3a', edge: '#c6f08a', mist: 0.18,
  stiffness: { sprout: 6, sprout2: 4, jaw: 22 },
  coreBone: 'chest', castBone: 'chest',
  build(b: Body) {
    b.bone('hips', 'root', [0, 0.3, 0])
      .bone('spine', 'hips', [0, 0.4, 0])
      .bone('chest', 'spine', [0, 0.5, 0.02])
      .bone('head', 'chest', [0, 0.56, 0.04], [0, 0.75, 0.04])
      .bone('jaw', 'head', [0, 0.44, 0.16], [0, 0.4, 0.3])
      .bone('eyes', 'head', [0, 0.57, 0.27])
      .bone('sprout', 'head', [0, 0.76, -0.02])
      .bone('sprout2', 'sprout', [0, 0.92, 0.02], [0, 1.02, 0.08])
      .pairBone('shoulderL', 'chest', [0.24, 0.48, 0.04])
      .pairBone('elbowL', 'shoulderL', [0.33, 0.38, 0.1])
      .pairBone('handL', 'elbowL', [0.36, 0.3, 0.16], [0.37, 0.24, 0.2])
      .pairBone('thighL', 'hips', [0.12, 0.24, 0])
      .pairBone('kneeL', 'thighL', [0.13, 0.14, 0.03])
      .pairBone('ankleL', 'kneeL', [0.13, 0.05, 0])
      .pairBone('toeL', 'ankleL', [0.13, 0.02, 0.08], [0.13, 0.02, 0.12]);
    // One round mossy body that is also its head.
    b.part(ellipsoid([0, 0.5, 0], [0.3, 0.29, 0.28], { deform: (d, p) => p.multiplyScalar(1 + Math.sin(d.x * 13 + d.y * 9) * 0.04 + Math.sin(d.z * 17) * 0.03) }),
      { color: '#5f7a3a', shade: '#2f401f', surface: 'moss', bones: ['chest', 'spine', 'head', 'hips'] });
    // A wide mouth with little pale teeth, and two bright eyes.
    b.part(ellipsoid([0, 0.45, 0.22], [0.15, 0.05, 0.08]), { color: '#170d08', surface: 'dark', bones: ['jaw', 'head'] });
    for (let i = 0; i < 5; i++) {
      const x = -0.1 + i * 0.05;
      b.part(tube([[x, 0.475, 0.27 - Math.abs(x) * 0.3], [x, 0.445, 0.28 - Math.abs(x) * 0.3]], [0.012, 0.002], { radial: 5 }), { color: '#efe6cc', surface: 'bone', bones: ['head'] });
    }
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.09 * s, 0.57, 0.24], [0.06, 0.06, 0.045]), { color: '#0f0b07', surface: 'dark', bones: ['head'] });
      b.part(ellipsoid([0.09 * s, 0.57, 0.27], [0.04, 0.042, 0.02]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
    }
    // A sprout of two leaves and a crooked mushroom on its back.
    b.part(tube([[0, 0.75, -0.02], [0, 0.9, 0.0], [0.02, 1.0, 0.06]], [0.016, 0.012, 0.008], { radial: 5 }), { color: '#6f8a3c', surface: 'leaf', bones: ['sprout', 'sprout2'] });
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.07 * s, 0.98, 0.07], [0.08, 0.012, 0.04], { deform: (d, p) => { p.y += Math.abs(d.x) * 0.03; } }),
        { color: '#86a548', shade: '#4f6b28', surface: 'leaf', bones: ['sprout2'] });
    }
    b.part(tube([[-0.12, 0.66, -0.18], [-0.16, 0.76, -0.22]], [0.025, 0.02], { radial: 6 }), { color: '#d9ccb0', surface: 'skin', bones: ['chest'] });
    b.part(lathe([[0.01, 0.84], [0.08, 0.8], [0.1, 0.76], [0.02, 0.75]], { center: [-0.165, 0, -0.225], closeTop: true, segments: 14 }),
      { color: '#a8452e', shade: '#6e2a1b', surface: 'skin', bones: ['chest'] });
    // Twig arms, stubby legs.
    b.pair(tube([[0.22, 0.48, 0.04], [0.33, 0.38, 0.1], [0.37, 0.27, 0.18]], [0.03, 0.022, 0.012], { radial: 6, wobble: 0.2 }),
      { color: '#4a3826', surface: 'bark', bones: ['shoulderL', 'elbowL', 'handL'] });
    b.pair(tube([[0.12, 0.28, 0], [0.13, 0.14, 0.03], [0.13, 0.04, 0.04]], [0.05, 0.04, 0.035], { radial: 8 }),
      { color: '#4d6531', shade: '#2d3d1c', surface: 'moss', bones: ['thighL', 'kneeL', 'ankleL'] });
    b.pair(ellipsoid([0.13, 0.03, 0.05], [0.045, 0.03, 0.065]), { color: '#3b2a1d', surface: 'bark', bones: ['ankleL', 'toeL'] });
  },
  animate(a: Anim) {
    const r = a.rig;
    biped(a, { stride: 0.8, knee: 1.1, bob: 0.07, sway: 0.12, lean: 0.15, arm: 0.9, elbow: -0.6, run: clamp(a.speed / 2.5) });
    // Scurrying hops.
    r.pos('hips', 0, Math.abs(Math.sin(a.phase * TAU * 2)) * 0.05 * a.move, 0);
    idleLife(a, 1.5);
    lookAt(a, 1, 1.2);
    blink(a, 2.6);
    r.rot('sprout', -a.swayF * 0.8 + Math.sin(a.t * 2.4 + a.seed * 9) * 0.1, 0, a.swayS * 0.8);
    r.rot('sprout2', -a.swayF * 1.1 + Math.sin(a.t * 2.4 + a.seed * 9 - 0.7) * 0.15, 0, a.swayS);
    r.rot('jaw', 0.06 + Math.max(0, Math.sin(a.t * 5 + a.seed * 3)) * 0.06);
    const p = a.progress;
    if (a.pose === 'windup') {
      const c = smooth(0, 0.7, p);
      r.pos('hips', 0, -0.08 * c, -0.06 * c).rotPair('thigh', -0.6 * c).rotPair('knee', 1.1 * c).rot('jaw', 0.4 * c).rotPair('shoulder', -0.8 * c, 0, 0.5 * c);
    } else if (a.pose === 'strike') {
      const leap = bump(0, 0.8, p);
      r.pos('hips', 0, 0.3 * leap, 0.5 * leap).rot('jaw', 0.5 * (1 - smooth(0.3, 0.6, p))).rotPair('shoulder', -1.6 * leap);
    } else if (a.pose === 'stagger') {
      r.pos('hips', 0, 0, -0.15 * bump(0, 1, p)).rot('spine', -0.4 * bump(0, 1, p));
    }
  },
};

/* ═════════════════════════════════ THORNBACK ═════════════════════════════════ */

const HIDE = '#4c3727', HIDE_DARK = '#261a12';

export const THORNBACK: Design = {
  kind: 'thornback', name: 'Thornback', height: 1.75, radius: 0.85, turnRate: 3.2, stride: 1.9, pace: 1.3,
  eye: '#ff9a4a', eyeAngry: '#ff3b1f', edge: '#ffa04a', mist: 0.35,
  stiffness: { tail: 5, jaw: 18, head: 14 },
  coreBone: 'spine', castBone: 'head',
  build(b: Body) {
    b.bone('hips', 'root', [0, 0.92, -0.55])
      .bone('spine', 'hips', [0, 1.0, 0])
      .bone('chest', 'spine', [0, 1.02, 0.5])
      .bone('neck', 'chest', [0, 0.98, 0.85])
      .bone('head', 'neck', [0, 0.88, 1.08], [0, 0.72, 1.55])
      .bone('jaw', 'head', [0, 0.78, 1.15], [0, 0.66, 1.5])
      .bone('eyes', 'head', [0, 0.98, 1.3])
      .bone('tail', 'hips', [0, 1.0, -0.98], [0, 0.85, -1.25])
      .pairBone('fthighL', 'chest', [0.3, 0.9, 0.62])
      .pairBone('fkneeL', 'fthighL', [0.32, 0.48, 0.66])
      .pairBone('fankleL', 'fkneeL', [0.32, 0.12, 0.62], [0.32, 0.02, 0.68])
      .pairBone('hthighL', 'hips', [0.3, 0.92, -0.62])
      .pairBone('hkneeL', 'hthighL', [0.32, 0.5, -0.72])
      .pairBone('hankleL', 'hkneeL', [0.32, 0.12, -0.62], [0.32, 0.02, -0.58]);
    // A heavy barrel of a body, high at the shoulders.
    b.part(ellipsoid([0, 1.0, 0.0], [0.5, 0.48, 0.95], {
      deform: (d, p) => { if (d.z > 0) p.y += 0.12 * d.z * Math.max(0, d.y); p.x *= 1 + 0.08 * d.z; },
    }), { color: HIDE, shade: HIDE_DARK, surface: 'fur', bones: ['hips', 'spine', 'chest', 'neck'] });
    // Head: a long snout, a disc of a nose, small burning eyes, tusks that curl up.
    b.part(tube([[0, 0.98, 0.78], [0, 0.92, 1.08], [0, 0.82, 1.38], [0, 0.74, 1.6]], [0.32, 0.27, 0.18, 0.13], { radial: 14 }),
      { color: HIDE, shade: '#3a2a1e', surface: 'fur', bones: ['neck', 'head'] });
    b.part(ellipsoid([0, 0.74, 1.66], [0.13, 0.11, 0.05]), { color: '#5a3b33', shade: '#2e1d18', surface: 'skin', bones: ['head'] });
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.04 * s, 0.75, 1.705], [0.025, 0.03, 0.01]), { color: '#120b08', surface: 'dark', bones: ['head'] });
      b.part(ellipsoid([0.16 * s, 0.98, 1.3], [0.04, 0.03, 0.03]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
      b.part(tube([[0.12 * s, 0.72, 1.45], [0.22 * s, 0.76, 1.55], [0.26 * s, 0.9, 1.58], [0.22 * s, 1.0, 1.52]], [0.04, 0.032, 0.02, 0.003], { radial: 7 }),
        { color: '#e3d6b8', shade: '#a2906c', surface: 'bone', bones: ['jaw'] });
      b.part(tube([[0.18 * s, 1.12, 1.0], [0.28 * s, 1.26, 0.92], [0.3 * s, 1.34, 0.86]], [0.07, 0.05, 0.005], { radial: 8, flatten: { axis: [0, 0, 1], amount: 0.7 } }),
        { color: HIDE, shade: '#6a4a3a', surface: 'skin', bones: ['head'] });
    }
    b.part(ellipsoid([0, 0.7, 1.32], [0.17, 0.08, 0.28]), { color: '#3c2a1e', surface: 'fur', bones: ['jaw'] });
    // Bramble spines down the whole back.
    for (let i = 0; i < 26; i++) {
      const u = i / 25, z = 0.9 - u * 1.8, x = Math.sin(i * 2.39) * 0.32, y = 1.0 + Math.sqrt(Math.max(0, 1 - (x / 0.5) ** 2)) * 0.46 * (1 - Math.abs(z) * 0.25);
      const len = 0.28 + (i % 3) * 0.1 + Math.sin(u * Math.PI) * 0.12;
      b.part(tube([[x, y - 0.06, z], [x * 1.25, y + len * 0.6, z - 0.12], [x * 1.4, y + len, z - 0.3]], [0.045, 0.022, 0.002], { radial: 6, wobble: 0.2 }),
        { color: '#2e2219', shade: '#a28d68', surface: 'bark', bones: [z > 0.3 ? 'chest' : z < -0.3 ? 'hips' : 'spine'] });
    }
    b.part(tube([[0, 1.02, -0.95], [0, 0.94, -1.12], [0, 0.82, -1.22]], [0.05, 0.035, 0.008], { radial: 6 }), { color: HIDE, surface: 'fur', bones: ['tail'] });
    // Legs and hooves.
    for (const leg of ['f', 'h'] as const) {
      const z = leg === 'f' ? 0.62 : -0.62, k = leg === 'f' ? 0.66 : -0.72;
      b.pair(tube([[0.3, 1.0, z], [0.32, 0.48, k], [0.32, 0.12, z]], [0.17, 0.09, 0.07], { radial: 10 }),
        { color: HIDE, shade: HIDE_DARK, surface: 'fur', bones: [`${leg}thighL`, `${leg}kneeL`, `${leg}ankleL`, leg === 'f' ? 'chest' : 'hips'] });
      b.pair(ellipsoid([0.32, 0.05, z + 0.03], [0.075, 0.06, 0.09]), { color: '#1d1611', surface: 'chitin', bones: [`${leg}ankleL`] });
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    const charging = a.pose === 'strike' && a.attack !== 'rake';
    quadruped(a, { stride: charging ? 0.85 : 0.45, knee: 0.8, bob: 0.06, gallop: charging ? 1 : clamp((a.speed - 2.5) / 3) });
    idleLife(a, 0.8);
    lookAt(a, 0.5, 0.6);
    blink(a, 5);
    r.rot('tail', Math.sin(a.t * 3) * 0.2, Math.sin(a.t * 2.1) * 0.3);
    r.rot('head', Math.sin(a.t * 1.7 + a.seed) * 0.04 * a.life);
    const p = a.progress;
    if (a.pose === 'windup') {
      // Pawing the ground with a front hoof, head down, snorting.
      const c = smooth(0, 0.5, p), paw = Math.max(0, Math.sin(a.age * 9));
      r.rot('neck', 0.25 * c).rot('head', 0.3 * c).rot('fthighR', -0.5 * paw * c).rot('fkneeR', -0.8 * paw * c).pos('hips', 0, 0.05 * c, 0);
      r.rot('spine', -0.06 * c);
    } else if (charging) {
      r.rot('neck', 0.35).rot('head', 0.35).rot('jaw', 0.1);
    } else if (a.pose === 'recover') {
      r.rot('head', 0, 0, Math.sin(a.age * 14) * 0.25 * (1 - smooth(0, 0.5, p)));
    } else if (a.pose === 'stagger') {
      r.rot('neck', -0.3 * bump(0, 1, p)).pos('hips', 0, 0, -0.2 * bump(0, 1, p));
    }
  },
};

/* ═════════════════════════════════ GLOOM MOTH ═════════════════════════════════ */

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const FUR = '#8a8070', FUR_DARK = '#4a4238', WING = '#6e6455', WING_DARK = '#2e2a24';

/** A moth wing, built flat along +X from its root, scalloped at the edge. */
export function mothWing(root: V3, span: number, chord: number, droop: number, fore: boolean, pitch = -0.95): THREE.BufferGeometry {
  const g = ellipsoid([root[0] + span * 0.5, root[1] - droop * 0.5, root[2] + (fore ? chord * 0.15 : -chord * 0.35)], [span * 0.5, 0.012, chord * 0.5], {
    widthSegments: 26, heightSegments: 10,
    deform: (d, p) => {
      // Root narrow, tip wide and scalloped; the fore wing sweeps forward, the hind wing hangs.
      const t = (d.x + 1) / 2;
      p.z *= 0.45 + 0.75 * Math.sin(t * Math.PI * 0.85 + 0.25);
      p.z += Math.sin(d.z * 3 + t * 14) * 0.03 * t * Math.abs(d.z);
      p.y -= droop * t * t;
      if (fore) p.z += t * t * chord * 0.25;
    },
  });
  // Held open toward the viewer: pitched about the wing root so its face (and its eyes) show.
  return pitchAbout(g, root, pitch);
}

/** Rotate a geometry about the X axis through a point. */
export function pitchAbout(g: THREE.BufferGeometry, at: V3, angle: number): THREE.BufferGeometry {
  g.translate(-at[0], -at[1], -at[2]).rotateX(angle).translate(at[0], at[1], at[2]);
  g.computeVertexNormals();
  return g;
}

export const GLOOM_MOTH: Design = {
  kind: 'moth', name: 'Gloom Moth', height: 1.3, radius: 0.7, turnRate: 4, stride: 2, pace: 2.2,
  eye: '#c9a6ff', eyeAngry: '#ff6ad5', edge: '#d6c2ff', mist: 0,
  stiffness: { wingL: 30, wingR: 30, hwingL: 26, hwingR: 26, antL: 6, antR: 6, ant2L: 4, ant2R: 4, abd2: 6 },
  coreBone: 'chest', castBone: 'head',
  build(b: Body) {
    b.bone('hips', 'root', [0, 0.6, 0])
      .bone('chest', 'hips', [0, 0.62, 0.1])
      .bone('head', 'chest', [0, 0.66, 0.34], [0, 0.66, 0.5])
      .bone('eyes', 'head', [0, 0.68, 0.46])
      .bone('abd1', 'hips', [0, 0.56, -0.18])
      .bone('abd2', 'abd1', [0, 0.5, -0.45], [0, 0.44, -0.7])
      .pairBone('antL', 'head', [0.05, 0.75, 0.43])
      .pairBone('ant2L', 'antL', [0.2, 0.92, 0.55], [0.32, 1.02, 0.6])
      .pairBone('wingL', 'chest', [0.1, 0.7, 0.14], [1.2, 0.8, 0.2])
      .pairBone('hwingL', 'chest', [0.09, 0.62, 0.0], [0.85, 0.48, -0.35]);
    b.part(ellipsoid([0, 0.63, 0.12], [0.17, 0.16, 0.22]), { color: FUR, shade: FUR_DARK, surface: 'fur', bones: ['chest', 'hips'] });
    b.part(tube([[0, 0.6, -0.05], [0, 0.55, -0.3], [0, 0.49, -0.55], [0, 0.45, -0.72]], [0.15, 0.14, 0.1, 0.03], { radial: 12 }),
      { color: FUR, shade: '#3a332b', surface: 'fur', bones: ['hips', 'abd1', 'abd2'] });
    for (let i = 0; i < 4; i++) {
      const z = -0.12 - i * 0.15;
      b.part(tube([[0.14, 0.59 - i * 0.025, z], [0, 0.66 - i * 0.03, z], [-0.14, 0.59 - i * 0.025, z]], [0.02, 0.03, 0.02], { radial: 6 }),
        { color: '#b4a994', surface: 'fur', bones: [i < 2 ? 'abd1' : 'abd2'] });
    }
    b.part(ellipsoid([0, 0.66, 0.38], [0.12, 0.11, 0.1]), { color: FUR, shade: FUR_DARK, surface: 'fur', bones: ['head'] });
    for (const s of [1, -1]) {
      b.part(ellipsoid([0.075 * s, 0.68, 0.43], [0.055, 0.06, 0.05]), { color: '#ffffff', surface: 'glow', glow: 1, bones: ['eyes'] });
      // Feathered antennae.
      b.part(tube([[0.04 * s, 0.74, 0.42], [0.18 * s, 0.9, 0.54], [0.32 * s, 1.02, 0.6]], [0.008, 0.006, 0.003], { radial: 4 }), { color: '#3a332b', surface: 'fur', bones: [s > 0 ? 'antL' : 'antR', s > 0 ? 'ant2L' : 'ant2R'] });
      b.part(ellipsoid([0.2 * s, 0.9, 0.53], [0.12, 0.012, 0.045], { deform: (_d, p) => p.applyAxisAngle(Z_AXIS, 0.85 * s) }),
        { color: '#7a6d5a', surface: 'wing', bones: [s > 0 ? 'ant2L' : 'ant2R'] });
      // Six thin legs held up under the body.
      for (let k = 0; k < 3; k++) {
        const z = 0.18 - k * 0.12;
        b.part(tube([[0.08 * s, 0.56, z], [0.22 * s, 0.5, z + 0.04], [0.26 * s, 0.36, z + 0.1]], [0.012, 0.009, 0.003], { radial: 4 }), { color: '#2e2822', surface: 'chitin', bones: ['chest'] });
      }
    }
    // Wings: dusty, veined, with an eye on each fore wing that stares back.
    b.pair(mothWing([0.1, 0.7, 0.14], 1.25, 0.7, 0.05, true), { color: WING, shade: WING_DARK, surface: 'wing', bones: ['wingL'] });
    b.pair(mothWing([0.09, 0.62, 0.0], 0.85, 0.55, 0.18, false), { color: '#5d5446', shade: WING_DARK, surface: 'wing', bones: ['hwingL'] });
    const spot = (r: V3, y: number) => pitchAbout(ellipsoid([0.78, y, 0.26], r), [0.1, 0.7, 0.14], -0.95);
    b.pair(spot([0.16, 0.012, 0.13], 0.727), { color: '#1a1714', surface: 'wing', bones: ['wingL'] });
    b.pair(spot([0.1, 0.012, 0.08], 0.733), { color: '#c8b896', surface: 'wing', bones: ['wingL'] });
    b.pair(spot([0.04, 0.012, 0.035], 0.739), { color: '#bba0ff', surface: 'glow', glow: 0.55, bones: ['wingL'] });
  },
  animate(a: Anim) {
    const r = a.rig;
    const diving = a.pose === 'strike';
    flap(a, diving ? 6 : a.pose === 'windup' ? 20 : 14, diving ? 0.25 : 0.85, diving ? 0.7 : 0);
    // It bobs on every wingbeat and banks into its sideways drift.
    const beat = Math.sin(a.t * 14);
    r.pos('hips', 0, beat * 0.05, 0).rot('hips', -0.25 * a.fwd * a.move, 0, -0.45 * a.side * a.move - a.turn * 0.1);
    r.rot('abd1', 0.1 + Math.sin(a.t * 2 + a.seed * 4) * 0.08 + a.swayF * 0.4).rot('abd2', 0.12 + Math.sin(a.t * 2 + a.seed * 4 - 0.6) * 0.1 + a.swayF * 0.5);
    r.rotPair('ant', -0.1 + Math.sin(a.t * 3.1) * 0.06 - a.swayF * 0.4, 0, Math.sin(a.t * 2.3) * 0.08);
    r.rotPair('ant2', Math.sin(a.t * 3.1 - 0.5) * 0.1 - a.swayF * 0.5);
    lookAt(a, 0.6, 0.8);
    blink(a, 99);
    const p = a.progress;
    if (a.pose === 'windup') r.pos('hips', 0, 0.35 * smooth(0, 1, p), -0.2 * smooth(0, 1, p)).rot('hips', -0.5 * smooth(0, 1, p));
    else if (diving) r.rot('hips', 0.6 * bump(0, 1, p)).rotPair('ant', 0.6 * bump(0, 1, p));
    else if (a.pose === 'stagger') r.rot('hips', -0.4 * bump(0, 1, p), 0, 0.8 * bump(0, 1, p));
  },
};

export const CREATURE_DESIGNS = { mossling: MOSSLING, thornback: THORNBACK, moth: GLOOM_MOTH } as const;
