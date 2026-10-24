import * as THREE from 'three';
import type { SpellAnimation } from './effects.ts';

/** Dense-but-bounded impact motes add a visible arrival beat without a particle engine. */
export class ImpactBurst implements SpellAnimation {
  readonly group=new THREE.Group();
  private readonly dust:THREE.Points;
  private readonly sprites:THREE.Sprite[]=[];
  private age=0;
  private triggered=false;
  private callback:(()=>void)|undefined;
  private disposed=false;
  private readonly positions:Float32Array;
  private readonly velocities:Float32Array;
  private readonly seeds:Float32Array;
  constructor(private readonly origin:THREE.Vector3,private readonly color:THREE.Color,private readonly count=52,private readonly duration=0.9){
    this.positions=new Float32Array(count*3);this.velocities=new Float32Array(count*3);this.seeds=new Float32Array(count);
    const direction=new THREE.Vector3();
    for(let i=0;i<count;i++){
      const y=Math.random()*2-0.35,a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random());direction.set(Math.cos(a)*r,y,Math.sin(a)*r).normalize();
      this.positions.set([origin.x,origin.y,origin.z],i*3);this.velocities.set([direction.x*(1.1+Math.random()*2.4),direction.y*(0.7+Math.random()*2.2),direction.z*(1.1+Math.random()*2.4)],i*3);this.seeds[i]=Math.random()*6.28;
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3));geometry.setAttribute('aSeed',new THREE.BufferAttribute(this.seeds,1));
    this.dust=new THREE.Points(geometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uColor:{value:color.clone()},uAge:{value:0},uSize:{value:80}},
      vertexShader:'attribute float aSeed;uniform float uAge;uniform float uSize;varying float vAlpha;varying float vSeed;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vAlpha=1.0-smoothstep(.15,1.0,uAge);vSeed=aSeed;gl_PointSize=clamp(uSize/max(1.0,-mv.z),2.0,12.0);gl_Position=projectionMatrix*mv;}',
      fragmentShader:'uniform vec3 uColor;varying float vAlpha;varying float vSeed;void main(){float d=length(gl_PointCoord-.5)*2.0;float core=exp(-d*d*12.0);float grain=.72+.28*sin(vSeed*97.0);gl_FragColor=vec4(uColor,core*vAlpha*grain);}',
    }));
    this.group.add(this.dust);
  }
  setImpactCallback(callback:()=>void):void{this.callback=callback;}
  update(dt:number):boolean{
    if(this.disposed)return false;
    const previous=this.age;this.age+=Math.max(0,dt);const t=Math.min(1,this.age/this.duration);
    if(!this.triggered&&previous<this.duration*.15&&this.age>=this.duration*.15){this.triggered=true;this.callback?.();}
    const positions=this.dust.geometry.getAttribute('position');
    for(let i=0;i<this.count;i++){
      const k=i*3;positions.setXYZ(i,this.origin.x+this.velocities[k]*this.age,this.origin.y+this.velocities[k+1]*this.age-1.8*this.age*this.age,this.origin.z+this.velocities[k+2]*this.age);
    }
    positions.needsUpdate=true;(this.dust.material as THREE.ShaderMaterial).uniforms.uAge.value=t;
    return this.age<this.duration;
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.dust.geometry.dispose();(this.dust.material as THREE.Material).dispose();this.group.traverse(object=>{if(object instanceof THREE.Sprite){object.material.map?.dispose();object.material.dispose();}});}
}

/** Tiny analytic point illumination — no shadow maps or full-screen blur. */
export class SpellGlint extends THREE.Object3D {
  private readonly sprite:THREE.Sprite;
  private readonly light:THREE.PointLight;
  constructor(color:THREE.Color,intensity:number=3,radius:number=5){
    super();const texture=glowTexture();
    this.sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));
    this.sprite.scale.set(1.5,1.5,1);this.add(this.sprite);
    this.light=new THREE.PointLight(color,intensity,radius,2);this.add(this.light);
  }
  pulse(t:number,strength=1):void{this.sprite.material.opacity=.42*strength*(.35+.65*Math.sin(t*Math.PI));this.sprite.scale.setScalar(.75+strength*(.7+Math.sin(t*Math.PI)*.5));this.light.intensity=4*strength*Math.sin(Math.PI*t);}
  dispose():void{this.sprite.material.map?.dispose();this.sprite.material.dispose();this.light.dispose();}
}
function glowTexture():THREE.Texture{
  if(typeof document==='undefined')return new THREE.Texture();
  const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d')!;
  const g=ctx.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.17,'rgba(255,255,255,.8)');g.addColorStop(.5,'rgba(255,255,255,.22)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
