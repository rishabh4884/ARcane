import * as THREE from 'three';
import { ArtResources, sweptShape, vectors } from './storybook.ts';
import { glowSprite } from './vfx.ts';
import { pathX, seededRandom, terrainHeight } from './spatial.ts';
import { createLanternUniform, type LanternUniform, LANTERN_COUNT } from './LanternLighting.ts';

interface Lamp { root: THREE.Group; light: THREE.PointLight | null; halo: THREE.Sprite; x:number; z:number; height:number; strength:number; phase:number }

export interface LanternSite { index: number; x: number; z: number; scale: number; strength: number; /** the lamp hangs from an arm this far along +x, this high, both before scaling */ arm: number; lampHeight: number }

/** Where the lanterns stand along the path: shared by the grove and the painted sets. */
export function lanternSites(): LanternSite[] {
  const route = [
    { z: 6.5, side: 1, scale: 1, strength: 1 },
    { z: -9, side: -1, scale: .82, strength: .8 },
    { z: -25, side: 1, scale: .72, strength: .69 },
    { z: -42, side: -1, scale: .66, strength: .62 },
    { z: -60, side: 1, scale: .55, strength: .52 },
    { z: -79, side: -1, scale: .49, strength: .46 },
  ];
  return route.map((site, index) => ({ index, x: pathX(site.z) + site.side * (4.5 + (index % 2) * .35), z: site.z, scale: site.scale, strength: site.strength, arm: .92, lampHeight: 3.29 }));
}

/**
 * Warm, staggered pools of light; their exact positions drive every surface shader. In a painted set
 * the lanterns themselves are in the painting: the grove keeps only their living part (the light, the
 * breathing halo, the motes).
 */
export class LanternGrove {
  readonly group = new THREE.Group();
  readonly lanterns: LanternUniform = createLanternUniform();
  private readonly art = new ArtResources();
  private readonly motes: THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial>;
  private readonly lamps: Lamp[]=[];
  private readonly seeds=seededRandom(0x1a7e42);
  private readonly time={value:0};
  private disposed=false;

