import * as THREE from 'three';
import { fieldFlowerGeometry, petalGeometry } from './botany.ts';
import { UNLIT_KING, WARDEN_LOOK, buildRegal } from '../world/characters/bosses.ts';
import { ellipsoid, lathe, tube, type Body, type V3 } from '../world/rig/Body.ts';
import { Sculpt } from '../world/rig/Sculpt.ts';
import type { Design } from '../world/rig/Character.ts';
import { biped, blink, clamp, idleLife, lookAt, smooth, TAU, type Anim } from '../world/rig/Rig.ts';
import { glowTexture } from '../world/vfx.ts';

/**
 * THE CUTSCENE CAST
 * ─────────────────
 * Characters and props that only appear in the story: the caster's own hands, the Warden as he
 * was before he swallowed the light, the Bloomkin who come back when the wood is freed, and the
 * lantern-flowers, hanging lanterns and root throne the scenes are staged among.
 */

/* ═════════════════════════════ THE KINDLER'S HANDS ═════════════════════════════ */

const FINGERS = ['i', 'm', 'r', 'p'] as const;
/** Phalanx lengths (proximal, middle, distal) and base radius for each finger, in metres. */
const FINGER_SHAPE: Record<(typeof FINGERS)[number], { len: [number, number, number]; r: number; x: number; splay: number }> = {
  i: { len: [0.045, 0.026, 0.02], r: 0.0112, x: 0.168, splay: 0.08 },
  m: { len: [0.05, 0.03, 0.021], r: 0.0116, x: 0.146, splay: 0.01 },
  r: { len: [0.047, 0.028, 0.02], r: 0.0108, x: 0.125, splay: -0.06 },
  p: { len: [0.036, 0.021, 0.018], r: 0.0094, x: 0.106, splay: -0.14 },
};
const SKIN = '#d6a990', SKIN_DEEP = '#b5806a', NAIL = '#ecd0c2';

/**
 * Two forearms and hands seen from the caster's own eyes: the backs toward you, thumbs inward.
 * Plain human hands, nothing magical about them: each hand is one sculpted surface (palm, fingers
 * through three phalanges skinned to three bones, the thumb, nails), so it reads as a hand and not as
 * jointed pieces. The magic is in what they cast.
 */
