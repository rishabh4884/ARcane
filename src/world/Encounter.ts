import '../ui/encounter.css';
import * as THREE from 'three';
import type { SpellEffect } from '../config/spells.ts';
import { Creature, CREATURE_NAMES, type CreatureKind } from './Creature.ts';
import { CreatureState, CREATURE_SPECS, PlayerState } from './EncounterState.ts';
import { EnemyCombat } from './EnemyCombat.ts';
import { GnomeSummons } from './GnomeSummons.ts';
import { ArtResources } from './storybook.ts';
import { EnemyIndicators } from '../ui/EnemyIndicators.ts';
import { aimAssistRadius, EYE_HEIGHT, moveOnGround, terrainHeight, type Obstacle } from './spatial.ts';

interface Actor { id:number; group:THREE.Group; puppet:Creature; state:CreatureState; reaction:EnemyCombat; warning:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>; spawn:THREE.Vector3; generation:number; phase:number; look:number }
interface Projectile { group:THREE.Group; velocity:THREE.Vector3; age:number; damage:number; phase:number }
type Mode='explore'|'active'|'won'|'lost';

export class Encounter {
  readonly player=new PlayerState();
  readonly group=new THREE.Group();
  private readonly actors:Actor[]=[];
  private readonly art=new ArtResources();
  private readonly projectiles:Projectile[]=[];
  private readonly events=new AbortController();
  private readonly root=document.createElement('section');
  private readonly health=document.createElement('span');
  private readonly healthFill=document.createElement('span');
  private readonly healthValue=document.createElement('span');
  private readonly shield=document.createElement('span');
  private readonly message=document.createElement('p');
  private readonly announce=document.createElement('p');
  private readonly begin=document.createElement('button');
  private readonly target=document.createElement('p');
  private mode:Mode='explore';
  private time=0;
  private hudAge=0;
  private noticeTime=0;
  private generation=0;
  private readonly ray=new THREE.Ray();
  private readonly scratch=new THREE.Vector3();
  private readonly hitPoint=new THREE.Vector3();
  private readonly hitBox=new THREE.Box3();
  private readonly wispCoreGeometry:THREE.IcosahedronGeometry;
  private readonly wispTailGeometry:THREE.ConeGeometry;
  private readonly wispRingGeometry:THREE.TorusGeometry;
  private readonly wispCoreMaterial:THREE.MeshBasicMaterial;
  private readonly wispVeilMaterial:THREE.MeshBasicMaterial;
  private readonly wispTailMaterial:THREE.MeshBasicMaterial;
  private readonly indicators=new EnemyIndicators();
  private readonly summons:GnomeSummons;
  private disposed=false;

