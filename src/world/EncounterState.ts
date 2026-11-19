import type { SpellEffect } from '../config/spells.ts';
import type { CreaturePose } from './rig/Rig.ts';

/**
 * THE BESTIARY
 * ────────────
 * Every creature of the Hushwood as numbers: how tough, how fast, how big, and the attacks it
 * knows. Simulation only (deterministic, frame-rate independent, no rendering), so the rules can be
 * tested on their own. A creature picks among its attacks by range, weight and cooldown, winds up
 * (the tell the caster reads), strikes once, and recovers.
 */
export type CreatureKind =
  | 'goblin' | 'root' | 'hollow' | 'wraith' | 'mossling' | 'thornback' | 'moth'
  | 'gorrik' | 'fenwyrm' | 'stag' | 'herald'
  | 'matron' | 'grael' | 'widow' | 'king';

export type Rank = 'normal' | 'sub' | 'final';
/** How it moves: closes to bite, keeps its distance, charges, swarms, flies, or commands a fight. */
export type Role = 'melee' | 'ranged' | 'charger' | 'swarm' | 'flyer' | 'serpent' | 'boss';
export type AttackType =
  | 'melee' | 'bolt' | 'volley' | 'lob' | 'shockwave' | 'spikes' | 'swarm' | 'summon'
  | 'charge' | 'dive' | 'gust' | 'toll' | 'darkness' | 'stars' | 'blink';

export interface AttackSpec {
  id: string;
  type: AttackType;
  /** Distance band (m) in which it will start this attack. */
  range: readonly [number, number];
  windup: number;
  recovery: number;
  damage: number;
  weight?: number;
  /** Seconds before this attack can be chosen again. */
  cooldown?: number;
  count?: number;
  summon?: { kind: CreatureKind; count: number };
  /** Needs a clear line to the caster (default true). */
  sight?: boolean;
}

export interface CreatureSpec {
  name: string;
  /** Shown under a boss's name. */
  title?: string;
  rank: Rank;
  role: Role;
  health: number;
  /** Walking speed (m/s). */
  speed: number;
  radius: number;
  height: number;
  /** Flyers hover this high (m). */
  hover?: number;
  attacks: readonly AttackSpec[];
  /** The first attack's numbers, for simple creatures and older callers. */
  range: number;
  windup: number;
  recovery: number;
  damage: number;
}

const spec = (s: Omit<CreatureSpec, 'range' | 'windup' | 'recovery' | 'damage'>): CreatureSpec => ({
  ...s, range: s.attacks[0].range[1], windup: s.attacks[0].windup, recovery: s.attacks[0].recovery, damage: s.attacks[0].damage,
});

