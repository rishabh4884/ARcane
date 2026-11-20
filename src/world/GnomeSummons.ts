import * as THREE from 'three';
import type { ParticleSystem } from './particles.ts';
import { ellipsoid, lathe, tube, type Body } from './rig/Body.ts';
import { Character, type Design } from './rig/Character.ts';
import { biped, blink, bump, clamp, idleLife, lookAt, smooth, TAU, type Anim, type CreaturePose } from './rig/Rig.ts';
import { moveOnGround, terrainHeight, type Obstacle } from './spatial.ts';

/**
 * RISE: THE WOODLAND GNOMES
 * ─────────────────────────
 * Two gnomes climb out of the earth where the spell is cast, run out toward the nearest spirit
 * (backs to the caster), hold a throwing spot a few metres short of it and pelt it with stones,
 * side-stepping between throws. When their time is up they turn, run back toward the caster with a
 * wave, and duck into the ground.
 */
export const GNOME_LIFETIME = 10;
export const GNOME_ATTACK_RANGE = 35;
export const GNOME_RUN_SPEED = 5.2;
const THROW_RANGE = 7.5;
const WINDUP_TIME = 1.0;
const HURL_TIME = 0.42;
const RECOVER_TIME = 0.75;
const GRAB_AT = 0.32;
const RELEASE_AT = 0.28;
const ROCK_GRAVITY = 11;
const EMERGE_TIME = 1.1;

export interface GnomeTarget { id: number; position: THREE.Vector3; height: number; alive: boolean }

interface Palette { cap: string; capShade: string; tunic: string; tunicShade: string }
const EMBER: Palette = { cap: '#b8432d', capShade: '#7a2619', tunic: '#5b6b3c', tunicShade: '#3a4627' };
const MOSS: Palette = { cap: '#4d7a3b', capShade: '#2b4a22', tunic: '#7a5634', tunicShade: '#4d3520' };

