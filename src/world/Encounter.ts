import * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';
import type { LevelDef, WaveGroup } from '../game/campaign.ts';
import { DESIGNS } from './characters/index.ts';
import { COOLDOWNS, CREATURE_SPECS, CreatureState, PlayerState, SPELL_DAMAGE, type AttackSpec, type CreatureKind, type CreatureSpec } from './EncounterState.ts';
import type { GameEvents } from './events.ts';
import { GnomeSummons } from './GnomeSummons.ts';
import type { ParticleSystem } from './particles.ts';
import { Character } from './rig/Character.ts';
import { aimAssistRadius, EYE_HEIGHT, moveOnGround, terrainHeight, type Obstacle } from './spatial.ts';
import { glowSprite, Trail } from './vfx.ts';
import { EnemyIndicators } from '../ui/EnemyIndicators.ts';

/**
 * THE ENCOUNTER
 * ─────────────
 * Runs a level: its waves, the creatures in them and how they move and fight, the sub-boss that
 * comes alone after the last wave, a final boss's phases, every projectile and ground hazard, and
 * what each spell does when it lands. Gameplay is the same with or without presentation hooks.
 */

/** A creature in the fight. Spells and the world target these. */
export interface Foe {
  readonly id: number;
  readonly kind: CreatureKind;
  readonly spec: CreatureSpec;
  readonly figure: Character;
  readonly state: CreatureState;
  readonly boss: boolean;
}

interface Actor extends Foe {
  velocity: THREE.Vector3;
  phase: number;
  strafe: number;
  strafeTimer: number;
  lastPose: string;
  warning: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  /** A charge or dive in progress. */
  rush: { dir: THREE.Vector3; speed: number; hit: boolean; from?: THREE.Vector3 } | null;
  /** Current hover height for fliers. */
  altitude: number;
  burnTick: number;
  bossPhase: number;
  haste: number;
  blink: { age: number; to: THREE.Vector3; moved: boolean } | null;
  removeAt: number;
}

type ProjectileStyle = 'ember' | 'bile' | 'boulder' | 'lantern' | 'moth' | 'pale' | 'cold' | 'star' | 'wisp';
interface Projectile {
  group: THREE.Object3D;
  velocity: THREE.Vector3;
  mode: 'straight' | 'arc' | 'seek' | 'fall';
  speed: number;
  damage: number;
  age: number;
  delay: number;
  ttl: number;
  style: ProjectileStyle;
  color: THREE.Color;
  trail: Trail | null;
  source: Actor | null;
  reflected: boolean;
  target?: THREE.Vector3;
}

type HazardKind = 'shockwave' | 'spikes' | 'telegraph' | 'star-mark';
interface Hazard {
  kind: HazardKind;
  object: THREE.Object3D;
  age: number;
  life: number;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  reach: number;
  speed: number;
  damage: number;
  hit: boolean;
  color: THREE.Color;
  spikes?: THREE.Mesh[];
  source: Actor | null;
}

interface QueuedHit { foe: Actor; effect: SpellEffect; at: number; point: THREE.Vector3; amount?: number; generation: number }

export type EncounterMode = 'idle' | 'intro' | 'wave' | 'breather' | 'boss-intro' | 'boss' | 'won' | 'lost';

export interface EncounterSnapshot {
  mode: EncounterMode;
  wave: number;
  waves: number;
  alive: number;
  boss: { name: string; title: string; health: number; max: number; phase: number } | null;
  player: PlayerState;
  stats: LevelStats;
}

export interface LevelStats { time: number; damageTaken: number; casts: number; released: number; hits: number }

/** Optional presentation hooks; gameplay is identical without them. */
export interface EncounterFx { particles?: ParticleSystem; mist?: ParticleSystem; events?: GameEvents }

const PLAYER_GROUND = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const COLORS: Record<ProjectileStyle, string> = {
  ember: '#ffb066', bile: '#a8e05a', boulder: '#7c766a', lantern: '#ffc36a', moth: '#c9a8ff', pale: '#cfe6ff', cold: '#8fdcff', star: '#b59cff', wisp: '#9ff0d4',
};
const BOSS_COLOR: Partial<Record<CreatureKind, string>> = {
  gorrik: '#ffb066', fenwyrm: '#a8e05a', stag: '#8fdcff', herald: '#cfe6ff', matron: '#c9a8ff', grael: '#ffd27a', widow: '#ffc36a', king: '#9a7cff',
};
/** The court a final boss calls at each phase. */
const COURT: Partial<Record<CreatureKind, WaveGroup[][]>> = {
  matron: [[{ kind: 'goblin', count: 3 }, { kind: 'wraith', count: 1 }], [{ kind: 'goblin', count: 3 }, { kind: 'wraith', count: 2, from: 'left' }]],
  grael: [[{ kind: 'mossling', count: 6 }, { kind: 'root', count: 1 }], [{ kind: 'thornback', count: 2 }, { kind: 'mossling', count: 4, from: 'right' }]],
  widow: [[{ kind: 'moth', count: 3 }, { kind: 'wraith', count: 2 }], [{ kind: 'moth', count: 3, from: 'left' }, { kind: 'hollow', count: 1 }]],
  king: [[{ kind: 'hollow', count: 1 }, { kind: 'wraith', count: 3 }, { kind: 'goblin', count: 3, from: 'left' }], [{ kind: 'moth', count: 3 }, { kind: 'thornback', count: 2, from: 'right' }, { kind: 'root', count: 1 }]],
};

export class Encounter {
  readonly player = new PlayerState();
  readonly group = new THREE.Group();
  private readonly actors: Actor[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly hazards: Hazard[] = [];
  private readonly queued: QueuedHit[] = [];
  private readonly depthOrder: { figure: THREE.Object3D; distance: number }[] = [];
  private readonly indicators = new EnemyIndicators();
  private readonly summons: GnomeSummons;
  private readonly ray = new THREE.Ray();
  private readonly scratch = new THREE.Vector3();
  private readonly scratch2 = new THREE.Vector3();
  private readonly hitBox = new THREE.Box3();
  private readonly spikeGeometry = new THREE.ConeGeometry(0.28, 1.7, 6, 1);
  private readonly rockGeometry = new THREE.IcosahedronGeometry(0.45, 0);
  private readonly ringGeometry = new THREE.RingGeometry(0.86, 1, 72);
  private readonly orbGeometry = new THREE.IcosahedronGeometry(0.14, 1);
  private readonly shared: THREE.Material[] = [];
  private level: LevelDef | null = null;
  private mode: EncounterMode = 'idle';
  private modeTime = 0;
  private waveIndex = -1;
  private time = 0;
  private generation = 0;
  private nextId = 0;
  private boss: Actor | null = null;
  private pendingSpawns: Array<{ at: number; kind: CreatureKind; from: WaveGroup['from']; slot: number; boss?: boolean }> = [];
  private stats: LevelStats = { time: 0, damageTaken: 0, casts: 0, released: 0, hits: 0 };
  private disposed = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly obstacles: readonly Obstacle[],
    private readonly intersectEnvironment: (ray: THREE.Ray, range: number) => number | null,
    private readonly fx: EncounterFx = {},
  ) {
    this.group.name = 'Creatures of the Hushwood';
    scene.add(this.group);
    this.summons = new GnomeSummons(this.obstacles, this.intersectEnvironment, (id, point) => this.summonHit(id, point), fx.particles, fx.mist);
    this.group.add(this.summons.group);
  }

  /* ─────────────────────────────── level flow ─────────────────────────────── */

  get currentLevel(): LevelDef | null { return this.level; }
  get active(): boolean { return this.mode !== 'idle' && this.mode !== 'won' && this.mode !== 'lost'; }

  startLevel(level: LevelDef): void {
    if (this.disposed) return;
    this.stop();
    this.level = level;
    this.player.reset();
    this.generation++;
    this.time = 0;
    this.stats = { time: 0, damageTaken: 0, casts: 0, released: 0, hits: 0 };
    this.setMode('intro');
    this.fx.events?.emit({ type: 'encounter', mode: 'active' });
  }