export const CREATURE_SPECS: Record<CreatureKind, CreatureSpec> = {
  /* ── the wood's common spirits ── */
  goblin: spec({ name: 'Bramble Goblin', rank: 'normal', role: 'melee', health: 65, speed: 1.55, radius: 0.5, height: 1.8,
    attacks: [{ id: 'rake', type: 'melee', range: [0, 2.15], windup: 1.8, recovery: 3.2, damage: 11 }] }),
  root: spec({ name: 'Rootbound', rank: 'normal', role: 'melee', health: 150, speed: 0.5, radius: 0.8, height: 3.8,
    attacks: [{ id: 'slam', type: 'melee', range: [0, 3.15], windup: 2.6, recovery: 4.8, damage: 22 }] }),
  hollow: spec({ name: 'The Antlered Hollow', rank: 'normal', role: 'melee', health: 170, speed: 0.68, radius: 0.65, height: 5.4,
    attacks: [{ id: 'reap', type: 'melee', range: [0, 3.4], windup: 2.8, recovery: 4.5, damage: 26 }] }),
  wraith: spec({ name: 'Lantern Wraith', rank: 'normal', role: 'ranged', health: 75, speed: 0.6, radius: 0.5, height: 3.0,
    attacks: [{ id: 'ember', type: 'bolt', range: [0, 14], windup: 2.7, recovery: 5.0, damage: 13 }] }),
  mossling: spec({ name: 'Mossling', rank: 'normal', role: 'swarm', health: 28, speed: 2.5, radius: 0.32, height: 0.85,
    attacks: [{ id: 'nip', type: 'melee', range: [0, 1.5], windup: 0.95, recovery: 1.9, damage: 6 }] }),
  thornback: spec({ name: 'Thornback', rank: 'normal', role: 'charger', health: 115, speed: 1.15, radius: 0.85, height: 1.7,
    attacks: [{ id: 'gore', type: 'charge', range: [2.5, 16], windup: 1.7, recovery: 3.4, damage: 20 }] }),
  moth: spec({ name: 'Gloom Moth', rank: 'normal', role: 'flyer', health: 52, speed: 2.1, radius: 0.7, height: 1.3, hover: 2.8,
    attacks: [{ id: 'dive', type: 'dive', range: [0, 8.5], windup: 1.4, recovery: 3.0, damage: 12 }] }),

  /* ── sub-bosses: they come alone, after the last wave ── */
  gorrik: spec({ name: 'Gorrik', title: 'the Bramblechief', rank: 'sub', role: 'boss', health: 650, speed: 1.1, radius: 0.95, height: 3.1,
    attacks: [
      { id: 'club', type: 'melee', range: [0, 3.6], windup: 1.6, recovery: 2.4, damage: 20, weight: 3 },
      { id: 'stomp', type: 'shockwave', range: [0, 22], windup: 2.0, recovery: 2.8, damage: 15, weight: 2, cooldown: 7 },
      { id: 'rush', type: 'charge', range: [5, 20], windup: 1.4, recovery: 2.6, damage: 18, weight: 2, cooldown: 6 },
      { id: 'warcry', type: 'summon', range: [0, 60], windup: 1.8, recovery: 2.2, damage: 0, weight: 1, cooldown: 22, summon: { kind: 'goblin', count: 3 }, sight: false },
    ] }),
  fenwyrm: spec({ name: 'The Fenwyrm', title: 'Coil of the Drowned Fen', rank: 'sub', role: 'boss', health: 950, speed: 1.6, radius: 1.0, height: 2.6,
    attacks: [
      { id: 'bile', type: 'lob', range: [4, 28], windup: 1.5, recovery: 2.0, damage: 13, weight: 3, count: 3 },
      { id: 'spit', type: 'volley', range: [0, 24], windup: 1.3, recovery: 2.0, damage: 7, weight: 2, count: 5, cooldown: 5 },
      { id: 'lash', type: 'melee', range: [0, 4.5], windup: 1.2, recovery: 2.0, damage: 20, weight: 3 },
      { id: 'brood', type: 'summon', range: [0, 60], windup: 1.6, recovery: 2.0, damage: 0, weight: 1, cooldown: 24, summon: { kind: 'mossling', count: 4 }, sight: false },
    ] }),
  stag: spec({ name: 'The Hollow Stag', title: 'Cold Fire Crowned', rank: 'sub', role: 'boss', health: 1250, speed: 1.5, radius: 1.1, height: 4.0,
    attacks: [
      { id: 'charge', type: 'charge', range: [5, 26], windup: 1.6, recovery: 2.4, damage: 24, weight: 3, cooldown: 5 },
      { id: 'antlers', type: 'melee', range: [0, 4.5], windup: 1.2, recovery: 2.0, damage: 22, weight: 3 },
      { id: 'coldfire', type: 'swarm', range: [0, 30], windup: 1.6, recovery: 2.2, damage: 6, weight: 2, count: 4, cooldown: 6 },
      { id: 'bell', type: 'shockwave', range: [0, 22], windup: 1.9, recovery: 2.5, damage: 16, weight: 1, cooldown: 9 },
    ] }),
  herald: spec({ name: 'The Pale Herald', title: 'Who Rings the Hush', rank: 'sub', role: 'boss', health: 1550, speed: 0.8, radius: 0.7, height: 4.3,
    attacks: [
      { id: 'toll', type: 'toll', range: [0, 60], windup: 2.2, recovery: 2.4, damage: 22, weight: 3, cooldown: 6, sight: false },
      { id: 'palefire', type: 'volley', range: [0, 30], windup: 1.5, recovery: 2.0, damage: 9, weight: 3, count: 3 },
      { id: 'step', type: 'blink', range: [0, 60], windup: 0.8, recovery: 0.8, damage: 0, weight: 2, cooldown: 7, sight: false },
      { id: 'mourners', type: 'summon', range: [0, 60], windup: 1.8, recovery: 2.0, damage: 0, weight: 1, cooldown: 22, summon: { kind: 'wraith', count: 2 }, sight: false },
    ] }),

  /* ── final bosses: each rules a reach of the wood; the last rules them all ── */
  matron: spec({ name: 'The Moth Matron', title: 'Keeper of the Caged Lights', rank: 'final', role: 'boss', health: 1350, speed: 0.9, radius: 1.3, height: 5.2, hover: 1.2,
    attacks: [
      { id: 'brood', type: 'swarm', range: [0, 40], windup: 1.8, recovery: 2.4, damage: 4, weight: 3, count: 4, cooldown: 4 },
      { id: 'dust', type: 'gust', range: [0, 40], windup: 1.9, recovery: 2.4, damage: 11, weight: 2, cooldown: 7, sight: false },
      { id: 'embrace', type: 'melee', range: [0, 5], windup: 1.5, recovery: 2.4, damage: 20, weight: 2 },
      { id: 'children', type: 'summon', range: [0, 60], windup: 1.8, recovery: 2.0, damage: 0, weight: 1, cooldown: 26, summon: { kind: 'moth', count: 2 }, sight: false },
    ] }),
  grael: spec({ name: 'Grael', title: 'the Rootwarden', rank: 'final', role: 'boss', health: 2300, speed: 0.42, radius: 1.9, height: 7.6,
    attacks: [
      { id: 'quake', type: 'shockwave', range: [0, 40], windup: 2.4, recovery: 3.0, damage: 24, weight: 3, cooldown: 6 },
      { id: 'roots', type: 'spikes', range: [0, 40], windup: 1.8, recovery: 2.4, damage: 18, weight: 3 },
      { id: 'boulder', type: 'lob', range: [6, 40], windup: 2.0, recovery: 2.6, damage: 22, weight: 2, count: 1 },
      { id: 'seedlings', type: 'summon', range: [0, 60], windup: 2.0, recovery: 2.0, damage: 0, weight: 1, cooldown: 26, summon: { kind: 'mossling', count: 5 }, sight: false },
    ] }),
  widow: spec({ name: 'The Lantern Widow', title: 'She Who Keeps the Lost', rank: 'final', role: 'boss', health: 3100, speed: 1.7, radius: 1.9, height: 4.6,
    attacks: [
      { id: 'lanterns', type: 'volley', range: [0, 34], windup: 1.7, recovery: 2.2, damage: 6, weight: 3, count: 5, cooldown: 3 },
      { id: 'stab', type: 'melee', range: [0, 5.5], windup: 1.3, recovery: 2.0, damage: 26, weight: 3 },
      { id: 'pounce', type: 'charge', range: [6, 26], windup: 1.4, recovery: 2.2, damage: 22, weight: 2, cooldown: 7 },
      { id: 'step', type: 'blink', range: [0, 60], windup: 0.7, recovery: 0.7, damage: 0, weight: 1, cooldown: 9, sight: false },
      { id: 'lost', type: 'summon', range: [0, 60], windup: 1.8, recovery: 2.0, damage: 0, weight: 1, cooldown: 26, summon: { kind: 'wraith', count: 2 }, sight: false },
    ] }),
  king: spec({ name: 'The Unlit King', title: 'Who Swallowed Every Light', rank: 'final', role: 'boss', health: 5000, speed: 0.5, radius: 2.3, height: 9.2,
    attacks: [
      { id: 'hands', type: 'spikes', range: [0, 50], windup: 1.7, recovery: 2.2, damage: 22, weight: 3 },
      { id: 'darkstars', type: 'stars', range: [0, 60], windup: 2.0, recovery: 2.4, damage: 9, weight: 3, count: 7, cooldown: 4, sight: false },
      { id: 'devour', type: 'darkness', range: [0, 60], windup: 2.6, recovery: 3.0, damage: 6, weight: 1, cooldown: 26, sight: false },
      { id: 'crush', type: 'shockwave', range: [0, 40], windup: 2.2, recovery: 2.6, damage: 26, weight: 2, cooldown: 7 },
      { id: 'court', type: 'summon', range: [0, 60], windup: 2.0, recovery: 2.0, damage: 0, weight: 1, cooldown: 28, summon: { kind: 'hollow', count: 1 }, sight: false },
    ] }),
};

