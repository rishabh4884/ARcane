import * as THREE from 'three';
import { CreatureArtwork } from './CreatureArtwork.ts';
import { ArtResources } from './storybook.ts';
import { glowTexture } from './vfx.ts';

export type CreatureKind='goblin'|'root'|'hollow'|'wraith';
export type CreaturePose='idle'|'walk'|'windup'|'strike'|'recover'|'stagger'|'frozen'|'dead';
export const CREATURE_NAMES:Record<CreatureKind,string>={goblin:'Bramble Goblin',root:'Rootbound',hollow:'The Antlered Hollow',wraith:'Lantern Wraith'};
const SIZES:Record<CreatureKind,{height:number;width:number;head:number;body:number;leg:number}>={
  goblin:{height:2,width:1.8,head:1.10,body:1.28,leg:0.64},
  root:{height:3.8,width:2.8,head:1.75,body:2.4,leg:1.0},
  hollow:{height:5.3,width:2.6,head:2.4,body:3.0,leg:1.5},
  wraith:{height:3,width:2.05,head:1.15,body:2.5,leg:0.35},
};

/** Where the face lives on each 512px head painting: sockets, eye size and the mouth. */
const FACES:Record<CreatureKind,{eyes:[number,number][];eyeSize:number;mouth:[number,number];mouthSize:[number,number];glow:string;blinks:boolean}>={
  goblin:{eyes:[[217,244],[298,243]],eyeSize:40,mouth:[256,352],mouthSize:[96,40],glow:'#d4ff6a',blinks:true},
  root:{eyes:[[230,279],[288,279]],eyeSize:40,mouth:[262,350],mouthSize:[86,40],glow:'#ffb347',blinks:true},
  hollow:{eyes:[[229,289],[286,289]],eyeSize:30,mouth:[258,402],mouthSize:[34,48],glow:'#e6f3ff',blinks:false},
  wraith:{eyes:[[234,277],[283,277]],eyeSize:36,mouth:[260,322],mouthSize:[62,34],glow:'#7fe8ff',blinks:true},
};
const ANGER=new THREE.Color('#ff3d1f');
const ICE=new THREE.Color('#9fdcff');
const WHITE=new THREE.Color('#ffffff');
const EMBER=new THREE.Color('#ffb066');

interface PartUniforms { bend:{value:number}; curl:{value:number}; height:{value:number} }
interface Eye { root:THREE.Group; halo:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>; core:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>; home:THREE.Vector3 }
interface ArmRig { uniforms:PartUniforms; phase:number; twitchAt:number; twitch:number; twitchDir:number }

/** Articulated illustrated puppets: expressive silhouettes rather than assemblies of primitives. */
export class Creature {
  readonly group=new THREE.Group();
  readonly body=new THREE.Group();
  private readonly art=new ArtResources();
  private readonly artwork=new CreatureArtwork();
  private readonly head=new THREE.Group();
  private readonly arms:THREE.Group[]=[];
  private readonly armRigs:ArmRig[]=[];
  private readonly legs:THREE.Group[]=[];
  private readonly lantern=new THREE.Group();
  private readonly eyes:Eye[]=[];
  private readonly mouth:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
  private readonly torso:THREE.Mesh;
  private readonly glow:THREE.Color;
  private readonly eyeColor=new THREE.Color();
  private readonly dissolve={value:0};
  private readonly edge:{value:THREE.Color};
  private readonly seed:number;
  private readonly random:()=>number;
  private pose:CreaturePose='idle';
  private freezeTime=0;
  private hitTime=1;
  private disposed=false;
  private nextBlink=2;
  private blinkAt=-10;
  private doubleBlink=false;
  private nextGlance=1;
  private readonly gaze=new THREE.Vector2();
  private readonly gazeTarget=new THREE.Vector2();
  private tilt=0;
  private tiltTarget=0;
  private nextTilt=3;
  private jerk=0;
  private nextJerk=6;
  private mouthOpen=0;
  private awakenAge=Infinity;
  private static count=0;