export const KINDLER_HANDS: Design = {
  kind: 'hands', name: 'Your hands', height: 0.6, radius: 0.3, turnRate: 0, stride: 1, pace: 1,
  eye: '#ffd9a0', eyeAngry: '#ffffff', edge: '#ffe7a3', mist: 0,
  stiffness: { wristL: 10, wristR: 10 },
  build(b: Body) {
    b.bone('chest', 'root', [0, -0.75, 0]);
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R';
      const X = (x: number) => x * s;
      b.bone(`elbow${S}`, 'chest', [X(0.3), -0.56, 0.22]);
      b.bone(`wrist${S}`, `elbow${S}`, [X(0.17), -0.205, 0.46]);
      b.bone(`hand${S}`, `wrist${S}`, [X(0.145), -0.135, 0.5], [X(0.14), -0.07, 0.535]);
      // Forearm: oval in section, swelling with muscle toward the elbow, narrowing to the wrist.
      b.part(tube([[X(0.33), -0.64, 0.17], [X(0.29), -0.5, 0.25], [X(0.24), -0.38, 0.33], [X(0.2), -0.28, 0.41], [X(0.17), -0.205, 0.46], [X(0.152), -0.15, 0.497]], [0.05, 0.05, 0.043, 0.034, 0.03, 0.027], {
        radial: 16, segments: 30, flatten: { axis: [0, 0, 1], amount: 0.3 },
      }), { color: SKIN, shade: SKIN_DEEP, surface: 'skin', bones: [`elbow${S}`, `wrist${S}`] });
      // The hand is one sculpted surface, smoothly blended, so it reads as a hand and not as jointed
      // pieces: the wrist flowing out of the forearm, a squarish palm with the mound of the thumb and
      // the heel of the hand, knuckles, fingers growing from the palm, the thumb from its mound, nails.
      const h = new Sculpt();
      h.scale = b.scale;
      const skin = { color: SKIN, shade: SKIN_DEEP, surface: 'skin' as const };
      h.blob([X(0.185), -0.207, 0.454], [0.008, 0.009, 0.007], { ...skin, bones: [`wrist${S}`], blend: 0.005 });
      h.blob([X(0.157), -0.168, 0.488], [0.026, 0.031, 0.018], { ...skin, bones: [`wrist${S}`, `hand${S}`], blend: 0.012 }, [0.59, 0, 0]);
      h.box([X(0.138), -0.112, 0.515], [0.037, 0.047, 0.011], 0.01, { ...skin, bones: [`hand${S}`, `wrist${S}`], blend: 0.016 }, [0.38, 0, 0]);
      h.blob([X(0.118), -0.138, 0.523], [0.017, 0.026, 0.013], { ...skin, bones: [`hand${S}`, `t1${S}`], blend: 0.012 }, [0.38, 0, s * 0.35]);
      h.blob([X(0.163), -0.142, 0.522], [0.013, 0.024, 0.011], { ...skin, bones: [`hand${S}`], blend: 0.01 }, [0.38, 0, 0]);
      for (const f of FINGERS) {
        const shape = FINGER_SHAPE[f];
        const base = new THREE.Vector3(X(shape.x), -0.068, 0.53);
        const dir = new THREE.Vector3(-s * shape.splay * 0.6, 1, 0.35).normalize();
        const p1 = base.clone().addScaledVector(dir, shape.len[0]);
        const p2 = p1.clone().addScaledVector(dir, shape.len[1]);
        const p3 = p2.clone().addScaledVector(dir, shape.len[2]);
        const v = (q: THREE.Vector3): V3 => [q.x, q.y, q.z];
        b.bone(`${f}1${S}`, `hand${S}`, v(base));
        b.bone(`${f}2${S}`, `${f}1${S}`, v(p1));
        b.bone(`${f}3${S}`, `${f}2${S}`, v(p2), v(p3));
        // Each finger grows out of the palm and tapers to a rounded pad; past the knuckle it is not
        // blended with its neighbours, so the four stay four fingers.
        const r = shape.r * 0.84;
        const tip = p3.clone().addScaledVector(dir, -r * 0.55);
        h.cone(v(base.clone().addScaledVector(dir, -0.012)), v(p1), r * 1.04, r * 0.94, { ...skin, shade: '#dcae98', bones: [`${f}1${S}`, `${f}2${S}`], blend: 0.004 });
        h.cone(v(p1), v(p2), r * 0.94, r * 0.86, { ...skin, shade: '#dcae98', bones: [`${f}1${S}`, `${f}2${S}`, `${f}3${S}`], blend: 0 });
        h.cone(v(p2), v(tip), r * 0.86, r * 0.74, { ...skin, shade: '#dcae98', bones: [`${f}2${S}`, `${f}3${S}`], blend: 0 });
        // The nail, sunk almost flush with the back of the last joint: a colour, not a bump.
        const nail = p2.clone().lerp(p3, 0.6).add(new THREE.Vector3(0, 0, -r * 0.52));
        h.blob(v(nail), [r * 0.62, r * 0.82, r * 0.33], { color: NAIL, shade: '#f4ded2', surface: 'bone', bones: [`${f}3${S}`], blend: 0 }, [0.36, 0, 0]);
      }
      // The thumb: a metacarpal from the mound of the thumb, then two phalanges.
      const t0: V3 = [X(0.128), -0.158, 0.502], t1: V3 = [X(0.103), -0.118, 0.528], t2: V3 = [X(0.085), -0.09, 0.556], t3: V3 = [X(0.074), -0.066, 0.574];
      b.bone(`t1${S}`, `hand${S}`, t0);
      b.bone(`t2${S}`, `t1${S}`, t1);
      b.bone(`t3${S}`, `t2${S}`, t2, t3);
      h.cone(t0, t1, 0.0165, 0.0132, { ...skin, shade: '#dcae98', bones: [`t1${S}`, `hand${S}`], blend: 0.01 });
      h.cone(t1, t2, 0.0132, 0.012, { ...skin, shade: '#dcae98', bones: [`t1${S}`, `t2${S}`], blend: 0.0015 });
      h.cone(t2, [X(0.077), -0.072, 0.569], 0.012, 0.0095, { ...skin, shade: '#dcae98', bones: [`t2${S}`, `t3${S}`], blend: 0.0015 });
      h.blob([X(0.078), -0.072, 0.5625], [0.0066, 0.0082, 0.0035], { color: NAIL, shade: '#f4ded2', surface: 'bone', bones: [`t3${S}`], blend: 0 });
      b.sculpted(h, 0.0021);
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    // progress: 0 hands lowered out of sight … 1 raised before the eyes; strike = fingers opened wide.
    const raise = a.pose === 'idle' ? 0 : smooth(0, 1, a.progress);
    r.pos('chest', 0, -0.5 * (1 - raise), 0);
    const open = a.pose === 'strike' ? smooth(0, 0.6, a.progress) : 0;
    for (const S of ['L', 'R'] as const) {
      const s = S === 'L' ? 1 : -1;
      r.rot(`wrist${S}`, Math.sin(a.t * 1.3 + s) * 0.04, 0, s * Math.sin(a.t * 0.9) * 0.03);
      FINGERS.forEach((f, i) => {
        // A relaxed hand curls more toward the little finger; an open hand fans out.
        const rest = 0.38 + i * 0.07 + Math.sin(a.t * 0.8 + i * 0.5 + s) * 0.06;
        const curl = rest * (1 - open);
        r.rot(`${f}1${S}`, curl * 0.85, 0, s * (i - 1.5) * 0.07 * open);
        r.rot(`${f}2${S}`, curl * 1.15);
        r.rot(`${f}3${S}`, curl * 0.8);
      });
      r.rot(`t1${S}`, 0.15 * (1 - open), 0, s * 0.25 * open).rot(`t2${S}`, 0.25 * (1 - open)).rot(`t3${S}`, 0.3 * (1 - open));
    }
  },
};

