import * as THREE from 'three';
import { CreatureArtwork, type PupilShape } from './CreatureArtwork.ts';
import { ArtResources } from './storybook.ts';
import { glowTexture } from './vfx.ts';
import { bindSpellLights, SPELL_LIGHT_GLSL } from './LanternLighting.ts';

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

interface PartUniforms { bend:{value:number}; curl:{value:number}; height:{value:number}; caps?:Caps }
/** Round ends for limb pieces: (u, v, radius) per end in the part's uv space, plus the part's size. */
interface Caps { top:{value:THREE.Vector4}; bottom:{value:THREE.Vector4}; size:{value:THREE.Vector2} }
const NO_CAPS:Caps={top:{value:new THREE.Vector4(0,0,0,0)},bottom:{value:new THREE.Vector4(0,0,0,0)},size:{value:new THREE.Vector2(1,1)}};
type Overlay=THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
/**
 * One eye: a halo bleeding light into the socket, a glowing iris, a dark pupil that tracks and
 * dilates, and a fixed wet glint. Each eye follows the gaze at its own rate, so the pair drifts
 * very slightly out of step before settling: the stare never looks quite mechanical.
 */
interface Eye { root:THREE.Group; halo:Overlay; core:Overlay; pupil:Overlay; glint:Overlay; home:THREE.Vector3; width:number; look:THREE.Vector2; lag:number; scale:number }
interface Joint { shoulder:number; elbow:number; wrist:number; curl:number; spread:number }
const joint=(shoulder:number,elbow:number,wrist:number,curl:number,spread:number):Joint=>({shoulder,elbow,wrist,curl,spread});
/**
 * Where each painted arm bends, in its 512px artwork: elbow and wrist pivots, the knuckle line,
 * and every finger's root (x) with its resting splay. The arm is cut at these joints, so the
 * painting is unchanged at rest; the fingers are separate talons.
 */
const ARMS:Record<CreatureKind,{elbow:[number,number];wrist:[number,number];radius:[number,number];knuckle:number;palm:number;fingers:[number,number][];clawLength:number;clawWidth:number}>={
  goblin:{elbow:[231,205],wrist:[242,342],radius:[58,48],knuckle:424,palm:262,fingers:[[218,-.38],[242,-.12],[266,.12],[292,.4]],clawLength:84,clawWidth:30},
  root:{elbow:[224,205],wrist:[262,362],radius:[48,46],knuckle:412,palm:268,fingers:[[232,-.3],[256,-.08],[281,.14],[308,.42]],clawLength:96,clawWidth:32},
  hollow:{elbow:[230,245],wrist:[258,392],radius:[42,40],knuckle:428,palm:262,fingers:[[230,-.28],[251,-.08],[272,.1],[298,.36]],clawLength:92,clawWidth:26},
  wraith:{elbow:[216,255],wrist:[247,362],radius:[40,38],knuckle:404,palm:250,fingers:[[226,-.3],[250,-.02],[278,.3]],clawLength:74,clawWidth:28},
};
/**
 * Body language for each spirit's attack, per arm (own space: + swings the arm outward/up).
 *  goblin: both claws cocked beside the head, then two raking swipes a beat apart.
 *  root:   arms hauled overhead with the hands knotted into fists, then a hammer slam.
 *  hollow: arms spread wide and high with the forearms hanging limp, then a folding grab.
 *  wraith: the free hand cups an ember beside its face and flings it; the lantern rises.
 */
