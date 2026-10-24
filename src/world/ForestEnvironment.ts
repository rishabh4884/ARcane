import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { forestLayout, intersectObstacle, intersectTerrain, pathX, seededRandom, terrainHeight, type Obstacle } from './spatial.ts';

/** A finite, living woodland. Everything is world-space geometry, not a backdrop. */
export class ForestEnvironment {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  private readonly time = { value: 0 };
  private readonly motion = { value: 1 };
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly random = seededRandom(0xf0e57);
  private readonly dummy = new THREE.Object3D();
  private disposed = false;
  private readonly sky: THREE.Mesh;
  private readonly mist: THREE.Mesh[] = [];

  constructor(private readonly scene: THREE.Scene) {
    this.group.name = 'Verdant Reach — living forest';
    scene.background = new THREE.Color('#83bdb5');
    scene.fog = new THREE.FogExp2('#86bcb3', 0.017);
    scene.add(this.group);
    const ambient = new THREE.HemisphereLight('#c8f5e7', '#254b49', 2.2);
    const sun = new THREE.DirectionalLight('#ffe0a0', 3.5);
    sun.position.set(-24, 38, -40);
    sun.target.position.set(0, 0, -10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 110 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.13;
    const rim = new THREE.DirectionalLight('#9bcaff', 1.1);
    rim.position.set(18, 9, 15);
    this.group.add(ambient, sun, sun.target, rim);
    this.sky = this.buildSky();
    this.buildGround();
    this.buildTrees();
    this.buildUnderstory();
    this.buildLandmarks();
    this.buildAtmosphere();
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  private material<T extends THREE.Material>(material: T): T { this.materials.add(material); return material; }

  private standard(color: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    return this.material(new THREE.MeshStandardMaterial({ color, roughness: 0.95, ...extra }));
  }

  /** Instance offsets give each crown a distinct breeze, without CPU matrix churn. */
  private wind(material: THREE.MeshStandardMaterial, amount: number): void {
    const detail = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      detail.call(material, shader, renderer);
      shader.uniforms.forestTime = this.time;
      shader.uniforms.forestMotion = this.motion;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        uniform float forestTime;
        uniform float forestMotion;`);
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 anchor = instanceMatrix[3].xyz;
          float breeze = sin(forestTime * 0.9 + anchor.x * 0.27 + anchor.z * 0.17);
          transformed.x += breeze * ${amount.toFixed(3)} * forestMotion * max(0.0, position.y + 0.25);
          transformed.z += cos(forestTime * 0.65 + anchor.z * 0.3) * ${ (amount * 0.45).toFixed(3) } * forestMotion * max(0.0, position.y);
        #endif`);
    };
    material.customProgramCacheKey = () => `forest-wind-${amount}`;
  }

