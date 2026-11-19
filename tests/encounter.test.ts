import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GESTURES } from '../src/config/gestures.ts';
import { LEGEND_SPELLS, SPELLS } from '../src/config/spells.ts';
import { CHAPTERS, LEVELS } from '../src/game/campaign.ts';
import { SpellBook } from '../src/spells/SpellBook.ts';
import { DESIGNS } from '../src/world/characters/index.ts';
import { CREATURE_SPECS, CreatureState, PlayerState, type CreatureKind } from '../src/world/EncounterState.ts';
import { FrameBudget } from '../src/world/FrameBudget.ts';
import { GNOME_ATTACK_RANGE, GNOME_DESIGNS, GNOME_LIFETIME, GnomeSummons } from '../src/world/GnomeSummons.ts';
import { ellipsoid, lathe, tube } from '../src/world/rig/Body.ts';
import { Character } from '../src/world/rig/Character.ts';

const kinds: CreatureKind[] = ['goblin', 'root', 'hollow', 'wraith', 'mossling', 'thornback', 'moth'];

describe('telegraphed enemy simulation', () => {
  it.each(kinds)('%s pursues, winds up and strikes only once per attack', (kind) => {
    const state = new CreatureState(kind), spec = CREATURE_SPECS[kind];
    const inRange = Math.max(spec.attacks[0].range[0] + 0.1, spec.range - 0.2);
    expect(state.update(0.1, 60, true, true)).toBe(false); expect(state.pose).toBe('walk');
    state.update(0.1, inRange, true, true); expect(state.pose).toBe('windup');
    expect(state.update(spec.windup - 0.1, inRange, true, true)).toBe(false);
    expect(state.update(0.11, inRange, true, true)).toBe(true); expect(state.pose).toBe('strike');
    expect(state.update(0.1, inRange, true, true)).toBe(false);
    state.update(state.strikeTime, inRange, true, true); expect(state.pose).toBe('recover');
    state.update(spec.recovery + 0.01, 60, true, true); expect(state.pose).toBe('walk');
  });
  it('does not wind up across scenery or outside actual range', () => {
    const state = new CreatureState('goblin'); state.update(10, 1, false, true); expect(state.pose).toBe('walk');
    state.update(10, 10, true, true); expect(state.pose).toBe('walk');
  });
  it('pauses timers and attacks while a menu is open', () => {
    const state = new CreatureState('root'); state.update(0.1, 1, true, true);
    const age = state.age; expect(state.update(20, 1, true, false)).toBe(false); expect(state.pose).toBe('windup'); expect(state.age).toBe(age);
  });
  it('frost interrupts a wind-up and prevents attacking until it has thawed', () => {
    const state = new CreatureState('goblin'); state.update(0.1, 1, true, true); state.hit('frost'); expect(state.pose).toBe('frozen');
    expect(state.update(2, 1, true, true)).toBe(false); expect(state.pose).toBe('frozen');
    state.hit('arrow'); expect(state.pose).toBe('frozen');
    state.update(2, 1, true, true); expect(state.pose).toBe('recover'); expect(state.freeze).toBe(0);
  });
  it('stagger cancels attacks and dead enemies cannot attack or take damage', () => {
    const state = new CreatureState('goblin'); state.update(0.1, 1, true, true); state.hit('arrow'); expect(state.pose).toBe('stagger');
    state.hit('lightning'); expect(state.alive).toBe(false); expect(state.pose).toBe('dead');
    expect(state.update(10, 1, true, true)).toBe(false); expect(state.hit('arrow')).toBe(false);
  });
  it('defensive spells do not hurt an enemy', () => {
    const state = new CreatureState('hollow');
    expect(state.hit('shield')).toBe(false); expect(state.hit('healing')).toBe(false); expect(state.hit('veil')).toBe(false);
    expect(state.health).toBe(CREATURE_SPECS.hollow.health);
  });
  it('level scaling makes later creatures tougher and hit harder', () => {
    const early = new CreatureState('wraith'), late = new CreatureState('wraith', { health: 2, damage: 1.5, speed: 1 });
    expect(late.maxHealth).toBe(early.maxHealth * 2);
    expect(late.damage).toBe(Math.round(early.damage * 1.5));
  });
  it('stuns and roots stop movement; bosses shrug off most of it', () => {
    const goblin = new CreatureState('goblin');
    goblin.stunFor(2); expect(goblin.mobile).toBe(false);
    goblin.update(2.1, 30, true, true); expect(goblin.mobile).toBe(true);
    goblin.rootFor(4); expect(goblin.mobile).toBe(false);
    const king = new CreatureState('king');
    king.rootFor(3); expect(king.rooted).toBeCloseTo(1);
    king.hit('frost'); expect(king.pose).not.toBe('frozen'); expect(king.slow).toBeGreaterThan(0);
  });
});

