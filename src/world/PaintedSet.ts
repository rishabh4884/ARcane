import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SPELL_LIGHT_GLSL, SPELL_LIGHTS } from './LanternLighting.ts';
import { forestLayout } from './spatial.ts';
import { groundData, rockPlacements, treePlacements } from './woodlandLayout.ts';

/**
 * THE PAINTED SET
 * ───────────────
 * A place painted the way an animated series paints its backgrounds — composed through the game's own
 * camera and repainted stroke by stroke (art/set_build.py) — and stood up in the game by projecting the
 * painting from the camera it was painted from onto simple stand-ins for the ground, the trunks and the
 * stones. From the casting spot the wood looks exactly like the painting; creatures walk on the painted
 * ground and pass behind painted trunks because those trunks have depth; a shake of the camera keeps
 * the parallax true. Surfaces the painting never saw fall back to a plain painted tone, and the sky
 * beyond the painting's frame is the live sky behind it.
 */

interface SetMeta { position: number[]; lookAt: number[]; fov: number; aspect: number; near: number; far: number; width: number; height: number; depthMax: number }

type Surface = 'ground' | 'tree' | 'rock' | 'sky';

const BASE = `${import.meta.env.BASE_URL ?? '/'}art/sets/`;

function projectedMaterial(paint: THREE.Texture, depth: THREE.Texture, paintVP: THREE.Matrix4, paintCam: THREE.Vector3, depthMax: number, surface: Surface, fallback: THREE.Color, tint: { value: THREE.Color }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: { SKY: surface === 'sky' ? 1 : 0, SWAY: surface === 'tree' ? 1 : 0 },
    side: surface === 'sky' ? THREE.BackSide : THREE.FrontSide,
    depthWrite: surface !== 'sky',
    uniforms: {
      tPaint: { value: paint }, tDepth: { value: depth }, uPaintVP: { value: paintVP }, uPaintCam: { value: paintCam },
      uDepthMax: { value: depthMax }, uFallback: { value: fallback }, uTint: tint, uTime: { value: 0 }, ...SPELL_LIGHTS,
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vRestWorld;
      varying vec3 vNormalW;
      void main() {
        vec4 local = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          local = instanceMatrix * local;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 world = modelMatrix * local;
        vRestWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * n);
        #if SWAY
          // Crowns breathe in the wind; the painting rides on them, sampled where the leaves rest.
          float h = max(0.0, position.y - 5.0);
          world.xyz += vec3(sin(uTime * 0.7 + world.x * 0.15 + world.z * 0.1), 0.0, cos(uTime * 0.55 + world.z * 0.13)) * h * 0.0035;
        #endif
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tPaint; uniform sampler2D tDepth; uniform mat4 uPaintVP; uniform vec3 uPaintCam; uniform float uDepthMax; uniform vec3 uFallback; uniform vec3 uTint;
      varying vec3 vRestWorld;
      varying vec3 vNormalW;
      ${SPELL_LIGHT_GLSL}
      void main() {
        vec4 clip = uPaintVP * vec4(vRestWorld, 1.0);
        vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
        bool inside = clip.w > 0.0 && uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0;
        #if SKY
          // Beyond the painting's frame the live sky shows through.
          if (!inside) discard;
          vec3 col = texture2D(tPaint, uv).rgb * uTint;
        #else
          float seen = 0.0;
          if (inside) {
            vec2 dRG = texture2D(tDepth, uv).rg;
            float painted = (dRG.r * 255.0 * 256.0 + dRG.g * 255.0) / 65535.0 * uDepthMax;
            seen = step(distance(vRestWorld, uPaintCam), painted * 1.03 + 0.35);
          }
          // Unseen by the painting: a plain painted tone, lit from above.
          float shade = 0.6 + 0.4 * max(vNormalW.y, 0.0);
          vec3 col = mix(uFallback * shade, texture2D(tPaint, uv).rgb, seen) * uTint;
          col += col * spellIllumination(vRestWorld) * 1.2;
        #endif
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export class PaintedSet {
  readonly group = new THREE.Group();
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly textures: THREE.Texture[] = [];
  /** A region not yet painted borrows this painting, retinted. */
  private readonly tint = { value: new THREE.Color(1, 1, 1) };
  private time = 0;

  private constructor() { this.group.name = 'Painted set'; }

  /** Load a painted set by name, or null if it has not been built. */
  static async load(name: string): Promise<PaintedSet | null> {
    try {
      const [meta, paint, depth, proxies] = await Promise.all([
        fetch(`${BASE}${name}/meta.json`).then((r) => { if (!r.ok) throw new Error(`no set (${r.status})`); return r.json() as Promise<SetMeta>; }),
        new THREE.TextureLoader().loadAsync(`${BASE}${name}/paint.webp`),
        new THREE.TextureLoader().loadAsync(`${BASE}${name}/depth.png`),
        new GLTFLoader().loadAsync(`${BASE}${name}/proxies.glb`),
      ]);
      const set = new PaintedSet();
      set.build(meta, paint, depth, proxies.scene);
      return set;
    } catch (error) {
      console.info(`[arcane] painted set "${name}" is not available; the cut-out wood stands instead`, error);
      return null;
    }
  }

  private build(meta: SetMeta, paint: THREE.Texture, depth: THREE.Texture, proxies: THREE.Object3D): void {
    paint.colorSpace = THREE.SRGBColorSpace;
    paint.anisotropy = 8;
    paint.generateMipmaps = true;
    depth.colorSpace = THREE.NoColorSpace;
    depth.minFilter = THREE.NearestFilter; depth.magFilter = THREE.NearestFilter; depth.generateMipmaps = false;
    this.textures.push(paint, depth);
    const cam = new THREE.PerspectiveCamera(meta.fov, meta.aspect, meta.near, meta.far);
    cam.position.fromArray(meta.position);
    cam.lookAt(new THREE.Vector3().fromArray(meta.lookAt));
    cam.updateMatrixWorld(true);
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const make = (surface: Surface, fallback: string) => {
      const m = projectedMaterial(paint, depth, vp, cam.position.clone(), meta.depthMax, surface, new THREE.Color(fallback), this.tint);
      this.materials.push(m);
      return m;
    };
    const sites = forestLayout();
    // The ground: the very terrain the creatures walk on.
    const gd = groundData(sites);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(gd.positions, 3));
    g.setIndex(new THREE.BufferAttribute(gd.index, 1));
    g.computeVertexNormals();
    this.geometries.push(g);
    const ground = new THREE.Mesh(g, make('ground', '#1f2620'));
    ground.name = 'Painted ground';
    this.group.add(ground);
    // Trunks and stones: the painting's stand-ins, where the layout put them.
    const kinds = new Map<string, THREE.BufferGeometry>();
    const statics: THREE.Mesh[] = [];
    proxies.updateMatrixWorld(true);
    proxies.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      this.geometries.push(m.geometry);
      if (m.name.startsWith('static-')) statics.push(m); else kinds.set(m.name, m.geometry);
    });
    const dummy = new THREE.Object3D();
    const byKind = new Map<string, ReturnType<typeof treePlacements>>();
    for (const t of treePlacements(sites)) { if (!byKind.has(t.kind)) byKind.set(t.kind, []); byKind.get(t.kind)!.push(t); }
    const treeMaterial = make('tree', '#181c18');
    for (const [kind, list] of byKind) {
      const geo = kinds.get(kind);
      if (!geo) { console.warn(`[arcane] painted set has no stand-in for ${kind}; its trees will not hide what passes behind them`); continue; }
      const inst = new THREE.InstancedMesh(geo, treeMaterial, list.length);
      list.forEach((t, i) => { dummy.position.set(t.x, t.y, t.z); dummy.rotation.set(0, t.yaw, 0); dummy.scale.setScalar(t.scale); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
      inst.computeBoundingSphere();
      inst.name = `Painted ${kind}`;
      this.group.add(inst);
    }
    const rockGeo = kinds.get('rock_edge_a');
    if (rockGeo) {
      const rocks = rockPlacements(sites);
      const inst = new THREE.InstancedMesh(rockGeo, make('rock', '#2a2b26'), rocks.length);
      rocks.forEach((r, i) => { dummy.position.set(r.x, r.y, r.z); dummy.rotation.set(...r.rotation); dummy.scale.set(...r.scale); dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix); });
      inst.computeBoundingSphere();
      inst.name = 'Painted stones';
      this.group.add(inst);
    }
    // The gate and the lanterns stand where they were painted.
    const staticMaterial = make('rock', '#1c1f1b');
    for (const m of statics) {
      const placed = new THREE.Mesh(m.geometry, staticMaterial);
      placed.applyMatrix4(m.matrixWorld);
      placed.name = `Painted ${m.name.slice(7)}`;
      this.group.add(placed);
    }
    // The sky: a dome the painting's sky lands on, in front of the live sky.
    const domeGeo = new THREE.SphereGeometry(200, 48, 24);
    this.geometries.push(domeGeo);
    const sky = new THREE.Mesh(domeGeo, make('sky', '#5e7b7a'));
    sky.position.fromArray(meta.position);
    sky.renderOrder = -9;
    sky.frustumCulled = false;
    sky.name = 'Painted sky';
    this.group.add(sky);
  }

  setTint(color: THREE.Color): void { this.tint.value.copy(color); }

  update(dt: number): void {
    this.time += dt;
    for (const m of this.materials) m.uniforms.uTime.value = this.time;
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    for (const g of this.geometries) g.dispose();
    for (const t of this.textures) t.dispose();
    this.group.removeFromParent();
  }
}
