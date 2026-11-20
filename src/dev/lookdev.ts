import * as THREE from 'three';
import { DESIGNS } from '../world/characters/index.ts';
import { loadModel, primaryMesh } from '../world/render/models.ts';
import { propMaterial } from '../world/render/StylizedMaterial.ts';
import { Character } from '../world/rig/Character.ts';
import type { CreaturePose } from '../world/rig/Rig.ts';

/**
 * LOOKDEV
 * ───────
 * Development-only: judge an asset the way the art bible's acceptance list asks — neutral studio
 * light with no bloom, fog or grade; front, side, back and three-quarter views; close-ups; a turntable;
 * and a flat black silhouette. Open /lookdev.html?m=<model> and drive it from the console through
 * `window.lookdev`.
 */

const container = document.getElementById('view')!;
const info = document.getElementById('info')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#585b5e');
const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 200);

// Neutral studio: a soft key from front-left, a cool fill, a rim from behind, gentle sky light.
const hemi = new THREE.HemisphereLight('#c9ced4', '#4a4744', 0.9);
const key = new THREE.DirectionalLight('#fff4e6', 2.4);
key.position.set(-3, 4, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
const fill = new THREE.DirectionalLight('#dde8ff', 0.7);
fill.position.set(4, 1.5, 2.5);
const rim = new THREE.DirectionalLight('#ffffff', 1.4);
rim.position.set(1.5, 3, -4);
scene.add(hemi, key, fill, rim, key.target);

const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#5c5e60', roughness: 0.95 }));
floor.receiveShadow = true;
scene.add(floor);

const holder = new THREE.Group();
scene.add(holder);
let subject: THREE.Object3D | null = null;
const bounds = new THREE.Box3();
const size = new THREE.Vector3();
const centre = new THREE.Vector3();
let yaw = 0;
let spin = false;
let silhouetteOn = false;
const savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
const black = new THREE.MeshBasicMaterial({ color: '#000000' });
let camYaw = 0, camDist = 3, camLookY = 0.5, camFov = 30;

function frame(): void {
  bounds.setFromObject(holder);
  bounds.getSize(size);
  bounds.getCenter(centre);
}

function place(): void {
  const a = THREE.MathUtils.degToRad(camYaw);
  camera.fov = camFov;
  camera.position.set(Math.sin(a) * camDist, camLookY + camDist * 0.08, Math.cos(a) * camDist);
  camera.lookAt(0, camLookY, 0);
  camera.updateProjectionMatrix();
  key.target.position.set(0, size.y * 0.4, 0);
  const s = Math.max(size.x, size.y, size.z, 1);
  const cam = key.shadow.camera as THREE.OrthographicCamera;
  cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 0.1; cam.far = 30;
  cam.updateProjectionMatrix();
}

let figure: Character | null = null;
let pose: CreaturePose = 'idle';
let attack = '';
let poseClock = 0;
let walk = 0;
const LOOK = new THREE.Vector3(0, 1.6, 6);

const VIEWS: Record<string, number> = { front: 0, 'three-quarter': 35, side: 90, back: 180, 'back-three-quarter': 145 };

const api = {
  async model(name: string) {
    const data = await loadModel(name);
    if (subject) holder.remove(subject);
    const root = data.gltf.scene.clone(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.material = propMaterial(m.material as THREE.Material, data.fx);
      m.castShadow = true; m.receiveShadow = true;
    });
    subject = root;
    holder.add(root);
    frame();
    api.view('three-quarter');
    info.textContent = `${name} — neutral studio, no post`;
  },
  /** A character from the game's designs, standing in its idle (its authored model when it has one). */
  async character(kind: string) {
    const design = (DESIGNS as Record<string, (typeof DESIGNS)[keyof typeof DESIGNS]>)[kind];
    if (!design) throw new Error(`no design ${kind}`);
    if (design.model) await loadModel(design.model).catch(() => null);
    if (subject) holder.remove(subject);
    figure?.dispose();
    figure = new Character(design, 0.37);
    figure.setYaw(0);
    subject = figure.group;
    holder.add(figure.group);
    figure.update(0.016, { pose: 'idle', progress: 0, velocity: new THREE.Vector3(), faceYaw: 0, look: LOOK, groundY: 0 });
    frame();
    api.view('three-quarter');
    info.textContent = `${design.name}${design.model ? ' (authored model)' : ' (procedural)'} — neutral studio, no post`;
  },
  /** Play a pose on the staged character: idle, walk, windup, strike, recover, stagger. */
  pose(p: CreaturePose | 'walk', attackName = '') {
    walk = p === 'walk' ? 1.2 : 0;
    pose = p === 'walk' ? 'idle' : p;
    attack = attackName;
    poseClock = 0;
  },
  /** A named view framing the whole subject. */
  view(name: string, scale = 1) {
    frame();
    camYaw = VIEWS[name] ?? 0;
    camFov = 30;
    camLookY = centre.y;
    camDist = (Math.max(size.y, size.x * 0.9) / (2 * Math.tan(THREE.MathUtils.degToRad(camFov / 2)))) * 1.35 * scale;
    place();
  },
  /** A close-up at a height fraction of the subject (0 feet, 1 top), at a yaw, filling `span` metres. */
  closeup(heightFraction: number, span: number, yawDeg = 0, fov = 24) {
    frame();
    camYaw = yawDeg; camFov = fov;
    camLookY = bounds.min.y + size.y * heightFraction;
    camDist = span / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    place();
  },
  /** Frame a point (subject space) filling `span` metres, from a yaw. */
  at(x: number, y: number, z: number, span: number, yawDeg = 0, fov = 24) {
    const a = THREE.MathUtils.degToRad(yawDeg);
    const dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    camera.fov = fov;
    camera.position.set(x + Math.sin(a) * dist, y + dist * 0.05, z + Math.cos(a) * dist);
    camera.lookAt(x, y, z);
    camera.updateProjectionMatrix();
  },
  turn(deg: number) { yaw = THREE.MathUtils.degToRad(deg); },
  spin(on = true) { spin = on; },
  silhouette(on = true) {
    silhouetteOn = on;
    holder.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (on) { if (!savedMaterials.has(m)) savedMaterials.set(m, m.material); m.material = black; }
      else if (savedMaterials.has(m)) m.material = savedMaterials.get(m)!;
    });
    scene.background = new THREE.Color(on ? '#ffffff' : '#585b5e');
    floor.visible = !on;
  },
  /** Approximate the game's night: a cold moon behind, a warm fill from the caster, dark sky. */
  lighting(kind: 'studio' | 'night') {
    if (kind === 'night') {
      hemi.color.set('#30444a'); hemi.groundColor.set('#151c18'); hemi.intensity = 1.2;
      key.color.set('#dcc6a2'); key.intensity = 1.1; key.position.set(1.5, 2.5, 5);
      fill.intensity = 0; rim.color.set('#a9cadc'); rim.intensity = 2.2; rim.position.set(-1.5, 2.2, -4);
      scene.background = new THREE.Color('#1a2324');
    } else {
      hemi.color.set('#c9ced4'); hemi.groundColor.set('#4a4744'); hemi.intensity = 0.9;
      key.color.set('#fff4e6'); key.intensity = 2.4; key.position.set(-3, 4, 4);
      fill.intensity = 0.7; rim.color.set('#ffffff'); rim.intensity = 1.4; rim.position.set(1.5, 3, -4);
      scene.background = new THREE.Color(silhouetteOn ? '#ffffff' : '#585b5e');
    }
  },
  stats() {
    let tris = 0;
    holder.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    return { triangles: tris, size: size.toArray().map((v) => +v.toFixed(3)), calls: renderer.info.render.calls };
  },
  get primary() { return subject ? primaryMesh({ name: '', gltf: { scene: subject } as never, fx: null }) : null; },
};
(window as unknown as { lookdev: typeof api }).lookdev = api;

function resize(): void {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  if (spin) yaw += dt * 0.6;
  holder.rotation.y = yaw;
  if (figure) {
    poseClock += dt;
    const cycle = pose === 'windup' || pose === 'strike' ? 1.4 : 3;
    figure.update(dt, {
      pose: walk ? 'walk' as CreaturePose : pose, progress: (poseClock % cycle) / cycle, attack,
      velocity: new THREE.Vector3(0, 0, walk), faceYaw: 0, look: LOOK, groundY: 0,
    });
    figure.group.position.set(0, 0, 0);
  }
  renderer.render(scene, camera);
});

const params = new URLSearchParams(location.search);
const c = params.get('c');
if (c) void api.character(c).then(() => {
  const v = params.get('view');
  if (v) api.view(v);
  if (params.get('light') === 'night') api.lighting('night');
});
const m = params.get('m');
if (m) void api.model(m).then(() => {
  const v = params.get('view');
  if (v) api.view(v);
  if (params.get('sil') === '1') api.silhouette(true);
  if (params.get('light') === 'night') api.lighting('night');
});
