import * as THREE from 'three';
import { ImpactBurst, SpellGlint } from './effect-composition.ts';
import type { SpellEffect } from '../config/spells.ts';

export interface SpellAnimation {
  group: THREE.Group;
  /** Called once when this spell reaches its impact beat. */
  setImpactCallback(callback: () => void): void;
  /** Return false after the final frame. */
  update(dt: number): boolean;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const easeOut = (n: number) => 1 - Math.pow(1 - clamp01(n), 3);

/** Build a short, spell-specific Three.js effect. All geometry is owned and disposed here. */
export function createSpellAnimation(
  kind: SpellEffect,
  origin: THREE.Vector3,
  target: THREE.Vector3,
  color: THREE.Color,
  detail?: string,
  context?: { groundY: number; cameraQuaternion: THREE.Quaternion },
): SpellAnimation {
  switch (kind) {
    case 'arrow': return accent(arrow(origin,target,color,detail),target,color,56,.88,4.2,5.5);
    case 'lightning': return accent(lightning(target,color),target,color,88,.92,7.0,8.0);
    case 'frost': return accent(frost(target,color),target,color,66,1.05,3.2,5.5);
    case 'wind': return accent(gale(origin,target,color,detail),target,color,58,.95,4.2,6.5);
    case 'healing': {
      const effect=mend(origin,color,detail);
      if(context)effect.group.quaternion.copy(context.cameraQuaternion);
      return accent(effect,origin,color,46,1.2,3.2,5);
    }
    case 'summon': return accent(rise(target,color,context?.groundY),target,color,64,1.15,4.0,7);
    case 'shield': {
      const effect=aegis(origin,color);
      if(context)effect.group.quaternion.copy(context.cameraQuaternion);
      return accent(effect,origin,color,46,1.1,3.0,6);
    }
}
}
function accent(effect:SpellAnimation,point:THREE.Vector3,color:THREE.Color,count:number,duration:number,intensity:number,radius:number):SpellAnimation {
  const burst=new ImpactBurst(point,color,count,duration),glint=new SpellGlint(color,intensity,radius);
  effect.group.updateMatrixWorld(true);
  const local=effect.group.worldToLocal(point.clone());burst.group.position.copy(local);burst.group.renderOrder=3;glint.position.copy(local);
  effect.group.add(burst.group,glint);
  const update=effect.update.bind(effect),dispose=effect.dispose.bind(effect);
  let age=0;
  effect.update=(dt)=>{age+=Math.max(0,dt);const active=update(dt);burst.update(dt);glint.pulse(Math.min(1,age/duration),Math.max(0,1-age/duration));return active||age<duration;};
  effect.dispose=()=>{burst.dispose();glint.dispose();dispose();};
  return effect;
}


function animate(
  group: THREE.Group,
  duration: number,
  tick: (t: number, age: number) => void,
  impactAt = duration * 0.5,
): SpellAnimation {
  let age = 0;
  let impactCallback: (() => void) | undefined;
  let impacted = false;
  return {
    group,
    setImpactCallback(callback) { impactCallback = callback; },
    update(dt) {
      age += dt;
      const t = clamp01(age / duration);
      tick(t, age);
      if (!impacted && age >= impactAt) {
        impacted = true;
        impactCallback?.();
      }
      return age < duration;
    },
    dispose() {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Line)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
    },
  };
}

function glow(color: THREE.Color, opacity = 0.9): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function lineMaterial(color: THREE.Color, opacity = 0.9): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
}

function addLine(group: THREE.Group, points: THREE.Vector3[], material: THREE.LineBasicMaterial): THREE.Line {
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  group.add(line);
  return line;
}

