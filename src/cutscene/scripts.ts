import * as THREE from 'three';
import { BRAMBLE_GOBLIN, LANTERN_WRAITH } from '../world/characters/spirits.ts';
import { GLOOM_MOTH } from '../world/characters/creatures.ts';
import { GRAEL, LANTERN_WIDOW, MOTH_MATRON, UNLIT_KING } from '../world/characters/bosses.ts';
import { GNOME_DESIGNS } from '../world/GnomeSummons.ts';
import type { Character } from '../world/rig/Character.ts';
import { bump, smooth, TAU, type Anim } from '../world/rig/Rig.ts';
import { terrainHeight } from '../world/spatial.ts';
import { glowSprite } from '../world/vfx.ts';
import { bloomkin, BLOOMKIN_COATS, butterflies, flowerField, hangingLantern, KINDLER_HANDS, lanternFlower, rootThrone, WARDEN } from './cast.ts';
import type { CameraKey, Script, Shot, V3 } from './Cutscene.ts';

/**
 * THE STORY, IN SCENES
 * ────────────────────
 * You wake in the Hushwood not knowing how you came there or what is behind its silence. A gnome
 * called Tuck finds you. The Moth Matron, Grael the Rootwarden and the Lantern Widow each hoard the
 * wood's stolen lights, and each gives them up when they fall. Visions tell of the Warden, who loved
 * the wood so much he swallowed every light to keep it safe, and became the Unlit King. At the end,
 * you learn what you are: the last light the wood had, made into a pair of hands.
 */

/** A point at a height above the ground. */
const G = (x: number, y: number, z: number): V3 => [x, terrainHeight(x, z) + y, z];
const v = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);
const GAME_VIEW: CameraKey = { t: 0, p: G(0, 1.85, 17), l: [0, 1.2, -12], fov: 64 };

/** Attach the caster's hands to the camera. */
function hands(s: Shot): Character {
  const h = s.actor('hands', KINDLER_HANDS, 0, 0, Math.PI, 0, 0.4);
  h.group.removeFromParent();
  s.camera.add(h.group);
  h.group.position.set(0, 0, 0);
  h.group.rotation.set(0, Math.PI, 0);
  s.onDispose(() => h.group.removeFromParent());
  return h;
}

/** A pair of eyes glinting in the dark, which blink and vanish. */
function watcher(s: Shot, at: THREE.Vector3, color = '#d8f27a'): { set(open: number): void } {
  const l = glowSprite(color, 0.12, undefined, 0), r = glowSprite(color, 0.12, undefined, 0);
  l.position.copy(at).add(new THREE.Vector3(-0.07, 0, 0));
  r.position.copy(at).add(new THREE.Vector3(0.07, 0, 0));
  s.add(l); s.add(r);
  return { set(open: number) { l.material.opacity = r.material.opacity = open; l.scale.set(0.12, 0.12 * Math.max(0.1, open), 1); r.scale.copy(l.scale); } };
}

const wave = (side: 'L' | 'R', amount: number) => (a: Anim) => {
  a.rig.rot(`shoulder${side}`, -2.5 * amount, 0, (side === 'L' ? 1 : -1) * 0.5 * amount).rot(`elbow${side}`, (-0.4 + Math.sin(a.t * 14) * 0.45) * amount);
};

/* ═══════════════════════════════════ INTRO ═══════════════════════════════════ */

const INTRO: Script = {
  id: 'intro', region: 'edge', duration: 29, mood: 'edge', fadeIn: 3.5,
  camera: [
    { t: 0, p: G(0.5, 0.35, 15.2), l: G(1.2, 9, 6), fov: 58 },
    { t: 6, p: G(0.4, 0.45, 15.3), l: G(0.8, 7, 4), fov: 56, ease: 'linear' },
    { t: 10.5, p: G(0.3, 1.05, 15.8), l: G(0, 0.6, 14.4), fov: 54 },
    { t: 15, p: G(0.1, 1.85, 16.6), l: G(1.5, 1.5, -2), fov: 56 },
    { t: 22, p: G(0, 1.85, 16), l: G(4, 2.2, -10), fov: 58 },
    { ...GAME_VIEW, t: 29 },
  ],
  lines: [
    { at: 2.8, until: 6.6, text: '…you’re awake.', kind: 'whisper' },
    { at: 8, until: 12.6, text: 'Don’t ask how you came in. The wood doesn’t remember either.', kind: 'whisper' },
    { at: 14.2, until: 18.4, text: 'Something is coming through the trees.', kind: 'whisper' },
    { at: 21.5, until: 26.5, text: 'Raise your hands.', kind: 'whisper' },
  ],
  build(s) {
    hands(s);
    s.actor('goblin', BRAMBLE_GOBLIN, -16, -6, Math.PI / 2, 0, 0.2);
    s.actor('wraith', LANTERN_WRAITH, 10, -24, -0.4, 0, 0.6);
    const lumen = s.lumen('#ffd9a0', 0.3);
    const eyes = [v(G(-5, 0.6, 6)), v(G(6.5, 0.9, 2)), v(G(-9, 1.4, -4)), v(G(3, 0.5, -1)), v(G(11, 1.1, 0))].map((p, i) => watcher(s, p, i % 2 ? '#d8f27a' : '#ffcf7a'));
    (s as Shot & { intro?: unknown }).intro = { lumen, eyes };
  },
  tick(s, t) {
    const { lumen, eyes } = (s as Shot & { intro: { lumen: ReturnType<Shot['lumen']>; eyes: Array<{ set(o: number): void }> } }).intro;
    // Looking at your own hands for the first time.
    if (t < 7) s.act('hands', 'idle');
    else if (t < 10.5) s.act('hands', 'windup', smooth(7, 10, t));
    else if (t < 14) s.act('hands', 'strike', smooth(10.5, 12.5, t));
    else s.act('hands', 'windup', 1 - smooth(14, 16, t));
    // A small light hangs in the air, then drifts away toward the clearing, leading you.
    const lp = t < 9 ? v(G(0.6 + Math.sin(t * 0.7) * 0.4, 1.4 + Math.sin(t * 1.3) * 0.2, 13.6)) : v(G(0.6, 1.4, 13.6)).lerp(v(G(2, 2.2, -8)), smooth(9, 20, t));
    lumen.place(lp);
    lumen.sprite.material.opacity = smooth(1.5, 3.5, t) * (1 - smooth(22, 25, t));
    // Something crosses the wood, side-on, stops to look at you, and moves on.
    if (t < 15.5) s.travel('goblin', [-16, -6], [-3, -8], 11.5, 15.5);
    else if (t < 18.5) { s.act('goblin', 'idle'); s.face('goblin', Math.atan2(0 - -3, 17 - -8)); }
    else s.travel('goblin', [-3, -8], [14, -12], 18.5, 23.5);
    s.travel('wraith', [10, -24], [3, -26], 16, 28);
    eyes.forEach((e, i) => e.set(bump(13 + i * 1.6, 20 + i * 1.2, t) * (Math.sin(t * 3 + i) > -0.92 ? 1 : 0)));
  },
};

