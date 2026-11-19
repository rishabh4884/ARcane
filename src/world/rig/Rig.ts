import * as THREE from 'three';

/**
 * A pose driver over a skeleton. Each frame an animation writes *offsets* from the rest pose
 * (rotations in radians about the bone's own axes, translations in metres, scale deltas); the rig
 * eases every bone toward its target at that bone's own rate. Heavy masses (hips, chest) follow
 * quickly; ears, caps, beards, antler moss and lanterns follow late, so motion overlaps and settles
 * instead of snapping between poses.
 *
 * Axes at rest: +Y up, +Z the way the character faces, +X the character's left.
 * A positive X rotation tips a bone's far end backward (−Z): legs swing back, a head nods up.
 */
interface Entry {
  bone: THREE.Bone;
  restP: THREE.Vector3;
  restQ: THREE.Quaternion;
  restS: THREE.Vector3;
  /** Target and current: rx ry rz, px py pz, sx sy sz. */
  t: Float32Array;
  c: Float32Array;
  k: number;
}

const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const q = new THREE.Quaternion();

export class Rig {
  readonly bones: Record<string, THREE.Bone>;
  private readonly entries: Entry[] = [];
  private readonly byName = new Map<string, Entry>();

  constructor(bones: Record<string, THREE.Bone>, stiffness: Record<string, number> = {}, fallback = 16) {
    this.bones = bones;
    for (const [name, bone] of Object.entries(bones)) {
      const entry: Entry = {
        bone, restP: bone.position.clone(), restQ: bone.quaternion.clone(), restS: bone.scale.clone(),
        t: new Float32Array(9), c: new Float32Array(9), k: stiffness[name] ?? fallback,
      };
      this.entries.push(entry);
      this.byName.set(name, entry);
    }
  }

  has(name: string): boolean { return this.byName.has(name); }

  /** Add a rotation offset (radians). Missing bones are ignored so shared gaits fit every body. */
  rot(name: string, x: number, y = 0, z = 0): this {
    const e = this.byName.get(name);
    if (e) { e.t[0] += x; e.t[1] += y; e.t[2] += z; }
    return this;
  }

  /** Mirror-aware rotation for a left/right pair: z and y flip sign on the right side. */
  rotPair(base: string, x: number, y = 0, z = 0): this {
    this.rot(`${base}L`, x, y, z);
    return this.rot(`${base}R`, x, -y, -z);
  }

  pos(name: string, x: number, y = 0, z = 0): this {
    const e = this.byName.get(name);
    if (e) { e.t[3] += x; e.t[4] += y; e.t[5] += z; }
    return this;
  }

  /** Scale delta: 0 = rest, −0.9 = nearly flat (a blink), 0.2 = 20% larger. */
  scl(name: string, x: number, y = x, z = x): this {
    const e = this.byName.get(name);
    if (e) { e.t[6] += x; e.t[7] += y; e.t[8] += z; }
    return this;
  }

  /** Override a bone's easing rate (per second) for this frame onward. */
  stiffness(name: string, k: number): void {
    const e = this.byName.get(name);
    if (e) e.k = k;
  }

  /** Ease every bone toward its target, write the transforms, and clear targets for the next frame. */
  apply(dt: number, rate = 1): void {
    for (const e of this.entries) {
      const a = dt <= 0 ? 0 : 1 - Math.exp(-dt * e.k * rate);
      for (let i = 0; i < 9; i++) e.c[i] += (e.t[i] - e.c[i]) * a;
      this.write(e);
      e.t.fill(0);
    }
  }

  /** Jump straight to the targets (first frame, cutscene cuts). */
  snap(): void {
    for (const e of this.entries) { e.c.set(e.t); this.write(e); e.t.fill(0); }
  }

  /** Throw away targets without moving (a frozen figure keeps its last pose). */
  hold(): void { for (const e of this.entries) e.t.fill(0); }