describe('bosses choose among their attacks', () => {
  it('only picks attacks whose range fits, and honours cooldowns', () => {
    const gorrik = new CreatureState('gorrik', undefined, 3);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const s = new CreatureState('gorrik', undefined, i + 1);
      s.update(2, 2, true, true);
      if (s.pose === 'windup') seen.add(s.attack.type);
    }
    expect(seen.has('melee')).toBe(true);
    expect(seen.has('shockwave')).toBe(true);
    // A charge needs room to run: never chosen at point-blank range.
    expect(seen.has('charge')).toBe(false);
    gorrik.update(2, 12, true, true);
    expect(['shockwave', 'charge', 'summon']).toContain(gorrik.attack.type);
  });
  it('a sub-boss and final boss in every chapter, each stronger than the one before', () => {
    const finals = LEVELS.filter((l) => l.kind === 'final').map((l) => CREATURE_SPECS[l.boss!]);
    for (let i = 1; i < finals.length; i++) expect(finals[i].health).toBeGreaterThan(finals[i - 1].health);
    const king = CREATURE_SPECS.king;
    expect(king.height).toBeGreaterThan(Math.max(...finals.slice(0, 3).map((f) => f.height)));
  });
});

describe('the player', () => {
  it('Moonveil blocks everything; Verdant Bloom restores fully; light breaks the darkness', () => {
    const p = new PlayerState();
    p.cast('veil'); expect(p.damage(50)).toBe('blocked'); expect(p.health).toBe(100);
    p.update(8); p.invulnerability = 0; p.damage(60); expect(p.health).toBe(40);
    p.cast('bloom'); expect(p.health).toBe(100);
    p.darkness = 9; p.cast('flare'); expect(p.darkness).toBe(0);
  });
});

describe('the campaign', () => {
  it('has forty levels in four chapters of ten', () => {
    expect(LEVELS).toHaveLength(40);
    expect(CHAPTERS).toHaveLength(4);
    for (const c of CHAPTERS) expect(LEVELS.filter((l) => l.chapter === c.id)).toHaveLength(10);
  });
  it('puts a sub-boss after eight levels and a final boss at the end of every chapter', () => {
    for (const c of CHAPTERS) {
      const levels = LEVELS.filter((l) => l.chapter === c.id);
      expect(levels.slice(0, 8).every((l) => l.kind === 'normal' && !l.boss)).toBe(true);
      expect(levels[8].kind).toBe('sub');
      expect(CREATURE_SPECS[levels[8].boss!].rank).toBe('sub');
      expect(levels[9].kind).toBe('final');
      expect(CREATURE_SPECS[levels[9].boss!].rank).toBe('final');
      // A cutscene introduces each ruler before its fight.
      expect(levels[9].before).toBeTruthy();
    }
  });
  it('gives every non-final level three waves that grow harder', () => {
    const threat = (k: CreatureKind) => CREATURE_SPECS[k].health;
    for (const level of LEVELS.filter((l) => l.kind !== 'final')) {
      expect(level.waves).toHaveLength(3);
      for (const wave of level.waves) expect(wave.reduce((s, g) => s + g.count, 0)).toBeGreaterThan(0);
      const totals = level.waves.map((w) => w.reduce((s, g) => s + g.count * threat(g.kind), 0));
      expect(totals[2]).toBeGreaterThanOrEqual(totals[0]);
    }
  });
  it('tells its story every seven levels and at every boss', () => {
    for (const id of [7, 14, 21, 28, 35]) expect(LEVELS[id - 1].after).toBeTruthy();
    expect(LEVELS[0].before).toBe('intro');
    expect(LEVELS[39].after).toBe('ending');
  });
  it('hands out every legendary spell from a boss, and only from a boss', () => {
    const rewards = LEVELS.filter((l) => l.reward).map((l) => l.reward);
    expect(new Set(rewards)).toEqual(new Set(LEGEND_SPELLS.map((s) => s.id)));
    for (const level of LEVELS.filter((l) => l.reward)) expect(level.boss).toBeTruthy();
  });
});