function arrow(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, detail?: string): SpellAnimation {
  const group = new THREE.Group();
  const direction = target.clone().sub(origin);
  if (direction.lengthSq() < 0.01) direction.set(0, 0, -1);
  direction.normalize();
  const power = clamp01((Number(detail?.match(/(\d+)%/)?.[1]) || 65) / 100);
  const arrowGroup = new THREE.Group();
  arrowGroup.quaternion.setFromUnitVectors(UP, direction.clone().addScaledVector(new THREE.Vector3(-direction.z, 0, direction.x).normalize(), 0.62).normalize());
  arrowGroup.scale.setScalar(1.1 + power * 0.42);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.045, 1.08, 6), glow(color));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 5), glow(color.clone().lerp(new THREE.Color('#ffffff'), 0.58)));
  tip.position.y = 0.68;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.24, 4), glow(color, 0.72));
  tail.position.y = -0.54;
  tail.rotation.z = Math.PI;
  arrowGroup.add(shaft, tip, tail);
  group.add(arrowGroup);
  const from = origin.clone();
  const to = target.clone();
  const side = new THREE.Vector3(-direction.z, 0, direction.x);
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  side.normalize();
  const pathPoint = (u: number, out: THREE.Vector3) => out.copy(from).lerp(to, u).addScaledVector(side, Math.sin(Math.PI * u) * 1.08);
  const arcMiddle = pathPoint(0.5, new THREE.Vector3());
  const trail = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([from, arcMiddle, to]), 40, 0.026, 5, false),
    glow(color, 0.5),
  );
  const trailIndexCount = trail.geometry.getIndex()?.count ?? 0;
  group.add(trail);
  const tangentBefore = new THREE.Vector3();
  const tangentAfter = new THREE.Vector3();
  const duration = 0.8 + (1 - power) * 0.35;
  return animate(group, duration, (t) => {
    const flight = easeOut(Math.min(1, t / 0.88));
    pathPoint(flight, arrowGroup.position);
    pathPoint(Math.min(1, flight + 0.012), tangentAfter);
    pathPoint(Math.max(0, flight - 0.012), tangentBefore);
    const tangent = tangentAfter.sub(tangentBefore).normalize();
    tangent.addScaledVector(side, 1.08).normalize();
    arrowGroup.quaternion.setFromUnitVectors(UP, tangent);
    trail.geometry.setDrawRange(0, Math.floor(trailIndexCount * flight));
    const fade = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1;
    (shaft.material as THREE.MeshBasicMaterial).opacity = fade;
    (tip.material as THREE.MeshBasicMaterial).opacity = fade;
    (tail.material as THREE.MeshBasicMaterial).opacity = fade * 0.72;
    (trail.material as THREE.MeshBasicMaterial).opacity = fade * 0.58;
  }, duration * 0.79);
}

function lightning(target: THREE.Vector3, color: THREE.Color): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(target);
  const core = color.clone().lerp(new THREE.Color('#ffffff'), 0.75);
  const points = [
    [0, 5.1, 0], [0.28, 4.55, 0], [-0.14, 4.08, 0], [0.38, 3.5, 0],
    [0.08, 2.94, 0], [0.3, 2.38, 0], [-0.22, 1.74, 0], [0.14, 1.14, 0], [-0.06, 0.56, 0], [0, 0, 0],
  ].map(([x, y, z]) => new THREE.Vector3(x!, y!, z!));
  const main = addLine(group, points, lineMaterial(core, 1));
  const mainSegments = addBoltSegments(group, points, 0.052, core);
  const branchPoints = [
    [[0.12, 4.2, 0], [0.9, 3.9, 0], [1.25, 3.25, 0]],
    [[0.23, 3.12, 0], [-0.68, 2.74, 0], [-1.1, 2.1, 0]],
    [[-0.16, 1.9, 0], [0.8, 1.52, 0], [1.08, 0.98, 0]],
  ].map((branch) => branch.map(([x, y, z]) => new THREE.Vector3(x!, y!, z!)));
  const branches = branchPoints.map((points) => addLine(group, points, lineMaterial(color, 0.8)));
  const branchSegments = branchPoints.map((points) => addBoltSegments(group, points, 0.032, color));
  const impact = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.024, 5, 40), glow(core, 0.8));
  impact.rotation.x = Math.PI / 2;
  impact.position.y = -0.48;
  impact.scale.setScalar(0.15);
  group.add(impact);
  const duration = 0.72;
  return animate(group, duration, (t, age) => {
    const strike = clamp01(age / 0.15);
    main.geometry.setDrawRange(0, Math.max(2, Math.ceil(points.length * strike)));
    mainSegments.forEach((segment, index) => { segment.visible = age > index * 0.014; });
    branches.forEach((branch, index) => {
      const branchOn = age > 0.055 * (index + 1);
      branch.geometry.setDrawRange(0, branchOn ? 3 : 0);
      branchSegments[index].forEach((segment, segmentIndex) => {
        segment.visible = age > 0.055 * (index + 1) + segmentIndex * 0.02;
      });
    });
    const fade = age < 0.18 ? 1 : clamp01(1 - (age - 0.18) / 0.54);
    (main.material as THREE.LineBasicMaterial).opacity = fade;
    mainSegments.forEach((segment) => ((segment.material as THREE.MeshBasicMaterial).opacity = fade));
    branches.forEach((branch) => ((branch.material as THREE.LineBasicMaterial).opacity = fade * 0.82));
    branchSegments.forEach((segments) => segments.forEach((segment) => ((segment.material as THREE.MeshBasicMaterial).opacity = fade * 0.72)));
    impact.scale.setScalar(0.2 + easeOut(t) * 2.3);
    (impact.material as THREE.MeshBasicMaterial).opacity = fade * 0.75;
  }, 0.045);
}