/* ═══════════════════════════════════ TUCK ═══════════════════════════════════ */

const TUCK_AT: [number, number] = [0.4, 12.6];
const TUCK: Script = {
  id: 'tuck', region: 'edge', duration: 31, mood: 'edge',
  camera: [
    { t: 0, p: G(0, 1.85, 17), l: G(0.4, 0.6, 12.6), fov: 50 },
    { t: 8, p: G(0.3, 1.5, 16.2), l: G(0.8, 0.6, 12.5), fov: 46 },
    { t: 16, p: G(1.1, 1.05, 14.6), l: G(1.6, 0.55, 12.3), fov: 40 },
    { t: 24, p: G(0.6, 1.2, 15), l: G(1.2, 0.6, 12.5), fov: 44 },
    { t: 31, p: G(0.1, 1.85, 17), l: G(0.6, 0.5, 12.5), fov: 52 },
  ],
  lines: [
    { at: 3, until: 6.6, speaker: 'Tuck', text: 'Oi. You. Yes — you, with the glowing hands.' },
    { at: 7.2, until: 10.8, speaker: 'Tuck', text: 'Name’s Tuck. I keep the stumps round here.' },
    { at: 11.3, until: 15.2, speaker: 'Tuck', text: 'You make light. Nobody’s done that in a long, long while.' },
    { at: 15.8, until: 20.2, speaker: 'Tuck', text: 'See this? A lantern-flower. Every one of them had a light inside, once.' },
    { at: 20.8, until: 24.6, speaker: 'Tuck', text: 'They didn’t go out. They were taken.' },
    { at: 25.2, until: 29.5, speaker: 'Tuck', text: 'Keep going. Deeper in. I’ll find you.' },
  ],
  build(s) {
    const tuck = s.actor('tuck', GNOME_DESIGNS.moss, TUCK_AT[0], TUCK_AT[1], 0.1, 0, 0.3);
    tuck.awaken(1.8);
    const flower = lanternFlower(0.6);
    flower.group.position.copy(s.at(1.7, 12.3));
    flower.set(0, 0);
    s.add(flower.group);
    (s as Shot & { flower?: unknown }).flower = flower;
  },
  tick(s, t) {
    const flower = (s as Shot & { flower: ReturnType<typeof lanternFlower> }).flower;
    const eye = s.camera.position;
    s.look('tuck', eye);
    let extra: ((a: Anim) => void) | undefined;
    if (t < 2) s.act('tuck', 'stagger', t / 2);
    else if (t < 4) { s.act('tuck', 'idle'); extra = (a) => a.rig.rot('spine', 0.3 * bump(2, 4, t)).rot('shoulderR', -0.8 * bump(2, 4, t)); }
    else if (t < 8) { s.act('tuck', 'idle'); extra = wave('R', bump(4, 8, t)); }
    else if (t < 11) { s.act('tuck', 'idle'); s.face('tuck', 0); }
    else if (t < 13) s.travel('tuck', TUCK_AT, [1.35, 12.45], 11, 13);
    else if (t < 21) {
      s.act('tuck', 'idle');
      s.face('tuck', -0.4);
      // Kneels and cups the closed flower in both hands, then lifts it to show you.
      const k = bump(13, 21, t);
      extra = (a) => a.rig.rotPair('thigh', -0.9 * k).rotPair('knee', 1.4 * k).pos('hips', 0, -0.1 * k, 0).rot('spine', 0.4 * k).rotPair('shoulder', -1.1 * k, 0, -0.2 * k).rotPair('elbow', -0.8 * k);
      flower.set(0.15 * k, 0.05 * k, t);
    } else if (t < 25) { s.act('tuck', 'idle'); s.face('tuck', 0.2); extra = (a) => a.rig.rot('head', 0.15, 0, 0.2).rot('shoulderL', -0.9 * bump(21, 25, t)).rot('elbowL', -1.2 * bump(21, 25, t)); }
    else if (t < 29) { s.act('tuck', 'idle'); extra = wave('L', bump(25, 29, t)); }
    else s.act('tuck', 'dead', 0.45 + smooth(29, 31, t) * 0.55);
    const a = s.actors.get('tuck');
    if (a) a.input.extra = extra;
    if (t > 29.6) s.get('tuck').lift.position.y -= smooth(29.6, 31, t) * 1.2;
  },
};

/* ═══════════════════════════════════ THE MOTH MATRON ═══════════════════════════════════ */

const MATRON: Script = {
  id: 'matron', region: 'bower', duration: 27, mood: 'edge',
  camera: [
    { t: 0, p: G(-4, 1.3, 3), l: G(0, 7, -12), fov: 50 },
    { t: 8, p: G(-2.2, 1.6, -1.5), l: G(0, 5, -12), fov: 46 },
    { t: 15, p: G(0.6, 3.2, -5.2), l: G(0, 5.2, -12), fov: 36 },
    { t: 22, p: G(0.2, 1.8, 2.5), l: G(0, 4.2, -12), fov: 52 },
    { t: 27, p: G(0, 1.85, 6), l: G(0, 4, -12), fov: 56 },
  ],
  title: { at: 11, until: 17, name: 'The Moth Matron', subtitle: 'Keeper of the Caged Lights' },
  lines: [
    { at: 9.5, until: 13, speaker: 'The Moth Matron', text: 'Little light.' },
    { at: 13.5, until: 17.5, speaker: 'The Moth Matron', text: 'Have you come all this way to be kept?' },
    { at: 18, until: 22, speaker: 'The Moth Matron', text: 'I keep them all. Every one that strays.' },
    { at: 22.5, until: 26.5, speaker: 'The Moth Matron', text: 'Come. My children are so cold.' },
  ],
  build(s) {
    s.actor('matron', MOTH_MATRON, 0, -12, 0, 10, 0.5);
    s.actor('m1', GLOOM_MOTH, 3, -10, 0, 3, 0.1);
    s.actor('m2', GLOOM_MOTH, -3, -10, 0, 3.6, 0.7);
  },
  tick(s, t, dt) {
    s.hover('matron', 10 - smooth(2, 9, t) * 8.8);
    s.act('matron', t > 14 && t < 20 ? 'windup' : t >= 20 ? 'windup' : 'idle', t > 14 && t < 20 ? smooth(14, 17, t) * 0.8 : t >= 20 ? smooth(20, 23, t) : 0, t >= 20 ? 'brood' : 'children');
    const a = s.actors.get('matron');
    if (a) a.input.extra = (an) => an.rig.rot('head', 0, 0, 0.35 * bump(9, 14, t));
    for (const [k, r, sp, off] of [['m1', 4.2, 0.55, 0], ['m2', 5.4, -0.42, 2]] as const) {
      const ang = t * sp + off, x = Math.cos(ang) * r, z = -12 + Math.sin(ang) * r;
      const m = s.actors.get(k)!;
      m.figure.group.position.set(x, terrainHeight(x, z), z);
      m.input.velocity.set(-Math.sin(ang) * r * sp, 0, Math.cos(ang) * r * sp);
      m.input.faceYaw = Math.atan2(m.input.velocity.x, m.input.velocity.z);
      m.input.pose = 'walk';
    }
    // A storm of small moths wheels about her.
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * TAU, r = 2 + Math.random() * 7, y = 1 + Math.random() * 8;
      s.stage.mist.emit({ x: Math.cos(ang) * r, y: terrainHeight(0, -12) + y, z: -12 + Math.sin(ang) * r, vx: -Math.sin(ang) * 2.5, vy: (Math.random() - 0.5), vz: Math.cos(ang) * 2.5, color: new THREE.Color('#3a332b'), size: 0.14, sizeEnd: 0.1, alpha: 0.9, ttl: 1.8, drag: 0.2, style: 'mist' });
    }
    if (Math.random() < dt * 20) s.stage.particles.emit({ x: (Math.random() - 0.5) * 12, y: terrainHeight(0, -12) + 1 + Math.random() * 7, z: -12 + (Math.random() - 0.5) * 8, vx: 0, vy: 0.2, vz: 0, color: new THREE.Color('#c9a8ff'), size: 0.05, sizeEnd: 0.01, ttl: 1.6, drag: 1, style: 'glow' });
  },
};

