import * as THREE from 'three';
import { UNLIT_KING, WARDEN_LOOK, buildRegal } from '../world/characters/bosses.ts';
import { ellipsoid, lathe, tube, type Body, type V3 } from '../world/rig/Body.ts';
import type { Design } from '../world/rig/Character.ts';
import { biped, blink, clamp, idleLife, lookAt, smooth, TAU, type Anim } from '../world/rig/Rig.ts';

/**
 * THE CUTSCENE CAST
 * ─────────────────
 * Characters and props that only appear in the story: the caster's own hands, the Warden as he
 * was before he swallowed the light, the Bloomkin who come back when the wood is freed, and the
 * lantern-flowers, hanging lanterns and root throne the scenes are staged among.
 */

/* ═════════════════════════════ THE KINDLER'S HANDS ═════════════════════════════ */

const FINGERS = ['i', 'm', 'r', 'p'] as const;

/** Two forearms and hands seen from the caster's own eyes, veins of light under the skin. */
export const KINDLER_HANDS: Design = {
  kind: 'hands', name: 'Your hands', height: 0.6, radius: 0.3, turnRate: 0, stride: 1, pace: 1,
  eye: '#ffd9a0', eyeAngry: '#ffffff', edge: '#ffe7a3', mist: 0,
  stiffness: { wristL: 10, wristR: 10 },
  build(b: Body) {
    b.bone('chest', 'root', [0, -0.75, 0]);
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R';
      b.bone(`elbow${S}`, 'chest', [0.3 * s, -0.55, 0.22]);
      b.bone(`wrist${S}`, `elbow${S}`, [0.17 * s, -0.2, 0.46]);
      b.bone(`hand${S}`, `wrist${S}`, [0.15 * s, -0.13, 0.5], [0.13 * s, -0.03, 0.56]);
      FINGERS.forEach((f, i) => {
        const x = (0.16 - i * 0.022) * s, len = [0.07, 0.078, 0.072, 0.058][i];
        b.bone(`${f}1${S}`, `hand${S}`, [x, -0.07, 0.555]);
        b.bone(`${f}2${S}`, `${f}1${S}`, [x - 0.004 * s, -0.07 + len * 0.55, 0.585], [x - 0.008 * s, -0.07 + len, 0.6]);
      });
      b.bone(`t1${S}`, `hand${S}`, [0.105 * s, -0.12, 0.53]);
      b.bone(`t2${S}`, `t1${S}`, [0.075 * s, -0.085, 0.57], [0.06 * s, -0.06, 0.59]);
      // Forearm and the back of the hand.
      b.part(tube([[0.32 * s, -0.62, 0.18], [0.3 * s, -0.55, 0.22], [0.17 * s, -0.2, 0.46]], [0.052, 0.05, 0.034], { radial: 12, flatten: { axis: [0, 0, 1], amount: 0.25 } }),
        { color: '#d6ae95', shade: '#b98b72', surface: 'skin', bones: [`elbow${S}`, `wrist${S}`] });
      b.part(ellipsoid([0.15 * s, -0.11, 0.515], [0.045, 0.055, 0.02], { deform: (d, p) => { if (d.z < 0) p.z *= 0.6; } }),
        { color: '#d9b29a', shade: '#c09276', surface: 'skin', bones: [`wrist${S}`, `hand${S}`] });
      FINGERS.forEach((f, i) => {
        const x = (0.16 - i * 0.022) * s, len = [0.07, 0.078, 0.072, 0.058][i];
        b.part(tube([[x, -0.075, 0.553], [x - 0.004 * s, -0.07 + len * 0.55, 0.585], [x - 0.008 * s, -0.07 + len, 0.6]], [0.0105, 0.0095, 0.0075], { radial: 8 }),
          { color: '#dcb59d', shade: '#e8c4ae', surface: 'skin', bones: [`${f}1${S}`, `${f}2${S}`] });
      });
      b.part(tube([[0.12 * s, -0.13, 0.525], [0.075 * s, -0.085, 0.57], [0.058 * s, -0.058, 0.592]], [0.013, 0.011, 0.008], { radial: 8 }),
        { color: '#d9b29a', surface: 'skin', bones: [`t1${S}`, `t2${S}`] });
      // Veins of light from wrist to knuckles.
      for (const k of [0, 1, 2]) {
        const x = (0.14 - k * 0.018) * s;
        b.part(tube([[0.2 * s, -0.27, 0.44], [x, -0.13, 0.523], [x - 0.004 * s, -0.08, 0.545]], [0.0028, 0.0024, 0.0012], { radial: 4 }),
          { color: '#ffd39a', surface: 'glow', glow: 0.75, bones: [`wrist${S}`, `hand${S}`] });
      }
    }
  },
  animate(a: Anim) {
    const r = a.rig;
    // progress: 0 hands lowered out of sight … 1 raised before the eyes; strike = open and burning.
    const raise = a.pose === 'idle' ? 0 : smooth(0, 1, a.progress);
    r.pos('chest', 0, -0.5 * (1 - raise), 0);
    const open = a.pose === 'strike' ? smooth(0, 0.6, a.progress) : 0;
    for (const S of ['L', 'R'] as const) {
      const s = S === 'L' ? 1 : -1;
      r.rot(`wrist${S}`, Math.sin(a.t * 1.3 + s) * 0.04, 0, s * Math.sin(a.t * 0.9) * 0.03);
      FINGERS.forEach((f, i) => {
        const curl = (0.55 + Math.sin(a.t * 0.8 + i * 0.5 + s) * 0.12) * (1 - open);
        r.rot(`${f}1${S}`, curl * 0.9, 0, s * (i - 1.5) * 0.08 * open);
        r.rot(`${f}2${S}`, curl * 1.1);
      });
      r.rot(`t1${S}`, 0.2 * (1 - open), 0, s * 0.3 * open);
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
export function bloomkin(fur: string, cap: string): Design {
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
export function lanternFlower(height = 0.9): { group: THREE.Group; set(open: number, glow: number): void } {
  const group = new THREE.Group();
  const stemPts: V3[] = [[0, 0, 0], [0.03, height * 0.5, 0.0], [0.08, height * 0.9, 0.06], [0.12, height, 0.14]];
  group.add(mesh(tube(stemPts, [0.022, 0.016, 0.012, 0.01], { radial: 6 }), '#3e5a32'));
  for (const s of [1, -1]) {
    const leaf = mesh(ellipsoid([0.12 * s, height * 0.25, 0.02], [0.13, 0.012, 0.045]), '#47683a');
    leaf.rotation.z = s * 0.4;
    group.add(leaf);
  }
  const head = new THREE.Group();
  head.position.set(0.12, height, 0.14);
  head.rotation.x = 1.1;
  group.add(head);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffcf7a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  core.position.y = -0.06;
  head.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffcf7a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  halo.scale.setScalar(0.6);
  halo.position.y = -0.06;
  head.add(halo);
  const petals: THREE.Object3D[] = [];
  for (let i = 0; i < 5; i++) {
    const hinge = new THREE.Object3D();
    hinge.rotation.y = (i / 5) * TAU;
    const petal = mesh(ellipsoid([0, -0.07, 0.035], [0.035, 0.08, 0.012], { deform: (d, p) => { p.z += (1 - Math.abs(d.y)) * 0.01; } }), '#c9a46a', { emissive: '#000000' });
    hinge.add(petal);
    head.add(hinge);
    petals.push(hinge);
  }
  const petalMats = petals.map((h) => ((h.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial));
  return {
    group,
    set(open: number, glow: number) {
      const o = clamp(open);
      for (const h of petals) h.children[0].rotation.x = -0.15 - o * 1.25;
      head.rotation.x = 1.1 - o * 0.9;
      (core.material as THREE.MeshBasicMaterial).opacity = glow;
      halo.material.opacity = glow * 0.9;
      halo.scale.setScalar(0.4 + glow * 0.8);
      for (const m of petalMats) { m.emissive.set('#ffb35a').multiplyScalar(glow * 0.6); m.color.set(glow > 0.05 ? '#f0c98a' : '#7a6a4f'); }
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
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffb35a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
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
export function flowerField(center: THREE.Vector3, radius: number, count: number, ground: (x: number, z: number) => number): { mesh: THREE.InstancedMesh; set(t: number): void } {
  const geometry = new THREE.ConeGeometry(0.09, 0.08, 6, 1, true).rotateX(Math.PI).translate(0, 0.16, 0);
  const material = new THREE.MeshBasicMaterial({ vertexColors: false, side: THREE.DoubleSide });
  const im = new THREE.InstancedMesh(geometry, material, count);
  const palette = ['#ffd6f0', '#fff3a8', '#bfe8ff', '#ffb3c4', '#d8ffb0', '#ffffff', '#ffcf7a'].map((c) => new THREE.Color(c));
  const spots: Array<{ x: number; z: number; d: number; s: number; r: number }> = [];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * radius;
    spots.push({ x: center.x + Math.cos(a) * d, z: center.z + Math.sin(a) * d, d, s: 0.6 + Math.random() * 0.9, r: Math.random() * TAU });
    im.setColorAt(i, palette[i % palette.length]);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const set = (t: number) => {
    spots.forEach((s, i) => {
      const k = clamp((t * radius * 1.2 - s.d) / 3);
      p.set(s.x, ground(s.x, s.z), s.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.r);
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