  constructor(private readonly scene:THREE.Scene,private readonly camera:THREE.PerspectiveCamera,private readonly obstacles:readonly Obstacle[],private readonly intersectEnvironment:(ray:THREE.Ray,range:number)=>number|null,private readonly returnToGlade:()=>void){
    this.group.name='Creatures of the Hushwood';scene.add(this.group);
    this.wispCoreGeometry=this.art.geometry(new THREE.IcosahedronGeometry(0.15,1));
    this.wispTailGeometry=this.art.geometry(new THREE.ConeGeometry(0.13,0.42,5));
    this.wispRingGeometry=this.art.geometry(new THREE.TorusGeometry(0.23,0.012,4,10));
    this.wispCoreMaterial=this.art.material(new THREE.MeshBasicMaterial({color:'#ffe0a1',transparent:true,opacity:0.96,blending:THREE.AdditiveBlending,depthWrite:false}));
    this.wispVeilMaterial=this.art.material(new THREE.MeshBasicMaterial({color:'#d8915c',transparent:true,opacity:0.46,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    this.wispTailMaterial=this.art.material(new THREE.MeshBasicMaterial({color:'#b86045',transparent:true,opacity:0.42,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    const spawns:[CreatureKind,number,number][]=[['goblin',-3,-3],['goblin',4,-10],['root',7,-18],['root',-9,-21],['hollow',-5,-29],['hollow',6,-38],['wraith',10,-31],['wraith',-12,-35]];
    for(const [kind,x,z]of spawns){
      const puppet=new Creature(kind),group=new THREE.Group();group.add(puppet.group);this.group.add(group);
      const reaction=new EnemyCombat(puppet.group,{frostCrystals:false});
      const warning=new THREE.Mesh(this.art.geometry(new THREE.RingGeometry(0.87,1,64)),this.art.material(new THREE.MeshBasicMaterial({color:'#dfb47f',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide})));
      warning.rotation.x=-Math.PI/2;warning.position.y=0.025;group.add(warning);
      const spawn=this.findSpawn(x,z,CREATURE_SPECS[kind].radius);
      this.actors.push({id:this.actors.length,group,puppet,state:new CreatureState(kind),reaction,warning,spawn,generation:0,phase:this.actors.length*2.4,look:0});group.position.copy(spawn);
    }
    this.summons=new GnomeSummons(this.obstacles,this.intersectEnvironment,(id,point)=>this.summonHit(id,point));
    this.group.add(this.summons.group);this.buildHud();this.refreshHud();
  }
  private findSpawn(x:number,z:number,radius:number):THREE.Vector3 {
    const p=new THREE.Vector3(x,0,z);moveOnGround(p,0,0,this.obstacles);p.y=terrainHeight(p.x,p.z);
    for(const o of this.obstacles){const d=Math.hypot(p.x-o.x,p.z-o.z),r=o.radius+radius+0.5;if(d<r){p.x=o.x+r;p.y=terrainHeight(p.x,p.z);}}
    return p;
  }
  private buildHud():void {
    this.root.className='encounter';this.root.setAttribute('aria-label','Woodland encounter');
    const vitals=document.createElement('div');vitals.className='encounter-vitals';
    this.health.className='vital-health';this.health.setAttribute('role','meter');this.health.setAttribute('aria-valuemin','0');this.health.setAttribute('aria-valuemax','100');
    const healthLabel=document.createElement('span');healthLabel.className='vital-health-label';healthLabel.textContent='Vitality';
    this.healthValue.className='vital-health-value';
    const healthTrack=document.createElement('span');healthTrack.className='vital-health-track';this.healthFill.className='vital-health-fill';healthTrack.append(this.healthFill);
    this.health.append(healthLabel,this.healthValue,healthTrack);this.shield.className='vital-shield';vitals.append(this.health,this.shield);
    this.message.className='encounter-message';this.begin.type='button';this.begin.className='encounter-begin';this.begin.textContent='Awaken the wood';
    this.begin.addEventListener('click',()=>{this.start();this.camera.updateMatrixWorld();document.querySelector<HTMLCanvasElement>('#world canvas')?.focus({preventScroll:true});},{signal:this.events.signal});
    this.target.className='encounter-target';this.target.hidden=true;
    this.announce.className='encounter-announcement';this.announce.setAttribute('role','status');this.announce.setAttribute('aria-live','polite');
    this.root.append(vitals,this.message,this.begin,this.target,this.announce);document.querySelector('#hud')?.append(this.root);
  }
  start():void {
    if(this.disposed)return;this.summons.clear();
    this.returnToGlade();this.player.reset();this.clearProjectiles();this.indicators.reset();this.mode='active';this.time=0;this.generation++;
    for(const actor of this.actors){actor.state=new CreatureState(actor.puppet.kind);actor.reaction.reset();actor.group.position.copy(actor.spawn);actor.group.rotation.y=0;actor.look=0;actor.generation=this.generation;actor.puppet.group.visible=true;actor.puppet.group.scale.setScalar(1);actor.warning.visible=false;}
    this.notify('The wood stirs. Aim with your hands; interrupt their wind-up or raise a ward.');this.refreshHud();
  }
  private notify(text:string):void{this.announce.textContent=text;this.noticeTime=3.5;}
  private refreshHud():void {
    const health=Math.ceil(this.player.health);
    this.root.dataset.mode=this.mode;this.healthValue.textContent=`${health} / 100`;this.healthFill.style.transform=`scaleX(${this.player.health / 100})`;
    this.health.setAttribute('aria-valuenow',String(health));this.health.setAttribute('aria-label',`Vitality ${health} of 100`);
    this.shield.textContent=this.player.shield>0?`Ward ${Math.ceil(this.player.shield)} · ${Math.ceil(this.player.shieldTime)}s`:'';
    const alive=this.actors.filter(a=>a.state.alive).length;
    this.message.textContent=this.mode==='explore'?'Eight woodland spirits. Enable your camera, then awaken the wood.':this.mode==='active'?`${alive} / ${this.actors.length} spirits remain · Mend restores vitality · Aegis absorbs attacks`:this.mode==='won'?'The wood is quiet again.': 'The wood claimed this encounter. Try again when you are ready.';
    this.begin.hidden=this.mode==='active';this.begin.textContent=this.mode==='explore'?'Awaken the wood':this.mode==='won'?'Awaken them again':'Return & try again';
  }
  private lineOfSight(from:THREE.Vector3,to:THREE.Vector3):boolean {
    this.scratch.copy(to).sub(from);const distance=this.scratch.length();
    this.ray.set(from,this.scratch.normalize());const block=this.intersectEnvironment(this.ray,distance);
    return block===null||block>=distance-0.25;
  }
  private damage(amount:number):void {
    const result=this.player.damage(amount);
    if(result==='ignored')return;
    this.root.dataset.impact=result;this.notify(result==='blocked'?'Your ward held.':'Hit — keep moving. Mend restores 30 vitality.');
    if(!this.player.alive){this.mode='lost';this.clearProjectiles();this.summons.clear();this.notify('Encounter ended. Your next attempt starts at the glade.');}
    this.refreshHud();
  }
  cast(effect:SpellEffect):boolean {
    if(!this.player.alive){this.notify('Return to the glade to begin again.');return false;}
    if(!this.player.cast(effect)){this.notify(`${effect==='healing'?'Mend':effect==='shield'?'Aegis':'Spell'} is recovering · ${this.player.cooldowns[effect].toFixed(1)}s`);return false;}
    if(effect==='healing')this.notify('Mend · 30 vitality restored.');
    if(effect==='shield')this.notify('Aegis · 45-point ward for 5 seconds.');
    if(effect==='summon')this.notify('Two woodland rangers answer your call.');
    this.refreshHud();return true;
  }
  summon(spawn:THREE.Vector3,focus:THREE.Vector3,enemy:EnemyCombat|null):void {
    const target=this.actors.find(actor=>actor.reaction===enemy);
    const groundSpawn=spawn.clone();groundSpawn.y=terrainHeight(groundSpawn.x,groundSpawn.z);
    this.summons.summon(groundSpawn,focus,target?.id??null);
  }
  private summonHit(id:number,point:THREE.Vector3):void {
    const actor=this.actors.find(candidate=>candidate.id===id);
    if(!actor||!actor.state.alive||!this.player.alive)return;
    this.impactCallback(actor.reaction,'summon',point,new THREE.Color('#ffd166'))();
  }
  /** Capture generation so an old projectile can never damage a newly restarted encounter. */
  impactCallback(enemy:EnemyCombat,effect:SpellEffect,point:THREE.Vector3,color:THREE.Color):()=>void {
    const actor=this.actors.find(a=>a.reaction===enemy),generation=this.generation;
    return()=>{
      if(this.disposed||generation!==this.generation||!actor||!actor.state.alive||this.mode==='lost')return;
      const before=actor.state.health;
      if(!actor.state.hit(effect))return;
      actor.puppet.hit();
      this.indicators.hit(actor.id,actor.group.position.clone().add(new THREE.Vector3(0,CREATURE_SPECS[actor.puppet.kind].height*.65,0)),before-actor.state.health,effect);
      actor.reaction.impact(effect,point,color);
      if(effect==='wind'){
        const dx=actor.group.position.x-this.camera.position.x,dz=actor.group.position.z-this.camera.position.z,d=Math.hypot(dx,dz)||1;
        moveOnGround(actor.group.position,dx/d*2.5,dz/d*2.5,this.obstacles);actor.group.position.y-=EYE_HEIGHT;
      }
      this.notify(actor.state.alive?`${CREATURE_NAMES[actor.puppet.kind]} · ${actor.state.health} vitality`:`${CREATURE_NAMES[actor.puppet.kind]} fades.`);
      if(this.actors.every(a=>!a.state.alive)){this.mode='won';this.clearProjectiles();this.summons.clear();this.notify('All eight spirits released. The glade is yours.');}
      this.refreshHud();
    };
  }
  reactions():readonly EnemyCombat[]{return this.actors.filter(a=>a.state.alive).map(a=>a.reaction);}
  intersectEnemy(enemy:EnemyCombat,ray:THREE.Ray,point:THREE.Vector3):number|null {
    const actor=this.actors.find(a=>a.reaction===enemy);if(!actor||!actor.state.alive)return null;
    const spec=CREATURE_SPECS[actor.puppet.kind],p=actor.group.position;
    const padding=aimAssistRadius(p.distanceTo(ray.origin));
    this.hitBox.min.set(p.x-spec.radius-padding,p.y+0.1-padding,p.z-spec.radius-padding);
    this.hitBox.max.set(p.x+spec.radius+padding,p.y+spec.height+padding,p.z+spec.radius+padding);
    const hit=ray.intersectBox(this.hitBox,point);return hit?hit.distanceTo(ray.origin):null;
  }
  hasEnemy(enemy:EnemyCombat):boolean{return this.actors.some(a=>a.reaction===enemy);}

  update(dt:number,paused:boolean,reducedMotion:boolean):void {
    this.root.dataset.paused=String(paused);
    if(paused){this.updateIndicators(0,true,reducedMotion);return;}
    dt=Math.min(dt,0.05);this.time+=dt;this.player.update(dt);
    this.noticeTime=Math.max(0,this.noticeTime-dt);if(!this.noticeTime){this.announce.textContent='';delete this.root.dataset.impact;}
    const active=this.mode==='active';
    for(const actor of this.actors){
      const spec=CREATURE_SPECS[actor.puppet.kind],p=actor.group.position;
      let dx=this.camera.position.x-p.x,dz=this.camera.position.z-p.z;const distance=Math.hypot(dx,dz)||0.001;dx/=distance;dz/=distance;
      // Face the casting ground before evaluating a close strike. The previous implementation
      // never advanced `look`, so melee creatures could reach the player but fail their facing test.
      const desiredLook=Math.atan2(dx,dz);actor.look=approachAngle(actor.look,desiredLook,1-Math.exp(-dt*7));actor.group.rotation.y=actor.look;
      this.hitPoint.copy(p);this.hitPoint.y+=Math.min(2.1,spec.height*0.65);
      const los=this.lineOfSight(this.hitPoint,this.camera.position);
      const strike=actor.state.update(dt,distance,los,(active&&this.player.alive)||actor.state.pose==='dead');
      if(active&&this.player.alive&&actor.state.alive&&actor.state.pose==='walk'){
        let vx=dx,vz=dz;
        if(actor.puppet.kind==='goblin'&&distance>4){const flank=Math.sin(this.time*0.8+actor.phase)*0.38;vx+=-dz*flank;vz+=dx*flank;}
        for(const obstacle of this.obstacles){const ox=p.x-obstacle.x,oz=p.z-obstacle.z,d=Math.hypot(ox,oz),safe=obstacle.radius+spec.radius+1.8;
          if(d<safe&&d>0.01){const weight=(safe-d)/safe*2.5;vx+=ox/d*weight;vz+=oz/d*weight;const sign=Math.sin(actor.phase)>0?1:-1;vx+=-oz/d*weight*0.6*sign;vz+=ox/d*weight*0.6*sign;}
        }
        for(const other of this.actors){if(other===actor||!other.state.alive)continue;const ox=p.x-other.group.position.x,oz=p.z-other.group.position.z,d=Math.hypot(ox,oz),safe=spec.radius+CREATURE_SPECS[other.puppet.kind].radius+0.8;if(d<safe&&d>0.01){vx+=ox/d*(safe-d);vz+=oz/d*(safe-d);}}
        const length=Math.hypot(vx,vz)||1;
        moveOnGround(p,vx/length*spec.speed*dt,vz/length*spec.speed*dt,this.obstacles);p.y-=EYE_HEIGHT;
      }
      if(strike&&this.player.alive){
        if(actor.puppet.kind==='wraith'&&los){
          const group=this.createWispProjectile(this.time+actor.phase);
          group.position.copy(p);group.position.y+=1.55;this.group.add(group);
          const velocity=this.camera.position.clone().sub(group.position).normalize().multiplyScalar(3.5);
          this.projectiles.push({group,velocity,age:0,damage:spec.damage,phase:actor.phase});
        }else if(distance<=spec.range+0.35&&los&&dx*Math.sin(actor.look)+dz*Math.cos(actor.look)>0.55)this.damage(spec.damage);
      }
      actor.reaction.update(dt);actor.puppet.animate(this.time,actor.state.pose,actor.state.progress,dt,reducedMotion);
      actor.warning.visible=active&&actor.state.pose==='windup';
      if(actor.warning.visible){const size=actor.puppet.kind==='wraith'?1.1:spec.range;actor.warning.scale.setScalar(size*(0.7+actor.state.progress*0.3));actor.warning.material.opacity=0.18+actor.state.progress*0.42;}
    }
    this.summons.update(dt,this.player.alive,this.camera.position,
      this.actors.map(actor=>({id:actor.id,position:actor.group.position,height:CREATURE_SPECS[actor.puppet.kind].height,alive:actor.state.alive})),reducedMotion);
    for(let i=this.projectiles.length-1;i>=0;i--){
      const projectile=this.projectiles[i];projectile.age+=dt;
      const from=projectile.group.position.clone(),step=projectile.velocity.length()*dt;
      projectile.group.position.addScaledVector(projectile.velocity,dt);this.ray.set(from,this.scratch.copy(projectile.velocity).normalize());
      projectile.group.lookAt(this.scratch.copy(projectile.group.position).add(projectile.velocity));projectile.group.rotateZ(projectile.phase+projectile.age*3.5);
      projectile.group.scale.setScalar(0.9+Math.sin(projectile.age*11+projectile.phase)*0.08);
      const block=this.intersectEnvironment(this.ray,step);
      const hit=projectile.group.position.distanceTo(this.camera.position)<0.65;
      if(hit||block!==null||projectile.age>7){projectile.group.removeFromParent();this.projectiles.splice(i,1);}
      if(hit){this.damage(projectile.damage);break;}
    }
    this.hudAge+=dt;if(this.hudAge>0.12){this.hudAge=0;this.refreshHud();this.updateTarget();}
    this.updateIndicators(dt,false,reducedMotion);
  }
  private updateIndicators(dt:number,paused:boolean,reducedMotion:boolean):void {
    this.indicators.update(dt,this.camera,this.actors.map(actor=>({id:actor.id,position:actor.group.position,height:CREATURE_SPECS[actor.puppet.kind].height,name:CREATURE_NAMES[actor.puppet.kind],health:actor.state.health,maximum:CREATURE_SPECS[actor.puppet.kind].health,state:actor.state.pose,progress:actor.state.progress})),paused,reducedMotion);
  }

  private updateTarget():void {
    this.ray.set(this.camera.position,this.camera.getWorldDirection(this.scratch));
    let nearest=this.intersectEnvironment(this.ray,55)??55,selected:Actor|null=null;
    for(const actor of this.actors){const d=this.intersectEnemy(actor.reaction,this.ray,this.hitPoint);if(d!==null&&d<nearest){nearest=d;selected=actor;}}
    this.target.hidden=!selected;
    if(selected)this.target.textContent=`${CREATURE_NAMES[selected.puppet.kind]} · ${selected.state.health} / ${CREATURE_SPECS[selected.puppet.kind].health} · ${Math.round(nearest)} m`;
  }
  private createWispProjectile(phase:number):THREE.Group {
    const group=new THREE.Group();group.name='Lantern wraith ember-wisp';
    const core=new THREE.Mesh(this.wispCoreGeometry,this.wispCoreMaterial);group.add(core);
    const veil=new THREE.Mesh(this.wispCoreGeometry,this.wispVeilMaterial);veil.scale.setScalar(1.72);veil.rotation.set(phase,phase*.6,0);group.add(veil);
    const tail=new THREE.Mesh(this.wispTailGeometry,this.wispTailMaterial);tail.rotation.x=-Math.PI/2;tail.position.z=-0.24;group.add(tail);
    for(const angle of [0,Math.PI*.66,Math.PI*1.33]){
      const ring=new THREE.Mesh(this.wispRingGeometry,this.wispVeilMaterial);ring.rotation.set(angle*.35,angle,Math.PI/2);ring.position.set(Math.cos(angle)*.09,Math.sin(angle)*.09,-.04);group.add(ring);
    }
    return group;
  }
  private clearProjectiles():void{for(const p of this.projectiles)p.group.removeFromParent();this.projectiles.length=0;}
  dispose():void {
    if(this.disposed)return;this.disposed=true;this.events.abort();this.clearProjectiles();
    this.summons.dispose();for(const actor of this.actors){actor.reaction.dispose();actor.puppet.dispose();}this.indicators.dispose();this.art.dispose();this.root.remove();this.scene.remove(this.group);
  }
}

function approachAngle(from:number,to:number,amount:number):number {
  let delta=(to-from+Math.PI)%(Math.PI*2)-Math.PI;
  if(delta<-Math.PI)delta+=Math.PI*2;
  return from+delta*amount;
}
