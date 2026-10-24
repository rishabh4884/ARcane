import * as THREE from 'three';
import { CreatureArtwork } from './CreatureArtwork.ts';
import { ArtResources } from './storybook.ts';

export type CreatureKind='goblin'|'root'|'hollow'|'wraith';
export type CreaturePose='idle'|'walk'|'windup'|'strike'|'recover'|'stagger'|'frozen'|'dead';
export const CREATURE_NAMES:Record<CreatureKind,string>={goblin:'Bramble Goblin',root:'Rootbound',hollow:'The Antlered Hollow',wraith:'Lantern Wraith'};
const SIZES:Record<CreatureKind,{height:number;width:number;head:number;body:number;leg:number}>={
  goblin:{height:2,width:1.8,head:1.10,body:1.28,leg:0.64},
  root:{height:3.8,width:2.8,head:1.75,body:2.4,leg:1.0},
  hollow:{height:5.3,width:2.6,head:2.4,body:3.0,leg:1.5},
  wraith:{height:3,width:2.05,head:1.15,body:2.5,leg:0.35},
};

/** Articulated illustrated puppets: expressive silhouettes rather than assemblies of primitives. */
export class Creature {
  readonly group=new THREE.Group();
  readonly body=new THREE.Group();
  private readonly art=new ArtResources();
  private readonly artwork=new CreatureArtwork();
  private readonly head=new THREE.Group();
  private readonly arms:THREE.Group[]=[];
  private readonly legs:THREE.Group[]=[];
  private readonly lantern=new THREE.Group();
  private readonly materials:THREE.MeshBasicMaterial[]=[];
  private pose:CreaturePose='idle';
  private freezeTime=0;
  private hitTime=1;
  private disposed=false;

  constructor(readonly kind:CreatureKind){
    const s=SIZES[kind];this.group.name=CREATURE_NAMES[kind];this.group.add(this.body);
    const torso=this.part('body',s.width,s.body);torso.position.set(0,s.leg+s.body*0.4,0);this.body.add(torso);
    for(const side of [-1,1]){
      const leg=new THREE.Group();leg.position.set(side*s.width*0.14,s.leg+0.09,-0.035);
      const shape=this.part('leg',s.width*0.42,s.leg*1.18);shape.position.y=-s.leg*0.48;shape.scale.x=side;
      leg.add(shape);this.body.add(leg);this.legs.push(leg);
      const arm=new THREE.Group();arm.position.set(side*s.width*0.19,s.leg+s.body*0.70,side<0?-0.02:0.04);
      const hand=this.part('arm',s.width*0.5,s.body*1.05);hand.position.y=-s.body*0.43;hand.scale.x=side;
      arm.add(hand);this.body.add(arm);this.arms.push(arm);
    }
    this.head.position.set(0,s.height-s.head*0.48,0.08);this.head.add(this.part('head',s.width*1.20,s.head));this.body.add(this.head);
    if(kind==='wraith'){
      const lantern=this.part('lantern',0.58,0.66);this.lantern.add(lantern);
      this.lantern.position.set(0,-s.body*0.95,0.06);this.arms[1].add(this.lantern);
    }
    // A grounded, translucent contact patch attaches the artwork to the continuous forest floor.
    const shadow=this.art.material(new THREE.MeshBasicMaterial({color:'#102f30',transparent:true,opacity:0.15,depthWrite:false,side:THREE.DoubleSide}));
    const ellipse=new THREE.Mesh(this.art.geometry(new THREE.CircleGeometry(0.5,32)),shadow);ellipse.rotation.x=-Math.PI/2;ellipse.scale.set(s.width*0.68,s.width*0.27,1);ellipse.position.y=0.016;this.group.add(ellipse);
  }
  private part(name:'body'|'head'|'arm'|'leg'|'lantern',width:number,height:number):THREE.Mesh {
    const map=this.artwork.part(this.kind,name);
    const material=this.art.material(new THREE.MeshBasicMaterial({map,alphaTest:0.12,side:THREE.DoubleSide,transparent:false,fog:true}));material.toneMapped=false;this.materials.push(material);
    return new THREE.Mesh(this.art.geometry(new THREE.PlaneGeometry(width,height,1,3)),material);
  }
  hit():void{this.hitTime=0;}

  animate(time:number,pose:CreaturePose,progress:number,dt:number,reducedMotion=false):void {
    this.hitTime+=dt;
    const recoil=this.hitTime<.5?Math.sin(this.hitTime/.5*Math.PI)*Math.exp(-this.hitTime*4):0;
    if(pose==='frozen'&&this.pose==='frozen')return;
    if(pose==='frozen')this.freezeTime=time;
    this.pose=pose;if(pose==='frozen')time=this.freezeTime;
    const s=SIZES[this.kind],walking=pose==='walk',phase=time*(this.kind==='goblin'?3.5:this.kind==='hollow'?1.7:2.1);
    const gait=walking?Math.sin(phase):0,windup=pose==='windup'?Math.sin(progress*Math.PI/2):0;
    const strike=pose==='strike'?Math.sin(progress*Math.PI):0,dead=pose==='dead'?THREE.MathUtils.smoothstep(progress,0,1):0;
    const idle=reducedMotion?0:Math.sin(time*1.3)*0.014;
    const blend=1-Math.exp(-dt*14);
    const turn=(o:THREE.Object3D,value:number)=>{o.rotation.z=THREE.MathUtils.lerp(o.rotation.z,value,blend);};
    this.body.position.y=(this.kind==='wraith'?0.16+(reducedMotion?0:Math.sin(time*1.5)*0.07):Math.abs(gait)*0.018)+idle-dead*s.height*0.12;
    this.body.position.x=-windup*0.045+strike*0.12+recoil*0.12;
    this.body.rotation.x=windup*-0.03+strike*0.04;
    turn(this.body,gait*0.018-windup*0.045+strike*0.075+dead*0.65+recoil*0.13);
    turn(this.head,(reducedMotion?0:Math.sin(time*0.5)*0.018)-windup*0.04);
    for(let i=0;i<2;i++){
      const side=i===0?-1:1;
      turn(this.arms[i],side*(0.05+windup*0.85-strike*0.50)+gait*side*0.08);
      this.arms[i].position.y=s.leg+s.body*0.70+(walking?Math.sin(phase+side)*0.015:0);
      turn(this.legs[i],gait*side*0.055);
      this.legs[i].position.y=s.leg+0.09+(walking?Math.max(0,gait*side)*0.045:0);
    }
    turn(this.lantern,reducedMotion?0:Math.sin(time*1.3)*0.12);
    this.group.scale.set(1-dead*0.12,1-dead*0.78,1);this.group.visible=dead<0.99;
    this.group.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(!(material instanceof THREE.MeshBasicMaterial)||material.map===null)continue;
        material.transparent=dead>0;material.opacity=1-dead;
        if(this.hitTime<.18)material.color.set('#fff1ce');
      }
    });
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.art.dispose();this.artwork.dispose();this.group.removeFromParent();}
}