describe('the spellbook', () => {
  it('keeps legendary spells silent until they are learned', () => {
    const book = new SpellBook(SPELLS, GESTURES, null);
    const quake = SPELLS.find((s) => s.effect === 'quake')!;
    expect(book.isKnown(quake.id)).toBe(false);
    expect(book.activeGestures().some((g) => g.id === quake.defaultGesture)).toBe(false);
    expect(book.spellFor(quake.defaultGesture)).toBeUndefined();
    book.setLearned([quake.id]);
    expect(book.isKnown(quake.id)).toBe(true);
    expect(book.spellFor(quake.defaultGesture)?.id).toBe(quake.id);
  });
  it('binds every spell to its own gesture', () => {
    const gestures = SPELLS.map((s) => s.defaultGesture);
    expect(new Set(gestures).size).toBe(gestures.length);
    for (const g of gestures) expect(GESTURES.some((x) => x.id === g)).toBe(true);
  });
});

describe('procedural bodies', () => {
  it('builds tubes, lathes and ellipsoids with outward-facing surfaces', () => {
    for (const g of [tube([[0, 0, 0], [0, 1, 0], [0.2, 2, 0]], [0.3, 0.25, 0.1]), lathe([[0.2, 2], [0.5, 1], [0.4, 0]], { closeTop: true, closeBottom: true }), ellipsoid([0, 1, 0], [0.5, 0.8, 0.4])]) {
      g.computeBoundingBox();
      const centre = g.boundingBox!.getCenter(new THREE.Vector3());
      const p = g.getAttribute('position'), n = g.getAttribute('normal');
      let outward = 0;
      for (let i = 0; i < p.count; i++) {
        const dx = p.getX(i) - centre.x, dz = p.getZ(i) - centre.z;
        if (Math.hypot(dx, dz) > 0.05) outward += Math.sign(dx * n.getX(i) + dz * n.getZ(i));
      }
      expect(outward).toBeGreaterThan(0);
    }
  });
  it.each(Object.keys(DESIGNS) as CreatureKind[])('%s is one skinned body on one skeleton, with sound weights', (kind) => {
    const c = new Character(DESIGNS[kind], 0.5);
    expect(c.mesh).toBeInstanceOf(THREE.SkinnedMesh);
    const w = c.mesh.geometry.getAttribute('skinWeight');
    for (let i = 0; i < w.count; i += 7) expect(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i)).toBeCloseTo(1, 3);
    c.mesh.geometry.computeBoundingBox();
    const size = c.mesh.geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(DESIGNS[kind].height * 0.45);
    // Every body is a real volume with depth, not a flat sheet.
    expect(Math.min(size.x, size.z)).toBeGreaterThan(0.15);
    c.dispose();
  });
  it('walks forward, side-steps both ways and turns toward its heading', () => {
    const c = new Character(DESIGNS.goblin, 0.2);
    const look = new THREE.Vector3(0, 1.8, 10);
    const thigh = c.bones.thighL;
    const frames = (velocity: THREE.Vector3, faceYaw: number | null, n = 40) => {
      const zs: number[] = [];
      for (let i = 0; i < n; i++) { c.update(1 / 30, { pose: 'walk', progress: 0, velocity, faceYaw, look, groundY: 0 }); zs.push(thigh.rotation.z); }
      return zs;
    };
    frames(new THREE.Vector3(0, 0, 1.4), 0);
    const left = frames(new THREE.Vector3(1.4, 0, 0), 0);
    const right = frames(new THREE.Vector3(-1.4, 0, 0), 0);
    // Side-steps open the legs sideways (about Z), in opposite directions.
    expect(Math.max(...left.map(Math.abs))).toBeGreaterThan(0.05);
    expect(Math.max(...right.map(Math.abs))).toBeGreaterThan(0.05);
    // Facing travel: it turns to face the way it is going (here, to its left).
    frames(new THREE.Vector3(1.4, 0, 0), Math.PI / 2, 60);
    expect(c.yaw).toBeCloseTo(Math.PI / 2, 1);
    c.dispose();
  });
});