const MATRON_FALL: Script = {
  id: 'matron-fall', region: 'bower', duration: 21, mood: 'edge',
  camera: [
    { t: 0, p: G(0, 1.7, -3), l: G(0, 2.6, -11), fov: 48 },
    { t: 6, p: G(0.5, 1.8, -4.5), l: G(0, 2.6, -11), fov: 42 },
    { t: 12, p: G(-1, 1.6, 2), l: G(0, 5, -26), fov: 56 },
    { t: 21, p: G(-0.5, 1.6, 4), l: G(-2.5, 1.0, 7.5), fov: 50 },
  ],
  lines: [
    { at: 2.5, until: 6.5, text: 'The cage of bone breaks open.', kind: 'caption' },
    { at: 7, until: 11, text: 'The lights she kept are free.', kind: 'caption' },
    { at: 13, until: 16.8, speaker: 'Tuck', text: 'See where they went? Home. They went home.' },
    { at: 17, until: 20.8, speaker: 'Tuck', text: 'Somewhere deeper, something just lost a little of its dark.' },
  ],
  build(s) {
    s.actor('matron', MOTH_MATRON, 0, -11, 0, 0.6, 0.5);
    s.actor('tuck', GNOME_DESIGNS.moss, -2.6, 7.8, 2.6, 0, 0.3).awaken(1.2);
    const colors = ['#ffd27a', '#9fe8ff', '#ffb3e6', '#d4ff9a', '#ffffff'];
    (s as Shot & { lights?: unknown }).lights = colors.map((c) => s.lumen(c, 0.45));
  },
  tick(s, t) {
    s.act('matron', 'dead', smooth(1, 10, t));
    const lights = (s as Shot & { lights: Array<ReturnType<Shot['lumen']>> }).lights;
    const cage = v(G(0, 3.0, -10.3));
    lights.forEach((l, i) => {
      const k = smooth(3.5 + i * 0.3, 12 + i * 0.4, t);
      const swirl = new THREE.Vector3(Math.cos(t * 2 + i * 1.3) * 3 * bump(3, 9, t), Math.sin(t * 1.6 + i) * 1.5 * bump(3, 9, t) + k * 6, Math.sin(t * 2 + i * 1.3) * 2 * bump(3, 9, t));
      const far = new THREE.Vector3((i - 2) * 6, 9 + i, -46);
      l.place(cage.clone().lerp(far, smooth(8, 14 + i * 0.5, t)).add(swirl));
      l.sprite.material.opacity = smooth(3.3, 4, t) * (1 - smooth(14, 16, t));
      if (t > 3.5 && t < 4.6) s.stage.light(cage, new THREE.Color('#ffe2a8'), 8, 0.4, 14);
    });
    s.act('tuck', t < 12 ? 'stagger' : 'idle', Math.min(1, (t - 11) / 1.2));
    s.look('tuck', v(G(0, 6, -30)));
    if (t > 16) { s.look('tuck', s.camera.position); const a = s.actors.get('tuck'); if (a) a.input.extra = (an) => an.rig.rot('shoulderR', -1.6 * bump(16, 20, t)).rot('elbowR', -0.2); }
  },
};

/* ═══════════════════════════════════ THE LANTERN-FLOWERS ═══════════════════════════════════ */

const FLOWERS: Script = {
  id: 'flowers', region: 'fen', duration: 27, mood: 'fen',
  camera: [
    { t: 0, p: G(-1.5, 1.2, 15), l: G(0.5, 0.5, 9), fov: 48 },
    { t: 8, p: G(-0.4, 1.0, 12.6), l: G(0.2, 0.55, 10.6), fov: 44 },
    { t: 17, p: G(-0.2, 0.95, 12.3), l: G(0.1, 0.5, 10.8), fov: 40 },
    { t: 27, p: G(0.4, 1.6, 14.4), l: G(1.6, 0.6, 9.5), fov: 48 },
  ],
  lines: [
    { at: 1.8, until: 6, text: 'A field of lantern-flowers. Every one of them closed.', kind: 'caption' },
    { at: 7, until: 10.6, speaker: 'Tuck', text: 'Go on. Hold your hand near.' },
    { at: 12, until: 16, speaker: 'Tuck', text: 'See? It remembers. It wants to shine.' },
    { at: 17, until: 21, speaker: 'Tuck', text: 'But there’s no light left in the wood to give it.' },
    { at: 21.6, until: 26, speaker: 'Tuck', text: 'Someone gathered every light up. Someone with very big hands.' },
  ],
  build(s) {
    hands(s);
    const list: Array<ReturnType<typeof lanternFlower>> = [];
    for (let i = 0; i < 18; i++) {
      const f = lanternFlower(0.6 + (i % 4) * 0.12);
      const x = -3 + (i % 6) * 1.2 + Math.sin(i * 3.1) * 0.4, z = 8 + Math.floor(i / 6) * 1.1 + Math.cos(i * 2.3) * 0.3;
      f.group.position.copy(s.at(x, z));
      f.group.rotation.y = i * 1.7;
      f.set(0, 0);
      s.add(f.group);
      list.push(f);
    }
    const near = lanternFlower(0.7);
    near.group.position.copy(s.at(0.1, 10.9));
    near.group.rotation.y = 2.6;
    s.add(near.group);
    list.push(near);
    s.actor('tuck', GNOME_DESIGNS.moss, 1.6, 9.8, -0.9, 0, 0.3);
    (s as Shot & { fl?: unknown }).fl = { list, near };
  },
  tick(s, t) {
    const { near } = (s as Shot & { fl: { near: ReturnType<typeof lanternFlower> } }).fl;
    s.act('hands', t > 8 && t < 21 ? 'windup' : 'idle', smooth(8, 11, t) * (1 - smooth(19, 21, t)));
    const glow = smooth(11, 14, t) * (1 - smooth(17.5, 20.5, t));
    near.set(glow * 0.9, glow, t);
    if (glow > 0.1) s.stage.illuminate(0, near.group.position.clone().setY(near.group.position.y + 0.7), new THREE.Color('#ffcf7a'), glow * 1.2, 4);
    s.look('tuck', t < 11 || t > 19 ? s.camera.position : near.group.position);
    const a = s.actors.get('tuck');
    if (a) a.input.extra = t > 7 && t < 10.5 ? (an) => an.rig.rot('shoulderR', -1.3 * bump(7, 10.5, t)).rot('elbowR', -0.2) : t > 21.5 ? (an) => an.rig.rotPair('shoulder', -1.2 * bump(21.6, 26, t), 0, 0.9 * bump(21.6, 26, t)).rotPair('elbow', -0.3 * bump(21.6, 26, t)) : undefined;
  },
};