  /** Clear the field (leaving a level, returning to the menu). */
  stop(): void {
    for (const a of this.actors) { a.figure.dispose(); a.warning.removeFromParent(); }
    this.actors.length = 0;
    this.clearProjectiles();
    for (const h of this.hazards) h.object.removeFromParent();
    this.hazards.length = 0;
    this.queued.length = 0;
    this.pendingSpawns.length = 0;
    this.summons.clear();
    this.indicators.reset();
    this.boss = null;
    this.waveIndex = -1;
    this.mode = 'idle';
    this.level = null;
  }

  snapshot(): EncounterSnapshot {
    const b = this.boss;
    return {
      mode: this.mode, wave: Math.max(0, this.waveIndex + 1), waves: this.level?.waves.length ?? 0,
      alive: this.actors.filter((a) => a.state.alive).length + this.pendingSpawns.length,
      boss: b ? { name: b.spec.name, title: b.spec.title ?? '', health: b.state.health, max: b.state.maxHealth, phase: b.bossPhase } : null,
      player: this.player, stats: { ...this.stats },
    };
  }

  private setMode(mode: EncounterMode): void {
    this.mode = mode;
    this.modeTime = 0;
  }

  private beginWave(index: number): void {
    const level = this.level!;
    this.waveIndex = index;
    this.setMode('wave');
    const groups = level.waves[index];
    let slot = 0, at = this.time + 0.2;
    for (const group of groups) {
      for (let i = 0; i < group.count; i++) {
        this.pendingSpawns.push({ at, kind: group.kind, from: group.from ?? 'front', slot: slot++ });
        at += group.kind === 'mossling' ? 0.18 : 0.45;
      }
    }
    this.fx.events?.emit({ type: 'wave', index, total: level.waves.length });
  }

  private beginBoss(): void {
    const level = this.level!;
    this.setMode('boss-intro');
    this.pendingSpawns.push({ at: this.time + (level.kind === 'final' ? 0.6 : 2.4), kind: level.boss!, from: 'front', slot: 0, boss: true });
    this.fx.events?.emit({ type: 'boss', kind: level.boss!, phase: 0, name: CREATURE_SPECS[level.boss!].name, title: CREATURE_SPECS[level.boss!].title ?? '' });
  }