  constructor(readonly kind:CreatureKind){
    this.seed=(Creature.count++)*7919+kind.length*131;
    this.random=seeded(this.seed);
    this.nextBlink=1+this.random()*4;this.nextTilt=1+this.random()*4;this.nextJerk=4+this.random()*8;
    const s=SIZES[kind],face=FACES[kind];
    this.glow=new THREE.Color(face.glow);
    this.edge={value:this.glow.clone()};
    this.group.name=CREATURE_NAMES[kind];this.group.add(this.body);
    this.torso=this.part('body',s.width,s.body);this.torso.position.set(0,s.leg+s.body*0.4,0);this.body.add(this.torso);
    for(const side of [-1,1]){
      const leg=new THREE.Group();leg.position.set(side*s.width*0.14,s.leg+0.09,-0.035);
      const shape=this.part('leg',s.width*0.42,s.leg*1.18);shape.position.y=-s.leg*0.48;shape.scale.x=side;
      leg.add(shape);this.body.add(leg);this.legs.push(leg);
      const arm=new THREE.Group();arm.position.set(side*s.width*0.19,s.leg+s.body*0.70,side<0?-0.02:0.04);
      const uniforms:PartUniforms={bend:{value:0},curl:{value:0},height:{value:s.body*1.05}};
      const hand=this.part('arm',s.width*0.5,s.body*1.05,uniforms,10);hand.position.y=-s.body*0.43;hand.scale.x=side;
      arm.add(hand);this.body.add(arm);this.arms.push(arm);
      this.armRigs.push({uniforms,phase:this.random()*6.28,twitchAt:1+this.random()*3,twitch:-10,twitchDir:1});
    }
    this.head.position.set(0,s.height-s.head*0.48,0.08);
    const headWidth=s.width*1.20;
    this.head.add(this.part('head',headWidth,s.head));this.body.add(this.head);
    // Expression overlays, placed exactly over the painted sockets and mouth.
    const at=(px:number,py:number,z:number)=>new THREE.Vector3((px/512-0.5)*headWidth,(0.5-py/512)*s.head,z);
    const eyeWidth=face.eyeSize/512*headWidth;
    for(const [px,py] of face.eyes){
      const root=new THREE.Group();const home=at(px,py,0.02);root.position.copy(home);
      const halo=this.overlay(glowTexture(),eyeWidth*2.6,eyeWidth*1.5,THREE.AdditiveBlending);
      const core=this.overlay(glowTexture(),eyeWidth*1.05,eyeWidth*0.42,THREE.AdditiveBlending);core.position.z=0.004;
      root.add(halo,core);this.head.add(root);this.eyes.push({root,halo,core,home});
    }
    this.mouth=this.overlay(this.artwork.mouth(),face.mouthSize[0]/512*headWidth,face.mouthSize[1]/512*s.head,THREE.NormalBlending);
    this.mouth.material.color.set('#ffffff');
    this.mouth.position.copy(at(face.mouth[0],face.mouth[1],0.012));
    this.mouth.scale.y=0.08;
    this.head.add(this.mouth);
    if(kind==='wraith'){
      const lantern=this.part('lantern',0.58,0.66);this.lantern.add(lantern);
      this.lantern.position.set(0,-s.body*0.95,0.06);this.arms[1].add(this.lantern);
    }
    // A grounded, translucent contact patch attaches the artwork to the continuous forest floor.
    const shadow=this.art.material(new THREE.MeshBasicMaterial({color:'#102f30',transparent:true,opacity:0.15,depthWrite:false,side:THREE.DoubleSide}));
    const ellipse=new THREE.Mesh(this.art.geometry(new THREE.CircleGeometry(0.5,32)),shadow);ellipse.rotation.x=-Math.PI/2;ellipse.scale.set(s.width*0.68,s.width*0.27,1);ellipse.position.y=0.016;ellipse.userData.arcaneOverlay=true;this.group.add(ellipse);
  }

  private overlay(map:THREE.Texture,width:number,height:number,blending:THREE.Blending):THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial> {
    const material=this.art.material(new THREE.MeshBasicMaterial({map,color:this.glow,transparent:true,depthWrite:false,blending,toneMapped:false,side:THREE.DoubleSide,fog:true}));
    const mesh=new THREE.Mesh(this.art.geometry(new THREE.PlaneGeometry(width,height)),material);
    mesh.userData.arcaneOverlay=true;mesh.renderOrder=2;
    return mesh;
  }