  private write(e: Entry): void {
    euler.set(e.c[0], e.c[1], e.c[2], 'YXZ');
    e.bone.quaternion.copy(e.restQ).multiply(q.setFromEuler(euler));
    e.bone.position.set(e.restP.x + e.c[3], e.restP.y + e.c[4], e.restP.z + e.c[5]);
    e.bone.scale.set(e.restS.x * (1 + e.c[6]), e.restS.y * (1 + e.c[7]), e.restS.z * (1 + e.c[8]));
  }
}

/** A damped spring on one number: overshoots slightly, then settles. */
export class Spring {
  value = 0;
  velocity = 0;
  constructor(public stiffness = 60, public damping = 9) {}
  step(target: number, dt: number): number {
    if (dt <= 0) return this.value;
    const steps = Math.max(1, Math.ceil(dt / 0.016));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = (target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += a * h;
      this.value += this.velocity * h;
    }
    return this.value;
  }
  kick(velocity: number): void { this.velocity += velocity; }
  reset(value = 0): void { this.value = value; this.velocity = 0; }
}

export type CreaturePose = 'idle' | 'walk' | 'windup' | 'strike' | 'recover' | 'stagger' | 'frozen' | 'dead';

/** Everything an animation function may read in one frame. */
export interface Anim {
  rig: Rig;
  /** Seconds since the figure was made (for breathing, twitches, idle looks). */
  t: number;
  dt: number;
  pose: CreaturePose;
  /** 0..1 through the current pose (wind-up charge, strike beat, death). */
  progress: number;
  /** Which attack is being wound up or struck (bosses move differently for each). */
  attack: string;
  /** Seconds since the pose began. */
  age: number;
  /** Gait cycle position 0..1 (advances with distance travelled, so feet do not slide). */
  phase: number;
  /** 0..1 how much the body is travelling (also turning in place). */
  move: number;
  /** Local travel direction, unit: fwd toward the face (+Z), side toward the character's left (+X). */
  fwd: number;
  side: number;
  /** Ground speed in m/s. */
  speed: number;
  /** Yaw rate (rad/s): leans into turns, flings the loose parts. */
  turn: number;
  /** Springy sway signals from acceleration (forward, sideways) for loose parts. */
  swayF: number;
  swayS: number;
  /** Where the player is, relative to the facing: yaw (+ = to the character's left) and pitch. */
  lookYaw: number;
  lookPitch: number;
  /** 0..1 recency of the last hit (1 = this frame). */
  hit: number;
  /** 1 = alive and moving, 0 = held utterly still (the hush, a held stare). */
  life: number;
  /** Per-instance random 0..1 so a crowd never moves in step. */
  seed: number;
  /** Ground height under the figure. */
  ground: number;
}

export const TAU = Math.PI * 2;
export const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (x: number, a = 0, b = 1): number => Math.min(b, Math.max(a, x));
/** 0 → 1 → 0 over [a, b]. */
export const bump = (a: number, b: number, x: number): number => x <= a || x >= b ? 0 : Math.sin(((x - a) / (b - a)) * Math.PI);

export interface GaitShape {
  /** Thigh swing (rad) at full stride. */
  stride: number;
  /** Knee fold during the swing. */
  knee: number;
  /** Vertical hip bob (m). */
  bob: number;
  /** Hip roll (rad). */
  sway: number;
  /** Forward lean of the chest while walking (rad). */
  lean: number;
  /** Arm swing (rad). */
  arm: number;
  /** Resting elbow bend (rad, negative = forearm forward). */
  elbow: number;
  /** Extra crouch at the knees while moving (rad). */
  crouch?: number;
  /** Run: a flight phase, higher knees, more lean (0..1). */
  run?: number;
}

/**
 * Two-legged locomotion: forward and backward walking, side-stepping in either direction (legs
 * reach out sideways and the hips shift over the stepping foot), and shuffling while turning.
 * Feet lift only while they swing forward, so the stance foot reads as planted.
 */