/* ═══════════════════════════════════ GRAEL ═══════════════════════════════════ */

const GRAEL_SCENE: Script = {
  id: 'grael', region: 'heartwood', duration: 27, mood: 'fen',
  camera: [
    { t: 0, p: G(-3, 1.2, 4), l: G(0, 3, -14), fov: 52 },
    { t: 7, p: G(-1.5, 1.0, 0), l: G(0, 5, -14), fov: 48 },
    { t: 13, p: G(0.4, 2.8, -6.5), l: G(0, 5.8, -13.2), fov: 38 },
    { t: 20, p: G(1.5, 2.2, -4), l: G(0, 4.4, -13), fov: 44 },
    { t: 27, p: G(0, 1.85, 6), l: G(0, 4.5, -14), fov: 56 },
  ],
  title: { at: 8, until: 14, name: 'Grael', subtitle: 'the Rootwarden' },
  lines: [
    { at: 6, until: 10, speaker: 'Grael', text: 'The Rootwarden does not move for small things.' },
    { at: 11, until: 15, speaker: 'Grael', text: '…and yet you are not small. You burn.' },
    { at: 16.5, until: 20.5, speaker: 'Grael', text: 'The Heart is not yours, little spark. It was given to me to keep.' },
    { at: 21, until: 25.5, speaker: 'Grael', text: 'And I keep what I am given.' },
  ],
  build(s) { s.actor('grael', GRAEL, 0, -14, 0, 0, 0.5).awaken(5); },
  tick(s, t, dt) {
    s.act('grael', t > 15 && t < 17.4 ? 'windup' : t >= 17.4 && t < 18.2 ? 'strike' : 'idle', t < 17.4 ? smooth(15, 17.4, t) : smooth(17.4, 18.2, t), 'quake');
    if (t < 5 && Math.random() < dt * 8) { s.stage.shake(0.06); s.stage.mist.burst(v(G((Math.random() - 0.5) * 6, 0.3, -14 + (Math.random() - 0.5) * 4)), 3, { speed: 1.5, color: new THREE.Color('#4a4136'), size: 1.4, sizeEnd: 3, alpha: 0.35, ttl: 1.6, drag: 1.4, style: 'mist' }); }
    if (t > 17.7 && t < 17.8) { s.stage.shake(0.6); s.stage.flash('#ffd27a', 0.2); }
    s.stage.illuminate(0, v(G(0, 4.4, -12.6)), new THREE.Color('#ffd27a'), 1.1 + Math.sin(t * 2) * 0.2, 7);
  },
};

const GRAEL_FALL: Script = {
  id: 'grael-fall', region: 'heartwood', duration: 23, mood: 'fen', toMood: { mood: 'edge', at: 9, seconds: 6 },
  camera: [
    { t: 0, p: G(0, 1.8, -3), l: G(0, 3, -12), fov: 50 },
    { t: 8, p: G(0, 1.5, -2), l: G(0, 6.5, -12), fov: 54 },
    { t: 15, p: G(-2, 1.4, -1), l: G(0, 0.2, -10), fov: 50 },
    { t: 23, p: G(0, 2.4, 2), l: G(4, 14, -40), fov: 56 },
  ],
  lines: [
    { at: 4, until: 8, text: 'The Star-Heart rises.', kind: 'caption' },
    { at: 9, until: 13, text: 'Where its light passes, the grass remembers green.', kind: 'caption' },
    { at: 15.5, until: 20, text: 'For a heartbeat, the whole wood is warm.', kind: 'caption' },
  ],
  build(s) {
    s.actor('grael', GRAEL, 0, -12, 0, 0, 0.5);
    const heart = s.lumen('#ffe7a3', 2.2);
    const field = flowerField(v(G(0, 0, -11)), 8, 260, terrainHeight);
    s.add(field.mesh);
    (s as Shot & { gf?: unknown }).gf = { heart, field };
  },
  tick(s, t) {
    const { heart, field } = (s as Shot & { gf: { heart: ReturnType<Shot['lumen']>; field: ReturnType<typeof flowerField> } }).gf;
    s.act('grael', 'dead', smooth(1, 12, t) * 0.999);
    const from = v(G(0, 4.4, -11.2));
    const up = from.clone().setY(from.y + 5 * smooth(4, 11, t));
    const away = new THREE.Vector3(6, 28, -60);
    heart.place(up.lerp(away, smooth(15, 19, t)));
    heart.sprite.scale.setScalar(2.2 + Math.sin(t * 3) * 0.2 + smooth(4, 10, t) * 2);
    s.stage.illuminate(0, heart.sprite.position, new THREE.Color('#ffe7a3'), 2.4 * (1 - smooth(17, 20, t)), 22);
    field.set(smooth(8, 15, t) * (1 - smooth(19, 22, t) * 0.6), t);
  },
};

/* ═══════════════════════════════════ VISIONS OF THE WARDEN ═══════════════════════════════════ */

