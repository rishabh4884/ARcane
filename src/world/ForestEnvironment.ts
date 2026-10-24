import * as THREE from 'three';
import { Illustration, billboardMaterial } from './Illustration.ts';
import { VolumetricFog } from './VolumetricFog.ts';
import { GrassField } from './GrassField.ts';
import { ArtResources } from './storybook.ts';
import { forestLayout, intersectObstacle, intersectTerrain, pathX, seededRandom, terrainHeight, type Obstacle } from './spatial.ts';

interface Cutout { mesh: THREE.InstancedMesh; sites: Array<{x:number; y:number; z:number; width:number; height:number}>; sorted: number[] }

/** Illustrated scenery arranged in a navigable volume: 2.5D artwork, not a polygon diorama. */
export class ForestEnvironment {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  private readonly art = new ArtResources();
  private readonly illustration = new Illustration();
  private readonly random = seededRandom(94187);
  private readonly time = { value: 0 };
  private readonly motion = { value: 1 };
  private readonly dummy = new THREE.Object3D();
  private readonly cutouts: Cutout[] = [];
  private readonly sky: THREE.Mesh;
  private readonly grass:GrassField;
  private readonly fog:VolumetricFog;
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = 'The Hushwood — an illustrated world';
    scene.background = new THREE.Color('#10171a');
    scene.fog = new THREE.FogExp2('#222b29', 0.023);
    scene.add(this.group);
    const ambient = new THREE.HemisphereLight('#a9b9b2', '#25312e', 1.85);
    const sun = new THREE.DirectionalLight('#e9c99b', 1.0); sun.position.set(-20,32,-35);
    this.group.add(ambient,sun);
    this.sky = this.makeSky();
    this.makeCarpet(); this.makeTrees(); this.makeRocks(); this.makeLandmarks(); this.makeAtmosphere();
    this.fog=new VolumetricFog();this.group.add(this.fog.group);
    this.grass=new GrassField(this.obstacles);this.group.add(this.grass.group);
  }

  private cutout(map: THREE.Texture, sites: Cutout['sites'], tint = '#ffffff', sway = 0.035): THREE.InstancedMesh {
    const geometry = this.art.geometry(new THREE.PlaneGeometry(1,1,1,5)); geometry.translate(0,0.5,0);
    const material = this.art.material(billboardMaterial(map,this.time,this.motion,sway)); material.color.set(tint);
    if(map.name.startsWith('tree-')){
      material.transparent=false;material.depthWrite=true;material.alphaTest=0.3;
      const slopeData:number[]=[];
      for(const site of sites){const sx=(terrainHeight(site.x+.1,site.z)-terrainHeight(site.x-.1,site.z))/.2;slopeData.push(sx);}
      geometry.setAttribute('rootSlope',new THREE.InstancedBufferAttribute(new Float32Array(slopeData),1));
      const original=material.onBeforeCompile;
      material.onBeforeCompile=(shader,renderer)=>{
        original.call(material,shader,renderer);
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float rootSlope;');
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          #ifdef USE_INSTANCING
            transformed.y+=position.x*instanceMatrix[0].x/max(0.001,instanceMatrix[1].y)*rootSlope*(1.0-smoothstep(0.0,0.14,uv.y));
          #endif`);
      };
      material.customProgramCacheKey=()=>`rooted-illustration-${sway}`;
    }
    const mesh = new THREE.InstancedMesh(geometry,material,sites.length);
    mesh.frustumCulled = false;
    // Scenery has a fixed world orientation. No camera-facing rotation or per-frame sorting.
    sites.forEach((site,i)=>{this.dummy.position.set(site.x,site.y,site.z);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(site.width,site.height,1);this.dummy.updateMatrix();mesh.setMatrixAt(i,this.dummy.matrix);});
    mesh.instanceMatrix.needsUpdate=true;this.group.add(mesh);
    return mesh;
  }

  private makeSky(): THREE.Mesh {
    const material = this.art.material(new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,
      vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`varying vec3 direction;void main(){vec3 d=normalize(direction);
        float opening=pow(max(0.0,dot(d,normalize(vec3(-0.25,0.035,-0.96)))),9.0);
        vec3 c=mix(vec3(.105,.145,.15),vec3(.025,.041,.05),smoothstep(-.08,.85,d.y));
        c=mix(c,vec3(.15,.15,.12),opening*.07);
        c*=mix(.72,1.0,smoothstep(-.12,.42,d.y));
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }));
    const sky=new THREE.Mesh(this.art.geometry(new THREE.SphereGeometry(170,32,20)),material);
    sky.frustumCulled=false;sky.renderOrder=-10;this.group.add(sky);return sky;
  }

  private makeCarpet():void {
    // Soil provides a quiet base; all visible grass above it is actual curved geometry.
    const geometry=this.art.geometry(new THREE.PlaneGeometry(216,216,144,144));geometry.rotateX(-Math.PI/2);
    const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3);
    const dark=new THREE.Color('#234d37'),moss=new THREE.Color('#456443'),soil=new THREE.Color('#7c7d59');
    const color=new THREE.Color();
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i);p.setY(i,terrainHeight(x,z));
      const patch=(Math.sin(x*.11+z*.035)*Math.cos(z*.13)+1)*.5;
      const path=1-THREE.MathUtils.smoothstep(Math.abs(x-pathX(z)),1.2,2.7);
      color.copy(dark).lerp(moss,patch*.55).lerp(soil,path*.58);color.toArray(colors,i*3);
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();
    const ground=this.art.material(new THREE.MeshBasicMaterial({vertexColors:true,fog:true}));ground.toneMapped=false;
    const field=new THREE.Mesh(geometry,ground);this.group.add(field);
  }

  private makeTrees():void {
    const layout=forestLayout();
    for(let variant=0;variant<4;variant++){
      const sites:Cutout['sites']=[];
      for(let i=variant;i<layout.length;i+=4){
        const tree=layout[i],height=25*tree.scale;
        // The painted roots finish ~3% above the artwork edge: bury that transparent margin.
        // Flatten a small real soil shelf under each trunk so it cannot hang over a slope.
        const y=terrainHeight(tree.x,tree.z)-height*0.032-0.04;
        sites.push({x:tree.x,y,z:tree.z,width:height*0.5,height});
        this.obstacles.push({...tree,radius:tree.scale*0.66,height:height*0.9});
      }
      this.cutout(this.illustration.tree(variant),sites,'#ffffff',0.035);
    }
    // Far trunks are still placed at different distances, not painted into a fixed sky.
    const distant:Cutout['sites']=[];
    for(let i=0;i<48;i++){
      const a=i/48*Math.PI*2,r=89+this.random()*16,x=Math.sin(a)*r,z=Math.cos(a)*r,height=37+this.random()*20;
      distant.push({x,y:terrainHeight(x,z)-height*.032-.04,z,width:height*0.43,height});
    }
    this.cutout(this.illustration.tree(1),distant,'#bdcfc2',0.018);
  }

  private makeRocks():void {
    const stones:Cutout['sites']=[];
    for(let i=0;i<35;i++){
      let x=(this.random()-.5)*140,z=(this.random()-.5)*140;
      if(Math.abs(x-pathX(z))<5||Math.hypot(x,z+12)<11){x+=15;z-=5;}
      const width=1.5+this.random()*3,height=width*0.65;
      stones.push({x,y:terrainHeight(x,z)-0.1,z,width,height});this.obstacles.push({x,z,radius:width*0.3,height:height*0.8});
    }
    this.cutout(this.illustration.rock(),stones,'#ffffff',0);
  }

  private inWater(x:number,z:number):boolean{return((x-25)/7.6)**2+((z+15)/4.5)**2<1.2;}
  private makeLandmarks():void {
    const gateMap=this.illustration.texture('forgotten-gate',1024,1024,ctx=>{
      const stone=ctx.createLinearGradient(150,100,800,900);stone.addColorStop(0,'#8c9e86');stone.addColorStop(0.45,'#496f61');stone.addColorStop(1,'#234c48');
      const arch=new Path2D('M 175 1000 L 220 395 C 239 84 786 78 808 397 L 857 1000 L 715 1000 L 689 411 C 681 221 352 218 342 413 L 314 1000 Z');
      ctx.fillStyle=stone;ctx.fill(arch);
      ctx.strokeStyle='#345b50';ctx.lineWidth=8;
      for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(210,430+i*90);ctx.lineTo(326,440+i*91);ctx.stroke();ctx.beginPath();ctx.moveTo(701,434+i*90);ctx.lineTo(824,428+i*92);ctx.stroke();}
      ctx.strokeStyle='#789477';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(266,982);ctx.lineTo(282,403);ctx.bezierCurveTo(290,137,751,148,756,407);ctx.stroke();
      ctx.fillStyle='#355d46';for(let i=0;i<60;i++){const a=this.random()*Math.PI,x=512+Math.cos(a)*300,y=390-Math.sin(a)*220;ctx.beginPath();ctx.ellipse(x,y,13+this.random()*20,5+this.random()*6,-a,0,Math.PI*2);ctx.fill();}
    });
    this.cutout(gateMap,[{x:-25,y:terrainHeight(-25,-30)-0.1,z:-30,width:8,height:8}],'#ffffff',0);
    this.obstacles.push({x:-28,z:-30,radius:0.8,height:5},{x:-22,z:-30,radius:0.8,height:5});
    const waterY=terrainHeight(25,-15)+0.04;
    const geometry=this.art.geometry(new THREE.CircleGeometry(7.6,64));geometry.rotateX(-Math.PI/2);geometry.scale(1,1,0.6);
    const material=this.art.material(new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{time:this.time,motion:this.motion},
      vertexShader:'varying vec2 p;varying float depth;void main(){p=uv;vec4 mv=modelViewMatrix*vec4(position,1.0);depth=-mv.z;gl_Position=projectionMatrix*mv;}',
      fragmentShader:`varying vec2 p;varying float depth;uniform float time;uniform float motion;void main(){vec2 uv=(p-.5)*16.;
        float ripple=sin(length(uv)*7.-time*.8*motion+sin(uv.x)*.3);
        vec3 c=mix(vec3(.12,.32,.34),vec3(.42,.62,.55),smoothstep(.8,1.,ripple)*.35);
        c+=pow(max(0.,sin(uv.x*8.+uv.y*3.+time*.6*motion)),30.)*vec3(.12,.12,.06);
        c=mix(c,vec3(.40,.57,.55),1.-exp(-depth*depth*.00032));
        gl_FragColor=vec4(c,.96);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }));
    const water=new THREE.Mesh(geometry,material);water.position.set(25,waterY,-15);this.group.add(water);this.obstacles.push({x:25,z:-15,radius:7.8,height:0.5});
  }

  private makeAtmosphere():void {
    const positions:number[]=[],seed:number[]=[];
    for(let i=0;i<420;i++){const x=(this.random()-.5)*130,z=(this.random()-.5)*130;positions.push(x,terrainHeight(x,z)+.7+this.random()*8,z);seed.push(this.random()*100);}
    const geometry=this.art.geometry(new THREE.BufferGeometry());
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seed,1));
    const material=this.art.material(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{time:this.time,motion:this.motion},
      vertexShader:`uniform float time;uniform float motion;attribute float seed;varying float alpha;varying float fogDepth;void main(){vec3 p=position;p.x+=sin(time*.24+seed)*.7*motion;p.y+=sin(time*.5+seed)*.3*motion;vec4 mv=modelViewMatrix*vec4(p,1.);fogDepth=-mv.z;alpha=(.35+.65*pow(sin(time*.6+seed)*.5+.5,2.))*(1.-smoothstep(12.,60.,-mv.z));gl_PointSize=clamp(70./max(1.,-mv.z),1.,6.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:'varying float alpha;varying float fogDepth;void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float fade=1.-smoothstep(36.,88.,fogDepth);gl_FragColor=vec4(.98,.84,.48,pow(1.-d,2.)*alpha*fade*.62);}'
    }));
    const points=new THREE.Points(geometry,material);points.frustumCulled=false;this.group.add(points);
    const mistMap=this.illustration.texture('mist',256,128,ctx=>{
      const g=ctx.createRadialGradient(128,64,0,128,64,128);g.addColorStop(0,'rgba(203,227,212,0.28)');g.addColorStop(1,'rgba(203,227,212,0)');ctx.fillStyle=g;ctx.scale(1,0.5);ctx.fillRect(0,0,256,256);
    });
    const mistMat=this.art.material(new THREE.MeshBasicMaterial({map:mistMap,color:'#728483',transparent:true,opacity:0.12,depthWrite:false,side:THREE.DoubleSide}));
    const mistGeo=this.art.geometry(new THREE.PlaneGeometry(24,5));
    for(let i=0;i<12;i++){const x=(this.random()-.5)*110,z=-13-this.random()*73;const mist=new THREE.Mesh(mistGeo,mistMat);mist.position.set(x,terrainHeight(x,z)+1.5,z);this.group.add(mist);}
  }

  intersect(ray:THREE.Ray,range:number):number|null {
    let nearest=intersectTerrain(ray,range);
    for(const obstacle of this.obstacles){const d=intersectObstacle(ray,obstacle,nearest??range);if(d!==null&&(nearest===null||d<nearest))nearest=d;}return nearest;
  }
  update(dt:number,camera:THREE.Camera,reducedMotion:boolean):void {this.motion.value=reducedMotion?0:1;if(!reducedMotion)this.time.value+=dt;this.sky.position.copy(camera.position);this.grass.update(dt,camera,reducedMotion);this.fog.update(dt,camera,reducedMotion);}
  dispose():void {if(this.disposed)return;this.disposed=true;this.fog.dispose();this.grass.dispose();this.scene.remove(this.group);this.art.dispose();this.illustration.dispose();}
}