/* ═════════════════════════════════ THE WARDEN ═════════════════════════════════ */

export const WARDEN: Design = {
  ...UNLIT_KING,
  kind: 'warden', name: 'The Warden', eye: '#ffe9b8', eyeAngry: '#ffffff', edge: '#fff2c8',
  build(b: Body) { buildRegal(b, WARDEN_LOOK); },
};

/* ═════════════════════════════════ BLOOMKIN ═════════════════════════════════ */

/** Round, soft and shy: what the wood's little creatures look like when the light comes home. */
/** The Bloomkin who come back in the ending, by fur and cap. */
export const BLOOMKIN_COATS: ReadonlyArray<readonly [string, string]> = [['#f3e9da', '#e05a4a'], ['#e8d6c0', '#f0a640'], ['#fff6ea', '#c86ad8'], ['#e2cdb6', '#5ab0e0'], ['#f7efe2', '#e05a4a']];
const BLOOMKIN = new Map<string, Design>();
/** One design per coat, made once, so each is baked once. */
export function bloomkin(fur: string, cap: string): Design {
  const key = `${fur}${cap}`;
  let d = BLOOMKIN.get(key);
  if (!d) BLOOMKIN.set(key, (d = makeBloomkin(fur, cap)));
  return d;
}
function makeBloomkin(fur: string, cap: string): Design {
  return {
    kind: 'bloomkin', name: 'Bloomkin', height: 0.6, radius: 0.25, turnRate: 9, stride: 0.6, pace: 1.6,
    eye: '#2a1a14', eyeAngry: '#2a1a14', edge: '#ffe7a3', mist: 0.05,
    stiffness: { earL: 6, earR: 6, ear2L: 4, ear2R: 4 },
    build(b: Body) {
      b.bone('hips', 'root', [0, 0.22, 0]).bone('chest', 'hips', [0, 0.32, 0.02]).bone('head', 'chest', [0, 0.4, 0.06], [0, 0.55, 0.08]).bone('eyes', 'head', [0, 0.43, 0.2])
        .pairBone('earL', 'head', [0.07, 0.52, 0.02]).pairBone('ear2L', 'earL', [0.13, 0.66, -0.05], [0.18, 0.74, -0.1])
        .pairBone('thighL', 'hips', [0.08, 0.16, 0]).pairBone('kneeL', 'thighL', [0.08, 0.08, 0.03]).pairBone('ankleL', 'kneeL', [0.08, 0.025, 0], [0.08, 0.01, 0.07]);
      b.part(ellipsoid([0, 0.3, 0], [0.19, 0.2, 0.18]), { color: fur, shade: '#c7b6a0', surface: 'fur', bones: ['hips', 'chest'] });
      b.part(ellipsoid([0, 0.43, 0.07], [0.14, 0.13, 0.13]), { color: fur, shade: '#d8c9b4', surface: 'fur', bones: ['head'] });
      b.part(ellipsoid([0, 0.33, 0.14], [0.11, 0.12, 0.06]), { color: '#fff6ea', surface: 'fur', bones: ['chest'] });
      for (const s of [1, -1]) {
        b.part(ellipsoid([0.055 * s, 0.445, 0.185], [0.028, 0.033, 0.018]), { color: '#1c120e', surface: 'dark', bones: ['eyes'] });
        b.part(ellipsoid([0.048 * s, 0.455, 0.2], [0.008, 0.008, 0.004]), { color: '#ffffff', surface: 'glow', glow: 0.8, bones: ['eyes'] });
        b.part(ellipsoid([0.085 * s, 0.41, 0.17], [0.022, 0.014, 0.01]), { color: '#ffb3c4', surface: 'skin', bones: ['head'] });
      }
      b.part(ellipsoid([0, 0.42, 0.2], [0.018, 0.013, 0.012]), { color: '#e88a9a', surface: 'skin', bones: ['head'] });
      b.pair(tube([[0.06, 0.51, 0.03], [0.13, 0.66, -0.05], [0.18, 0.75, -0.11]], [0.035, 0.04, 0.012], { radial: 9, flatten: { axis: [0, 0.3, 1], amount: 0.7 } }),
        { color: '#9fd36b', shade: '#5f9a3a', surface: 'leaf', bones: ['earL', 'ear2L', 'head'] });
      b.part(lathe([[0.01, 0.6], [0.07, 0.585], [0.1, 0.56], [0.09, 0.545], [0.02, 0.54]], { center: [0, 0, 0.05], closeTop: true, closeBottom: true, segments: 16 }),
        { color: cap, shade: '#ffffff', surface: 'skin', bones: ['head'] });
      for (const [x, z] of [[0.04, 0.09], [-0.05, 0.06], [0.0, 0.0]] as const) b.part(ellipsoid([x, 0.598, z + 0.02], [0.016, 0.006, 0.016]), { color: '#fff8ee', surface: 'skin', bones: ['head'] });
      b.pair(ellipsoid([0.08, 0.04, 0.03], [0.045, 0.035, 0.06]), { color: fur, surface: 'fur', bones: ['ankleL'] });
      b.part(ellipsoid([0, 0.28, -0.18], [0.06, 0.06, 0.05]), { color: '#fff6ea', surface: 'fur', bones: ['hips'] });
    },
    animate(a: Anim) {
      const r = a.rig;
      biped(a, { stride: 0.7, knee: 1, bob: 0.03, sway: 0.05, lean: 0.1, arm: 0, elbow: 0, run: 1 });
      // It travels in little hops.
      r.pos('hips', 0, Math.abs(Math.sin(a.phase * TAU * 2)) * 0.09 * a.move + Math.max(0, Math.sin(a.t * 3 + a.seed * 9)) ** 8 * 0.05 * (1 - a.move), 0);
      idleLife(a, 1.4);
      lookAt(a, 1, 1);
      blink(a, 2.8);
      r.rot('head', 0, 0, Math.sin(a.t * 1.7 + a.seed * 6) * 0.15);
      r.rotPair('ear', -a.swayF * 0.7 + Math.sin(a.t * 2 + a.seed) * 0.08, 0, a.swayS * 0.5);
      r.rotPair('ear2', 0.3 - a.swayF * 0.9 + Math.cos(a.phase * TAU * 2) * 0.15 * a.move);
    },
  };
}

