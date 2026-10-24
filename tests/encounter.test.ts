import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Creature, type CreatureKind } from '../src/world/Creature.ts';
import { CreatureState, CREATURE_SPECS, PlayerState } from '../src/world/EncounterState.ts';
import { FrameBudget } from '../src/world/FrameBudget.ts';
import { sweptShape, vectors } from '../src/world/storybook.ts';

const kinds:CreatureKind[]=['goblin','root','hollow','wraith'];

describe('telegraphed enemy simulation',()=>{
  it.each(kinds)('%s pursues, winds up and strikes only once per attack',kind=>{
    const state=new CreatureState(kind),spec=CREATURE_SPECS[kind];
    expect(state.update(0.1,30,true,true)).toBe(false);expect(state.pose).toBe('walk');
    state.update(0.1,spec.range-0.2,true,true);expect(state.pose).toBe('windup');
    expect(state.update(spec.windup-0.1,1,true,true)).toBe(false);
    expect(state.update(0.11,1,true,true)).toBe(true);expect(state.pose).toBe('strike');
    expect(state.update(0.1,1,true,true)).toBe(false);
    state.update(0.4,1,true,true);expect(state.pose).toBe('recover');
    state.update(spec.recovery+0.01,1,true,true);expect(state.pose).toBe('walk');
  });
  it('does not wind up across scenery or outside actual range',()=>{
    const state=new CreatureState('goblin');state.update(10,1,false,true);expect(state.pose).toBe('walk');
    state.update(10,10,true,true);expect(state.pose).toBe('walk');
  });
  it('pauses timers and attacks while a guide/settings modal is open',()=>{
    const state=new CreatureState('root');state.update(0.1,1,true,true);
    const age=state.age;expect(state.update(20,1,true,false)).toBe(false);expect(state.pose).toBe('windup');expect(state.age).toBe(age);
  });
  it('frost interrupts a wind-up and prevents attacking until it has thawed',()=>{
    const state=new CreatureState('goblin');state.update(0.1,1,true,true);state.hit('frost');expect(state.pose).toBe('frozen');
    expect(state.update(2,1,true,true)).toBe(false);expect(state.pose).toBe('frozen');
    state.hit('arrow');expect(state.pose).toBe('frozen');
    state.update(2,1,true,true);expect(state.pose).toBe('recover');expect(state.freeze).toBe(0);
  });
  it('stagger cancels attacks and dead enemies cannot attack or take damage',()=>{
    const state=new CreatureState('goblin');state.update(0.1,1,true,true);state.hit('arrow');expect(state.pose).toBe('stagger');
    state.hit('lightning');expect(state.alive).toBe(false);expect(state.pose).toBe('dead');
    expect(state.update(10,1,true,true)).toBe(false);expect(state.hit('arrow')).toBe(false);
  });
  it('defensive spells do not hurt an enemy',()=>{
    const state=new CreatureState('hollow');expect(state.hit('shield')).toBe(false);expect(state.hit('healing')).toBe(false);expect(state.health).toBe(120);
  });
});