function gnomeDesign(c: Palette, kind: string): Design {
  return {
    kind, name: kind === 'gnome-ember' ? 'Ember gnome' : 'Moss gnome',
    // The moss gnome is Tuck, the stump-keeper, sculpted by the art pipeline and drawn in ink and paint.
    ...(kind === 'gnome-moss' ? { model: 'tuck' } : {}), height: 1.2, radius: 0.3, turnRate: 9, stride: 0.95, pace: 2.6,
    eye: '#1a1210', eyeAngry: '#1a1210', edge: '#ffd166', mist: 0.18,
    stiffness: { cap1: 10, cap2: 6, cap3: 4, beard: 10, beard2: 6, hips: 22, handL: 18, handR: 18 },
    castBone: 'handR', coreBone: 'chest',
    build(b: Body) {
      b.bone('hips', 'root', [0, 0.36, 0])
        .bone('spine', 'hips', [0, 0.48, 0])
        .bone('chest', 'spine', [0, 0.6, 0.01])
        .bone('head', 'chest', [0, 0.7, 0.03], [0, 0.84, 0.04])
        .bone('eyes', 'head', [0, 0.76, 0.13])
        .bone('beard', 'head', [0, 0.67, 0.13])
        .bone('beard2', 'beard', [0, 0.53, 0.17], [0, 0.4, 0.18])
        .bone('cap1', 'head', [0, 0.84, 0.01])
        .bone('cap2', 'cap1', [0, 1.0, -0.04])
        .bone('cap3', 'cap2', [0, 1.12, -0.13], [0, 1.18, -0.26])
        .pairBone('shoulderL', 'chest', [0.15, 0.6, 0])
        .pairBone('elbowL', 'shoulderL', [0.22, 0.47, 0.03])
        .pairBone('handL', 'elbowL', [0.25, 0.37, 0.06], [0.26, 0.3, 0.07])
        .pairBone('thighL', 'hips', [0.08, 0.34, 0])
        .pairBone('kneeL', 'thighL', [0.09, 0.2, 0.02])
        .pairBone('ankleL', 'kneeL', [0.09, 0.075, 0])
        .pairBone('toeL', 'ankleL', [0.09, 0.03, 0.1], [0.09, 0.035, 0.16]);
      const skin = '#e6b496';
      // A round belly in a belted tunic.
      b.part(ellipsoid([0, 0.47, 0.015], [0.17, 0.18, 0.16], { deform: (d, p) => { if (d.z > 0 && d.y < 0.3) p.z += 0.025 * (1 - Math.abs(d.y)); } }),
        { color: c.tunic, shade: c.tunicShade, surface: 'cloth', bones: ['hips', 'spine', 'chest'] });
      b.part(lathe([[0.168, 0.4], [0.19, 0.34], [0.205, 0.29], [0.2, 0.275]], { segments: 24, deform: (o, a, t) => { if (t > 0.6) o.y += Math.sin(a * 8) * 0.008; } }),
        { color: c.tunic, shade: c.tunicShade, surface: 'cloth', bones: ['hips', 'thighL', 'thighR'] });
      b.part(lathe([[0.178, 0.445], [0.184, 0.425], [0.178, 0.405]], { segments: 24 }), { color: '#3a2819', surface: 'skin', bones: ['hips', 'spine'] });
      b.part(ellipsoid([0, 0.425, 0.18], [0.03, 0.026, 0.012]), { color: '#d4a948', surface: 'metal', bones: ['hips'] });
      // Head, a bulb of a nose, rosy cheeks, bright bead eyes under bushy brows.
      b.part(ellipsoid([0, 0.74, 0.04], [0.112, 0.106, 0.104]), { color: skin, shade: '#c98f74', surface: 'skin', bones: ['head'] });
      b.part(ellipsoid([0, 0.722, 0.155], [0.045, 0.042, 0.042]), { color: '#e9967f', shade: '#c9705e', surface: 'skin', bones: ['head'] });
      for (const s of [1, -1]) {
        b.part(ellipsoid([0.062 * s, 0.705, 0.115], [0.032, 0.022, 0.02]), { color: '#ec8f83', surface: 'skin', bones: ['head'] });
        b.part(ellipsoid([0.043 * s, 0.762, 0.128], [0.017, 0.02, 0.012]), { color: '#120c0a', surface: 'dark', bones: ['eyes'] });
        b.part(ellipsoid([0.038 * s, 0.768, 0.139], [0.005, 0.005, 0.003]), { color: '#ffffff', surface: 'glow', glow: 0.7, bones: ['eyes'] });
        b.part(tube([[0.018 * s, 0.792, 0.13], [0.058 * s, 0.8, 0.125], [0.086 * s, 0.788, 0.105]], [0.012, 0.017, 0.007], { radial: 6, wobble: 0.3 }),
          { color: '#f1ece2', shade: '#cfc6b6', surface: 'hair', bones: ['head'] });
        b.part(tube([[0.005 * s, 0.704, 0.168], [0.06 * s, 0.693, 0.15], [0.092 * s, 0.665, 0.12]], [0.022, 0.019, 0.006], { radial: 7, wobble: 0.2 }),
          { color: '#f1ece2', shade: '#d8cfc0', surface: 'hair', bones: ['head'] });
        b.part(ellipsoid([0.108 * s, 0.735, 0.03], [0.022, 0.04, 0.028]), { color: skin, shade: '#c98f74', surface: 'skin', bones: ['head'] });
      }
      // A full white beard that swings as it runs.
      b.part(ellipsoid([0, 0.6, 0.11], [0.12, 0.17, 0.085], {
        deform: (d, p) => { if (d.y < 0) { p.y *= 1 + 0.4 * -d.y; p.x *= 1 + 0.55 * d.y; } if (d.z < 0) p.z *= 0.5; },
      }), { color: '#f2ede4', shade: '#cbc1b0', surface: 'hair', bones: ['beard', 'beard2', 'head'] });
      // The tall felt cap, flopping over at the tip.
      b.part(tube([[0, 0.79, 0.025], [0, 0.92, 0.0], [0, 1.04, -0.06], [0, 1.13, -0.15], [0, 1.17, -0.26]], [0.122, 0.095, 0.065, 0.03, 0.004], { radial: 16, segments: 30, capStart: false }),
        { color: c.cap, shade: c.capShade, surface: 'cloth', bones: ['head', 'cap1', 'cap2', 'cap3'] });
      b.part(lathe([[0.122, 0.815], [0.128, 0.8], [0.12, 0.785]], { center: [0, 0, 0.025], segments: 24 }), { color: c.capShade, surface: 'cloth', bones: ['head'] });
      // Sleeves and mittens.
      b.pair(tube([[0.13, 0.615, 0], [0.22, 0.47, 0.03], [0.25, 0.39, 0.06]], [0.048, 0.04, 0.038], { radial: 10 }),
        { color: c.tunic, shade: c.tunicShade, surface: 'cloth', bones: ['shoulderL', 'elbowL', 'handL', 'chest'] });
      b.pair(ellipsoid([0.256, 0.345, 0.066], [0.037, 0.044, 0.033]), { color: '#8b5a36', shade: '#5e3b22', surface: 'skin', bones: ['handL'] });
      b.pair(ellipsoid([0.232, 0.36, 0.09], [0.014, 0.022, 0.014]), { color: '#8b5a36', surface: 'skin', bones: ['handL'] });
      // Trousers and curled boots.
      b.pair(tube([[0.08, 0.36, 0], [0.09, 0.2, 0.02], [0.09, 0.085, 0]], [0.052, 0.044, 0.04], { radial: 10 }),
        { color: '#5a4732', shade: '#3a2d20', surface: 'cloth', bones: ['thighL', 'kneeL', 'ankleL', 'hips'] });
      b.pair(ellipsoid([0.09, 0.05, 0.045], [0.05, 0.045, 0.085], { deform: (d, p) => { if (d.z > 0.4) p.y += (d.z - 0.4) * 0.05; if (d.y < -0.5) p.y *= 0.6; } }),
        { color: '#3d2b1d', shade: '#21170f', surface: 'skin', bones: ['ankleL', 'toeL'] });
    },
    animate(a: Anim) {
      const r = a.rig;
      const running = clamp(a.speed / 3);
      biped(a, { stride: 0.75, knee: 1.15, bob: 0.045, sway: 0.07, lean: 0.22, arm: 0.85, elbow: -0.9, run: running });
      idleLife(a, 1.2);
      blink(a, 3);
      // The cap flops and trails; the beard swings with every stride.
      const bounce = Math.cos(a.phase * TAU * 2) * a.move;
      r.rot('cap1', -a.swayF * 0.5 + 0.05 + bounce * 0.06, 0, a.swayS * 0.4);
      r.rot('cap2', 0.15 - a.swayF * 0.8 + bounce * 0.12 + running * 0.3, 0, a.swayS * 0.6 + Math.sin(a.phase * TAU) * 0.08 * a.move);
      r.rot('cap3', 0.25 - a.swayF * 1.1 + bounce * 0.18 + running * 0.4, 0, a.swayS * 0.9);
      r.rot('beard', -a.swayF * 0.4 + bounce * 0.05, 0, a.swayS * 0.3 + Math.sin(a.phase * TAU) * 0.1 * a.move);
      r.rot('beard2', -a.swayF * 0.6 + bounce * 0.1, 0, a.swayS * 0.5);
      const p = a.progress;
      switch (a.pose) {
        case 'idle':
          lookAt(a, 1);
          r.rot('head', 0, 0, Math.sin(a.t * 1.3 + a.seed * 4) * 0.12);
          break;
        case 'windup': {
          // Stoop and grab a stone with both hands, carry it at the chest, then cock it behind the head.
          const stoop = bump(0, 0.5, p);
          const carry = smooth(0.32, 0.5, p) * (1 - smooth(0.62, 0.78, p));
          const cock = smooth(0.62, 0.92, p);
          r.rot('spine', 0.9 * stoop - 0.25 * cock, 0.55 * cock).rot('chest', 0.3 * stoop, 0.25 * cock).rot('head', 0.4 * stoop - 0.2 * cock, -0.6 * cock);
          r.rotPair('thigh', -0.75 * stoop).rotPair('knee', 1.1 * stoop).rotPair('ankle', -0.35 * stoop).pos('hips', 0, -0.07 * stoop, -0.02 * stoop);
          r.rotPair('shoulder', -0.7 * stoop - 0.9 * carry, 0, -0.2 * carry).rotPair('elbow', -0.2 * stoop - 1.6 * carry);
          r.rot('shoulderR', -2.7 * cock, 0, -0.35 * cock).rot('elbowR', -1.5 * cock);
          r.rot('shoulderL', -1.35 * cock, 0, 0.2 * cock).rot('elbowL', -0.15 * cock);
          r.rot('thighL', -0.4 * cock).rot('thighR', 0.2 * cock);
          break;
        }
        case 'strike': {
          // Whip it over and follow through across the body.
          const whip = smooth(0, 0.35, p), settle = smooth(0.5, 1, p);
          r.rot('spine', -0.25 + 0.85 * whip - 0.4 * settle, 0.55 - 1.0 * whip + 0.45 * settle).rot('chest', 0, 0.25 - 0.5 * whip).rot('head', 0.2 * whip, -0.6 + 0.6 * whip);
          r.rot('shoulderR', -2.7 + 2.9 * whip - 0.2 * settle, 0, -0.35 + 0.6 * whip).rot('elbowR', -1.5 + 1.4 * whip);
          r.rot('shoulderL', -1.35 + 1.4 * whip, 0, 0.2).rot('thighL', -0.4 - 0.3 * whip).rot('kneeL', 0.4 * whip).rot('thighR', 0.2 + 0.35 * whip);
          break;
        }
        case 'recover':
          // A little hop of satisfaction.
          r.pos('hips', 0, Math.max(0, Math.sin(p * Math.PI * 2)) * 0.06, 0).rot('shoulderL', -1.2 * bump(0.1, 0.6, p), 0, 0.5 * bump(0.1, 0.6, p));
          lookAt(a, 0.6);
          break;
        case 'stagger': {
          // Climbing out of the ground: arms first, hauling up, then a little landing squat.
          const climb = smooth(0, 0.6, p);
          r.rotPair('shoulder', -2.6 * (1 - climb) - 0.3, 0, 0.4 * (1 - climb)).rotPair('elbow', -0.6 * (1 - climb));
          r.rotPair('knee', 0.9 * bump(0.55, 1, p)).rotPair('thigh', -0.6 * bump(0.55, 1, p));
          break;
        }
        case 'dead': {
          // A wave goodbye, then a dive into the ground.
          r.rot('shoulderR', -2.6 * bump(0, 0.5, p), 0, -0.6 * bump(0, 0.5, p)).rot('elbowR', -0.4 + Math.sin(a.t * 18) * 0.35 * bump(0, 0.5, p));
          r.rot('spine', 0.9 * smooth(0.45, 0.75, p)).rotPair('shoulder', -2.4 * smooth(0.45, 0.75, p));
          break;
        }
      }
    },
  };
}

