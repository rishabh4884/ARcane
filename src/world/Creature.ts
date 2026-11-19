import * as THREE from 'three';
import { CreatureArtwork, sheetSize, type CreaturePart, type PupilShape } from './CreatureArtwork.ts';
import { ArtResources } from './storybook.ts';
import { glowTexture } from './vfx.ts';
import { paintedMaterial, type PaintUniforms } from './paintMaterial.ts';

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
const FACES:Record<CreatureKind,{eyes:[number,number][];eyeSize:number;mouth:[number,number];mouthSize:[number,number];glow:string;blinks:boolean;pupil:PupilShape}>={
  goblin:{eyes:[[217,244],[298,243]],eyeSize:40,mouth:[256,352],mouthSize:[96,40],glow:'#d4ff6a',blinks:true,pupil:'slit'},
  root:{eyes:[[230,279],[288,279]],eyeSize:40,mouth:[262,350],mouthSize:[86,40],glow:'#ffb347',blinks:true,pupil:'bar'},
  hollow:{eyes:[[229,289],[286,289]],eyeSize:30,mouth:[258,402],mouthSize:[34,48],glow:'#e6f3ff',blinks:false,pupil:'pin'},
  wraith:{eyes:[[234,277],[283,277]],eyeSize:36,mouth:[260,322],mouthSize:[62,34],glow:'#7fe8ff',blinks:true,pupil:'ring'},
};
const ANGER=new THREE.Color('#ff3d1f');
const ICE=new THREE.Color('#9fdcff');
const WHITE=new THREE.Color('#ffffff');
const EMBER=new THREE.Color('#ffb066');

/**
 * Where each painted arm bends, in its 512px artwork: elbow and wrist, the knuckle line, and every
 * finger's root (x) with its resting splay. The painting is one continuous sheet; these are only
 * where the bones sit inside it.
 */
const ARMS:Record<CreatureKind,{elbow:[number,number];wrist:[number,number];knuckle:number;palm:number;fingers:[number,number][]}>={
  goblin:{elbow:[231,205],wrist:[242,342],knuckle:426,palm:262,fingers:[[212,-.3],[236,-.1],[260,.1],[290,.35]]},
  root:{elbow:[224,205],wrist:[262,362],knuckle:410,palm:268,fingers:[[218,-.3],[250,-.08],[284,.14],[318,.42]]},
  hollow:{elbow:[230,245],wrist:[258,392],knuckle:418,palm:262,fingers:[[228,-.26],[252,-.08],[274,.1],[298,.34]]},
  wraith:{elbow:[216,255],wrist:[247,362],knuckle:402,palm:250,fingers:[[212,-.3],[240,-.05],[268,.15],[294,.36]]},
};
/** Hip, knee and ankle down each leg painting, as fractions of its height. */
const LEGS:Partial<Record<CreatureKind,{hip:number;knee:number;ankle:number}>>={
  goblin:{hip:.05,knee:.45,ankle:.78},
  root:{hip:.05,knee:.47,ankle:.74},
};

interface Joint { shoulder:number; elbow:number; wrist:number; curl:number; spread:number }
const joint=(shoulder:number,elbow:number,wrist:number,curl:number,spread:number):Joint=>({shoulder,elbow,wrist,curl,spread});
/**
 * Body language for each spirit's attack, per arm (own space: + swings the arm outward/up).
 *  goblin: both claws drawn up beside the head, then two raking swipes a beat apart.
 *  root:   arms hauled overhead with the hands knotted, then a hammer slam.
 *  hollow: arms spread wide and high with the forearms hanging limp, then a folding grab.
 *  wraith: the free hand cups an ember beside its face and flings it; the lantern rises.
 */
const ATTACKS:Record<CreatureKind,{rest:Joint;cocked:[Joint,Joint];follow:[Joint,Joint];delay:[number,number];smear:boolean}>={
  goblin:{rest:joint(.1,-.22,.06,.35,.2),cocked:[joint(1.25,1.4,.5,-.3,1.05),joint(1.15,1.5,.55,-.3,1.05)],follow:[joint(-.6,-.35,-.5,1.1,.35),joint(-.6,-.35,-.5,1.1,.35)],delay:[0,.4],smear:true},
  root:{rest:joint(.06,-.12,.04,.5,.12),cocked:[joint(2.45,.6,.35,1.15,.05),joint(2.45,.6,.35,1.15,.05)],follow:[joint(-.1,-.3,-.35,1.2,.05),joint(-.1,-.3,-.35,1.2,.05)],delay:[0,.06],smear:true},
  hollow:{rest:joint(.05,-.1,-.14,.25,.3),cocked:[joint(1.6,-.6,-.75,-.4,1.3),joint(1.5,-.7,-.7,-.4,1.3)],follow:[joint(-.25,-1.1,.25,1.3,.15),joint(-.25,-1.1,.25,1.3,.15)],delay:[0,.1],smear:true},
  wraith:{rest:joint(.08,-.18,.05,.35,.2),cocked:[joint(.95,1.75,-.35,.4,.9),joint(.65,.55,.1,.8,.1)],follow:[joint(.5,.12,.35,-.5,1.35),joint(.3,.2,.05,.8,.1)],delay:[0,0],smear:false},
};

/** Per-kind temperament: how it breathes, sways, walks and how much its cloth moves. */
const TEMPER:Record<CreatureKind,{cadence:number;bounce:number;crouch:number;lunge:number;windup:number;strike:number;headWindup:number;headStrike:number;sway:number;breath:number;cloth:number;holdEvery:[number,number]}>={
  goblin:{cadence:5.2,bounce:.05,crouch:.075,lunge:.28,windup:.075,strike:.09,headWindup:.07,headStrike:.03,sway:.035,breath:1.6,cloth:.025,holdEvery:[5,10]},
  root:{cadence:1.15,bounce:.028,crouch:.035,lunge:.10,windup:.11,strike:.055,headWindup:.025,headStrike:.015,sway:.02,breath:.8,cloth:0,holdEvery:[6,12]},
  hollow:{cadence:1.3,bounce:.03,crouch:.03,lunge:.18,windup:.09,strike:.13,headWindup:.14,headStrike:.18,sway:.03,breath:.7,cloth:.27,holdEvery:[4,9]},
  wraith:{cadence:1.9,bounce:.07,crouch:.02,lunge:.045,windup:.04,strike:.025,headWindup:.035,headStrike:.02,sway:.04,breath:1.1,cloth:.13,holdEvery:[6,11]},
};