const NAME: Script = {
  id: 'name', region: 'deeps', duration: 21, mood: 'deeps',
  camera: [
    { t: 0, p: G(0, 2.2, 14), l: G(0, 3, 6), fov: 46 },
    { t: 9, p: G(0, 2.4, 12), l: G(0, 3, 0), fov: 50 },
    { t: 21, p: G(0, 2.6, 9), l: G(0, 3.4, -6), fov: 52 },
  ],
  lines: [
    { at: 2, until: 6, text: 'Before it rose, the Star-Heart whispered.', kind: 'caption' },
    { at: 7, until: 10.2, text: '“Warden.”', kind: 'whisper' },
    { at: 11, until: 15, text: 'He kept this wood once, when every lantern-flower burned.', kind: 'caption' },
    { at: 15.5, until: 20, text: 'He loved it more than anything in the world.', kind: 'caption' },
  ],
  build(s) {
    const w = s.actor('warden', WARDEN, 0, -6, 0, 0, 0.4);
    w.group.scale.setScalar(0.55);
    const star = s.lumen('#ffe7a3', 1.4);
    const motes = ['#ffd27a', '#9fe8ff', '#ffb3e6', '#d4ff9a', '#ffffff', '#ffcf7a', '#bfe3ff'].map((c) => s.lumen(c, 0.3));
    (s as Shot & { nm?: unknown }).nm = { star, motes };
  },
  tick(s, t) {
    const { star, motes } = (s as Shot & { nm: { star: ReturnType<Shot['lumen']>; motes: Array<ReturnType<Shot['lumen']>> } }).nm;
    star.place(v(G(Math.sin(t * 0.5) * 0.3, 2.8 + Math.sin(t) * 0.15, 8)));
    star.sprite.material.opacity = 1 - smooth(8, 11, t) * 0.7;
    const w = s.get('warden');
    w.u.uExposure.value = smooth(6, 10, t) * 1.3;
    w.overrides.dissolve = 1 - smooth(6, 10, t);
    motes.forEach((m, i) => {
      const a = t * 0.6 + i * (TAU / motes.length);
      m.place(v(G(Math.cos(a) * 2.6, 1.5 + Math.sin(t * 1.3 + i) * 0.8 + i * 0.25, -6 + Math.sin(a) * 2)));
      m.sprite.material.opacity = smooth(8, 11, t);
    });
    s.stage.illuminate(0, v(G(0, 3, -5)), new THREE.Color('#ffe2b0'), smooth(7, 11, t) * 1.6, 10);
  },
};

const WARDEN_SCENE: Script = {
  id: 'warden', region: 'edge', duration: 31, mood: 'edge', toMood: { mood: 'throne', at: 8, seconds: 18 },
  camera: [
    { t: 0, p: G(0, 2.4, 10), l: G(-6, 2.6, -6), fov: 54 },
    { t: 14, p: G(0, 2.6, 8), l: G(0, 3.5, -6), fov: 52, ease: 'linear' },
    { t: 24, p: G(0, 2.2, 7), l: G(4, 5, -6), fov: 50 },
    { t: 31, p: G(0, 1.6, 6), l: G(4, 6.4, -6), fov: 44 },
  ],
  lines: [
    { at: 2, until: 6, text: 'He could not bear to watch a single light go out.', kind: 'caption' },
    { at: 7, until: 11, text: 'So he gathered them. Every one. To keep them safe.', kind: 'caption' },
    { at: 13, until: 17, text: 'And the more he kept, the colder the wood became.', kind: 'caption' },
    { at: 19, until: 23, text: 'Until nothing shone at all, except him.', kind: 'caption' },
    { at: 25, until: 29.5, text: 'The Unlit King.', kind: 'whisper' },
  ],
  build(s) {
    const w = s.actor('warden', WARDEN, -10, -6, Math.PI / 2, 0, 0.4);
    w.group.scale.setScalar(0.5);
    const k = s.actor('king', UNLIT_KING, 4, -6, -Math.PI / 2, 0, 0.4);
    k.group.scale.setScalar(0.5);
    k.overrides.dissolve = 1;
    const colors = ['#ffd27a', '#9fe8ff', '#ffb3e6', '#d4ff9a', '#ffffff', '#ffcf7a', '#bfe3ff', '#ffe7a3', '#c9a8ff', '#9ff0d4'];
    const lights = colors.map((c, i) => ({ l: s.lumen(c, 0.35), from: v(G(-14 + i * 3, 2 + (i % 3), -14 + (i % 4) * 4)), at: 3 + i * 1.6 }));
    (s as Shot & { wd?: unknown }).wd = { lights };
  },
  tick(s, t) {
    const { lights } = (s as Shot & { wd: { lights: Array<{ l: ReturnType<Shot['lumen']>; from: THREE.Vector3; at: number }> } }).wd;
    // The Warden walks across the wood, side-on, and every light he passes comes to him.
    const morph = smooth(17, 24, t);
    s.travel('warden', [-10, -6], [4, -6], 0, 22);
    const w = s.get('warden'), king = s.get('king');
    const chest = w.group.position.clone().setY(w.group.position.y + 3.3 * w.group.scale.y);
    for (const { l, from, at } of lights) {
      const k = smooth(at, at + 2.4, t);
      l.place(from.clone().lerp(chest, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 2, 0)));
      l.sprite.material.opacity = smooth(at - 1.5, at, t) * (1 - smooth(at + 2.2, at + 2.5, t));
    }
    w.group.scale.setScalar(0.5 + smooth(4, 22, t) * 0.25);
    w.overrides.dissolve = morph;
    king.group.position.copy(w.group.position);
    king.group.scale.setScalar(0.75 + smooth(22, 30, t) * 0.25);
    king.overrides.dissolve = 1 - morph;
    s.act('king', 'idle');
    s.face('king', t > 24 ? 0 : Math.PI / 2);
    if (t < 24) king.setYaw(Math.PI / 2);
  },
};

/* ═══════════════════════════════════ THE LANTERN WIDOW ═══════════════════════════════════ */

