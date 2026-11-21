import * as THREE from 'three';
import { drawn } from '../render/DrawnProp.ts';

export type ProjectileStyle = 'ember' | 'bile' | 'boulder' | 'lantern' | 'moth' | 'pale' | 'cold' | 'star' | 'wisp';

function path(points: readonly (readonly [number, number])[]): THREE.Shape {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y));
  s.closePath(); return s;
}

function inked(shape: THREE.Shape, color: THREE.ColorRepresentation, name: string): THREE.Group {
  const g = new THREE.Group(); g.name = name;
  const geometry = new THREE.ShapeGeometry(shape, 18);
  const ink = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color:'#172327', side:THREE.DoubleSide}));
  ink.scale.set(1.09, 1.06, 1); ink.position.z = -0.006;
  const paint = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({color, side:THREE.DoubleSide}));
  paint.position.z = 0.006;
  g.add(ink, paint); return g;
}

/** Authored attack silhouettes. Their shape and motion identify the creature before their hue does.
 * Every mesh belongs to this projectile; the encounter frees geometry and material at impact. */
export function createCreatureProjectile(style: ProjectileStyle, color: THREE.Color): THREE.Group {
  const group = new THREE.Group(); group.name = `${style} projectile`;
  const pale = color.clone().lerp(new THREE.Color('#eee7cc'), 0.5);
  if (style === 'boulder') {
    const geo = new THREE.IcosahedronGeometry(0.43, 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + 0.12 * Math.sin(x * 8 + z * 5); p.setXYZ(i, x * k, y * 0.8 * k, z * 1.15); }
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:'#766b50', roughness:1, flatShading:true})));
    return drawn(group);
  }
  if (style === 'moth') {
    const wing = new THREE.Shape();
    wing.moveTo(0, 0.02); wing.bezierCurveTo(0.1, 0.23, 0.34, 0.28, 0.35, 0.16);
    wing.bezierCurveTo(0.30, 0.1, 0.38, 0.01, 0.25, -0.02);
    wing.bezierCurveTo(0.30, -0.15, 0.13, -0.21, 0.02, -0.06); wing.closePath();
    for (const sign of [-1, 1]) {
      const hinge = inked(wing, '#8d806b', sign > 0 ? 'wingL' : 'wingR');
      hinge.scale.x = sign;
      const eye = inked(path([[0.13,0.09],[0.21,0.14],[0.28,0.1],[0.20,0.05]]), '#d1bb87', 'wing marking');
      eye.position.z = 0.012; hinge.add(eye); group.add(hinge);
    }
    group.add(inked(path([[-0.025,-0.15],[-0.04,0.07],[0,0.14],[0.04,0.07],[0.025,-0.15]]), '#3c352b', 'moth body'));
  } else if (style === 'lantern') {
    const body = new THREE.Shape();
    body.moveTo(0, 0.27); body.bezierCurveTo(0.26, 0.14, 0.24, -0.18, 0, -0.3);
    body.bezierCurveTo(-0.24, -0.18, -0.26, 0.14, 0, 0.27);
    const cage = inked(body, '#514334', 'swinging cage');
    const light = inked(path([[0,0.18],[0.09,0.02],[0.06,-0.17],[0,-0.23],[-0.06,-0.17],[-0.08,0.02]]), pale, 'captive flame');
    light.position.z = 0.025; cage.add(light);
    for (const x of [-0.11,0.11]) {
      const rib = inked(path([[x*0.45,0.23],[x,0.1],[x,-0.12],[x*0.4,-0.24],[x*0.4-0.018,-0.24],[x-0.018,-0.12],[x-0.018,0.1],[x*0.45-0.018,0.23]]), '#2b2621', 'lantern rib');
      rib.position.z = 0.04; cage.add(rib);
    }
    group.add(cage);
    group.add(inked(path([[-0.015,0.27],[0.015,0.27],[0.012,0.5],[-0.008,0.5]]), '#8c7956', 'silk tether'));
  } else if (style === 'cold') {
    // The Stag casts splinters of its own branching crown, not generic blue fireballs.
    const branch = path([[-0.035,-0.38],[-0.06,-0.06],[-0.24,0.11],[-0.3,0.32],[-0.19,0.16],[-0.08,0.11],[-0.14,0.4],[-0.02,0.24],[0.04,0.03],[0.16,0.14],[0.22,0.34],[0.22,0.06],[0.05,-0.1],[0.025,-0.38]]);
    group.add(inked(branch, color, 'cold antler'));
    const core = inked(path([[-0.012,-0.26],[0.006,0.17],[0.026,0.22],[0.025,-0.22]]), pale, 'cold marrow');
    core.position.z = 0.02; group.add(core);
  } else if (style === 'pale') {
    const blade = new THREE.Shape();
    blade.moveTo(-0.32,0.08); blade.bezierCurveTo(-0.25,0.36,0.25,0.36,0.32,0.08);
    blade.bezierCurveTo(0.20,0.18,-0.20,0.18,-0.32,0.08);
    for (let i = 0; i < 3; i++) { const ring = inked(blade, i === 0 ? pale : color, `bell echo ${i}`); ring.position.y = -i * 0.13; ring.scale.setScalar(1 - i * 0.18); group.add(ring); }
    group.add(inked(path([[-0.015,0.2],[0.015,0.2],[0.02,-0.25],[0,-0.32],[-0.02,-0.25]]), '#b1aca0', 'bell tongue'));
  } else if (style === 'star') {
    const points: [number,number][] = [];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = i % 2 ? 0.12 : i % 4 ? 0.36 : 0.5; points.push([Math.cos(a)*r,Math.sin(a)*r]); }
    group.add(inked(path(points), color, 'broken star'));
    const hollow = inked(path([[-0.08,0.06],[0.02,0.16],[0.11,-0.04],[-0.02,-0.12]]), '#201b29', 'stolen centre');
    hollow.position.z = 0.025; group.add(hollow);
  } else {
    const flame = new THREE.Shape();
    if (style === 'bile') {
      flame.moveTo(0,-0.27); flame.bezierCurveTo(-0.27,-0.11,-0.22,0.19,-0.06,0.25);
      flame.bezierCurveTo(0.02,0.36,0.08,0.49,0.05,0.65);
      flame.bezierCurveTo(0.31,0.22,0.30,-0.16,0,-0.27);
    } else {
      flame.moveTo(0,-0.25); flame.bezierCurveTo(-0.26,-0.13,-0.13,0.12,-0.04,0.18);
      flame.bezierCurveTo(-0.08,0.03,0.02,0.0,0.05,0.12);
      flame.bezierCurveTo(0.21,0.38,0.03,0.54,0.16,0.63);
      flame.bezierCurveTo(0.18,0.25,0.33,-0.12,0,-0.25);
    }
    group.add(inked(flame, color, style === 'bile' ? 'sap tear' : 'hooked flame'));
    const core = inked(path([[-0.06,-0.13],[0,0.13],[0.1,-0.05],[0.025,-0.18]]), pale, 'painted core');
    core.position.z = 0.02; group.add(core);
    if (style === 'wisp') group.scale.setScalar(0.7);
  }
  return group;
}

