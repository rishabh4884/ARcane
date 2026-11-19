import * as THREE from 'three';
import { bindSpellLights, SPELL_LIGHT_GLSL } from './LanternLighting.ts';

/** The air between the caster and a figure: what distance and the ground mist fade it toward. */
const AIR = new THREE.Color('#2c3838');

/** Live values a painted figure feeds its material each frame. */
export interface PaintUniforms {
  /** 0 solid … 1 burnt away (top down, with a glowing edge). */
  dissolve: { value: number };
  edge: { value: THREE.Color };
  /** Cloth flow: time, amplitude at the hem (m), sideways lag, depth lag. */
  flow: { value: THREE.Vector4 };
  /** World height of the ground under the figure; the mist rises from here. */
  ground: { value: number };
  /** How high the ground mist reaches up the figure (m). */
  mist: { value: number };
}

export function paintUniforms(edge = new THREE.Color('#ffb066')): PaintUniforms {
  return { dissolve: { value: 0 }, edge: { value: edge }, flow: { value: new THREE.Vector4() }, ground: { value: 0 }, mist: { value: 0.75 } };
}

/**
 * The shared material for painted, skinned figures (spirits and gnomes). Soft blended edges; an
 * optional cloth ripple in the vertex shader (flowMode 1 = cloth growing toward the hem, 2 = loose
 * hanging strands); then in the fragment the dissolve, spell light, distance haze, and the ground
 * mist that swallows the feet so nothing stands on the floor like a cut-out.
 */
export function paintedMaterial(map: THREE.Texture, u: PaintUniforms, flowMode = 0): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ map, alphaTest: 0.03, transparent: true, depthWrite: true, side: THREE.DoubleSide, fog: true });
  material.toneMapped = false;
  const mode = { value: flowMode }, air = { value: AIR };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlow = u.flow; shader.uniforms.uFlowMode = mode; shader.uniforms.uGround = u.ground; shader.uniforms.uMist = u.mist; shader.uniforms.uAir = air;
    shader.uniforms.uDissolve = u.dissolve; shader.uniforms.uEdge = u.edge; bindSpellLights(shader.uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uFlow; uniform float uFlowMode; varying vec2 vPartUv; varying vec3 vPartWorld;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPartUv = uv;
        if (uFlowMode > 0.0) {
          // Cloth: slow, overlapping waves that grow toward the hem; strands hang looser still.
          float hang = 1.0 - uv.y;
          float w = uFlowMode > 1.5 ? pow(hang, 1.1) * 1.8 : pow(hang, 1.5) * uFlowMode;
          float t = uFlow.x;
          vec3 q = position;
          float wave = sin(t * 0.9 + q.y * 1.7 + q.x * 0.8) * 0.55 + sin(t * 0.53 - q.y * 2.9 + q.x * 2.1 + 1.7) * 0.3 + sin(t * 1.6 + q.x * 5.0 - q.y * 4.0) * 0.15;
          transformed.x += (wave * uFlow.y + uFlow.z) * w;
          transformed.z += (sin(t * 0.7 + q.x * 3.1 + q.y * 1.3) * uFlow.y * 0.6 + uFlow.w) * w;
          transformed.y += abs(wave) * uFlow.y * 0.1 * w;
        }`)
      .replace('#include <project_vertex>', '#include <project_vertex>\n        vPartWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uDissolve; uniform vec3 uEdge; uniform float uGround; uniform float uMist; uniform vec3 uAir; varying vec2 vPartUv; varying vec3 vPartWorld;
        ${SPELL_LIGHT_GLSL}
        float paintHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
        float paintNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(paintHash(i), paintHash(i + vec2(1.0, 0.0)), f.x), mix(paintHash(i + vec2(0.0, 1.0)), paintHash(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        if (uDissolve > 0.0) {
          // Dissolve from the top down, broken up by noise, with a glowing burning edge.
          float grain = paintNoise(vPartUv * 9.0) * 0.65 + paintNoise(vPartUv * 23.0) * 0.35;
          float front = grain * 0.55 + vPartUv.y * 0.45;
          float cut = uDissolve * 1.08 - 0.04;
          if (front < cut) discard;
          diffuseColor.rgb = mix(diffuseColor.rgb, uEdge * 1.8, 1.0 - smoothstep(0.0, 0.06, front - cut));
        }
        diffuseColor.rgb *= 1.0 + spellIllumination(vPartWorld);
        // Air: distance softens the figure toward the fog, and the ground mist swallows its feet.
        float paintAir = 1.0 - exp(-length(vPartWorld - cameraPosition) * 0.05);
        float paintLow = 1.0 - smoothstep(uGround - 0.1, uGround + uMist, vPartWorld.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, uAir, clamp(paintAir * 0.55 + paintLow * 0.5, 0.0, 0.85));
        diffuseColor.a *= 1.0 - paintLow * 0.65;`);
  };
  material.customProgramCacheKey = () => 'painted-figure-v1';
  return material;
}