function addBoltSegments(group: THREE.Group, points: THREE.Vector3[], radius: number, color: THREE.Color): THREE.Mesh[] {
  return points.slice(1).map((end, index) => {
    const start = points[index];
    const direction = end.clone().sub(start);
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius, direction.length(), 5), glow(color));
    segment.position.copy(start).add(end).multiplyScalar(0.5);
    segment.quaternion.setFromUnitVectors(UP, direction.normalize());
    group.add(segment);
    return segment;
  });
}

function frost(target: THREE.Vector3, color: THREE.Color): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(target);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.022, 6, 56), glow(color, 0.7));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.48;
  group.add(ring);
  const shards: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const shard = new THREE.Mesh(
      new THREE.ConeGeometry(i % 2 ? 0.12 : 0.16, i % 2 ? 0.65 : 0.95, 5),
      glow(color.clone().lerp(new THREE.Color('#ffffff'), i % 3 === 0 ? 0.6 : 0.2), 0.85),
    );
    shard.position.set(Math.cos(angle) * 0.78, -0.9, Math.sin(angle) * 0.78);
    shard.rotation.z = (Math.random() - 0.5) * 0.2;
    shards.push(shard);
    group.add(shard);
  }
  return animate(group, 1.08, (t) => {
    const ringScale = 0.3 + easeOut(t) * 1.55;
    ring.scale.setScalar(ringScale);
    (ring.material as THREE.MeshBasicMaterial).opacity = clamp01(1 - t * 1.2);
    shards.forEach((shard, index) => {
      const local = clamp01((t - index * 0.045) / 0.48);
      shard.position.y = -0.9 + easeOut(local) * 0.82;
      shard.scale.setScalar(0.18 + easeOut(local) * 0.92);
      (shard.material as THREE.MeshBasicMaterial).opacity = clamp01(1 - Math.max(0, t - 0.68) * 2.6);
    });
    group.rotation.y = Math.sin(t * Math.PI * 2) * 0.025;
  }, 0.12);
}

function gale(origin: THREE.Vector3, target: THREE.Vector3, color: THREE.Color, detail?: string): SpellAnimation {
  const group = new THREE.Group();
  const sign = detail === 'left' ? -1 : 1;
  const ribbons: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const y = (i - 1) * 0.38;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.9, y - 0.1, 0),
      new THREE.Vector3(-0.85, y + 0.28, -0.15 - i * 0.1),
      new THREE.Vector3(0.35, y - 0.25, -0.3 - i * 0.1),
      new THREE.Vector3(1.8, y + 0.05, -0.48),
    ]);
    const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.025 + i * 0.006, 5, false), glow(color, 0.72 - i * 0.12));
    ribbons.push(ribbon);
    group.add(ribbon);
  }
  const direction = target.clone().sub(origin).normalize();
  const right = new THREE.Vector3().crossVectors(direction, UP).normalize();
  const from = origin.clone().addScaledVector(right, -sign * 1.9);
  const to = target.clone();
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  return animate(group, 1.05, (t) => {
    group.position.copy(from).lerp(to, easeOut(t));
    group.scale.set(0.8 + t * 0.3, 0.78 + Math.sin(t * Math.PI) * 0.3, 1);
    const opacity = clamp01(1 - Math.max(0, t - 0.62) / 0.38);
    ribbons.forEach((ribbon, index) => ((ribbon.material as THREE.MeshBasicMaterial).opacity = opacity * (0.78 - index * 0.12)));
  }, 0.7);
}

function mend(origin: THREE.Vector3, color: THREE.Color, detail?: string): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(origin);
  const direction = detail === 'ccw' ? -1 : 1;
  const pieces: THREE.Line[] = [];
  for (let i = 0; i < 4; i++) {
    const points: THREE.Vector3[] = [];
    const start = 0.12;
    const end = Math.PI / 2 - 0.12;
    for (let s = 0; s <= 12; s++) {
      const angle = start + (end - start) * (s / 12);
      points.push(new THREE.Vector3(Math.cos(angle) * 0.62, Math.sin(angle) * 0.62, 0));
    }
    const segment = addLine(group, points, lineMaterial(color, 0.85));
    segment.rotation.z = i * Math.PI / 2 + direction * 0.22;
    pieces.push(segment);
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), glow(color, 0.58));
  group.add(core);
  return animate(group, 1.32, (t) => {
    pieces.forEach((piece, index) => {
      const targetAngle = index * Math.PI / 2;
      const initialAngle = targetAngle + direction * 0.22;
      piece.rotation.z = initialAngle + (targetAngle - initialAngle) * easeOut(t);
      (piece.material as THREE.LineBasicMaterial).opacity = clamp01((t + index * 0.08) * 1.8) * (1 - t * 0.45);
    });
    core.scale.setScalar(0.72 + Math.sin(t * Math.PI) * 0.95);
    (core.material as THREE.MeshBasicMaterial).opacity = 0.72 - t * 0.38;
  });
}