export function biped(a: Anim, g: GaitShape): void {
  const r = a.rig;
  const w = a.move * a.life;
  const ph = a.phase * TAU;
  const run = g.run ?? 0;
  for (const side of ['L', 'R'] as const) {
    const phi = ph + (side === 'R' ? Math.PI : 0);
    const swing = Math.sin(phi);
    const lift = Math.max(0, Math.cos(phi));
    const plant = Math.max(0, -Math.cos(phi));
    const sx = side === 'L' ? 1 : -1;
    // Forward/backward: thighs swing about X; sideways: they reach out about Z.
    const thighX = -swing * g.stride * a.fwd * w - lift * g.knee * (0.35 + run * 0.45) * w - (g.crouch ?? 0) * w * 0.5;
    const thighZ = (swing * g.stride * 0.75 * a.side + (a.side * sx > 0 ? lift : 0) * 0.12 * Math.abs(a.side)) * w;
    r.rot(`thigh${side}`, thighX, 0, thighZ);
    r.rot(`knee${side}`, (lift * g.knee * (1 + run * 0.7) + plant * 0.08 + (g.crouch ?? 0)) * w);
    r.rot(`ankle${side}`, (-lift * g.knee * 0.45 + swing * 0.18 * a.fwd - (g.crouch ?? 0) * 0.5) * w, 0, -thighZ * 0.8);
    r.rot(`toe${side}`, plant * 0.25 * w * Math.max(0, a.fwd));
  }
  // Hips ride up over the planted leg and drop into each step; they roll and twist with the stride.
  const bounce = (Math.abs(Math.cos(ph)) - 0.55) * g.bob * w * (1 + run);
  r.pos('hips', Math.sin(ph) * 0.035 * Math.abs(a.side) * w, bounce, 0);
  r.rot('hips', 0, Math.sin(ph) * 0.14 * a.fwd * w, Math.sin(ph) * g.sway * w);
  r.rot('spine', g.lean * a.fwd * w * (1 + run * 0.8) + a.swayF * 0.12, -Math.sin(ph) * 0.12 * a.fwd * w, -Math.sin(ph) * g.sway * 0.6 * w - a.turn * 0.04 + a.swayS * 0.1);
  r.rot('chest', g.lean * 0.4 * a.fwd * w, -Math.sin(ph) * 0.1 * w, -a.turn * 0.03);
  // Arms counter-swing the legs; going sideways they lift out for balance.
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const swing = Math.sin(ph + (side === 'L' ? 0 : Math.PI));
    r.rot(`shoulder${side}`, swing * g.arm * a.fwd * w - run * 0.25 * w, 0, sx * (0.08 + Math.abs(a.side) * 0.22 * w));
    r.rot(`elbow${side}`, g.elbow - (run * 0.9 + Math.max(0, -swing) * 0.25) * w);
  }
}

/** Breathing, a weight shift and a slow look: life in a figure that is standing still. */
export function idleLife(a: Anim, amount = 1): void {
  const r = a.rig;
  const breathe = Math.sin(a.t * 1.6 + a.seed * 9) * amount * a.life;
  r.rot('chest', breathe * 0.025).scl('chest', breathe * 0.012, breathe * 0.008, breathe * 0.018);
  r.pos('hips', Math.sin(a.t * 0.37 + a.seed * 5) * 0.012 * amount * a.life, 0, 0);
  r.rot('hips', 0, 0, Math.sin(a.t * 0.37 + a.seed * 5) * 0.03 * amount * a.life);
}

/** Head (and neck) turn toward the player, limited, with the eyes leading. */
export function lookAt(a: Anim, weight = 1, limit = 0.9): void {
  const yaw = clamp(a.lookYaw, -limit, limit) * weight;
  const pitch = clamp(a.lookPitch, -0.5, 0.5) * weight;
  a.rig.rot('neck', -pitch * 0.4, yaw * 0.45).rot('head', -pitch * 0.6, yaw * 0.55);
}

/** A blink every few seconds (the eyes bone squashes flat). */
export function blink(a: Anim, every = 4.2): void {
  const cycle = (a.t + a.seed * every) % every;
  if (cycle < 0.13) a.rig.scl('eyes', 0, -0.92 * Math.sin((cycle / 0.13) * Math.PI), 0);
}