export const CREATURE_NAMES: Record<CreatureKind, string> = Object.fromEntries(
  Object.entries(CREATURE_SPECS).map(([k, s]) => [k, s.name]),
) as Record<CreatureKind, string>;

/** Base damage of each offensive spell. */
export const SPELL_DAMAGE: Partial<Record<SpellEffect, number>> = {
  arrow: 32, lightning: 48, frost: 12, summon: 9, fire: 22, roots: 14, blade: 30, wisps: 16, flare: 10,
  quake: 85, tide: 70, stag: 110, starfall: 60, dawn: 220,
};

export const COOLDOWNS: Record<SpellEffect, number> = {
  arrow: 0.4, lightning: 1.5, frost: 2.2, healing: 7, summon: 12, shield: 6,
  fire: 2.6, roots: 7, blade: 3.2, wisps: 6, flare: 14,
  quake: 22, veil: 40, tide: 45, bloom: 60, stag: 40, starfall: 55, stillness: 50, dawn: 70,
};

export interface Scaling { health: number; damage: number; speed: number }
export const NO_SCALING: Scaling = { health: 1, damage: 1, speed: 1 };

/** Deterministic simulation, independent of rendering, camera permissions, and frame rate. */
export class CreatureState {
  health: number;
  readonly maxHealth: number;
  pose: CreaturePose = 'idle';
  age = 0;
  freeze = 0;
  /** Stunned (dazzled, held still): no ice, but no movement or attack. */
  stun = 0;
  /** Rooted: may attack but cannot move. */
  rooted = 0;
  /** Slowed (great beasts in frost): movement and wind-ups run at half speed. */
  slow = 0;
  burn = 0;
  /** The attack being wound up or struck. */
  attack: AttackSpec;
  readonly spec: CreatureSpec;
  private savedPose: CreaturePose = 'idle';
  private savedAge = 0;
  private readonly cooldowns = new Map<string, number>();
  private interruptGuard = 0;
  /** Time spent walking since the last attack: bosses move between blows instead of chaining them. */
  private walked = 0;
  private random: () => number;