  private updateFlow(dt: number): void {
    const level = this.level;
    if (!level) return;
    this.modeTime += dt;
    // Spawns are spread over time so a wave walks out of the wood instead of appearing at once.
    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      const s = this.pendingSpawns[i];
      if (this.time >= s.at) { this.pendingSpawns.splice(i, 1); this.spawn(s.kind, s.from, s.slot, s.boss); }
    }
    const living = this.actors.some((a) => a.state.alive) || this.pendingSpawns.length > 0;
    switch (this.mode) {
      case 'intro':
        if (this.modeTime > 2.6) { if (level.waves.length) this.beginWave(0); else this.beginBoss(); }
        break;
      case 'wave':
        if (!living && this.modeTime > 1) {
          if (this.waveIndex + 1 < level.waves.length) { this.setMode('breather'); this.fx.events?.emit({ type: 'wave-clear', index: this.waveIndex }); }
          else if (level.boss) this.beginBoss();
          else this.win();
        }
        break;
      case 'breather':
        if (this.modeTime > 3.4) this.beginWave(this.waveIndex + 1);
        break;
      case 'boss-intro':
        if (this.boss && this.modeTime > 1) this.setMode('boss');
        break;
      case 'boss':
        if (this.boss && !this.boss.state.alive && this.boss.state.progress >= 0.6 && !living) this.win();
        break;
    }
  }

  private win(): void {
    this.setMode('won');
    this.clearProjectiles();
    this.summons.clear();
    this.fx.events?.emit({ type: 'encounter', mode: 'won' });
  }

  private lose(): void {
    this.setMode('lost');
    this.clearProjectiles();
    this.summons.clear();
    this.fx.events?.emit({ type: 'encounter', mode: 'lost' });
  }

  /* ─────────────────────────────── spawning ─────────────────────────────── */

  private spawnPoint(from: WaveGroup['from'], slot: number, radius: number, boss: boolean): THREE.Vector3 {
    const r = mulberry(this.generation * 977 + slot * 131 + this.waveIndex * 17);
    let x: number, z: number;
    if (boss) { x = (r() - 0.5) * 4; z = -24 - r() * 4; }
    else if (from === 'left' || from === 'right') { x = (from === 'left' ? -1 : 1) * (22 + r() * 5); z = -10 + r() * 16; }
    else { x = (r() - 0.5) * 30; z = -18 - r() * 18; }
    const p = new THREE.Vector3(x, 0, z);
    moveOnGround(p, 0, 0, this.obstacles);
    for (const o of this.obstacles) {
      const d = Math.hypot(p.x - o.x, p.z - o.z), min = o.radius + radius + 0.6;
      if (d < min) { p.x = o.x + (p.x - o.x) / Math.max(d, 1e-3) * min; p.z = o.z + (p.z - o.z) / Math.max(d, 1e-3) * min; }
    }
    p.y = terrainHeight(p.x, p.z);
    return p;
  }

  private spawn(kind: CreatureKind, from: WaveGroup['from'], slot: number, boss = false, at?: THREE.Vector3): Actor {
    const spec = CREATURE_SPECS[kind];
    const level = this.level;
    const scaling = level?.scaling ?? { health: 1, damage: 1, speed: 1 };
    const figure = new Character(DESIGNS[kind], Math.random());
    const position = at?.clone() ?? this.spawnPoint(from, slot, spec.radius, boss);
    figure.group.position.copy(position);
    figure.setYaw(Math.atan2(this.camera.position.x - position.x, this.camera.position.z - position.z));
    figure.awaken(boss ? 2.6 : 1.4);
    this.group.add(figure.group);
    const warning = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color: '#dfb47f', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    warning.rotation.x = -Math.PI / 2;
    warning.visible = false;
    this.group.add(warning);
    const actor: Actor = {
      id: this.nextId++, kind, spec, figure, state: new CreatureState(kind, scaling, this.nextId * 7919 + this.generation), boss: spec.rank !== 'normal',
      velocity: new THREE.Vector3(), phase: Math.random() * 10, strafe: Math.random() < 0.5 ? -1 : 1, strafeTimer: 1 + Math.random() * 2,
      lastPose: 'idle', warning, rush: null, altitude: spec.hover ?? 0, burnTick: 0, bossPhase: 0, haste: 1, blink: null, removeAt: -1,
    };
    this.actors.push(actor);
    if (boss) {
      this.boss = actor;
      this.fx.events?.emit({ type: 'boss-arrive', kind, position: position.clone(), pan: this.pan(position) });
    }
    this.fx.mist?.burst(position.clone().setY(position.y + 0.3), boss ? 26 : 8, { speed: boss ? 2.4 : 1.2, color: new THREE.Color('#4f5c56'), size: boss ? 2.4 : 1.1, sizeEnd: boss ? 5 : 2.4, alpha: 0.35, ttl: 2, drag: 1.4, style: 'mist' });
    return actor;
  }

  /* ─────────────────────────────── player ─────────────────────────────── */

  private damage(amount: number, source?: string): void {
    if (!this.active) return;
    const result = this.player.damage(Math.round(amount));
    if (result === 'ignored') return;
    if (result === 'hurt') this.stats.damageTaken += amount;
    this.fx.events?.emit(result === 'blocked' ? { type: 'player-blocked' } : { type: 'player-hurt', amount, source });
    if (!this.player.alive) this.lose();
  }

  /** The wood holds its breath: every spirit that is only watching or prowling stops and stares. */
  hush(seconds: number): void { for (const a of this.actors) if (a.state.alive) a.figure.still(seconds); }

  cast(effect: SpellEffect): boolean {
    if (!this.player.alive || !this.active) return false;
    if (!this.player.cast(effect)) return false;
    this.stats.casts++;
    if (effect === 'bloom') for (const a of this.actors) a.state.rootFor(2.5);
    return true;
  }

  cooldowns(): Record<string, { remaining: number; total: number }> {
    const out: Record<string, { remaining: number; total: number }> = {};
    for (const effect of Object.keys(COOLDOWNS) as SpellEffect[]) out[effect] = { remaining: this.player.cooldowns[effect], total: COOLDOWNS[effect] };
    return out;
  }

  summon(spawn: THREE.Vector3, focus: THREE.Vector3, foe: Foe | null): void {
    const ground = spawn.clone();
    ground.y = terrainHeight(ground.x, ground.z);
    this.summons.summon(ground, focus, foe?.id ?? null);
  }

  private summonHit(id: number, point: THREE.Vector3): void {
    const actor = this.actors.find((a) => a.id === id);
    if (actor) this.hitFoe(actor, 'summon', point);
  }

  /* ─────────────────────────────── targeting ─────────────────────────────── */

  targets(): Foe[] { return this.actors.filter((a) => a.state.alive && a.figure.fade < 0.6); }
  hasFoe(foe: Foe): boolean { return this.actors.includes(foe as Actor); }

  intersectFoe(foe: Foe, ray: THREE.Ray, point: THREE.Vector3): number | null {
    const a = foe as Actor;
    if (!a.state.alive) return null;
    const p = a.figure.group.position;
    const padding = aimAssistRadius(p.distanceTo(ray.origin));
    const base = p.y + (a.spec.hover ? a.altitude - 0.2 : 0.1);
    const h = a.spec.hover ? a.spec.height + 0.4 : a.spec.height;
    this.hitBox.min.set(p.x - a.spec.radius - padding, base - padding, p.z - a.spec.radius - padding);
    this.hitBox.max.set(p.x + a.spec.radius + padding, base + h + padding, p.z + a.spec.radius + padding);
    const hit = ray.intersectBox(this.hitBox, point);
    return hit ? hit.distanceTo(ray.origin) : null;
  }

  /** Where a ray meets a creature's actual body, clamped inside its silhouette. */
  bodyPoint(foe: Foe, ray: THREE.Ray, out: THREE.Vector3): THREE.Vector3 {
    const a = foe as Actor;
    const p = a.figure.group.position;
    const normal = this.scratch.set(this.camera.position.x - p.x, 0, this.camera.position.z - p.z);
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    normal.normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, p);
    const centre = this.centre(a, new THREE.Vector3());
    if (!ray.intersectPlane(plane, out)) out.copy(centre);
    const side = new THREE.Vector3(normal.z, 0, -normal.x);
    const lateral = THREE.MathUtils.clamp(out.clone().sub(p).dot(side), -a.spec.radius * 0.7, a.spec.radius * 0.7);
    const base = p.y + (a.spec.hover ? a.altitude : 0);
    const y = THREE.MathUtils.clamp(out.y, base + a.spec.height * 0.3, base + a.spec.height * 0.8);
    return out.copy(p).addScaledVector(side, lateral).setY(y).addScaledVector(normal, a.spec.radius * 0.4);
  }

  /** Middle of a creature's body in the world. */
  centre(foe: Foe, out: THREE.Vector3): THREE.Vector3 {
    const a = foe as Actor;
    const p = a.figure.group.position;
    return out.set(p.x, p.y + (a.spec.hover ? a.altitude : 0) + a.spec.height * 0.55, p.z);
  }

  /** Skyfall's column: the nearest living creature beneath (or at) the aim point on screen. */
  columnTarget(ndcX: number, ndcY: number): { foe: Foe; point: THREE.Vector3 } | null {
    let best: { foe: Actor; score: number } | null = null;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    for (const a of this.actors) {
      if (!a.state.alive) continue;
      const p = a.figure.group.position;
      const view = p.clone().applyMatrix4(this.camera.matrixWorldInverse);
      if (view.z > -1) continue;
      const base = p.clone().project(this.camera);
      if (base.x < -1.2 || base.x > 1.2) continue;
      const edge = p.clone().addScaledVector(right, a.spec.radius * 1.6).project(this.camera);
      const tolerance = Math.max(Math.abs(edge.x - base.x), 0.07);
      const dx = Math.abs(ndcX - base.x);
      if (dx > tolerance || ndcY < base.y - 0.06) continue;
      const score = dx / tolerance + (-view.z) * 0.004;
      if (!best || score < best.score) best = { foe: a, score };
    }
    return best ? { foe: best.foe, point: this.centre(best.foe, new THREE.Vector3()) } : null;
  }

  attachToFoe(foe: Foe, object: THREE.Object3D): boolean {
    const a = foe as Actor;
    if (!this.actors.includes(a) || a.figure.fade >= 1) return false;
    a.figure.core.updateWorldMatrix(true, false);
    a.figure.core.attach(object);
    return true;
  }

  foeFade(foe: Foe): number { return this.actors.includes(foe as Actor) ? (foe as Actor).figure.fade : 1; }

  /** Creatures along a line from the caster (lane spells), with the distance along it. */
  private lane(from: THREE.Vector3, dir: THREE.Vector3, width: number, range = 55): Array<{ foe: Actor; along: number }> {
    const flat = dir.clone().setY(0).normalize();
    const out: Array<{ foe: Actor; along: number }> = [];
    for (const a of this.actors) {
      if (!a.state.alive) continue;
      const p = a.figure.group.position;
      const rx = p.x - from.x, rz = p.z - from.z;
      const along = rx * flat.x + rz * flat.z;
      if (along < 0 || along > range) continue;
      const lateral = Math.abs(rx * flat.z - rz * flat.x);
      if (lateral <= width + a.spec.radius) out.push({ foe: a, along });
    }
    return out.sort((a, b) => a.along - b.along);
  }

  /** Creatures the caster can see (in front, in range). */
  private visible(range = 48): Actor[] {
    const forward = this.camera.getWorldDirection(this.scratch2).setY(0).normalize();
    return this.actors.filter((a) => {
      if (!a.state.alive || a.figure.fade > 0.6) return false;
      const p = a.figure.group.position;
      const dx = p.x - this.camera.position.x, dz = p.z - this.camera.position.z;
      const d = Math.hypot(dx, dz);
      return d < range && (dx * forward.x + dz * forward.z) / Math.max(d, 1e-3) > 0.2;
    });
  }

  /**
   * Resolve a spell that lands on many creatures or a place. Hits are queued on the game clock with
   * the delays the visuals use, and the returned points tell the effect where to draw.
   */
  resolve(effect: SpellEffect, aim: THREE.Ray, aimFoe: Foe | null, aimPoint: THREE.Vector3): { points: THREE.Vector3[]; delays: number[]; lane?: { from: THREE.Vector3; to: THREE.Vector3 } } {
    const points: THREE.Vector3[] = [], delays: number[] = [];
    const queue = (foe: Actor, delay: number, amount?: number, as: SpellEffect = effect) => {
      const point = this.centre(foe, new THREE.Vector3());
      points.push(point.clone());
      delays.push(delay);
      this.queued.push({ foe, effect: as, at: this.time + delay, point, amount, generation: this.generation });
    };
    const ground = this.camera.position.clone().setY(terrainHeight(this.camera.position.x, this.camera.position.z));
    const dir = aim.direction.clone();
    switch (effect) {
      case 'roots': {
        const at = aimFoe ? (aimFoe as Actor).figure.group.position.clone() : aimPoint.clone().setY(terrainHeight(aimPoint.x, aimPoint.z));
        points.push(at.clone());
        delays.push(0.55);
        for (const a of this.actors) if (a.state.alive && a.figure.group.position.distanceTo(at) < 2.6 + a.spec.radius) this.queued.push({ foe: a, effect, at: this.time + 0.55, point: this.centre(a, new THREE.Vector3()), generation: this.generation });
        return { points, delays };
      }
      case 'blade': case 'quake': case 'stag': case 'dawn': {
        const width = effect === 'blade' ? 1.4 : effect === 'quake' ? 2.0 : effect === 'stag' ? 2.4 : 1.6;
        const speed = effect === 'blade' ? 34 : effect === 'quake' ? 22 : effect === 'stag' ? 18 : 90;
        const hits = this.lane(ground, dir, width);
        for (const { foe, along } of hits) queue(foe, 0.18 + along / speed);
        if (effect === 'dawn') for (const a of this.visible()) if (!hits.some((h) => h.foe === a)) queue(a, 0.5, 40);
        const to = ground.clone().addScaledVector(dir.clone().setY(0).normalize(), 50);
        return { points, delays, lane: { from: ground, to } };
      }
      case 'wisps': {
        const from = aimPoint;
        const near = this.visible().sort((a, b) => a.figure.group.position.distanceTo(from) - b.figure.group.position.distanceTo(from)).slice(0, 4);
        near.forEach((a, i) => queue(a, 0.75 + i * 0.12 + a.figure.group.position.distanceTo(this.camera.position) * 0.018));
        return { points, delays };
      }
      case 'flare': for (const a of this.visible()) queue(a, 0.25); return { points, delays };
      case 'tide': for (const a of this.visible(60)) queue(a, 0.6 + a.figure.group.position.distanceTo(this.camera.position) / 30); return { points, delays };
      case 'starfall': {
        const all = this.visible(60);
        all.forEach((a, i) => queue(a, 0.9 + i * 0.18));
        if (aimFoe && all.includes(aimFoe as Actor)) queue(aimFoe as Actor, 1.4 + all.length * 0.18);
        return { points, delays };
      }
      case 'stillness': for (const a of this.actors) if (a.state.alive) { a.state.stunFor(6); a.figure.still(a.boss ? 3 : 6); } return { points, delays };
      default: return { points, delays };
    }
  }

  /** A single-target spell reaches its creature. */
  impact(foe: Foe, effect: SpellEffect, point: THREE.Vector3): () => void {
    const generation = this.generation;
    return () => { if (generation === this.generation) this.hitFoe(foe as Actor, effect, point); };
  }

  private hitFoe(a: Actor, effect: SpellEffect, point: THREE.Vector3, amount?: number): void {
    if (this.disposed || !a.state.alive || !this.active) return;
    const before = a.state.health;
    const base = amount ?? SPELL_DAMAGE[effect] ?? 0;
    if (!a.state.hit(effect, base)) {
      if (effect === 'flare' || effect === 'stillness') a.state.stunFor(1.8);
      return;
    }
    this.stats.hits++;
    if (effect === 'fire') { a.state.burn = 4; a.burnTick = 1; }
    if (effect === 'roots' || effect === 'quake') a.state.rootFor(effect === 'roots' ? 4 : 1.2);
    if (effect === 'flare' || effect === 'quake') a.state.stunFor(effect === 'flare' ? 1.8 : 1);
    if (effect === 'tide') this.push(a, 4);
    a.figure.hit(Math.min(2, base / 40));
    if (effect === 'frost') a.figure.u.uFlashColor.value.set('#bfe3ff');
    else if (effect === 'fire') a.figure.u.uFlashColor.value.set('#ffb066');
    else a.figure.u.uFlashColor.value.set('#fff2d8');
    const top = a.figure.group.position.clone();
    this.indicators.hit(a.id, this.centre(a, new THREE.Vector3()).setY(top.y + a.spec.height * 0.75 + (a.spec.hover ? a.altitude : 0)), before - a.state.health, effect);
    if (a.state.alive) this.fx.events?.emit({ type: 'enemy-hit', kind: a.kind, position: top, pan: this.pan(top), effect });
    else this.release(a);
    if (effect === 'frost') this.fx.particles?.burst(point, 18, { speed: 2.4, color: new THREE.Color('#cfe8ff'), size: 0.06, ttl: 0.8, gravity: 4, drag: 1.2, style: 'spark' });
    this.checkPhase(a);
  }

  private release(a: Actor): void {
    this.stats.released++;
    a.warning.visible = false;
    a.rush = null;
    this.fx.events?.emit({ type: 'enemy-death', kind: a.kind, position: a.figure.group.position.clone(), pan: this.pan(a.figure.group.position), height: a.spec.height, boss: a.boss });
    if (a.boss) {
      // A boss's fall clears its court and every attack still in the air.
      this.clearProjectiles();
      for (const other of this.actors) if (other !== a && other.state.alive) { other.state.hit('dawn', 99999); this.fx.events?.emit({ type: 'enemy-death', kind: other.kind, position: other.figure.group.position.clone(), pan: this.pan(other.figure.group.position), height: other.spec.height }); }
      this.pendingSpawns.length = 0;
    }
  }

  private checkPhase(a: Actor): void {
    if (!a.boss || !a.state.alive) return;
    const fraction = a.state.health / a.state.maxHealth;
    const phase = fraction < 0.34 ? 2 : fraction < 0.67 ? 1 : 0;
    if (phase <= a.bossPhase) return;
    a.bossPhase = phase;
    a.haste = 1 + phase * 0.14;
    this.fx.events?.emit({ type: 'boss', kind: a.kind, phase, name: a.spec.name, title: a.spec.title ?? '' });
    const court = COURT[a.kind]?.[phase - 1];
    if (court && a.spec.rank === 'final') {
      let slot = 0, at = this.time + 1.2;
      for (const g of court) for (let i = 0; i < g.count; i++) { this.pendingSpawns.push({ at, kind: g.kind, from: g.from ?? 'front', slot: 100 + phase * 20 + slot++ }); at += 0.4; }
    }
  }

  private push(a: Actor, metres: number): void {
    const p = a.figure.group.position;
    const away = this.scratch.set(p.x - this.camera.position.x, 0, p.z - this.camera.position.z).normalize();
    moveOnGround(p, away.x * metres, away.z * metres, this.obstacles);
    p.y -= EYE_HEIGHT;
  }

  /* ─────────────────────────────── the frame ─────────────────────────────── */

  update(dt: number, paused: boolean, reducedMotion: boolean): void {
    if (paused || this.disposed) { this.updateIndicators(0, true, reducedMotion); return; }
    dt = Math.min(dt, 0.05);
    this.time += dt;
    if (this.active) this.stats.time += dt;
    this.player.update(dt);
    if (this.player.darkness > 0 && this.active) {
      // The King's darkness drains the caster slowly until it lifts or light breaks it.
      this.player.health = Math.max(1, this.player.health - 2.2 * dt);
    }
    this.updateFlow(dt);
    const fighting = this.active && this.player.alive;
    PLAYER_GROUND.copy(this.camera.position).setY(terrainHeight(this.camera.position.x, this.camera.position.z));
    for (const a of this.actors) this.updateActor(a, dt, fighting, reducedMotion);
    // Spells queued on the game clock.
    for (let i = this.queued.length - 1; i >= 0; i--) {
      const q = this.queued[i];
      if (q.generation !== this.generation) { this.queued.splice(i, 1); continue; }
      if (this.time >= q.at) { this.queued.splice(i, 1); this.hitFoe(q.foe, q.effect, q.point, q.amount); }
    }
    // Remove creatures that have finished dissolving.
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (!a.state.alive && a.state.progress >= 1) {
        if (a.removeAt < 0) a.removeAt = this.time + 0.3;
        else if (this.time > a.removeAt) { a.figure.dispose(); a.warning.removeFromParent(); (a.warning.material as THREE.Material).dispose(); this.actors.splice(i, 1); }
      }
    }
    this.sortDepth();
    this.summons.update(dt, fighting, this.camera.position,
      this.actors.map((a) => ({ id: a.id, position: a.figure.group.position, height: a.spec.height, alive: a.state.alive })), reducedMotion);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updateIndicators(dt, false, reducedMotion);
  }

  private updateActor(a: Actor, dt: number, fighting: boolean, reducedMotion: boolean): void {
    const p = a.figure.group.position;
    const spec = a.spec;
    let dx = this.camera.position.x - p.x, dz = this.camera.position.z - p.z;
    const distance = Math.hypot(dx, dz) || 0.001;
    dx /= distance; dz /= distance;
    const emerging = a.figure.fade > 0.25 && a.state.alive;
    const los = this.lineOfSight(a);
    const strike = !emerging && a.state.update(dt * a.haste, distance, los, fighting || !a.state.alive);
    if (a.state.pose !== a.lastPose) {
      if (a.state.pose === 'windup') this.windup(a);
      a.lastPose = a.state.pose;
    }
    // Burning.
    if (a.state.burn > 0 && a.state.alive) {
      a.state.burn = Math.max(0, a.state.burn - dt);
      a.burnTick -= dt;
      if (Math.random() < dt * 30) {
        const c = this.centre(a, this.scratch);
        this.fx.particles?.emit({ x: c.x + (Math.random() - 0.5) * spec.radius, y: c.y + (Math.random() - 0.3) * spec.height * 0.5, z: c.z + (Math.random() - 0.5) * spec.radius, vx: 0, vy: 1 + Math.random(), vz: 0, color: new THREE.Color(Math.random() < 0.5 ? '#ff8a3d' : '#ffd08a'), size: 0.12, sizeEnd: 0.01, ttl: 0.6, drag: 1, gravity: -1, style: 'glow' });
      }
      if (a.burnTick <= 0) { a.burnTick = 1; this.hitFoe(a, 'fire', this.centre(a, new THREE.Vector3()), 6); }
    }
    if (strike && fighting) this.strike(a, distance, los);
    // Movement.
    a.velocity.set(0, 0, 0);
    let faceYaw: number | null = Math.atan2(dx, dz);
    if (a.blink) this.updateBlink(a, dt);
    else if (a.rush && a.state.pose === 'strike') this.updateRush(a, dt, distance);
    else if (fighting && a.state.alive && a.state.mobile && a.state.pose === 'walk' && !emerging) {
      this.steer(a, distance, dx, dz, dt);
      const speed = Math.hypot(a.velocity.x, a.velocity.z);
      // At a distance, a creature faces where it is going, so its flanking and side-stepping read
      // as movement across the wood; close in, it squares up to the caster and steps sideways.
      const engage = a.boss || spec.role === 'ranged' ? 99 : spec.role === 'flyer' ? 6 : 9;
      if (speed > 0.2 && distance > engage) faceYaw = Math.atan2(a.velocity.x, a.velocity.z);
    } else if (!a.state.alive) faceYaw = null;
    if (a.state.pose === 'recover' && a.rush) a.rush = null;
    // Fliers rise and fall; a dive brings them down to the caster.
    if (spec.hover) {
      const want = a.state.pose === 'windup' ? spec.hover + 0.9 : a.state.pose === 'strike' && a.rush ? 0.8 : spec.hover + Math.sin(this.time * 0.9 + a.phase) * 0.5;
      a.altitude += (want - a.altitude) * Math.min(1, dt * (a.state.pose === 'strike' ? 5 : 1.5));
      if (!a.state.alive) a.altitude = Math.max(0.2, a.altitude - dt * 1.5);
    }
    a.figure.update(dt, {
      pose: a.state.pose, progress: a.state.progress, attack: a.state.attack.id, velocity: a.velocity, faceYaw,
      look: this.camera.position, groundY: p.y + (spec.hover ? a.altitude : 0), reducedMotion,
    });
    if (spec.hover) a.figure.lift.position.y += a.altitude;
    if (a.blink) a.figure.u.uDissolve.value = a.blink.age < 0.45 ? a.blink.age / 0.45 : Math.max(0, 1 - (a.blink.age - 0.45) / 0.45);
    // Wind-up warning on the ground.
    a.warning.visible = fighting && a.state.pose === 'windup' && (a.state.attack.type === 'melee' || a.state.attack.type === 'charge' || a.state.attack.type === 'dive');
    if (a.warning.visible) {
      a.warning.position.set(p.x, p.y + 0.04, p.z);
      const size = Math.max(1, a.state.attack.type === 'melee' ? a.state.attack.range[1] : spec.radius * 2);
      a.warning.scale.setScalar(size * (0.7 + a.state.progress * 0.3));
      a.warning.material.opacity = 0.16 + a.state.progress * 0.4;
      a.warning.material.color.set(BOSS_COLOR[a.kind] ?? '#dfb47f');
    }
  }

  private lineOfSight(a: Actor): boolean {
    const from = this.centre(a, this.scratch2);
    this.scratch.copy(this.camera.position).sub(from);
    const distance = this.scratch.length();
    this.ray.set(from, this.scratch.normalize());
    const block = this.intersectEnvironment(this.ray, distance);
    return block === null || block >= distance - 0.25;
  }

  /** Movement intent for one creature by its role. */
  private steer(a: Actor, distance: number, dx: number, dz: number, dt: number): void {
    const spec = a.spec, p = a.figure.group.position;
    a.strafeTimer -= dt;
    if (a.strafeTimer <= 0) { a.strafe = -a.strafe; a.strafeTimer = 1.4 + Math.random() * 2.4; }
    let forward = 1, lateral = 0;
    const sideX = -dz, sideZ = dx;
    switch (spec.role) {
      case 'melee':
        lateral = distance < 16 && distance > spec.range + 0.6 ? a.strafe * (a.kind === 'goblin' ? 0.85 : 0.35) : Math.sin(this.time * 0.6 + a.phase) * 0.25;
        break;
      case 'swarm':
        lateral = Math.sin(this.time * 2.2 + a.phase) * 0.9;
        break;
      case 'ranged':
        forward = distance > 13 ? 1 : distance < 8 ? -0.7 : 0;
        lateral = a.strafe * (distance < 15 ? 1 : 0.3);
        break;
      case 'charger':
        forward = distance > 12 ? 1 : 0.15;
        lateral = distance < 18 ? a.strafe * 0.9 : 0.2 * Math.sin(this.time + a.phase);
        break;
      case 'flyer':
        forward = distance > 7 ? 1 : 0.2;
        lateral = Math.sin(this.time * 0.8 + a.phase) * 1.6;
        break;
      case 'boss': {
        const melee = spec.attacks.some((x) => x.type === 'melee');
        const prefer = melee ? 4.5 : 12;
        forward = distance > prefer + 6 ? 1 : distance < prefer - 1 ? -0.4 : 0.15;
        lateral = a.strafe * 0.55;
        break;
      }
    }
    let vx = dx * forward + sideX * lateral, vz = dz * forward + sideZ * lateral;
    for (const o of this.obstacles) {
      const ox = p.x - o.x, oz = p.z - o.z, d = Math.hypot(ox, oz), safe = o.radius + spec.radius + 1.6;
      if (d < safe && d > 0.01) { const w = (safe - d) / safe * 2.4; vx += ox / d * w; vz += oz / d * w; const s = Math.sin(a.phase) > 0 ? 1 : -1; vx += -oz / d * w * 0.6 * s; vz += ox / d * w * 0.6 * s; }
    }
    for (const other of this.actors) {
      if (other === a || !other.state.alive) continue;
      const q = other.figure.group.position, ox = p.x - q.x, oz = p.z - q.z, d = Math.hypot(ox, oz), safe = spec.radius + other.spec.radius + 0.7;
      if (d < safe && d > 0.01) { vx += ox / d * (safe - d) * 1.5; vz += oz / d * (safe - d) * 1.5; }
    }
    // Never walk into the caster.
    if (distance < spec.radius + 1.4) { vx -= dx * 1.5; vz -= dz * 1.5; }
    const length = Math.hypot(vx, vz);
    if (length < 0.05) return;
    const speed = spec.speed * (this.level?.scaling.speed ?? 1) * a.haste * (a.state.slow > 0 ? 0.5 : 1) * Math.min(1, length);
    a.velocity.set(vx / length * speed, 0, vz / length * speed);
    moveOnGround(p, a.velocity.x * dt, a.velocity.z * dt, this.obstacles);
    p.y -= EYE_HEIGHT;
  }

  /** The tell: sound, and for ground attacks a mark that shows where it will land. */
  private windup(a: Actor): void {
    const attack = a.state.attack;
    const p = a.figure.group.position;
    this.fx.events?.emit({ type: 'enemy-windup', kind: a.kind, position: p.clone(), pan: this.pan(p), attack: attack.type, boss: a.boss });
    if (attack.type === 'spikes' || attack.type === 'charge') {
      const to = PLAYER_GROUND.clone();
      this.telegraph(p.clone(), to, attack.windup, attack.type === 'spikes' ? 1.2 : a.spec.radius * 1.6, new THREE.Color(BOSS_COLOR[a.kind] ?? '#ff8a5a'));
    }
  }

  private strike(a: Actor, distance: number, los: boolean): void {
    const attack = a.state.attack;
    const p = a.figure.group.position;
    const damage = a.state.damage;
    const color = new THREE.Color(BOSS_COLOR[a.kind] ?? COLORS.ember);
    this.fx.events?.emit({ type: 'enemy-strike', kind: a.kind, position: p.clone(), pan: this.pan(p), attack: attack.type, boss: a.boss });
    const from = a.figure.castPoint(new THREE.Vector3());
    switch (attack.type) {
      case 'melee': {
        const facing = this.scratch.set(Math.sin(a.figure.yaw), 0, Math.cos(a.figure.yaw));
        const toward = this.scratch2.set(this.camera.position.x - p.x, 0, this.camera.position.z - p.z).normalize();
        if (distance <= attack.range[1] + 0.4 && los && facing.dot(toward) > 0.4) this.damage(damage, a.kind);
        if (a.boss) this.groundBurst(p.clone().addScaledVector(facing, a.spec.radius + 1), color, 0.8);
        break;
      }
      case 'bolt': this.fire(a, 'ember', from, damage, 'straight', 3.6); break;
      case 'volley': {
        const style: ProjectileStyle = a.kind === 'widow' ? 'lantern' : a.kind === 'herald' ? 'pale' : 'bile';
        const n = attack.count ?? 3;
        for (let i = 0; i < n; i++) this.fire(a, style, from, damage, 'straight', 5 + i * 0.3, (i - (n - 1) / 2) * 0.16, i * 0.12);
        break;
      }
      case 'lob': {
        const n = attack.count ?? 1;
        for (let i = 0; i < n; i++) this.fire(a, a.kind === 'grael' ? 'boulder' : 'bile', from, damage, 'arc', 1.3 + i * 0.25, (i - (n - 1) / 2) * 0.5, i * 0.2);
        break;
      }
      case 'swarm': {
        const n = attack.count ?? 4;
        const style: ProjectileStyle = a.kind === 'stag' ? 'cold' : 'moth';
        for (let i = 0; i < n; i++) this.fire(a, style, from, damage, 'seek', 4.2, (i - (n - 1) / 2) * 0.5, i * 0.15);
        break;
      }
      case 'charge': case 'dive': {
        const dir = this.scratch.set(this.camera.position.x - p.x, 0, this.camera.position.z - p.z).normalize().clone();
        a.rush = { dir, speed: attack.type === 'dive' ? 11 : a.boss ? 13 : 10, hit: false, from: p.clone() };
        break;
      }
      case 'shockwave': case 'toll': this.shockwave(a, damage, attack.type === 'toll' ? 14 : 10, color, attack.type === 'toll'); break;
      case 'spikes': this.spikes(a, damage, color); break;
      case 'gust': {
        this.fx.events?.emit({ type: 'gust', position: p.clone(), color: color.getHexString() });
        for (let i = 0; i < 30; i++) {
          const o = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 0));
          const v = this.camera.position.clone().sub(o).normalize().multiplyScalar(9 + Math.random() * 4);
          this.fx.mist?.emit({ x: o.x, y: o.y, z: o.z, vx: v.x, vy: v.y, vz: v.z, color: new THREE.Color('#8a8070'), size: 0.8, sizeEnd: 2.6, alpha: 0.3, ttl: 1.8, drag: 0.4, style: 'mist' });
        }
        this.queueDamage(distance / 12, damage);
        break;
      }
      case 'stars': {
        const n = attack.count ?? 6;
        for (let i = 0; i < n; i++) {
          const aimed = i < 2;
          const to = PLAYER_GROUND.clone().add(aimed ? new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, -0.5) : new THREE.Vector3((Math.random() - 0.5) * 14, 0, -3 - Math.random() * 14));
          to.y = terrainHeight(to.x, to.z);
          this.fallingStar(a, to, aimed ? damage : 0, i * 0.28, color);
        }
        break;
      }
      case 'darkness':
        this.player.darkness = 9;
        this.fx.events?.emit({ type: 'darkness', seconds: 9 });
        break;
      case 'summon': {
        const s = attack.summon!;
        for (let i = 0; i < s.count; i++) {
          const offset = new THREE.Vector3((i - (s.count - 1) / 2) * 2.2, 0, 1.5 + Math.random());
          const at = p.clone().add(offset.applyAxisAngle(UP, a.figure.yaw));
          moveOnGround(at, 0, 0, this.obstacles);
          at.y = terrainHeight(at.x, at.z);
          const minion = this.spawn(s.kind, 'front', 200 + i, false, at);
          minion.figure.awaken(1.1);
        }
        break;
      }
      case 'blink': {
        const r = Math.random();
        const to = new THREE.Vector3((r - 0.5) * 20, 0, -8 - Math.random() * 14);
        moveOnGround(to, 0, 0, this.obstacles);
        to.y = terrainHeight(to.x, to.z);
        a.blink = { age: 0, to, moved: false };
        break;
      }
    }
  }

  private updateRush(a: Actor, dt: number, distance: number): void {
    const r = a.rush!;
    const p = a.figure.group.position;
    const step = r.speed * dt;
    a.velocity.copy(r.dir).multiplyScalar(r.speed);
    if (distance > a.spec.radius + 0.9) {
      moveOnGround(p, r.dir.x * step, r.dir.z * step, this.obstacles);
      p.y -= EYE_HEIGHT;
    }
    if (!r.hit && distance < a.spec.radius + 1.5) {
      r.hit = true;
      this.damage(a.state.damage, a.kind);
      this.groundBurst(p.clone(), new THREE.Color(BOSS_COLOR[a.kind] ?? '#c9b48a'), a.boss ? 1 : 0.5);
    }
    if (Math.random() < dt * 30) this.fx.mist?.emit({ x: p.x, y: p.y + 0.2, z: p.z, vx: 0, vy: 0.4, vz: 0, color: new THREE.Color('#5d5448'), size: 0.6, sizeEnd: 1.4, alpha: 0.3, ttl: 0.8, drag: 2, style: 'mist' });
  }

  private updateBlink(a: Actor, dt: number): void {
    const b = a.blink!;
    b.age += dt;
    const p = a.figure.group.position;
    if (!b.moved && b.age > 0.45) {
      this.fx.particles?.burst(this.centre(a, new THREE.Vector3()), 30, { speed: 2, color: new THREE.Color(BOSS_COLOR[a.kind] ?? '#ffffff'), size: 0.1, ttl: 0.8, drag: 1.5, style: 'glow' });
      p.copy(b.to);
      b.moved = true;
      this.fx.particles?.burst(this.centre(a, new THREE.Vector3()), 30, { speed: 2, color: new THREE.Color(BOSS_COLOR[a.kind] ?? '#ffffff'), size: 0.1, ttl: 0.8, drag: 1.5, style: 'glow' });
    }
    if (b.age > 0.95) a.blink = null;
  }

  /* ─────────────────────────────── projectiles ─────────────────────────────── */

  private material(m: THREE.Material): THREE.Material { this.shared.push(m); return m; }

  private projectileMesh(style: ProjectileStyle, color: THREE.Color): THREE.Object3D {
    const group = new THREE.Group();
    if (style === 'boulder') {
      const rock = new THREE.Mesh(this.rockGeometry, new THREE.MeshStandardMaterial({ color: '#6f6a5e', roughness: 0.95, flatShading: true }));
      group.add(rock);
      return group;
    }
    const core = new THREE.Mesh(this.orbGeometry, new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.setScalar(style === 'star' ? 1.8 : style === 'bile' ? 1.4 : style === 'moth' ? 0.6 : 1);
    group.add(core);
    group.add(glowSprite(color, style === 'star' ? 1.6 : style === 'moth' ? 0.5 : 0.85, undefined, 0.85));
    if (style === 'moth') {
      // A little moth: two dusty wings that beat.
      const wing = new THREE.Mesh(new THREE.CircleGeometry(0.16, 8), new THREE.MeshBasicMaterial({ color: '#6e6455', side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
      wing.position.x = 0.14; wing.name = 'wingL';
      const wing2 = wing.clone(); wing2.position.x = -0.14; wing2.name = 'wingR';
      group.add(wing, wing2);
    }
    return group;
  }

  private fire(a: Actor | null, style: ProjectileStyle, from: THREE.Vector3, damage: number, mode: Projectile['mode'], speed: number, spread = 0, delay = 0): void {
    const color = new THREE.Color(COLORS[style]);
    const group = this.projectileMesh(style, color);
    group.position.copy(from);
    group.visible = delay <= 0;
    this.group.add(group);
    const target = this.camera.position.clone().add(new THREE.Vector3(spread * 2.2, -0.25, 0));
    const velocity = new THREE.Vector3();
    if (mode === 'arc') {
      const time = speed;
      velocity.copy(target).sub(from).multiplyScalar(1 / time);
      velocity.y += 0.5 * 9.8 * time;
    } else {
      velocity.copy(target).sub(from).normalize().multiplyScalar(speed);
      if (mode === 'seek') velocity.add(new THREE.Vector3(spread * 4, 2 + Math.random() * 2, 0));
    }
    const trail = style === 'boulder' ? null : new Trail(color, style === 'star' ? 0.3 : 0.14, style === 'star' ? 0.8 : 0.45, 30, 0.8);
    if (trail) this.group.add(trail.mesh);
    this.projectiles.push({ group, velocity, mode, speed, damage, age: 0, delay, ttl: mode === 'arc' ? speed + 2 : 9, style, color, trail, source: a, reflected: false, target });
    if (delay <= 0) this.fx.events?.emit({ type: 'projectile', position: from.clone(), pan: this.pan(from), style });
  }

  private fallingStar(a: Actor, to: THREE.Vector3, damage: number, delay: number, color: THREE.Color): void {
    const from = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 22, -6));
    const group = this.projectileMesh('star', color);
    group.position.copy(from);
    group.visible = false;
    this.group.add(group);
    const trail = new Trail(color, 0.35, 0.9, 30, 0.8);
    this.group.add(trail.mesh);
    const time = 1.3;
    const velocity = to.clone().sub(from).multiplyScalar(1 / time);
    this.projectiles.push({ group, velocity, mode: 'fall', speed: time, damage, age: 0, delay, ttl: time + delay + 0.2, style: 'star', color, trail, source: a, reflected: false, target: to.clone() });
    this.mark(to, 0.6 + 0.9 * (damage > 0 ? 1.4 : 1), time + delay, color);
  }

  private updateProjectiles(dt: number): void {
    const eye = this.camera.position;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      if (pr.delay > 0) {
        pr.delay -= dt;
        if (pr.delay <= 0) { pr.group.visible = true; this.fx.events?.emit({ type: 'projectile', position: pr.group.position.clone(), pan: this.pan(pr.group.position), style: pr.style }); }
        else continue;
      }
      pr.age += dt;
      const p = pr.group.position;
      const from = p.clone();
      if (pr.mode === 'arc') pr.velocity.y -= 9.8 * dt;
      if (pr.mode === 'seek' && !pr.reflected) {
        // Homing: curve toward the caster, tightening over time.
        const want = this.scratch.copy(eye).add(new THREE.Vector3(0, -0.3, 0)).sub(p).normalize().multiplyScalar(pr.speed * (1 + pr.age * 0.3));
        pr.velocity.lerp(want, Math.min(1, dt * (1.2 + pr.age * 1.5)));
      }
      p.addScaledVector(pr.velocity, dt);
      pr.group.lookAt(this.scratch.copy(p).add(pr.velocity));
      pr.group.rotateZ(pr.age * 4);
      if (pr.style === 'moth') {
        const beat = Math.sin(pr.age * 40) * 0.9;
        const l = pr.group.getObjectByName('wingL'), r = pr.group.getObjectByName('wingR');
        if (l) l.rotation.y = beat; if (r) r.rotation.y = -beat;
      }
      if (pr.style === 'boulder') { pr.group.rotation.x += dt * 4; pr.group.rotation.y += dt * 3; }
      if (pr.trail) { pr.trail.push(p); pr.trail.update(dt, eye); }
      if (Math.random() < dt * 30 && pr.style !== 'boulder') this.fx.particles?.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.4, vy: 0.3, vz: (Math.random() - 0.5) * 0.4, color: pr.color, size: 0.07, sizeEnd: 0.01, ttl: 0.5, drag: 1, gravity: pr.style === 'bile' ? 3 : -0.4, style: 'glow' });
      // Moonveil turns projectiles back on their makers.
      const near = p.distanceTo(eye);
      if (!pr.reflected && this.player.veil > 0 && near < 3.2 && pr.mode !== 'fall') {
        pr.reflected = true;
        pr.mode = 'straight';
        const back = pr.source && pr.source.state.alive ? this.centre(pr.source, new THREE.Vector3()) : p.clone().add(pr.velocity.clone().negate().multiplyScalar(10));
        pr.velocity.copy(back.sub(p).normalize().multiplyScalar(14));
        this.fx.events?.emit({ type: 'player-blocked' });
      }
      let done = pr.age > pr.ttl;
      if (pr.reflected && pr.source && pr.source.state.alive && p.distanceTo(this.centre(pr.source, this.scratch)) < pr.source.spec.radius + 0.8) {
        this.hitFoe(pr.source, 'blade', p.clone(), 25);
        done = true;
      }
      if (!pr.reflected && pr.mode !== 'fall' && near < (pr.style === 'boulder' ? 1.3 : 0.8)) { this.damage(pr.damage, 'projectile'); done = true; }
      if (pr.mode === 'fall' && pr.target && p.y <= pr.target.y + 0.2) {
        this.groundBurst(pr.target.clone(), pr.color, 0.9);
        if (pr.damage > 0 && pr.target.distanceTo(PLAYER_GROUND) < 2.2) this.damage(pr.damage, 'star');
        done = true;
      }
      if (!done && pr.mode !== 'fall') {
        this.ray.set(from, this.scratch.copy(p).sub(from).normalize());
        const block = this.intersectEnvironment(this.ray, from.distanceTo(p));
        if (block !== null || p.y < terrainHeight(p.x, p.z) - 0.1) {
          this.fx.particles?.burst(p.clone(), 16, { speed: 2.2, color: pr.color, size: 0.07, ttl: 0.5, gravity: 4, drag: 1.2, style: 'spark' });
          done = true;
        }
      }
      if (done) { this.removeProjectile(i); }
    }
  }

  private removeProjectile(i: number): void {
    const pr = this.projectiles[i];
    pr.group.removeFromParent();
    pr.group.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) (o.material as THREE.Material).dispose(); });
    pr.trail?.dispose();
    this.projectiles.splice(i, 1);
  }

  private clearProjectiles(): void { while (this.projectiles.length) this.removeProjectile(this.projectiles.length - 1); }

  /* ─────────────────────────────── ground hazards ─────────────────────────────── */

  private hazardMaterial(color: THREE.Color): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: color.clone() }, uAlpha: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec2 vUv;
        void main(){ float edge = 1.0 - abs(vUv.y * 2.0 - 1.0); float pulse = 0.65 + 0.35 * sin(uTime * 14.0 - vUv.x * 30.0);
          gl_FragColor = vec4(uColor * 1.4, pow(edge, 1.5) * uAlpha * pulse); }`,
    });
  }

  private telegraph(from: THREE.Vector3, to: THREE.Vector3, life: number, width: number, color: THREE.Color): void {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const geometry = new THREE.PlaneGeometry(length, width, 24, 1);
    geometry.translate(length / 2, 0, 0);
    const mesh = new THREE.Mesh(geometry, this.hazardMaterial(color));
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.atan2(-(to.z - from.z), to.x - from.x);
    mesh.position.set(from.x, Math.max(terrainHeight(from.x, from.z), terrainHeight(to.x, to.z)) + 0.06, from.z);
    mesh.renderOrder = 3;
    this.group.add(mesh);
    this.hazards.push({ kind: 'telegraph', object: mesh, age: 0, life, origin: from, dir: new THREE.Vector3(), reach: length, speed: 0, damage: 0, hit: true, color, source: null });
  }

  private mark(at: THREE.Vector3, radius: number, life: number, color: THREE.Color): void {
    const mesh = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(at).setY(at.y + 0.05);
    mesh.scale.setScalar(radius);
    this.group.add(mesh);
    this.hazards.push({ kind: 'star-mark', object: mesh, age: 0, life, origin: at, dir: new THREE.Vector3(), reach: radius, speed: 0, damage: 0, hit: true, color, source: null });
  }

  private shockwave(a: Actor, damage: number, speed: number, color: THREE.Color, toll: boolean): void {
    const at = a.figure.group.position.clone();
    const mesh = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(at).setY(at.y + 0.1);
    this.group.add(mesh);
    const reach = Math.hypot(this.camera.position.x - at.x, this.camera.position.z - at.z) + 4;
    this.hazards.push({ kind: 'shockwave', object: mesh, age: 0, life: reach / speed, origin: at, dir: new THREE.Vector3(), reach, speed, damage, hit: false, color, source: a });
    this.groundBurst(at, color, 1.2);
    if (toll) this.fx.events?.emit({ type: 'toll', position: at });
  }

  private spikes(a: Actor, damage: number, color: THREE.Color): void {
    const from = a.figure.group.position.clone();
    const to = PLAYER_GROUND.clone();
    const dir = to.clone().sub(from).setY(0);
    const reach = dir.length();
    dir.normalize();
    const holder = new THREE.Group();
    const dark = a.kind === 'king';
    const material = new THREE.MeshStandardMaterial({ color: dark ? '#14101c' : '#3a2b1e', roughness: 0.8, emissive: dark ? '#3a2a6a' : '#1a1008', flatShading: true });
    const spikes: THREE.Mesh[] = [];
    const count = Math.ceil(reach / 1.1);
    for (let i = 0; i < count; i++) {
      const s = new THREE.Mesh(this.spikeGeometry, material);
      const at = from.clone().addScaledVector(dir, (i + 1) * 1.1).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6));
      at.y = terrainHeight(at.x, at.z) - 1.8;
      s.position.copy(at);
      s.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5);
      s.scale.set(1, 0.8 + Math.random() * 0.6, 1).multiplyScalar(a.boss ? 1.3 : 1);
      s.userData.base = at.y;
      holder.add(s);
      spikes.push(s);
    }
    this.group.add(holder);
    this.hazards.push({ kind: 'spikes', object: holder, age: 0, life: reach / 11 + 1.4, origin: from, dir, reach, speed: 11, damage, hit: false, color, spikes, source: a });
  }

  private queueDamage(delay: number, damage: number): void {
    this.hazards.push({ kind: 'telegraph', object: new THREE.Object3D(), age: 0, life: delay, origin: new THREE.Vector3(), dir: new THREE.Vector3(), reach: 0, speed: 0, damage, hit: false, color: new THREE.Color(), source: null });
  }

  private groundBurst(at: THREE.Vector3, color: THREE.Color, force: number): void {
    const ground = at.clone().setY(terrainHeight(at.x, at.z) + 0.1);
    this.fx.mist?.burst(ground, Math.round(10 * force), { speed: 2.4 * force, direction: UP, spread: 2.4, color: new THREE.Color('#5d5448'), size: 1.2 * force, sizeEnd: 2.6 * force, alpha: 0.35, ttl: 1.2, drag: 1.8, style: 'mist' });
    this.fx.particles?.burst(ground, Math.round(18 * force), { speed: 4 * force, direction: UP, spread: 1.4, color: new THREE.Color('#8a7a64'), size: 0.06, ttl: 0.8, gravity: 9, drag: 0.6, style: 'spark' });
    this.fx.particles?.burst(ground, Math.round(10 * force), { speed: 2 * force, color, size: 0.12, sizeEnd: 0.01, ttl: 0.6, drag: 2, style: 'glow' });
    this.fx.events?.emit({ type: 'quake', position: ground, amount: force });
  }

  private updateHazards(dt: number): void {
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.age += dt;
      const t = h.age / h.life;
      if (h.kind === 'telegraph') {
        const m = (h.object as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (m?.uniforms) { m.uniforms.uAlpha.value = Math.min(1, t * 3) * (1 - Math.max(0, t - 0.85) / 0.15) * 0.7; m.uniforms.uTime.value = h.age; }
        if (!h.hit && t >= 1) { h.hit = true; this.damage(h.damage, 'gust'); }
      } else if (h.kind === 'star-mark') {
        const m = (h.object as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = Math.min(1, t * 2) * 0.7 * (0.7 + 0.3 * Math.sin(h.age * 18));
        h.object.scale.setScalar(h.reach * (1.4 - t * 0.4));
      } else if (h.kind === 'shockwave') {
        const radius = h.age * h.speed;
        h.object.scale.setScalar(Math.max(0.1, radius));
        ((h.object as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
        const d = Math.hypot(this.camera.position.x - h.origin.x, this.camera.position.z - h.origin.z);
        if (Math.random() < dt * 40) {
          const a = Math.random() * Math.PI * 2;
          const q = h.origin.clone().add(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
          q.y = terrainHeight(q.x, q.z) + 0.1;
          this.fx.mist?.emit({ x: q.x, y: q.y, z: q.z, vx: Math.cos(a) * 2, vy: 0.8, vz: Math.sin(a) * 2, color: new THREE.Color('#5d5448'), size: 0.7, sizeEnd: 1.6, alpha: 0.3, ttl: 0.9, drag: 2, style: 'mist' });
        }
        if (!h.hit && radius >= d) { h.hit = true; this.damage(h.damage, 'shockwave'); }
      } else if (h.kind === 'spikes') {
        const front = h.age * h.speed;
        h.spikes!.forEach((s, k) => {
          const along = (k + 1) * 1.1;
          const rise = THREE.MathUtils.clamp((front - along) * 3, 0, 1) * (1 - THREE.MathUtils.clamp((h.age - h.life + 0.6) / 0.6, 0, 1));
          s.position.y = s.userData.base + rise * 2.2;
          if (rise > 0 && rise < 0.2 && Math.random() < 0.3) this.groundBurst(s.position.clone(), h.color, 0.25);
        });
        if (!h.hit && front >= h.reach) { h.hit = true; this.damage(h.damage, 'spikes'); }
      }
      if (h.age >= h.life + (h.kind === 'spikes' ? 0 : 0.05)) {
        h.object.removeFromParent();
        h.object.traverse((o) => { if (o instanceof THREE.Mesh) { if (o.geometry !== this.ringGeometry && o.geometry !== this.spikeGeometry) o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
        this.hazards.splice(i, 1);
      }
    }
  }

  /* ─────────────────────────────── presentation helpers ─────────────────────────────── */

  private sortDepth(): void {
    this.depthOrder.length = 0;
    for (const a of this.actors) this.depthOrder.push({ figure: a.figure.mesh, distance: a.figure.group.position.distanceToSquared(this.camera.position) });
    for (const figure of this.summons.figures()) this.depthOrder.push({ figure, distance: figure.getWorldPosition(this.scratch).distanceToSquared(this.camera.position) });
    this.depthOrder.sort((x, y) => y.distance - x.distance);
    this.depthOrder.forEach((entry, i) => { entry.figure.renderOrder = -200 + i; });
  }

  private updateIndicators(dt: number, paused: boolean, reducedMotion: boolean): void {
    this.indicators.update(dt, this.camera, this.actors.filter((a) => !a.boss).map((a) => ({
      id: a.id, position: a.spec.hover ? a.figure.group.position.clone().setY(a.figure.group.position.y + a.altitude) : a.figure.group.position,
      height: a.spec.height, name: a.spec.name, health: a.state.health, maximum: a.state.maxHealth, state: a.state.pose, progress: a.state.progress,
    })), paused, reducedMotion);
  }

  private pan(position: THREE.Vector3): number { return THREE.MathUtils.clamp(this.scratch.copy(position).project(this.camera).x, -1, 1); }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.summons.dispose();
    this.indicators.dispose();
    this.spikeGeometry.dispose();
    this.rockGeometry.dispose();
    this.ringGeometry.dispose();
    this.orbGeometry.dispose();
    for (const m of this.shared) m.dispose();
    this.scene.remove(this.group);
  }
}

/** Kept for callers that only need the attack's type. */
export type { AttackSpec };

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
