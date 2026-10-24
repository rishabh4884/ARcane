import type { SpellEffect } from '../config/spells.ts';
import type { CreatureKind, CreaturePose } from './Creature.ts';

export interface CreatureSpec { health:number; speed:number; range:number; windup:number; recovery:number; damage:number; radius:number; height:number }
export const CREATURE_SPECS:Record<CreatureKind,CreatureSpec>={
  // Gesture-first pacing: room to find a sign, hold it, then aim before the next attack.
  goblin:{health:65,speed:0.9,range:2.15,windup:2.0,recovery:3.6,damage:12,radius:0.5,height:2.0},
  root:{health:150,speed:0.45,range:3.15,windup:2.6,recovery:4.8,damage:22,radius:0.8,height:3.8},
  hollow:{health:120,speed:0.6,range:3.25,windup:2.8,recovery:4.5,damage:28,radius:0.65,height:5.3},
  wraith:{health:75,speed:0.5,range:12,windup:2.8,recovery:5.2,damage:15,radius:0.5,height:3.0},
};
const DAMAGE:Partial<Record<SpellEffect,number>>={arrow:32,lightning:48,frost:12,wind:22,summon:28};
export const COOLDOWNS:Record<SpellEffect,number>={arrow:0.4,lightning:1.5,frost:2.2,wind:1,healing:7,summon:4,shield:6};

/** Deterministic simulation, independent of rendering, camera permissions, and frame rate. */
export class CreatureState {
  health:number;
  pose:CreaturePose='idle';
  age=0;
  freeze=0;
  private savedPose:CreaturePose='idle';
  private savedAge=0;
  constructor(readonly kind:CreatureKind){this.health=CREATURE_SPECS[kind].health;}
  get alive():boolean{return this.health>0;}
  get progress():number{
    const spec=CREATURE_SPECS[this.kind];
    const duration=this.pose==='windup'?spec.windup:this.pose==='strike'?0.42:this.pose==='recover'?spec.recovery:this.pose==='dead'?1.6:this.pose==='stagger'?0.45:1;
    return Math.min(1,this.age/duration);
  }
  private enter(pose:CreaturePose):void{this.pose=pose;this.age=0;}
  hit(effect:SpellEffect):boolean{
    if(!this.alive||!DAMAGE[effect])return false;
    this.health=Math.max(0,this.health-(DAMAGE[effect]??0));
    if(!this.alive){this.freeze=0;this.enter('dead');}
    else if(effect==='frost'){
      if(this.freeze<=0){this.savedPose='recover';this.savedAge=0;}
      this.freeze=3.7;this.enter('frozen');
    }else if(this.freeze<=0)this.enter('stagger');
    return true;
  }
  /** Return true exactly once, at the strike beat. Damage is separately range/LOS checked. */
  update(dt:number,distance:number,lineOfSight:boolean,active:boolean):boolean{
    if(!active)return false;
    dt=Math.max(0,dt);this.age+=dt;
    if(!this.alive)return false;
    if(this.freeze>0){this.freeze=Math.max(0,this.freeze-dt);if(this.freeze===0){this.pose=this.savedPose;this.age=this.savedAge;}return false;}
    const spec=CREATURE_SPECS[this.kind];
    if(this.pose==='stagger'){if(this.age>=0.45)this.enter('recover');return false;}
    if(this.pose==='strike'){if(this.age>=0.42)this.enter('recover');return false;}
    if(this.pose==='recover'){if(this.age>=spec.recovery)this.enter('walk');return false;}
    if(this.pose==='windup'){
      if(this.age>=spec.windup){this.enter('strike');return true;}return false;
    }
    if(distance<spec.range&&lineOfSight){this.enter('windup');return false;}
    if(this.pose!=='walk')this.enter('walk');
    return false;
  }
}

export class PlayerState {
  health=100;
  shield=0;
  shieldTime=0;
  invulnerability=0;
  readonly cooldowns:Record<SpellEffect,number>={arrow:0,lightning:0,frost:0,wind:0,healing:0,summon:0,shield:0};
  get alive():boolean{return this.health>0;}
  update(dt:number):void{
    this.invulnerability=Math.max(0,this.invulnerability-dt);
    this.shieldTime=Math.max(0,this.shieldTime-dt);if(!this.shieldTime)this.shield=0;
    for(const effect of Object.keys(this.cooldowns) as SpellEffect[])this.cooldowns[effect]=Math.max(0,this.cooldowns[effect]-dt);
  }
  cast(effect:SpellEffect):boolean{
    if(!this.alive||this.cooldowns[effect]>0)return false;
    this.cooldowns[effect]=COOLDOWNS[effect];
    if(effect==='healing')this.health=Math.min(100,this.health+30);
    if(effect==='shield'){this.shield=45;this.shieldTime=5;}
    return true;
  }
  damage(amount:number):'hurt'|'blocked'|'ignored'{
    if(!this.alive||this.invulnerability>0)return'ignored';
    this.invulnerability=0.65;
    const absorbed=Math.min(this.shield,amount);this.shield-=absorbed;
    const remaining=amount-absorbed;this.health=Math.max(0,this.health-remaining);
    return remaining>0?'hurt':'blocked';
  }
  reset():void{this.health=100;this.shield=0;this.shieldTime=0;this.invulnerability=1.5;for(const k of Object.keys(this.cooldowns)as SpellEffect[])this.cooldowns[k]=0;}
}