/* ═════════════════════════════════ PROPS ═════════════════════════════════ */

function mesh(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: { emissive?: THREE.ColorRepresentation; rough?: number; metal?: number } = {}): THREE.Mesh {
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, emissive: o.emissive ?? '#000000' }));
}

/** A lantern-flower: a drooping stem with a bud of five petals that can open and shine. */
export function lanternFlower(height = 0.9): { group: THREE.Group; set(open: number, glow: number, time?: number): void } {
  const group = new THREE.Group();
  const stemPts: V3[] = [[0, 0, 0], [0.03, height * 0.5, 0.0], [0.08, height * 0.9, 0.06], [0.12, height, 0.14]];
  group.add(mesh(tube(stemPts, [0.018, 0.013, 0.009, 0.007], { radial: 8 }), '#3e5a32'));
  for (const s of [1, -1]) {
    const leaf = mesh(petalGeometry(0.24, 0.052, 0.055), '#47683a');
    (leaf.material as THREE.MeshStandardMaterial).vertexColors = true;
    leaf.position.set(0.015, height * (s > 0 ? 0.3 : 0.48), 0);
    leaf.rotation.set(0.3, s * 0.5, s * 1.08);
    group.add(leaf);
  }
  const head = new THREE.Group();
  head.position.set(0.12, height, 0.14);
  head.rotation.x = 0.35;
  group.add(head);
  const calyx = mesh(petalGeometry(0.08, 0.025, 0.018), '#586242');
  (calyx.material as THREE.MeshStandardMaterial).vertexColors = true;
  calyx.rotation.x = Math.PI;
  head.add(calyx);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.y = -0.06;
  head.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffcf7a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  halo.scale.setScalar(0.6);
  halo.position.y = -0.06;
  head.add(halo);
  const petals: THREE.Object3D[] = [];
  for (let i = 0; i < 5; i++) {
    const hinge = new THREE.Object3D();
    hinge.rotation.y = (i / 5) * TAU;
    const petal = mesh(petalGeometry(0.20 + (i % 2) * 0.025, 0.075, 0.075 + i * 0.003), '#c9b48d', { emissive: '#000000', rough: 1 });
    (petal.material as THREE.MeshStandardMaterial).vertexColors = true;
    hinge.add(petal);
    head.add(hinge);
    petals.push(hinge);
  }
  const petalMats = petals.map((h) => ((h.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial));
  const openedPaint = new THREE.Color('#ead9ad');
  return {
    group,
    set(open: number, glow: number, time = 0) {
      const o = clamp(open);
      for (let i = 0; i < petals.length; i++) {
        const unfurl = smooth(i * 0.025, 0.9 + i * 0.025, o);
        petals[i].children[0].rotation.x = Math.PI - 0.22 - unfurl * 1.9 + Math.sin(time * 1.4 - i * 0.7) * 0.025 * unfurl;
      }
      head.rotation.x = 0.35 - o * 0.3 + Math.sin(time * 0.8 + height * 3) * 0.035 * o;
      (core.material as THREE.MeshBasicMaterial).opacity = glow;
      halo.material.opacity = glow * 0.9;
      halo.scale.setScalar(0.4 + glow * 0.8);
      for (const m of petalMats) { m.emissive.set('#ffb35a').multiplyScalar(glow * 0.12); m.color.set('#95866b').lerp(openedPaint, clamp(glow)); }
    },
  };
}

/** A lantern hanging on a chain, swaying; `glow` 0..1. */
export function hangingLantern(chain = 2): { group: THREE.Group; pivot: THREE.Object3D; set(glow: number): void } {
  const group = new THREE.Group();
  const pivot = new THREE.Object3D();
  group.add(pivot);
  pivot.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, chain, 4).translate(0, -chain / 2, 0), '#2a241c', { metal: 0.6, rough: 0.5 }));
  const body = mesh(lathe([[0.02, -chain], [0.09, -chain - 0.04], [0.12, -chain - 0.14], [0.11, -chain - 0.3], [0.04, -chain - 0.36]], { segments: 10, closeTop: true, closeBottom: true }), '#3a3128', { metal: 0.5, rough: 0.5 });
  pivot.add(body);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffc36a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.y = -chain - 0.2;
  pivot.add(flame);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffb35a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.y = -chain - 0.2;
  pivot.add(halo);
  return {
    group, pivot,
    set(glow: number) { (flame.material as THREE.MeshBasicMaterial).opacity = glow; halo.material.opacity = glow * 0.8; halo.scale.setScalar(0.5 + glow); },
  };
}

