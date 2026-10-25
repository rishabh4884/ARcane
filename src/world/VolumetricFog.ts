import * as THREE from 'three';
import { seededRandom, terrainHeight } from './spatial.ts';

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
  constructor(){
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
      transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,uniforms:{uTime:this.time,uMotion:this.motion},
      vertexShader:`attribute vec4 fogOrigin;attribute vec2 fogSize;attribute float fogShade;uniform float uTime;uniform float uMotion;
        varying vec2 vUv;varying vec3 vWorld;varying float vDepth;varying float vShade;
        void main(){vUv=uv;vShade=fogShade;
          float swell=sin(uv.x*8.0+uTime*.08+fogOrigin.w)+sin(uv.x*17.0-uTime*.055+fogOrigin.w*1.7)*.4;
          float lift=swell*.13*uv.y*uMotion;
          vec3 p=vec3(position.x*fogSize.x,position.y*fogSize.y+lift,position.z);
          vec3 world=fogOrigin.xyz+vec3(p.x, p.y, 0.0);
          world.y+=sin(uTime*.037+fogOrigin.w)*.32*uMotion;
          world.x+=cos(uTime*.035+fogOrigin.w)*.8*uMotion;
          vWorld=world;vec4 mv=viewMatrix*vec4(world,1.0);vDepth=-mv.z;gl_Position=projectionMatrix*mv;
        }`,
      fragmentShader:`varying vec2 vUv;varying vec3 vWorld;varying float vDepth;varying float vShade;uniform float uTime;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
        float fbm(vec2 p){float n=0.0,a=.65;for(int i=0;i<2;i++){n+=noise(p)*a;p=p*2.03+vec2(7.1,3.7);a*=.5;}return n;}
         void main(){
           // Reject fragments outside the visible depth band before evaluating layered noise.
           if(vDepth>78.0||vDepth<2.0)discard;
           float lowFog=pow(1.0-vUv.y,.85);
           float envelope=pow(max(0.,sin(vUv.x*3.14159)),.55)*smoothstep(0.,.18,vUv.y)*lowFog;
           if(envelope<.012)discard;
           vec2 drift=vec2(uTime*.012,-uTime*.008);
          // Stretch the noise along the wind so banks read as long, sheared wisps; add a slow large-scale
          // pocket mask so clear breaks open and close between the banks.
          vec2 flow=vec2(vWorld.x*.052,vWorld.z*.09)+drift;
          float billow=fbm(flow)+.36*fbm(flow*2.1+vec2(2.7,8.1));
          float pocket=smoothstep(.28,.72,fbm(vWorld.xz*.021+vec2(11.3,4.7)+drift*.4));
           float density=smoothstep(.3,.82,billow)*envelope*mix(.12,1.15,pocket);
          float depth=1.0-smoothstep(44.,78.,vDepth);
          float reveal=smoothstep(2.,8.,vDepth);
          float alpha=density*depth*mix(.14,.34,smoothstep(12.,56.,vDepth))*reveal*mix(.5,1.25,vShade);
          if(alpha<.009)discard;
          vec3 shadowFog=vec3(.12,.18,.19),litFog=vec3(.22,.29,.27);
          float innerLight=vUv.y*.16+pow(max(0.,sin(vWorld.x*.035+uTime*.03)),3.0)*.06;
          vec3 color=mix(shadowFog,litFog,clamp(innerLight*vShade+.08,0.,.38));
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