  constructor(painted = false){
    this.group.name='Lanterns along the Hushwood path';
    for (const site of lanternSites()) this.buildLantern(site.x, site.z, site.scale, site.strength, site.index, painted);
    const count=160,positions=new Float32Array(count*3),seeds=new Float32Array(count*4);
    for(let i=0;i<count;i++){
      const lamp=this.lamps[Math.min(LANTERN_COUNT-1,Math.floor(i/(count/LANTERN_COUNT)))];
      const angle=this.seeds()*Math.PI*2,radius=.7+Math.sqrt(this.seeds())*4.5;
      const x=lamp.x+Math.cos(angle)*radius,z=lamp.z+Math.sin(angle)*radius;
      const y=terrainHeight(x,z)+.35+this.seeds()*(i<70?3.1:2.2);
      positions.set([x,y,z],i*3);
      seeds.set([this.seeds()*Math.PI*2,.68+this.seeds()*1.8,.8+this.seeds()*.9,i<80?1:.35],i*4);
    }
    const geometry=this.art.geometry(new THREE.BufferGeometry());
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('fireflySeed',new THREE.BufferAttribute(seeds,4));
    const material=this.art.material(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:this.time,motion:{value:1}},
      vertexShader:`uniform float time;uniform float motion;attribute vec4 fireflySeed;varying float alpha;varying float nearLamp;
        void main(){vec3 p=position;float turn=time*.12+fireflySeed.x;p.x+=sin(turn+fireflySeed.x)*.6*motion+cos(turn*.7+fireflySeed.x)*.2*motion;p.y+=sin(turn*1.2+fireflySeed.x)*.24*motion;p.z+=cos(turn*.8+fireflySeed.x)*.36*motion;
          float breathe=.22+.78*(.5+.5*sin(time*fireflySeed.y+fireflySeed.x*2.));vec4 mv=modelViewMatrix*vec4(p,1.);nearLamp=fireflySeed.w;alpha=breathe*(1.-smoothstep(26.,72.,-mv.z));gl_PointSize=clamp(fireflySeed.z*75./max(1.,-mv.z),1.,7.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:`varying float alpha;varying float nearLamp;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float core=exp(-r*r*10.);vec3 tint=mix(vec3(.75,.82,.57),vec3(.98,.61,.23),nearLamp*.85);gl_FragColor=vec4(tint,core*alpha*.79);}`,
    }));
    this.motes=new THREE.Points(geometry,material);this.motes.frustumCulled=false;this.group.add(this.motes);
    this.update(0,true);
  }

  private buildLantern(x:number,z:number,scale:number,strength:number,index:number,painted:boolean):void{
    const base=terrainHeight(x,z),root=new THREE.Group();root.position.set(x,base,z);root.scale.setScalar(scale);this.group.add(root);
    const timber=this.art.paint('#564c3b',{roughness:.96});
    const bronze=this.art.paint('#756344',{roughness:.66,metalness:.12});
    const wick=this.art.paint('#f6cc83',{emissive:'#f5a145',emissiveIntensity:1.5});
    const make=(geometry:THREE.BufferGeometry,material:THREE.Material,px:number,py:number,pz:number)=>{
      const mesh=new THREE.Mesh(this.art.geometry(geometry),material);mesh.position.set(px,py,pz);mesh.castShadow=false;mesh.receiveShadow=true;mesh.visible=!painted;root.add(mesh);return mesh;
    };
    make(new THREE.CylinderGeometry(.14,.29,.27,10),timber,0,.1,0);
    make(sweptShape(vectors([[0,.12,0],[.04,1.15,0],[.11,2.7,0],[.16,4.14,0],[.13,4.61,0]]),[.15,.12,.09,.075,.055],10,20),timber,0,0,0);
    make(sweptShape(vectors([[.07,4.12,0],[.36,4.28,0],[.8,4.27,0],[1.1,4.08,0]]),[.085,.073,.056,.03],8,11),timber,0,0,0);
    const ox=.92;
    make(new THREE.CylinderGeometry(.014,.014,.37,6),bronze,ox,3.87,0);
    const roof=make(new THREE.ConeGeometry(.39,.29,9),bronze,ox,3.78,0);roof.rotation.z=Math.PI;
    const glass=make(new THREE.BoxGeometry(.48,.68,.41),this.art.material(wick.clone()),ox,3.3,0);
    const pane=glass.material as THREE.MeshStandardMaterial;pane.transparent=true;pane.opacity=.28;pane.depthWrite=false;
    const bulb=make(new THREE.SphereGeometry(.13,12,9),this.art.material(wick.clone()),ox,3.29,.015);
    (bulb.material as THREE.MeshStandardMaterial).emissiveIntensity=2;
    for(const side of [-1,1])for(const depth of [-1,1]){
      const frame=make(new THREE.BoxGeometry(.025,.75,.025),bronze,ox+side*.24,3.31,depth*.2);frame.rotation.z=.03*side;
    }
    const light=index<2?new THREE.PointLight('#eaba6e',index===0?5:2.8,index===0?9.5:8.2,2.2):null;
    if(light){light.position.set(ox,3.29,0);light.castShadow=false;root.add(light);}
    // A soft halo around the flame; bloom and the flicker below make it breathe.
    const halo=glowSprite('#f5b25e',2.2,undefined,.45);halo.position.set(ox,3.29,0);halo.renderOrder=3;root.add(halo);
    this.lamps.push({root,light,halo,x,z,height:3.29*scale,strength,phase:index*.71});
  }

  update(dt:number,reducedMotion:boolean):void {
    if(!reducedMotion)this.time.value+=dt;
    this.motes.material.uniforms.motion.value=reducedMotion?0:1;
    this.lamps.forEach((lamp,index)=>{
      const t=this.time.value;
      // Layered flicker: a slow breath, a quicker waver, and an occasional gutter.
      const gutter=Math.max(0,Math.sin(t*.37+lamp.phase*3.1))**24*.18;
      const flicker=reducedMotion?1:.95+.035*Math.sin(t*2.2+lamp.phase)+.02*Math.sin(t*5.3+index)+.012*Math.sin(t*11.7+lamp.phase*2)-gutter;
      lamp.halo.material.opacity=.38*flicker*lamp.strength;lamp.halo.scale.setScalar(2.1+flicker*.25);
      const uniform=this.lanterns.value[index];uniform.set(lamp.x+.92*lamp.root.scale.x,terrainHeight(lamp.x,lamp.z)+lamp.height,lamp.z,lamp.strength*flicker);
      if(lamp.light)lamp.light.intensity=(index===0?5:2.8)*flicker;
    });
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.group.removeFromParent();this.art.dispose();for(const lamp of this.lamps){lamp.light?.dispose();lamp.halo.material.dispose();}}
}