describe('player vitality and wards',()=>{
  it('absorbs damage before vitality and carries excess damage through',()=>{
    const player=new PlayerState();expect(player.cast('shield')).toBe(true);
    expect(player.damage(30)).toBe('blocked');expect(player.health).toBe(100);expect(player.shield).toBe(15);
    player.update(1);expect(player.damage(22)).toBe('hurt');expect(player.health).toBe(93);expect(player.shield).toBe(0);
  });
  it('limits simultaneous attacks with a brief grace period',()=>{
    const player=new PlayerState();expect(player.damage(20)).toBe('hurt');expect(player.damage(20)).toBe('ignored');expect(player.health).toBe(80);
    player.update(0.66);expect(player.damage(20)).toBe('hurt');expect(player.health).toBe(60);
  });
  it('expires wards and enforces real per-spell cooldowns',()=>{
    const player=new PlayerState();player.cast('shield');expect(player.cast('shield')).toBe(false);
    player.update(5.1);expect(player.shield).toBe(0);expect(player.cast('shield')).toBe(false);
    player.update(1);expect(player.cast('shield')).toBe(true);
  });
  it('heals by 30, caps at 100 and cannot be spammed',()=>{
    const player=new PlayerState();player.health=55;expect(player.cast('healing')).toBe(true);expect(player.health).toBe(85);
    expect(player.cast('healing')).toBe(false);player.update(7);player.cast('healing');expect(player.health).toBe(100);
  });
  it('death stops casts and restart clears old health, wards and cooldowns',()=>{
    const player=new PlayerState();player.cast('frost');player.damage(150);expect(player.alive).toBe(false);expect(player.cast('healing')).toBe(false);
    player.reset();expect(player.health).toBe(100);expect(player.cooldowns.frost).toBe(0);expect(player.damage(10)).toBe('ignored');
  });
});

describe('articulated 2.5D character artwork',()=>{
  it.each(kinds)('%s has layered artwork, articulated poses and a grounded footprint',kind=>{
    const model=new Creature(kind);model.group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(model.group),size=bounds.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(1.5);expect(size.z).toBeGreaterThan(0.1);expect(size.x).toBeGreaterThan(0.5);
    const before=model.body.matrix.clone();model.animate(1,'walk',0.2,0.1);model.group.updateMatrixWorld(true);expect(model.body.matrix.equals(before)).toBe(false);
    model.animate(2,'windup',0.8,0.1);model.group.updateMatrixWorld(true);expect(model.body.rotation.x).toBeLessThan(0);
    model.animate(3,'dead',1,0.1);expect(model.group.visible).toBe(false);
    const disposals:ReturnType<typeof vi.fn>[]=[];
    const geometries=new Set<THREE.BufferGeometry>();model.group.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});
    geometries.forEach(g=>{const spy=vi.fn();g.addEventListener('dispose',spy);disposals.push(spy);});
    model.dispose();model.dispose();disposals.forEach(spy=>expect(spy).toHaveBeenCalledOnce());
  });
  it('does not rotate the artwork toward a camera and visibly recoils when hit',()=>{
    const model=new Creature('goblin');model.group.position.set(4,0,-9);
    model.animate(1,'idle',0,.1);const rotation=model.group.quaternion.clone(),position=model.group.position.clone();
    model.hit();model.animate(1.1,'stagger',.2,.1);
    expect(model.body.position.x).toBeGreaterThan(0.01);
    expect(model.group.quaternion.equals(rotation)).toBe(true);expect(model.group.position.equals(position)).toBe(true);model.dispose();
  });
  it('swept organic shapes have outward normals rather than inverted hollow surfaces',()=>{
    const geometry=sweptShape(vectors([[0,0,0],[0,1,0],[0,2,0]]),[1,0.8,0.6],12,10);
    const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal');
    for(let i=13;i<26;i++){expect(p.getX(i)*n.getX(i)+p.getZ(i)*n.getZ(i)).toBeGreaterThan(0.4);}
    geometry.dispose();
  });
});

describe('adaptive resolution budget',()=>{
  it('lowers render resolution under sustained load without exceeding safe bounds',()=>{
    const budget=new FrameBudget(1.5,1.5);for(let i=0;i<200;i++)budget.sample(0.12);expect(budget.ratio).toBeGreaterThanOrEqual(0.55);expect(budget.ratio).toBeLessThan(1);
  });
  it('recovers cautiously and ignores invalid timing samples',()=>{
    const budget=new FrameBudget(0.8,1.5);expect(budget.sample(NaN)).toBeNull();expect(budget.sample(-1)).toBeNull();
    for(let i=0;i<1500;i++)budget.sample(1/60);expect(budget.ratio).toBeGreaterThan(0.8);expect(budget.ratio).toBeLessThanOrEqual(1.5);
  });
});