const WIDOW: Script = {
  id: 'widow', region: 'loom', duration: 27, mood: 'deeps',
  camera: [
    { t: 0, p: G(0, 1.6, 4), l: G(0, 8, -12), fov: 54 },
    { t: 9, p: G(-1, 1.7, 1), l: G(0, 3.6, -11), fov: 46 },
    { t: 16, p: G(0.8, 3.4, -4.5), l: G(0, 3.8, -10.5), fov: 36 },
    { t: 27, p: G(0, 1.85, 5), l: G(0, 3, -11), fov: 54 },
  ],
  title: { at: 10, until: 16, name: 'The Lantern Widow', subtitle: 'She Who Keeps the Lost' },
  lines: [
    { at: 8.5, until: 12, speaker: 'The Lantern Widow', text: 'Shh. Don’t wake them.' },
    { at: 12.5, until: 16.5, speaker: 'The Lantern Widow', text: 'Every lantern here holds someone the dark took.' },
    { at: 17, until: 21, speaker: 'The Lantern Widow', text: 'I keep them. Someone must.' },
    { at: 21.5, until: 26, speaker: 'The Lantern Widow', text: 'And you… you would look lovely in glass.' },
  ],
  build(s) {
    s.actor('widow', LANTERN_WIDOW, 0, -11, 0, 12, 0.5);
    const lanterns = [] as Array<ReturnType<typeof hangingLantern>>;
    for (let i = 0; i < 22; i++) {
      const h = hangingLantern(2 + (i % 4) * 0.8);
      const x = -10 + (i % 8) * 2.8 + Math.sin(i) * 0.6, z = -18 + Math.floor(i / 8) * 5 + Math.cos(i * 2) * 1.2;
      h.group.position.set(x, terrainHeight(x, z) + 7 + (i % 3), z);
      s.add(h.group);
      lanterns.push(h);
    }
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 4).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: '#cfc8ba', transparent: true, opacity: 0.5 }));
    s.add(thread);
    (s as Shot & { wl?: unknown }).wl = { lanterns, thread };
  },
  tick(s, t) {
    const { lanterns, thread } = (s as Shot & { wl: { lanterns: Array<ReturnType<typeof hangingLantern>>; thread: THREE.Mesh } }).wl;
    const height = 12 * (1 - smooth(1, 9, t));
    s.hover('widow', height);
    const w = s.get('widow');
    thread.position.copy(w.group.position).setY(w.group.position.y + height + 3.6);
    thread.scale.y = 30;
    (thread.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - smooth(9, 11, t));
    if (t > 12) s.travel('widow', [0, -11], [2.4, -10.6], 12, 18, false);
    if (t > 18) s.travel('widow', [2.4, -10.6], [-1.6, -10.8], 18, 24, false);
    s.face('widow', Math.atan2(-w.group.position.x, 4 - w.group.position.z));
    s.act('widow', t > 21 ? 'windup' : 'idle', smooth(21, 24, t), 'lost');
    lanterns.forEach((l, i) => { l.pivot.rotation.z = Math.sin(t * 0.8 + i) * 0.08; l.pivot.rotation.x = Math.cos(t * 0.6 + i * 1.3) * 0.06; l.set(0.25 + 0.15 * Math.sin(t * 2 + i * 3)); });
  },
};

const WIDOW_FALL: Script = {
  id: 'widow-fall', region: 'loom', duration: 21, mood: 'deeps', toMood: { mood: 'edge', at: 10, seconds: 8 },
  camera: [
    { t: 0, p: G(0, 1.8, 2), l: G(0, 3, -11), fov: 52 },
    { t: 9, p: G(0, 1.4, 1), l: G(0, 8, -14), fov: 58 },
    { t: 21, p: G(0, 1.2, 3), l: G(0, 16, -18), fov: 60 },
  ],
  lines: [
    { at: 3, until: 7, text: 'One by one, the lanterns open.', kind: 'caption' },
    { at: 8, until: 12, text: 'Every light she kept goes home.', kind: 'caption' },
    { at: 13.5, until: 18, text: 'The Deeps are a little less deep.', kind: 'caption' },
  ],
  build(s) {
    s.actor('widow', LANTERN_WIDOW, 0, -11, 0, 0, 0.5);
    const lanterns = [] as Array<{ h: ReturnType<typeof hangingLantern>; l: ReturnType<Shot['lumen']>; at: number }>;
    const colors = ['#ffd27a', '#9fe8ff', '#ffb3e6', '#d4ff9a', '#ffffff', '#c9a8ff'];
    for (let i = 0; i < 18; i++) {
      const h = hangingLantern(2 + (i % 4) * 0.7);
      const x = -10 + (i % 6) * 4 + Math.sin(i) * 0.6, z = -20 + Math.floor(i / 6) * 5;
      h.group.position.set(x, terrainHeight(x, z) + 7 + (i % 3), z);
      s.add(h.group);
      lanterns.push({ h, l: s.lumen(colors[i % colors.length], 0.4), at: 2 + i * 0.5 });
    }
    (s as Shot & { wf?: unknown }).wf = { lanterns };
  },
  tick(s, t) {
    s.act('widow', 'dead', smooth(0.5, 6, t) * 0.999);
    const { lanterns } = (s as Shot & { wf: { lanterns: Array<{ h: ReturnType<typeof hangingLantern>; l: ReturnType<Shot['lumen']>; at: number }> } }).wf;
    for (const { h, l, at } of lanterns) {
      const open = smooth(at, at + 0.6, t);
      h.set(0.3 + open * 0.7 * (1 - smooth(at + 1, at + 2, t)));
      const start = h.group.position.clone().setY(h.group.position.y - 2.6);
      l.place(start.clone().add(new THREE.Vector3(Math.sin(t + at) * 1.5 * open, smooth(at + 0.6, at + 7, t) * 24, 0)));
      l.sprite.material.opacity = open * (1 - smooth(at + 6, at + 8, t));
    }
  },
};

/* ═══════════════════════════════════ THE KINDLER ═══════════════════════════════════ */

const KINDLER: Script = {
  id: 'kindler', region: 'origin', duration: 31, mood: 'throne',
  camera: [
    { t: 0, p: G(0, 1.1, 15.6), l: G(0, 0.6, 13), fov: 42 },
    { t: 9, p: G(0, 1.4, 16.4), l: G(0, 0.8, 13), fov: 48 },
    { t: 16, p: G(0, 0.95, 14.2), l: G(0, 0.75, 13), fov: 34 },
    { t: 19, p: G(0, 0.85, 13.35), l: G(0, 0.75, 12.4), fov: 30 },
    { ...GAME_VIEW, t: 31, fov: 60 },
  ],
  lines: [
    { at: 2, until: 6, text: 'When the last lantern-flower began to close…', kind: 'caption' },
    { at: 7.5, until: 11.5, text: '…the wood gathered everything it had left.', kind: 'caption' },
    { at: 12, until: 15.6, text: 'Every memory of morning. Every warm thing.', kind: 'caption' },
    { at: 16, until: 19.2, text: 'And it made one more light.', kind: 'caption' },
    { at: 20.5, until: 23.6, text: 'It made you.', kind: 'whisper' },
    { at: 24.5, until: 29.5, text: 'That is why your hands burn.', kind: 'caption' },
  ],
  build(s) {
    hands(s);
    const flower = lanternFlower(0.75);
    flower.group.position.copy(s.at(0, 13));
    s.add(flower.group);
    const colors = ['#ffd27a', '#9fe8ff', '#ffb3e6', '#d4ff9a', '#ffffff', '#ffcf7a', '#bfe3ff', '#c9a8ff', '#9ff0d4', '#ffe7a3', '#ffd6f0', '#fff3a8'];
    const gather = colors.map((c, i) => ({ l: s.lumen(c, 0.3), from: v(G(Math.cos(i * 0.52) * 18, 1 + (i % 4) * 1.5, 13 + Math.sin(i * 0.52) * 18)) }));
    (s as Shot & { kd?: unknown }).kd = { flower, gather };
  },
  tick(s, t) {
    const { flower, gather } = (s as Shot & { kd: { flower: ReturnType<typeof lanternFlower>; gather: Array<{ l: ReturnType<Shot['lumen']>; from: THREE.Vector3 }> } }).kd;
    const closing = 0.5 * (1 - smooth(0, 8, t));
    const burst = smooth(15, 17, t);
    flower.set(closing + burst, 0.35 * (1 - smooth(0, 8, t)) + burst * 1.5, t);
    const heart = flower.group.position.clone().setY(flower.group.position.y + 0.72);
    gather.forEach(({ l, from }, i) => {
      const k = smooth(8 + i * 0.25, 14 + i * 0.1, t);
      l.place(from.clone().lerp(heart, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 3, 0)));
      l.sprite.material.opacity = smooth(7.5, 9, t) * (1 - smooth(14.5, 15.2, t));
    });
    if (t > 15 && t < 15.2) { s.stage.flash('#fff2d0', 0.5); s.stage.light(heart, new THREE.Color('#ffe7a3'), 10, 1.2, 10); }
    s.stage.illuminate(0, heart, new THREE.Color('#ffe2b0'), burst * 2.2 + (1 - smooth(0, 8, t)) * 0.5, 6);
    if (t > 18.8 && t < 19) s.stage.flash('#ffffff', 0.9);
    s.act('hands', t < 19 ? 'idle' : 'strike', smooth(20, 27, t));
    if (t >= 19) s.act('hands', t < 22 ? 'windup' : 'strike', t < 22 ? smooth(19, 22, t) : smooth(22, 27, t));
  },
};