  /**
   * One cut-paper part. Every part shares a shader patch: arms bend and curl along their length
   * (claws reach and twitch), and the whole puppet can dissolve into embers.
   */
  private part(name:'body'|'head'|'arm'|'leg'|'lantern',width:number,height:number,uniforms?:PartUniforms,rows=3):THREE.Mesh {
    const map=this.artwork.part(this.kind,name);
    const material=this.art.material(new THREE.MeshBasicMaterial({map,alphaTest:0.12,side:THREE.DoubleSide,transparent:false,fog:true}));material.toneMapped=false;
    const rig=uniforms??{bend:{value:0},curl:{value:0},height:{value:height}};
    const dissolve=this.dissolve,edge=this.edge;
    material.onBeforeCompile=(shader)=>{
      shader.uniforms.uBend=rig.bend;shader.uniforms.uCurl=rig.curl;shader.uniforms.uPartHeight=rig.height;
      shader.uniforms.uDissolve=dissolve;shader.uniforms.uEdge=edge;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uBend; uniform float uCurl; uniform float uPartHeight; varying vec2 vPartUv;')
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          vPartUv = uv;
          // 0 at the shoulder, 1 at the claws: the lower limb bends more than the upper.
          float limb = 1.0 - uv.y;
          transformed.x += uBend * limb * limb * uPartHeight;
          transformed.z += uCurl * limb * limb * limb * uPartHeight * 0.55;
          transformed.y += abs(uCurl) * limb * limb * uPartHeight * 0.08;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
          uniform float uDissolve; uniform vec3 uEdge; varying vec2 vPartUv;
          float creatureHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
          float creatureNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(creatureHash(i), creatureHash(i + vec2(1.0, 0.0)), f.x), mix(creatureHash(i + vec2(0.0, 1.0)), creatureHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
          float creatureGrain = creatureNoise(vPartUv * 9.0) * 0.65 + creatureNoise(vPartUv * 23.0) * 0.35;
          // Dissolve from the top down, broken up by noise, with a glowing burning edge.
          float creatureFront = creatureGrain * 0.55 + vPartUv.y * 0.45;
          float creatureCut = uDissolve * 1.08 - 0.04;
          if (uDissolve > 0.0 && creatureFront < creatureCut) discard;
          float creatureBurn = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.06, creatureFront - creatureCut) : 0.0;
          diffuseColor.rgb = mix(diffuseColor.rgb, uEdge * 1.8, creatureBurn);`);
    };
    material.customProgramCacheKey=()=>'creature-rig-v1';
    return new THREE.Mesh(this.art.geometry(new THREE.PlaneGeometry(width,height,1,rows)),material);
  }

  hit():void{this.hitTime=0;}
  /** 0 when solid, 1 when fully dissolved (dead or not yet risen). */
  get fade():number{return this.group.visible?this.dissolve.value:1;}

  /** Restart presentation state and rise out of the forest floor when the wood awakens. */
  awaken():void{this.hitTime=1;this.pose='idle';this.awakenAge=0;this.dissolve.value=1;this.edge.value.copy(this.glow);}

  animate(time:number,pose:CreaturePose,progress:number,dt:number,reducedMotion=false):void {
    this.hitTime+=dt;
    const recoil=this.hitTime<.5?Math.sin(this.hitTime/.5*Math.PI)*Math.exp(-this.hitTime*4):0;
    const frozenHold=pose==='frozen'&&this.pose==='frozen';
    if(pose==='frozen'&&!frozenHold)this.freezeTime=time;
    this.pose=pose;
    this.updateFace(time,pose,progress,dt,reducedMotion);
    this.updateDissolve(pose,progress,dt);
    // Ice holds the limbs exactly where they were.
    if(frozenHold)return;
    if(pose==='frozen')time=this.freezeTime;
    const s=SIZES[this.kind],walking=pose==='walk';
    const profile=this.kind==='goblin'
      ? { cadence:5.2,bounce:.055,crouch:.075,lunge:.28,windup:.075,strike:.09,armWindup:.95,armStrike:1.05,headWindup:.07,headStrike:.03 }
      : this.kind==='root'
        ? { cadence:1.15,bounce:.028,crouch:.035,lunge:.10,windup:.11,strike:.055,armWindup:.66,armStrike:.82,headWindup:.025,headStrike:.015 }
        : this.kind==='hollow'
          ? { cadence:1.55,bounce:.038,crouch:.03,lunge:.18,windup:.09,strike:.13,armWindup:.42,armStrike:.58,headWindup:.14,headStrike:.18 }
          : { cadence:1.9,bounce:.07,crouch:.02,lunge:.045,windup:.04,strike:.025,armWindup:.72,armStrike:.34,headWindup:.035,headStrike:.02 };
    const phase=time*profile.cadence;
    const gait=walking?Math.sin(phase):0,windup=pose==='windup'?Math.sin(progress*Math.PI/2):0;
    const strike=pose==='strike'?Math.sin(progress*Math.PI):0,dead=pose==='dead'?THREE.MathUtils.smoothstep(progress,0,1):0;
    const idle=reducedMotion?0:Math.sin(time*1.3)*0.014;
    const blend=1-Math.exp(-dt*14);
    const turn=(o:THREE.Object3D,value:number)=>{o.rotation.z=THREE.MathUtils.lerp(o.rotation.z,value,blend);};
    const rise=this.awakenAge<1.4?(1-THREE.MathUtils.smoothstep(this.awakenAge,0,1.4))*-0.35:0;
    this.body.position.y=(this.kind==='wraith'?0.16+(reducedMotion?0:Math.sin(time*1.5)*profile.bounce):Math.abs(gait)*profile.bounce)+idle-dead*s.height*0.05+rise;
    this.body.position.x=-windup*profile.crouch+strike*profile.lunge+recoil*0.12;
    this.body.rotation.x=windup*-profile.windup+strike*profile.strike;
    turn(this.body,gait*(this.kind==='goblin' ? .028 : .018)-windup*profile.windup+strike*profile.strike+dead*.18+recoil*.13);
    // Slow, uncanny head tilts with a rare sharp jerk.
    if(!reducedMotion){
      if(time>this.nextTilt){this.tiltTarget=(this.random()-.5)*(this.kind==='hollow'?.34:.24);this.nextTilt=time+3.5+this.random()*4;}
      if(time>this.nextJerk){this.jerk=(this.random()<.5?-1:1)*.09;this.nextJerk=time+6+this.random()*9;}
    }
    this.tilt+=(this.tiltTarget-this.tilt)*(1-Math.exp(-dt*1.1));
    this.jerk*=Math.exp(-dt*11);
    const tilt=reducedMotion?0:this.tilt+this.jerk;
    turn(this.head,(reducedMotion?0:Math.sin(time*(this.kind==='hollow' ? .7 : .5))*.018)-windup*profile.headWindup+strike*profile.headStrike+tilt*(1-windup*.6));
    this.head.rotation.x=windup*.06-strike*.04;
    // Breathing: the torso swells a little, slower for the big ones.
    this.torso.scale.y=1+(reducedMotion?0:Math.sin(time*(this.kind==='root'||this.kind==='hollow'?.9:1.6)+this.seed)*.014);
    for(let i=0;i<2;i++){
      const side=i===0?-1:1;
      const armWindup=this.kind==='wraith'&&i===1?profile.armWindup*1.28:profile.armWindup;
      const armStrike=this.kind==='root'?profile.armStrike*(i===0?1:-1):profile.armStrike;
      const armGait=this.kind==='wraith'?Math.sin(phase+side)*.035:gait*side*(this.kind==='goblin' ? .13 : .08);
      const rig=this.armRigs[i];
      // Independent idle sway per arm so the pair never moves in lockstep.
      const sway=reducedMotion?0:Math.sin(time*.73+rig.phase)*.035+Math.sin(time*.29+rig.phase*2)*.02;
      turn(this.arms[i],side*(.05+windup*armWindup-strike*armStrike)+armGait+sway*side);
      this.arms[i].position.y=s.leg+s.body*.70+(walking?Math.sin(phase+side)*profile.bounce*.55:0);
      turn(this.legs[i],gait*side*(this.kind==='root' ? .035 : this.kind==='goblin' ? .075 : .055));
      this.legs[i].position.y=s.leg+.09+(walking?Math.max(0,gait*side)*profile.bounce*.8:0);
      // Claws: a twitch now and then, a slow flex, reaching toward the player during the wind-up.
      if(!reducedMotion&&time>rig.twitchAt){rig.twitch=time;rig.twitchDir=this.random()<.5?-1:1;rig.twitchAt=time+1.8+this.random()*4.2;}
      const twitch=reducedMotion||time<rig.twitch?0:Math.exp(-(time-rig.twitch)*9);
      const flex=reducedMotion?0:Math.sin(time*1.7+rig.phase)*.025;
      const bendGoal=(twitch*.1*rig.twitchDir+flex+gait*side*.04-windup*.12+strike*.18)*side;
      const curlGoal=windup*.55+strike*.9+twitch*.18+(pose==='stagger'?-.25:0)+(reducedMotion?0:Math.max(0,Math.sin(time*.61+rig.phase))*.06);
      rig.uniforms.bend.value=THREE.MathUtils.lerp(rig.uniforms.bend.value,bendGoal,1-Math.exp(-dt*(twitch>.3?30:8)));
      rig.uniforms.curl.value=THREE.MathUtils.lerp(rig.uniforms.curl.value,curlGoal,1-Math.exp(-dt*(pose==='strike'?24:7)));
    }
    turn(this.lantern,reducedMotion?0:Math.sin(time*1.3)*0.12);
    this.group.scale.set(1,1-dead*0.1,1);
    if(this.hitTime<.18){
      // EnemyCombat swaps in per-instance clones, so flash whatever material each part wears now.
      this.group.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||object.userData.arcaneOverlay)return;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          if(material instanceof THREE.MeshBasicMaterial&&material.map)material.color.set('#fff1ce');
        }
      });
    }
  }

  private updateFace(time:number,pose:CreaturePose,progress:number,dt:number,reducedMotion:boolean):void {
    const face=FACES[this.kind];
    const windup=pose==='windup'?THREE.MathUtils.smoothstep(progress,0,1):0;
    const strike=pose==='strike'?1:0;
    // Eye colour and intensity carry the mood: a dull watchful glow, a red glare as it winds up.
    let intensity=.8+(reducedMotion?0:Math.sin(time*1.9+this.seed)*.08);
    this.eyeColor.copy(this.glow);
    if(windup>0||strike){this.eyeColor.lerp(ANGER,Math.max(windup,strike)*.85);intensity=1+windup*.9+strike*1.2;}
    if(pose==='frozen'){this.eyeColor.copy(ICE);intensity=.35;}
    if(pose==='stagger'||this.hitTime<.35)intensity*=Math.random()<.45?.15:1.25;
    if(pose==='dead')intensity*=Math.max(0,1-progress*1.6);
    if(this.awakenAge<1.4)intensity*=THREE.MathUtils.smoothstep(this.awakenAge,.6,1.4);
    // Blinks (the Hollow never blinks: its eyes gutter out instead) and darting glances.
    if(!reducedMotion&&time>this.nextBlink&&pose!=='frozen'&&pose!=='dead'){
      this.blinkAt=time;this.doubleBlink=this.random()<.25;this.nextBlink=time+2.4+this.random()*4.5;
    }
    const since=time-this.blinkAt;
    const lid=(t:number)=>t>=0&&t<.16?Math.sin(t/.16*Math.PI):0;
    const closed=Math.max(lid(since),this.doubleBlink?lid(since-.24):0);
    let openY=face.blinks?1-closed*.94:1-closed*.25;
    if(!face.blinks)intensity*=1-closed*.8;
    openY*=1-windup*.38;
    if(!reducedMotion&&time>this.nextGlance){
      this.gazeTarget.set((this.random()-.5)*.06,(this.random()-.5)*.025);
      this.nextGlance=time+.7+this.random()*2.2;
    }
    if(windup>0)this.gazeTarget.set(0,0);
    this.gaze.lerp(this.gazeTarget,1-Math.exp(-dt*22));
    const headWidth=SIZES[this.kind].width*1.2;
    for(const eye of this.eyes){
      eye.root.position.set(eye.home.x+this.gaze.x*headWidth*.35,eye.home.y+this.gaze.y*headWidth*.35,eye.home.z);
      eye.root.scale.set(1+windup*.15,Math.max(.04,openY),1);
      eye.halo.material.color.copy(this.eyeColor).multiplyScalar(intensity*.75);
      eye.core.material.color.copy(this.eyeColor).lerp(WHITE,.45).multiplyScalar(intensity);
    }
    // The jaw: breathes almost shut, opens through the wind-up, gapes on the strike.
    const breathe=reducedMotion?0:Math.max(0,Math.sin(time*1.1+this.seed))*.06;
    const goal=pose==='frozen'?this.mouthOpen:pose==='dead'?.5:strike?1:pose==='stagger'?.55:windup*.75+breathe;
    this.mouthOpen+=(goal-this.mouthOpen)*(1-Math.exp(-dt*(strike?18:6)));
    this.mouth.scale.y=.08+this.mouthOpen*.92;
    this.mouth.material.opacity=Math.min(1,this.mouthOpen*3+.15)*(pose==='dead'?Math.max(0,1-progress*1.4):1)*(this.awakenAge<1.4?THREE.MathUtils.smoothstep(this.awakenAge,.4,1.4):1);
  }

  private updateDissolve(pose:CreaturePose,progress:number,dt:number):void {
    if(pose==='dead'){
      this.edge.value.lerp(EMBER,.1);
      this.dissolve.value=THREE.MathUtils.smoothstep(progress,.05,.95);
    }else if(this.awakenAge<1.4){
      this.awakenAge+=dt;
      this.dissolve.value=1-THREE.MathUtils.smoothstep(this.awakenAge,0,1.4);
    }else{
      this.dissolve.value=0;
    }
    this.group.visible=this.dissolve.value<.995;
  }

  dispose():void{if(this.disposed)return;this.disposed=true;this.art.dispose();this.artwork.dispose();this.group.removeFromParent();}
}

function seeded(seed:number):()=>number{
  let state=seed>>>0||1;
  return()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