function rise(target: THREE.Vector3, color: THREE.Color, groundY = 0): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(target).setY(groundY + 0.04);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.035, 6, 56), glow(color, 0.82));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.015;
  group.add(ring);
  const cracks = addLine(group, [
    new THREE.Vector3(-0.95, 0.035, 0), new THREE.Vector3(-0.38, 0.04, -0.26),
    new THREE.Vector3(0, 0.035, 0.08), new THREE.Vector3(0.4, 0.04, -0.24),
    new THREE.Vector3(0.96, 0.035, 0),
  ], lineMaterial(color, 0.84));
  const motes = Array.from({ length: 7 }, (_, index) => {
    const mote = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045 + (index % 3) * 0.012, 0), glow(color, 0.9));
    const angle = index / 7 * Math.PI * 2;
    mote.position.set(Math.cos(angle) * (0.72 + index % 2 * 0.14), 0.08, Math.sin(angle) * (0.72 + index % 2 * 0.14));
    group.add(mote);
    return mote;
  });
  return animate(group, 1.45, (t) => {
    const spread = easeOut(Math.min(1, t * 1.65));
    ring.scale.setScalar(0.12 + spread * 1.4);
    (ring.material as THREE.MeshBasicMaterial).opacity = clamp01(1 - t * 0.82);
    (cracks.material as THREE.LineBasicMaterial).opacity = clamp01(1 - Math.max(0, t - 0.38) * 1.45);
    motes.forEach((mote, index) => {
      const angle = index / motes.length * Math.PI * 2 + t * 2.6;
      mote.position.set(Math.cos(angle) * (0.42 + spread * 0.9), 0.08 + Math.sin(t * 8 + index) * 0.34 + t * 0.75, Math.sin(angle) * (0.42 + spread * 0.9));
      mote.scale.setScalar(1 - t * 0.65);
      (mote.material as THREE.MeshBasicMaterial).opacity = clamp01(1 - t * 1.15);
    });
  });
}

function aegis(origin: THREE.Vector3, color: THREE.Color): SpellAnimation {
  const group = new THREE.Group();
  group.position.copy(origin);
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.05);
  shape.quadraticCurveTo(0.72, 0.8, 0.72, 0.22);
  shape.quadraticCurveTo(0.72, -0.62, 0, -1.02);
  shape.quadraticCurveTo(-0.72, -0.62, -0.72, 0.22);
  shape.quadraticCurveTo(-0.72, 0.8, 0, 1.05);
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), glow(color, 0.16));
  group.add(fill);
  const outlinePoints = shape.getPoints(44);
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outlinePoints), lineMaterial(color, 0.95));
  group.add(outline);
  const seam = addLine(group, [
    new THREE.Vector3(0, 0.8, 0.01), new THREE.Vector3(0, -0.8, 0.01),
    new THREE.Vector3(-0.44, 0.27, 0.01), new THREE.Vector3(0, 0.02, 0.01), new THREE.Vector3(0.44, 0.27, 0.01),
  ], lineMaterial(color.clone().lerp(new THREE.Color('#ffffff'), 0.35), 0.78));
  return animate(group, 1.7, (t) => {
    const open = easeOut(Math.min(1, t / 0.28));
    group.scale.set(0.58 + open * 0.54, 0.58 + open * 0.54, 1);
    group.rotation.z = Math.sin(t * 2.5) * 0.025;
    const pulse = 0.72 + Math.sin(t * 7) * 0.13;
    const fade = t > 0.72 ? clamp01((1 - t) / 0.28) : 1;
    (fill.material as THREE.MeshBasicMaterial).opacity = pulse * 0.18 * fade;
    (outline.material as THREE.LineBasicMaterial).opacity = pulse * fade;
    (seam.material as THREE.LineBasicMaterial).opacity = pulse * 0.78 * fade;
  });
}