const ATTACKS:Record<CreatureKind,{rest:Joint;cocked:[Joint,Joint];follow:[Joint,Joint];delay:[number,number];smear:boolean}>={
  goblin:{rest:joint(.08,-.2,.06,.3,.2),cocked:[joint(1.25,1.4,.5,-.3,1.05),joint(1.15,1.5,.55,-.3,1.05)],follow:[joint(-.6,-.35,-.5,1.1,.35),joint(-.6,-.35,-.5,1.1,.35)],delay:[0,.4],smear:true},
  root:{rest:joint(.05,-.1,.04,.5,.12),cocked:[joint(2.45,.6,.35,1.15,.05),joint(2.45,.6,.35,1.15,.05)],follow:[joint(-.1,-.3,-.35,1.2,.05),joint(-.1,-.3,-.35,1.2,.05)],delay:[0,.06],smear:true},
  hollow:{rest:joint(.05,-.08,-.12,.2,.3),cocked:[joint(1.6,-.6,-.75,-.4,1.3),joint(1.5,-.7,-.7,-.4,1.3)],follow:[joint(-.25,-1.1,.25,1.3,.15),joint(-.25,-1.1,.25,1.3,.15)],delay:[0,.1],smear:true},
  wraith:{rest:joint(.06,-.15,.05,.35,.2),cocked:[joint(.95,1.75,-.35,.4,.9),joint(.65,.55,.1,.8,.1)],follow:[joint(.5,.12,.35,-.5,1.35),joint(.3,.2,.05,.8,.1)],delay:[0,0],smear:false},
};
interface ArmRig {
  shoulder:THREE.Group; elbow:THREE.Group; wrist:THREE.Group; fingers:THREE.Group[]; splay:number[];
  palm:THREE.Object3D; power:Overlay; smear:Overlay|null; now:Joint;
  dangle:number; dangleVelocity:number; lastShoulder:number;
  phase:number; twitchAt:number; twitch:number; twitchDir:number; twitchFinger:number;
}

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
  private headBob=0;
  private readonly legRigs:PartUniforms[]=[];
  private static count=0;

  constructor(readonly kind:CreatureKind){
    this.seed=(Creature.count++)*7919+kind.length*131;
    this.random=seeded(this.seed);
    this.nextBlink=1+this.random()*4;this.nextTilt=1+this.random()*4;this.nextJerk=4+this.random()*8;this.nextRoll=9+this.random()*14;this.nextTremor=4+this.random()*8;this.nextStutter=3+this.random()*5;this.gaitClock=this.random()*6.28;
    const s=SIZES[kind],face=FACES[kind];
    this.glow=new THREE.Color(face.glow);
    this.edge={value:this.glow.clone()};
    this.group.name=CREATURE_NAMES[kind];this.group.add(this.body);
    this.torso=this.part('body',s.width,s.body);this.torso.position.set(0,s.leg+s.body*0.4,0);this.body.add(this.torso);
    for(const side of [-1,1]){
      const leg=new THREE.Group();leg.position.set(side*s.width*0.14,s.leg+0.09,-0.035);
      const legRig:PartUniforms={bend:{value:0},curl:{value:0},height:{value:s.leg*1.18}};
      const shape=this.part('leg',s.width*0.42,s.leg*1.18,legRig,6);shape.position.y=-s.leg*0.48;shape.scale.x=side;
      leg.add(shape);this.body.add(leg);this.legs.push(leg);this.legRigs.push(legRig);
      const arm=new THREE.Group();arm.position.set(side*s.width*0.19,s.leg+s.body*0.70,side<0?-0.02:0.04);
      this.body.add(arm);this.arms.push(arm);
      this.armRigs.push(this.buildArm(arm,side));
    }
    this.head.position.set(0,s.height-s.head*0.48,0.08);
    const headWidth=s.width*1.20;
    this.head.add(this.part('head',headWidth,s.head));this.body.add(this.head);
    // Expression overlays, placed exactly over the painted sockets and mouth.
    const at=(px:number,py:number,z:number)=>new THREE.Vector3((px/512-0.5)*headWidth,(0.5-py/512)*s.head,z);
    const eyeWidth=face.eyeSize/512*headWidth;
    for(const [px,py] of face.eyes){
      const root=new THREE.Group();const home=at(px,py,0.02);root.position.copy(home);
      // A touch of asymmetry: one eye is always a little larger than the other.
      const scale=this.eyes.length===0?1:.9+this.random()*.06;
      const halo=this.overlay(glowTexture(),eyeWidth*2.6,eyeWidth*1.5,THREE.AdditiveBlending);
      const core=this.overlay(this.artwork.iris(),eyeWidth*1.1,eyeWidth*0.66,THREE.AdditiveBlending);core.position.z=0.004;
      const pupil=this.overlay(this.artwork.pupil(face.pupil),eyeWidth*.62,eyeWidth*.62,THREE.NormalBlending);pupil.position.z=0.006;
      pupil.material.color.set('#010303');pupil.material.opacity=.92;
      const glint=this.overlay(glowTexture(),eyeWidth*.2,eyeWidth*.16,THREE.AdditiveBlending);glint.position.set(-eyeWidth*.16,eyeWidth*.1,0.008);
      core.renderOrder=3;pupil.renderOrder=4;glint.renderOrder=5;
      for(const mesh of [halo,core,pupil,glint])mesh.userData.eye=true;
      root.scale.setScalar(scale);root.add(halo,core,pupil,glint);this.head.add(root);
      this.eyes.push({root,halo,core,pupil,glint,home,width:eyeWidth,look:new THREE.Vector2(),lag:this.eyes.length===0?22:9+this.random()*5,scale});
    }
    this.mouth=this.overlay(this.artwork.mouth(kind),face.mouthSize[0]/512*headWidth,face.mouthSize[1]/512*s.head,THREE.NormalBlending);
    this.mouth.material.color.set('#ffffff');
    this.mouth.position.copy(at(face.mouth[0],face.mouth[1],0.012));
    this.mouth.scale.y=0.08;
    this.head.add(this.mouth);
    if(kind==='wraith'){
      // The lantern hangs from the clenched right hand by its ring.
      const lantern=this.part('lantern',0.58,0.66);lantern.position.y=-0.3;this.lantern.add(lantern);
      const hand=this.armRigs[1];this.lantern.position.copy(hand.palm.position).add(new THREE.Vector3(0,-0.02,0.03));hand.wrist.add(this.lantern);
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
    return new THREE.Mesh(this.art.geometry(new THREE.PlaneGeometry(width,height,1,rows)),this.skin(this.artwork.part(this.kind,name),uniforms??{bend:{value:0},curl:{value:0},height:{value:height}}));
  }

  /** A horizontal band [v0, v1] of a part's painting, hanging from its top edge (the joint). */
  private strip(map:THREE.Texture,width:number,height:number,v0:number,v1:number,top?:[number,number,number],bottom?:[number,number,number]):THREE.Mesh {
    const h=(v1-v0)*height,geometry=new THREE.PlaneGeometry(width,h,1,2),uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setY(i,1-(v0+(1-uv.getY(i))*(v1-v0)));
    geometry.translate(0,-h/2,0);
    // Joint caps, given in artwork pixels (x, y, radius) and converted to uv space.
    const cap=(c?:[number,number,number])=>new THREE.Vector4(c?c[0]/512:0,c?1-c[1]/512:0,c?c[2]/512*width:0,c?1:0);
    const caps:Caps={top:{value:cap(top)},bottom:{value:cap(bottom)},size:{value:new THREE.Vector2(width,height)}};
    return new THREE.Mesh(this.art.geometry(geometry),this.skin(map,{bend:{value:0},curl:{value:0},height:{value:h},caps}));
  }

  /**
   * Shoulder → elbow → wrist → talons, cut from the painted arm at its own joints. Everything below
   * `mirror` is authored in the arm's own space, so + always swings outward for either side.
   */
  private buildArm(arm:THREE.Group,side:number):ArmRig {
    const s=SIZES[this.kind],shape=ARMS[this.kind],W=s.width*.5,H=s.body*1.05,top=H*.07;
    const px=(x:number)=>(x/512-.5)*W,py=(y:number)=>top-y/512*H;
    const map=this.artwork.part(this.kind,'arm');
    const mirror=new THREE.Group();mirror.scale.x=side;arm.add(mirror);
    const shoulder=new THREE.Group();mirror.add(shoulder);
    const [ex,ey]=shape.elbow,[wx,wy]=shape.wrist,k=shape.knuckle;
    const [er,wr]=shape.radius;
    const upper=this.strip(map,W,H,0,(ey+er*.9)/512,undefined,[ex,ey,er]);upper.position.set(0,py(0),0);shoulder.add(upper);
    const elbow=new THREE.Group();elbow.position.set(px(ex),py(ey),.006);shoulder.add(elbow);
    const fore=this.strip(map,W,H,(ey-er*.9)/512,(wy+wr*.9)/512,[ex,ey,er],[wx,wy,wr]);fore.position.set(-px(ex),py(ey-er*.9)-py(ey),0);elbow.add(fore);
    const wrist=new THREE.Group();wrist.position.set(px(wx)-px(ex),py(wy)-py(ey),.006);elbow.add(wrist);
    const hand=this.strip(map,W,H,(wy-wr*.9)/512,(k+12)/512,[wx,wy,wr]);hand.position.set(-px(wx),py(wy-wr*.9)-py(wy),.004);wrist.add(hand);
    const clawMap=this.artwork.claw(this.kind),cw=shape.clawWidth/512*W*1.25,cl=shape.clawLength/512*H;
    const clawGeometry=this.art.geometry(new THREE.PlaneGeometry(cw,cl,1,2));clawGeometry.translate(0,-cl*.46,0);
    const fingers:THREE.Group[]=[],splay:number[]=[];
    for(const [fx,angle] of shape.fingers){
      const finger=new THREE.Group();finger.name='talon';finger.position.set(px(fx)-px(wx),py(k)-py(wy),0);finger.rotation.z=angle;
      finger.add(new THREE.Mesh(clawGeometry,this.skin(clawMap,{bend:{value:0},curl:{value:0},height:{value:cl}})));
      wrist.add(finger);fingers.push(finger);splay.push(angle);
    }
    const palm=new THREE.Object3D();palm.position.set(px(shape.palm)-px(wx),py((wy+k)/2)-py(wy),.03);wrist.add(palm);
    // Power gathers in the palm through the wind-up.
    const free=this.kind==='wraith'&&side<0;
    const power=this.overlay(glowTexture(),W*(free?1.1:.7),W*(free?1.1:.7),THREE.AdditiveBlending);
    power.position.copy(palm.position);power.renderOrder=6;power.visible=false;wrist.add(power);
    let smear:Overlay|null=null;
    if(ATTACKS[this.kind].smear){
      const reach=-py(k+shape.clawLength)*1.05;
      smear=this.overlay(this.artwork.smear(),reach*2,reach*2,THREE.AdditiveBlending);smear.position.z=.08;smear.renderOrder=6;smear.visible=false;mirror.add(smear);
    }
    return {shoulder,elbow,wrist,fingers,splay,palm,power,smear,now:{...ATTACKS[this.kind].rest},dangle:0,dangleVelocity:0,lastShoulder:0,
      phase:this.random()*6.28,twitchAt:1+this.random()*3,twitch:-10,twitchDir:1,twitchFinger:0};
  }

  /** Where a spirit's power leaves its body: the wraith's free palm, otherwise the leading hand. */
  castPoint(out:THREE.Vector3):THREE.Vector3 {
    this.group.updateWorldMatrix(true,true);
    return this.armRigs[0].palm.getWorldPosition(out);
  }

  /** 0 while the spirit has stopped dead mid-step, 1 while it is walking; scales its ground speed. */
  get gait():number{return this.stride;}

  private skin(map:THREE.Texture,rig:PartUniforms):THREE.MeshBasicMaterial {
    const material=this.art.material(new THREE.MeshBasicMaterial({map,alphaTest:0.12,side:THREE.DoubleSide,transparent:false,fog:true}));material.toneMapped=false;
    const dissolve=this.dissolve,edge=this.edge;
    material.onBeforeCompile=(shader)=>{
      shader.uniforms.uBend=rig.bend;shader.uniforms.uCurl=rig.curl;shader.uniforms.uPartHeight=rig.height;
      shader.uniforms.uDissolve=dissolve;shader.uniforms.uEdge=edge;bindSpellLights(shader.uniforms);
      const caps=rig.caps??NO_CAPS;shader.uniforms.uCapTop=caps.top;shader.uniforms.uCapBottom=caps.bottom;shader.uniforms.uCapSize=caps.size;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uBend; uniform float uCurl; uniform float uPartHeight; varying vec2 vPartUv; varying vec3 vPartWorld;')
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          vPartUv = uv;
          // 0 at the shoulder, 1 at the claws: the lower limb bends more than the upper.
          float limb = 1.0 - uv.y;
          transformed.x += uBend * limb * limb * uPartHeight;
          transformed.z += uCurl * limb * limb * limb * uPartHeight * 0.55;
          transformed.y += abs(uCurl) * limb * limb * uPartHeight * 0.08;
          vPartWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
          uniform float uDissolve; uniform vec3 uEdge; uniform vec4 uCapTop; uniform vec4 uCapBottom; uniform vec2 uCapSize; varying vec2 vPartUv; varying vec3 vPartWorld;
          ${SPELL_LIGHT_GLSL}
          float creatureHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
          float creatureNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(creatureHash(i), creatureHash(i + vec2(1.0, 0.0)), f.x), mix(creatureHash(i + vec2(0.0, 1.0)), creatureHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
        .replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
          // Limb pieces end in a round cut about their joint, so a bent elbow stays one shape.
          if (uCapTop.w > 0.0 && vPartUv.y > uCapTop.y && length((vPartUv - uCapTop.xy) * uCapSize) > uCapTop.z) discard;
          if (uCapBottom.w > 0.0 && vPartUv.y < uCapBottom.y && length((vPartUv - uCapBottom.xy) * uCapSize) > uCapBottom.z) discard;
          float creatureGrain = creatureNoise(vPartUv * 9.0) * 0.65 + creatureNoise(vPartUv * 23.0) * 0.35;
          // Dissolve from the top down, broken up by noise, with a glowing burning edge.
          float creatureFront = creatureGrain * 0.55 + vPartUv.y * 0.45;
          float creatureCut = uDissolve * 1.08 - 0.04;
          if (uDissolve > 0.0 && creatureFront < creatureCut) discard;
          float creatureBurn = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.06, creatureFront - creatureCut) : 0.0;
          diffuseColor.rgb = mix(diffuseColor.rgb, uEdge * 1.8, creatureBurn);
          diffuseColor.rgb *= 1.0 + spellIllumination(vPartWorld);`);
    };
    material.customProgramCacheKey=()=>'creature-rig-v3';
    return material;
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
    // The creep: a limping, uneven step (one leg drags and the body dips onto it), and every so
    // often the spirit stops dead mid-stride, holds utterly still, then carries on.
    const motion=reducedMotion?0:1;
    if(walking&&!reducedMotion&&time>this.nextStutter){
      this.stutterUntil=time+.35+this.random()*.45;this.nextStutter=time+4+this.random()*6;
      this.jerk=(this.random()<.5?-1:1)*.11;
    }
    const holding=walking&&time<this.stutterUntil;
    if(walking&&!holding)this.gaitClock+=dt*profile.cadence;
    this.stride+=((walking&&!holding?1:0)-this.stride)*(1-Math.exp(-dt*(holding?30:10)));
    const phase=this.gaitClock+.42*Math.sin(this.gaitClock);
    const gait=walking?Math.sin(phase)*this.stride:0,windup=pose==='windup'?Math.sin(progress*Math.PI/2):0;
    const strike=pose==='strike'?Math.sin(progress*Math.PI):0,dead=pose==='dead'?THREE.MathUtils.smoothstep(progress,0,1):0;
    const drag=Math.max(0,-gait);
    const idle=reducedMotion?0:Math.sin(time*1.3)*0.014;
    const blend=1-Math.exp(-dt*14);
    const turn=(o:THREE.Object3D,value:number)=>{o.rotation.z=THREE.MathUtils.lerp(o.rotation.z,value,blend);};
    const rise=this.awakenAge<1.4?(1-THREE.MathUtils.smoothstep(this.awakenAge,0,1.4))*-0.35:0;
    const bounce=Math.abs(gait)*profile.bounce*(gait<0?1.45:1);
    this.body.position.y=(this.kind==='wraith'?0.16+(reducedMotion?0:Math.sin(time*1.5)*profile.bounce):bounce)+idle-dead*s.height*0.05+rise;
    this.body.position.x=-windup*profile.crouch+strike*profile.lunge+recoil*0.12;
    this.body.rotation.x=windup*-profile.windup+strike*profile.strike;
    const roll=gait*(this.kind==='goblin' ? .028 : .018)-drag*.025*motion;
    turn(this.body,roll-windup*profile.windup+strike*profile.strike+dead*.18+recoil*.13);
    // Slow, uncanny head tilts with a rare sharp jerk.
    if(!reducedMotion){
      if(time>this.nextTilt){this.tiltTarget=(this.random()-.5)*(this.kind==='hollow'?.34:.24);this.nextTilt=time+3.5+this.random()*4;}
      if(time>this.nextJerk){this.jerk=(this.random()<.5?-1:1)*.09;this.nextJerk=time+6+this.random()*9;}
    }
    this.tilt+=(this.tiltTarget-this.tilt)*(1-Math.exp(-dt*1.1));
    this.jerk*=Math.exp(-dt*11);
    const tilt=reducedMotion?0:this.tilt+this.jerk;
    // The head stays locked level on you while the body lurches beneath it, and bobs a beat late.
    turn(this.head,(reducedMotion?0:Math.sin(time*(this.kind==='hollow' ? .7 : .5))*.018)-windup*profile.headWindup+strike*profile.headStrike+tilt*(1-windup*.6)-roll*.8*motion);
    this.head.rotation.x=windup*.06-strike*.04;
    this.headBob+=(bounce*.6-this.headBob)*(1-Math.exp(-dt*5));
    this.head.position.y=s.height-s.head*0.48-this.headBob*motion;
    // Breathing: the torso swells a little, slower for the big ones.
    this.torso.scale.y=1+(reducedMotion?0:Math.sin(time*(this.kind==='root'||this.kind==='hollow'?.9:1.6)+this.seed)*.014);
    for(let i=0;i<2;i++){
      const side=i===0?-1:1;
      turn(this.legs[i],gait*side*(this.kind==='root' ? .035 : this.kind==='goblin' ? .075 : .055));
      // The left leg drags: it barely lifts, and its knee buckles outward instead.
      const lift=Math.max(0,gait*side)*(side<0?.45:1);
      this.legs[i].position.y=s.leg+.09+(walking?lift*profile.bounce*.8:0);
      this.legRigs[i].bend.value=THREE.MathUtils.lerp(this.legRigs[i].bend.value,walking?(side<0?drag*.09:lift*.05)*motion:0,blend);
      this.arms[i].position.y=s.leg+s.body*.70+(walking?Math.sin(phase+side)*profile.bounce*.55*this.stride:0);
      this.animateArm(i,time,pose,progress,dt,reducedMotion,gait,phase,windup,recoil);
    }
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

  /**
   * One arm, joint by joint. Targets come from the spirit's attack choreography; on top sit a
   * walking swing, a forearm that dangles a beat behind the shoulder, independent sway, and
   * fingers that twitch one at a time. Power gathers in the palm and a raking swing leaves a smear.
   */
  private animateArm(i:number,time:number,pose:CreaturePose,progress:number,dt:number,reducedMotion:boolean,gait:number,phase:number,windup:number,recoil:number):void {
    const rig=this.armRigs[i],attack=ATTACKS[this.kind],side=i===0?-1:1,motion=reducedMotion?0:1;
    const rest=attack.rest,cocked=attack.cocked[i],follow=attack.follow[i];
    let goal:Joint;let rate=7;
    if(pose==='windup'){
      const k=THREE.MathUtils.smoothstep(progress,0,.7);
      goal=mix(rest,cocked,k);rate=6;
    }else if(pose==='strike'){
      const swung=progress>=attack.delay[i];
      goal=swung?follow:cocked;rate=swung?30:12;
    }else if(pose==='stagger'){
      goal=joint(.55+side*.1,.45,-.45,-.35,1.25);rate=18;
    }else if(pose==='dead'){
      goal=joint(.02,-.05,-.1,.75,.05);rate=3;
    }else{
      goal={...rest};rate=pose==='recover'?3.5:7;
    }
    // Walking: arms swing out of step with the legs; the wraith drifts rather than strides.
    const swing=this.kind==='wraith'?Math.sin(phase+side)*.035:gait*side*(this.kind==='goblin' ? .16 : .09);
    const sway=reducedMotion?0:Math.sin(time*.73+rig.phase)*.035+Math.sin(time*.29+rig.phase*2)*.02;
    goal.shoulder+=swing+sway+recoil*.35;
    const now=rig.now,step=1-Math.exp(-dt*rate);
    now.shoulder+=(goal.shoulder-now.shoulder)*step;now.elbow+=(goal.elbow-now.elbow)*step;now.wrist+=(goal.wrist-now.wrist)*step;
    now.curl+=(goal.curl-now.curl)*step;now.spread+=(goal.spread-now.spread)*step;
    // A loose forearm: a damped spring driven by how fast the shoulder moves.
    const velocity=dt>0?(now.shoulder-rig.lastShoulder)/dt:0;rig.lastShoulder=now.shoulder;
    if(dt>0){
      rig.dangleVelocity+=(-rig.dangle*60-rig.dangleVelocity*7-velocity*9)*dt;
      rig.dangle=THREE.MathUtils.clamp(rig.dangle+rig.dangleVelocity*dt,-.6,.6);
    }
    const loose=(pose==='strike'||pose==='windup'?.35:1)*motion;
    rig.shoulder.rotation.z=now.shoulder;
    rig.elbow.rotation.z=now.elbow+rig.dangle*loose;
    rig.wrist.rotation.z=now.wrist+rig.dangle*.5*loose;
    // Reach: the hand tips toward its prey as the attack builds.
    rig.wrist.rotation.x=-(windup*.25+(pose==='strike'?.35:0))*motion;
    // Fingers: one twitches on its own now and then; all of them flex slowly.
    if(!reducedMotion&&time>rig.twitchAt){rig.twitch=time;rig.twitchDir=this.random()<.5?-1:1;rig.twitchFinger=Math.floor(this.random()*rig.fingers.length);rig.twitchAt=time+1.2+this.random()*3.4;}
    const twitch=reducedMotion||time<rig.twitch?0:Math.exp(-(time-rig.twitch)*9);
    rig.fingers.forEach((finger,f)=>{
      const flex=reducedMotion?0:Math.sin(time*1.7+rig.phase+f*.9)*.06;
      const jolt=f===rig.twitchFinger?twitch*.35*rig.twitchDir:0;
      finger.rotation.z=rig.splay[f]*(.45+now.spread*.75)+jolt+flex*.5;
      // Curling hooks each talon toward the player (it foreshortens), splaying bends it back.
      finger.rotation.x=-(now.curl+flex+Math.abs(jolt)*.6)*(f===0?.85:1);
    });
    // Power in the palm: a slow swell through the wind-up, a flare at the strike.
    const strikeFlare=pose==='strike'?Math.max(0,1-progress*1.6):0;
    const charge=pose==='windup'?THREE.MathUtils.smoothstep(progress,.1,1):0;
    const free=this.kind==='wraith'&&i===0,lanternArm=this.kind==='wraith'&&i===1;
    const level=lanternArm?0:(charge*(free?1.2:.75)+strikeFlare*(free?.4:1))*(pose==='dead'?0:1);
    rig.power.visible=level>.01;
    if(rig.power.visible){
      const flicker=1+(reducedMotion?0:Math.sin(time*31+rig.phase)*.12+Math.sin(time*17)*.08);
      rig.power.material.color.copy(free?EMBER:this.glow).lerp(ANGER,free?.15:charge*.55).multiplyScalar(level*flicker);
      rig.power.scale.setScalar(.55+charge*.6+strikeFlare*.5);
    }
    if(rig.smear){
      const k=pose==='strike'&&progress>=attack.delay[i]?Math.max(0,1-(progress-attack.delay[i])/.55):0;
      rig.smear.visible=k>.01;
      if(rig.smear.visible){
        rig.smear.rotation.z=now.shoulder+.55;
        rig.smear.material.color.copy(this.glow).lerp(ANGER,.4).multiplyScalar(k*.6);
      }
    }
    if(i===1&&this.kind==='wraith'){
      // The lantern hangs plumb from the hand whatever the arm does, swinging a little behind it.
      this.lantern.rotation.z=-(now.shoulder+now.elbow+now.wrist)*side+(reducedMotion?0:Math.sin(time*1.3)*.12)-rig.dangle*.6;
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
    // Rarely, while it is only watching, the eyes roll back white for a moment and snap down.
    const calm=pose==='idle'||pose==='walk';
    if(!reducedMotion&&calm&&time>this.nextRoll){this.rollAt=time;this.nextRoll=time+14+this.random()*16;}
    const rollT=time-this.rollAt,roll=rollT>=0&&rollT<.9?Math.sin(Math.min(1,rollT/.9)*Math.PI)**.6:0;
    // Now and then one eye shivers on its own.
    if(!reducedMotion&&time>this.nextTremor){this.tremorAt=time;this.nextTremor=time+5+this.random()*9;}
    const tremor=!reducedMotion&&time-this.tremorAt<.35?1-(time-this.tremorAt)/.35:0;
    // Pupils: narrow and watchful at rest, blown wide as it fixes on you to strike, a pinprick when hurt.
    const hurt=pose==='stagger'||this.hitTime<.4;
    const dilateGoal=pose==='dead'?1:hurt?.08:pose==='frozen'?this.dilation:strike?.95:windup>0?.35+windup*.65:.32+(reducedMotion?0:Math.sin(time*.37+this.seed)*.08);
    this.dilation+=(dilateGoal-this.dilation)*(1-Math.exp(-dt*(hurt?20:pose==='windup'?5:2.5)));
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
      // Rolled back, the pupil slides up under the lid and the iris goes milky.
      eye.pupil.material.opacity=.92*(1-roll*.85)*(pose==='dead'?Math.max(0,1-progress*1.4):1);
      eye.halo.material.color.copy(this.eyeColor).multiplyScalar(intensity*.75);
      eye.core.material.color.copy(this.eyeColor).lerp(WHITE,.45+roll*.4).multiplyScalar(intensity);
      eye.glint.material.color.setScalar(Math.min(1,intensity)*.85*(openY>.5?1:0));
    });
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

function mix(a:Joint,b:Joint,k:number):Joint {
  return {shoulder:a.shoulder+(b.shoulder-a.shoulder)*k,elbow:a.elbow+(b.elbow-a.elbow)*k,wrist:a.wrist+(b.wrist-a.wrist)*k,curl:a.curl+(b.curl-a.curl)*k,spread:a.spread+(b.spread-a.spread)*k};
}

function seeded(seed:number):()=>number{
  let state=seed>>>0||1;
  return()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}