  private instance(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, shadow = false): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotation = 0): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, rotation, 0);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private branch(mesh: THREE.InstancedMesh, index: number, from: THREE.Vector3, to: THREE.Vector3, radius: number): void {
    this.dummy.position.copy(from).add(to).multiplyScalar(0.5);
    this.dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    this.dummy.scale.set(radius, from.distanceTo(to), radius);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private buildSky(): THREE.Mesh {
    const material = this.material(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { time: this.time },
      vertexShader: `varying vec3 vDirection;
        void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec3 vDirection; uniform float time;
        void main() {
          vec3 d = normalize(vDirection);
          float h = smoothstep(-0.1, 0.85, d.y);
          vec3 color = mix(vec3(0.64,0.80,0.71), vec3(0.13,0.46,0.58), h);
          vec3 sun = normalize(vec3(-0.42,0.64,-0.67));
          float light = max(0.0, dot(d,sun));
          color += vec3(0.48,0.31,0.1) * pow(light, 12.0);
          color += vec3(0.7,0.57,0.25) * pow(light, 450.0);
          float cloud = sin(d.x * 15.0 + d.z * 9.0 + time * 0.009) * sin(d.z * 23.0 - d.y * 20.0);
          color = mix(color, vec3(0.87,0.9,0.77), smoothstep(0.35,0.9,cloud) * smoothstep(0.0,0.3,d.y) * 0.3);
          gl_FragColor = vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    const sky = new THREE.Mesh(this.geometry(new THREE.SphereGeometry(155, 32, 20)), material);
    sky.renderOrder = -5;
    sky.frustumCulled = false;
    this.group.add(sky);
    return sky;
  }

  private buildGround(): void {
    const geometry = this.geometry(new THREE.PlaneGeometry(220, 220, 220, 220));
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    const moss = new THREE.Color('#456c3c'), trail = new THREE.Color('#8c9265'), shade = new THREE.Color('#22574b');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      positions.setY(i, terrainHeight(x, z));
      const path = 1 - THREE.MathUtils.smoothstep(Math.abs(x - pathX(z)), 1.8, 4.2);
      const noise = Math.sin(x * 0.31 + Math.cos(z * 0.23) * 2) * Math.sin(z * 0.39) * 0.5 + 0.5;
      color.copy(shade).lerp(moss, noise).lerp(trail, path * 0.8);
      color.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const ground = new THREE.Mesh(geometry, this.standard('#ffffff', { vertexColors: true }));
    ground.name = 'Continuous sampled terrain';
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  private buildTrees(): void {
    const sites = forestLayout();
    this.obstacles.push(...sites);
    // Tapered, gently crooked trunks, with a pronounced flared root collar.
    const trunkGeometry = this.geometry(new THREE.CylinderGeometry(0.24, 0.76, 14, 9, 7));
    const positions = trunkGeometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i), t = (y + 7) / 14;
      const flare = 1 + Math.pow(1 - t, 10) * 0.65;
      positions.setXYZ(i, positions.getX(i) * flare + Math.sin(t * 2.7) * 0.48, y + 7, positions.getZ(i) * flare + t * t * 0.48);
    }
    trunkGeometry.computeVertexNormals();
    const bark = this.standard('#385851', { flatShading: false });
    const trunks = this.instance(trunkGeometry, bark, sites.length, true);
    const branchGeo = this.geometry(new THREE.CylinderGeometry(0.24, 1, 1, 6));
    const branches = this.instance(branchGeo, bark, sites.length * 6, true);
    const canopyGeo = this.geometry(mergeVertices(new THREE.IcosahedronGeometry(1, 2)));
    const crownPositions = canopyGeo.getAttribute('position');
    for (let i = 0; i < crownPositions.count; i++) {
      const x = crownPositions.getX(i), y = crownPositions.getY(i), z = crownPositions.getZ(i);
      const shape = 1 + Math.sin(x * 8 + z * 6) * Math.cos(y * 9 - x * 5) * 0.12;
      crownPositions.setXYZ(i, x * shape, y * shape, z * shape);
    }
    canopyGeo.computeVertexNormals();
    // Irregular, broad interlocking crowns, rather than identical cone-shaped trees.
    const canopyMaterial = this.standard('#a7c98f', { flatShading: false, roughness: 1 });
    // Soft mottling reads like overlapping leaf masses instead of solid balloons.
    canopyMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 crownPoint;');
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ncrownPoint = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 crownPoint;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float leaves = sin(crownPoint.x * 38.0 + sin(crownPoint.z * 21.0)) * sin(crownPoint.y * 32.0 + crownPoint.z * 27.0);
        diffuseColor.rgb *= 0.87 + smoothstep(-0.6,0.6,leaves) * 0.24;`);
    };
    this.wind(canopyMaterial, 0.07);
    const crowns = this.instance(canopyGeo, canopyMaterial, sites.length * 4, true);
    const tint = new THREE.Color();
    sites.forEach((site, index) => {
      const { x, z, scale: s, phase } = site;
      const y = terrainHeight(x, z);
      this.place(trunks, index, x, y, z, s, s, s, phase);
      trunks.setColorAt(index, tint.setHSL(0.43 + this.random() * 0.025, 0.19, 0.28 + this.random() * 0.1));
      for (let j = 0; j < 6; j++) {
        const angle = phase + j * 2.39;
        const root = j < 3;
        const from = new THREE.Vector3(x, y + (root ? 0.8 : 7 + j * 0.65) * s, z);
        const to = new THREE.Vector3(x + Math.cos(angle) * (root ? 2.3 : 3.5) * s, y + (root ? 0.06 : 12 + j * 0.2) * s, z + Math.sin(angle) * (root ? 2.3 : 3.5) * s);
        this.branch(branches, index * 6 + j, from, to, (root ? 0.4 : 0.33) * s);
      }
      for (let j = 0; j < 4; j++) {
        const angle = phase + j * 2.4;
        this.place(crowns, index * 4 + j, x + Math.cos(angle) * s * 2.6, y + (12.5 + (j % 2) * 1.7) * s, z + Math.sin(angle) * s * 2.6,
          s * (3.4 + this.random()), s * (1.8 + this.random()), s * (3.4 + this.random()), angle);
        crowns.setColorAt(index * 4 + j, tint.setHSL(0.21 + this.random() * 0.12, 0.38 + this.random() * 0.15, 0.34 + this.random() * 0.16));
      }
    });
  }

  private buildUnderstory(): void {
    const bladeGeo = this.geometry(new THREE.BufferGeometry());
    const blades: number[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4;
      const x = Math.cos(angle), z = Math.sin(angle), h = 0.5 + (i % 3) * 0.2;
      const width = 0.042;
      const baseX = x * 0.1, baseZ = z * 0.1;
      const tipX = x * 0.24, tipZ = z * 0.24;
      blades.push(baseX - z * width, 0, baseZ + x * width, baseX + z * width, 0, baseZ - x * width, tipX, h, tipZ);
    }
    bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
    bladeGeo.computeVertexNormals();
    const grassMat = this.standard('#b3c391', { side: THREE.DoubleSide });
    this.wind(grassMat, 0.25);
    const grass = this.instance(bladeGeo, grassMat, 14500);
    const color = new THREE.Color();
    let used = 0;
    for (let i = 0; i < 24000 && used < grass.count; i++) {
      const x = (this.random() - 0.5) * 166, z = (this.random() - 0.5) * 166;
      if (Math.abs(x - pathX(z)) < 2.1 || Math.hypot(x, z + 12) < 6.6 || this.inPond(x, z)) continue;
      const size = 0.35 + this.random() * 0.65;
      this.place(grass, used, x, terrainHeight(x, z) - 0.02, z, size * 1.1, size * (0.65 + this.random() * 0.45), size * 1.1, this.random() * 6.28);
      grass.setColorAt(used++, color.setHSL(0.22 + this.random() * 0.13, 0.38, 0.38 + this.random() * 0.18));
    }
    grass.count = used;

    const rockGeo = this.geometry(new THREE.DodecahedronGeometry(1, 0));
    const rocks = this.instance(rockGeo, this.standard('#677d74', { flatShading: true }), 95, true);
    for (let i = 0; i < rocks.count; i++) {
      let x = (this.random() - 0.5) * 147, z = (this.random() - 0.5) * 147;
      if (Math.abs(x - pathX(z)) < 3 || Math.hypot(x, z + 12) < 10) { x += 12; z -= 8; }
      const s = 0.4 + this.random() * 1.6;
      this.place(rocks, i, x, terrainHeight(x, z) + s * 0.3, z, s, s * 0.7, s * 0.9, this.random() * 6.28);
      this.obstacles.push({ x, z, radius: s * 0.85, height: s * 1.1 });
    }
    // Small luminous wildflowers — a limited violet accent, not neon everywhere.
    const flowers = this.instance(this.geometry(new THREE.IcosahedronGeometry(0.12)), this.standard('#c4b4eb', { emissive: '#57457a', emissiveIntensity: 0.5 }), 380);
    for (let i = 0; i < flowers.count; i++) {
      const z = (this.random() - 0.5) * 105;
      const x = pathX(z) + (this.random() < 0.5 ? -1 : 1) * (3.2 + this.random() * 5);
      this.place(flowers, i, x, terrainHeight(x, z) + 0.12 + this.random() * 0.12, z, 0.5, 0.45, 0.5);
    }
  }

  private inPond(x: number, z: number): boolean { return ((x - 25) / 8) ** 2 + ((z + 13) / 5.5) ** 2 < 1.2; }

  private buildLandmarks(): void {
    const stone = this.standard('#728981', { flatShading: true });
    // An ancient arch makes a destination beyond the first clearing.
    const arch = new THREE.Group();
    arch.name = 'The Old Gate';
    arch.position.set(-25, terrainHeight(-25, -30), -30);
    arch.rotation.y = -0.38;
    const block = this.geometry(new THREE.BoxGeometry(1.25, 1.15, 1.5));
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(block, stone);
      mesh.position.set(side * 2.2, 0.58 + i * 1.08, 0);
      mesh.rotation.y = this.random() * 0.12;
      mesh.castShadow = true; mesh.receiveShadow = true;
      arch.add(mesh);
    }
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => {
      const a = i / 12 * Math.PI;
      return new THREE.Vector3(Math.cos(a) * 2.2, 3.9 + Math.sin(a) * 2.1, 0);
    }));
    const top = new THREE.Mesh(this.geometry(new THREE.TubeGeometry(curve, 18, 0.66, 5, false)), stone);
    top.castShadow = true; arch.add(top);
    this.group.add(arch);
    this.obstacles.push({ x: -27, z: -30, radius: 0.9, height: 5 }, { x: -23, z: -30, radius: 0.9, height: 5 });
    const runeMat = this.material(new THREE.MeshBasicMaterial({ color: '#b8e9bb' }));
    const rune = new THREE.Mesh(this.geometry(new THREE.TorusGeometry(0.45, 0.035, 5, 32)), runeMat);
    rune.position.set(0, 5.3, 0.68); arch.add(rune);

    // A rippling pool on a raised stone basin: the solid basin defines the waterline.
    const waterY = terrainHeight(25, -13) + 0.38;
    const basin = new THREE.Mesh(this.geometry(new THREE.CylinderGeometry(8.3, 8.7, 0.65, 48)), stone);
    basin.position.set(25, waterY - 0.4, -13); basin.scale.z = 0.68;
    basin.receiveShadow = true; this.group.add(basin);
    const water = new THREE.Mesh(this.geometry(new THREE.CircleGeometry(7.9, 64)), this.material(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: this.time, motion: this.motion },
      vertexShader: `varying vec2 vUv; varying float vDepth;
        void main(){vUv=uv; vec4 p=modelViewMatrix*vec4(position,1.0); vDepth=-p.z; gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec2 vUv; varying float vDepth; uniform float time; uniform float motion;
        void main(){ vec2 p=(vUv-0.5)*20.0;
          float ripple=sin(length(p)*8.0-time*1.5*motion + sin(p.x*2.0)*0.4)*0.5+0.5;
          float glint=pow(max(0.0,sin(p.x*9.0+p.y*4.0+time*motion)*sin(p.y*12.0-time*0.5*motion)),12.0);
          vec3 color=mix(vec3(0.045,0.32,0.32),vec3(0.23,0.66,0.56),ripple*0.4)+glint*vec3(0.6,0.7,0.4);
          color=mix(color,vec3(0.38,0.58,0.52),1.0-exp(-0.000289*vDepth*vDepth));
          gl_FragColor=vec4(color,0.93);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })));
    water.rotation.x = -Math.PI / 2; water.scale.y = 0.68;
    water.position.set(25, waterY, -13); this.group.add(water);
    this.obstacles.push({ x: 25, z: -13, radius: 8.2, height: 1 });
    // Upright glowing stones mark the pool and supply a visual waypoint.
    const crystalMat = this.standard('#8adac2', { emissive: '#2f8f7a', emissiveIntensity: 0.65, flatShading: true });
    const crystalGeo = this.geometry(new THREE.ConeGeometry(0.45, 2.5, 5));
    for (let i = 0; i < 5; i++) {
      const a = i * 0.65 + 2.2, x = 25 + Math.cos(a) * 9, z = -13 + Math.sin(a) * 6;
      const mesh = new THREE.Mesh(crystalGeo, crystalMat);
      mesh.position.set(x, terrainHeight(x, z) + 1, z); mesh.rotation.z = Math.sin(a) * 0.18;
      mesh.castShadow = true; this.group.add(mesh);
    }
  }

  private buildAtmosphere(): void {
    const count = 480;
    const positions = new Float32Array(count * 3), seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const x = (this.random() - 0.5) * 130, z = (this.random() - 0.5) * 130;
      positions.set([x, terrainHeight(x, z) + 0.6 + this.random() * 10, z], i * 3);
      seeds[i] = this.random() * 100;
    }
    const geometry = this.geometry(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
    const material = this.material(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: this.time, motion: this.motion },
      vertexShader: `uniform float time; uniform float motion; attribute float seed; varying float vAlpha; varying float vDepth;
        void main(){vec3 p=position;
          p.x+=sin(time*0.28+seed)*0.75*motion; p.y+=sin(time*0.55+seed*2.0)*0.4*motion;
          vec4 mv=modelViewMatrix*vec4(p,1.0); vDepth=-mv.z;
          vAlpha=(0.45+0.55*pow(sin(time*0.8+seed)*0.5+0.5,2.0))*smoothstep(70.0,7.0,vDepth);
          gl_Position=projectionMatrix*mv; gl_PointSize=clamp(85.0/max(1.0,vDepth),1.0,7.0);}`,
      fragmentShader: `varying float vAlpha; varying float vDepth;
        void main(){float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0) discard;
          gl_FragColor=vec4(0.95,0.91,0.52,pow(1.0-d,2.0)*vAlpha*0.7);}`,
    }));
    const motes = new THREE.Points(geometry, material);
    motes.frustumCulled = false; this.group.add(motes);

    // A few soft, tapering shafts are actual 3D volumes between the crowns.
    const shaftMat = this.material(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying float vHeight; varying float vFacing; varying float vDistance;
        void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0);
          vHeight=uv.y; vDistance=-mv.z;
          vFacing=abs(dot(normalize(normalMatrix*normal),normalize(-mv.xyz)));
          gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vHeight; varying float vFacing; varying float vDistance;
        void main(){ float edge=pow(max(0.0,1.0-vFacing),2.0);
          float fade=sin(vHeight*3.14159)*smoothstep(75.0,15.0,vDistance);
          gl_FragColor=vec4(0.84,0.87,0.48,edge*fade*0.026); }`,
    }));
    const shaftGeo = this.geometry(new THREE.CylinderGeometry(0.5, 2.7, 25, 20, 1, true));
    for (const [x,z] of [[-9,-27], [7,-33], [-21,-46], [24,-38]]) {
      const shaft = new THREE.Mesh(shaftGeo, shaftMat);
      shaft.position.set(x, terrainHeight(x,z)+12.7,z); shaft.rotation.z = -0.28;
      this.group.add(shaft);
    }

    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(215,243,220,0.3)'); gradient.addColorStop(0.5, 'rgba(215,243,220,0.12)'); gradient.addColorStop(1, 'rgba(215,243,220,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas); this.textures.add(texture);
    const mistMat = this.material(new THREE.MeshBasicMaterial({ map: texture, color: '#c7e9cd', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    const mistGeo = this.geometry(new THREE.PlaneGeometry(22, 4));
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(mistGeo, mistMat);
      const x = (this.random() - 0.5) * 100, z = -18 - this.random() * 65;
      mesh.position.set(x, terrainHeight(x, z) + 1.5, z); mesh.userData.homeX = x;
      this.mist.push(mesh); this.group.add(mesh);
    }
  }

  intersect(ray: THREE.Ray, range: number): number | null {
    let nearest = intersectTerrain(ray, range);
    for (const obstacle of this.obstacles) {
      const distance = intersectObstacle(ray, obstacle, nearest ?? range);
      if (distance !== null && (nearest === null || distance < nearest)) nearest = distance;
    }
    return nearest;
  }

  update(dt: number, camera: THREE.Camera, reducedMotion: boolean): void {
    this.motion.value = reducedMotion ? 0 : 1;
    if (!reducedMotion) this.time.value += dt;
    this.sky.position.copy(camera.position);
    this.mist.forEach((mesh, i) => { mesh.position.x = mesh.userData.homeX + Math.sin(this.time.value * 0.045 + i) * 3; });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    this.group.traverse((object) => { if (object instanceof THREE.Light && 'shadow' in object) (object.shadow as THREE.LightShadow)?.dispose(); });
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
  }
}