/** A throne grown from roots. */
export function rootThrone(): THREE.Group {
  const group = new THREE.Group();
  const bark = '#2b2119';
  const add = (pts: V3[], r: number[]) => group.add(mesh(tube(pts, r, { radial: 9, wobble: 0.2 }), bark, { rough: 0.95 }));
  add([[-1.8, 0, 0.6], [-1.6, 1.4, 0.4], [-1.5, 3.0, 0.2], [-1.2, 5.5, -0.1], [-0.6, 7.5, -0.3]], [0.5, 0.42, 0.34, 0.22, 0.05]);
  add([[1.8, 0, 0.6], [1.6, 1.4, 0.4], [1.5, 3.0, 0.2], [1.2, 5.5, -0.1], [0.6, 7.5, -0.3]], [0.5, 0.42, 0.34, 0.22, 0.05]);
  add([[-1.6, 2.6, 0.9], [0, 2.4, 1.2], [1.6, 2.6, 0.9]], [0.35, 0.45, 0.35]);
  add([[-1.3, 0.2, -0.8], [-0.6, 3.5, -0.9], [0, 6.8, -1.0], [0.6, 3.5, -0.9], [1.3, 0.2, -0.8]], [0.4, 0.35, 0.3, 0.35, 0.4]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    add([[Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.4], [Math.cos(a) * 2.6, 0.12, Math.sin(a) * 2.3], [Math.cos(a) * 3.6, 0.02, Math.sin(a) * 3.2]], [0.3, 0.18, 0.04]);
  }
  return group;
}

