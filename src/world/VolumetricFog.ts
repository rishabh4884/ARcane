import * as THREE from 'three';
import { seededRandom, terrainHeight } from './spatial.ts';

/** Several depth-separated, softly-lit fog volumes drift independently through the fixed forest. */
export class VolumetricFog {
  readonly group=new THREE.Group();
  private readonly time={value:0};
  private readonly motion={value:1};
  private readonly volume:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>;
  private readonly cloudCount=32;
  private disposed=false;
  constructor(){
    this.group.name='Rolling, illuminated forest fog';
    const random=seededRandom(0xf06ba9),origins:number[]=[],sizes:number[]=[],colors:number[]=[];
    // Deeper rear bank, translucent middle bands, and a restrained shadowed foreground veil.
    for(let i=0;i<this.cloudCount;i++){
      const row=Math.floor(i/8),column=i%8;
      const spread=row===0?38:54;
      const z=row===0?-57-random()*17:row===1?-37-random()*17:row===2?-19-random()*12:-9-random()*6;
      const x=(column-3.5)*(spread/5)+(random()-.5)*8;
      const y=terrainHeight(x,z)+.8+random()*1.2;
      const width=(row===0?27:row===1?23:row===2?18:12)+random()*9;
      const height=(row===0?5.8:row===1?4.8:row===2?3.4:2.1)+random()*1.7;
      origins.push(x,y,z,random()*6.28);
      sizes.push(width,height);
      const shade=.75+random()*.25;colors.push(shade);
    }
    const source=new THREE.PlaneGeometry(1,1,32,5),geometry=new THREE.InstancedBufferGeometry();
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
        float fbm(vec2 p){float n=0.0,a=.57;for(int i=0;i<3;i++){n+=noise(p)*a;p=p*2.03+vec2(7.1,3.7);a*=.5;}return n;}
        void main(){
          vec2 flow=vWorld.xz*.074+vec2(uTime*.012,-uTime*.008);
          float billow=fbm(flow)+.32*fbm(flow*1.85+vec2(2.7,8.1));
          float envelope=pow(max(0.,sin(vUv.x*3.14159)),.48)*pow(max(0.,sin(vUv.y*3.14159)),.58);
          float density=smoothstep(.31,.76,billow)*envelope;
          float depth=1.0-smoothstep(44.,78.,vDepth);
          float reveal=smoothstep(2.,8.,vDepth);
          float alpha=density*depth*mix(.13,.30,smoothstep(12.,56.,vDepth))*reveal;
          if(alpha<.009)discard;
          vec3 shadowFog=vec3(.12,.18,.19),litFog=vec3(.22,.29,.27);
          float innerLight=(1.0-vUv.y)*.14+pow(max(0.,sin(vWorld.x*.035+uTime*.03)),3.0)*.06;
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