/** A damped spring: everything in the rig arrives late and settles, never snaps. */
class Spring {
  value=0; velocity=0;
  constructor(public stiffness=60,public damping=12){}
  step(target:number,dt:number,stiffness=this.stiffness,damping=this.damping):number{
    this.velocity+=((target-this.value)*stiffness-this.velocity*damping)*dt;
    this.value+=this.velocity*dt;
    return this.value;
  }
}

type Overlay=THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
/**
 * One eye: a halo bleeding light into the socket, a glowing iris, a dark pupil that tracks and
 * dilates, and a fixed wet glint. Each eye follows the gaze at its own rate, so the pair drifts
 * very slightly out of step before settling: the stare never looks quite mechanical.
 */
interface Eye { root:THREE.Object3D; halo:Overlay; core:Overlay; pupil:Overlay; glint:Overlay; home:THREE.Vector3; width:number; look:THREE.Vector2; lag:number; scale:number }
interface ArmRig {
  side:number; shoulder:THREE.Bone; elbow:THREE.Bone; wrist:THREE.Bone; fingers:THREE.Bone[]; splay:number[];
  palm:THREE.Object3D; power:Overlay; smear:Overlay|null;
  springs:Record<keyof Joint,Spring>; fingerSprings:Spring[];
  phase:number; twitchAt:number; twitch:number; twitchDir:number; twitchFinger:number;
}
interface LegRig { side:number; thigh:THREE.Bone; knee:THREE.Bone; ankle:THREE.Bone; lift:Spring; restY:number }
type Weights=Array<[THREE.Bone,number]>;

/**
 * A spirit as a painted 2D bone rig. Each painting (head, robe, arms, legs) is one soft-edged sheet
 * skinned to a shared skeleton, so a bending elbow or a swaying spine bends the paint itself:
 * there are no cut pieces to swing. Robes and hanging moss also flow in the vertex shader, and the
 * whole figure is faded by distance and swallowed by mist at its feet.
 */
export class Creature {
  /** Sorted as one unit against the other spirits (Encounter sets its renderOrder by depth). */
  readonly group=new THREE.Group();
  /** Moves the whole figure: bob, lunge, recoil. Arrows that stick are parented here. */
  readonly body=new THREE.Object3D();
  private readonly art=new ArtResources();
  private readonly artwork=new CreatureArtwork();
  private readonly bones:THREE.Bone[]=[];
  private readonly meshes:THREE.SkinnedMesh[]=[];
  private readonly hips:THREE.Bone;
  private readonly spine:THREE.Bone;
  private readonly chest:THREE.Bone;
  private readonly neck:THREE.Bone;
  private readonly head:THREE.Bone;
  private readonly neckRestY:number;
  private readonly extras:{bone:THREE.Bone;spring:Spring;kind:'ear'|'crown'}[]=[];
  private readonly armRigs:ArmRig[]=[];
  private readonly legRigs:LegRig[]=[];
  private readonly lantern=new THREE.Object3D();
  private readonly lanternSwing=new Spring(26,3.2);
  private readonly eyes:Eye[]=[];
  private readonly mouth:Overlay;
  private readonly footing:Overlay;
  private readonly glow:THREE.Color;
  private readonly eyeColor=new THREE.Color();
  private readonly paint:PaintUniforms;
  private get dissolve(){return this.paint.dissolve;}
  private get edge(){return this.paint.edge;}
  private get flow(){return this.paint.flow;}
  private get ground(){return this.paint.ground;}
  private readonly seed:number;
  private readonly random:()=>number;
  private readonly spineSprings={hips:new Spring(40,10),spine:new Spring(30,8),chest:new Spring(22,6),neck:new Spring(26,8),head:new Spring(34,9)};
  private readonly scratch=new THREE.Vector3();
  private readonly moved=new THREE.Vector3();
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
  private dilation=.4;
  private nextRoll=12;
  private rollAt=-10;
  private nextTremor=7;
  private tremorAt=-10;
  private awakenAge=Infinity;
  private gaitClock=0;
  private stride=0;
  private stutterUntil=-1;
  private nextStutter=5;
  /** How alive the figure is right now: 1 moving freely, near 0 while it holds utterly still. */
  private life=1;
  private holdUntil=-1;
  private nextHold=6;
  private flowClock=0;
  private breathClock=0;
  private lastRoll=0;
  private placed=false;
  private readonly lastPosition=new THREE.Vector3();
  private readonly drift=new THREE.Vector2();
  private static count=0;