/** A spread of small flowers that can bloom outward from a point. */
export function flowerField(center: THREE.Vector3, radius: number, count: number, ground: (x: number, z: number) => number): { mesh: THREE.InstancedMesh; set(t: number, time?: number): void } {
  const geometry = fieldFlowerGeometry();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, metalness: 0 });
  const im = new THREE.InstancedMesh(geometry, material, count);
  const palette = ['#ffd6f0', '#fff3a8', '#bfe8ff', '#ffb3c4', '#d8ffb0', '#ffffff', '#ffcf7a'].map((c) => new THREE.Color(c));
  const spots: Array<{ x: number; y: number; z: number; d: number; s: number; r: number }> = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * radius;
    const x = center.x + Math.cos(a) * d, z = center.z + Math.sin(a) * d;
    spots.push({ x, y: ground(x, z), z, d, s: 0.6 + Math.random() * 0.9, r: Math.random() * TAU });
    im.setColorAt(i, palette[i % palette.length]);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const sway = new THREE.Euler();
  const set = (t: number, time = 0) => {
    spots.forEach((s, i) => {
      const k = clamp((t * radius * 1.2 - s.d) / 3);
      p.set(s.x, s.y, s.z);
      sway.set(Math.sin(time * 1.2 + s.x * 0.3 + s.z * 0.2) * 0.08 * k, s.r, Math.sin(time * 0.9 + s.r) * 0.06 * k);
      q.setFromEuler(sway);
      sc.setScalar(Math.max(0.0001, k * s.s * 1.6));
      im.setMatrixAt(i, m.compose(p, q, sc));
    });
    im.instanceMatrix.needsUpdate = true;
  };
  set(0);
  im.frustumCulled = false;
  return { mesh: im, set };
}

/** Butterflies: little pairs of wings that flutter along wandering paths. */
export function butterflies(count: number, center: THREE.Vector3, spread: number): { group: THREE.Group; update(t: number): void } {
  const group = new THREE.Group();
  const flies: Array<{ g: THREE.Group; l: THREE.Mesh; r: THREE.Mesh; seed: number }> = [];
  const colors = ['#ffd6f0', '#fff3a8', '#bfe8ff', '#ffcf7a', '#d9b8ff'];
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide });
    const wing = new THREE.CircleGeometry(0.07, 8).translate(0.07, 0, 0);
    const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
    r.scale.x = -1;
    g.add(l, r);
    group.add(g);
    flies.push({ g, l, r, seed: Math.random() * 100 });
  }
  return {
    group,
    update(t: number) {
      for (const f of flies) {
        const s = f.seed;
        f.g.position.set(center.x + Math.sin(t * 0.3 + s) * spread + Math.sin(t * 1.1 + s * 2) * 0.6, center.y + 0.6 + Math.sin(t * 0.9 + s) * 0.5 + 0.8, center.z + Math.cos(t * 0.27 + s) * spread * 0.6);
        f.g.rotation.y = t * 0.4 + s;
        const flap = Math.sin(t * 18 + s) * 1.1;
        f.l.rotation.y = flap; f.r.rotation.y = -flap;
      }
    },
  };
}

export const SCENE_COLORS = { warm: new THREE.Color('#ffd9a0'), cold: new THREE.Color('#bfe3ff'), heart: new THREE.Color('#ffe7a3') };