/* ═══════════════════════════════════ THE UNLIT KING ═══════════════════════════════════ */

const KING: Script = {
  id: 'king', region: 'throne', duration: 31, mood: 'throne',
  camera: [
    { t: 0, p: G(0, 1.3, 8), l: G(0, 5, -16), fov: 50 },
    { t: 9, p: G(-1.2, 1.2, 2), l: G(0, 6, -16), fov: 46, ease: 'linear' },
    { t: 15, p: G(-0.6, 1.4, -4), l: G(0, 8.6, -15.4), fov: 40 },
    { t: 22, p: G(0.4, 5.2, -9.4), l: G(0, 6.6, -15), fov: 34 },
    { t: 31, p: G(0, 1.85, 6), l: G(0, 6, -16), fov: 58 },
  ],
  title: { at: 16, until: 22, name: 'The Unlit King', subtitle: 'Who Swallowed Every Light' },
  lines: [
    { at: 4, until: 8, speaker: 'The Unlit King', text: 'So. The last of them.' },
    { at: 9, until: 13, speaker: 'The Unlit King', text: 'Do you know how cold it is, to watch a light go out?' },
    { at: 14.5, until: 18.5, speaker: 'The Unlit King', text: 'I kept them. All of them. So none would ever go out again.' },
    { at: 19.5, until: 23.5, speaker: 'The Unlit King', text: 'I will not watch you go out, little light.' },
    { at: 24, until: 29.5, speaker: 'The Unlit King', text: 'Come here. Let me keep you safe. Forever.' },
  ],
  build(s) {
    const throne = rootThrone();
    throne.position.copy(s.at(0, -17));
    throne.scale.setScalar(1.15);
    s.add(throne);
    s.actor('king', UNLIT_KING, 0, -16, 0, 0, 0.5);
  },
  tick(s, t) {
    // Seated on the throne, then rising to his full height; at last he holds out a hand.
    const sit = 1 - smooth(9, 16, t);
    const reach = smooth(23, 26, t);
    const a = s.actors.get('king');
    if (a) a.input.extra = (an) => an.rig.rotPair('thigh', -1.35 * sit).rotPair('knee', 1.4 * sit).pos('hips', 0, -1.6 * sit, -0.4 * sit).rot('spine', 0.15 * sit)
      .rot('shoulderR', -1.2 * reach, 0, -0.1 * reach).rot('elbowR', -0.3 * reach).rot('handR', -0.5 * reach);
    s.act('king', 'idle');
    const k = s.get('king');
    k.overrides.eyes = 0.7 + smooth(9, 16, t) * 0.6 + Math.sin(t * 2) * 0.1;
    if (t > 15.6 && t < 15.75) { s.stage.shake(0.4); s.stage.flash('#ffe7a3', 0.15); }
    s.stage.illuminate(0, v(G(0, 6.3, -15.2)), new THREE.Color('#ffe7a3'), 0.7 + smooth(9, 16, t), 8);
  },
};

/* ═══════════════════════════════════ THE ENDING ═══════════════════════════════════ */