  constructor(readonly kind:CreatureKind){
    this.seed=(Creature.count++)*7919+kind.length*131;
    this.random=seeded(this.seed);
    const r=this.random;
    this.nextBlink=1+r()*4;this.nextTilt=1+r()*4;this.nextJerk=4+r()*8;this.nextRoll=9+r()*14;this.nextTremor=4+r()*8;this.nextStutter=3+r()*5;
    this.gaitClock=r()*6.28;this.breathClock=r()*10;this.flowClock=r()*10;
    this.nextHold=TEMPER[kind].holdEvery[0]*.5+r()*TEMPER[kind].holdEvery[1];
    const s=SIZES[kind],face=FACES[kind];
    this.glow=new THREE.Color(face.glow);
    this.paint={dissolve:{value:0},edge:{value:this.glow.clone()},flow:{value:new THREE.Vector4()},ground:{value:0},mist:{value:.75}};
    this.group.name=CREATURE_NAMES[kind];this.group.renderOrder=-100;
    this.group.add(this.body);
    this.flow.value.y=TEMPER[kind].cloth;

    // ── Skeleton, in creature space. ──
    const hipsY=s.leg+s.body*.05,spineY=s.leg+s.body*.4,chestY=s.leg+s.body*.7,headY=s.height-s.head*.48;
    this.hips=this.bone('hips',null,0,hipsY);
    this.spine=this.bone('spine',this.hips,0,spineY);
    this.chest=this.bone('chest',this.spine,0,chestY);
    this.neck=this.bone('neck',this.chest,0,chestY+(headY-chestY)*.25);
    this.neckRestY=this.neck.position.y;
    this.head=this.bone('head',this.neck,0,headY);

    // ── Paint, skinned to it. ──
    const robed=kind==='hollow'||kind==='wraith';
    const headWidth=s.width*1.2;
    const torso=robed?this.robeRect():{w:s.width,h:s.body,cx:0,cy:s.leg+s.body*.4};
    const torsoWeights=(_x:number,y:number):Weights=>this.chain(y,[[this.chest,chestY],[this.spine,spineY],[this.hips,hipsY]]);
    if(kind==='hollow'){
      const cape=this.robeRect(1.2);
      this.addPart('cape',cape.w,cape.h,cape.cx,cape.cy,-.07,0,torsoWeights,{flow:1.25,cols:10,rows:22});
    }
    this.addPart('body',torso.w,torso.h,torso.cx,torso.cy,0,3,torsoWeights,{flow:robed?1:kind==='goblin'?.6:0,cols:robed?10:6,rows:robed?22:10});
    for(const side of [-1,1]){
      if(LEGS[kind])this.legRigs.push(this.buildLeg(side));
      this.armRigs.push(this.buildArm(side));
    }
    this.addPart('head',headWidth,s.head,0,headY,.08,5,(x,y)=>this.headWeights(x,y,headWidth),{cols:8,rows:8});
    if(kind==='hollow'){
      // Dead moss hanging from the antlers, left to drift.
      for(const side of [-1,1])this.addPart('strands',.62,1.24,side*.55,headY+(.5-130/512)*s.head-.62,.05,6,()=>[[this.head,1]],{flow:2,cols:4,rows:16,mirror:side});
    }
    // One skeleton for every sheet, bound in the rest pose.
    this.group.updateMatrixWorld(true);
    const skeleton=new THREE.Skeleton(this.bones);
    for(const mesh of this.meshes)mesh.bind(skeleton,mesh.matrixWorld);

    // ── Expression overlays, placed exactly over the painted sockets and mouth. ──
    const at=(px:number,py:number,z:number)=>new THREE.Vector3((px/512-0.5)*headWidth,(0.5-py/512)*s.head,z);
    const eyeWidth=face.eyeSize/512*headWidth;
    for(const [px,py] of face.eyes){
      const root=new THREE.Object3D();const home=at(px,py,0.1);root.position.copy(home);
      const scale=this.eyes.length===0?1:.9+this.random()*.06;
      const halo=this.overlay(glowTexture(),eyeWidth*3,eyeWidth*1.9,THREE.AdditiveBlending);halo.renderOrder=9;
      const core=this.overlay(this.artwork.iris(),eyeWidth*1.1,eyeWidth*0.66,THREE.AdditiveBlending);core.position.z=0.004;core.renderOrder=10;
      const pupil=this.overlay(this.artwork.pupil(face.pupil),eyeWidth*.62,eyeWidth*.62,THREE.NormalBlending);pupil.position.z=0.006;pupil.renderOrder=11;
      pupil.material.color.set('#010303');pupil.material.opacity=.92;
      const glint=this.overlay(glowTexture(),eyeWidth*.18,eyeWidth*.14,THREE.AdditiveBlending);glint.position.set(-eyeWidth*.16,eyeWidth*.1,0.008);glint.renderOrder=12;
      for(const mesh of [halo,core,pupil,glint])mesh.userData.eye=true;
      root.scale.setScalar(scale);root.add(halo,core,pupil,glint);this.head.add(root);
      this.eyes.push({root,halo,core,pupil,glint,home,width:eyeWidth,look:new THREE.Vector2(),lag:this.eyes.length===0?22:9+this.random()*5,scale});
    }
    this.mouth=this.overlay(this.artwork.mouth(kind),face.mouthSize[0]/512*headWidth,face.mouthSize[1]/512*s.head,THREE.NormalBlending);
    this.mouth.material.color.set('#ffffff');this.mouth.renderOrder=8;
    this.mouth.position.copy(at(face.mouth[0],face.mouth[1],0.095));
    this.mouth.scale.y=0.08;
    this.head.add(this.mouth);
    if(kind==='wraith'){
      // The lantern hangs from the right hand by its ring and swings on its own.
      const lantern=new THREE.Mesh(this.art.geometry(new THREE.PlaneGeometry(.58,.66)),this.skin(this.artwork.part(kind,'lantern'),0));
      lantern.position.y=-.3;lantern.renderOrder=7;
      this.lantern.add(lantern);const hand=this.armRigs[1];this.lantern.position.copy(hand.palm.position).add(new THREE.Vector3(0,-.02,.03));hand.wrist.add(this.lantern);
    }
    // Where it stands: a soft pool of shadow and mist instead of a hard contact shadow.
    this.footing=this.overlay(this.artwork.footing(),s.width*1.5,s.width*.6,THREE.NormalBlending);
    this.footing.material.color.set('#0b1312');this.footing.material.opacity=.5;
    this.footing.rotation.x=-Math.PI/2;this.footing.position.y=.03;this.footing.renderOrder=-1;this.group.add(this.footing);
  }

  /* ─────────────────────────────── construction ─────────────────────────────── */

  /** A bone at (x, y, z) in creature space, parented and positioned relative to `parent`. */
  private bone(name:string,parent:THREE.Bone|null,x:number,y:number,z=0):THREE.Bone {
    const bone=new THREE.Bone();bone.name=name;
    const at=new THREE.Vector3(x,y,z);
    if(parent){bone.position.copy(at).sub(parent.userData.at as THREE.Vector3);parent.add(bone);}
    else{bone.position.copy(at);this.body.add(bone);}
    bone.userData.at=at;
    this.bones.push(bone);
    return bone;
  }

  /** The robe sheet: from the collar to the ground (wider, for the cape behind it). */
  private robeRect(widen=1):{w:number;h:number;cx:number;cy:number}{
    const s=SIZES[this.kind],[sw,sh]=sheetSize(this.kind,'body');
    const top=this.kind==='hollow'?s.leg+s.body*.72:s.leg+s.body*.9;
    const w=(this.kind==='hollow'?2.5:2.05)*widen,h=(this.kind==='hollow'?2.5:2.05)*sh/sw*(widen>1?1.02:1);
    return {w,h,cx:0,cy:top-h/2};
  }

  /** Linear blend down a chain of bones ordered top to bottom by height. */
  private chain(y:number,joints:[THREE.Bone,number][]):Weights {
    if(y>=joints[0][1])return [[joints[0][0],1]];
    for(let i=0;i<joints.length-1;i++){
      const [a,ya]=joints[i],[b,yb]=joints[i+1];
      if(y>=yb){const t=(y-yb)/(ya-yb);return [[a,t],[b,1-t]];}
    }
    return [[joints[joints.length-1][0],1]];
  }