export const GNOME_DESIGNS = { ember: gnomeDesign(EMBER, 'gnome-ember'), moss: gnomeDesign(MOSS, 'gnome-moss') };

type Phase = 'emerge' | 'run' | 'windup' | 'hurl' | 'recover' | 'leave' | 'sink' | 'gone';

interface Scout {
  figure: Character;
  phase: Phase;
  age: number;
  life: number;
  side: number;
  target: number | null;
  spot: THREE.Vector3;
  velocity: THREE.Vector3;
  rock: THREE.Mesh | null;
  step: number;
  emerge: THREE.Vector3;
}

interface Rock { mesh: THREE.Mesh; velocity: THREE.Vector3; spin: THREE.Vector3; age: number; target: number | null; aim: THREE.Vector3 }

const ROCK_COLOR = new THREE.Color('#7c766a');

export class GnomeSummons {
  readonly group = new THREE.Group();
  private readonly scouts: Scout[] = [];
  private readonly rocks: Rock[] = [];
  private readonly rockGeometry: THREE.IcosahedronGeometry;
  private readonly rockMaterial = new THREE.MeshStandardMaterial({ color: ROCK_COLOR, roughness: 0.92, flatShading: true });
  private readonly ray = new THREE.Ray();
  private readonly scratch = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly dust = new THREE.Color('#6b5d48');
  private readonly spark = new THREE.Color('#ffd166');
  private disposed = false;