const ENDING: Script = {
  id: 'ending', region: 'throne', duration: 48, mood: 'throne', toMood: { mood: 'dawn', at: 11, seconds: 8 }, fadeOut: false,
  camera: [
    { t: 0, p: G(0, 1.8, 2), l: G(0, 5, -12), fov: 50 },
    { t: 10, p: G(0, 2.6, 8), l: G(0, 9, -12), fov: 58 },
    { t: 18, p: G(-6, 2.2, 4), l: G(0, 1.6, -6), fov: 52 },
    { t: 28, p: G(3.6, 1.3, -1.5), l: G(0, 0.8, -7.5), fov: 46 },
    { t: 38, p: G(0, 6.5, 14), l: G(0, 2, -14), fov: 58 },
    { t: 48, p: G(0, 7.5, 18), l: G(0, 3, -16), fov: 60 },
  ],
  title: { at: 42, until: 48, name: 'The Hushwood Is Free', subtitle: 'Arcane' },
  lines: [
    { at: 3, until: 7, speaker: 'The Unlit King', text: '…so warm.' },
    { at: 8.5, until: 11.2, text: 'Every light, let go.', kind: 'caption' },
    { at: 12.5, until: 16.5, speaker: 'The Warden', text: 'Thank you. I was so afraid of the dark.' },
    { at: 19, until: 23, text: 'The Hushwood remembers its colours.', kind: 'caption' },
    { at: 25, until: 28.6, speaker: 'Tuck', text: 'Look at it! LOOK at it!' },
    { at: 31, until: 35, text: 'Every lantern-flower is open. Every light is home.', kind: 'caption' },
    { at: 37, until: 41, text: 'Thank you, Kindler.', kind: 'whisper' },
  ],
  build(s) {
    s.actor('king', UNLIT_KING, 0, -12, 0, 0, 0.5);
    const w = s.actor('warden', WARDEN, 0, -11, 0, 0, 0.4);
    w.group.scale.setScalar(0.55);
    w.overrides.dissolve = 1;
    const colors = ['#ffd27a', '#9fe8ff', '#ffb3e6', '#d4ff9a', '#ffffff', '#ffcf7a', '#bfe3ff', '#c9a8ff', '#9ff0d4', '#ffe7a3'];
    const lights = Array.from({ length: 30 }, (_, i) => ({ l: s.lumen(colors[i % colors.length], 0.4), dir: new THREE.Vector3(Math.cos(i * 2.4) * (8 + (i % 5) * 6), 6 + (i % 7) * 2, Math.sin(i * 2.4) * (8 + (i % 5) * 6) - 12) }));
    const field = flowerField(v(G(0, 0, -6)), 22, 900, terrainHeight);
    s.add(field.mesh);
    const flies = butterflies(26, v(G(0, 0, -6)), 8);
    s.add(flies.group);
    const blooms = [] as Array<ReturnType<typeof lanternFlower>>;
    for (let i = 0; i < 16; i++) {
      const f = lanternFlower(0.7 + (i % 3) * 0.15);
      const a = (i / 16) * TAU, r = 6 + (i % 4) * 2.2;
      f.group.position.copy(s.at(Math.cos(a) * r, -8 + Math.sin(a) * r * 0.7));
      f.group.rotation.y = a;
      s.add(f.group);
      blooms.push(f);
    }
    const gnomes = [GNOME_DESIGNS.moss, GNOME_DESIGNS.ember, GNOME_DESIGNS.moss, GNOME_DESIGNS.ember];
    gnomes.forEach((d, i) => { const g = s.actor(`g${i}`, d, Math.cos(i * 1.57) * 1.6, -7.5 + Math.sin(i * 1.57) * 1.6, 0, 0, i * 0.23); g.overrides.dissolve = 1; });
    for (let i = 0; i < 5; i++) { const b = s.actor(`b${i}`, bloomkin(...BLOOMKIN_COATS[i]), -5 + i * 2.5, -4 + Math.sin(i * 2) * 2, 0.4, 0, i * 0.31); b.overrides.dissolve = 1; }
    (s as Shot & { en?: unknown }).en = { lights, field, flies, blooms };
  },
  tick(s, t) {
    const { lights, field, flies, blooms } = (s as Shot & { en: { lights: Array<{ l: ReturnType<Shot['lumen']>; dir: THREE.Vector3 }>; field: ReturnType<typeof flowerField>; flies: ReturnType<typeof butterflies>; blooms: Array<ReturnType<typeof lanternFlower>> } }).en;
    // The King kneels and the light he swallowed breaks out of him.
    s.act('king', 'dead', smooth(0, 7, t) * 0.4 + smooth(10, 16, t) * 0.6);
    const king = s.get('king');
    // He kneels first and only comes apart once the light has left him.
    king.overrides.dissolve = smooth(11, 16.5, t);
    king.overrides.eyes = 1 + smooth(2, 9, t) * 3;
    king.overrides.flash = 0.3 * smooth(4, 9, t) * (1 + Math.sin(t * 12) * 0.3);
    king.u.uFlashColor.value.set('#ffe7a3');
    const heart = v(G(0, 5.2, -11.2));
    if (t > 9 && t < 9.2) { s.stage.flash('#fff6d8', 0.9); s.stage.shake(0.6); }
    lights.forEach(({ l, dir }, i) => {
      const k = smooth(9 + (i % 6) * 0.1, 15 + (i % 5), t);
      l.place(heart.clone().add(dir.clone().multiplyScalar(k)).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 4, 0)));
      l.sprite.material.opacity = smooth(8.9, 9.4, t) * (1 - smooth(17 + (i % 5), 20 + (i % 5), t) * 0.4);
    });
    s.stage.illuminate(0, heart, new THREE.Color('#fff2c8'), 3 * bump(8, 16, t), 30);
    // In his place, the Warden: small again, warm-eyed. He bows, and goes into the light.
    const w = s.get('warden');
    w.overrides.dissolve = t < 12 ? 1 : t < 17 ? 1 - smooth(12, 14, t) : smooth(17, 19.5, t);
    const bow = bump(14.5, 17.5, t);
    const wa = s.actors.get('warden');
    if (wa) wa.input.extra = (an) => an.rig.rot('spine', 0.6 * bow).rot('head', 0.5 * bow).rotPair('shoulder', 0.3 * bow);
    // The freed wood: flowers open outward, lantern-flowers bloom, butterflies, gnomes dancing.
    field.set(smooth(14, 32, t), t);
    flies.update(t);
    blooms.forEach((f, i) => f.set(smooth(16 + i * 0.4, 18 + i * 0.4, t), smooth(16 + i * 0.4, 18 + i * 0.4, t), t + i * 0.7));
    for (let i = 0; i < 4; i++) {
      const g = s.get(`g${i}`);
      if (t > 20 + i * 0.5 && g.overrides.dissolve === 1) { delete g.overrides.dissolve; g.awaken(1.1); }
      const a = t * 0.9 + i * 1.57;
      const p = new THREE.Vector3(Math.cos(a) * 1.7, 0, -7.5 + Math.sin(a) * 1.7);
      g.group.position.set(p.x, terrainHeight(p.x, p.z), p.z);
      const ga = s.actors.get(`g${i}`)!;
      ga.input.velocity.set(-Math.sin(a) * 1.5, 0, Math.cos(a) * 1.5);
      ga.input.faceYaw = Math.atan2(ga.input.velocity.x, ga.input.velocity.z);
      ga.input.pose = t > 21 + i * 0.5 ? 'walk' : 'stagger';
      ga.input.progress = Math.min(1, (t - 20 - i * 0.5) / 1.1);
      const hop = Math.max(0, Math.sin(t * 7 + i)) * 0.12;
      ga.input.extra = (an) => an.rig.pos('hips', 0, hop, 0).rotPair('shoulder', -2.4 * (0.6 + 0.4 * Math.sin(t * 5 + i)), 0, 0.5);
    }
    for (let i = 0; i < 5; i++) {
      const b = s.get(`b${i}`);
      if (t > 22 + i * 0.6 && b.overrides.dissolve === 1) { delete b.overrides.dissolve; b.awaken(0.8); }
      s.travel(`b${i}`, [-5 + i * 2.5, -4 + Math.sin(i * 2) * 2], [-4 + i * 2.2 + Math.sin(i) * 2, -6 - (i % 2) * 2], 24 + i * 0.6, 30 + i);
    }
    if (Math.random() < 0.5 && t > 18) s.stage.particles.emit({ x: (Math.random() - 0.5) * 24, y: terrainHeight(0, -8) + 0.5 + Math.random() * 3, z: -8 + (Math.random() - 0.5) * 16, vx: 0, vy: 0.2, vz: 0, color: new THREE.Color(Math.random() < 0.5 ? '#fff3a8' : '#d4ff9a'), size: 0.06, sizeEnd: 0.01, ttl: 2, drag: 1, style: 'glow' });
  },
};

export const SCRIPTS: Record<string, Script> = Object.fromEntries([
  INTRO, TUCK, MATRON, MATRON_FALL, FLOWERS, GRAEL_SCENE, GRAEL_FALL, NAME, WARDEN_SCENE, WIDOW, WIDOW_FALL, KINDLER, KING, ENDING,
].map((s) => [s.id, s]));