/** Local articulation follows the already-resolved trajectory; it never changes hit timing. */
export function animateCreatureProjectile(group: THREE.Object3D, style: ProjectileStyle, age: number): void {
  const frame = Math.floor(age * 12) / 12;
  if (style === 'moth') {
    const beat = Math.sin(frame * 33) * 0.9;
    const l = group.getObjectByName('wingL'), r = group.getObjectByName('wingR');
    if (l) l.rotation.y = beat;
    if (r) r.rotation.y = -Math.sin(frame * 33 - 0.2) * 0.9;
    group.rotateZ(Math.sin(frame * 6) * 0.18);
  } else if (style === 'lantern') {
    const cage = group.getObjectByName('swinging cage');
    if (cage) cage.rotation.z = Math.sin(frame * 9) * 0.22 * Math.exp(-age * 0.18);
  } else if (style === 'cold') group.rotateZ(Math.sin(frame * 5) * 0.28);
  else if (style === 'pale') {
    for (let i=0;i<3;i++) { const echo = group.getObjectByName(`bell echo ${i}`); if (echo) echo.position.x = Math.sin(frame * 26 - i * 1.2) * 0.025; }
  } else if (style === 'boulder') { group.rotateX(age * 2.4); group.rotateY(age * 1.7); }
  else if (style === 'star') group.rotateZ(frame * 1.8);
  else if (style === 'bile') { group.scale.set(1 + Math.sin(frame * 8) * 0.06, 1 - Math.sin(frame * 8) * 0.08, 1); group.rotateZ(Math.sin(frame * 3) * 0.12); }
  else group.rotateZ(Math.sin(frame * 11) * 0.12);
}
