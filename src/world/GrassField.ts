import * as THREE from 'three';
import { makeGrassTile, grassLod, GRASS_TILE, type GrassLod, type GrassSite } from './grass-layout.ts';
import { seededRandom, terrainHeight, type Obstacle } from './spatial.ts';

/** Curved, tapered ribbons with a shallow ridge: actual blade silhouettes, never grass cards. */
export function makeGrassClump(blades:number,segments:number):THREE.BufferGeometry {
  const random=seededRandom(0x61ade),positions:number[]=[],normals:number[]=[],uv:number[]=[],roots:number[]=[],indices:number[]=[];
  for(let blade=0;blade<blades;blade++){
    const angle=blade*2.399+random()*0.6,rootAngle=random()*Math.PI*2,radius=0.04+random()*0.20;
    const rootX=Math.cos(rootAngle)*radius,rootZ=Math.sin(rootAngle)*radius;
    const height=0.24+random()*0.28,width=0.015+random()*0.014,bend=0.06+random()*0.13;
    const sideX=Math.cos(angle),sideZ=Math.sin(angle),forwardX=-sideZ,forwardZ=sideX;
    const start=positions.length/3;
    for(let step=0;step<=segments;step++){
      const t=step/segments;
      const tip=t*t*(0.62+0.38*t),y=height*(t-0.14*t*t),w=width*Math.pow(1-t,0.75);
      for(let side=0;side<3;side++){
        const across=side-1,ridge=side===1?0.011*Math.sin(t*Math.PI):0;
        positions.push(rootX+forwardX*(bend*tip+ridge)+sideX*w*across,y,rootZ+forwardZ*(bend*tip+ridge)+sideZ*w*across);
        // Rounded shading avoids black/white flat triangular facets at glancing angles.
        const normal=new THREE.Vector3(forwardX+sideX*across*0.42,0.35,forwardZ+sideZ*across*0.42).normalize();
        normals.push(normal.x,normal.y,normal.z);uv.push(side/2,t);roots.push(rootX,rootZ);
        if(step<segments&&side<2){const a=start+step*3+side,b=a+3;indices.push(a,a+1,b,b,a+1,b+1);}
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('bladeRoot',new THREE.Float32BufferAttribute(roots,2));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}

interface Tile { mesh:THREE.Mesh<THREE.InstancedBufferGeometry,THREE.ShaderMaterial>; lod:GrassLod; center:THREE.Vector3; sites:number }

export class GrassField {
  readonly group=new THREE.Group();
  private readonly geometries:Record<'near'|'middle'|'far',THREE.BufferGeometry>={near:makeGrassClump(10,5),middle:makeGrassClump(7,3),far:makeGrassClump(4,2)};
  private readonly tiles:Tile[]=[];
  private readonly material:THREE.ShaderMaterial;
  private readonly time={value:0};
  private readonly frustum=new THREE.Frustum();
  private readonly projection=new THREE.Matrix4();
  private readonly bounds=new THREE.Sphere();
  private disposed=false;

  constructor(obstacles:readonly Obstacle[]){
    this.group.name='Living geometry grass — curved individual blades';
    this.material=new THREE.ShaderMaterial({side:THREE.DoubleSide,fog:true,uniforms:{...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),grassTime:this.time},
      vertexShader:`
        attribute vec3 rootOffset; attribute vec4 grassParams; attribute vec3 grassGround;
        attribute vec2 bladeRoot;
        uniform float grassTime;
        varying float bladeHeight;varying float patchShade;varying vec3 bladeNormal;varying vec3 worldPoint;
        #include <fog_pars_vertex>
        void main(){
          float c=cos(grassParams.x),s=sin(grassParams.x);
          mat2 rotation=mat2(c,-s,s,c);
          vec2 local=rotation*(position.xz*grassParams.y);
          vec2 root=rotation*(bladeRoot*grassParams.y);
          vec3 p=vec3(local.x,position.y*grassParams.z,local.y);
          p.y+=dot(root,grassGround.xy);
          vec3 base=(modelMatrix*vec4(rootOffset,1.0)).xyz;
          float gust=sin(base.x*0.13+base.z*0.09-grassTime*0.8)*0.65+sin(base.x*0.31-base.z*0.21+grassTime*0.6)*0.35;
          float flutter=sin(grassTime*2.7+grassParams.w+position.y*4.0)*0.015;
          p.xz+=vec2(0.75,0.43)*(gust*0.13+flutter)*uv.y*uv.y*grassParams.z;
          vec2 n=rotation*normal.xz;
          bladeNormal=normalize(vec3(n.x,normal.y,n.y));
          bladeHeight=uv.y;patchShade=grassGround.z;
          worldPoint=base+p;
          vec4 mvPosition=viewMatrix*vec4(worldPoint,1.0);
          gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader:`
        varying float bladeHeight;varying float patchShade;varying vec3 bladeNormal;varying vec3 worldPoint;
        #include <fog_pars_fragment>
        void main(){
          vec3 normal=normalize(bladeNormal)*(gl_FrontFacing?1.0:-1.0);
          vec3 light=normalize(vec3(-0.45,0.8,-0.35));
          float diffuse=abs(dot(normal,light))*0.35+0.65;
          float tip=smoothstep(0.0,1.0,bladeHeight);
          vec3 rootColor=mix(vec3(0.019,0.067,0.039),vec3(0.028,0.092,0.049),patchShade);
          vec3 tipColor=mix(vec3(0.075,0.18,0.072),vec3(0.14,0.25,0.105),patchShade);
          vec3 color=mix(rootColor,tipColor,tip*0.9)*diffuse;
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    for(let tz=-11;tz<11;tz++)for(let tx=-11;tx<11;tx++){
      const x=(tx+0.5)*GRASS_TILE,z=(tz+0.5)*GRASS_TILE;
      if(Math.hypot(x,z)>88+GRASS_TILE)continue;
      const nearObstacles=obstacles.filter(o=>Math.abs(o.x-x)<GRASS_TILE+o.radius&&Math.abs(o.z-z)<GRASS_TILE+o.radius);
      const layout=makeGrassTile(tx,tz,nearObstacles);if(!layout.sites.length)continue;
      const geometry=this.makeInstances(layout.sites,x,z);
      const mesh=new THREE.Mesh(geometry,this.material);mesh.position.set(x,0,z);mesh.frustumCulled=false;mesh.visible=false;this.group.add(mesh);
      this.tiles.push({mesh,lod:'hidden',center:new THREE.Vector3(x,terrainHeight(x,z)+0.4,z),sites:layout.sites.length});
    }
  }
  private makeInstances(sites:GrassSite[],x:number,z:number):THREE.InstancedBufferGeometry {
    const geometry=new THREE.InstancedBufferGeometry(),offset:number[]=[],params:number[]=[],ground:number[]=[];
    for(const site of sites){offset.push(site.x-x,site.y,site.z-z);params.push(site.angle,site.scale,site.height,site.phase);ground.push(site.slopeX,site.slopeZ,site.shade);}
    geometry.setAttribute('rootOffset',new THREE.InstancedBufferAttribute(new Float32Array(offset),3));geometry.setAttribute('grassParams',new THREE.InstancedBufferAttribute(new Float32Array(params),4));geometry.setAttribute('grassGround',new THREE.InstancedBufferAttribute(new Float32Array(ground),3));
    geometry.instanceCount=sites.length;this.applyGeometry(geometry,'far');return geometry;
  }
  private applyGeometry(target:THREE.InstancedBufferGeometry,lod:'near'|'middle'|'far'):void {
    const source=this.geometries[lod];target.setIndex(source.index);
    for(const name of ['position','normal','uv','bladeRoot'])target.setAttribute(name,source.getAttribute(name));
  }
  update(dt:number,camera:THREE.Camera,reducedMotion:boolean):void {
    if(!reducedMotion)this.time.value+=Math.max(0,dt);
    this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.projection);
    for(const tile of this.tiles){
      const distance=Math.hypot(tile.center.x-camera.position.x,tile.center.z-camera.position.z),lod=grassLod(Math.max(0,distance-GRASS_TILE*0.5));
      this.bounds.center.copy(tile.center);this.bounds.radius=GRASS_TILE*0.85+2;
      tile.mesh.visible=lod!=='hidden'&&this.frustum.intersectsSphere(this.bounds);
      if(tile.mesh.visible&&lod!=='hidden'&&tile.lod!==lod){this.applyGeometry(tile.mesh.geometry,lod);tile.lod=lod;}
    }
  }
  dispose():void {if(this.disposed)return;this.disposed=true;this.tiles.forEach(tile=>tile.mesh.geometry.dispose());Object.values(this.geometries).forEach(geometry=>geometry.dispose());this.material.dispose();this.group.removeFromParent();}
}