describe('adaptive resolution budget', () => {
  it('lowers render resolution under sustained load without exceeding safe bounds', () => {
    const budget = new FrameBudget(1.5, 1.5); for (let i = 0; i < 200; i++) budget.sample(0.12);
    expect(budget.ratio).toBeGreaterThanOrEqual(0.75); expect(budget.ratio).toBeLessThan(1);
  });
  it('recovers cautiously and ignores invalid timing samples', () => {
    const budget = new FrameBudget(0.8, 1.5); expect(budget.sample(NaN)).toBeNull(); expect(budget.sample(-1)).toBeNull();
    for (let i = 0; i < 1500; i++) budget.sample(1 / 60); expect(budget.ratio).toBeGreaterThan(0.8); expect(budget.ratio).toBeLessThanOrEqual(1.5);
  });
});

describe('summoned gnomes', () => {
  const scouts = (s: GnomeSummons) => s.group.children.filter((c) => c instanceof THREE.Group) as THREE.Group[];

  it('climbs out where cast, runs off with its back to the caster and holds a spot short of the target', () => {
    const summons = new GnomeSummons([], () => null, () => {});
    const circle = new THREE.Vector3(0, 0, 5), enemy = new THREE.Vector3(0, 0, -20), player = new THREE.Vector3(0, 1.85, 17);
    summons.summon(circle, enemy, 1);
    for (const root of scouts(summons)) expect(Math.hypot(root.position.x - circle.x, root.position.z - circle.z)).toBeLessThan(1);
    for (let i = 0; i < 40; i++) summons.update(0.05, true, player, [{ id: 1, position: enemy, height: 2, alive: true }]);
    // Running toward the spirit, away from the caster: it faces away (its back to the camera).
    for (const root of scouts(summons)) expect(Math.cos(root.rotation.y)).toBeLessThan(0);
    for (let i = 0; i < 60; i++) summons.update(0.05, true, player, [{ id: 1, position: enemy, height: 2, alive: true }]);
    for (const root of scouts(summons)) {
      expect(root.position.z).toBeGreaterThan(enemy.z);
      expect(root.position.distanceTo(enemy)).toBeLessThan(13);
    }
    summons.dispose();
  });

  it('turns to face the caster and runs home when its time is up', () => {
    const summons = new GnomeSummons([], () => null, () => {});
    const player = new THREE.Vector3(0, 1.85, 17);
    summons.summon(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -20));
    for (let t = 0; t < GNOME_LIFETIME + 0.6; t += 0.05) summons.update(0.05, true, player, []);
    for (const root of scouts(summons)) expect(Math.cos(root.rotation.y)).toBeGreaterThan(0.5);
    summons.dispose();
  });

  it('grabs a stone in its throwing hand and hurls it on a falling arc', () => {
    let hits = 0;
    const summons = new GnomeSummons([], () => null, () => { hits++; });
    const enemy = new THREE.Vector3(0, 0, -6), player = new THREE.Vector3(0, 1.85, 12);
    summons.summon(new THREE.Vector3(0, 0, 1), enemy, 1);
    const target = [{ id: 1, position: enemy, height: 2, alive: true }];
    let carried = false; const heights: number[] = [];
    for (let i = 0; i < 400 && hits === 0; i++) {
      summons.update(0.02, true, player, target);
      summons.group.traverse((o) => { if (o instanceof THREE.Bone && o.name === 'handR' && o.children.some((c) => c instanceof THREE.Mesh)) carried = true; });
      const loose = summons.group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh | undefined;
      if (loose) heights.push(loose.position.y);
    }
    expect(carried).toBe(true);
    expect(heights.length).toBeGreaterThan(2);
    const peak = Math.max(...heights);
    expect(peak).toBeGreaterThan(heights[0]);
    expect(heights[heights.length - 1]).toBeLessThan(peak);
    expect(hits).toBe(1);
    expect(GNOME_ATTACK_RANGE).toBeGreaterThan(10);
    expect(GNOME_DESIGNS.ember.kind).not.toBe(GNOME_DESIGNS.moss.kind);
    summons.dispose();
  });
});