  constructor(
    private readonly obstacles: readonly Obstacle[],
    private readonly intersectEnvironment: (ray: THREE.Ray, range: number) => number | null,
    private readonly onHit: (id: number, point: THREE.Vector3) => void,
    private readonly particles?: ParticleSystem,
    private readonly mist?: ParticleSystem,
  ) {
    this.group.name = 'Summoned gnomes';
    // A faceted stone, a little lumpy, lit by the scene so it reads as a rock.
    this.rockGeometry = new THREE.IcosahedronGeometry(0.085, 0);
    const p = this.rockGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + ((i * 7) % 5) * 0.06), p.getY(i) * (0.8 + ((i * 3) % 4) * 0.07), p.getZ(i));
    this.rockGeometry.computeVertexNormals();
  }

  /** Two gnomes climb out of the ground where the spell was cast. */
  summon(origin: THREE.Vector3, focus: THREE.Vector3, preferredTarget: number | null = null): void {
    if (this.disposed) return;
    this.clear();
    const toward = focus.clone().sub(origin).setY(0);
    if (toward.lengthSq() < 1e-4) toward.set(0, 0, -1);
    toward.normalize();
    const right = new THREE.Vector3(-toward.z, 0, toward.x);
    [GNOME_DESIGNS.ember, GNOME_DESIGNS.moss].forEach((design, i) => {
      const figure = new Character(design, i * 0.37 + Math.random() * 0.2);
      const side = i === 0 ? -1 : 1;
      const at = origin.clone().addScaledVector(right, side * 0.55);
      at.y = terrainHeight(at.x, at.z);
      figure.group.position.copy(at);
      figure.setYaw(Math.atan2(toward.x, toward.z) + side * 0.4);
      figure.awaken(EMERGE_TIME);
      this.group.add(figure.group);
      this.scouts.push({ figure, phase: 'emerge', age: -i * 0.18, life: GNOME_LIFETIME, side, target: preferredTarget, spot: at.clone(), velocity: new THREE.Vector3(), rock: null, step: side, emerge: at.clone() });
      this.burst(at);
    });
  }

  update(dt: number, canAttack: boolean, player: THREE.Vector3, targets: readonly GnomeTarget[], reducedMotion = false): void {
    if (this.disposed) return;
    for (const scout of this.scouts) this.updateScout(scout, dt, canAttack, player, targets, reducedMotion);
    for (let i = this.scouts.length - 1; i >= 0; i--) {
      if (this.scouts[i].phase !== 'gone') continue;
      this.dropRock(this.scouts[i]);
      this.scouts[i].figure.dispose();
      this.scouts.splice(i, 1);
    }
    this.updateRocks(dt, targets);
  }

  private pickTarget(scout: Scout, targets: readonly GnomeTarget[]): GnomeTarget | null {
    const current = targets.find((t) => t.id === scout.target && t.alive);
    if (current) return current;
    const p = scout.figure.group.position;
    let best: GnomeTarget | null = null, bestD = GNOME_ATTACK_RANGE;
    for (const t of targets) {
      if (!t.alive) continue;
      const d = t.position.distanceTo(p);
      if (d < bestD) { bestD = d; best = t; }
    }
    scout.target = best?.id ?? null;
    return best;
  }

  private updateScout(s: Scout, dt: number, canAttack: boolean, player: THREE.Vector3, targets: readonly GnomeTarget[], reducedMotion: boolean): void {
    const f = s.figure, p = f.group.position;
    s.age += dt;
    s.life -= dt;
    let pose: CreaturePose = 'idle', progress = 0, faceYaw: number | null = null;
    s.velocity.set(0, 0, 0);
    const target = this.pickTarget(s, targets);
    if (s.life <= 0 && s.phase !== 'leave' && s.phase !== 'sink' && s.phase !== 'gone') { this.dropRock(s); s.phase = 'leave'; s.age = 0; }
    if (!canAttack && (s.phase === 'windup' || s.phase === 'hurl')) { this.dropRock(s); s.phase = 'run'; s.age = 0; }

    switch (s.phase) {
      case 'emerge':
        pose = 'stagger';
        progress = clamp(s.age / EMERGE_TIME);
        if (s.age >= EMERGE_TIME) { s.phase = 'run'; s.age = 0; }
        break;
      case 'run': {
        if (target) {
          // A throwing spot a few metres short of the spirit, on the caster's side, fanned apart.
          const back = this.scratch.copy(player).sub(target.position).setY(0);
          if (back.lengthSq() < 1e-4) back.set(0, 0, 1);
          back.normalize();
          s.spot.copy(target.position).addScaledVector(back, THROW_RANGE).add(new THREE.Vector3(-back.z, 0, back.x).multiplyScalar(s.side * 1.4));
        } else {
          s.spot.copy(s.emerge).add(new THREE.Vector3(s.side * 1.2, 0, 0));
        }
        const to = this.scratch.copy(s.spot).sub(p).setY(0);
        const distance = to.length();
        if (distance > 0.3) {
          const speed = Math.min(GNOME_RUN_SPEED, distance * 3);
          s.velocity.copy(to).multiplyScalar(speed / distance);
          faceYaw = Math.atan2(to.x, to.z);
          pose = 'walk';
        } else if (target && canAttack) {
          s.phase = 'windup'; s.age = 0;
        } else {
          pose = 'idle';
          faceYaw = Math.atan2(player.x - p.x, player.z - p.z);
        }
        break;
      }
      case 'windup':
        pose = 'windup';
        progress = clamp(s.age / WINDUP_TIME);
        if (target) faceYaw = Math.atan2(target.position.x - p.x, target.position.z - p.z);
        if (progress >= GRAB_AT && !s.rock) this.grabRock(s);
        if (!target) { this.dropRock(s); s.phase = 'run'; s.age = 0; }
        else if (s.age >= WINDUP_TIME) { s.phase = 'hurl'; s.age = 0; }
        break;
      case 'hurl':
        pose = 'strike';
        progress = clamp(s.age / HURL_TIME);
        if (target) faceYaw = Math.atan2(target.position.x - p.x, target.position.z - p.z);
        if (progress >= RELEASE_AT && s.rock && target) this.release(s, target);
        if (s.age >= HURL_TIME) { s.phase = 'recover'; s.age = 0; s.step = -s.step; }
        break;
      case 'recover': {
        // A side-step while still facing the target, so the next stone comes from a new spot.
        pose = 'recover';
        progress = clamp(s.age / RECOVER_TIME);
        if (target) {
          faceYaw = Math.atan2(target.position.x - p.x, target.position.z - p.z);
          const side = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
          s.velocity.copy(side).multiplyScalar(s.step * 1.5 * bump(0, 1, progress) * 1.6);
          pose = progress < 0.85 ? 'walk' : 'recover';
        }
        if (s.age >= RECOVER_TIME) { s.phase = target && canAttack ? 'windup' : 'run'; s.age = 0; }
        break;
      }
      case 'leave': {
        // Turn back toward the caster, face front, and run home.
        const home = this.scratch.copy(player).sub(p).setY(0);
        const d = home.length();
        faceYaw = Math.atan2(home.x, home.z);
        if (s.age < 1.6 && d > 4) {
          s.velocity.copy(home).multiplyScalar(Math.min(GNOME_RUN_SPEED * 0.8, d) / Math.max(d, 1e-3));
          pose = 'walk';
        } else { s.phase = 'sink'; s.age = 0; }
        break;
      }
      case 'sink':
        pose = 'dead';
        progress = clamp(s.age / 1.2);
        faceYaw = Math.atan2(player.x - p.x, player.z - p.z);
        if (s.age > 0.6 && s.age - dt <= 0.6) this.burst(p.clone());
        f.lift.position.y = -smooth(0.55, 1, progress) * 1.2;
        if (s.age >= 1.2) s.phase = 'gone';
        break;
      case 'gone':
        return;
    }
    if (s.velocity.lengthSq() > 0) {
      moveOnGround(p, s.velocity.x * dt, s.velocity.z * dt, this.obstacles);
    }
    p.y = terrainHeight(p.x, p.z);
    f.update(dt, { pose, progress, velocity: s.velocity, faceYaw, look: this.look.copy(player), groundY: p.y, reducedMotion });
    if (s.phase === 'sink') f.lift.position.y = -smooth(0.55, 1, progress) * 1.2;
  }

  private grabRock(s: Scout): void {
    const rock = new THREE.Mesh(this.rockGeometry, this.rockMaterial);
    rock.position.set(-0.02, -0.06, 0.03);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    s.figure.bones.handR.add(rock);
    s.rock = rock;
    const p = s.figure.group.position;
    this.mist?.burst(p.clone().setY(p.y + 0.05), 3, { speed: 0.4, color: this.dust, size: 0.25, sizeEnd: 0.6, alpha: 0.2, ttl: 0.6, drag: 2, style: 'mist' });
  }

  private dropRock(s: Scout): void {
    if (!s.rock) return;
    s.rock.removeFromParent();
    s.rock = null;
  }

  private release(s: Scout, target: GnomeTarget): void {
    const rock = s.rock!;
    s.rock = null;
    const start = rock.getWorldPosition(new THREE.Vector3());
    rock.removeFromParent();
    rock.position.copy(start);
    this.group.add(rock);
    const aim = target.position.clone().setY(target.position.y + target.height * 0.55);
    const flat = Math.hypot(aim.x - start.x, aim.z - start.z);
    const time = THREE.MathUtils.clamp(flat / 13, 0.35, 1.1);
    const velocity = aim.clone().sub(start).multiplyScalar(1 / time);
    velocity.y += 0.5 * ROCK_GRAVITY * time;
    this.rocks.push({ mesh: rock, velocity, spin: new THREE.Vector3(8 + Math.random() * 6, 4, 6), age: 0, target: target.id, aim });
  }

  private updateRocks(dt: number, targets: readonly GnomeTarget[]): void {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const rock = this.rocks[i], p = rock.mesh.position;
      rock.age += dt;
      const from = p.clone();
      rock.velocity.y -= ROCK_GRAVITY * dt;
      p.addScaledVector(rock.velocity, dt);
      rock.mesh.rotation.x += rock.spin.x * dt;
      rock.mesh.rotation.y += rock.spin.y * dt;
      if (Math.random() < 0.5) this.mist?.emit({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0.1, vz: 0, color: this.dust, size: 0.12, sizeEnd: 0.3, alpha: 0.18, ttl: 0.4, drag: 2, style: 'mist' });
      const target = targets.find((t) => t.id === rock.target && t.alive);
      const hitTarget = target && p.distanceTo(target.position.clone().setY(target.position.y + target.height * 0.55)) < Math.max(0.55, target.height * 0.22);
      this.ray.set(from, this.scratch.copy(p).sub(from).normalize());
      const block = this.intersectEnvironment(this.ray, from.distanceTo(p));
      const ground = p.y <= terrainHeight(p.x, p.z) + 0.05;
      if (hitTarget || block !== null || ground || rock.age > 3) {
        if (hitTarget && target) this.onHit(target.id, p.clone());
        this.shatter(p.clone(), hitTarget ? 1 : 0.6);
        rock.mesh.removeFromParent();
        this.rocks.splice(i, 1);
      }
    }
  }

  private shatter(at: THREE.Vector3, force: number): void {
    this.particles?.burst(at, Math.round(14 * force), { speed: 3.2 * force, color: ROCK_COLOR, size: 0.05, ttl: 0.7, gravity: 9, drag: 0.8, style: 'spark' });
    this.particles?.burst(at, Math.round(8 * force), { speed: 1.6, color: this.spark, size: 0.06, sizeEnd: 0.01, ttl: 0.4, drag: 2, style: 'glow' });
    this.mist?.burst(at, 5, { speed: 0.8, color: this.dust, size: 0.5, sizeEnd: 1.2, alpha: 0.3, ttl: 0.9, drag: 2, style: 'mist' });
  }

  /** The ground tears open with the circle's light and a spray of earth. */
  private burst(at: THREE.Vector3): void {
    this.mist?.burst(at, 10, { speed: 1.6, direction: new THREE.Vector3(0, 0.4, 0), spread: 2, color: this.dust, size: 0.7, sizeEnd: 1.8, alpha: 0.38, ttl: 1.2, drag: 2, style: 'mist' });
    this.particles?.burst(at, 16, { speed: 2.6, direction: new THREE.Vector3(0, 1, 0), spread: 0.8, color: this.spark, size: 0.08, sizeEnd: 0.01, ttl: 0.7, drag: 1.5, style: 'spark' });
    this.particles?.burst(at, 12, { speed: 2.2, direction: new THREE.Vector3(0, 1, 0), spread: 1.2, color: ROCK_COLOR, size: 0.04, ttl: 0.8, gravity: 8, drag: 0.6, style: 'spark' });
  }

  /** Figures for depth sorting with the spirits. */
  figures(): THREE.Object3D[] { return this.scouts.map((s) => s.figure.mesh); }

  get active(): boolean { return this.scouts.length > 0; }

  clear(): void {
    for (const s of this.scouts) { this.dropRock(s); s.figure.dispose(); }
    this.scouts.length = 0;
    for (const r of this.rocks) r.mesh.removeFromParent();
    this.rocks.length = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.rockGeometry.dispose();
    this.rockMaterial.dispose();
    this.group.removeFromParent();
  }
}