  /** Heads are rigid, except the goblin's ears (which twitch) and the Rootbound's crown (which creaks). */
  private headWeights(x:number,y:number,width:number):Weights {
    const s=SIZES[this.kind],headY=s.height-s.head*.48;
    const u=x/width+.5,v=.5-(y-headY)/s.head;
    if(this.kind==='goblin'&&(u<.3||u>.7)){
      if(!this.extras.length)for(const side of [-1,1])this.extras.push({bone:this.bone(side<0?'earL':'earR',this.head,side*width*.2,headY+s.head*.12),spring:new Spring(70,7),kind:'ear'});
      const ear=this.extras[u<.5?0:1].bone,t=THREE.MathUtils.smoothstep(Math.abs(u-.5),.2,.36);
      return [[this.head,1-t],[ear,t]];
    }
    if(this.kind==='root'&&v<.34){
      if(!this.extras.length)this.extras.push({bone:this.bone('crown',this.head,0,headY+s.head*.2),spring:new Spring(18,3),kind:'crown'});
      const t=THREE.MathUtils.smoothstep(.34-v,0,.2);
      return [[this.head,1-t],[this.extras[0].bone,t]];
    }
    return [[this.head,1]];
  }

  /**
   * One painted sheet as a skinned grid. `weights(x, y)` (creature space) names the bones that
   * carry each vertex; `flow` lets the shader ripple it like cloth (1) or hanging strands (2).
   */
  private addPart(part:CreaturePart,width:number,height:number,cx:number,cy:number,z:number,order:number,weights:(x:number,y:number)=>Weights,options:{flow?:number;cols?:number;rows?:number;mirror?:number}={}):THREE.SkinnedMesh {
    const geometry=new THREE.PlaneGeometry(width,height,options.cols??6,options.rows??10);
    geometry.translate(cx,cy,z);
    if(options.mirror===-1){const p=geometry.getAttribute('position');for(let i=0;i<p.count;i++)p.setX(i,2*cx-p.getX(i));}
    const position=geometry.getAttribute('position');
    const index=new Uint16Array(position.count*4),weight=new Float32Array(position.count*4);
    for(let i=0;i<position.count;i++){
      const list=weights(position.getX(i),position.getY(i)).filter(([,w])=>w>1e-3).sort((a,b)=>b[1]-a[1]).slice(0,4);
      if(!list.length)list.push([this.hips,1]);
      const total=list.reduce((sum,[,w])=>sum+w,0)||1;
      list.forEach(([bone,w],k)=>{index[i*4+k]=this.bones.indexOf(bone);weight[i*4+k]=w/total;});
    }
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(index,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weight,4));
    const mesh=new THREE.SkinnedMesh(this.art.geometry(geometry),this.skin(this.artwork.part(this.kind,part),options.flow??0));
    mesh.renderOrder=order;mesh.frustumCulled=false;mesh.name=part;
    this.body.add(mesh);this.meshes.push(mesh);
    return mesh;
  }

  /** Shoulder → elbow → wrist → fingers, all inside one continuous arm painting. */
  private buildArm(side:number):ArmRig {
    const s=SIZES[this.kind],shape=ARMS[this.kind],W=s.width*.5,H=s.body*1.05;
    const sx=side*s.width*.19,sy=s.leg+s.body*.7,top=sy+H*.07;
    const ax=(px:number)=>sx+side*(px/512-.5)*W,ay=(py:number)=>top-py/512*H;
    const [ex,ey]=shape.elbow,[wx,wy]=shape.wrist,k=shape.knuckle;
    const tag=side<0?'L':'R';
    const shoulder=this.bone(`shoulder${tag}`,this.chest,sx,sy);
    const elbow=this.bone(`elbow${tag}`,shoulder,ax(ex),ay(ey));
    const wrist=this.bone(`wrist${tag}`,elbow,ax(wx),ay(wy));
    const fingers=shape.fingers.map(([fx])=>this.bone('talon',wrist,ax(fx),ay(k)));
    const splay=shape.fingers.map(([,a])=>a);
    const spacing=Math.abs(ax(shape.fingers[1][0])-ax(shape.fingers[0][0]));
    const weights=(x:number,y:number):Weights=>{
      const py=(top-y)/H*512;
      if(py<60){const t=THREE.MathUtils.smoothstep(py,-10,60);return [[this.chest,(1-t)*.5],[shoulder,1-(1-t)*.5]];}
      const blend=(at:number,width:number,a:THREE.Bone,b:THREE.Bone):Weights=>{const t=THREE.MathUtils.smoothstep(py,at-width,at+width);return [[a,1-t],[b,t]];};
      if(py<ey+(wy-ey)*.5)return blend(ey,26,shoulder,elbow);
      if(py<wy+(k-wy)*.5)return blend(wy,22,elbow,wrist);
      // Below the knuckles: each talon belongs to the finger bones it lies nearest.
      const t=THREE.MathUtils.smoothstep(py,k-12,k+20);
      const near=fingers.map((b,f)=>[b,Math.max(0,1-Math.abs(x-ax(shape.fingers[f][0]))/spacing)] as [THREE.Bone,number]);
      let sum=near.reduce((a,[,w])=>a+w,0);
      if(sum<1e-3){
        // Beyond the outermost talon: it belongs to the nearest finger.
        const nearest=fingers.reduce((best,_b,f)=>Math.abs(x-ax(shape.fingers[f][0]))<Math.abs(x-ax(shape.fingers[best][0]))?f:best,0);
        near[nearest][1]=1;sum=1;
      }
      return [[wrist,1-t],...near.map(([b,w])=>[b,w/sum*t] as [THREE.Bone,number])];
    };
    // The far arm sits behind the body; the near arm in front of it.
    this.addPart('arm',W,H,sx,top-H/2,side<0?-.03:.05,side<0?1:6,weights,{cols:6,rows:24,mirror:side});
    const palm=new THREE.Object3D();
    palm.position.set(ax(shape.palm),ay((wy+k)/2),.06).sub(wrist.userData.at as THREE.Vector3);wrist.add(palm);
    const free=this.kind==='wraith'&&side<0;
    const power=this.overlay(glowTexture(),W*(free?1.1:.7),W*(free?1.1:.7),THREE.AdditiveBlending);
    power.position.copy(palm.position);power.renderOrder=13;power.visible=false;wrist.add(power);
    let smear:Overlay|null=null;
    if(ATTACKS[this.kind].smear){
      const reach=sy-ay(k+80);
      smear=this.overlay(this.artwork.smear(),reach*2.1,reach*2.1,THREE.AdditiveBlending);
      smear.position.set(sx,sy,.1).sub(this.chest.userData.at as THREE.Vector3);smear.renderOrder=14;smear.visible=false;smear.scale.x=side;this.chest.add(smear);
    }
    const rest=ATTACKS[this.kind].rest;
    const springs={shoulder:new Spring(28,7),elbow:new Spring(24,4.5),wrist:new Spring(30,5),curl:new Spring(30,6),spread:new Spring(26,6)};
    for(const key of Object.keys(springs) as (keyof Joint)[])springs[key].value=rest[key];
    return {side,shoulder,elbow,wrist,fingers,splay,palm,power,smear,springs,fingerSprings:fingers.map(()=>{const f=new Spring(40,6);f.value=rest.curl;return f;}),
      phase:this.random()*6.28,twitchAt:1+this.random()*3,twitch:-10,twitchDir:1,twitchFinger:0};
  }

  private buildLeg(side:number):LegRig {
    const s=SIZES[this.kind],shape=LEGS[this.kind]!,W=s.width*.42,H=s.leg*1.18;
    const x=side*s.width*.14,top=s.leg*1.11+.09;
    const ly=(f:number)=>top-f*H;
    const tag=side<0?'L':'R';
    const thigh=this.bone(`thigh${tag}`,this.hips,x,ly(shape.hip));
    const knee=this.bone(`knee${tag}`,thigh,x,ly(shape.knee));
    const ankle=this.bone(`ankle${tag}`,knee,x,ly(shape.ankle));
    const weights=(_x:number,y:number):Weights=>{
      const f=(top-y)/H;
      if(f<.1){const t=THREE.MathUtils.smoothstep(f,0,.1);return [[this.hips,(1-t)*.6],[thigh,1-(1-t)*.6]];}
      if(f<(shape.knee+shape.ankle)/2){const t=THREE.MathUtils.smoothstep(f,shape.knee-.08,shape.knee+.08);return [[thigh,1-t],[knee,t]];}
      const t=THREE.MathUtils.smoothstep(f,shape.ankle-.06,shape.ankle+.06);return [[knee,1-t],[ankle,t]];
    };
    this.addPart('leg',W,H,x,top-H/2,-.04,2,weights,{cols:4,rows:16,mirror:side});
    return {side,thigh,knee,ankle,lift:new Spring(40,9),restY:thigh.position.y};
  }

  private overlay(map:THREE.Texture,width:number,height:number,blending:THREE.Blending):Overlay {
    const material=this.art.material(new THREE.MeshBasicMaterial({map,color:this.glow,transparent:true,depthWrite:false,blending,toneMapped:false,side:THREE.DoubleSide,fog:true}));
    const mesh=new THREE.Mesh(this.art.geometry(new THREE.PlaneGeometry(width,height)),material);
    mesh.userData.arcaneOverlay=true;mesh.renderOrder=2;
    return mesh;
  }

  /** The shared painted-skin material (paintMaterial.ts), owned by this spirit's resources. */
  private skin(map:THREE.Texture,flowMode:number):THREE.MeshBasicMaterial {
    return this.art.material(paintedMaterial(map,this.paint,flowMode));
  }

  /* ─────────────────────────────── public ─────────────────────────────── */

  hit():void{
    this.hitTime=0;
    // The blow travels up the body: a shove at the hips, a whip through the spine and arms.
    const kick=(this.random()<.5?-1:1)*2.2;
    this.spineSprings.hips.velocity+=kick*.5;this.spineSprings.chest.velocity-=kick;this.spineSprings.head.velocity+=kick*1.4;
    for(const rig of this.armRigs){rig.springs.elbow.velocity+=kick*2*rig.side;rig.springs.shoulder.velocity+=kick*rig.side;}
    this.life=1;this.holdUntil=-1;
  }
  /** 0 when solid, 1 when fully dissolved (dead or not yet risen). */
  get fade():number{return this.group.visible?this.dissolve.value:1;}
  /** 0 while the spirit has stopped dead mid-stride, 1 while it is walking; scales its ground speed. */
  get gait():number{return this.stride;}

  /** Where a spirit's power leaves its body: the wraith's free palm, otherwise the leading hand. */
  castPoint(out:THREE.Vector3):THREE.Vector3 {
    this.group.updateWorldMatrix(true,true);
    return this.armRigs[0].palm.getWorldPosition(out);
  }

  /** Restart presentation state and rise out of the forest floor when the wood awakens. */
  awaken():void{this.hitTime=1;this.pose='idle';this.awakenAge=0;this.dissolve.value=1;this.edge.value.copy(this.glow);this.life=1;this.holdUntil=-1;this.placed=false;}

  /* ─────────────────────────────── animation ─────────────────────────────── */

  animate(time:number,pose:CreaturePose,progress:number,dt:number,reducedMotion=false):void {
    this.hitTime+=dt;
    const recoil=this.hitTime<.5?Math.sin(this.hitTime/.5*Math.PI)*Math.exp(-this.hitTime*4):0;
    const frozenHold=pose==='frozen'&&this.pose==='frozen';
    if(pose==='frozen'&&!frozenHold)this.freezeTime=time;
    this.pose=pose;
    this.group.getWorldPosition(this.scratch);this.ground.value=this.scratch.y;
    this.updateLife(time,pose,dt,reducedMotion);
    this.updateFace(time,pose,progress,dt,reducedMotion);
    this.updateDissolve(pose,progress,dt);
    // Ice holds the limbs (and the cloth) exactly where they were.
    if(frozenHold)return;
    if(pose==='frozen')time=this.freezeTime;
    const s=SIZES[this.kind],temper=TEMPER[this.kind],walking=pose==='walk',motion=reducedMotion?0:1,life=this.life;
    this.flowClock+=dt*(.25+.75*life)*motion;
    this.breathClock+=dt*life*motion;

    // The creep: a limping, uneven step (one leg drags and the body dips onto it), and every so
    // often the spirit stops dead mid-stride, holds utterly still, then carries on.
    if(walking&&!reducedMotion&&time>this.nextStutter){
      this.stutterUntil=time+.4+this.random()*.5;this.nextStutter=time+4+this.random()*6;
      this.jerk=(this.random()<.5?-1:1)*.11;
    }
    const holding=walking&&time<this.stutterUntil;
    if(walking&&!holding)this.gaitClock+=dt*temper.cadence;
    this.stride+=((walking&&!holding?1:0)-this.stride)*(1-Math.exp(-dt*(holding?30:10)));
    const phase=this.gaitClock+.42*Math.sin(this.gaitClock);
    const gait=walking?Math.sin(phase)*this.stride:0;
    const windupK=pose==='windup'?windupCurve(progress):0;
    const windup=pose==='windup'?Math.sin(Math.min(1,progress/.55)*Math.PI/2):0;
    const strike=pose==='strike'?Math.sin(progress*Math.PI):0,dead=pose==='dead'?THREE.MathUtils.smoothstep(progress,0,1):0;
    const drag=Math.max(0,-gait);
    const rise=this.awakenAge<1.4?(1-THREE.MathUtils.smoothstep(this.awakenAge,0,1.4))*-.35:0;
    const breathe=Math.sin(this.breathClock*temper.breath+this.seed);
    const floatBob=this.kind==='wraith'?.16+Math.sin(this.breathClock*1.5)*temper.bounce:0;
    const bounce=Math.abs(gait)*temper.bounce*(gait<0?1.45:1)*(this.kind==='hollow'?.4:1);
    this.body.position.y=floatBob+bounce+breathe*.01*motion-dead*s.height*.05+rise;
    this.body.position.x=-windup*temper.crouch+strike*temper.lunge+recoil*.12;
    this.body.rotation.x=windup*-temper.windup+strike*temper.strike;
    // Tension at the top of the wind-up: the whole figure trembles very slightly.
    const tremble=pose==='windup'&&progress>.85?Math.sin(time*63)*.006*motion:0;

    // Spine: a slow sway rises from the hips and arrives late at each bone above; the head holds
    // level on you while the body lurches beneath it.
    if(!reducedMotion){
      if(time>this.nextTilt){this.tiltTarget=(this.random()-.5)*(this.kind==='hollow'?.34:.24);this.nextTilt=time+3.5+this.random()*4;}
      if(time>this.nextJerk){this.jerk=(this.random()<.5?-1:1)*.09;this.nextJerk=time+6+this.random()*9;}
    }
    this.tilt+=(this.tiltTarget-this.tilt)*(1-Math.exp(-dt*1.1*Math.max(.15,life)));
    this.jerk*=Math.exp(-dt*11);
    const sway=(t:number)=>Math.sin(this.breathClock*.8+this.seed-t)*temper.sway*motion;
    const roll=gait*(this.kind==='goblin'?.03:.02)-drag*.025*motion;
    const lean=-windupK*temper.windup+strike*temper.strike+dead*.18+recoil*.13;
    const ss=this.spineSprings;
    this.hips.rotation.z=ss.hips.step(sway(0)+roll+lean*.5+tremble,dt);
    this.spine.rotation.z=ss.spine.step(sway(.6)*.9+lean*.3,dt);
    this.chest.rotation.z=ss.chest.step(sway(1.2)*.8+lean*.2-roll*.4,dt);
    const below=this.hips.rotation.z+this.spine.rotation.z+this.chest.rotation.z;
    this.neck.rotation.z=ss.neck.step(-below*.7*motion+(this.tilt+this.jerk)*(1-windup*.6)*motion*.6,dt);
    this.head.rotation.z=ss.head.step((this.tilt+this.jerk)*.4*motion-windupK*temper.headWindup+strike*temper.headStrike+Math.sin(this.breathClock*.5)*.015*motion,dt);
    this.head.rotation.x=windup*.06-strike*.04;
    this.neck.position.y=this.neckRestY-bounce*.5+breathe*.008*motion;
    // Breathing swells the chest a little; robes rise and settle with it.
    this.chest.scale.y=1+breathe*.012*motion*life;
    this.extras.forEach((extra,i)=>{
      if(extra.kind==='ear'&&!reducedMotion&&this.random()<dt*.35*life)extra.spring.velocity+=(this.random()-.5)*7;
      extra.bone.rotation.z=extra.spring.step(extra.kind==='ear'?(i===0?.06:-.06)*breathe*motion:Math.sin(this.flowClock*.6+i)*.05*motion,dt);
    });

    // Cloth: slow waves, a lag against the way the body moves, a kick at the hem with each step.
    this.group.getWorldPosition(this.scratch);
    if(!this.placed||dt<=0){this.lastPosition.copy(this.scratch);this.placed=true;}
    this.moved.subVectors(this.scratch,this.lastPosition).divideScalar(Math.max(dt,1e-3));
    this.lastPosition.copy(this.scratch);
    if(this.moved.lengthSq()>400)this.moved.set(0,0,0);
    const turn=dt>0?(this.hips.rotation.z-this.lastRoll)/dt:0;this.lastRoll=this.hips.rotation.z;
    this.drift.x+=((-turn*.25+gait*.05*motion)-this.drift.x)*(1-Math.exp(-dt*2));
    this.drift.y+=((-this.moved.length()*.08*motion)-this.drift.y)*(1-Math.exp(-dt*1.5));
    this.flow.value.set(this.flowClock,temper.cloth*(1+this.stride*.6+strike*.8)*motion,this.drift.x,this.drift.y);

    for(const leg of this.legRigs){
      // Seen from the front, a step is a lift: the thigh hikes, the shin swings toward you and
      // foreshortens. The left leg drags; it barely lifts and its knee buckles outward instead.
      const lift=leg.lift.step(Math.max(0,gait*leg.side)*(leg.side<0?.45:1),dt);
      leg.thigh.position.y=leg.restY+lift*temper.bounce*1.6;
      leg.thigh.rotation.z=leg.side*(leg.side<0?drag*.08:lift*.06)*motion;
      leg.knee.rotation.x=-lift*.9*motion;leg.knee.rotation.z=-leg.side*(leg.side<0?drag*.12:0)*motion;
      leg.ankle.rotation.x=lift*.5*motion;
    }
    for(let i=0;i<this.armRigs.length;i++)this.animateArm(i,time,pose,progress,dt,reducedMotion,gait,phase,windupK,recoil);
    this.group.scale.set(1,1-dead*.1,1);
    if(this.hitTime<.18){
      // EnemyCombat swaps in per-instance clones, so flash whatever material each part wears now.
      this.group.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||object.userData.arcaneOverlay)return;
        for(const material of Array.isArray(object.material)?object.material:[object.material]){
          if(material instanceof THREE.MeshBasicMaterial&&material.map)material.color.set('#e8dcc4');
        }
      });
    }
  }

  /**
   * Stillness. Every few seconds an idle or prowling spirit lets everything run down — breath,
   * sway, even its cloth slows — and simply watches you. Then something small breaks it: a head
   * jerk, a finger, a shoulder.
   */
  private updateLife(time:number,pose:CreaturePose,dt:number,reducedMotion:boolean):void {
    const temper=TEMPER[this.kind],calm=pose==='idle'||pose==='walk'||pose==='recover';
    if(!reducedMotion&&calm&&time>this.nextHold&&this.holdUntil<0){
      this.holdUntil=time+1+this.random()*1.6;
      this.nextHold=time+temper.holdEvery[0]+this.random()*(temper.holdEvery[1]-temper.holdEvery[0]);
    }
    if(this.holdUntil>0&&(time>this.holdUntil||!calm)){
      this.holdUntil=-1;
      // It breaks the stillness with one sudden, small movement.
      const pick=this.random();
      if(pick<.4)this.spineSprings.head.velocity+=(this.random()<.5?-1:1)*3.5;
      else if(pick<.7)this.armRigs[Math.floor(this.random()*this.armRigs.length)].twitchAt=0;
      else for(const rig of this.armRigs)rig.springs.shoulder.velocity+=rig.side*1.6;
    }
    // Wind-ups hold too: drawn back and nearly still before the blow.
    const goal=this.holdUntil>0?.04:pose==='windup'?.35:1;
    this.life+=(goal-this.life)*(1-Math.exp(-dt*(goal<this.life?2.6:1.4)));
    if(this.holdUntil>0&&pose==='walk')this.stutterUntil=Math.max(this.stutterUntil,this.holdUntil);
  }

  /**
   * One arm, joint by joint. Targets come from the spirit's attack choreography; springs make each
   * joint arrive a beat after the one above it, overshoot a little, and settle. Fingers curl and
   * uncurl in a slow ripple and twitch one at a time. Power gathers in the palm through the wind-up,
   * and a raking swing leaves a smear of light.
   */
  private animateArm(i:number,time:number,pose:CreaturePose,progress:number,dt:number,reducedMotion:boolean,gait:number,phase:number,windup:number,recoil:number):void {
    const rig=this.armRigs[i],attack=ATTACKS[this.kind],side=rig.side,motion=reducedMotion?0:1,life=this.life;
    const rest=attack.rest,cocked=attack.cocked[i],follow=attack.follow[i];
    let goal:Joint;let stiffness=1;
    if(pose==='windup'){goal=mix(rest,cocked,windup);stiffness=progress>.85?1.6:.9;}
    else if(pose==='strike'){const swung=progress>=attack.delay[i];goal=swung?follow:cocked;stiffness=swung?7:2;}
    else if(pose==='stagger'){goal=joint(.55,.45,-.45,-.35,1.25);stiffness=2.5;}
    else if(pose==='dead'){goal=joint(.02,-.05,-.1,.75,.05);stiffness=.35;}
    else{goal={...rest};stiffness=pose==='recover'?.45:1;}
    // Walking: arms swing out of step with the legs; the wraith and the Hollow drift rather than stride.
    const swing=this.kind==='wraith'||this.kind==='hollow'?Math.sin(phase+side)*.04:gait*side*(this.kind==='goblin'?.16:.09);
    const sway=(Math.sin(this.breathClock*.73+rig.phase)*.04+Math.sin(this.breathClock*.29+rig.phase*2)*.025)*motion;
    goal.shoulder+=swing+sway+recoil*.3;
    goal.curl+=Math.sin(this.breathClock*.7-rig.phase)*.12*motion;
    // Stiffer springs for a strike, softer for a slow recovery; damping keeps the same character.
    const sp=rig.springs,damp=Math.sqrt(stiffness);
    const step=(spring:Spring,target:number)=>spring.step(target,dt,spring.stiffness*stiffness,spring.damping*damp);
    const shoulder=step(sp.shoulder,goal.shoulder),elbow=step(sp.elbow,goal.elbow),wrist=step(sp.wrist,goal.wrist);
    const curl=step(sp.curl,goal.curl),spread=step(sp.spread,goal.spread);
    rig.shoulder.rotation.z=side*shoulder;
    rig.elbow.rotation.z=side*elbow;
    rig.wrist.rotation.z=side*wrist;
    // Reach: the hand tips toward its prey as the attack builds.
    rig.wrist.rotation.x=-(windup*.25+(pose==='strike'?.35:0))*motion;
    if(!reducedMotion&&time>rig.twitchAt){rig.twitch=time;rig.twitchDir=this.random()<.5?-1:1;rig.twitchFinger=Math.floor(this.random()*rig.fingers.length);rig.twitchAt=time+1.6+this.random()*4;}
    const twitch=reducedMotion||time<rig.twitch?0:Math.exp(-(time-rig.twitch)*9);
    rig.fingers.forEach((finger,f)=>{
      // A slow ripple runs across the fingers, one after another.
      const ripple=Math.sin(this.breathClock*1.1+rig.phase-f*.7)*.1*motion*life;
      const jolt=f===rig.twitchFinger?twitch*.4*rig.twitchDir:0;
      finger.rotation.z=side*(rig.splay[f]*(.45+spread*.75)+jolt);
      // Curling hooks each talon toward the player (it foreshortens); splaying bends it back.
      finger.rotation.x=-rig.fingerSprings[f].step((curl+ripple+Math.abs(jolt)*.6)*(f===0?.85:1),dt,40*stiffness,6*damp);
    });
    const strikeFlare=pose==='strike'?Math.max(0,1-progress*1.6):0;
    const charge=pose==='windup'?THREE.MathUtils.smoothstep(progress,.1,1):0;
    const free=this.kind==='wraith'&&i===0,lanternArm=this.kind==='wraith'&&i===1;
    const level=lanternArm?0:(charge*(free?1.2:.7)+strikeFlare*(free?.4:.9))*(pose==='dead'?0:1);
    rig.power.visible=level>.01;
    if(rig.power.visible){
      const flicker=1+(reducedMotion?0:Math.sin(time*31+rig.phase)*.12+Math.sin(time*17)*.08);
      rig.power.material.color.copy(free?EMBER:this.glow).lerp(ANGER,free?.15:charge*.5).multiplyScalar(level*flicker);
      rig.power.scale.setScalar(.55+charge*.6+strikeFlare*.5);
    }
    if(rig.smear){
      const k=pose==='strike'&&progress>=attack.delay[i]?Math.max(0,1-(progress-attack.delay[i])/.55):0;
      rig.smear.visible=k>.01;
      if(rig.smear.visible){rig.smear.rotation.z=side*(shoulder+.55);rig.smear.material.color.copy(this.glow).lerp(ANGER,.4).multiplyScalar(k*.5);}
    }
    if(lanternArm){
      // The lantern hangs plumb from the hand and swings a little behind the arm.
      this.lantern.rotation.z=this.lanternSwing.step(-(shoulder+elbow+wrist)*side-this.hips.rotation.z-this.spine.rotation.z-this.chest.rotation.z,dt)+(reducedMotion?0:Math.sin(this.breathClock*1.3)*.08);
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
    // Holding still, the stare brightens very slightly.
    intensity*=1+(1-this.life)*.25;
    if(pose==='frozen'){this.eyeColor.copy(ICE);intensity=.35;}
    if(pose==='stagger'||this.hitTime<.35)intensity*=Math.random()<.45?.15:1.25;
    if(pose==='dead')intensity*=Math.max(0,1-progress*1.6);
    if(this.awakenAge<1.4)intensity*=THREE.MathUtils.smoothstep(this.awakenAge,.6,1.4);
    // Blinks (the Hollow never blinks: its eyes gutter out instead) and darting glances.
    if(!reducedMotion&&time>this.nextBlink&&pose!=='frozen'&&pose!=='dead'&&this.life>.5){
      this.blinkAt=time;this.doubleBlink=this.random()<.25;this.nextBlink=time+2.4+this.random()*4.5;
    }
    const since=time-this.blinkAt;
    const lid=(t:number)=>t>=0&&t<.16?Math.sin(t/.16*Math.PI):0;
    const closed=Math.max(lid(since),this.doubleBlink?lid(since-.24):0);
    let openY=face.blinks?1-closed*.94:1-closed*.25;
    if(!face.blinks)intensity*=1-closed*.8;
    openY*=1-windup*.38;
    if(!reducedMotion&&time>this.nextGlance&&this.life>.5){
      this.gazeTarget.set((this.random()-.5)*.06,(this.random()-.5)*.025);
      this.nextGlance=time+.7+this.random()*2.2;
    }
    if(windup>0||this.life<.5)this.gazeTarget.set(0,0);
    this.gaze.lerp(this.gazeTarget,1-Math.exp(-dt*22));
    const calm=pose==='idle'||pose==='walk';
    if(!reducedMotion&&calm&&time>this.nextRoll&&this.life>.5){this.rollAt=time;this.nextRoll=time+14+this.random()*16;}
    const rollT=time-this.rollAt,roll=rollT>=0&&rollT<.9?Math.sin(Math.min(1,rollT/.9)*Math.PI)**.6:0;
    if(!reducedMotion&&time>this.nextTremor){this.tremorAt=time;this.nextTremor=time+5+this.random()*9;}
    const tremor=!reducedMotion&&time-this.tremorAt<.35?1-(time-this.tremorAt)/.35:0;
    // Pupils: narrow and watchful at rest, blown wide as it fixes on you to strike, a pinprick when hurt.
    const hurt=pose==='stagger'||this.hitTime<.4;
    const dilateGoal=pose==='dead'?1:hurt?.08:pose==='frozen'?this.dilation:strike?.95:windup>0?.35+windup*.65:.32+(1-this.life)*.3+(reducedMotion?0:Math.sin(time*.37+this.seed)*.08);
    this.dilation+=(dilateGoal-this.dilation)*(1-Math.exp(-dt*(hurt?20:pose==='windup'?5:1.5)));
    const shape=face.pupil,d=this.dilation;
    const pupilX=shape==='slit'?.22+d*.78:shape==='bar'?1:shape==='pin'?.3+d*.8:.55+d*.5;
    const pupilY=shape==='slit'?1:shape==='bar'?.32+d*.68:pupilX;
    const headWidth=SIZES[this.kind].width*1.2;
    this.eyes.forEach((eye,index)=>{
      eye.look.lerp(this.gaze,1-Math.exp(-dt*eye.lag));
      const jitter=index===1&&tremor>0?Math.sin(time*90)*tremor*.04:0;
      const lx=(eye.look.x+jitter)*headWidth*.35/eye.width,ly=eye.look.y*headWidth*.35/eye.width+roll*.42;
      eye.root.position.copy(eye.home);
      eye.root.scale.set(eye.scale*(1+windup*.15),eye.scale*Math.max(.04,openY),1);
      eye.core.position.set(lx*eye.width*.7,ly*eye.width*.45,.004);
      eye.pupil.position.set(lx*eye.width*1.1,ly*eye.width*.7,.006);
      eye.pupil.scale.set(pupilX,pupilY,1);
      eye.pupil.material.opacity=.92*(1-roll*.85)*(pose==='dead'?Math.max(0,1-progress*1.4):1);
      eye.halo.material.color.copy(this.eyeColor).multiplyScalar(intensity*.6);
      eye.core.material.color.copy(this.eyeColor).lerp(WHITE,.45+roll*.4).multiplyScalar(intensity);
      eye.glint.material.color.setScalar(Math.min(1,intensity)*.7*(openY>.5?1:0));
    });
    // The jaw: breathes almost shut, opens through the wind-up, gapes on the strike.
    const breathe=reducedMotion?0:Math.max(0,Math.sin(time*1.1+this.seed))*.06*this.life;
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
    this.footing.material.opacity=.5*(1-this.dissolve.value);
  }

  dispose():void{if(this.disposed)return;this.disposed=true;this.art.dispose();this.artwork.dispose();this.group.removeFromParent();}
}

/**
 * The wind-up, as a creature performs it: a slow draw for half its length, then held perfectly
 * still, then pulled a last fraction further as the tension breaks into the strike.
 */
function windupCurve(progress:number):number {
  if(progress<.55)return THREE.MathUtils.smoothstep(progress,0,.55);
  if(progress<.85)return 1;
  return 1+THREE.MathUtils.smoothstep(progress,.85,1)*.08;
}

function mix(a:Joint,b:Joint,k:number):Joint {
  return {shoulder:a.shoulder+(b.shoulder-a.shoulder)*k,elbow:a.elbow+(b.elbow-a.elbow)*k,wrist:a.wrist+(b.wrist-a.wrist)*k,curl:a.curl+(b.curl-a.curl)*k,spread:a.spread+(b.spread-a.spread)*k};
}

function seeded(seed:number):()=>number{
  let state=seed>>>0||1;
  return()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