  constructor(readonly kind: CreatureKind, readonly scaling: Scaling = NO_SCALING, seed = 1) {
    this.spec = CREATURE_SPECS[kind];
    this.maxHealth = Math.round(this.spec.health * scaling.health);
    this.health = this.maxHealth;
    this.attack = this.spec.attacks[0];
    // mulberry32, hashed from the seed so neighbouring seeds give unrelated sequences.
    let s = (Math.imul(seed >>> 0 || 1, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
    this.random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Stagger first use of slow specials so a boss does not open with everything.
    for (const a of this.spec.attacks) if (a.cooldown && a.type === 'summon') this.cooldowns.set(a.id, a.cooldown * 0.5);
  }

  get alive(): boolean { return this.health > 0; }
  get boss(): boolean { return this.spec.rank !== 'normal'; }
  get damage(): number { return Math.round(this.attack.damage * this.scaling.damage); }

  get progress(): number {
    const duration = this.pose === 'windup' ? this.attack.windup : this.pose === 'strike' ? this.strikeTime : this.pose === 'recover' ? this.attack.recovery
      : this.pose === 'dead' ? (this.boss ? 3 : 1.6) : this.pose === 'stagger' ? 0.45 : 1;
    return Math.min(1, this.age / duration);
  }

  /** Strikes that travel (charges, dives) last longer than a blow. */
  get strikeTime(): number { return this.attack.type === 'charge' ? 1.1 : this.attack.type === 'dive' ? 0.7 : 0.42; }

  private enter(pose: CreaturePose): void { this.pose = pose; this.age = 0; }

  /**
   * A spell lands. `amount` overrides the base damage (scaled spells, burns). Returns false when the
   * creature is already gone or the effect does not hurt.
   */
  hit(effect: SpellEffect, amount?: number): boolean {
    const damage = amount ?? SPELL_DAMAGE[effect];
    if (!this.alive || !damage) return false;
    this.health = Math.max(0, this.health - damage);
    if (!this.alive) { this.freeze = 0; this.stun = 0; this.enter('dead'); return true; }
    if (effect === 'frost') {
      if (this.boss) { this.slow = Math.max(this.slow, 4); this.interrupt(); return true; }
      if (this.freeze <= 0) { this.savedPose = 'recover'; this.savedAge = 0; }
      this.freeze = 3.7;
      this.enter('frozen');
    } else if (this.freeze <= 0 && this.stun <= 0 && !this.boss) {
      // Small things reel from every blow; a boss only flinches from heavy ones.
      this.enter('stagger');
    } else if (this.boss && damage >= 60 && this.pose === 'windup') {
      this.interrupt();
    }
    return true;
  }

  /** Break a wind-up. Bosses resist being interrupted twice in quick succession. */
  interrupt(): boolean {
    if (!this.alive || this.pose !== 'windup') return false;
    if (this.boss && this.interruptGuard > 0) return false;
    this.interruptGuard = this.boss ? 8 : 0;
    this.enter('recover');
    this.age = this.attack.recovery * 0.5;
    return true;
  }

  /** Dazzled or held: no movement, no attacks. Ice-free. */
  stunFor(seconds: number): void {
    if (!this.alive) return;
    const s = this.boss ? seconds * 0.5 : seconds;
    if (this.pose === 'windup') this.interrupt();
    if (this.stun <= 0 && this.freeze <= 0) { this.savedPose = this.pose === 'windup' || this.pose === 'strike' ? 'recover' : this.pose; this.savedAge = 0; }
    this.stun = Math.max(this.stun, s);
  }

  rootFor(seconds: number): void { if (this.alive) this.rooted = Math.max(this.rooted, this.boss ? seconds / 3 : seconds); }

  /** True when it may move this frame. */
  get mobile(): boolean { return this.alive && this.freeze <= 0 && this.stun <= 0 && this.rooted <= 0; }

  /** Return true exactly once, at the strike beat. Damage is separately range/LOS checked. */
  update(dt: number, distance: number, lineOfSight: boolean, active: boolean): boolean {
    if (!active) return false;
    dt = Math.max(0, dt);
    if (this.slow > 0) { this.slow = Math.max(0, this.slow - dt); dt *= 0.5; }
    this.age += dt;
    this.interruptGuard = Math.max(0, this.interruptGuard - dt);
    this.rooted = Math.max(0, this.rooted - dt);
    for (const [id, t] of this.cooldowns) this.cooldowns.set(id, Math.max(0, t - dt));
    if (!this.alive) return false;
    if (this.freeze > 0) { this.freeze = Math.max(0, this.freeze - dt); if (this.freeze === 0) { this.pose = this.savedPose; this.age = this.savedAge; } return false; }
    if (this.stun > 0) { this.stun = Math.max(0, this.stun - dt); if (this.stun === 0) { this.pose = this.savedPose === 'windup' ? 'recover' : this.savedPose; this.age = 0; } return false; }
    if (this.pose === 'stagger') { if (this.age >= 0.45) this.enter('recover'); return false; }
    if (this.pose === 'strike') { if (this.age >= this.strikeTime) this.enter('recover'); return false; }
    if (this.pose === 'recover') { if (this.age >= this.attack.recovery) this.enter('walk'); return false; }
    if (this.pose === 'windup') {
      if (this.age >= this.attack.windup) {
        this.enter('strike');
        if (this.attack.cooldown) this.cooldowns.set(this.attack.id, this.attack.cooldown);
        return true;
      }
      return false;
    }
    if (this.pose !== 'walk') { this.enter('walk'); this.walked = 0; }
    this.walked += dt;
    if (this.boss && this.walked < 1.6) return false;
    const choice = this.choose(distance, lineOfSight);
    if (choice) { this.attack = choice; this.enter('windup'); return false; }
    return false;
  }

  private choose(distance: number, lineOfSight: boolean): AttackSpec | null {
    const options = this.spec.attacks.filter((a) => distance >= a.range[0] && distance < a.range[1]
      && (lineOfSight || a.sight === false) && !(this.cooldowns.get(a.id) ?? 0));
    if (!options.length) return null;
    if (options.length === 1) return options[0];
    const total = options.reduce((s, a) => s + (a.weight ?? 1), 0);
    let pick = this.random() * total;
    for (const a of options) { pick -= a.weight ?? 1; if (pick <= 0) return a; }
    return options[options.length - 1];
  }
}

export class PlayerState {
  health = 100;
  readonly maxHealth = 100;
  shield = 0;
  shieldTime = 0;
  invulnerability = 0;
  /** Moonveil: untouchable, projectiles turn back. */
  veil = 0;
  /** Verdant Bloom: healing per second while it lasts. */
  regen = 0;
  /** The King's darkness: a slow drain until it lifts or a light spell breaks it. */
  darkness = 0;
  readonly cooldowns: Record<SpellEffect, number> = Object.fromEntries(Object.keys(COOLDOWNS).map((k) => [k, 0])) as Record<SpellEffect, number>;
  get alive(): boolean { return this.health > 0; }
  update(dt: number): void {
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt); if (!this.shieldTime) this.shield = 0;
    this.veil = Math.max(0, this.veil - dt);
    if (this.regen > 0 && this.alive) { this.health = Math.min(this.maxHealth, this.health + 3 * dt); this.regen = Math.max(0, this.regen - dt); }
    this.darkness = Math.max(0, this.darkness - dt);
    for (const effect of Object.keys(this.cooldowns) as SpellEffect[]) this.cooldowns[effect] = Math.max(0, this.cooldowns[effect] - dt);
  }
  cast(effect: SpellEffect): boolean {
    if (!this.alive || this.cooldowns[effect] > 0) return false;
    this.cooldowns[effect] = COOLDOWNS[effect];
    if (effect === 'healing') this.health = Math.min(this.maxHealth, this.health + 30);
    if (effect === 'shield') { this.shield = 45; this.shieldTime = 5; }
    if (effect === 'veil') this.veil = 7;
    if (effect === 'bloom') { this.health = this.maxHealth; this.regen = 12; }
    // Light breaks the King's darkness.
    if (effect === 'flare' || effect === 'lightning' || effect === 'dawn' || effect === 'starfall') this.darkness = 0;
    return true;
  }
  damage(amount: number): 'hurt' | 'blocked' | 'ignored' {
    if (!this.alive || this.invulnerability > 0) return 'ignored';
    if (this.veil > 0) return 'blocked';
    this.invulnerability = 0.5;
    const absorbed = Math.min(this.shield, amount); this.shield -= absorbed;
    const remaining = amount - absorbed; this.health = Math.max(0, this.health - remaining);
    return remaining > 0 ? 'hurt' : 'blocked';
  }
  reset(): void {
    this.health = this.maxHealth; this.shield = 0; this.shieldTime = 0; this.invulnerability = 1.5; this.veil = 0; this.regen = 0; this.darkness = 0;
    for (const k of Object.keys(this.cooldowns) as SpellEffect[]) this.cooldowns[k] = 0;
  }
}
