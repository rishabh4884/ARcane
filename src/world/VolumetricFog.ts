import * as THREE from 'three';
import { seededRandom, terrainHeight } from './spatial.ts';
import { createLanternUniform, LANTERN_GLSL, type LanternUniform } from './LanternLighting.ts';

/** Several depth-separated, softly-lit fog volumes drift independently through the fixed forest. */
export class VolumetricFog {
  readonly group=new THREE.Group();
  private readonly time={value:0};
  private readonly motion={value:1};
  private readonly volume:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>;
  // This shader is evaluated across every visible translucent bank every frame. Keep the
  // instance count at the original scene budget so it does not compete with camera tracking
  // on integrated GPUs.
  private cloudCount=32;
  private disposed=false;
  constructor(private readonly lanterns:LanternUniform=createLanternUniform()){
    this.group.name='Rolling, illuminated forest fog';
    const random=seededRandom(0xf06ba9),origins:number[]=[],sizes:number[]=[],colors:number[]=[];
    // Fog pools where cold air would settle: low ground, the pond and the old gate. Elsewhere it thins to
    // clear pockets, so the forest reads as layered banks and drifts rather than an even veil.
    const pondDistance=(x:number,z:number)=>Math.hypot((x-25)/1.3,z+15);
    const gateDistance=(x:number,z:number)=>Math.hypot(x+25,z+30);
    let attempts=0;
    while(origins.length/4<this.cloudCount&&attempts++<4000){
      const z=-4-Math.pow(random(),0.8)*78,x=(random()-.5)*118;
      const ground=terrainHeight(x,z);
      const low=THREE.MathUtils.clamp(.5-ground*.32,0,1);
      const nearWater=Math.max(0,1-pondDistance(x,z)/24),nearGate=Math.max(0,1-gateDistance(x,z)/20);
      const weight=.14+low*.42+nearWater*.55+nearGate*.35;
      if(random()>weight)continue;
      const far=THREE.MathUtils.clamp((-z-4)/78,0,1);
      const y=ground+.35+random()*.9+nearWater*.4;
      const width=(11+random()*17)*(1+far*.9)*(1+nearWater*.35);
      const height=(1.7+random()*2.3)*(1+far*.8)+nearWater*1.2;
      origins.push(x,y,z,random()*6.28);
      sizes.push(width,height);
      // Per-bank density: some banks are thick, some barely there.
      colors.push(.28+Math.pow(random(),1.6)*.72+nearWater*.25);
    }
    this.cloudCount=origins.length/4;
    const source=new THREE.PlaneGeometry(1,1,24,4),geometry=new THREE.InstancedBufferGeometry();
    geometry.setIndex(source.index);geometry.setAttribute('position',source.getAttribute('position'));geometry.setAttribute('uv',source.getAttribute('uv'));
    geometry.setAttribute('fogOrigin',new THREE.InstancedBufferAttribute(new Float32Array(origins),4));
    geometry.setAttribute('fogSize',new THREE.InstancedBufferAttribute(new Float32Array(sizes),2));
    geometry.setAttribute('fogShade',new THREE.InstancedBufferAttribute(new Float32Array(colors),1));geometry.instanceCount=this.cloudCount;
    source.dispose();
    const material=new THREE.ShaderMaterial({
      transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,uniforms:{uTime:this.time,uMotion:this.motion,uLanterns:this.lanterns},
      vertexShader:`attribute vec4 fogOrigin;attribute vec2 fogSize;attribute float fogShade;uniform float uTime;uniform float uMotion;
        varying vec2 vUv;varying vec3 vWorld;varying float vDepth;varying float vShade;
        void main(){vUv=uv;vShade=fogShade;
          // The bank's crest rolls like a slow wave; its whole body breathes and drifts with the wind.
          float swell=sin(uv.x*8.0+uTime*.32+fogOrigin.w)+sin(uv.x*17.0-uTime*.21+fogOrigin.w*1.7)*.45;
          float lift=swell*.22*uv.y*uMotion;
          vec3 p=vec3(position.x*fogSize.x,position.y*fogSize.y+lift,position.z);
          vec3 world=fogOrigin.xyz+vec3(p.x, p.y, 0.0);
          world.y+=sin(uTime*.11+fogOrigin.w)*.45*uMotion;
          world.x+=sin(uTime*.07+fogOrigin.w)*2.2*uMotion;
          vWorld=world;vec4 mv=viewMatrix*vec4(world,1.0);vDepth=-mv.z;gl_Position=projectionMatrix*mv;
        }`,
       fragmentShader:`varying vec2 vUv;varying vec3 vWorld;varying float vDepth;varying float vShade;uniform float uTime;
         ${LANTERN_GLSL}
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
        float fbm(vec2 p){float n=0.0,a=.55;for(int i=0;i<3;i++){n+=noise(p)*a;p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(7.1,3.7);a*=.5;}return n;}
         void main(){
           // Reject fragments outside the visible depth band before evaluating layered noise.
           if(vDepth>78.0||vDepth<2.0)discard;
           float lowFog=pow(1.0-vUv.y,.85);
           float envelope=pow(max(0.,sin(vUv.x*3.14159)),.55)*smoothstep(0.,.18,vUv.y)*lowFog;
           if(envelope<.012)discard;
           // Wind carries the fog left to right; a domain warp makes it curl and fold as it goes.
           vec2 wind=vec2(uTime*.045,-uTime*.012);
           vec2 flow=vec2(vWorld.x*.05,vWorld.z*.085+vUv.y*.6)-wind;
           vec2 warp=vec2(noise(flow*1.3+vec2(uTime*.05,0.)),noise(flow*1.3+vec2(4.2,uTime*.04)))-.5;
           float billow=fbm(flow+warp*1.4)+.3*noise(flow*3.1-wind*1.7+warp);
           float pocket=smoothstep(.25,.7,noise(vWorld.xz*.03+vec2(11.3,4.7)-wind*.35));
           float density=smoothstep(.28,.8,billow)*envelope*mix(.15,1.15,pocket);
          float depth=1.0-smoothstep(44.,78.,vDepth);
          float reveal=smoothstep(2.,8.,vDepth);
          float alpha=density*depth*mix(.15,.36,smoothstep(12.,56.,vDepth))*reveal*mix(.5,1.25,vShade);
          if(alpha<.009)discard;
          vec3 shadowFog=vec3(.11,.17,.19),litFog=vec3(.24,.31,.31),moonFog=vec3(.30,.37,.42);
          float innerLight=vUv.y*.16+pow(max(0.,sin(vWorld.x*.035+uTime*.05)),3.0)*.07;
           float lantern=lanternIllumination(vWorld);
           vec3 color=mix(shadowFog,litFog,clamp(innerLight*vShade+.08,0.,.38));
           // Moonlight silvers the upper edges of each bank; lanterns warm what is near them.
           color=mix(color,moonFog,smoothstep(.45,1.0,vUv.y)*.5*(1.0-density*.5))+vec3(.46,.24,.09)*lantern;
          gl_FragColor=vec4(color,alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.volume=new THREE.Mesh(geometry,material);this.volume.frustumCulled=false;this.volume.renderOrder=2;this.group.add(this.volume);
  }
  update(dt:number,_camera:THREE.Camera,reducedMotion:boolean):void{if(!reducedMotion)this.time.value+=dt;this.motion.value=reducedMotion?0:1;}
  dispose():void{if(this.disposed)return;this.disposed=true;this.group.removeFromParent();this.volume.geometry.dispose();this.volume.material.dispose();}
}
